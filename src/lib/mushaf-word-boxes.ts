/*
 * مواضعُ الكلمات على صفحة المصحف المطبوعة — تُقاس من حبرها، لا تُخمَّن.
 *
 * صورةُ الصفحة الرسمية تُعرض كما طُبعت، والكلماتُ تحتها نصٌّ مخفيٌّ للقارئ الآليّ وحده.
 * فكان الطالبُ يتلو والصفحةُ صامتة: لا يرى أين بلغ، ولا أين أخطأ، إلا شريطًا رفيعًا
 * على الحافة. والتتبّعُ الذي لا يُرى على الكلمة نفسِها ليس تتبّعًا.
 *
 * وملفّاتُ التخطيط المفتوحة تعرف **سطر** كلِّ كلمة ولا تعرف موضعها في السطر. لكنّ السطرَ
 * المطبوع يحمل ذلك في حبره: الكلماتُ كُتلٌ داكنة يفصل بينها بياضٌ أعرضُ ممّا بين حروف
 * الكلمة الواحدة. ونحن نعرف مسبقًا **كم** كتلةً في السطر (كلماتُه وفواصلُ آياته). فيُختار
 * من فجوات البياض أعرضُها بذلك العدد — وهو قياسٌ موجَّهٌ بالمعلوم، لا تخمينٌ من الصورة وحدها.
 *
 * ومتى لم يتميّز الفاصلُ بين الكلمات عن الفاصل داخلها تميّزًا بيّنًا قيل «غيرُ واثق»،
 * فيبقى العرضُ على السطر كلّه — ولا تُعلَّم كلمةٌ ليست هي.
 */

export interface InkSegment {
  /** بداية الكتلة ونهايتها بأعمدة البكسل، من اليسار. */
  start: number;
  end: number;
}

export interface LineSegmentation {
  /** الكتل مرتّبةً بترتيب القراءة: من اليمين إلى اليسار. */
  segments: InkSegment[];
  /** هل تميّزت فجواتُ الكلمات عن فجوات الحروف تميّزًا يُطمأنّ إليه؟ */
  confident: boolean;
}

export interface SegmentOptions {
  /** عمودٌ حبرُه دون هذه النسبة من أكثف عمودٍ في السطر يُعدّ بياضًا. */
  inkThresholdRatio?: number;
  /** نسبةُ أضيق فجوةٍ مختارة إلى أعرض فجوةٍ متروكة، ليُعدّ الفصلُ واثقًا. */
  separationRatio?: number;
}

const DEFAULTS = { inkThresholdRatio: 0.035, separationRatio: 1.2 };

/**
 * يقسم سطرًا إلى `tokens` كتلةً بحسب مقدار الحبر في كل عمود.
 *
 * `columns[x]` مقدار الحبر في العمود x داخل شريط السطر. يُعاد `null` إن لم يكن في السطر
 * من الفجوات ما يكفي للعدد المطلوب — فلا تُصنع حدودٌ ليست في الصفحة.
 */
export function segmentLine(columns: readonly number[], tokens: number, options: SegmentOptions = {}, weights?: readonly number[]): LineSegmentation | null {
  if (!Number.isInteger(tokens) || tokens < 1 || columns.length < tokens * 2) return null;
  const peak = columns.reduce((m, v) => (v > m ? v : m), 0);
  if (peak <= 0) return null;
  const threshold = peak * (options.inkThresholdRatio ?? DEFAULTS.inkThresholdRatio);
  const on = (x: number) => columns[x] > threshold;

  let left = 0, right = columns.length - 1;
  while (left < columns.length && !on(left)) left += 1;
  while (right > left && !on(right)) right -= 1;
  if (right <= left) return null;

  /* فجواتُ البياض داخل حدود الحبر. */
  const gaps: { start: number; end: number; width: number }[] = [];
  let gapStart = -1;
  for (let x = left; x <= right; x += 1) {
    if (!on(x)) { if (gapStart < 0) gapStart = x; }
    else if (gapStart >= 0) { gaps.push({ start: gapStart, end: x - 1, width: x - gapStart }); gapStart = -1; }
  }

  if (tokens === 1) return { segments: [{ start: left, end: right }], confident: true };
  if (gaps.length < tokens - 1) return null;

  const byWidth = [...gaps].sort((a, b) => b.width - a.width);
  const chosen = byWidth.slice(0, tokens - 1);
  const narrowestChosen = chosen[chosen.length - 1].width;
  const widestLeft = byWidth[tokens - 1]?.width ?? 0;
  /*
   * والثقةُ شرطان: أن تتميّز فجواتُ الكلمات عن أعرض فجوةٍ متروكة، وأن تتقارب فيما بينها —
   * فالمصحفُ يُضبط بفواصلَ متقاربة، وفجوةٌ مختارةٌ أضيقُ كثيرًا من أخواتها إنما هي فرجةُ
   * حرفٍ اضطُرّ إليها العدُّ لأنّ كلمتين التصقتا.
   */
  const medianChosen = [...chosen].sort((a, b) => a.width - b.width)[Math.floor(chosen.length / 2)].width;
  const separated = widestLeft === 0 || narrowestChosen >= widestLeft * (options.separationRatio ?? DEFAULTS.separationRatio);
  const even = narrowestChosen >= Math.max(2, medianChosen * 0.34);
  const confident = separated && even;

  const cuts = [...chosen].sort((a, b) => a.start - b.start);
  const leftToRight: InkSegment[] = [];
  let cursor = left;
  for (const gap of cuts) { leftToRight.push({ start: cursor, end: gap.start - 1 }); cursor = gap.end + 1; }
  leftToRight.push({ start: cursor, end: right });
  const segments = leftToRight.reverse();
  return { segments, confident: confident && proportionate(segments, weights) };
}

/*
 * والشاهدُ الثالث: النصُّ نفسُه. نحن نعرف الكلمات، فنعرف تقريبًا عرضَ كلٍّ منها قياسًا
 * بأخواتها (عددُ حروفها). فكتلةٌ عرضُها أضعافُ نصيبها أو دون نصفه لم تُقسم على حدود
 * الكلمات — التصقت كلمتان فانقسمت ثالثة. وحينئذٍ لا ثقة.
 */
function proportionate(segments: readonly InkSegment[], weights?: readonly number[]): boolean {
  if (!weights || weights.length !== segments.length) return true;
  const widths = segments.map(s => s.end - s.start + 1);
  const totalW = widths.reduce((a, b) => a + b, 0), totalK = weights.reduce((a, b) => a + b, 0);
  if (!totalW || !totalK) return false;
  return widths.every((w, i) => { const r = (w / totalW) / (weights[i] / totalK); return r >= 0.42 && r <= 2.4; });
}

/** وزنُ الكلمة المطبوعة: عددُ حروفها بلا تشكيل (أدناه حرفان)؛ وفاصلةُ الآية كحرفين. */
export function printedWeight(text: string | null): number {
  if (text === null) return 2;
  const letters = text.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\s]/g, '').length;
  return Math.max(2, letters);
}

/** صندوقُ كلمةٍ كنسبٍ من الصفحة (0..1)، يوضع فوق الصورة كما هي أيًّا كان مقاسُ عرضها. */
export interface WordBox { x: number; y: number; width: number; height: number }

export interface LineTokens {
  /** رقمُ السطر من واحد، كما يعدّه التخطيط. */
  line: number;
  /** عددُ الكتل المطبوعة في السطر بترتيب القراءة. */
  tokens: number;
  /** أوزانُ الكتل بترتيب القراءة (انظر `printedWeight`) — شاهدٌ على صحّة القسمة. */
  weights?: number[];
}

export interface MeasuredLine { line: number; boxes: WordBox[]; confident: boolean }

/**
 * يقيس صناديقَ الكتل لكلّ سطرٍ معلومِ العدد، من بكسلات الصفحة.
 *
 * `pixels` بيانات RGBA لصورة الصفحة بمقاس `width × height`؛ و`bands` أشرطةُ الأسطر
 * المقيسة (نسبًا). يُعاد لكل سطرٍ صناديقُه أو لا شيء إن لم يُقسم.
 */
export function measureLineBoxes(
  pixels: Uint8ClampedArray, width: number, height: number,
  bands: readonly { top: number; height: number }[], lines: readonly LineTokens[],
  options: SegmentOptions = {},
): MeasuredLine[] {
  const out: MeasuredLine[] = [];
  for (const { line, tokens, weights } of lines) {
    const band = bands[line - 1];
    if (!band || tokens < 1) continue;
    const core = slotCore(band);
    const y0 = Math.max(0, Math.floor(core.top * height));
    const y1 = Math.min(height - 1, Math.ceil((core.top + core.height) * height));
    const columns = new Array<number>(width).fill(0);
    for (let y = y0; y <= y1; y += 1) {
      const row = y * width * 4;
      for (let x = 0; x < width; x += 1) {
        const i = row + x * 4;
        const alpha = pixels[i + 3] / 255;
        const luma = (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114) / 255;
        columns[x] += alpha * (1 - luma);
      }
    }
    const cut = segmentLine(columns, tokens, options, weights);
    if (!cut) continue;
    out.push({
      line,
      confident: cut.confident,
      boxes: cut.segments.map(s => ({ x: s.start / width, y: band.top, width: (s.end - s.start + 1) / width, height: band.height })),
    });
  }
  return out;
}

/**
 * يقرأ بكسلاتِ الصورة على لوحةٍ بعرضٍ يكفي لتمييز الفجوات (الصورة من blob على الأصل
 * نفسه، فاللوحة غير ملوَّثة). يُعاد `null` حيث لا لوحة (الخادم، أو متصفّحٌ يمنع).
 */
export function readPagePixels(image: CanvasImageSource, naturalWidth: number, naturalHeight: number, maxWidth = 1100): { pixels: Uint8ClampedArray; width: number; height: number } | null {
  if (!naturalWidth || !naturalHeight || typeof document === 'undefined') return null;
  try {
    const scale = Math.min(1, maxWidth / naturalWidth);
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, width, height);
    return { pixels: ctx.getImageData(0, 0, width, height).data, width, height };
  } catch { return null; }
}

/** كلمةُ الوجه كما يحتاجها الإسقاط: فهرسُها، وموضعُها في آيتها، وهل تُختم بها الآية. */
export interface FaceTokenWord { index: number; surah: number; ayah: number; ayahWordIndex?: number; endsAyah: boolean; text?: string }

/**
 * يجمع كلماتِ الوجه أسطرًا بحسب التخطيط، ويعدّ الكتلَ المطبوعة في كل سطر: الكلمة كتلة،
 * وفاصلةُ الآية بعد آخر كلمة منها كتلة.
 *
 * يُعاد مع كل سطرٍ ترتيبُ كتله: فهرسُ الكلمة، أو `null` للفاصلة. وكلمةٌ لا سطرَ لها في
 * التخطيط تُسقط الوجهَ كلَّه إلى عرض السطر — فالعدُّ الناقصُ يزيح كلَّ ما بعده.
 */
export function groupTokensByLine(
  words: readonly FaceTokenWord[],
  lineOf: (w: FaceTokenWord) => number | null | undefined,
): { lines: LineTokens[]; order: Map<number, (number | null)[]> } | null {
  const order = new Map<number, (number | null)[]>();
  const weights = new Map<number, number[]>();
  for (const w of words) {
    const line = lineOf(w);
    if (!line) return null;
    const list = order.get(line) ?? [];
    const weigh = weights.get(line) ?? [];
    list.push(w.index); weigh.push(printedWeight(w.text ?? 'xxxx'));
    if (w.endsAyah) { list.push(null); weigh.push(printedWeight(null)); }
    order.set(line, list); weights.set(line, weigh);
  }
  const lines = [...order.entries()].sort((a, b) => a[0] - b[0]).map(([line, list]) => ({ line, tokens: list.length, weights: weights.get(line) }));
  return { lines, order };
}

/** يربط صناديقَ الكتل بفهارس الكلمات؛ ولا يُسند إلا السطرُ الواثق. */
export function wordBoxesFromLines(measured: readonly MeasuredLine[], order: ReadonlyMap<number, readonly (number | null)[]>): Map<number, WordBox> {
  const boxes = new Map<number, WordBox>();
  for (const m of measured) {
    if (!m.confident) continue;
    const tokens = order.get(m.line);
    if (!tokens || tokens.length !== m.boxes.length) continue;
    tokens.forEach((wordIndex, i) => { if (wordIndex !== null) boxes.set(wordIndex, m.boxes[i]); });
  }
  return boxes;
}

/**
 * خاناتُ الأسطر على الصفحة — متينةٌ أمام الزخرفة.
 *
 * كشفُ الأشرطة من البياض بين الأسطر يسقط حيث يلتصق تشكيلُ سطرٍ بسطرٍ، أو حيث يطغى
 * إطارُ عنوان السورة المزخرف على عتبة الحبر. ومصحفُ المدينة مبنيٌّ على خاناتٍ متساوية
 * (العنوانُ والبسملةُ يشغلان خاناتٍ كالأسطر). فإن طابقت الأشرطةُ المقيسةُ عددَ الأسطر
 * أُخذت، وإلا قُسمت كتلةُ النصّ — من أوّل حبرٍ إلى آخره — خاناتٍ متساوية بعدد الأسطر.
 */
export function pageLineSlots(
  ink: readonly number[], lineCount: number,
  measured?: readonly { top: number; height: number }[] | null,
): { top: number; height: number }[] {
  if (measured && measured.length === lineCount) return measured.map(b => ({ ...b }));
  const rows = ink.length;
  if (!rows || lineCount < 1) return [];
  const sorted = [...ink].filter(v => v > 0).sort((a, b) => a - b);
  if (!sorted.length) return [];
  /* مرجعٌ متين: المئينُ التسعون لا أعلى صفّ — فخطُّ إطارٍ واحد لا يحكم العتبة. */
  const ref = sorted[Math.floor(sorted.length * 0.9)];
  const threshold = ref * 0.04;
  let top = 0, bottom = rows - 1;
  while (top < rows && ink[top] <= threshold) top += 1;
  while (bottom > top && ink[bottom] <= threshold) bottom -= 1;
  if (bottom <= top) return [];
  /*
   * ثمّ تُضبط الخاناتُ على الحبر نفسه: أوّلُ حبرٍ وآخرُه تزيحهما حركةٌ فوق سطرٍ أو سطرٌ
   * أخيرٌ قصير، فتنزاح الخاناتُ كلُّها. والأسطرُ دوريّة، فيُبحث عن الخطوة والإزاحة اللتين
   * تجمعان أكثرَ الحبر في قلوب الخانات — مطابقةٌ للصفحة كلِّها لا لطرفيها.
   */
  const base = (bottom - top + 1) / lineCount;
  const prefix = new Float64Array(rows + 1);
  for (let y = 0; y < rows; y += 1) prefix[y + 1] = prefix[y] + ink[y];
  const sum = (a: number, b: number) => { const lo = Math.max(0, Math.floor(a)), hi = Math.min(rows, Math.ceil(b)); return hi > lo ? prefix[hi] - prefix[lo] : 0; };
  let best = { score: -Infinity, pitch: base, start: top };
  for (let p = 0.9; p <= 1.1001; p += 0.005) {
    const pitch = base * p;
    for (let o = -0.45; o <= 0.4501; o += 0.025) {
      const start = top + o * pitch;
      let core = 0, edge = 0;
      for (let i = 0; i < lineCount; i += 1) {
        const t = start + i * pitch;
        core += sum(t + pitch * 0.3, t + pitch * 0.7);
        edge += sum(t, t + pitch * 0.08) + sum(t + pitch * 0.92, t + pitch);
      }
      const score = core - edge * 2.5;
      if (score > best.score) best = { score, pitch, start };
    }
  }
  return Array.from({ length: lineCount }, (_, i) => ({ top: (best.start + i * best.pitch) / rows, height: best.pitch / rows }));
}

/** قلبُ الخانة: يُقاس فيه حبرُ الأعمدة بعيدًا عن تشكيل السطرين المجاورين. */
export function slotCore(band: { top: number; height: number }, keep = 0.62): { top: number; height: number } {
  const trim = (band.height * (1 - keep)) / 2;
  return { top: band.top + trim, height: band.height * keep };
}
