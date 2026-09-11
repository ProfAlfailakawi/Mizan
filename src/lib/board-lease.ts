/*
 * من ينشر شاشات القاعة — وماذا يحدث حين يُغلق تبويبه.
 *
 * النشر كان معلّقًا بتبويبٍ واحد: جهاز الإدارة يبني الإسقاط وينشره، وكلّ شاشة في القاعة
 * تقرؤه. وهو تصميمٌ صحيح في جوهره — الشاشة تبقى بلا حساب ولا صلاحية قراءةٍ لسجلّ
 * المتسابقين — لكنّه جعل عشر شاشاتٍ تتوقّف معًا لأن أحدهم أغلق تبويبًا، أو نام حاسوبه،
 * أو انقطعت شبكةُ مكتبٍ واحد. والشاشات تقول الصدق («توقف التحديث») ولا أحد في غرفة
 * العمليات يعرف أن السبب عنده هو.
 *
 * وأجهزةُ الإدارة في القاعة أكثر من واحد أصلًا. فالعلاج ليس خادمًا جديدًا يقرأ سجلّ
 * المتسابقين كاملًا — ذاك يعيد فتح الامتياز الذي أُغلق — بل **تناوبٌ بين الأجهزة الحاضرة**:
 * واحدٌ ينشر، والبقيّة تراقب صامتة، فإن صمت الناشر تولّى أقربهم قبل أن تُعلن الشاشات
 * تأخّرها أصلًا.
 *
 * ومسألةٌ واحدة تفسد كل تصميمٍ ساذج لهذا: **اختلاف ساعات الأجهزة.** لو قيس عمرُ العقد
 * بالمقارنة بين ختمٍ كتبه جهازٌ وساعةِ جهازٍ آخر، لكفى تأخُّرُ ساعةِ الناشر دقيقةً واحدة
 * ليرى الجميع عقدًا منتهيًا أبدًا فيتخاطفوه بلا توقّف. فالقياس هنا لا يعبر بين ساعتين:
 * كلُّ جهازٍ يقيس **كم مضى على ساعته هو** منذ رأى الختم يتغيّر. والختم يُقارَن كنصّ
 * لا كزمن — فلا يُفسَّر ولا يُطرح منه شيء.
 */

/** أقصى صمتٍ يُحتمل من ناشرٍ قبل أن يتولّى غيره — أقلّ من حدّ إعلان الشاشة تأخّرها بهامش. */
export const LEASE_MS = 16_000;
/** كل هذه المدة يُجدّد الناشر ختمه وإن لم يتغيّر المعروض، فيبقى العقد حيًّا. */
export const RENEW_MS = 8_000;
/** إيقاع الفحص عند كل جهاز مؤهَّل. */
export const POLL_MS = 4_000;
/**
 * مدى تبعثر المطالبة. جهازان يريان الصمت في اللحظة نفسها كانا سيكتبان معًا؛ فيؤخَّر كلٌّ
 * بمقدارٍ مشتقٍّ من هويّته وحدها، فيسبق أحدهما ويرى الآخرُ العقدَ الجديد قبل أن يحين دوره.
 */
export const CLAIM_SPREAD_MS = 3_000;

export type PublisherRole = 'LEADER' | 'STANDBY' | 'INELIGIBLE';

export type LeaseReason =
  | 'NOT_ELIGIBLE'
  | 'NO_PUBLISHER'
  | 'PUBLISHER_SILENT'
  | 'CONTENT_CHANGED'
  | 'RENEWING'
  | 'HOLDING'
  | 'ANOTHER_PUBLISHER';

/** ما يُقرأ من الوثيقة المنشورة: من كتبها، وبأيّ ختم. */
export interface PublishedLease {
  publisherId: string;
  stamp: string;
}

/** ما يحفظه الجهاز عن آخر عقدٍ رآه — وفيه لحظةُ رؤيته **بساعته هو**. */
export interface LeaseWatch {
  publisherId: string;
  stamp: string;
  firstSeenAt: number;
}

export interface LeaseDecision {
  publish: boolean;
  role: PublisherRole;
  reason: LeaseReason;
  /** من ينشر الآن في نظر هذا الجهاز — أو `null` حين لا ناشر. */
  publisherId: string | null;
  /** كم مضى بساعة هذا الجهاز منذ تغيّر الختم آخر مرّة. */
  silentForMs: number;
}

/**
 * طيُّ ما قُرئ على ما كان معروفًا.
 *
 * ختمٌ لم يتغيّر ⇒ تبقى لحظةُ الرؤية الأولى كما هي، فيتراكم الصمت. وأيُّ تغيّرٍ في الناشر
 * أو الختم ⇒ ساعةٌ جديدة تبدأ من الآن. وهذا وحده ما يجعل القياس محصورًا في ساعةٍ واحدة.
 */
export function observeLease(previous: LeaseWatch | null, lease: PublishedLease | null, now: number): LeaseWatch | null {
  if (!lease || !lease.publisherId || !lease.stamp) return null;
  if (previous && previous.publisherId === lease.publisherId && previous.stamp === lease.stamp) return previous;
  return { publisherId: lease.publisherId, stamp: lease.stamp, firstSeenAt: now };
}

/**
 * تأخيرُ المطالبة الخاصّ بهذا الجهاز: دالّةٌ ثابتة من هويّته، فلا تتغيّر بين دورةٍ وأخرى
 * ولا تتطلّب اتفاقًا بين الأجهزة. وهي ليست عشوائية: جهازان مختلفان يحصلان على رقمين
 * مختلفين غالبًا، والجهاز نفسه على الرقم نفسه دائمًا.
 */
export function claimOffsetMs(selfId: string): number {
  let h = 2166136261;
  for (let i = 0; i < selfId.length; i++) { h ^= selfId.charCodeAt(i); h = Math.imul(h, 16777619) }
  return Math.abs(h) % CLAIM_SPREAD_MS;
}

export interface LeaseDecisionInput {
  selfId: string;
  /** هل يملك هذا الجهاز أصلًا أن ينشر (حساب، ودور، واتصال). */
  eligible: boolean;
  watch: LeaseWatch | null;
  /** هل تغيّر المعروض عمّا نشره هذا الجهاز آخر مرّة. */
  contentChanged: boolean;
  now: number;
}

export function decidePublish(input: LeaseDecisionInput): LeaseDecision {
  const { selfId, eligible, watch, contentChanged, now } = input;

  if (!eligible) return { publish: false, role: 'INELIGIBLE', reason: 'NOT_ELIGIBLE', publisherId: watch?.publisherId ?? null, silentForMs: 0 };

  /* لا ناشر أصلًا — ولا انتظار: شاشةٌ مطفأة الآن أسوأ من تزاحم كتابتين. */
  if (!watch) return { publish: true, role: 'LEADER', reason: 'NO_PUBLISHER', publisherId: null, silentForMs: 0 };

  const silentForMs = Math.max(0, now - watch.firstSeenAt);

  if (watch.publisherId === selfId) {
    /* الختم الذي أراه ختمي: فالصمت المقيس هو صمتي أنا عن النشر. */
    if (contentChanged) return { publish: true, role: 'LEADER', reason: 'CONTENT_CHANGED', publisherId: selfId, silentForMs };
    if (silentForMs >= RENEW_MS) return { publish: true, role: 'LEADER', reason: 'RENEWING', publisherId: selfId, silentForMs };
    return { publish: false, role: 'LEADER', reason: 'HOLDING', publisherId: selfId, silentForMs };
  }

  if (silentForMs >= LEASE_MS + claimOffsetMs(selfId))
    return { publish: true, role: 'LEADER', reason: 'PUBLISHER_SILENT', publisherId: watch.publisherId, silentForMs };

  return { publish: false, role: 'STANDBY', reason: 'ANOTHER_PUBLISHER', publisherId: watch.publisherId, silentForMs };
}

/** وصفٌ يُعرض في غرفة العمليات: المشغّل يستحقّ أن يعرف أن الشاشات معلّقة بجهازه. */
export function describePublisherRole(decision: LeaseDecision, ar: boolean): string {
  if (decision.role === 'INELIGIBLE') return ar ? 'هذا الجهاز لا ينشر شاشات القاعة.' : 'This device does not publish the hall screens.';
  if (decision.role === 'LEADER') return ar ? 'شاشات القاعة تُنشر من هذا الجهاز. إغلاقه يوقفها حتى يتولّى جهازٌ آخر.' : 'The hall screens are published from this device. Closing it stops them until another device takes over.';
  return ar ? 'جهازٌ آخر ينشر شاشات القاعة، وهذا الجهاز جاهز لتولّيها إن صمت.' : 'Another device publishes the hall screens; this one is ready to take over if it goes silent.';
}
