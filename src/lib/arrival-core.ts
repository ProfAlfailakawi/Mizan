import type { Committee, Participant } from '../types';

/*
 * بوابة الحضور: أوّل ما يعمل صباح المسابقة، وأقلّ ما يُغتفر فيه الخطأ.
 *
 * ثلاثة قرارات تُتّخذ عند كل مسح، وكلّها كانت مدفونة في المخزن بلا اختبارٍ يُشغّلها:
 *
 *   ١) هل هذا وصولٌ جديد أم مسحٌ مكرّر؟ متسابقٌ يمسح بطاقته مرّتين — أو يصوّر رمزه
 *      فيُمسح عند بوابةٍ أخرى — يجب ألّا يأخذ رقم دورٍ ثانيًا ولا أن تُعاد رحلته إلى
 *      البداية. وهذا أكثر ما يقع فعلًا في قاعةٍ مزدحمة.
 *   ٢) ما رقم دوره؟ يُشتقّ من أكبر رقمٍ قائم، لا من عدد الصفوف — فحذفُ متسابقٍ لا
 *      يُعيد رقمًا مُنح لغيره.
 *   ٣) أيّ لجنةٍ تستقبله؟ أقلّها حِملًا بين اللجان المؤهَّلة، ويُفصل التعادل بمتوسّط
 *      زمن الجلسة فتذهب إلى الأسرع.
 *
 * هنا القرار وحده، نقيًّا. والأثر — سجلّ التدقيق، والحفظ، وتاريخ الحالة — يبقى في
 * المخزن حيث ينتمي.
 */

/** الحالات التي تعني أن الرحلة بدأت فعلًا، فلا يُعاد ترقيمها. */
export const ARRIVED_STATUSES = ['in_queue', 'in_session', 'tested', 'certified'] as const;

/**
 * متى تُسنَد اللجنة.
 *
 * - `ON_ARRIVAL` — البوابة تُسند كل واصلٍ فور مسحه. الافتراض، وأبسطُ ما يعمل.
 * - `WAVES` — البوابة **لا تُسند**: يأخذ رقمه ويدخل الطابور، ثم تُوزَّع الدفعة كلّها
 *   مرّةً واحدة بقيود عدالةٍ ترى التركيبة. فالجشع يوزّع كل واصلٍ وحده، ولا يرى أن وفدًا
 *   كاملًا وقع تحت لجنةٍ واحدة إلا بعد فوات أوان التصحيح — إذ يصير كل تعديلٍ نقلًا يمسّ
 *   الأسبقية. وهذا ليس عطبًا في الانتظار: الرقم يُمنح عند الباب كما في كل نمط.
 * - `PRE_ASSIGNED` — اللجان أُسندت قبل اليوم، والبوابة تحترمها ولا تُسند من تلقائها.
 *   فمن وصل بلا إسنادٍ مسبق ثغرةُ إعداد تُعلَن، لا فراغٌ تملؤه البوابة بالتخمين.
 */
export type DistributionMode = 'ON_ARRIVAL' | 'WAVES' | 'PRE_ASSIGNED';

/** لماذا دخل الطابور بلا لجنة — والسبب يغيّر ما يُقال للمشرف وهل تُفتح حادثة. */
export type UnroutedReason =
  /** لا لجنة تحكم فئته: ثغرةُ إعداد تُفتح لها حادثة. */
  | 'no-eligible-committee'
  /** نمط الموجات: الإسناد مؤجَّل بالتصميم، وليس عطبًا ولا يُفتح له شيء. */
  | 'awaiting-wave'
  /** نمط الإسناد المسبق ولا إسناد له: ثغرةُ إعداد كذلك. */
  | 'missing-pre-assignment';

export type ArrivalDecision =
  | { kind: 'not-found' }
  | { kind: 'other-competition' }
  | { kind: 'duplicate'; reason: 'already-arrived' | 'already-numbered' }
  /**
   * وصل ولم يُسنَد. يأخذ رقمه ويدخل الطابور، ويقول `reason` **لماذا** — فالتأجيلُ
   * المقصود لا يُعامَل معاملة العطب. إبقاؤه خارج الطابور يخسره أسبقيته، وإسناده للجنةٍ
   * لا تحكم فئته يؤجّل الرفض إلى لحظة الجلسة — وهو أسوأ موضعٍ يُكتشف فيه.
   */
  | { kind: 'admit-unrouted'; queueNumber: number; originalQueueNumber: number; queueOrderKey: number; reason: UnroutedReason }
  | { kind: 'admit'; queueNumber: number; originalQueueNumber: number; queueOrderKey: number; assignedCommitteeId?: string };

/** أكبر رقم دورٍ مُنح في هذه المسابقة، أيًّا كان الحقل الذي حمله. */
export function highestQueueNumber(roster: Participant[], competitionId: string): number {
  return Math.max(0, ...roster
    .filter(p => p.competitionId === competitionId)
    .map(p => p.originalQueueNumber || p.queueNumber || 0));
}

export function highestQueueOrderKey(roster: Participant[], competitionId: string): number {
  return Math.max(0, ...roster
    .filter(p => p.competitionId === competitionId)
    .map(p => p.queueOrderKey || p.originalQueueNumber || p.queueNumber || 0));
}

/** حدٌّ أدنى لزمن الجلسة، فلا تصير لجنةٌ بمتوسّطٍ صفر بلا حِملٍ مهما طال طابورها. */
const MIN_SESSION_MINUTES = 1;

/**
 * حِمل اللجنة **بالدقائق لا بالرؤوس**.
 *
 * كان العدّ للرؤوس وحدها، فلجنةٌ متوسّط جلستها ست دقائق وأخرى أربع عشرة تبدوان
 * متساويتين عند طابورٍ متساوٍ — وهما في الزمن على الضعف. وعند عشر لجانٍ متفاوتة يتراكم
 * الخطأ إلى ساعات على من وقع في الأبطأ.
 *
 * وهذا هو المقياس نفسه الذي تحتكم إليه مرونة اللجان (`recommendCommitteeElasticity`)،
 * فلا يُسنِد الوصولُ إسنادًا تنقضه المرونة بعد دقائق.
 */
export function committeeLoadMinutes(committee: Committee, roster: Participant[], competitionId: string): number {
  const waiting = roster.filter(p =>
    p.competitionId === competitionId && p.assignedCommitteeId === committee.id && p.status === 'in_queue').length;
  return waiting * Math.max(MIN_SESSION_MINUTES, committee.averageSessionMinutes || 0);
}

/**
 * أقلّ اللجان حِملًا بالدقائق. لا لجنة ⇒ لا إسناد، ولا اختيارٌ عشوائي.
 *
 * وفضّ التعادل **حتميّ**: الأسرع جلسةً، ثم الأقلّ طابورًا، ثم الكود أبجديًا. الحتمية ليست
 * تجميلًا — قرارُ إسنادٍ لا يُعاد إنتاجه لا يُدقَّق، ولا يُجاب صاحبه إن سأل «لِمَ لجنتي هذه؟».
 */
export function leastLoadedCommittee(pool: Committee[], roster: Participant[], competitionId: string): string | undefined {
  if (!pool.length) return undefined;
  const waiting = (committeeId: string) => roster.filter(p =>
    p.competitionId === competitionId && p.assignedCommitteeId === committeeId && p.status === 'in_queue').length;
  return [...pool].sort((a, b) =>
    committeeLoadMinutes(a, roster, competitionId) - committeeLoadMinutes(b, roster, competitionId)
    || a.averageSessionMinutes - b.averageSessionMinutes
    || waiting(a.id) - waiting(b.id)
    || a.code.localeCompare(b.code)
  )[0]?.id;
}

/**
 * قرار البوابة عند مسحٍ واحد.
 *
 * `eligibleCommittees` هي اللجان المؤهَّلة لهذا المتسابق (فئةً ورواية وتعارضًا)، يقرّرها
 * المخزن لأنها تعتمد على سياسة المسابقة.
 *
 * و`fallbackCommittees` لا يُلجأ إليه إلا حين تأذن السياسة صراحةً (`ANY_AVAILABLE`).
 * كان يُستعمل دائمًا، وهو **لا يفلتر الفئة** — فيُسنَد المتسابق للجنةٍ لا تحكم فئته ثم
 * يُرفض عند بدء الجلسة. والاختبار هنا يوثّق النقيض منذ البداية: «لا لجنة خيرٌ من لجنةٍ خطأ».
 */
export function decideArrival(args: {
  participant: Participant | undefined;
  roster: Participant[];
  competitionId: string;
  eligibleCommittees: Committee[];
  fallbackCommittees?: Committee[];
  /** الافتراض يمنع الإسناد الخطأ؛ و`ANY_AVAILABLE` يستعيد السلوك القديم صراحةً. */
  unmatchedPolicy?: 'INCIDENT' | 'ANY_AVAILABLE';
  /** متى تُسنَد اللجنة. الافتراض `ON_ARRIVAL`، وهو سلوك البوابة قبل وجود هذا الخيار. */
  mode?: DistributionMode;
}): ArrivalDecision {
  const { participant, roster, competitionId, eligibleCommittees, fallbackCommittees = [], unmatchedPolicy = 'INCIDENT', mode = 'ON_ARRIVAL' } = args;
  if (!participant) return { kind: 'not-found' };
  if (participant.competitionId !== competitionId) return { kind: 'other-competition' };

  if ((ARRIVED_STATUSES as readonly string[]).includes(participant.status)) return { kind: 'duplicate', reason: 'already-arrived' };
  /* وصلَ من قبل وأُعطي رقمًا، ثم أُعيد إلى حالةٍ أخرى: الرقم يبقى له. */
  if (participant.checkedInAt && participant.originalQueueNumber) return { kind: 'duplicate', reason: 'already-numbered' };

  const next = highestQueueNumber(roster, competitionId) + 1;
  const queueOrderKey = highestQueueOrderKey(roster, competitionId) + 1;
  const admitted = { queueNumber: next, originalQueueNumber: next, queueOrderKey } as const;

  /* إسنادٌ سابق يُحترم في كل نمط: هو قرارُ إنسانٍ أو خطةٍ موقَّعة، والبوابة لا تنقضه. */
  if (participant.assignedCommitteeId)
    return { kind: 'admit', ...admitted, assignedCommitteeId: participant.assignedCommitteeId };

  /*
   * الرقم يُمنح في كل الأنماط قبل أيّ كلامٍ عن اللجنة — فالأسبقية حقٌّ يُكتسب بالوصول
   * وحده، ولا يسقط بتأجيلٍ في التوزيع ولا بعطبٍ في التهيئة.
   */
  if (mode === 'WAVES')
    return { kind: 'admit-unrouted', ...admitted, reason: 'awaiting-wave' };
  if (mode === 'PRE_ASSIGNED')
    return { kind: 'admit-unrouted', ...admitted, reason: 'missing-pre-assignment' };

  const pool = eligibleCommittees.length
    ? eligibleCommittees
    : unmatchedPolicy === 'ANY_AVAILABLE' ? fallbackCommittees : [];
  const assignedCommitteeId = leastLoadedCommittee(pool, roster, competitionId);
  if (!assignedCommitteeId)
    return { kind: 'admit-unrouted', ...admitted, reason: 'no-eligible-committee' };

  return { kind: 'admit', ...admitted, assignedCommitteeId };
}

/** البحث بالمعرّف أو بالكود، والكود غير حسّاس لحالة الأحرف. */
export function findByIdOrCode(roster: Participant[], idOrCode: string): Participant | undefined {
  const needle = String(idOrCode || '').trim();
  if (!needle) return undefined;
  return roster.find(p => p.id === needle || p.code.toLowerCase() === needle.toLowerCase());
}
