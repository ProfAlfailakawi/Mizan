import { useEffect, useRef } from 'react';

/*
 * نبضة التشغيل — الوصلة الناقصة بين تعثّر المستخدم وعلم المالك.
 *
 * كان الخطأ يُعرض للمستخدم المتأثر ثم يموت عنده: `reportCloudError` يضع الرسالة في حالة
 * الواجهة ويُعيد الرسم، ولا يغادر المتصفح. فمحكّم تعثّر حفظه، أو أمٌّ تعذّر تسجيلها، لا يعلم
 * بهما أحد — ونقطة الاستقبال على الخادم موجودة ولوحة المالك تقرأ منها، ولا شيء يرسل إليها.
 *
 * هذه الوحدة ترسل. وقواعدها كلها من نوع «لا تؤذِ»:
 *   - لا تُفشل شيئًا: كل خطأ فيها يُبتلع. نبضة فاشلة أهون من شاشة معطّلة.
 *   - لا تُغرق: تُرسل عند تغيّر الحالة فقط، وإلا فنبضة دورية هادئة.
 *   - لا تُلحّ: غياب الإعداد على الخادم (503) يوقفها نهائيًا بدل محاولات لا تنتهي.
 *   - لا تحمل بيانات: رمز العطل ونطاقه فقط. لا أسماء متسابقين ولا درجات.
 */

const HEARTBEAT_INTERVAL_MS = 60_000;

export type HeartbeatStatus = 'ONLINE' | 'DEGRADED' | 'OFFLINE';

export interface HeartbeatInput {
  competitionId?: string;
  subjectId: string;
  role?: string;
  name?: string;
  status: HeartbeatStatus;
  meta?: Record<string, unknown>;
}

/** null تعني «تعذّرت النبضة»، وهي ليست خطأً يُعرض: التشغيل لا يتوقف على التتبّع. */
export async function sendHeartbeat(
  input: HeartbeatInput,
  deps: { token?: () => Promise<string | undefined>; fetcher?: typeof fetch } = {},
): Promise<'SENT' | 'NOT_CONFIGURED' | 'SKIPPED'> {
  const fetcher = deps.fetcher ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!fetcher || !input.subjectId) return 'SKIPPED';
  let bearer: string | undefined;
  try {
    /* استيراد كسول: ربط الوحدة بإعداد Firebase عند التحميل يجعلها غير قابلة للاختبار
       خارج المتصفح، ولا حاجة إليه قبل أول نبضة. */
    bearer = deps.token ? await deps.token() : await (await import('./firebase')).auth.currentUser?.getIdToken();
  } catch { return 'SKIPPED' }
  if (!bearer) return 'SKIPPED';
  try {
    const res = await fetcher('/api/telemetry/heartbeat', {
      method: 'POST',
      headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        subjectType: 'user',
        subjectId: input.subjectId,
        competitionId: input.competitionId,
        role: input.role,
        name: input.name,
        status: input.status,
        meta: input.meta ?? {},
      }),
    });
    /* التتبّع غير مهيّأ على الخادم: ليس عطلًا، ولا داعي لمحاولة أخرى. */
    if (res.status === 503 || res.status === 501) return 'NOT_CONFIGURED';
    return res.ok ? 'SENT' : 'SKIPPED';
  } catch { return 'SKIPPED' }
}

export interface HeartbeatSubject {
  signedIn: boolean;
  isOffline: boolean;
  subjectId: string;
  role?: string;
  name?: string;
  competitionId?: string;
  /* رمز العطل الحاضر الآن إن وُجد؛ حضوره يجعل الحالة DEGRADED. */
  errorCode?: string | null;
}

/**
 * يُنادى مرة واحدة على مستوى التطبيق.
 *
 * تغيّر العطل يُرسل فورًا — لأن المالك يحتاج أن يعرف الآن لا بعد دقيقة — وما عداه نبضة
 * دورية تُثبت أن الجلسة حيّة. وسكوت النبضة نفسه إشارة: لوحة المالك تعرض الجلسات الصامتة.
 */
export function useOpsHeartbeat(subject: HeartbeatSubject): void {
  const disabled = useRef(false);
  const lastSignature = useRef('');

  useEffect(() => {
    if (disabled.current || !subject.signedIn || !subject.subjectId) return;
    const status: HeartbeatStatus = subject.isOffline ? 'OFFLINE' : subject.errorCode ? 'DEGRADED' : 'ONLINE';
    const signature = `${status}:${subject.errorCode ?? ''}:${subject.competitionId ?? ''}`;

    const beat = async () => {
      if (disabled.current) return;
      /* المتصفح دون اتصال لا يصل الخادم أصلًا: تُترك النبضة للعودة بدل محاولة محكوم عليها. */
      if (subject.isOffline) return;
      const outcome = await sendHeartbeat({
        competitionId: subject.competitionId,
        subjectId: subject.subjectId,
        role: subject.role,
        name: subject.name,
        status,
        meta: subject.errorCode ? { errorCode: subject.errorCode } : {},
      });
      if (outcome === 'NOT_CONFIGURED') disabled.current = true;
    };

    if (signature !== lastSignature.current) {
      lastSignature.current = signature;
      void beat();
    }
    const timer = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [subject.signedIn, subject.isOffline, subject.subjectId, subject.role, subject.name, subject.competitionId, subject.errorCode]);
}
