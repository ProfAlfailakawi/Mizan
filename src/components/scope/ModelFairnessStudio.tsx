import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, Archive, BadgeCheck, Ban, ClipboardCheck, Download, FileText, LifeBuoy,
  Layers3, LockKeyhole, RefreshCcw, ShieldAlert, Timer,
} from 'lucide-react';
import type { FairnessReportRecord, QuestionModelBatchRecord, QuestionModelRecord, QuestionQuarantineRecord } from '../../types';
import { RESERVATION_STATE_ARABIC, reservationSummary } from '../../lib/question-reservation';
import { Button } from '../design-system/Button';
import { Badge } from '../design-system/Badge';
import { EmptyState } from '../design-system/EmptyState';
import { useConfirm } from '../design-system/ConfirmDialog';

/*
 * شاشة النماذج والعدالة.
 *
 * أربعة أشياء لا تجد لها مكانًا في شاشة «النطاق» ولا «المحاكاة»، وهي مع ذلك ما يفرّق بين
 * محرّكٍ يعمل ومحرّكٍ يُدار:
 *
 *   ١) الدفعة: نولّد النماذج قبل يوم المسابقة، ونراجعها، ونعتمدها، ثم نختمها.
 *   ٢) الاحتياط: نموذجٌ جاهزٌ لمن سقط نموذجه، مربوطٌ ببصمة نطاقه لا بأي نطاق.
 *   ٣) الحجر: موضعٌ ظهر فيه عيب يُخرج من البنك، ويُقال أثره بالأرقام لا بالطمأنة.
 *   ٤) التقرير: تقرير عدالة وتوزيع الأسئلة — لا «شهادة علمية» — بلا اسم متسابق واحد.
 *
 * ولا زرّ هنا بلا أثر: كل ما يظهر يفعل شيئًا، وما لا يصلح فعله الآن يُعطَّل بسببٍ مكتوب.
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
  liftQuestionQuarantine: (id: string, reason: string) => { ok: boolean; reason?: string };
  sweepExpiredReservations: () => number;
  buildCompetitionFairnessReport: (options?: { categoryId?: string; batchId?: string }) => Promise<{ ok: boolean; reason?: string; leaks?: string[]; report?: FairnessReportRecord }>;
};

const pct = (value: number) => `${Number(value || 0).toFixed(0)}%`;

export const ModelFairnessStudio: React.FC<{ store: Store; ar: boolean; categoryId?: string }> = ({ store, ar, categoryId }) => {
  const { confirm, confirmDialog } = useConfirm(ar);
  const [reserveCount, setReserveCount] = useState(2);
  const [mode, setMode] = useState<'pre_generated' | 'hybrid'>('pre_generated');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [quarantineInput, setQuarantineInput] = useState('');
  const [quarantineReason, setQuarantineReason] = useState('');
  const [reportOpen, setReportOpen] = useState<FairnessReportRecord | null>(null);

  const models = store.questionModels.filter(m => !categoryId || m.categoryId === categoryId);
  const assigned = models.filter(m => m.participantId && m.status !== 'invalidated');
  const reserves = models.filter(m => !m.participantId && m.status === 'draft');
  const invalid = models.filter(m => m.status === 'invalidated');
  const batches = store.questionModelBatches.filter(b => !categoryId || b.categoryId === categoryId);
  const quarantines = store.questionQuarantines;
  const reservations = reservationSummary(store.questionReservations);
  const reportsList = store.fairnessReports;

  const reserveByScope = useMemo(() => {
    const map = new Map<string, number>();
    for (const model of reserves) map.set(model.scopeSignature, (map.get(model.scopeSignature) || 0) + 1);
    return [...map.entries()];
  }, [reserves]);

  const generate = async () => {
    const ok = await confirm({
      title: ar ? 'توليد دفعة نماذج؟' : 'Generate a model batch?',
      body: ar
        ? `سيُولَّد نموذج لكل متسابق له نطاق معتمد، و${reserveCount} نموذجًا احتياطيًا لكل بصمة نطاق. الدفعات السابقة لهذه الفئة تُبطَل ولا تُحذف.`
        : `A model will be generated for every participant with an approved range, plus ${reserveCount} reserves per range signature. Earlier batches are invalidated, not deleted.`,
      confirmLabel: ar ? 'ولّد الآن' : 'Generate',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const outcome = store.generateQuestionModelBatch({ categoryId, reserveCount, generationMode: mode });
      if (!outcome.ok) {
        setNotice({ tone: 'warn', text: outcome.reason === 'NO_ELIGIBLE_PARTICIPANTS'
          ? (ar ? 'لا متسابق له نطاق معتمد في هذه الفئة؛ اعتمد النطاقات أولًا.' : 'No participant has an approved range in this category.')
          : (ar ? 'البنك فارغ لهذا النطاق؛ لا يمكن التوليد.' : 'The candidate pool is empty for this range.') });
        return;
      }
      const failures = outcome.failures?.length || 0;
      setNotice({ tone: failures ? 'warn' : 'ok', text: ar
        ? `وُلّد ${outcome.models?.length || 0} نموذجًا و${outcome.reserves?.length || 0} احتياطيًا${failures ? ` — وتعذّر ${failures} (السبب مسجَّل).` : '.'}`
        : `Generated ${outcome.models?.length || 0} models and ${outcome.reserves?.length || 0} reserves${failures ? `; ${failures} failed.` : '.'}` });
    } finally { setBusy(false); }
  };

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

  const quarantine = async () => {
    const keys = quarantineInput.split(/[,\n\s]+/).map(x => x.trim()).filter(Boolean);
    if (!keys.length || !quarantineReason.trim()) {
      setNotice({ tone: 'warn', text: ar ? 'اكتب مواضع بصيغة «سورة:آية» وسببًا صريحًا للحجر.' : 'Enter loci as surah:ayah and an explicit reason.' });
      return;
    }
    if (!(await confirm({
      title: ar ? 'حجر هذه المواضع؟' : 'Quarantine these loci?',
      body: ar
        ? `سيخرج ${keys.length} موضعًا من البنك، ويُبطل كل نموذج يحملها، ويُقاس الأثر بالأرقام. لا حذف لأي تاريخ.`
        : `${keys.length} loci leave the pool, every model carrying them is invalidated, and the impact is measured. No history is deleted.`,
      confirmLabel: ar ? 'احجر' : 'Quarantine', tone: 'destructive',
    }))) return;
    const outcome = store.quarantineQuestionLoci({ locusKeys: keys, reason: quarantineReason.trim() });
    if (!outcome.ok) { setNotice({ tone: 'warn', text: ar ? 'تعذّر الحجر: راجع المواضع والسبب.' : 'Quarantine failed: check the loci and reason.' }); return; }
    setQuarantineInput(''); setQuarantineReason('');
    setNotice({ tone: outcome.record?.canContinue ? 'ok' : 'warn', text: outcome.record?.summaryArabic || '' });
  };

  const lift = async (record: QuestionQuarantineRecord) => {
    const ok = await confirm({
      title: ar ? 'رفع الحجر؟' : 'Lift the quarantine?',
      body: ar ? 'تعود المواضع إلى البنك. النماذج التي أُبطلت لا تُحيا — تُعاد توليدًا.' : 'The loci return to the pool. Invalidated models are regenerated, not revived.',
      confirmLabel: ar ? 'ارفع الحجر' : 'Lift',
    });
    if (!ok) return;
    const outcome = store.liftQuestionQuarantine(record.id, ar ? 'رفع بعد مراجعة المصدر' : 'Lifted after source review');
    setNotice(outcome.ok ? { tone: 'ok', text: ar ? 'رُفع الحجر.' : 'Quarantine lifted.' } : { tone: 'warn', text: ar ? 'تعذّر رفع الحجر.' : 'Could not lift.' });
  };

  const claim = async (participantId: string) => {
    const outcome = store.claimReserveForParticipant(participantId, ar ? 'استدعاء احتياطي من شاشة النماذج' : 'Reserve claimed from the models screen');
    setNotice(outcome.ok
      ? { tone: 'ok', text: ar ? 'خُصّص نموذج احتياطي لهذا المتسابق.' : 'A reserve model was assigned.' }
      : { tone: 'warn', text: outcome.reason === 'NO_RESERVE_FOR_THIS_SCOPE'
          ? (ar ? 'لا يوجد احتياطي مبني على بصمة نطاق هذا المتسابق. ولّد دفعة باحتياط أكبر.' : 'No reserve exists for this participant’s range signature.')
          : (ar ? 'تعذّر الاستدعاء: نطاق المتسابق غير معتمد.' : 'Claim failed: the participant range is not approved.') });
  };

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
        <div className="mizan-kicker">{ar ? 'النماذج والعدالة' : 'MODELS & FAIRNESS'}</div>
        <h2 className="mt-1 text-lg font-black">{ar ? 'قبل القاعة: تُولَّد، وتُراجَع، وتُختم' : 'Before the hall: generated, reviewed, sealed'}</h2>
        <p className="mt-1.5 max-w-2xl text-xs leading-6 text-[#666c68]">
          {ar
            ? 'التوليد المسبق يجعل النماذج قابلة للمراجعة قبل يومها، والاحتياط يجعل سقوط سؤال حادثًا لا كارثة، والحجر يخرج الموضع المعيب بأثرٍ مقيس. والتقرير في آخر الطريق: أرقامٌ بلا اسم متسابق.'
            : 'Pre-generation makes models reviewable before the day, reserves make a dropped question an incident rather than a crisis, and quarantine removes a defective locus with measured impact.'}
        </p>
      </div>

      {notice && (
        <div role="status" className={`rounded-2xl border p-3.5 text-[11px] font-bold leading-6 ${notice.tone === 'ok' ? 'border-[#cfe0d4] bg-[#eef5ef] text-[#24463a]' : 'border-[#e8d6b8] bg-[#fdf6e8] text-[#6b4f18]'}`}>
          {notice.text}
        </div>
      )}

      {/* ---- الدفعة ---- */}
      <section className="rounded-2xl border border-[#dcdad2] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-black text-[#24302b]"><Layers3 className="h-4 w-4" />{ar ? 'دفعة النماذج' : 'Model batch'}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 rounded-xl border border-[#e4e2da] bg-white px-3 py-2 text-[11px] font-bold text-[#4f5752]">
              {ar ? 'احتياطي لكل نطاق' : 'Reserves per range'}
              <input type="number" min={0} max={20} value={reserveCount} aria-label={ar ? 'عدد النماذج الاحتياطية' : 'Reserve model count'}
                onChange={e => setReserveCount(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
                className="w-14 rounded-lg border border-[#e4e2da] px-2 py-1 text-center tabular-nums" />
            </label>
            <label className="inline-flex items-center gap-2 rounded-xl border border-[#e4e2da] bg-white px-3 py-2 text-[11px] font-bold text-[#4f5752]">
              {ar ? 'وضع التوليد' : 'Mode'}
              <select value={mode} onChange={e => setMode(e.target.value as 'pre_generated' | 'hybrid')} aria-label={ar ? 'وضع التوليد' : 'Generation mode'}
                className="rounded-lg border border-[#e4e2da] bg-white px-2 py-1">
                <option value="pre_generated">{ar ? 'توليد مسبق' : 'Pre-generated'}</option>
                <option value="hybrid">{ar ? 'مختلط' : 'Hybrid'}</option>
              </select>
            </label>
            <Button size="sm" icon={<RefreshCcw className="h-4 w-4" />} loading={busy} onClick={() => void generate()}>
              {ar ? 'ولّد دفعة' : 'Generate batch'}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <Tile label={ar ? 'نماذج مخصَّصة' : 'Assigned models'} value={assigned.length} />
          <Tile label={ar ? 'نماذج احتياطية' : 'Reserve models'} value={reserves.length} />
          <Tile label={ar ? 'نماذج مُبطلة' : 'Invalidated'} value={invalid.length} tone={invalid.length ? 'warn' : 'calm'} />
          <Tile label={ar ? 'حجوزات قائمة' : 'Held reservations'} value={reservations.held} />
        </div>

        {batches.length === 0 ? (
          <EmptyState className="py-8" icon={Archive} title={ar ? 'لا دفعات بعد' : 'No batches yet'}
            hint={ar ? 'التوليد في وقته (just-in-time) يعمل بلا دفعة. الدفعة لمن يريد أن يراجع النماذج قبل يومها.' : 'Just-in-time generation works without a batch. Batches are for reviewing models ahead of the day.'} />
        ) : (
          <ul className="mt-4 space-y-2">
            {batches.map(batch => (
              <li key={batch.id} className="rounded-xl border border-[#e4e2da] bg-[#fbfaf6] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-black text-[#24302b]">
                        {ar ? `${batch.modelCount} نموذجًا · ${batch.reserveCount} احتياطيًا` : `${batch.modelCount} models · ${batch.reserveCount} reserves`}
                      </span>
                      <Badge variant={batch.approvalState === 'sealed' ? 'emerald' : batch.approvalState === 'approved' ? 'blue' : batch.approvalState === 'invalidated' ? 'rose' : 'neutral'}>
                        {batchStateLabel(batch.approvalState, ar)}
                      </Badge>
                      <Badge variant="neutral" dot={false}>{batch.generationMode === 'pre_generated' ? (ar ? 'مسبق' : 'Pre') : batch.generationMode === 'hybrid' ? (ar ? 'مختلط' : 'Hybrid') : (ar ? 'في وقته' : 'JIT')}</Badge>
                    </div>
                    <p className="mt-1 text-[10px] text-[#696f6b]">
                      {ar ? `العدالة ${pct(batch.aggregateFairness.score)} · اللائحة ${batch.policyVersion} · ${new Date(batch.createdAt).toLocaleString('ar')}` : `Fairness ${pct(batch.aggregateFairness.score)} · policy ${batch.policyVersion}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" icon={<ClipboardCheck className="h-4 w-4" />} disabled={batch.approvalState !== 'draft'} onClick={() => void decide(batch, 'approved')}>{ar ? 'اعتماد' : 'Approve'}</Button>
                    <Button size="sm" variant="outline" icon={<LockKeyhole className="h-4 w-4" />} disabled={batch.approvalState !== 'approved'} onClick={() => void decide(batch, 'sealed')}>{ar ? 'ختم' : 'Seal'}</Button>
                    <Button size="sm" variant="danger" icon={<Ban className="h-4 w-4" />} disabled={batch.approvalState === 'invalidated'} onClick={() => void decide(batch, 'invalidated')}>{ar ? 'إبطال' : 'Invalidate'}</Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- الاحتياط ---- */}
      <section className="rounded-2xl border border-[#dcdad2] bg-white p-4">
        <h3 className="flex items-center gap-2 text-sm font-black text-[#24302b]"><LifeBuoy className="h-4 w-4" />{ar ? 'الاحتياط' : 'Reserves'}</h3>
        <p className="mt-1.5 text-[11px] leading-6 text-[#666c68]">
          {ar
            ? 'الاحتياطي مربوط ببصمة نطاق بعينها. نموذجٌ من المصحف كله لا يصلح لمن نطاقه جزءٌ واحد: أسئلته خارج ما حفظ.'
            : 'A reserve is bound to one exact range signature; a whole-Quran reserve does not fit a one-juz participant.'}
        </p>
        {reserveByScope.length === 0 ? (
          <p className="mt-3 rounded-xl border border-[#e8d6b8] bg-[#fdf6e8] p-3 text-[11px] font-bold text-[#6b4f18]">
            {ar ? 'لا احتياطي جاهز. لو سقط سؤال اليوم فلا بديل مولَّدًا بالمحرك نفسه.' : 'No reserves are ready. If a question drops today there is no engine-generated substitute.'}
          </p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {reserveByScope.map(([signature, count]) => (
              <li key={signature} className="rounded-xl border border-[#e4e2da] bg-[#fbfaf6] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <code className="min-w-0 truncate text-[10px] text-[#5b6460]">{signature}</code>
                  <Badge variant={count > 1 ? 'emerald' : 'amber'}>{ar ? `${count} جاهز` : `${count} ready`}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {store.participants
            .filter(p => (!categoryId || p.categoryId === categoryId) && !['rejected', 'draft'].includes(p.status))
            .slice(0, 12)
            .map(p => (
              <Button key={p.id} size="sm" variant="ghost" onClick={() => claim(p.id)}>
                {ar ? `احتياطي لـ ${p.code}` : `Reserve for ${p.code}`}
              </Button>
            ))}
        </div>
      </section>

      {/* ---- الحجز ---- */}
      <section className="rounded-2xl border border-[#dcdad2] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-black text-[#24302b]"><Timer className="h-4 w-4" />{ar ? 'دورة حياة الحجز' : 'Reservation lifecycle'}</h3>
          <Button size="sm" variant="outline" onClick={() => {
            const freed = store.sweepExpiredReservations();
            setNotice({ tone: 'ok', text: ar ? (freed ? `أُطلق ${freed} حجزًا انقضت مدته.` : 'لا حجز منقضٍ الآن.') : (freed ? `${freed} expired reservations released.` : 'No expired reservations.') });
          }}>{ar ? 'أطلق المنقضي' : 'Sweep expired'}</Button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {(Object.keys(RESERVATION_STATE_ARABIC) as (keyof typeof RESERVATION_STATE_ARABIC)[]).map(state => (
            <Tile key={state} label={ar ? RESERVATION_STATE_ARABIC[state] : state} value={reservations.counts[state]} />
          ))}
        </div>
      </section>

      {/* ---- الحجر ---- */}
      <section className="rounded-2xl border border-[#dcdad2] bg-white p-4">
        <h3 className="flex items-center gap-2 text-sm font-black text-[#24302b]"><ShieldAlert className="h-4 w-4" />{ar ? 'حجر المواضع' : 'Locus quarantine'}</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <label className="block">
            <span className="block text-[10px] font-black tracking-[.1em] text-[#696f6b]">{ar ? 'المواضع (سورة:آية)' : 'Loci (surah:ayah)'}</span>
            <input value={quarantineInput} onChange={e => setQuarantineInput(e.target.value)} placeholder="2:255، 36:1"
              className="mizan-control mt-1 w-full px-3 py-2 text-[12px]" />
          </label>
          <label className="block">
            <span className="block text-[10px] font-black tracking-[.1em] text-[#696f6b]">{ar ? 'سبب الحجر' : 'Reason'}</span>
            <input value={quarantineReason} onChange={e => setQuarantineReason(e.target.value)} placeholder={ar ? 'خطأ في ضبط النص' : 'Text vocalisation defect'}
              className="mizan-control mt-1 w-full px-3 py-2 text-[12px]" />
          </label>
          <div className="flex items-end">
            <Button size="sm" variant="danger" icon={<AlertTriangle className="h-4 w-4" />} onClick={() => void quarantine()}>{ar ? 'احجر' : 'Quarantine'}</Button>
          </div>
        </div>
        {quarantines.length > 0 && (
          <ul className="mt-4 space-y-2">
            {quarantines.map(record => (
              <li key={record.id} className={`rounded-xl border p-3 ${record.status === 'active' ? 'border-[#e8c4c4] bg-[#fdf1f1]' : 'border-[#e4e2da] bg-[#fbfaf6]'}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={record.status === 'active' ? 'rose' : 'neutral'}>{record.status === 'active' ? (ar ? 'ساري' : 'Active') : (ar ? 'مرفوع' : 'Lifted')}</Badge>
                      <span className="text-[12px] font-black text-[#24302b]">{record.locusKeys.join('، ')}</span>
                      {!record.canContinue && <Badge variant="rose">{ar ? 'البنك لا يكفي' : 'Pool exhausted'}</Badge>}
                    </div>
                    <p className="mt-1 text-[11px] leading-6 text-[#5b6460]">{ar ? record.summaryArabic : record.summaryEnglish}</p>
                    <p className="mt-0.5 text-[10px] text-[#696f6b]">{ar ? `السبب: ${record.reason}` : `Reason: ${record.reason}`}</p>
                  </div>
                  {record.status === 'active' && (
                    <Button size="sm" variant="outline" onClick={() => void lift(record)}>{ar ? 'ارفع الحجر' : 'Lift'}</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

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
