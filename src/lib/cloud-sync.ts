import type { Role } from '../types';

/*
 * سياسة المزامنة السحابية.
 *
 * كان النظام يعمل كجهاز واحد: جهاز المدير وحده يرفع، ويرفع **الحالة كاملة في وثيقة واحدة**.
 * فدرجات المحكّم لا تغادر جهازه اللوحي، وتسجيل المتسابق لا يصل المدير، وحين يكبر اليوم تتجاوز
 * الوثيقة حدّ فايرستور فتتوقّف المزامنة بصمت.
 *
 * هنا تُكتب القاعدة صراحةً: من يملك كل نوع، وأين يُكتب، ومتى تكون الحمولة أكبر من أن تُكتب.
 * وحدة خالصة، فتُختبر وحدها وتُطابق قواعد فايرستور بدل أن تُخمَّن.
 */

/** الأنواع التي تُكتب مستنداتٍ مستقلة في مجموعات فرعية، لا حقولًا في وثيقة واحدة. */
export const SYNCED_COLLECTIONS = [
  'participants', 'committees', 'judge_submissions', 'judge_events', 'checkins',
  'results', 'certificates', 'reviews', 'appeals', 'support_sessions', 'audit', 'quran_sources', 'session_checkpoints',
  // نطاق المتسابق المعتمد بيانٌ يقوم عليه سحب يوم المسابقة، فلا يجوز أن يعيش على جهاز واحد.
  'participant_scopes',
  // تضارب المصالح وقراراته، والجدول الزمني المعتمد، وسجلّ التأهّل بين المراحل.
  'conflict_cases', 'schedule_plans', 'qualifications',
] as const;
export type SyncedCollection = typeof SYNCED_COLLECTIONS[number];

const ADMIN: Role[] = ['super_admin', 'org_admin', 'comp_admin'];
/** مدير الفرع: عمليات المسابقات على مستوى الجهة — لا ختم ولا نشر ولا تحكيم (انظر قاعدة `branchAdmin` في firestore.rules). */
const BRANCH: Role[] = ['branch_admin'];
/** من يحقّ له كتابة وثيقة إعداد المسابقة نفسها (إنشاؤها وضبطها). نشرُ صفحة التسجيل العامة أضيق من هذا. */
export const CONFIG_WRITER_ROLES: Role[] = [...ADMIN, ...BRANCH];
const PANEL: Role[] = ['judge', 'head_judge'];

/*
 * من يكتب ماذا. القاعدة أضيق ما يكفي للعمل:
 * لجنةُ التحكيم تكتب ما تنتجه بنفسها (إرسالاتها، نتيجة جلستها، حالات المراجعة، تسجيلاتها)،
 * والإدارة تكتب بنية المسابقة، والمشارك يكتب تسجيله واعتراضه وحدهما.
 */
const WRITERS: Record<SyncedCollection, Role[]> = {
  /* المحكّم يقدّم حالة المتسابق وحدها عند انتهاء الجلسة؛ القواعد تحصره في الحالة وسجلّها. */
  participants: [...ADMIN, ...BRANCH, 'delegation_manager', 'exception_host', 'judge'],
  committees: [...ADMIN, ...BRANCH, 'ops_manager'],
  judge_submissions: ['judge'],
  judge_events: ['judge'],
  checkins: ['comp_admin', ...BRANCH, 'ops_manager', 'exception_host'],
  /* المتسابق يكتب اختياره ونسخته، والإدارة وحدها تعتمده أو ترفضه أو تقفله. */
  participant_scopes: [...ADMIN, 'delegation_manager', 'participant'],
  // النتيجة يكتبها من يملك ختم اللجنة، لا كل محكّم: أضيق صلاحية تُنجز العمل.
  results: [...ADMIN, 'head_judge'],
  certificates: [...ADMIN],
  reviews: ['head_judge'],
  appeals: [...ADMIN, 'head_judge', 'participant', 'guardian', 'support_agent'],
  support_sessions: [...ADMIN, 'support_agent'],
  audit: [...ADMIN, ...BRANCH, ...PANEL, 'auditor', 'ops_manager', 'delegation_manager', 'exception_host', 'support_agent', 'broadcast_operator'],
  quran_sources: ['super_admin'],
  session_checkpoints: [...ADMIN, ...PANEL, 'ops_manager'],
  /* المحكّم يعلن تضاربه بنفسه، ورئيس التحكيم والإدارة يقرّرون فيه؛ القواعد تحصر المحكّم في الإنشاء. */
  conflict_cases: [...ADMIN, ...PANEL],
  schedule_plans: [...ADMIN, ...BRANCH, 'ops_manager'],
  qualifications: [...ADMIN],
};

/** هل يجوز لهذا الدور كتابة هذا النوع؟ نوع غير معروف يُرفض — لا يُفتح الباب بالصمت. */
export function canWriteSyncedCollection(role: Role, collection: string): boolean {
  const allowed = WRITERS[collection as SyncedCollection];
  return Array.isArray(allowed) && allowed.includes(role);
}

/** الأنواع التي يستطيع هذا الدور رفعها — يقودها المزامِن بدل تعطيل غير الإداريين كليًا. */
export function writableCollectionsFor(role: Role): SyncedCollection[] {
  return SYNCED_COLLECTIONS.filter((c) => canWriteSyncedCollection(role, c));
}

/**
 * حدّ المستند في فايرستور 1 MiB. نحتفظ بهامش أمان لأن الخادم يضيف حقولًا (المؤسسة، المسابقة،
 * وقت التحديث) ولأن حساب فايرستور للحجم يشمل أسماء الحقول والفهارس، فالتقدير الخام يقلّ عن الحقيقة.
 */
export const FIRESTORE_DOCUMENT_LIMIT_BYTES = 1048576;
export const SAFE_DOCUMENT_BYTES = 900000;

/** تقدير حجم مستند بالبايت بعد التحويل إلى JSON (UTF-8). */
export function estimateDocumentBytes(value: unknown): number {
  try { return new TextEncoder().encode(JSON.stringify(value ?? null)).length } catch { return Number.MAX_SAFE_INTEGER }
}

/** هل تتجاوز الحمولة الهامش الآمن؟ التجاوز يُبلَّغ ولا يُكتب بصمت ثم يفشل. */
export function exceedsSafeDocumentSize(value: unknown, limit = SAFE_DOCUMENT_BYTES): boolean {
  return estimateDocumentBytes(value) > limit;
}

export type CloudSyncErrorCode = 'CLOUD_WRITE_FAILED' | 'CLOUD_PAYLOAD_TOO_LARGE' | 'CLOUD_PERMISSION_DENIED';

/** تصنيف فشل الكتابة إلى سبب يفهمه المشغّل، لا نصّ استثناء خام. */
export function classifyCloudError(err: unknown): CloudSyncErrorCode {
  const message = (err instanceof Error ? err.message : String(err || '')).toLowerCase();
  if (message.includes('permission') || message.includes('insufficient')) return 'CLOUD_PERMISSION_DENIED';
  if (message.includes('too large') || message.includes('exceeds') || message.includes('maximum')) return 'CLOUD_PAYLOAD_TOO_LARGE';
  return 'CLOUD_WRITE_FAILED';
}


/*
 * ما يستمع إليه كل دور من السحابة.
 *
 * كان المخزن يفتح اثني عشر مستمعًا لكل دور مهما كان. وقواعد Firestore ترفض القراءة على من لا يملكها، فيمتلئ
 * سجلّ المتصفح بأخطاء «permission-denied» عند كل دخول (وتُحجَب خلفها الأخطاء الحقيقية)، والمحكّم خاصةً كان
 * يطلب كل إرساليات اللجنة وقاعدته تسمح له بإرسالاته وحدها — فلا يصله شيء منها أبدًا.
 *
 * هذا الجدول يطابق قواعد القراءة في firestore.rules حرفًا بحرف، ويحرسه اختبارٌ يقرأ القواعد نفسها.
 * `own`: يقرأ الدورُ ما رفعه هو فقط (`uploaderUid == auth.uid`) وعلى المستمع أن يطلبه مقيَّدًا بذلك.
 */
export const WATCHED_COLLECTIONS = [
  'results', 'judge_submissions', 'participants', 'committees', 'certificates', 'reviews', 'appeals', 'tie_decisions',
  'support_sessions', 'conflict_cases', 'schedule_plans', 'qualifications',
] as const;
export type WatchedCollection = typeof WATCHED_COLLECTIONS[number];

/** الحقل الذي تُقيَّد به قراءة «ما يخصّه»: `uploaderUid` لمن رفع، و`delegationId` لمدير الوفد. */
export type OwnField = 'uploaderUid' | 'delegationId';
export const COLLECTION_OWN_FIELD: Partial<Record<WatchedCollection, OwnField>> = { participants: 'delegationId' };
/** قيمة الحقل لهذا المستخدم: معرّف الدخول، أو نطاق وفده (`delegation-<uid>`). */
export const ownValueFor = (field: OwnField, uid: string) => (field === 'delegationId' ? `delegation-${uid}` : uid);

export const COLLECTION_READERS: Record<WatchedCollection, { all: Role[]; own?: Role[] }> = {
  results: { all: [...ADMIN, 'head_judge', 'judge', 'auditor'] },
  judge_submissions: { all: [...ADMIN, 'head_judge', 'auditor'], own: ['judge'] },
  participants: { all: [...ADMIN, ...BRANCH, 'head_judge', 'judge', 'ops_manager', 'exception_host', 'auditor'], own: ['delegation_manager'] },
  committees: { all: [...ADMIN, ...BRANCH, 'head_judge', 'judge', 'ops_manager', 'exception_host', 'delegation_manager', 'auditor'] },
  certificates: { all: [...ADMIN, 'auditor'] },
  reviews: { all: [...ADMIN, 'head_judge', 'auditor'] },
  appeals: { all: [...ADMIN, 'head_judge', 'auditor', 'support_agent'], own: ['participant', 'guardian'] },
  tie_decisions: { all: [...ADMIN, 'head_judge', 'judge', 'ops_manager', 'auditor'] },
  support_sessions: { all: [...ADMIN, 'support_agent', 'ops_manager', 'head_judge'] },
  conflict_cases: { all: [...ADMIN, 'head_judge', 'judge', 'auditor'] },
  schedule_plans: { all: [...ADMIN, ...BRANCH, 'ops_manager', 'head_judge', 'judge', 'auditor'] },
  qualifications: { all: [...ADMIN, 'head_judge', 'auditor'] },
};

/** الاستماعات التي يفتحها هذا الدور: كل مجموعة يقرؤها، مع تقييد `own` حين لا يقرأ إلا ما رفعه. */
export function watchPlanFor(role: Role): { collection: WatchedCollection; ownOnly: boolean; ownField?: OwnField }[] {
  const plan: { collection: WatchedCollection; ownOnly: boolean; ownField?: OwnField }[] = [];
  for (const collection of WATCHED_COLLECTIONS) {
    const rule = COLLECTION_READERS[collection];
    if (rule.all.includes(role)) plan.push({ collection, ownOnly: false });
    else if (rule.own?.includes(role)) plan.push({ collection, ownOnly: true, ownField: COLLECTION_OWN_FIELD[collection] || 'uploaderUid' });
  }
  return plan;
}
