import React, { useMemo, useState } from 'react';
import { BadgeCheck, Download, FileText } from 'lucide-react';
import type { ExposureProfile } from '../../lib/exposure-risk';
import type { FairnessReportRecord, QuestionModelBatchRecord, QuestionModelRecord, QuestionQuarantineRecord } from '../../types';
import { RESERVATION_STATE_ARABIC, reservationSummary } from '../../lib/question-reservation';
import { Button } from '../design-system/Button';
import { Badge } from '../design-system/Badge';
import { EmptyState } from '../design-system/EmptyState';
import { useConfirm } from '../design-system/ConfirmDialog';

/*
 * تقرير عدالة وتوزيع الأسئلة.
 *
 * كانت هذه الشاشة تعرض آلة التوليد كلها: دفعات النماذج، والاحتياط، ودورة حياة الحجز،
 * وأعلى المواضع انكشافًا، وحجر المواضع. وهي مفاهيم داخلية لا تعني الجهة في شيء — قال
 * صاحب المسابقة إنها تُخربط عليه، وهو محقّ: التوليد يعمل في وقته بلا دفعة ولا احتياط،
 * فكانت أزرارًا تطلب منه قرارًا لا يملك أساسه.
 *
 * فبقي ما يعنيه وحده: هل تكافأت الأسئلة بين المتسابقين؟ تقريرٌ بأرقام بلا اسم متسابق.
 */

type Store = {
  language: string;
  competition: { id: string; categories: { id: string; name: string; nameArabic: string }[] };
  participants: { id: string; code: string; fullName: string; fullNameArabic?: string; categoryId: string; status: string }[];
  questionModels: QuestionModelRecord[];
  questionModelBatches: QuestionModelBatchRecord[];
  questionQuarantines: QuestionQuarantineRecord[];
  questionReservations: Parameters<typeof reservationSummary>[0];
  fairnessReports: FairnessReportRecord[];
  generateQuestionModelBatch: (options?: { categoryId?: string; reserveCount?: number; generationMode?: 'pre_generated' | 'hybrid' }) => { ok: boolean; reason?: string; models?: QuestionModelRecord[]; reserves?: QuestionModelRecord[]; failures?: { participantId: string; code: string; ar: string }[] };
  decideModelBatch: (batchId: string, decision: 'approved' | 'sealed' | 'invalidated', reason?: string) => { ok: boolean; reason?: string };
  claimReserveForParticipant: (participantId: string, reason: string) => { ok: boolean; reason?: string };
  quarantineQuestionLoci: (input: { locusKeys: string[]; reason: string; severity?: QuestionQuarantineRecord['severity'] }) => { ok: boolean; reason?: string; record?: QuestionQuarantineRecord };
  recoverQuarantinedLoci: (input: { locusKeys: string[]; reason: string; categoryId?: string }) => { ok: boolean; reason?: string; record?: QuestionQuarantineRecord; outcome?: { recovered: { participantId: string; via: 'reserve' | 'regenerated' }[]; unrecovered: { participantId: string; ar: string }[]; summaryArabic: string; summaryEnglish: string } };
  liftQuestionQuarantine: (id: string, reason: string) => { ok: boolean; reason?: string };
  sweepExpiredReservations: () => number;
  exposureProfiles: () => Map<string, ExposureProfile>;
  buildCompetitionFairnessReport: (options?: { categoryId?: string; batchId?: string }) => Promise<{ ok: boolean; reason?: string; leaks?: string[]; report?: FairnessReportRecord }>;
};

const pct = (value: number) => `${Number(value || 0).toFixed(0)}%`;

export const ModelFairnessStudio: React.FC<{ store: Store; ar: boolean; categoryId?: string }> = ({ store, ar, categoryId }) => {
  const { confirm, confirmDialog } = useConfirm(ar);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState<FairnessReportRecord | null>(null);

  const reportsList = store.fairnessReports;


  const decide = async (batch: QuestionModelBatchRecord, decision: 'approved' | 'sealed' | 'invalidated') => {
    const label = decision === 'approved' ? (ar ? 'اعتماد' : 'Approve') : decision === 'sealed' ? (ar ? 'ختم' : 'Seal') : (ar ? 'إبطال' : 'Invalidate');
    if (!(await confirm({
      title: `${label} ${ar ? 'الدفعة؟' : 'batch?'}`,
      body: decision === 'sealed'
        ? (ar ? 'بعد الختم تُنفَّذ نماذج هذه الدفعة في القاعة كما هي، ولا يُعاد السحب لمن له نموذج فيها.' : 'Once sealed, this batch is executed as-is in the hall; no draw runs for its participants.')
        : decision === 'invalidated'
          ? (ar ? 'ستُبطل كل نماذج هذه الدفعة غير المستهلكة. لا يُحذف شيء، ويبقى الأثر.' : 'Every unconsumed model in this batch is invalidated. Nothing is deleted.')
          : (ar ? 'اعتماد الدفعة خطوة قبل الختم؛ تبقى قابلة للإبطال.' : 'Approval precedes sealing; the batch stays revocable.'),
      confirmLabel: label, ...(decision === 'invalidated' ? { tone: 'destructive' as const } : {}),
    }))) return;
    const outcome = store.decideModelBatch(batch.id, decision);
    setNotice(outcome.ok
      ? { tone: 'ok', text: ar ? `تم ${label}.` : `${label} done.` }
      : { tone: 'warn', text: ar ? 'تعذّر تنفيذ القرار على هذه الدفعة بحالتها الحالية.' : 'That decision does not apply to this batch in its current state.' });
  };

  /*
   * الحجر مع الاسترداد: خطوةٌ واحدة بدل أربع.
   *
   * الحجر وحده يترك المتأثرين بلا نماذج، والمنظم في القاعة لا يملك ترف تنفيذ أربع خطواتٍ
   * بيده والمتسابق واقفٌ أمام اللجنة. وما لم يُسترد يُقال باسمه لا يُبتلع.
   */




  const buildReport = async () => {
    setBusy(true);
    try {
      const outcome = await store.buildCompetitionFairnessReport({ categoryId });
      if (!outcome.ok) {
        setNotice({ tone: 'warn', text: outcome.reason === 'PRIVACY_VIOLATION'
          ? (ar ? 'أُوقف التقرير: ظهر فيه ما يدل على متسابق بعينه، ولم يُحفظ.' : 'Report blocked: it referenced an identifiable participant and was not saved.')
          : (ar ? 'لا نماذج معتمدة بعد لإصدار تقرير عنها.' : 'There are no valid models to report on yet.') });
        return;
      }
      if (outcome.report) setReportOpen(outcome.report);
      setNotice({ tone: 'ok', text: ar ? 'صدر تقرير عدالة وتوزيع الأسئلة.' : 'Fairness and distribution report issued.' });
    } finally { setBusy(false); }
  };

  const download = (report: FairnessReportRecord) => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `mizan-fairness-report-${report.id}.json`;
    document.body.appendChild(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div>
        <div className="mizan-kicker">{ar ? 'عدالة التوزيع' : 'DISTRIBUTION FAIRNESS'}</div>
        <h2 className="mt-1 text-lg font-black">{ar ? 'هل نال الجميع أسئلةً متكافئة؟' : 'Did everyone get comparable questions?'}</h2>
        <p className="mt-1.5 max-w-2xl text-xs leading-6 text-[#666c68]">
          {ar
            ? 'تقريرٌ واحد يُجيب عن سؤالٍ واحد: هل تكافأت الأسئلة بين المتسابقين؟ أرقامٌ بلا اسم متسابق، تُصدَّر وتُحفظ.'
            : 'One report answering one question: were questions comparable across participants? Figures only, no participant names.'}
        </p>
      </div>

      {notice && (
        <div role="status" className={`rounded-2xl border p-3.5 text-[11px] font-bold leading-6 ${notice.tone === 'ok' ? 'border-[#cfe0d4] bg-[#eef5ef] text-[#24463a]' : 'border-[#e8d6b8] bg-[#fdf6e8] text-[#6b4f18]'}`}>
          {notice.text}
        </div>
      )}

      {/* ---- التقرير ---- */}
      <section className="rounded-2xl border border-[#dcdad2] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-black text-[#24302b]"><FileText className="h-4 w-4" />{ar ? 'تقرير عدالة وتوزيع الأسئلة' : 'Fairness and distribution report'}</h3>
          <Button size="sm" icon={<BadgeCheck className="h-4 w-4" />} loading={busy} onClick={() => void buildReport()}>{ar ? 'أصدر التقرير' : 'Issue report'}</Button>
        </div>
        <p className="mt-1.5 text-[11px] leading-6 text-[#666c68]">
          {ar
            ? 'ليس شهادة علمية — لا جهة علمية أصدرته. هو بيان ما فعله المحرك بالأرقام، وفيه الحدّ الأدنى الرياضي للتكرار وكم زدنا عليه. وبلا اسم متسابق ولا كوده.'
            : 'Not a scientific certificate — no scientific body issued it. It states what the engine did, including the mathematical reuse bound and our excess over it, with no participant identities.'}
        </p>
        {reportsList.length === 0 ? (
          <EmptyState className="py-8" icon={FileText} title={ar ? 'لا تقارير بعد' : 'No reports yet'}
            hint={ar ? 'أصدر تقريرًا بعد أن تتوافر نماذج معتمدة.' : 'Issue one once valid models exist.'} />
        ) : (
          <ul className="mt-3 space-y-2">
            {reportsList.map(report => (
              <li key={report.id} className="rounded-xl border border-[#e4e2da] bg-[#fbfaf6] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-black text-[#24302b]">{ar ? report.titleArabic : report.titleEnglish}</p>
                    <p className="mt-0.5 text-[10px] text-[#696f6b]">{new Date(report.generatedAt).toLocaleString(ar ? 'ar' : 'en')} · <code>{report.reportHash.slice(0, 16)}</code></p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setReportOpen(report)}>{ar ? 'اعرض' : 'View'}</Button>
                    <Button size="sm" variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => download(report)}>{ar ? 'نزّل' : 'Download'}</Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {reportOpen && <ReportView report={reportOpen} ar={ar} onClose={() => setReportOpen(null)} />}
      </section>
    </div>
  );
};

const Tile: React.FC<{ label: string; value: number; tone?: 'calm' | 'warn' }> = ({ label, value, tone = 'calm' }) => (
  <div className={`rounded-xl border p-3 ${tone === 'warn' ? 'border-[#e8d6b8] bg-[#fdf6e8]' : 'border-[#e4e2da] bg-[#fbfaf6]'}`}>
    <div className="text-[10px] font-black tracking-[.08em] text-[#696f6b]">{label}</div>
    <div className="mt-1 text-lg font-black tabular-nums text-[#24302b]">{value}</div>
  </div>
);

const batchStateLabel = (state: QuestionModelBatchRecord['approvalState'], ar: boolean) =>
  state === 'draft' ? (ar ? 'مسودة' : 'Draft')
    : state === 'approved' ? (ar ? 'معتمدة' : 'Approved')
      : state === 'sealed' ? (ar ? 'مختومة' : 'Sealed')
        : (ar ? 'مُبطلة' : 'Invalidated');

const ReportView: React.FC<{ report: FairnessReportRecord; ar: boolean; onClose: () => void }> = ({ report, ar, onClose }) => (
  <div className="mt-4 rounded-2xl border border-[#dcdad2] bg-[#fbfaf6] p-4">
    <div className="flex items-start justify-between gap-2">
      <h4 className="text-sm font-black text-[#24302b]">{ar ? report.titleArabic : report.titleEnglish}</h4>
      <Button size="sm" variant="ghost" onClick={onClose}>{ar ? 'إغلاق' : 'Close'}</Button>
    </div>
    <div className="mt-3 space-y-4">
      {report.sections.map(section => (
        <div key={section.id}>
          <div className="mizan-kicker">{ar ? section.titleArabic : section.titleEnglish}</div>
          <dl className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
            {section.rows.map((row, index) => (
              <div key={`${section.id}-${index}`} className="rounded-xl border border-[#e4e2da] bg-white px-3 py-2">
                <dt className="text-[10px] font-black text-[#696f6b]">{ar ? row.labelArabic : row.labelEnglish}</dt>
                <dd className="mt-0.5 text-[12px] font-black tabular-nums text-[#24302b]">{row.value}</dd>
                {row.note && <p className="mt-0.5 text-[10px] leading-5 text-[#5b6460]">{row.note}</p>}
              </div>
            ))}
          </dl>
        </div>
      ))}
      {report.findings.length > 0 && (
        <ul className="space-y-1.5">
          {report.findings.map(finding => (
            <li key={finding.id} className="flex items-start gap-2 rounded-xl border border-[#e4e2da] bg-white px-3 py-2 text-[11px] leading-6 text-[#4f5752]">
              <Badge variant={finding.severity === 'critical' ? 'rose' : finding.severity === 'warning' ? 'amber' : finding.severity === 'passed' ? 'emerald' : 'blue'}>
                {severityLabel(finding.severity, ar)}
              </Badge>
              <span className="min-w-0">{ar ? finding.ar : finding.en}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="rounded-xl border border-[#e4e2da] bg-white p-3 text-[10px] leading-6 text-[#5b6460]">{ar ? report.honestyNoteArabic : report.honestyNoteEnglish}</p>
      <p className="text-[10px] text-[#696f6b]">{ar ? 'بصمة التقرير' : 'Report hash'}: <code>{report.reportHash}</code></p>
    </div>
  </div>
);

const severityLabel = (severity: string, ar: boolean) =>
  severity === 'critical' ? (ar ? 'حرج' : 'Critical')
    : severity === 'warning' ? (ar ? 'تنبيه' : 'Warning')
      : severity === 'passed' ? (ar ? 'سليم' : 'Passed')
        : (ar ? 'توصية' : 'Recommendation');
