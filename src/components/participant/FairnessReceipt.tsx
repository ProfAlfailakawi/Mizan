import { displayDateTimeMedium } from '../../lib/display-format';
import React from 'react';
import { BadgeCheck, Printer, ShieldCheck, X } from 'lucide-react';
import type { buildParticipantFairnessEvidence } from '../../lib/judging-integrity';
import { formatParticipantCode } from '../../lib/journey-progress';
import { RevealGateExplainer } from './RevealGateExplainer';

/*
 * «إيصال النزاهة» كان ملف JSON يُنزَّل — لا يفتحه المتسابق ولا يفهمه أهله. صار ورقةً
 * تُقرأ وتُطبع: البيانات نفسها بجملٍ واضحة، والبصمات الطويلة في آخرها لمن يريد التحقق.
 */
type Receipt = ReturnType<typeof buildParticipantFairnessEvidence>;

const fmt = (iso: string | undefined, ar: boolean) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : displayDateTimeMedium(d, ar);
};

const RESULT_STATUS: Record<string, [string, string]> = {
  not_calculated: ['لم تُحسب بعد', 'Not calculated yet'],
  calculated: ['محسوبة، بانتظار الاعتماد', 'Calculated, awaiting approval'],
  quality_checked: ['قيد التدقيق', 'Being checked'],
  approved: ['معتمدة', 'Approved'],
  published: ['معلنة', 'Published'],
  sealed: ['معلنة ومختومة', 'Published and sealed'],
};

const Row: React.FC<{ label: string; value: React.ReactNode; ok?: boolean }> = ({ label, value, ok }) => (
  <div className="flex items-start justify-between gap-4 border-b border-dashed border-[#e3dfd3] py-3 last:border-0">
    <dt className="text-base text-[#555d58]">{label}</dt>
    <dd className="flex items-center gap-2 text-base font-black text-[#17352D] text-end">{ok && <BadgeCheck className="h-5 w-5 text-[#2F6555]" aria-hidden="true" />}{value}</dd>
  </div>
);

export const FairnessReceipt: React.FC<{ receipt: Receipt; ar: boolean; participantName: string; competitionName: string; onClose: () => void }> = ({ receipt, ar, participantName, competitionName, onClose }) => {
  const q = receipt.questionIntegrity;
  const j = receipt.judging;
  const status = RESULT_STATUS[receipt.resultStatus] || [receipt.resultStatus, receipt.resultStatus];
  const hashes = [
    ...(receipt.resultSealHash ? [{ label: ar ? 'ختم النتيجة' : 'Result seal', value: receipt.resultSealHash }] : []),
    ...j.independenceCommitments.map((c, i) => ({ label: ar ? `التزام المحكّم ${i + 1}` : `Judge commitment ${i + 1}`, value: c.commitmentHash })),
  ];
  return <div role="dialog" aria-modal="true" aria-label={ar ? 'إيصال النزاهة' : 'Fairness receipt'} className="mizan-receipt-overlay fixed inset-0 z-50 overflow-y-auto bg-black/30 backdrop-blur-sm p-4 sm:p-8" dir={ar ? 'rtl' : 'ltr'}>
    <style>{`@media print{body *{visibility:hidden!important}.mizan-receipt-sheet,.mizan-receipt-sheet *{visibility:visible!important}.mizan-receipt-overlay{position:static!important;background:none!important;padding:0!important;overflow:visible!important}.mizan-receipt-sheet{position:absolute;inset:0 0 auto 0;box-shadow:none!important;border:0!important;margin:0!important;max-width:none!important}.mizan-receipt-actions,.mizan-receipt-explain{display:none!important}}`}</style>
    <div className="mizan-receipt-sheet mx-auto max-w-xl rounded-3xl border border-[#e3dfd3] bg-[#FFFEFB] p-6 sm:p-9 shadow-2xl">
      <div className="mizan-receipt-actions mb-4 flex items-center justify-between gap-3">
        <button type="button" onClick={() => window.print()} className="inline-flex min-h-14 items-center gap-2 rounded-2xl bg-[#214C40] px-6 text-lg font-black text-white"><Printer className="h-5 w-5" />{ar ? 'طباعة' : 'Print'}</button>
        <button type="button" onClick={onClose} className="inline-flex min-h-14 items-center gap-2 rounded-2xl border border-[#d8d6cf] bg-white px-5 text-lg font-black text-[#3f4642]"><X className="h-5 w-5" />{ar ? 'إغلاق' : 'Close'}</button>
      </div>
      <header className="text-center border-b-2 border-[#E8CB93] pb-5">
        <ShieldCheck className="mx-auto h-12 w-12 text-[#214C40]" aria-hidden="true" />
        <h2 className="mt-3 text-3xl font-black text-[#17352D]">{ar ? 'إيصال النزاهة' : 'Fairness receipt'}</h2>
        <p className="mt-1 text-base text-[#5d6560]">{competitionName}</p>
        <p className="mt-3 text-xl font-black">{participantName}</p>
        <p className="text-lg font-black tabular-nums text-[#555d58]" dir="ltr">{formatParticipantCode(receipt.participantCode)}</p>
      </header>

      <h3 className="mt-6 text-lg font-black text-[#214C40]">{ar ? 'دورك' : 'Your turn'}</h3>
      <dl>
        <Row label={ar ? 'رقم دورك الأصلي' : 'Original queue number'} value={receipt.queue.originalQueueNumber ?? '—'} />
        <Row label={ar ? 'مرات نقلك بين اللجان' : 'Panel transfers'} value={receipt.queue.transferCount} />
        {receipt.queue.transferCount > 0 && <Row label={ar ? 'حُفظ دورك عند النقل' : 'Turn preserved on transfer'} value={receipt.queue.transfers.every(t => t.priorityPreserved) ? (ar ? 'نعم' : 'Yes') : (ar ? 'جزئيًا' : 'Partly')} ok={receipt.queue.transfers.every(t => t.priorityPreserved)} />}
      </dl>

      {q.questions > 0 && <>
      <h3 className="mt-6 text-lg font-black text-[#214C40]">{ar ? 'الأسئلة' : 'Questions'}</h3>
      <dl>
        <Row label={ar ? 'عدد الأسئلة' : 'Questions'} value={q.questions} />
        <Row label={ar ? 'لم يُكشف أي سؤال قبل حضورك' : 'No question revealed before you were present'} value={q.questions === 0 ? '—' : q.allRevealedAfterPresence ? (ar ? 'نعم' : 'Yes') : (ar ? 'لا' : 'No')} ok={q.questions > 0 && q.allRevealedAfterPresence} />
      </dl>
      <RevealGateExplainer ar={ar} gates={q.gates} />
      </>}

      <h3 className="mt-6 text-lg font-black text-[#214C40]">{ar ? 'التحكيم' : 'Judging'}</h3>
      <dl>
        <Row label={ar ? 'محكّمون قيّموك باستقلال' : 'Judges who scored independently'} value={j.independentLockedSubmissions} ok={j.independentLockedSubmissions > 0} />
        {j.lockedAt.length > 0 && <Row label={ar ? 'وقت قفل آخر تقييم' : 'Last assessment locked'} value={fmt(j.lockedAt[j.lockedAt.length - 1], ar)} />}
        <Row label={ar ? 'حالة النتيجة' : 'Result status'} value={status[ar ? 0 : 1]} ok={receipt.resultStatus === 'published' || receipt.resultStatus === 'sealed'} />
        {receipt.certificateId && <Row label={ar ? 'الشهادة' : 'Certificate'} value={ar ? 'صدرت' : 'Issued'} ok />}
      </dl>

      <p className="mt-6 rounded-2xl bg-[#F3F6F3] p-4 text-sm leading-7 text-[#4f5752]">{ar ? 'هذا الإيصال يخصّك وحدك: لا يحتوي درجات غيرك ولا درجات كل محكّم.' : 'This receipt is yours alone: it contains no other participant scores and no individual judge scores.'}</p>

      {hashes.length > 0 && <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-black text-[#214C40]">{ar ? 'بصمات التحقق (للمختصين)' : 'Verification fingerprints (for experts)'}</summary>
        <dl className="mt-2 space-y-2">{hashes.map(h => <div key={h.label + h.value}><dt className="text-xs text-[#646965]">{h.label}</dt><dd className="break-all font-mono text-[11px] text-[#3f4642]" dir="ltr">{h.value}</dd></div>)}</dl>
      </details>}

      <footer className="mt-6 border-t border-[#e3dfd3] pt-4 text-center text-xs text-[#6b716d]">{ar ? 'صدر في' : 'Issued'} {fmt(receipt.generatedAt, ar)} · {ar ? 'ميزان' : 'MIZAN'}</footer>
    </div>
  </div>;
};
