/**
 * MIZAN — محرك المتشابهات اللفظية (رجعي + استباقي)
 *
 * يُشتق كل شيء هنا **من نص المصحف المعتمد للرواية نفسها**، بلا قاعدة خارجية وبلا أرقام مُقدَّرة:
 * التشابه واقعة نصية قابلة لإعادة الحساب والتدقيق، لا تقدير احتمالي.
 *
 * ما يفعله:
 *  1) فهرس المقاطع: يطبّع النص (تجريد الضبط وتوحيد الهمزات وحذف أرقام الآيات) ثم يفهرس كل
 *     تتابع من N كلمة، فيُعرف أين تكرر المقطع نفسه في المصحف.
 *  2) رادار رجعي: عند موضع معيّن، أين المواضع الأخرى التي تشترك معه في مقطع مطابق.
 *  3) شجرة التفرّع الاستباقية: داخل مقطع الاختبار، أين نقاط الافتراق القادمة — أي الكلمة التي
 *     يتطابق ما قبلها مع موضع آخر ثم يختلف عندها — مع بيان الكلمة الفارقة في كل مسار.
 *
 * حدود صريحة (تُحترم ولا تُتجاوز):
 *  - لا يُنسب للمتسابق «احتمال وقوع» ولا «نسبة انجذاب»: لا توجد بيانات سلوكية تُسندها، واختلاق
 *    نسبة يوهم بدقة غير موجودة. تُعرض الوقائع: عدد التكرارات، المواضع، والكلمة الفارقة.
 *  - لا يعبر التحليل بين الروايات: كل رواية تُفهرس من حزمتها وحدها.
 *  - هذا محرك تنبيه لرئيس التحكيم؛ لا يرصد خطأ ولا يمسّ درجة.
 */

export interface MutashabihatOccurrence { surah: number; ayah: number; wordIndex: number; page?: number }
export interface MutashabihatMatch {
  phrase: string;
  wordCount: number;
  occurrences: MutashabihatOccurrence[];
  totalOccurrences: number;
}
export interface DivergenceBranch {
  /** الموضع المنافس الذي يشترك مع الموضع الحالي في المقطع السابق للمفترق. */
  at: MutashabihatOccurrence;
  /** الكلمة التي تلي المقطع المشترك في ذلك الموضع — أي المسار البديل. */
  nextWord: string;
  surahNameArabic?: string;
}
export interface DivergencePoint {
  /** موضع الافتراق داخل مقطع الاختبار. */
  surah: number; ayah: number; wordIndex: number;
  /** المقطع المشترك الذي يسبق الافتراق مباشرة. */
  sharedPhrase: string;
  sharedWordCount: number;
  /** الكلمة الصحيحة في مسار المتسابق. */
  expectedWord: string;
  /** المسارات المنافسة التي تشترك في المقطع نفسه ثم تفترق. */
  branches: DivergenceBranch[];
}

const AR_DIGITS = /[٠-٩۰-۹]/g;
// علامات الضبط والوقف والرموز المصحفية — تُجرَّد للمطابقة النصية فقط، ولا يُمسّ النص المعروض.
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭ۟۠ـ]/g;

export function normalizeQuranWord(raw: string): string {
  return raw
    .replace(AR_DIGITS, '')
    .replace(MARKS, '')
    .replace(/[آأإٱ]/g, 'ا') // آ أ إ ٱ → ا
    .replace(/ة/g, 'ه')                     // ة → ه
    .replace(/[ى]/g, 'ي')                   // ى → ي
    .replace(/[^ء-ي]/g, '')
    .trim();
}

export interface IndexedWord { surah: number; ayah: number; wordIndex: number; page?: number; raw: string; norm: string }

/** يفكّك حزمة الرواية إلى كلمات مفهرسة بمواضعها. */
export function buildWordIndex(rows: any[]): IndexedWord[] {
  const out: IndexedWord[] = [];
  for (const r of rows) {
    const surah = Number(r.sora), ayah = Number(r.aya_no), page = Number(r.page);
    const words = String(r.aya_text || '').split(/\s+/).filter(Boolean);
    let wi = 0;
    for (const w of words) {
      const norm = normalizeQuranWord(w);
      if (!norm) continue; // رقم الآية أو رمز مصحفي بحت
      out.push({ surah, ayah, wordIndex: wi, page, raw: w, norm });
      wi++;
    }
  }
  return out;
}

/** فهرس المقاطع: مفتاحه تتابع N كلمة مطبّعة، وقيمته مواضع بدايته. */
export function buildPhraseIndex(words: IndexedWord[], n: number): Map<string, number[]> {
  const index = new Map<string, number[]>();
  for (let i = 0; i + n <= words.length; i++) {
    // لا يعبر المقطع حدود السورة
    if (words[i].surah !== words[i + n - 1].surah) continue;
    let key = '';
    for (let k = 0; k < n; k++) key += (k ? ' ' : '') + words[i + k].norm;
    const bucket = index.get(key);
    if (bucket) bucket.push(i); else index.set(key, [i]);
  }
  return index;
}

export class MutashabihatEngine {
  private readonly words: IndexedWord[];
  private readonly indexes = new Map<number, Map<string, number[]>>();
  constructor(rows: any[], private readonly phraseSizes: number[] = [3, 4, 5]) {
    this.words = buildWordIndex(rows);
    for (const n of phraseSizes) this.indexes.set(n, buildPhraseIndex(this.words, n));
  }

  get wordCount() { return this.words.length; }

  private positionsOfAyah(surah: number, ayah: number) {
    const start = this.words.findIndex((w) => w.surah === surah && w.ayah === ayah);
    if (start < 0) return { start: -1, end: -1 };
    let end = start;
    while (end + 1 < this.words.length && this.words[end + 1].surah === surah && this.words[end + 1].ayah === ayah) end++;
    return { start, end };
  }

  /**
   * رادار رجعي: المقاطع داخل الآية التي تتكرر حرفيًا في مواضع أخرى من المصحف.
   * يُفضَّل أطول مقطع مطابق، فالمقاطع الأطول أدلّ على التشابه المُلبِس.
   */
  similarPhrasesForAyah(surah: number, ayah: number, options: { maxMatches?: number } = {}): MutashabihatMatch[] {
    const { start, end } = this.positionsOfAyah(surah, ayah);
    if (start < 0) return [];
    const results: MutashabihatMatch[] = [];
    const covered = new Set<number>();
    const sizes = [...this.phraseSizes].sort((a, b) => b - a); // الأطول أولًا
    for (const n of sizes) {
      const index = this.indexes.get(n)!;
      for (let i = start; i + n - 1 <= end; i++) {
        if (covered.has(i)) continue;
        let key = '';
        for (let k = 0; k < n; k++) key += (k ? ' ' : '') + this.words[i + k].norm;
        const hits = index.get(key);
        if (!hits || hits.length < 2) continue;
        const others = hits.filter((h) => !(this.words[h].surah === surah && this.words[h].ayah === ayah));
        if (!others.length) continue;
        for (let k = 0; k < n; k++) covered.add(i + k);
        results.push({
          phrase: this.words.slice(i, i + n).map((w) => w.raw).join(' '),
          wordCount: n,
          totalOccurrences: hits.length,
          occurrences: others.slice(0, options.maxMatches ?? 6).map((h) => ({ surah: this.words[h].surah, ayah: this.words[h].ayah, wordIndex: this.words[h].wordIndex, page: this.words[h].page })),
        });
      }
    }
    return results.sort((a, b) => b.wordCount - a.wordCount);
  }

  /**
   * شجرة التفرّع الاستباقية لمقطع الاختبار.
   *
   * لكل موضع داخل المقطع: إن تطابق ما قبله (N كلمة) مع موضع آخر في المصحف ثم اختلفت الكلمة
   * التالية، فذلك مفترق حقيقي — يُعرض قبل أن يبلغه المتسابق.
   */
  divergencePoints(surah: number, startAyah: number, endAyah: number, options: { phraseSize?: number; maxBranches?: number; nameOf?: (s: number) => string | undefined } = {}): DivergencePoint[] {
    const n = options.phraseSize ?? 4;
    const index = this.indexes.get(n);
    if (!index) return [];
    const from = this.positionsOfAyah(surah, startAyah).start;
    const to = this.positionsOfAyah(surah, endAyah).end;
    if (from < 0 || to < 0) return [];

    const points: DivergencePoint[] = [];
    for (let i = from; i + n <= to + 1; i++) {
      if (i + n >= this.words.length) break;
      let key = '';
      for (let k = 0; k < n; k++) key += (k ? ' ' : '') + this.words[i + k].norm;
      const hits = index.get(key);
      if (!hits || hits.length < 2) continue;

      const expected = this.words[i + n];
      if (!expected || expected.surah !== surah) continue;

      const branches: DivergenceBranch[] = [];
      for (const h of hits) {
        if (h === i) continue;
        const alt = this.words[h + n];
        if (!alt || alt.surah !== this.words[h].surah) continue;
        if (alt.norm === expected.norm) continue; // مسار متطابق: ليس مفترقًا
        branches.push({ at: { surah: this.words[h].surah, ayah: this.words[h].ayah, wordIndex: this.words[h].wordIndex, page: this.words[h].page }, nextWord: alt.raw, surahNameArabic: options.nameOf?.(this.words[h].surah) });
        if (branches.length >= (options.maxBranches ?? 4)) break;
      }
      if (!branches.length) continue;

      points.push({
        surah: expected.surah, ayah: expected.ayah, wordIndex: expected.wordIndex,
        sharedPhrase: this.words.slice(i, i + n).map((w) => w.raw).join(' '),
        sharedWordCount: n,
        expectedWord: expected.raw,
        branches,
      });
      i += n - 1; // لا نكرر المفترق نفسه لكل إزاحة
    }
    return points;
  }

  /** كثافة التشابه في مقطع — مُدخل لمتجه الصعوبة. واقعة معدودة، لا تقدير. */
  passageMutashabihatDensity(surah: number, startAyah: number, endAyah: number): { matches: number; words: number; density: number } {
    const from = this.positionsOfAyah(surah, startAyah).start;
    const to = this.positionsOfAyah(surah, endAyah).end;
    if (from < 0 || to < 0) return { matches: 0, words: 0, density: 0 };
    const n = 4;
    const index = this.indexes.get(n);
    if (!index) return { matches: 0, words: to - from + 1, density: 0 };
    let matches = 0;
    for (let i = from; i + n <= to + 1; i++) {
      let key = '';
      for (let k = 0; k < n; k++) key += (k ? ' ' : '') + this.words[i + k].norm;
      const hits = index.get(key);
      if (hits && hits.length > 1) matches++;
    }
    const words = to - from + 1;
    return { matches, words, density: words ? matches / words : 0 };
  }
}
