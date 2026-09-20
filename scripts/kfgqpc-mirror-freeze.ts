#!/usr/bin/env tsx
/*
 * تجميدُ نصّ الروايات الثماني المسلَّمة من مرآة المجمّع داخل المستودع.
 *
 * موقعُ المجمّع محجوبٌ عن كثيرٍ من الشبكات، ونصُّ هذه الروايات كان يُجلب وقتَ التشغيل
 * من المرآة. فإن سقطت المرآةُ يومَ المسابقة فلا نصّ. وهذا يُجمّده على القرص.
 *
 * **والناشرُ هو المجمّع، والمرآةُ مضيفٌ لا أكثر.** فيُسجَّل الأمران منفصلين ولا يُخلطان:
 * `publisherAuthority: 'KFGQPC'` يقول من نشر، و`authority:
 * 'KFGQPC_DELIVERY_MIRROR_DERIVED'` يقول من أين وصلنا. ولا يُدّعى قطُّ أن هذه هي حزمةُ
 * المجمّع الرسميّة المضغوطة التي لها بصمةُ MD5+SHA-1 — تلك لم تصلنا بعد.
 *
 * وأربعةُ مراسٍ تُقيّد كلَّ ملفّ، وسقوطُ أيّها يوقف الملفّ كلَّه:
 *
 *   ١. بصمةُ البايتات الأصليّة تطابق المثبَّتة في `delivery-counts/kfgqpc-mirror/MANIFEST.json`
 *      عند الـcommit المثبَّت. والبصماتُ تُقرأ من هناك ولا تُنسخ هنا.
 *   ٢. أسماءُ الحقول تُقرأ صراحةً: حفصٌ يستعمل `sora` وبقيّةُ الحزم `sura_no`. ولا
 *      يُخمَّن حقلٌ: غيابُ الاثنين فشلٌ باسمه.
 *   ٣. رقمُ الآية الملحقُ بآخر النصّ يُنزع **فقط** إذا طابق `aya_no` رقمًا برقم. فالنزعُ
 *      مُثبَتٌ لا مفترض، وأيُّ رقمٍ لا يطابق يوقف الحزمة.
 *   ٤. عددُ آيات كلّ سورة يطابق `delivery-counts/kfgqpc-mirror/counts.json` المقيس سابقًا.
 */
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface MirrorFilePin { rawiId: string; upstreamPath: string; byteLength: number; sha256: string; totalAyahs: number }

/** أسماءُ الأثر المجمَّد — مشتقّةٌ من معرّف الرواية، لا مكتوبةٌ في موضعين. */
export const frozenFileName = (rawiId: string) => `${rawiId}.kfgqpc-mirror.json.deflate`;

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex').toLowerCase();

/** رقمُ السورة: حفصٌ `sora`، والبقيّة `sura_no`. ولا ثالثَ يُخمَّن. */
export function surahOf(row: Record<string, unknown>): number {
  const raw = row.sura_no ?? row.sora;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 114) throw new Error(`MIRROR_ROW_SURAH_INVALID:${String(raw)}`);
  return n;
}

const ARABIC_INDIC = /[٠-٩۰-۹]+$/;
const DIGIT = (ch: string) => {
  const c = ch.codePointAt(0) as number;
  if (c >= 0x0660 && c <= 0x0669) return c - 0x0660;
  if (c >= 0x06f0 && c <= 0x06f9) return c - 0x06f0;
  return NaN;
};

/**
 * ينزع علامةَ رقم الآية من آخر النصّ — وشرطُه أن تكون الأرقامُ هي `ayah` نفسَه.
 * فلو حملت الآيةُ رقمًا آخرَ لم تُمسّ ورُفعت خطأً: النصُّ القرآنيّ لا يُقصّ بالظنّ.
 */
export function stripAyahMarker(text: string, ayah: number): string {
  const match = ARABIC_INDIC.exec(text);
  if (!match) throw new Error(`MIRROR_AYAH_MARKER_ABSENT:${ayah}`);
  const digits = [...match[0]].map(DIGIT);
  if (digits.some(Number.isNaN)) throw new Error(`MIRROR_AYAH_MARKER_UNREADABLE:${ayah}`);
  const value = Number(digits.join(''));
  if (value !== ayah) throw new Error(`MIRROR_AYAH_MARKER_MISMATCH:${ayah}:${value}`);
  const stripped = text.slice(0, match.index).trim();
  if (!stripped.length) throw new Error(`MIRROR_AYAH_TEXT_EMPTY:${ayah}`);
  return stripped;
}

/*
 * هندسةُ الصفحة تُحفظ، ولا تُخترع.
 *
 * كان هذا البناءُ يُبقي `{id,text}` ويُسقط كلَّ حقلٍ سواهما — ومنها `page` و`line_start`
 * و`line_end`. وهي مواضعُ المصحف التي نشرها المجمّع نفسُه في هذه البايتات بعينها، فلمّا
 * سقطت لم يبقَ للسطحِ ما يعرض به صفحةَ المصحف المدني ولا ما يضع عليه عدستَه: يعود
 * `loci` فارغًا في كلّ مقطع، فيسقط العرضُ إلى نصٍّ متّصل.
 *
 * فصارت تُحفظ كما وردت، بشرطين: أن تكون الثلاثةُ معًا أو لا شيء — فصفحةٌ بلا سطرٍ
 * موضعٌ ناقصٌ لا يُرسم — وأن تجتاز حدودَها (صفحةٌ ١..٦٠٤، وسطرٌ ≥١، ونهايةٌ ≥ بداية).
 * وحقلٌ مشبوهٌ يُرفض ولا يُصحَّح بالتخمين.
 *
 * و`page` يصل رقمًا في حزمتين ونصًّا في ستّ — فيُقرأ بـ`Number` ويُتحقَّق أنه صحيح،
 * لا يُفترض نوعُه. (قِيس: حفص وشعبة رقمٌ، والستُّ الباقية نصّ.)
 *
 * والنصُّ لم يُمسّ بحرف: `stripAyahMarker` كما هو، وعدُّ الآي كما هو. وأُثبت ذلك
 * بمقارنة ٤٩٬٧٧٤ نصًّا قبل التغيير وبعده.
 */

export interface FrozenAyah { id: number; text: string; page?: number; lineStart?: number; lineEnd?: number }

/*
 * آيةٌ تعبر صفحتين لا تُنسب إلى إحداهما.
 *
 * ستٌّ من الحزم الثمانِ تكتب صفحةَ الآية العابرة مدًى: `"85-86"`، ومعها `line_start: 14`
 * (سطرُ ٨٥ الرابعَ عشر) و`line_end: 1` (سطرُ ٨٦ الأول) — فيأتي الانتهاءُ قبل الابتداء،
 * وهو تمامُ الصدق في بنيتها لا خطأٌ فيها.
 *
 * وموضعُها الصحيح لَوحان لا لوحٌ واحد. وشكلُ `{page,lineStart,lineEnd}` لا يسع لوحين،
 * فأمامنا ثلاث: أن نكتب `85..14–14` فنزعم أنها تنتهي حيث لا تنتهي؛ أو أن نكتب سطرَ
 * نهايةٍ للصفحة ٨٥ لا نعرفه (فعددُ أسطر كلِّ صفحةٍ ليس عندنا مقيسًا)؛ أو ألّا نزعم شيئًا.
 *
 * فلا نزعم. تُحفظ بلا هندسة، فلا تُرسم لها عدسةٌ ولا صفحة — ويبقى ما عداها كاملًا.
 * وهي ٤ أو ٥ آياتٍ من ٦٢١٤ فأكثر في كلّ حزمة، وتُعدّ وتُذكر ولا تمرّ صامتة.
 *
 * وما سوى هذا الشكل بعينه يبقى خطأً يُرفض: صفحةٌ خارج ١..٦٠٤، أو نصٌّ ليس مدًى،
 * أو نهايةٌ قبل بدايةٍ على صفحةٍ واحدة.
 */
const PAGE_SPAN = /^\s*(\d{1,3})\s*-\s*(\d{1,3})\s*$/;

/** هل كتبت الحزمةُ صفحةَ هذه الآية مدًى عابرًا بين صفحتين متجاورتين؟ */
export function isPageSpan(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const match = PAGE_SPAN.exec(raw);
  if (!match) return false;
  const from = Number(match[1]), to = Number(match[2]);
  return from >= 1 && to <= 604 && to === from + 1;
}

/** موضعُ الآية على صفحة المصحف، أو `null` حين لا تحمله الحزمة أو حين تعبر صفحتين. */
export function pageGeometryOf(row: Record<string, unknown>, surah: number, ayah: number):
  { page: number; lineStart: number; lineEnd: number } | null {
  const present = [row.page, row.line_start, row.line_end].filter(v => v !== undefined && v !== null && v !== '');
  if (present.length === 0) return null;
  if (present.length !== 3) throw new Error(`MIRROR_PAGE_GEOMETRY_PARTIAL:${surah}:${ayah}`);
  if (isPageSpan(row.page)) return null;
  const page = Number(row.page), lineStart = Number(row.line_start), lineEnd = Number(row.line_end);
  if (!Number.isInteger(page) || page < 1 || page > 604) throw new Error(`MIRROR_PAGE_INVALID:${surah}:${ayah}:${String(row.page)}`);
  if (!Number.isInteger(lineStart) || lineStart < 1) throw new Error(`MIRROR_LINE_START_INVALID:${surah}:${ayah}:${String(row.line_start)}`);
  if (!Number.isInteger(lineEnd) || lineEnd < lineStart) throw new Error(`MIRROR_LINE_END_INVALID:${surah}:${ayah}:${String(row.line_end)}`);
  return { page, lineStart, lineEnd };
}

/** يبني الجدولَ الذي يتوقّعه `parseCandidateRawDeflate`: مفاتيحُ سورٍ ١..١١٤. */
export function buildSurahTable(rows: readonly Record<string, unknown>[], expectedPerSurah: readonly number[]) {
  const table: Record<string, FrozenAyah[]> = {};
  for (const row of rows) {
    const surah = surahOf(row);
    const ayah = Number(row.aya_no);
    if (!Number.isInteger(ayah) || ayah < 1) throw new Error(`MIRROR_ROW_AYAH_INVALID:${surah}:${String(row.aya_no)}`);
    const text = row.aya_text;
    if (typeof text !== 'string' || !text.length) throw new Error(`MIRROR_ROW_TEXT_INVALID:${surah}:${ayah}`);
    const geometry = pageGeometryOf(row, surah, ayah);
    (table[String(surah)] ||= []).push({ id: ayah, text: stripAyahMarker(text, ayah), ...(geometry || {}) });
  }
  for (let surah = 1; surah <= 114; surah++) {
    const list = table[String(surah)];
    if (!list) throw new Error(`MIRROR_SURAH_MISSING:${surah}`);
    list.sort((a, b) => a.id - b.id);
    for (let i = 0; i < list.length; i++) {
      if (list[i].id !== i + 1) throw new Error(`MIRROR_AYAH_GAP:${surah}:${i + 1}:${list[i].id}`);
    }
    const want = expectedPerSurah[surah - 1];
    if (list.length !== want) throw new Error(`MIRROR_SURAH_COUNT:${surah}:${list.length}:${want}`);
  }
  return table;
}

function main() {
  const repo = process.cwd();
  const root = resolve(process.argv[2] || process.env.MIZAN_KFGQPC_MIRROR_ROOT || '');
  if (!root || !existsSync(root)) {
    console.error('الاستعمال: npx tsx scripts/kfgqpc-mirror-freeze.ts <جذر نسخة المرآة>');
    process.exitCode = 2;
    return;
  }
  const pinDir = join(repo, 'quran-sources', 'delivery-counts', 'kfgqpc-mirror');
  const manifest = JSON.parse(readFileSync(join(pinDir, 'MANIFEST.json'), 'utf8')) as { upstreamCommit: string; files: MirrorFilePin[] };
  const counts = JSON.parse(readFileSync(join(pinDir, 'counts.json'), 'utf8')) as Record<string, { perSurahAyahCounts: number[] }>;
  const outDir = join(repo, 'quran-sources', 'kfgqpc-mirror-derived');
  mkdirSync(outDir, { recursive: true });

  console.log(`\nتجميدُ ${manifest.files.length} حزمةً من مرآة المجمّع عند ${manifest.upstreamCommit.slice(0, 12)}\n` + '─'.repeat(72));
  const pins: Array<{ rawiId: string; verses: number; artifactSha256: string }> = [];
  let failed = 0;

  for (const file of manifest.files) {
    const label = file.rawiId.padEnd(17);
    try {
      const path = join(root, file.upstreamPath);
      if (!existsSync(path)) throw new Error(`MIRROR_FILE_ABSENT:${file.upstreamPath}`);
      const bytes = readFileSync(path);
      if (bytes.length !== file.byteLength) throw new Error(`MIRROR_BYTE_LENGTH:${bytes.length}:${file.byteLength}`);
      const got = sha256(bytes);
      if (got !== file.sha256) throw new Error(`MIRROR_SHA256_MISMATCH:${got}`);

      // فكُّ الترميز صارم: بايتٌ تالفٌ يُرفض ولا يُستبدل بمحرف بديل صامت.
      let decoded: string;
      try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { throw new Error('MIRROR_UTF8_INVALID'); }
      const rows = JSON.parse(decoded) as Record<string, unknown>[];
      if (!Array.isArray(rows)) throw new Error('MIRROR_JSON_NOT_AN_ARRAY');
      const perSurah = counts[file.rawiId]?.perSurahAyahCounts;
      if (!Array.isArray(perSurah) || perSurah.length !== 114) throw new Error(`MIRROR_COUNTS_ABSENT:${file.rawiId}`);

      const table = buildSurahTable(rows, perSurah);
      const verses = Object.values(table).reduce((sum, list) => sum + list.length, 0);
      /* الآياتُ العابرةُ صفحتين تُعدّ وتُذكر — فالنقصُ المعلن ليس كالنقص الصامت. */
      const located = Object.values(table).reduce((sum, list) => sum + list.filter(x => x.page !== undefined).length, 0);
      const crossing = verses - located;
      if (verses !== file.totalAyahs) throw new Error(`MIRROR_TOTAL_AYAHS:${verses}:${file.totalAyahs}`);

      const artifact = deflateRawSync(Buffer.from(JSON.stringify(table), 'utf8'), { level: 9 });
      writeFileSync(join(outDir, frozenFileName(file.rawiId)), artifact);
      const artifactSha256 = sha256(artifact);
      pins.push({ rawiId: file.rawiId, verses, artifactSha256 });
      console.log(`  ✓ ${label} ${String(verses).padStart(4)} آية · ${String(located).padStart(4)} بموضع${crossing ? ` · ${crossing} عابرةً صفحتين بلا موضع` : ''} · ${(artifact.length / 1024).toFixed(0).padStart(4)}KB · ${artifactSha256.slice(0, 16)}…`);
    } catch (error) {
      failed += 1;
      console.log(`  ✗ ${label} ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log('─'.repeat(72));
  console.log(`  جُمّد: ${pins.length} من ${manifest.files.length}`);
  if (failed) { console.error('\nحزمةٌ لم تجتز مراسيَها لم تُجمَّد — ولا يُجمَّد نصفُ نصّ.'); process.exitCode = 1; return; }
  console.log('\nالبصماتُ للتثبيت في quran-candidate-sources.ts:\n');
  for (const pin of pins) console.log(`  ${pin.rawiId.padEnd(17)} ${pin.verses}  '${pin.artifactSha256}'`);
}

if (process.argv[1] && process.argv[1].endsWith('kfgqpc-mirror-freeze.ts')) main();
