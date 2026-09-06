/*
 * تحويل توقيتات QUL إلى شكل مقاطع ميزان.
 *
 * الشكل عند المصدر مضغوط في عمود نصّي واحد اسمه `words` داخل جدول `timings`:
 *
 *     "1:450:1200,2:1210:2110,3:2120:3070"
 *      ▲   ▲    ▲
 *      │   │    └─ نهاية الكلمة بالمللي
 *      │   └────── بدايتها
 *      └────────── ترتيب الكلمة
 *
 * وهذا العمود لا يوجد إلا حين `schema_version > 1`؛ ودونه فالقاعدة توقيت آية لا كلمة، ولا
 * تصلح لتظليل الكلمة أصلًا. فتُرفض صراحةً بدل أن تُقبل ويُظنّ أن التظليل سيعمل.
 *
 * وأساس الترقيم — أصفريّ أم واحديّ — لا يُفترض بل **يُستنتج من البيانات نفسها**: افتراضه خطأً
 * يزيح كل كلمة موضعًا واحدًا، وهو انزياح لا يُرى في الأرقام ويُرى في التظليل.
 */

/** مقطع ميزان: `[أول كلمة, بعد آخر كلمة, بداية, نهاية]` صفريّ الأساس، والنهاية غير شاملة. */

/**
 * يقرأ عمود `words` لآية واحدة.
 * يعيد قائمة `{index, startMs, endMs}` بالترقيم كما ورد في المصدر، بلا إزاحة.
 */
export function parseWordsColumn(value) {
  if (typeof value !== 'string' || !value.trim()) return [];
  const out = [];
  for (const entry of value.split(',')) {
    const pieces = entry.split(':');
    if (pieces.length < 3) continue;
    const index = Number(pieces[0]), startMs = Number(pieces[1]), endMs = Number(pieces[2]);
    if (![index, startMs, endMs].every(Number.isFinite)) continue;
    if (endMs <= startMs) continue;
    out.push({ index, startMs, endMs });
  }
  return out;
}

/**
 * أساس الترقيم مستنتجًا من أصغر فهرس ورد في القاعدة كلها.
 * صفر ⇒ صفريّ. واحد ⇒ واحديّ. وغير ذلك شكلٌ لا نعرفه، فلا نخمّنه.
 */
export function detectIndexBase(rows) {
  let min = Infinity;
  for (const row of rows) {
    for (const w of parseWordsColumn(row.words)) min = Math.min(min, w.index);
  }
  if (min === 0) return 0;
  if (min === 1) return 1;
  return null;
}

/**
 * يحوّل صفوف جدول `timings` إلى مقاطع ميزان، مع رفض ما لا يطابق تقطيع المصحف.
 *
 * @param rows صفوف الجدول: `{sura, ayah, time, words}`
 * @param layoutWordCounts خريطة "سورة:آية" ← عدد كلمات الآية في مصحفنا
 */
export function convertQulTimings(rows, layoutWordCounts) {
  const usable = rows.filter((r) => parseWordsColumn(r.words).length > 0);
  if (!usable.length) {
    return { ok: false, code: 'NO_WORD_TIMINGS', message: 'The database carries ayah timings only; its schema_version is 1 or its words column is empty. It cannot drive word highlighting.' };
  }
  const base = detectIndexBase(usable);
  if (base === null) {
    return { ok: false, code: 'UNKNOWN_INDEX_BASE', message: 'Word indices start at neither 0 nor 1; the numbering scheme is unrecognised and guessing it would shift every word by one.' };
  }

  const ayat = {};
  const mismatched = [];
  let dropped = 0;

  for (const row of usable) {
    const surah = Number(row.sura ?? row.surah), ayah = Number(row.ayah);
    if (!Number.isInteger(surah) || !Number.isInteger(ayah)) { dropped++; continue }
    const key = `${surah}:${ayah}`;
    const expected = layoutWordCounts.get(key);
    if (expected === undefined) { dropped++; continue }

    const words = parseWordsColumn(row.words)
      .map((w) => ({ ...w, index: w.index - base }))
      .sort((a, b) => a.startMs - b.startMs);

    // فهارس خارج عدد كلمات الآية تعني تقطيعًا مختلفًا؛ الآية كلها تُستبعد ولا تُقصّ.
    if (words.some((w) => w.index < 0 || w.index >= expected)) { mismatched.push(key); continue }
    if (words.length !== expected) { mismatched.push(key); continue }

    let sane = true;
    for (let i = 1; i < words.length; i++) if (words[i].startMs < words[i - 1].endMs) { sane = false; break }
    if (!sane) { dropped++; continue }

    // كل كلمة مقطعها الخاص هنا، فالنهاية غير الشاملة هي الفهرس التالي.
    ayat[key] = words.map((w) => [w.index, w.index + 1, w.startMs, w.endMs]);
  }

  if (!Object.keys(ayat).length) {
    return { ok: false, code: 'NO_AYAT_AGREED', message: 'No ayah matched the Mushaf word counts; the source text segmentation differs throughout.' };
  }
  return { ok: true, indexBase: base, ayat, mismatchedAyat: mismatched, dropped };
}
