/*
 * قراءة ملف Excel (‎.xlsx) وتحويل ورقته الأولى إلى CSV — بلا مكتبة خارجية.
 *
 * منظّمو المسابقات يحتفظون بكشوفهم في Excel، وكان الاستيراد يقبل CSV وحده، فيُطلب منهم
 * «احفظ باسم» قبل كل رفع، وفي هذه الخطوة تضيع الترميزات العربية وأصفار الهواتف. وأشهر
 * مكتبات قراءة xlsx في npm إمّا قديمةٌ بثغراتٍ معلنة أو ثقيلةٌ على متصفّح جوال؛ والتنسيق
 * نفسه زيپٌ فيه ملفّات XML، وما نحتاجه منه ثلاثة أشياء: النصوص المشتركة، وترتيب الأوراق،
 * وخانات الورقة الأولى.
 *
 * وهذا يُبقي خطّ التدقيق كما هو: الناتج نصّ CSV يمرّ على `planParticipantImport` نفسه
 * بكل قواعده (الكل أو لا شيء، البريد، الفئة، الرواية). فلا مسار تدقيقٍ ثانٍ يختلف عن الأول.
 *
 * ما لا يدعمه هذا القارئ يُرفض بسببٍ مسمّى ولا يُخمَّن: زيپ64، وملفٌّ مشفّر بكلمة مرور،
 * وملفٌّ ليس xlsx أصلًا.
 */

const MAX_ENTRY_BYTES = 40 * 1024 * 1024;

export class XlsxReadError extends Error {
  constructor(public code: 'XLSX_NOT_A_ZIP' | 'XLSX_UNSUPPORTED' | 'XLSX_NO_SHEET' | 'XLSX_TOO_LARGE' | 'XLSX_CORRUPT', message: string) {
    super(message);
  }
}

export const XLSX_ERROR_MESSAGES: Record<XlsxReadError['code'], string> = {
  XLSX_NOT_A_ZIP: 'الملف ليس بصيغة Excel (.xlsx) صحيحة.',
  XLSX_UNSUPPORTED: 'هذا الملف بصيغةٍ غير مدعومة (مشفّر أو كبير جدًا). احفظه من Excel بصيغة .xlsx عادية أو CSV.',
  XLSX_NO_SHEET: 'لا توجد ورقة بيانات في الملف.',
  XLSX_TOO_LARGE: 'محتوى الملف أكبر من الحدّ المسموح.',
  XLSX_CORRUPT: 'الملف تالف أو ناقص.',
};

/** ملفٌّ xlsx يبدأ بتوقيع الزيپ «PK». */
export function looksLikeXlsx(name: string, bytes: Uint8Array): boolean {
  return /\.xlsx$/i.test(name) && bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

interface ZipEntry { method: number; compressedSize: number; size: number; offset: number }

function readZipDirectory(view: DataView, bytes: Uint8Array): Map<string, ZipEntry> {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new XlsxReadError('XLSX_NOT_A_ZIP', XLSX_ERROR_MESSAGES.XLSX_NOT_A_ZIP);
  const count = view.getUint16(eocd + 10, true);
  const dirOffset = view.getUint32(eocd + 16, true);
  if (count === 0xffff || dirOffset === 0xffffffff) throw new XlsxReadError('XLSX_UNSUPPORTED', XLSX_ERROR_MESSAGES.XLSX_UNSUPPORTED);
  const entries = new Map<string, ZipEntry>();
  let p = dirOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) throw new XlsxReadError('XLSX_CORRUPT', XLSX_ERROR_MESSAGES.XLSX_CORRUPT);
    const flags = view.getUint16(p + 8, true);
    if (flags & 1) throw new XlsxReadError('XLSX_UNSUPPORTED', XLSX_ERROR_MESSAGES.XLSX_UNSUPPORTED);
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.set(name, { method, compressedSize, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_ENTRY_BYTES) { await reader.cancel(); throw new XlsxReadError('XLSX_TOO_LARGE', XLSX_ERROR_MESSAGES.XLSX_TOO_LARGE); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

async function readEntry(view: DataView, bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  if (entry.size > MAX_ENTRY_BYTES) throw new XlsxReadError('XLSX_TOO_LARGE', XLSX_ERROR_MESSAGES.XLSX_TOO_LARGE);
  const o = entry.offset;
  if (o + 30 > bytes.length || view.getUint32(o, true) !== 0x04034b50) throw new XlsxReadError('XLSX_CORRUPT', XLSX_ERROR_MESSAGES.XLSX_CORRUPT);
  const start = o + 30 + view.getUint16(o + 26, true) + view.getUint16(o + 28, true);
  const raw = bytes.subarray(start, start + entry.compressedSize);
  if (raw.length !== entry.compressedSize) throw new XlsxReadError('XLSX_CORRUPT', XLSX_ERROR_MESSAGES.XLSX_CORRUPT);
  let data: Uint8Array;
  if (entry.method === 0) data = raw;
  else if (entry.method === 8) {
    try { data = await inflateRaw(raw); }
    catch (e) { if (e instanceof XlsxReadError) throw e; throw new XlsxReadError('XLSX_CORRUPT', XLSX_ERROR_MESSAGES.XLSX_CORRUPT); }
  } else throw new XlsxReadError('XLSX_UNSUPPORTED', XLSX_ERROR_MESSAGES.XLSX_UNSUPPORTED);
  return new TextDecoder('utf-8').decode(data);
}

const decodeXml = (s: string) => s
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** نصّ عنصرٍ يحوي `<t>` واحدًا أو أكثر (نصٌّ غنيّ)، دون النطق الصوتي `<rPh>`. */
const textOf = (xml: string) => {
  const clean = xml.replace(/<rPh[\s\S]*?<\/rPh>/g, '');
  let out = '';
  for (const m of clean.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1];
  return decodeXml(out);
};

const columnIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/[^A-Za-z]/g, '').toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** رقم تسلسلي في Excel (أيام منذ 1899-12-30) إلى YYYY-MM-DD. */
export function excelSerialToIsoDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const csvCell = (v: string) => {
  const flat = v.replace(/[\r\n]+/g, ' ');
  return /[",]/.test(flat) ? `"${flat.replace(/"/g, '""')}"` : flat;
};

/** الورقة الأولى كما يرتّبها المصنَّف، لا كما يرتّبها اسمُ الملف داخل الزيپ. */
function firstSheetPath(workbook: string | undefined, rels: string | undefined, names: string[]): string | undefined {
  const rid = workbook?.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  if (rid && rels) {
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      const tag = m[0];
      if (tag.match(/\bId="([^"]+)"/)?.[1] !== rid) continue;
      const target = tag.match(/\bTarget="([^"]+)"/)?.[1];
      if (!target) continue;
      const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
      if (names.includes(path)) return path;
    }
  }
  return names.filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0];
}

export async function xlsxToCsv(bytes: Uint8Array): Promise<string> {
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new XlsxReadError('XLSX_NOT_A_ZIP', XLSX_ERROR_MESSAGES.XLSX_NOT_A_ZIP);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = readZipDirectory(view, bytes);
  const read = async (name: string) => { const e = entries.get(name); return e ? readEntry(view, bytes, e) : undefined; };

  const sheetPath = firstSheetPath(await read('xl/workbook.xml'), await read('xl/_rels/workbook.xml.rels'), [...entries.keys()]);
  const sheet = sheetPath ? await read(sheetPath) : undefined;
  if (!sheet) throw new XlsxReadError('XLSX_NO_SHEET', XLSX_ERROR_MESSAGES.XLSX_NO_SHEET);

  const sharedXml = await read('xl/sharedStrings.xml');
  const shared = sharedXml ? [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => textOf(m[1])) : [];

  const grid: string[][] = [];
  let nextRow = 0;
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowAttr = rowMatch[1];
    const rIndex = rowAttr.match(/\br="(\d+)"/);
    const rowNo = rIndex ? parseInt(rIndex[1], 10) - 1 : nextRow;
    nextRow = rowNo + 1;
    const cells: string[] = [];
    let nextCol = 0;
    for (const c of (rowMatch[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = attrs.match(/\br="([A-Za-z]+\d+)"/)?.[1];
      const col = ref ? columnIndex(ref) : nextCol;
      nextCol = col + 1;
      const type = attrs.match(/\bt="([^"]+)"/)?.[1] || 'n';
      const body = c[2] || '';
      let value = '';
      if (type === 'inlineStr') value = textOf(body);
      else {
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (v !== undefined) {
          if (type === 's') value = shared[parseInt(v, 10)] ?? '';
          else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
          else value = decodeXml(v);
        }
      }
      while (cells.length < col) cells.push('');
      cells[col] = value.trim();
    }
    while (grid.length < rowNo) grid.push([]);
    grid[rowNo] = cells;
  }

  const rows = grid.filter(r => r.some(v => v !== ''));
  if (!rows.length) throw new XlsxReadError('XLSX_NO_SHEET', XLSX_ERROR_MESSAGES.XLSX_NO_SHEET);

  /*
   * تاريخ الميلاد في Excel رقمٌ تسلسلي ما لم يُكتب نصًّا. رقمٌ مجرّد في هذا العمود لا يمكن
   * أن يكون تاريخًا بالصيغة المطلوبة أصلًا، فتحويله لا يُدخل شيئًا لم يكن سيُرفض — ويُنقذ
   * الملف الذي كتبه صاحبه كما يكتب أي تاريخ في Excel.
   */
  const dobCol = rows[0].findIndex(h => h.trim() === 'dateOfBirth');
  if (dobCol >= 0) {
    for (let i = 1; i < rows.length; i++) {
      const v = rows[i][dobCol];
      if (v && /^\d+(\.\d+)?$/.test(v)) rows[i][dobCol] = excelSerialToIsoDate(Number(v)) ?? v;
    }
  }

  const width = Math.max(...rows.map(r => r.length));
  return rows.map(r => Array.from({ length: width }, (_, i) => csvCell(r[i] ?? '')).join(',')).join('\n');
}
