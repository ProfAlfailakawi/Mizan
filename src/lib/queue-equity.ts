import type { Participant } from '../types';
import { queueOrderValue } from './judging-integrity';

/*
 * عدالة الانتظار عند النقل.
 *
 * المشهد الذي تعالجه هذه الوحدة يقع في كل قاعة: متسابقٌ في اللجنة الثالثة صار الثاني في
 * طابورها بعد أن انتظر خمسين دقيقة، ثم يُنقل استثناءً إلى اللجنة الثانية — فيجد أمامه
 * عشرة. انتظر خمسين دقيقة ثم بدأ من جديد.
 *
 * والنظام كان يعرف طريقتين للنقل، وكلتاهما تظلمه هنا:
 *
 *   • **حفظ الأسبقية** (`PRESERVE_ORIGINAL_TURN`) يدمج الطابورين برقم الوصول الأصلي. وهو
 *     عدلٌ حين يكون الوصول هو المقياس — لكنه لا يرى شيئًا مما جرى بعد الوصول. فمن وصل
 *     الثامنة وانتظر ساعةً يقع خلف من وصل السابعة ولم ينتظر إلا عشر دقائق، لأن اللجنة
 *     الأولى كانت بطيئة والثانية سريعة. الرقم نفسه، والانتظار مختلف.
 *   • **آخر الطابور** (`MOVE_TO_END`) تنازلٌ صريح، ولا يصلح لمن لم يطلب النقل أصلًا.
 *
 * فالعملة هنا ليست **متى وصل** بل **كم انتظر**. من انتظر خمسين دقيقة يتقدّم على من انتظر
 * عشرًا، لأن الانتظار هو ما دفعه فعلًا — لا الساعة التي دخل فيها من الباب.
 *
 * وهذا **يخالف ترتيب الوصول عمدًا**، فلا يُطبَّق صامتًا: يُحسب، ويُعرض على المشرف بالأرقام
 * قبل التنفيذ، ويُسجَّل سببه، ويُقال للمتسابق ما جرى ولماذا.
 */

export const QUEUE_EQUITY_VERSION = 'MIZAN-QUEUE-EQUITY-1';

/**
 * كم انتظر هذا المتسابق فعلًا، بالدقائق.
 *
 * من لحظة دخوله الطابور لا من لحظة تسجيله: المصدر `checkedInAt`، وإن غاب فآخر لحظةٍ صار
 * فيها `in_queue` من تاريخ حالته. وغيابهما معًا يعني صفرًا — لا نخترع انتظارًا لا نعرفه.
 */
export function accruedWaitMinutes(p: Participant, now: Date = new Date()): number {
  const fromHistory = [...(p.statusHistory || [])]
    .filter(h => h.status === 'in_queue' && h.timestamp)
    .map(h => Date.parse(h.timestamp))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0];
  const checkedIn = p.checkedInAt ? Date.parse(p.checkedInAt) : NaN;
  const started = Number.isFinite(checkedIn) ? checkedIn : fromHistory;
  if (!Number.isFinite(started)) return 0;
  /* ساعةُ الجهاز قد تسبق الطابع، فالانتظار السالب يُقصّ إلى صفر بدل أن يُعرض بالسالب. */
  return Math.max(0, Math.round((now.getTime() - (started as number)) / 60000));
}

export interface EquityRecommendation {
  version: string;
  participantId: string;
  /** ما انتظره قبل النقل. */
  waitedMinutes: number;
  /** عدد المنتظرين في اللجنة الهدف قبل إضافته. */
  targetQueueLength: number;
  /** موضعه لو أُلحق بآخر الطابور — وهو ما يشعر به كظلم. */
  positionIfAppended: number;
  /** موضعه الذي يستحقّه بانتظاره. */
  fairPosition: number;
  /** كم مركزًا يستردّه العدلُ له. */
  positionsRecovered: number;
  /** من يتقدّمهم: كلٌّ منهم انتظر أقلّ منه. */
  passes: { participantId: string; waitedMinutes: number }[];
  /** مفتاح الترتيب الذي يضعه في موضعه العادل. */
  orderKey: number;
  reasonArabic: string;
  reasonEnglish: string;
}

/**
 * موضعه العادل في الطابور الهدف: خلف كل من انتظر مثله أو أكثر، وأمام كل من انتظر أقلّ.
 *
 * والتساوي يبقى للمقيم لا للقادم: من كان في اللجنة أصلًا وانتظر المدة نفسها لا يُزحزح —
 * فالنقل لا يُكسِب صاحبه أفضلية على نظيره، وإنما يمنعه الخسارة.
 */
export function recommendFairPosition(input: {
  mover: Participant;
  targetQueue: Participant[];
  now?: Date;
}): EquityRecommendation {
  const { mover, now = new Date() } = input;
  const queue = [...input.targetQueue]
    .filter(p => p.id !== mover.id)
    .sort((a, b) => queueOrderValue(a) - queueOrderValue(b));

  const waitedMinutes = accruedWaitMinutes(mover, now);
  const waits = queue.map(p => ({ p, waited: accruedWaitMinutes(p, now) }));

  /* أوّل من انتظر أقلّ منه: هناك موضعه. والتساوي يبقى لصاحب المكان. */
  let index = waits.findIndex(x => x.waited < waitedMinutes);
  if (index === -1) index = waits.length;

  const passes = waits.slice(index).map(x => ({ participantId: x.p.id, waitedMinutes: x.waited }));
  const fairPosition = index + 1;
  const positionIfAppended = queue.length + 1;

  return {
    version: QUEUE_EQUITY_VERSION,
    participantId: mover.id,
    waitedMinutes,
    targetQueueLength: queue.length,
    positionIfAppended,
    fairPosition,
    positionsRecovered: Math.max(0, positionIfAppended - fairPosition),
    passes,
    orderKey: orderKeyForPosition(queue, fairPosition),
    reasonArabic: passes.length
      ? `انتظر ${waitedMinutes} دقيقة قبل النقل، فيتقدّم على ${passes.length} ممن انتظروا أقلّ منه، ويصير رقم ${fairPosition} بدل ${positionIfAppended}.`
      : `انتظر ${waitedMinutes} دقيقة، ولم ينتظر أحدٌ في اللجنة الهدف أقلّ منه — فموضعه آخر الطابور بلا تنازل.`,
    reasonEnglish: passes.length
      ? `Waited ${waitedMinutes} min before the move, so he goes ahead of ${passes.length} who waited less — position ${fairPosition} instead of ${positionIfAppended}.`
      : `Waited ${waitedMinutes} min, and nobody in the target queue waited less — the tail is already his fair place.`,
  };
}

/**
 * مفتاح ترتيبٍ يضع صاحبه في الموضع المطلوب من طابورٍ مرتَّب.
 *
 * المفاتيح أعدادٌ لا رُتب، فالإدراج بينهما يكون بمنتصف ما قبله وما بعده — ولا حاجة إلى
 * إعادة ترقيم الطابور كلّه، وهو ما كان سيغيّر مفاتيح أناسٍ لا شأن لهم بالنقل.
 */
export function orderKeyForPosition(sortedQueue: Participant[], position: number): number {
  const keys = sortedQueue.map(queueOrderValue).filter(Number.isFinite);
  const at = Math.max(1, Math.min(position, keys.length + 1));
  if (!keys.length) return 1;
  if (at === 1) return keys[0] - 1;
  if (at > keys.length) return keys[keys.length - 1] + 1;
  const before = keys[at - 2];
  const after = keys[at - 1];
  /* مفتاحان متلاصقان لا منتصف بينهما: خُذ ما قبله وأزِح قليلًا، فالترتيب النسبي يكفي. */
  return after > before ? (before + after) / 2 : before + 0.5;
}

/**
 * هل يستحقّ هذا النقل تعويضًا أصلًا؟
 *
 * نقلٌ لا يُخسِر صاحبه مركزًا لا يحتاج استثناءً على ترتيب الوصول — والاستثناء الذي لا
 * يلزم لا يُطبَّق، فكل تعويضٍ يُقدَّم يُخصم من يقين الآخرين في الطابور.
 */
export function equityWarranted(rec: EquityRecommendation): boolean {
  return rec.positionsRecovered > 0;
}
