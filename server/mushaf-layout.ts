/*
 * طبقة تخطيط الكلمة على صفحة المصحف.
 *
 * تُسلَّم مع أصول المصحف ملفاتُ تخطيط لكل صفحة من الصفحات الـ604 تحمل موضع كل كلمة. وهي طبقة
 * **إثراء بصري** للعرض والتتبّع المرجعي، منفصلة تمامًا عن مستودع المتجهات العلمي
 * (`quran-vector-repository`) الذي يبقى وحده مرجعَ الربط المُصدَّق للقرار العلمي.
 *
 * الملفات مصادرها مفتوحة وأشكالها ليست موحّدة، فالمُطبِّع هنا **متكيّف لكنه صارم**: يتعرّف على
 * الشكل من مفاتيحه، ويرفض ما لا يتيقّن منه بإرجاع null بدل أن يخمّن إحداثيات كلمة على المصحف.
 * ومتى رجع null بقيت عدسة السطر تعمل، فلا يخسر الحَكَم شيئًا.
 */

export interface NormalizedBox { x: number; y: number; width: number; height: number }
export interface LayoutWord {
  surah: number; ayah: number;
  /** ترتيب الكلمة داخل الآية، صفريّ الأساس. */
  wordIndex: number;
  line?: number;
  bbox: NormalizedBox;
}
export type LayoutScale = 'DECLARED' | 'NORMALIZED' | 'INFERRED';
export interface MushafPageLayout { page: number; scale: LayoutScale; words: LayoutWord[] }

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};
/** أول مفتاح موجود من قائمة مرادفات — الملفات تختلف في التسمية لا في المعنى. */
const pick = (o: any, keys: string[]): number | undefined => {
  for (const k of keys) { const v = num(o?.[k]); if (v !== undefined) return v }
  return undefined;
};

const SURAH_KEYS = ['surah', 'sura', 'sora', 'surah_number', 'sura_number', 'chapter'];
const AYAH_KEYS = ['ayah', 'aya', 'aya_no', 'ayah_number', 'verse', 'verse_number'];
const WORD_KEYS = ['word', 'word_number', 'wordIndex', 'word_index', 'position', 'word_position'];
const LINE_KEYS = ['line', 'line_number', 'lineNumber', 'line_no'];

/** صندوق الكلمة بأي من الأشكال الثلاثة الشائعة: (x,y,w,h) أو (x1,y1,x2,y2) أو (left,top,right,bottom). */
function readBox(o: any): NormalizedBox | null {
  const x = pick(o, ['x', 'left', 'x1', 'min_x']);
  const y = pick(o, ['y', 'top', 'y1', 'min_y']);
  if (x === undefined || y === undefined) return null;
  let w = pick(o, ['width', 'w']);
  let h = pick(o, ['height', 'h']);
  if (w === undefined) { const x2 = pick(o, ['x2', 'right', 'max_x']); if (x2 !== undefined) w = x2 - x }
  if (h === undefined) { const y2 = pick(o, ['y2', 'bottom', 'max_y']); if (y2 !== undefined) h = y2 - y }
  if (w === undefined || h === undefined) return null;
  if (w <= 0 || h <= 0) return null;
  return { x, y, width: w, height: h };
}

/**
 * يجمع كل كائنات الكلمات مهما كان تعشيش الملف (جذر مصفوفة، أو صفحة تحوي أسطرًا تحوي كلمات).
 * رقم السطر يُورَّث من العقدة الأعلى: كثير من ملفات التخطيط تضعه على السطر لا على كل كلمة.
 */
interface WordNode { node: any; line?: number }
function collectWordNodes(raw: any, inheritedLine?: number, depth = 0): WordNode[] {
  if (!raw || depth > 6) return [];
  const line = (typeof raw === 'object' && !Array.isArray(raw) ? pick(raw, LINE_KEYS) : undefined) ?? inheritedLine;
  if (Array.isArray(raw)) return raw.flatMap((x) => collectWordNodes(x, inheritedLine, depth + 1));
  if (typeof raw !== 'object') return [];
  if (readBox(raw) && pick(raw, WORD_KEYS) !== undefined) return [{ node: raw, line }];
  return Object.values(raw).flatMap((v) => collectWordNodes(v, line, depth + 1));
}

/**
 * يحوّل ملف تخطيط صفحة إلى كلمات بإحداثيات نسبية 0..1.
 * يرجع null إذا لم يتيقّن من الشكل أو من مقياس الإحداثيات.
 */
export function normalizeMushafLayout(raw: any, page: number): MushafPageLayout | null {
  if (!Number.isInteger(page) || page < 1 || page > 604) return null;
  const nodes = collectWordNodes(raw);
  if (!nodes.length) return null;

  // مقياس الإحداثيات: مُعلَن في الملف، أو نسبيّ أصلًا، أو مستنتج من حدود الكلمات.
  const declaredW = pick(raw, ['width', 'page_width', 'pageWidth', 'image_width']);
  const declaredH = pick(raw, ['height', 'page_height', 'pageHeight', 'image_height']);
  const boxes = nodes.map((n) => readBox(n.node)).filter((b): b is NormalizedBox => !!b);
  if (!boxes.length) return null;
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));

  let scale: LayoutScale, sx: number, sy: number;
  if (declaredW && declaredH && declaredW > 0 && declaredH > 0) { scale = 'DECLARED'; sx = declaredW; sy = declaredH }
  else if (maxX <= 1.0001 && maxY <= 1.0001) { scale = 'NORMALIZED'; sx = 1; sy = 1 }
  else if (maxX > 1 && maxY > 1) { scale = 'INFERRED'; sx = maxX; sy = maxY }
  else return null;

  const words: LayoutWord[] = [];
  for (const entry of nodes) {
    const n = entry.node;
    const box = readBox(n); if (!box) continue;
    const surah = pick(n, SURAH_KEYS), ayah = pick(n, AYAH_KEYS), wordNo = pick(n, WORD_KEYS);
    if (surah === undefined || ayah === undefined || wordNo === undefined) continue;
    if (!Number.isInteger(surah) || surah < 1 || surah > 114 || ayah < 1) continue;
    const x = box.x / sx, y = box.y / sy, width = box.width / sx, height = box.height / sy;
    // إحداثيات خارج الصفحة تعني أن قراءة المقياس خاطئة — لا نضع عدسة على موضع لا نثق به.
    if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.02 || y + height > 1.02) continue;
    words.push({
      surah, ayah,
      // ترقيم الكلمة في هذه الملفات يبدأ عادةً من 1؛ نُرجعه صفريّ الأساس ليطابق تقطيع النص.
      wordIndex: Math.max(0, Math.round(wordNo) - 1),
      line: pick(n, LINE_KEYS) ?? entry.line,
      bbox: { x, y, width, height },
    });
  }
  if (!words.length) return null;
  return { page, scale, words };
}

/** صندوق كلمة بعينها، أو null — الواجهة تعود حينها إلى عدسة السطر. */
export function findLayoutWord(layout: MushafPageLayout | null, surah: number, ayah: number, wordIndex: number) {
  if (!layout) return null;
  return layout.words.find((w) => w.surah === surah && w.ayah === ayah && w.wordIndex === wordIndex) || null;
}
