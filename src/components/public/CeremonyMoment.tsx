import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { MizanMark } from '../design-system/MizanLogo';
import { RealQRCode } from '../design-system/RealQRCode';

/*
 * «لحظة الميزان» — تمهيدٌ بصريّ قبل كل خطوة كشف في الحفل.
 *
 * كفّتا شعار ميزان تتأرجحان ثم تستقرّان، ثم يظهر ما كان الحفل يُظهره أصلًا. لا يختار هذا
 * المكوّن شيئًا ولا يرتّب شيئًا: الترتيب والمحتوى من النتائج المختومة كما يقرؤها `CeremonyView`.
 * ورمز التحقق يحمل رابط صفحة التحقق العامة الموجودة (`#verify`) ورقم الشهادة إن صدرت،
 * وبصمة الختم المطبوعة تحته هي `sealMetadata.cryptographicChecksum` كما هي.
 * الحركة CSS فقط؛ وتقليل الحركة يعرض الحالة المستقرّة فورًا.
 */

export const CeremonyScales: React.FC = () => (
  <div className="mz-vw-scales mx-auto" aria-hidden="true">
    <MizanMark tone="inverse" decorative className="h-20 w-20 sm:h-24 sm:w-24" />
  </div>
);

export const CeremonySealQr: React.FC<{ sealHash?: string; certificateNumber?: string; ar: boolean }> = ({ sealHash, certificateNumber, ar }) => {
  if (!sealHash) return null;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = certificateNumber ? `${origin}/#verify?cert=${encodeURIComponent(certificateNumber)}` : `${origin}/#verify`;
  return (
    <div className="mz-vw-sealqr mz-cer-item mt-6 inline-flex max-w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[.04] p-2.5 text-start" style={{ '--mzay': '14px', '--mzd': '980ms' } as React.CSSProperties}>
      <span className="shrink-0 rounded-xl bg-[#fffefb] p-1"><RealQRCode value={url} size={76} label={ar ? 'رمز التحقق من النتيجة المختومة' : 'Sealed result verification code'} /></span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[11px] font-black tracking-[.12em] text-[#e8cb93]"><ShieldCheck className="h-3.5 w-3.5" />{ar ? 'ختم النتيجة' : 'RESULT SEAL'}</span>
        <bdi dir="ltr" className="mt-1 block truncate font-mono text-[11px] mizan-venue-muted">{sealHash.slice(0, 24)}…</bdi>
        <span className="mt-0.5 block text-[11px] mizan-venue-faint">{ar ? 'امسح للتحقق' : 'Scan to verify'}</span>
      </span>
    </div>
  );
};
