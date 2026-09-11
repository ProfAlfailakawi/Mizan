/*
 * QuranScope — المرجع الوحيد لمعنى «أين يجوز طرح السؤال؟»
 *
 * القاعدة المعمارية: لا توجد في ميزان فئةٌ اسمها «القرآن كاملًا» ولا «نصف القرآن» ولا «ربعه».
 * تلك أسماءٌ بشرية. أما النظام فيعمل على نطاقٍ حقيقي: قائمة مقاطع (segments) كلٌّ منها من
 * موضعٍ قرآني إلى موضعٍ قرآني — surah/ayah — بعد تطبيعٍ يكشف التداخل ويدمج المتجاور ويمنع
 * التكرار ويرتّب ويتحقق من صحة الحدود.
 *
 * A competition category is data + scope + rules, not a hard-coded competition type.
 * الفئة في ميزان تُعرّف بنطاقها وقواعدها الفعلية، لا باسمٍ ثابت داخل الكود.
 *
 * كل ما سوى surah/ayah (جزء، حزب، ربع، صفحة) مُدخَلٌ للبناء ومُخرَجٌ للعرض — لا مصدر حقيقة.
 */

import {
  ayahCountOf, ayahOrdinal, compareLoci, FIRST_LOCUS, isValidLocus, isValidSurah, juzOfLocus,
  LAST_LOCUS, ordinalToLocus, pageOfLocus, QURAN_JUZ_TOTAL, QURAN_SURAH_TOTAL, QURAN_TOTAL_AYAHS,
  surahEndLocus, surahName, surahStartLocus, unitBounds, unitTotal, juzBounds,
  type QuranLocus, type QuranScopeUnit, type QuranUnitAssurance,
} from './quran-canon';

export type { QuranLocus, QuranScopeUnit, QuranUnitAssurance };

export const QURAN_SCOPE_VERSION = 1 as const;
export const SCOPE_SIGNATURE_ALGORITHM = 'MIZAN-SCOPE-SIG-1';

export interface QuranScopeSegment {
  start: QuranLocus;
  end: QuranLocus;
  /** وصف اختياري يكتبه المنظم لهذا المقطع. لا يؤثر في المنطق إطلاقًا. */
  label?: string;
}

export interface QuranScopeOrigin {
  /** معرّف الاختصار الذي بُني منه النطاق (إن وُجد). اسمٌ للإنسان لا شرطٌ للنظام. */
  presetId?: string;
  unit?: QuranScopeUnit;
  units?: number[];
  note?: string;
}

export interface QuranScope {
  version: typeof QURAN_SCOPE_VERSION;
  segments: QuranScopeSegment[];
  origin?: QuranScopeOrigin;
  /** أضعف درجة توثيق بين الوحدات التي بُني منها النطاق. */
  assurance: QuranUnitAssurance;
}

export interface ScopeIssue { code: string; ar: string; en: string; segmentIndex?: number }

const clampSurah = (surah: number) => Math.max(1, Math.min(QURAN_SURAH_TOTAL, Math.round(Number(surah) || 1)));
const clampLocus = (locus: QuranLocus): QuranLocus => {
  const surah = clampSurah(locus?.surah);
  const max = ayahCountOf(surah);
  return { surah, ayah: Math.max(1, Math.min(max, Math.round(Number(locus?.ayah) || 1))) };
};

const weakest = (values: QuranUnitAssurance[]): QuranUnitAssurance =>
  values.includes('DERIVED_PROPORTIONAL') ? 'DERIVED_PROPORTIONAL'
    : values.includes('CANONICAL_TABLE') ? 'CANONICAL_TABLE'
      : values[0] || 'CANONICAL_TABLE';

/*
 * ذاكرة مؤقتة محدودة للنطاقات.
 *
 * السحب في مسابقةٍ بعشرة آلاف متسابق يسأل عن النطاق نفسه آلاف المرات، وقياس النطاق يمرّ
 * على آيات المصحف. بلا هذه الذاكرة يتحول قياسٌ ثمنه أربعة أجزاء من الألف من الثانية إلى
 * دقائق. المفتاح بنيوي بحت (مدى الآيات بعد التطبيع) فلا يتسرب نطاقٌ إلى نطاق.
 */
const MEMO_LIMIT = 512;
function memoized<T>(store: Map<string, T>, key: string, build: () => T): T {
  const hit = store.get(key);
  if (hit !== undefined) { store.delete(key); store.set(key, hit); return hit; }
  const value = build();
  store.set(key, value);
  if (store.size > MEMO_LIMIT) store.delete(store.keys().next().value as string);
  return value;
}
const structuralKey = (scope: QuranScope | null | undefined) =>
  (scope?.segments || []).map(s => `${s?.start?.surah}:${s?.start?.ayah}>${s?.end?.surah}:${s?.end?.ayah}`).join('|');
const NORMALIZE_MEMO = new Map<string, QuranScopeSegment[]>();
const METRICS_MEMO = new Map<string, ScopeMetrics>();

// ---- construction ------------------------------------------------------------------------

export function emptyScope(origin?: QuranScopeOrigin): QuranScope {
  return { version: QURAN_SCOPE_VERSION, segments: [], origin, assurance: 'CANONICAL_TABLE' };
}

export function makeScope(segments: QuranScopeSegment[], origin?: QuranScopeOrigin, assurance: QuranUnitAssurance = 'CANONICAL_TABLE'): QuranScope {
  return normalizeScope({ version: QURAN_SCOPE_VERSION, segments, origin, assurance });
}

export function fullQuranScope(): QuranScope {
  return makeScope([{ start: FIRST_LOCUS, end: LAST_LOCUS }], { presetId: 'full_quran', unit: 'juz', units: Array.from({ length: QURAN_JUZ_TOTAL }, (_, i) => i + 1) });
}

/**
 * تطبيع النطاق: إصلاح الحدود المقلوبة، الترتيب، دمج المتداخل والمتجاور، إسقاط الفارغ.
 * كل أجزاء التطبيق تعتمد على المخرجات المطبَّعة وحدها.
 */
export function normalizeScope(scope: QuranScope | null | undefined): QuranScope {
  const segments = memoized(NORMALIZE_MEMO, structuralKey(scope), () => normalizeSegments(scope?.segments || []));
  return {
    version: QURAN_SCOPE_VERSION,
    segments,
    ...(scope?.origin ? { origin: scope.origin } : {}),
    assurance: scope?.assurance || 'CANONICAL_TABLE',
  };
}

function normalizeSegments(input: QuranScopeSegment[]): QuranScopeSegment[] {
  const ranges: { from: number; to: number; label?: string }[] = [];
  for (const segment of input) {
    if (!segment?.start || !segment?.end) continue;
    const a = clampLocus(segment.start), b = clampLocus(segment.end);
    const from = ayahOrdinal(compareLoci(a, b) <= 0 ? a : b);
    const to = ayahOrdinal(compareLoci(a, b) <= 0 ? b : a);
    ranges.push({ from, to, label: segment.label });
  }
  ranges.sort((x, y) => x.from - y.from || x.to - y.to);
  const merged: { from: number; to: number; label?: string }[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    // التجاور (to + 1 === from) يُدمج أيضًا: نطاقان متلاصقان نطاقٌ واحد، لا اثنان.
    if (last && range.from <= last.to + 1) { last.to = Math.max(last.to, range.to); last.label = last.label || range.label; }
    else merged.push({ ...range });
  }
  return merged.map(r => ({ start: ordinalToLocus(r.from), end: ordinalToLocus(r.to), ...(r.label ? { label: r.label } : {}) }));
}

/** بناء نطاق من وحدات معدودة (أجزاء، أحزاب، أرباع، صفحات، سور، آيات). */
export function scopeFromUnits(unit: QuranScopeUnit, indexes: number[], origin?: QuranScopeOrigin): QuranScope {
  const total = unitTotal(unit);
  const valid = [...new Set(indexes.map(n => Math.round(Number(n))).filter(n => Number.isInteger(n) && n >= 1 && n <= total))].sort((a, b) => a - b);
  const bounds = valid.map(n => unitBounds(unit, n));
  return makeScope(
    bounds.map(b => ({ start: b.start, end: b.end })),
    origin || { unit, units: valid },
    weakest(bounds.map(b => b.assurance)),
  );
}

export const scopeFromJuz = (juz: number[], origin?: QuranScopeOrigin) => scopeFromUnits('juz', juz, origin);
export const scopeFromSurahs = (surahs: number[], origin?: QuranScopeOrigin) => scopeFromUnits('surah', surahs, origin);

export function scopeFromJuzRange(from: number, to: number): QuranScope {
  const start = Math.min(from, to), end = Math.max(from, to);
  return scopeFromJuz(Array.from({ length: end - start + 1 }, (_, i) => start + i));
}

/** نطاق من حدّي آية صريحين — أدقّ صورة يمكن للمنظم أن يعبّر بها. */
export function scopeFromAyahRange(start: QuranLocus, end: QuranLocus, label?: string): QuranScope {
  return makeScope([{ start, end, ...(label ? { label } : {}) }]);
}

/** نطاق من عدد أجزاء بلا تحديد أيّها — يُعامَل صراحةً كنطاق غير محدد ولا يُخترع له موضع. */
export function scopeFromLegacyJuzCount(juzCount: number): { scope: QuranScope | null; unambiguous: boolean } {
  const n = Math.round(Number(juzCount) || 0);
  if (n >= QURAN_JUZ_TOTAL) return { scope: fullQuranScope(), unambiguous: true };
  if (n <= 0) return { scope: null, unambiguous: false };
  // «عشرة أجزاء» لا تقول أيّ عشرة. لا يُخترع موضع؛ يُطلب التأكيد من المنظم.
  return { scope: null, unambiguous: false };
}

// ---- ordinal algebra ---------------------------------------------------------------------

export type ScopeRange = readonly [number, number];

export function scopeRanges(scope: QuranScope): ScopeRange[] {
  return normalizeScope(scope).segments.map(s => [ayahOrdinal(s.start), ayahOrdinal(s.end)] as ScopeRange);
}

export function scopeFromRanges(ranges: ScopeRange[], origin?: QuranScopeOrigin, assurance: QuranUnitAssurance = 'CANONICAL_TABLE'): QuranScope {
  return makeScope(ranges.filter(([a, b]) => b >= a).map(([a, b]) => ({ start: ordinalToLocus(a), end: ordinalToLocus(b) })), origin, assurance);
}

export function scopeAyahCount(scope: QuranScope): number {
  return scopeRanges(scope).reduce((sum, [a, b]) => sum + (b - a + 1), 0);
}

export const isScopeEmpty = (scope: QuranScope | null | undefined) => !scope || scopeAyahCount(scope) === 0;

export function scopeContainsLocus(scope: QuranScope, locus: QuranLocus): boolean {
  if (!isValidLocus(locus)) return false;
  const ordinal = ayahOrdinal(locus);
  return scopeRanges(scope).some(([a, b]) => ordinal >= a && ordinal <= b);
}

/** هل المقطع كاملًا داخل النطاق؟ السؤال يمتد عبر آيات، فلا يكفي أن تكون بدايته داخله. */
export function scopeContainsRange(scope: QuranScope, start: QuranLocus, end: QuranLocus): boolean {
  if (!isValidLocus(start) || !isValidLocus(end)) return false;
  const from = ayahOrdinal(start), to = ayahOrdinal(end);
  if (to < from) return false;
  return scopeRanges(scope).some(([a, b]) => from >= a && to <= b);
}

export function scopeIntersect(a: QuranScope, b: QuranScope): QuranScope {
  const left = scopeRanges(a), right = scopeRanges(b), out: ScopeRange[] = [];
  for (const [x1, x2] of left) for (const [y1, y2] of right) {
    const from = Math.max(x1, y1), to = Math.min(x2, y2);
    if (from <= to) out.push([from, to]);
  }
  return scopeFromRanges(out, undefined, weakest([a.assurance, b.assurance]));
}

export function scopeUnion(a: QuranScope, b: QuranScope): QuranScope {
  return scopeFromRanges([...scopeRanges(a), ...scopeRanges(b)], undefined, weakest([a.assurance, b.assurance]));
}

export function scopeSubtract(a: QuranScope, b: QuranScope): QuranScope {
  let remaining = scopeRanges(a);
  for (const [y1, y2] of scopeRanges(b)) {
    const next: ScopeRange[] = [];
    for (const [x1, x2] of remaining) {
      if (y2 < x1 || y1 > x2) { next.push([x1, x2]); continue; }
      if (y1 > x1) next.push([x1, y1 - 1]);
      if (y2 < x2) next.push([y2 + 1, x2]);
    }
    remaining = next;
  }
  return scopeFromRanges(remaining, undefined, a.assurance);
}

export function isScopeSubsetOf(child: QuranScope, parent: QuranScope): boolean {
  return scopeAyahCount(scopeSubtract(child, parent)) === 0;
}

export function scopesEqual(a: QuranScope, b: QuranScope): boolean {
  return scopeKey(a) === scopeKey(b);
}

// ---- identity ----------------------------------------------------------------------------

/** المفتاح القانوني للنطاق بعد التطبيع. متطابقان ⇔ نطاقان متطابقان. */
export function scopeKey(scope: QuranScope): string {
  return scopeRanges(scope).map(([a, b]) => `${a}-${b}`).join(',') || 'empty';
}

/** بصمة مضغوطة للنطاق — تُستعمل في التجميع والذاكرة المؤقتة والتدقيق. خوارزميتها مُنسَّخة. */
export function scopeSignature(scope: QuranScope): string {
  const key = scopeKey(scope);
  // FNV-1a 64-bit على شكل زوج ٣٢-بت، فلا يحتاج BigInt ولا مكتبة تعمية.
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < key.length; i++) {
    h1 = Math.imul(h1 ^ key.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + key.charCodeAt(i) + i, 0x85ebca6b) >>> 0;
  }
  const hex = `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
  return `QS1:${hex}:${scopeAyahCount(scope)}`;
}

// ---- metrics -----------------------------------------------------------------------------

export interface ScopeMetrics {
  ayahCount: number;
  segmentCount: number;
  surahCount: number;
  surahs: number[];
  fullJuz: number[];
  partialJuz: number[];
  juzEquivalent: number;
  firstLocus: QuranLocus | null;
  lastLocus: QuranLocus | null;
  firstPage: number | null;
  lastPage: number | null;
  approximatePageCount: number;
  coverageRatio: number;
  assurance: QuranUnitAssurance;
}

export function scopeMetrics(scope: QuranScope): ScopeMetrics {
  const normalized = normalizeScope(scope);
  return memoized(METRICS_MEMO, `${structuralKey(normalized)}#${normalized.assurance}`, () => computeScopeMetrics(normalized));
}

function computeScopeMetrics(normalized: QuranScope): ScopeMetrics {
  const ranges = scopeRanges(normalized);
  let ayahCount = 0;
  const surahs = new Set<number>();
  const juzCovered = new Map<number, number>();
  const pages = new Set<number>();
  // مرور واحد على مواضع النطاق يجمع السور والأجزاء والصفحات معًا؛ ثلاثة مرورات كانت ثلاثة أثمان.
  for (const [from, to] of ranges) {
    ayahCount += to - from + 1;
    for (let ordinal = from; ordinal <= to; ordinal++) {
      const locus = ordinalToLocus(ordinal);
      surahs.add(locus.surah);
      const juz = juzOfLocus(locus);
      juzCovered.set(juz, (juzCovered.get(juz) || 0) + 1);
      pages.add(pageOfLocus(locus));
    }
  }
  const fullJuz: number[] = [], partialJuz: number[] = [];
  for (const [juz, covered] of [...juzCovered.entries()].sort((a, b) => a[0] - b[0])) {
    const bounds = juzBounds(juz);
    const size = ayahOrdinal(bounds.end) - ayahOrdinal(bounds.start) + 1;
    (covered >= size ? fullJuz : partialJuz).push(juz);
  }
  const first = ranges.length ? ordinalToLocus(ranges[0][0]) : null;
  const last = ranges.length ? ordinalToLocus(ranges[ranges.length - 1][1]) : null;
  return {
    ayahCount,
    segmentCount: normalized.segments.length,
    surahCount: surahs.size,
    surahs: [...surahs].sort((a, b) => a - b),
    fullJuz, partialJuz,
    juzEquivalent: Number(((ayahCount / QURAN_TOTAL_AYAHS) * QURAN_JUZ_TOTAL).toFixed(2)),
    firstLocus: first, lastLocus: last,
    firstPage: first ? pageOfLocus(first) : null,
    lastPage: last ? pageOfLocus(last) : null,
    approximatePageCount: pages.size,
    coverageRatio: Number((ayahCount / QURAN_TOTAL_AYAHS).toFixed(4)),
    assurance: normalized.assurance,
  };
}

export function validateScope(scope: QuranScope | null | undefined): ScopeIssue[] {
  const issues: ScopeIssue[] = [];
  if (!scope || !Array.isArray(scope.segments)) {
    return [{ code: 'SCOPE_MISSING', ar: 'لم يُحدَّد نطاق الحفظ بعد.', en: 'No memorization scope has been defined yet.' }];
  }
  if (!scope.segments.length) issues.push({ code: 'SCOPE_EMPTY', ar: 'النطاق فارغ — اختر جزءًا أو سورة أو مدى آيات على الأقل.', en: 'The scope is empty — select at least one juz, surah or ayah range.' });
  scope.segments.forEach((segment, index) => {
    if (!segment?.start || !segment?.end) { issues.push({ code: 'SCOPE_SEGMENT_INCOMPLETE', ar: 'مقطع بلا بداية أو نهاية.', en: 'A segment is missing its start or end.', segmentIndex: index }); return; }
    if (!isValidSurah(segment.start.surah) || !isValidSurah(segment.end.surah)) issues.push({ code: 'SCOPE_SURAH_INVALID', ar: 'رقم سورة خارج المصحف.', en: 'Surah number is outside the Quran.', segmentIndex: index });
    else if (!isValidLocus(segment.start) || !isValidLocus(segment.end)) issues.push({ code: 'SCOPE_AYAH_INVALID', ar: 'رقم آية خارج حدود سورتها.', en: 'Ayah number is outside its surah.', segmentIndex: index });
    else if (compareLoci(segment.start, segment.end) > 0) issues.push({ code: 'SCOPE_BOUNDS_REVERSED', ar: 'نهاية المقطع قبل بدايته.', en: 'Segment end comes before its start.', segmentIndex: index });
  });
  return issues;
}

// ---- balanced partitioning ---------------------------------------------------------------

/**
 * قسمة النطاق إلى أقسام متوازنة. الوزن الافتراضي عدد الآيات، ويمكن تمرير وزن أدق
 * (عدد المواضع الصالحة فعلًا في البنك مثلًا) فيقسم النظام على الطاقة لا على العدد.
 */
export function splitScopeBalanced(scope: QuranScope, parts: number, weightOfOrdinal?: (ordinal: number) => number): QuranScope[] {
  const count = Math.max(1, Math.round(parts));
  const ranges = scopeRanges(scope);
  if (!ranges.length) return Array.from({ length: count }, () => emptyScope());
  const ordinals: number[] = [];
  for (const [from, to] of ranges) for (let ordinal = from; ordinal <= to; ordinal++) ordinals.push(ordinal);
  const weights = ordinals.map(o => Math.max(0, weightOfOrdinal ? weightOfOrdinal(o) : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return splitScopeBalanced(scope, count);
  const target = total / count;
  const buckets: number[][] = Array.from({ length: count }, () => []);
  let bucket = 0, accumulated = 0;
  for (let i = 0; i < ordinals.length; i++) {
    buckets[Math.min(bucket, count - 1)].push(ordinals[i]);
    accumulated += weights[i];
    const remainingBuckets = count - bucket - 1;
    const remainingOrdinals = ordinals.length - i - 1;
    if (bucket < count - 1 && accumulated >= target * (bucket + 1) && remainingOrdinals >= remainingBuckets) bucket++;
  }
  return buckets.map(list => {
    if (!list.length) return emptyScope();
    const out: ScopeRange[] = [];
    let start = list[0], previous = list[0];
    for (const ordinal of list.slice(1)) {
      if (ordinal === previous + 1) { previous = ordinal; continue; }
      out.push([start, previous]); start = ordinal; previous = ordinal;
    }
    out.push([start, previous]);
    return scopeFromRanges(out, undefined, scope.assurance);
  });
}

// ---- description -------------------------------------------------------------------------

export function describeSegment(segment: QuranScopeSegment, arabic: boolean): string {
  const s = clampLocus(segment.start), e = clampLocus(segment.end);
  const sName = surahName(s.surah, arabic), eName = surahName(e.surah, arabic);
  if (s.surah === e.surah) {
    if (s.ayah === 1 && e.ayah === ayahCountOf(s.surah)) return arabic ? `سورة ${sName}` : `Surat ${sName}`;
    return arabic ? `${sName} ${s.ayah}–${e.ayah}` : `${sName} ${s.ayah}–${e.ayah}`;
  }
  return arabic ? `${sName} ${s.ayah} ← ${eName} ${e.ayah}` : `${sName} ${s.ayah} → ${eName} ${e.ayah}`;
}

/** وصف بشري مختصر للنطاق. للعرض فقط — لا يُشتق منه منطق أبدًا. */
export function describeScope(scope: QuranScope, arabic: boolean): string {
  const normalized = normalizeScope(scope);
  if (!normalized.segments.length) return arabic ? 'لا نطاق' : 'No scope';
  const metrics = scopeMetrics(normalized);
  if (metrics.ayahCount === QURAN_TOTAL_AYAHS) return arabic ? 'المصحف كاملًا' : 'The complete Quran';
  if (metrics.fullJuz.length && !metrics.partialJuz.length) {
    const list = metrics.fullJuz;
    const contiguous = list.every((n, i) => i === 0 || n === list[i - 1] + 1);
    if (contiguous && list.length > 1) return arabic ? `الأجزاء ${list[0]}–${list[list.length - 1]}` : `Juz ${list[0]}–${list[list.length - 1]}`;
    if (list.length === 1) return arabic ? `الجزء ${list[0]}` : `Juz ${list[0]}`;
    if (list.length <= 6) return arabic ? `الأجزاء ${list.join('، ')}` : `Juz ${list.join(', ')}`;
    return arabic ? `${list.length} أجزاء` : `${list.length} juz`;
  }
  if (normalized.segments.length <= 3) return normalized.segments.map(s => describeSegment(s, arabic)).join(arabic ? ' + ' : ' + ');
  return arabic ? `${normalized.segments.length} مقاطع · ${metrics.ayahCount} آية` : `${normalized.segments.length} segments · ${metrics.ayahCount} ayat`;
}

/** قيمة juzCount القديمة مشتقةً من النطاق — للتوافق والعرض فقط، لا للسحب ولا للعدالة. */
export function derivedLegacyJuzCount(scope: QuranScope): number {
  const metrics = scopeMetrics(scope);
  return Math.max(1, Math.min(QURAN_JUZ_TOTAL, metrics.fullJuz.length + metrics.partialJuz.length));
}

/** أعلى جزء يلمسه النطاق — جسر توافق مع FairDraw القديم الذي يفهم maxJuz وحده. */
export function derivedLegacyMaxJuz(scope: QuranScope): number | undefined {
  const metrics = scopeMetrics(scope);
  const all = [...metrics.fullJuz, ...metrics.partialJuz];
  return all.length ? Math.max(...all) : undefined;
}

export const scopeUnitPresetIds = ['full_quran', 'custom'] as const;
export type ScopePresetId = typeof scopeUnitPresetIds[number];

export interface ScopePreset { id: ScopePresetId; ar: string; en: string; build: () => QuranScope }

/*
 * اختصارٌ واحد فقط: المصحف كاملًا.
 *
 * الاختصار اسمٌ للإنسان لا نوعٌ في النظام، ولا يفعل شيئًا سوى بناء نطاقٍ عادي قابل للتعديل.
 * وما عدا «المصحف كاملًا» — نصفٌ أو عشرةٌ أو جزء عمّ — لا يختصر شيئًا: شبكة الأجزاء تحته
 * تعطيه بضغطتين، فوجوده زحامٌ في الشاشة لا تسهيل. ولا يوجد في الكود فرعٌ شرطي واحد
 * يتصرف بحسب اسم الاختصار.
 */
export const SCOPE_PRESETS: ScopePreset[] = [
  { id: 'full_quran', ar: 'المصحف كاملًا', en: 'Complete Quran', build: () => fullQuranScope() },
];

export function scopePresetById(id: string): ScopePreset | undefined {
  return SCOPE_PRESETS.find(p => p.id === id);
}

/** كل المواضع (surah/ayah) داخل النطاق. تُستعمل حيث يلزم المرور الفعلي على المواضع. */
export function* scopeLoci(scope: QuranScope): Generator<QuranLocus> {
  for (const [from, to] of scopeRanges(scope)) for (let ordinal = from; ordinal <= to; ordinal++) yield ordinalToLocus(ordinal);
}

export { ayahOrdinal, ordinalToLocus, surahStartLocus, surahEndLocus, juzOfLocus, pageOfLocus, ayahCountOf, surahName, isValidLocus };
