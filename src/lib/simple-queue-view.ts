import type { DisplayBoard } from './display-board';

/*
 * العرض المبسّط لوليّ الأمر والمتسابق الصغير: سؤالٌ واحد يُجاب بخطٍّ كبير — «متى دوري؟».
 *
 * لا مصدر بيانات جديد: رحلة المتسابق (رابط القدرة الخاص، يحلّه الخادم) تقول حالته ولجنته
 * وكوده، وشاشة القاعة المنشورة (`public_boards`، أكوادٌ فقط) تقول من يُنادى الآن ومن التالي
 * في كل لجنة وزمنها التقريبي. فيُجمع الاثنان هنا بلا أن يخرج اسمُ متسابقٍ آخر أو بياناته.
 */

export type SimpleQueueStage = 'before' | 'waiting' | 'called' | 'done' | 'unknown';

export interface SimpleQueueJourneyInput {
  status: string;
  participantCode: string;
  committee?: { code: string; hall?: string | null } | null;
  queueNumber?: number | null;
}

export interface SimpleQueueState {
  stage: SimpleQueueStage;
  committeeCode: string | null;
  hall: string | null;
  /** موضعه في طابور لجنته (من واحد) إن ظهر في الإسقاط المنشور. */
  position: number | null;
  /** عدد المنتظرين في طابور لجنته، إن عُرف. */
  waitingCount: number | null;
  /** تقدير بالدقائق — لا وعد. */
  estimatedWaitMinutes: number | null;
  /** التقدير حدٌّ أعلى (موضعه خارج ما يعرضه الإسقاط). */
  estimateIsUpperBound: boolean;
}

const BEFORE = new Set(['draft', 'submitted', 'under_review', 'approved', 'checked_in']);
const DONE = new Set(['tested', 'appealed', 'certified']);

const sameCode = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export function deriveSimpleQueueState(journey: SimpleQueueJourneyInput, board: DisplayBoard | null): SimpleQueueState {
  const code = journey.participantCode;
  const committeeCode = journey.committee?.code || null;
  const slice = board?.committees.find((c) => (committeeCode && sameCode(c.code, committeeCode))
    || sameCode(c.nowCalling?.code, code)
    || c.next.some((n) => sameCode(n.code, code))) || null;
  const base: SimpleQueueState = {
    stage: 'unknown',
    committeeCode: slice?.code || committeeCode,
    hall: journey.committee?.hall || slice?.venueHall || null,
    position: null,
    waitingCount: slice ? slice.waitingCount : null,
    estimatedWaitMinutes: null,
    estimateIsUpperBound: false,
  };

  if (journey.status === 'in_session' || (slice && sameCode(slice.nowCalling?.code, code))) {
    return { ...base, stage: 'called', waitingCount: null };
  }
  if (DONE.has(journey.status)) return { ...base, stage: 'done', waitingCount: null };
  if (BEFORE.has(journey.status)) return { ...base, stage: 'before', waitingCount: null };
  if (journey.status !== 'in_queue') return base;

  if (!slice) return { ...base, stage: 'waiting' };
  const avg = Math.max(1, Number(slice.averageSessionMinutes) || 1);
  const slot = slice.next.find((n) => sameCode(n.code, code));
  if (slot) {
    /*
     * زمن اللجنة المنشور = بقية الجلسة الجارية + المنتظرون كلّهم × المتوسّط. فبقية الجلسة
     * تُستخرج منه، ويُضاف إليها من يسبقه وحده.
     */
    const remaining = Math.max(0, slice.estimatedWaitMinutes - slice.waitingCount * avg);
    return {
      ...base,
      stage: 'waiting',
      position: slot.position,
      estimatedWaitMinutes: Math.max(0, Math.round(remaining + (slot.position - 1) * avg)),
    };
  }
  /* موضعه أبعد مما ينشره الإسقاط: يُقال زمن اللجنة كاملًا حدًّا أعلى، لا رقمًا مخترعًا. */
  return {
    ...base,
    stage: 'waiting',
    estimatedWaitMinutes: slice.waitingCount ? Math.max(0, Math.round(slice.estimatedWaitMinutes)) : null,
    estimateIsUpperBound: slice.waitingCount > 0,
  };
}
