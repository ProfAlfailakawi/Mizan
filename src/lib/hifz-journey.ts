/*
 * «رحلةُ حفظك» — ما تقوله محاولاتُ الطالب المحفوظةُ في جهازه عن حفظه كلِّه.
 *
 * ثلاثةُ أجوبة، كلُّها من ذاكرة الجهاز وحده (لا صوت، ولا خادم، ولا درجة):
 *   ١) **خريطةُ المصحف**: كلُّ صفحةٍ تُليت: متينة، أو تحتاج مراجعة، أو ضعيفة — والباقي لم يُقرأ.
 *   ٢) **السلسلة**: أيّامٌ متتالية فيها تلاوة، حتى اليوم أو أمس.
 *   ٣) **كلماتُك الصعبة**: الكلماتُ التي تكرّر تعثّرك فيها، مرتّبةً بثقلها وحداثتها.
 *
 * والحكمُ هنا ميلٌ للمراجعة لا شهادة: «ضعيفة» تعني «أعِد إليها»، لا «لا تحفظها».
 */
import { attemptBurden, DEFAULT_FACE_MEMORY, WORD_WEIGHT, type AttemptWordKind, type FaceAttempt } from './face-memory';

export type PageState = 'strong' | 'review' | 'weak';

export interface PageMemory { state: PageState; attempts: number; lastAt: number; burden: number }

/* حدودُ الحال — من الوزن المتضائل نفسِه الذي يختار الوجهَ التالي، فلا تقول الخريطةُ غيرَ ما يفعله السحب. */
export const WEAK_BURDEN = 2;
export const REVIEW_BURDEN = 0.6;
/* وجهٌ لم يُتلَ منذ ثلاثة أسابيع يحتاج مراجعةً وإن كان متينًا — فالحفظُ يُنسى بالترك. */
export const STALE_DAYS = 21;

const DAY = 86_400_000;
const valid = (a: FaceAttempt, now: number) => {
  const at = Date.parse(a.at);
  return Number.isFinite(at) && at <= now ? at : null;
};

export function pageMemory(attempts: readonly FaceAttempt[], now: number): Map<number, PageMemory> {
  const out = new Map<number, PageMemory>();
  for (const a of attempts) {
    const at = valid(a, now);
    if (at === null) continue;
    const decay = Math.pow(0.5, (now - at) / DAY / DEFAULT_FACE_MEMORY.halfLifeDays);
    const m = out.get(a.page) ?? { state: 'strong' as PageState, attempts: 0, lastAt: 0, burden: 0 };
    m.attempts += 1;
    m.lastAt = Math.max(m.lastAt, at);
    m.burden += attemptBurden(a) * decay;
    out.set(a.page, m);
  }
  for (const m of out.values()) {
    m.state = m.burden >= WEAK_BURDEN ? 'weak'
      : m.burden >= REVIEW_BURDEN || now - m.lastAt > STALE_DAYS * DAY ? 'review'
      : 'strong';
  }
  return out;
}

/** مفتاحُ اليوم بتوقيت الجهاز — فالسلسلةُ تُعدّ بأيّام الطالب لا بأيّام غرينتش. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** أيّامٌ متتاليةٌ فيها تلاوة، تنتهي اليومَ أو أمس (فلا تنقطع السلسلةُ صباحًا قبل أن يقرأ). */
export function streakDays(attempts: readonly FaceAttempt[], now: number): number {
  const days = new Set<string>();
  for (const a of attempts) { const at = valid(a, now); if (at !== null) days.add(dayKey(at)); }
  let cursor = new Date(now);
  if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(cursor.getTime()))) { n += 1; cursor.setDate(cursor.getDate() - 1); }
  return n;
}

export interface HardWord {
  page: number; index: number; surah: number; ayah: number; text: string;
  times: number; lastAt: number; score: number; kinds: AttemptWordKind[];
}

/**
 * الكلماتُ التي تكرّر التعثّرُ فيها — مرّتين على الأقلّ في محاولاتٍ مختلفة.
 *
 * مرّةٌ واحدةٌ قد تكون سهوًا أو ضجيجًا؛ والتكرارُ هو الدليل. وتُرتَّب بثقلٍ متضائل، فكلمةٌ
 * تعثّرتَ فيها قديمًا ثم أتقنتها تنزل وحدها.
 */
export function hardWords(attempts: readonly FaceAttempt[], now: number, limit = 8): HardWord[] {
  const byWord = new Map<string, HardWord & { at: Set<string> }>();
  for (const a of attempts) {
    const at = valid(a, now);
    if (at === null) continue;
    const decay = Math.pow(0.5, (now - at) / DAY / DEFAULT_FACE_MEMORY.halfLifeDays);
    for (const w of a.words ?? []) {
      const key = `${a.page}:${w.i}`;
      const h = byWord.get(key) ?? { page: a.page, index: w.i, surah: w.s, ayah: w.a, text: w.t, times: 0, lastAt: 0, score: 0, kinds: [], at: new Set<string>() };
      if (!h.at.has(a.at)) { h.at.add(a.at); h.times += 1; }
      h.lastAt = Math.max(h.lastAt, at);
      h.score += Math.max(0.3, WORD_WEIGHT[w.k] ?? 0.3) * decay;
      if (!h.kinds.includes(w.k)) h.kinds.push(w.k);
      byWord.set(key, h);
    }
  }
  return [...byWord.values()]
    .filter(h => h.times >= 2)
    .sort((x, y) => y.score - x.score || y.lastAt - x.lastAt)
    .slice(0, limit)
    .map(({ at: _at, ...h }) => h);
}

export interface JourneySummary { pages: number; strong: number; review: number; weak: number; week: number; streak: number }

export function journeySummary(attempts: readonly FaceAttempt[], now: number): JourneySummary {
  const pages = pageMemory(attempts, now);
  const count = (s: PageState) => [...pages.values()].filter(m => m.state === s).length;
  const week = attempts.filter(a => { const at = valid(a, now); return at !== null && now - at < 7 * DAY; }).length;
  return { pages: pages.size, strong: count('strong'), review: count('review'), weak: count('weak'), week, streak: streakDays(attempts, now) };
}

/** بدايةُ كلّ جزءٍ في مصحف المدينة (١٥ سطرًا، ٦٠٤ صفحة) — لفواصل الخريطة. */
export const JUZ_START_PAGES: readonly number[] = [1, ...Array.from({ length: 29 }, (_, k) => 22 + 20 * k)];
