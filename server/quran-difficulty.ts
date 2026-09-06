/**
 * MIZAN — متجه صعوبة الموضع وموازنة حزم السحب
 *
 * القرعة العشوائية تضمن الحياد، لا التكافؤ: قد يقع متسابق على مقطع سلس ومنافسه على مقطع مكتظ
 * بالمتشابهات والكلمات النادرة. هذا المحرك يقيس «الطاقة الذهنية» للموضع ليتيح سحبًا متكافئًا.
 *
 * المتجه أربعة أبعاد، كلها **معدودة من النص المعتمد** — لا تقدير بشري ولا وزن مُختلق:
 *   1) mutashabihat — كثافة المقاطع المتكررة في المصحف (فخّ الالتباس).
 *   2) rareWords    — وعورة المفردات: نسبة الكلمات نادرة التكرار في عموم المصحف.
 *   3) endingSimilarity — تقارب أواخر الآيات داخل المقطع (يُغري بالقفز بين الآيات).
 *   4) waqfSensitivity — كثافة علامات الوقف المطبوعة في نص المقطع نفسه.
 *
 * الوزن الافتراضي متساوٍ تقريبًا مع ترجيح للمتشابهات لأنها أكثر ما يُسقط الحفظة عمليًا.
 * الأوزان معاملات ظاهرة وقابلة للضبط من لجنة علمية — لا تُخفى داخل الشيفرة.
 *
 * حدّ صريح: هذا مؤشر **تكافؤ سحب**، وليس حكمًا على المتسابق ولا مُدخلًا في الدرجة.
 */

import { MutashabihatEngine, normalizeQuranWord } from './quran-mutashabihat';

export interface DifficultyVector {
  mutashabihat: number;      // 0..1
  rareWords: number;         // 0..1
  endingSimilarity: number;  // 0..1
  waqfSensitivity: number;   // 0..1
  /** الحاصل المرجّح 0..1 */
  score: number;
}

export interface DifficultyWeights { mutashabihat: number; rareWords: number; endingSimilarity: number; waqfSensitivity: number }
export const DEFAULT_DIFFICULTY_WEIGHTS: DifficultyWeights = { mutashabihat: 0.40, rareWords: 0.25, endingSimilarity: 0.20, waqfSensitivity: 0.15 };

/** علامات الوقف المطبوعة الرسمية — تُقرأ كما هي من النص، ولا يُخترع منها حكم. */
const WAQF_MARKS = /[ۖ-ۛۚۘۗۙ]/g;

export class DifficultyEngine {
  private readonly wordFreq = new Map<string, number>();
  private readonly rowsBySurah = new Map<number, any[]>();

  constructor(private readonly rows: any[], private readonly mutashabihat: MutashabihatEngine, private readonly weights: DifficultyWeights = DEFAULT_DIFFICULTY_WEIGHTS) {
    for (const r of rows) {
      const s = Number(r.sora);
      const list = this.rowsBySurah.get(s);
      if (list) list.push(r); else this.rowsBySurah.set(s, [r]);
      for (const w of String(r.aya_text || '').split(/\s+/)) {
        const n = normalizeQuranWord(w);
        if (!n) continue;
        this.wordFreq.set(n, (this.wordFreq.get(n) || 0) + 1);
      }
    }
  }

  private ayatOf(surah: number, startAyah: number, endAyah: number) {
    return (this.rowsBySurah.get(surah) || []).filter((r) => Number(r.aya_no) >= startAyah && Number(r.aya_no) <= endAyah).sort((a, b) => Number(a.aya_no) - Number(b.aya_no));
  }

  /** نسبة الكلمات التي لا تتكرر في المصحف إلا قليلًا (عتبة 5 مرات فأقل). */
  private rareWordRatio(ayat: any[]): number {
    let total = 0, rare = 0;
    for (const r of ayat) for (const w of String(r.aya_text || '').split(/\s+/)) {
      const n = normalizeQuranWord(w);
      if (!n) continue;
      total++;
      if ((this.wordFreq.get(n) || 0) <= 5) rare++;
    }
    return total ? rare / total : 0;
  }

  /** تقارب أواخر الآيات: نسبة الآيات التي تشترك مع أختها في آخر كلمة مطبّعة أو في قافيتها. */
  private endingSimilarity(ayat: any[]): number {
    if (ayat.length < 2) return 0;
    const endings = ayat.map((r) => {
      const words = String(r.aya_text || '').split(/\s+/).map(normalizeQuranWord).filter(Boolean);
      return words[words.length - 1] || '';
    });
    let similar = 0;
    for (let i = 1; i < endings.length; i++) {
      const a = endings[i], b = endings[i - 1];
      if (!a || !b) continue;
      if (a === b) { similar++; continue; }
      const tail = (x: string) => x.slice(-2);
      if (tail(a) && tail(a) === tail(b)) similar++;
    }
    return similar / (endings.length - 1);
  }

  private waqfSensitivity(ayat: any[]): number {
    let marks = 0, words = 0;
    for (const r of ayat) {
      const text = String(r.aya_text || '');
      marks += (text.match(WAQF_MARKS) || []).length;
      words += text.split(/\s+/).filter((w) => normalizeQuranWord(w)).length;
    }
    if (!words) return 0;
    // التطبيع: علامة وقف لكل 12 كلمة تُعدّ كثافة عالية (1.0)
    return Math.min(1, (marks / words) * 12);
  }

  vector(surah: number, startAyah: number, endAyah: number): DifficultyVector {
    const ayat = this.ayatOf(surah, startAyah, endAyah);
    if (!ayat.length) return { mutashabihat: 0, rareWords: 0, endingSimilarity: 0, waqfSensitivity: 0, score: 0 };
    const m = this.mutashabihat.passageMutashabihatDensity(surah, startAyah, endAyah).density;
    const mutashabihat = Math.min(1, m);
    const rareWords = Math.min(1, this.rareWordRatio(ayat) * 2.5); // التطبيع: 40% كلمات نادرة = أقصى وعورة
    const endingSimilarity = this.endingSimilarity(ayat);
    const waqfSensitivity = this.waqfSensitivity(ayat);
    const w = this.weights;
    const score = mutashabihat * w.mutashabihat + rareWords * w.rareWords + endingSimilarity * w.endingSimilarity + waqfSensitivity * w.waqfSensitivity;
    return { mutashabihat, rareWords, endingSimilarity, waqfSensitivity, score: Math.min(1, score) };
  }
}

/**
 * موازنة حزم السحب بين المتسابقين.
 *
 * تُولَّد حزم مرشّحة (كل حزمة = مقاطع متسابق واحد)، ثم تُختار توليفة تُقارب تساوي مجموع الصعوبة.
 * التقارب يُقاس بأقصى انحراف نسبي عن المتوسط، ويُعلن صراحةً — فإن تعذّر بلوغ الهدف قيل ذلك،
 * ولا يُدّعى تكافؤ لم يتحقق.
 */
export interface BalancedPack<T> { items: T[]; totalDifficulty: number }
export function balancePacks<T>(candidatePacks: BalancedPack<T>[], packsNeeded: number, options: { toleranceRatio?: number; maxIterations?: number } = {}) {
  const tolerance = options.toleranceRatio ?? 0.005; // 0.5%
  if (candidatePacks.length < packsNeeded) return { packs: candidatePacks, achieved: false, spreadRatio: 1, tolerance };
  const sorted = [...candidatePacks].sort((a, b) => a.totalDifficulty - b.totalDifficulty);
  let best: { packs: BalancedPack<T>[]; spread: number } | null = null;
  // نافذة منزلقة: أقرب `packsNeeded` حزمة في الصعوبة هي أقلها تباينًا.
  for (let i = 0; i + packsNeeded <= sorted.length; i++) {
    const window = sorted.slice(i, i + packsNeeded);
    const mean = window.reduce((n, p) => n + p.totalDifficulty, 0) / packsNeeded;
    if (mean <= 0) continue;
    const spread = Math.max(...window.map((p) => Math.abs(p.totalDifficulty - mean))) / mean;
    if (!best || spread < best.spread) best = { packs: window, spread };
  }
  if (!best) return { packs: sorted.slice(0, packsNeeded), achieved: false, spreadRatio: 1, tolerance };
  return { packs: best.packs, achieved: best.spread <= tolerance, spreadRatio: best.spread, tolerance };
}
