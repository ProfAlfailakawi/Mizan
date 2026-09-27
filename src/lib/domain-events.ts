/*
 * أحداث المسابقة إلى webhooks الجهة — إبلاغٌ لا شرط.
 *
 * هذه الأحداث تقع في المتصفّح (حضور، إنهاء جلسة، نشر نتائج، إصدار شهادة، إغلاق مسابقة)،
 * فيُبلَّغ بها الخادم ليُرسلها موقّعةً إلى webhooks الجهة. النداء مُطلق بلا انتظار ولا يرمي
 * أبدًا: تعذّر الإبلاغ لا يوقف حضور متسابق ولا نشر نتيجة. والخادم يشتقّ الجهة من الهوية،
 * ويقبل أنواعًا محدّدة لكل دور، ولا يمرّر إلا معرّفاتٍ بلا بيانات شخصية.
 */
import { auth } from './firebase';

export type DomainEventType = 'participant.checked_in' | 'judging.completed' | 'competition.completed' | 'results.published' | 'certificate.issued';

export function emitDomainEvent(type: DomainEventType, input: { competitionId: string; subjectId: string; participantCode?: string; status?: string }): void {
  const user = auth.currentUser;
  if (!user || typeof fetch !== 'function') return;
  void (async () => {
    try {
      const token = await user.getIdToken();
      await fetch('/api/saas/events', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ type, ...input }), keepalive: true });
    } catch { /* إبلاغٌ فاشل لا يُفشل العملية التي يصفها */ }
  })();
}
