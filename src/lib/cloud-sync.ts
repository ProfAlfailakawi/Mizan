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
] as const;
export type SyncedCollection = typeof SYNCED_COLLECTIONS[number];

const ADMIN: Role[] = ['super_admin', 'org_admin', 'comp_admin'];
const PANEL: Role[] = ['judge', 'head_judge'];

/*
 * من يكتب ماذا. القاعدة أضيق ما يكفي للعمل:
 * لجنةُ التحكيم تكتب ما تنتجه بنفسها (إرسالاتها، نتيجة جلستها، حالات المراجعة، تسجيلاتها)،
 * والإدارة تكتب بنية المسابقة، والمشارك يكتب تسجيله واعتراضه وحدهما.
 */
const WRITERS: Record<SyncedCollection, Role[]> = {
  participants: [...ADMIN, 'delegation_manager', 'exception_host'],
  committees: [...ADMIN, 'ops_manager'],
  judge_submissions: ['judge'],
  judge_events: ['judge'],
  checkins: ['comp_admin', 'ops_manager', 'exception_host'],
  // النتيجة يكتبها من يملك ختم اللجنة، لا كل محكّم: أضيق صلاحية تُنجز العمل.
  results: [...ADMIN, 'head_judge'],
  certificates: [...ADMIN],
  reviews: ['head_judge'],
  appeals: [...ADMIN, 'head_judge', 'participant', 'guardian', 'support_agent'],
  support_sessions: [...ADMIN, 'support_agent'],
  audit: [...ADMIN, ...PANEL, 'auditor', 'ops_manager', 'delegation_manager', 'exception_host', 'support_agent', 'broadcast_operator'],
  quran_sources: ['super_admin'],
  session_checkpoints: [...ADMIN, ...PANEL, 'ops_manager'],
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
