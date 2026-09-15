import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleAlert, CircleHelp, CloudRain, RefreshCw, Settings2 } from 'lucide-react';
import { useAppStore, currentTokenClaims, cloudSignedIn, repairIdentityClaimsNow } from '../../lib/store';
import { fetchRuntimeHealth, type MizanRuntimeHealth } from '../../lib/runtime-capabilities';
import { diagnoseCloud, summariseCloud, type CloudCheck } from '../../lib/cloud-diagnosis';
import { Button } from '../design-system/Button';

/*
 * شاشة «لماذا لا تعمل السحابة؟».
 *
 * كان جواب النظام عن كل عطل سحابي جملةً واحدة: «تعذّرت المزامنة». وخلفها ستّ حلقات مختلفة
 * تمامًا — مفاتيح بناء ناقصة، أو جلسة منتهية، أو رمزٌ بلا مطالبات، أو خادمٌ لا يستطيع كتابة
 * المطالبات أصلًا، أو تخويلٌ على مسابقة أخرى، أو حمولة أكبر من حدّ المستند. كلٌّ منها يصلحها
 * شخصٌ مختلف، فالجملة الواحدة تُرسل الجميع إلى التخمين.
 *
 * هنا تُفحص الحلقات بترتيبها ويُقال أين انقطع الخيط ومن يصلحه. والمنطق كلُّه في
 * `lib/cloud-diagnosis.ts` نقيًّا ومختبَرًا؛ هذه الشاشة تجمع المرصود وتعرضه.
 *
 * وزرُّ الإصلاح لا يمنح صلاحية: يطلب من الخادم إعادة كتابة المطالبات من التخويل الموجود
 * أصلًا في سجلّ الهويات، ثم يُجدّد الرمز. ولو كان الخادم عاجزًا عن الكتابة قيل ذلك صراحةً
 * بدل أن يُضغط الزرّ بلا أثر.
 */

const TONE: Record<CloudCheck['state'], { box: string; icon: React.ComponentType<{ className?: string }>; iconColor: string }> = {
  ok: { box: 'border-[#cddbd3] bg-[#F7FAF8]', icon: CheckCircle2, iconColor: 'text-[#214C40]' },
  blocked: { box: 'border-[#e0c6c1] bg-[#F9F0EE]', icon: AlertTriangle, iconColor: 'text-[#8a3f34]' },
  warning: { box: 'border-[#e6d9c2] bg-[#FBF7F0]', icon: CircleAlert, iconColor: 'text-[#7d5e34]' },
  unknown: { box: 'border-[#dfe6ea] bg-[#F4F7F9]', icon: CircleHelp, iconColor: 'text-[#5b6b76]' },
};

export const CloudDiagnostics: React.FC = () => {
  const store = useAppStore();
  const ar = store.language === 'ar';
  const [health, setHealth] = useState<MizanRuntimeHealth>();
  const [claims, setClaims] = useState<Awaited<ReturnType<typeof currentTokenClaims>>>();
  const [busy, setBusy] = useState(false);
  const [repairBusy, setRepairBusy] = useState(false);
  const [repairNote, setRepairNote] = useState('');

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [next, tokenClaims] = await Promise.all([fetchRuntimeHealth(), currentTokenClaims()]);
      setHealth(next);
      setClaims(tokenClaims);
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const result = diagnoseCloud({
    /* مفاتيح البناء: وجود كائن المصادقة يعني أن التطبيق أُقلع بمفتاح صالح — ولولاه لتوقّف عند الاستيراد. */
    clientConfigured: true,
    clientProjectId: (import.meta.env as Record<string, string | undefined>).VITE_FIREBASE_PROJECT_ID,
    offlineMode: store.isOffline,
    browserOnline: typeof navigator === 'undefined' ? undefined : navigator.onLine,
    signedIn: cloudSignedIn(),
    tokenClaims: claims,
    serverReachable: health ? health.source === 'server' : undefined,
    serverClaimsWritable: health?.source === 'server' ? health.identityClaimsWritable : undefined,
    organizationId: store.competition.organizationId,
    competitionId: store.competition.id,
    lastError: store.persistenceError ? { code: store.persistenceError.code, message: store.persistenceError.message, at: store.persistenceError.at } : undefined,
  });

  const repair = async () => {
    setRepairBusy(true); setRepairNote('');
    try {
      const outcome = await repairIdentityClaimsNow();
      if (outcome.ok) setRepairNote(ar ? 'أُعيدت كتابة مطالباتك وجُدِّد رمزك. أعد المحاولة على ما تعذّر رفعه.' : 'Your claims were rewritten and your token refreshed. Retry whatever failed to upload.');
      else setRepairNote(repairFailureText(outcome.code || 'CLAIM_REPAIR_FAILED', outcome.reason, ar));
      await refresh();
    } finally { setRepairBusy(false); }
  };

  const repairable = result.checks.some(x => x.state === 'blocked' && x.repairable);

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-5 ${result.ready ? 'border-[#cddbd3] bg-[#F7FAF8]' : 'border-[#e0c6c1] bg-[#F9F0EE]'}`} role="status">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={`inline-flex items-center gap-2 text-lg font-black ${result.ready ? 'text-[#214C40]' : 'text-[#8a3f34]'}`}>
              {result.ready ? <CheckCircle2 className="h-5 w-5" /> : <CloudRain className="h-5 w-5" />}
              {summariseCloud(result, ar)}
            </h2>
            <p className="mt-1.5 max-w-2xl text-[11px] leading-6 text-[#5b6460]">
              {ar
                ? 'بينك وبين أول كتابة ناجحة ستّ حلقات، وكلُّها تفشل بالرسالة نفسها. هنا تُقرأ كلُّ حلقة على حدة: أين انقطع الخيط، ومن يصلحه.'
                : 'Six links stand between you and a successful write, and all of them fail with the same message. Each one is read separately here: where the chain broke, and who fixes it.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {repairable && (
              <Button size="sm" disabled={repairBusy} icon={<Settings2 className="h-4 w-4" />} onClick={() => void repair()}>
                {repairBusy ? (ar ? 'جارٍ الإصلاح…' : 'Repairing…') : (ar ? 'أعد كتابة مطالباتي' : 'Rewrite my claims')}
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={busy} icon={<RefreshCw className="h-4 w-4" />} onClick={() => void refresh()}>
              {busy ? (ar ? 'جارٍ الفحص…' : 'Checking…') : (ar ? 'إعادة الفحص' : 'Re-check')}
            </Button>
          </div>
        </div>
        {repairNote && <p role="status" className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-[11px] font-bold leading-6 text-[#4f5752]">{repairNote}</p>}
      </div>

      <ul className="space-y-2">
        {result.checks.map(item => {
          const tone = TONE[item.state];
          const Icon = tone.icon;
          return (
            <li key={item.id} className={`rounded-2xl border p-4 ${tone.box}`}>
              <h3 className="inline-flex items-center gap-2 text-sm font-black text-[#24302b]">
                <Icon className={`h-4 w-4 ${tone.iconColor}`} />{ar ? item.titleAr : item.titleEn}
              </h3>
              <p className="mt-1.5 text-[11px] leading-6 text-[#4f5752]">{ar ? item.detailAr : item.detailEn}</p>
              {item.state !== 'ok' && (
                <p className="mt-1.5 text-[10px] font-black text-[#696f6b]">
                  {ar ? `يصلحها: ${item.ownerAr}` : `Fixed by: ${item.ownerEn}`}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-[10px] leading-5 text-[#696f6b]">
        {ar
          ? 'لا تُعرض هنا مفاتيح ولا أسرار — أسماء الحقول وحالتها فقط. وزرّ الإصلاح لا يمنح دورًا ولا جهة ولا مسابقة: يعيد كتابة ما قرّره سجلّ الهويات أصلًا.'
          : 'No keys or secrets appear here — only field names and their state. The repair button grants no role, organization or competition: it rewrites what the identity registry already decided.'}
      </p>
    </div>
  );
};

/** سبب الخادم بلغة المشغّل. الرمز الخام يُقال أيضًا، فمن يفتح تذكرة دعم يحتاجه. */
function repairFailureText(code: string, reason: string | undefined, ar: boolean): string {
  const tail = reason ? ` (${reason})` : '';
  switch (code) {
    case 'ACCOUNT_NOT_PROVISIONED':
      return ar
        ? `لا تخويل لهذا الحساب في سجلّ الهويات، فلا مطالبات تُكتب له. مدير الجهة يدعوه أو يُفعّل تخويله أولًا. [${code}]`
        : `This account has no grant in the identity registry, so there are no claims to write. The organization admin must invite or activate it first. [${code}]`;
    case 'IDENTITY_CLAIMS_NOT_CONFIGURED':
      return ar
        ? `الخادم لا يستطيع كتابة المطالبات: ينقصه FIREBASE_PROJECT_ID أو اعتماد التشغيل الافتراضي مع صلاحية Firebase Authentication Admin. لا يُصلح هذا من التطبيق — يُضبط في النشر. [${code}]${tail}`
        : `The server cannot write claims: it lacks FIREBASE_PROJECT_ID, or Application Default Credentials with the Firebase Authentication Admin role. This is fixed in the deployment, not in the app. [${code}]${tail}`;
    case 'IDENTITY_GOVERNANCE_NOT_CONFIGURED':
      return ar
        ? `حوكمة الهويات غير مهيَّأة على هذا الخادم، فلا مصدر للتخويل تُكتب منه المطالبات. [${code}]`
        : `Identity governance is not configured on this server, so there is no grant to write claims from. [${code}]`;
    case 'IDENTITY_CLAIMS_SYNC_FAILED':
      return ar ? `رفض Firebase كتابة المطالبات${tail}. [${code}]` : `Firebase refused the claim write${tail}. [${code}]`;
    case 'NOT_SIGNED_IN':
      return ar ? 'لا جلسة دخول على هذا الجهاز.' : 'No signed-in session on this device.';
    case 'CLAIM_REPAIR_UNREACHABLE':
      return ar ? `تعذّر الوصول إلى الخادم${tail}.` : `The server could not be reached${tail}.`;
    default:
      return ar ? `تعذّر إصلاح المطالبات${tail}. [${code}]` : `Claim repair failed${tail}. [${code}]`;
  }
}

export default CloudDiagnostics;
