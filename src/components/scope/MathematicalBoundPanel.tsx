import React, { useState } from 'react';
import { AlertTriangle, BadgeCheck, ChevronDown, Scale, Sigma, Target } from 'lucide-react';
import type { OracleBenchmarkResult } from '../../lib/oracle-benchmark';
import { Button } from '../design-system/Button';
import { Badge } from '../design-system/Badge';
import { EmptyState } from '../design-system/EmptyState';

/*
 * الحدّ الرياضي — الطبقة التي لم تكن موجودة.
 *
 * شاشات العدالة في ميزان تقول: ما فعله المحرّك. وهذه تقول ما لا تقوله: **ما كان أفضل ما
 * يمكن فعله؟** والفرق بينهما هو الفرق بين «توزيعٌ جيد» و«لا توزيع أفضل منه بهذا البنك».
 *
 * والعرض متدرّج عمدًا:
 *
 *   · المنظّم يرى ثلاثة أسطر: الحدّ الرياضي الأفضل، وما بلغه ميزان، وهل بينهما فارق مُثبَت.
 *   · والخبير يفتح التفاصيل فيرى: الأبعاد كلها، والندم، والحدود الدنيا، والشواهد.
 *
 * ولغةُ هذه الشاشة مقيّدة: لا تُكتب «مثالي» إلا إذا أثبته الحلّال، ولا «مستحيل» إلا بشاهد.
 * وما دون ذلك يُقال بلفظه: «أفضل حلّ معروف»، «حدّ أدنى مُثبَت»، «لم يُحسم».
 */

type OracleOutcome =
  | { ok: true; result: OracleBenchmarkResult; headline: string; syntheticData: boolean }
  | { ok: false; reason: string; loci?: number; maxLoci?: number };

const STATUS_LABEL: Record<string, string> = {
  proven_optimal: 'أمثل مُثبَت',
  proven_infeasible: 'استحالة مُثبَتة',
  best_known: 'أفضل حلّ معروف',
  instance_too_large: 'أكبر من ميزانية الحلّال',
  not_attempted: 'لم يُسأل',
};

const REASON_LABEL: Record<string, string> = {
  NO_PARTICIPANTS_TO_ANALYSE: 'لا يوجد متسابقون بنطاقٍ صالح لتحليلهم.',
  NO_ELIGIBLE_POOL: 'لا يوجد بنك أسئلة صالح لهذه النطاقات.',
  INSTANCE_TOO_LARGE: 'المسألة أكبر من ميزانية الحلّال المعلنة، ولا يُدَّعى لها أمثلٌ مقرَّب.',
};

export const MathematicalBoundPanel: React.FC<{
  ar: boolean;
  busy?: boolean;
  outcome: OracleOutcome | null;
  onRun: (participantCount?: number) => void;
}> = ({ ar, busy, outcome, onRun }) => {
  const [expert, setExpert] = useState(false);
  const [sample, setSample] = useState(0);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="mizan-kicker">{ar ? 'الحدّ الرياضي' : 'MATHEMATICAL BOUND'}</div>
          <h2 className="mt-1 text-xl font-black sm:text-2xl">{ar ? 'ما أفضل ما كان ممكنًا؟ وكم بَعُد ميزان عنه؟' : 'What was mathematically best, and how far is Mizan from it?'}</h2>
          <p className="mt-2 max-w-2xl text-xs leading-6 text-[#666c68]">
            {ar
              ? 'هذا ليس محرّك السحب. محرّك السحب يعمل على الخط ولا يعرف من سيأتي بعد. وهذا يحلّ المسألة كاملةً خارج الخط، فيقول الحدّ الذي لا ينزل تحته أيُّ توزيع — ثم يقارن. ولا يُشغَّل أثناء المسابقة.'
              : 'This is not the draw engine. The draw engine works online and cannot see who comes next. This solves the whole problem offline and states the bound no allocation can beat — then compares. It never runs during the competition.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 rounded-full border border-[#dcdad2] bg-white px-3 py-2 text-[11px] font-black text-[#5b6460]">
            {ar ? 'عدد المتسابقين' : 'Participants'}
            <input type="number" min={0} value={sample || ''} placeholder={ar ? 'الفعلي' : 'actual'}
              onChange={event => setSample(Math.max(0, Number(event.target.value) || 0))}
              className="w-20 rounded-lg border border-[#dcdad2] px-2 py-1 text-center text-xs font-bold" />
          </label>
          <Button onClick={() => onRun(sample || undefined)} disabled={busy} icon={Sigma}>
            {busy ? (ar ? 'يُحلّ…' : 'Solving…') : (ar ? 'اسأل المِرصد' : 'Ask the oracle')}
          </Button>
        </div>
      </header>

      {!outcome && (
        <EmptyState icon={Scale}
          title={ar ? 'لم يُسأل المِرصد بعد' : 'The oracle has not been asked yet'}
          hint={ar
            ? 'اضغط «اسأل المِرصد» ليُحسب أفضل توزيع ممكن رياضيًا لهذه المسابقة، ثم يُقارن به ما يفعله المحرّك. الحساب ثقيل ولا يُشغَّل تلقائيًا.'
            : 'Run it to compute the mathematically best allocation for this competition and compare the engine against it. It is expensive, so it never runs on its own.'} />
      )}

      {outcome && !outcome.ok && (
        <div className="rounded-2xl border border-[#e0c6c1] bg-[#F9F0EE] p-5 text-sm font-bold text-[#7a3b31]" role="status">
          <AlertTriangle className="mb-2 h-5 w-5" />
          {REASON_LABEL[outcome.reason] || outcome.reason}
          {outcome.loci !== undefined && (
            <p className="mt-1 text-xs font-medium">{ar ? `المواضع ${outcome.loci} والحدّ المعلن ${outcome.maxLoci}. صغّر العيّنة أو ارفع الحدّ.` : `Loci ${outcome.loci} against a declared cap of ${outcome.maxLoci}.`}</p>
          )}
        </div>
      )}

      {outcome?.ok && <Headline ar={ar} outcome={outcome} />}

      {outcome?.ok && (
        <button type="button" onClick={() => setExpert(value => !value)}
          className="inline-flex items-center gap-2 rounded-full border border-[#dcdad2] bg-white px-3.5 py-2 text-[11px] font-black text-[#5b6460]">
          <ChevronDown className={`h-4 w-4 transition ${expert ? 'rotate-180' : ''}`} />
          {expert ? (ar ? 'إخفاء تفاصيل الخبير' : 'Hide expert detail') : (ar ? 'تفاصيل الخبير' : 'Expert detail')}
        </button>
      )}

      {outcome?.ok && expert && <ExpertDetail ar={ar} result={outcome.result} />}
    </div>
  );
};

/*
 * السطور الثلاثة التي يراها المنظّم.
 *
 * ولا يُقال فيها «ممتاز» ولا «مثالي»: يُقال الرقمان والفارق بينهما. فمن بلغ الحدّ قيل بلغه،
 * ومن زاد قيل بكم زاد، ومن لم يُحسم أمره قيل لم يُحسم.
 */
const Headline: React.FC<{ ar: boolean; outcome: Extract<OracleOutcome, { ok: true }> }> = ({ ar, outcome }) => {
  const { result } = outcome;
  const maxReuse = result.gap.dimensions.find(row => row.dimension === 'max_reuse');
  const proven = result.minMaxReuse.status === 'proven_optimal';
  const infeasible = result.minMaxReuse.status === 'proven_infeasible';
  const matched = proven && (maxReuse?.gap ?? 1) <= 0;

  return (
    <div className={`rounded-2xl border p-5 ${infeasible ? 'border-[#e0c6c1] bg-[#F9F0EE]' : matched ? 'border-[#cddbd3] bg-[#F7FAF8]' : 'border-[#e6d9b8] bg-[#FBF7EC]'}`} role="status">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {matched ? <BadgeCheck className="h-5 w-5 text-[#214C40]" /> : <Target className="h-5 w-5 text-[#7a6a33]" />}
          <span className="text-sm font-black">{STATUS_LABEL[result.minMaxReuse.status] || result.minMaxReuse.status}</span>
        </div>
        {outcome.syntheticData && <Badge variant="blue">{ar ? 'بيانات اصطناعية' : 'Synthetic data'}</Badge>}
      </div>

      {infeasible ? (
        <dl className="mt-3 space-y-1.5 text-sm font-bold text-[#24302b]">
          <Row ar={ar} label={ar ? 'لا يوجد توزيع يحقق هذه القيود' : 'No allocation satisfies these constraints'} value={ar ? 'مُثبَت بشاهد' : 'proven with a witness'} />
          <Row ar={ar} label={ar ? 'أقلّ عدد مواضع إضافية' : 'Minimum additional loci'} value={result.minMaxReuse.feasibility.minimumAdditionalLoci} />
          {result.minMaxReuse.feasibility.certificates[0] && (
            <p className="pt-1 text-xs font-medium leading-6 text-[#7a3b31]">{result.minMaxReuse.feasibility.certificates[0].ar}</p>
          )}
        </dl>
      ) : (
        <dl className="mt-3 space-y-1.5 text-sm font-bold text-[#24302b]">
          <Row ar={ar} label={ar ? 'الحدّ الرياضي الأفضل' : 'Best possible'} value={proven ? result.minMaxReuse.provenOptimum : `≥ ${result.minMaxReuse.provenLowerBound}`} />
          <Row ar={ar} label={ar ? 'ميزان حقّق' : 'Mizan reached'} value={result.achievedMetrics.maxReuse} />
          <Row ar={ar}
            label={ar ? 'الفارق' : 'Difference'}
            value={!proven ? (ar ? 'لم يُحسم' : 'undecided') : matched ? (ar ? 'لا يوجد فارق مثبت' : 'no proven difference') : `+${maxReuse?.gap}`} />
        </dl>
      )}
      <p className="mt-3 text-xs font-medium leading-6 text-[#666c68]">
        {infeasible
          ? (ar ? 'الاستحالة هنا رياضية لا خلل في المحرّك: لا خوارزمية تستطيع ما لا يستطيعه العدد.' : 'The impossibility is mathematical, not an engine defect.')
          : matched
            ? (ar ? 'بلغ المحرّك الحدّ الذي لا ينزل تحته أيُّ توزيع بهذا البنك وهذه القيود. وما زاد عن ذلك من تكرارٍ فرضته الرياضيات لا الخوارزمية.' : 'The engine reached the bound no allocation can beat with this pool and these constraints.')
            : proven
              ? (ar ? 'الفارق أعلاه نقصٌ في جودة التوزيع لا في حجم البنك — وهو قابل للإصلاح.' : 'The difference above is distribution quality, not pool size.')
              : (ar ? 'لم يثبت الحلّال الأمثل داخل الميزانية المعلنة؛ المعروض حدٌّ أدنى مُثبَت لا أمثلٌ مُثبَت.' : 'The solver did not prove optimality within the declared budget; what is shown is a proven lower bound.')}
      </p>
    </div>
  );
};

const Row: React.FC<{ ar: boolean; label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-dotted border-[#dcdad2] pb-1.5 last:border-0">
    <dt className="text-xs font-bold text-[#5b6460]">{label}</dt>
    <dd className="text-base font-black tabular-nums">{value}</dd>
  </div>
);

const ExpertDetail: React.FC<{ ar: boolean; result: OracleBenchmarkResult }> = ({ ar, result }) => (
  <div className="space-y-4">
    <section className="mizan-surface p-4">
      <h3 className="text-sm font-black">{ar ? 'الفجوة عن الأمثل، بُعدًا بُعدًا' : 'Optimality gap, dimension by dimension'}</h3>
      <p className="mt-1 text-[11px] font-medium leading-5 text-[#666c68]">
        {ar
          ? 'كل بُعدٍ يُحلّ وحده: فالأمثل في «أقلّ تكرار» ليس هو الأمثل في «تكافؤ الصعوبة». ولا تُجمع هذه في نسبةٍ واحدة، لأن الجمع يخفي أيَّها تدهور.'
          : 'Each dimension is solved alone; they are never averaged into one score, because averaging hides which one regressed.'}
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs">
          <thead className="text-[#5b6460]">
            <tr className="border-b border-[#dcdad2]">
              <th className="py-1.5 text-start font-black">{ar ? 'البُعد' : 'Dimension'}</th>
              <th className="py-1.5 text-end font-black">{ar ? 'الأمثل' : 'Optimum'}</th>
              <th className="py-1.5 text-end font-black">{ar ? 'ميزان' : 'Mizan'}</th>
              <th className="py-1.5 text-end font-black">{ar ? 'الفجوة' : 'Gap'}</th>
              <th className="py-1.5 text-end font-black">{ar ? 'الحال' : 'Status'}</th>
            </tr>
          </thead>
          <tbody>
            {result.gap.dimensions.map(row => (
              <tr key={row.dimension} className="border-b border-dotted border-[#e8e5dc]">
                <td className="py-1.5 font-bold">{ar ? row.ar : row.dimension}</td>
                <td className="py-1.5 text-end tabular-nums">{row.optimum ?? '—'}</td>
                <td className="py-1.5 text-end tabular-nums">{row.achieved}</td>
                <td className={`py-1.5 text-end font-black tabular-nums ${row.gap === null ? 'text-[#5b6460]' : row.gap > 0 ? 'text-[#a2503f]' : 'text-[#214C40]'}`}>
                  {row.gap === null ? (ar ? 'لم يُحسم' : 'undecided') : row.gap === 0 ? (ar ? 'صفر' : 'zero') : `+${row.gap}`}
                </td>
                <td className="py-1.5 text-end text-[10px] font-bold text-[#5b6460]">{STATUS_LABEL[row.status] || row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>

    <section className="mizan-surface p-4">
      <h3 className="text-sm font-black">{ar ? 'الحدود الدنيا' : 'Lower bounds'}</h3>
      <dl className="mt-2 space-y-1.5">
        <Row ar={ar} label={ar ? 'الحدّ السريع (المستعمل في التقارير)' : 'Fast bound'} value={result.fastLowerBound} />
        <Row ar={ar}
          label={ar ? 'الحدّ القويّ (بإرخاء التدفّق)' : 'Strong bound (flow relaxation)'}
          value={result.strongLowerBound.infeasible ? (ar ? 'لا حدَّ أدنى: مستحيل' : 'no bound: infeasible') : result.strongLowerBound.bound} />
        <Row ar={ar} label={ar ? 'عدد فحوص الحلّال' : 'Solver probes'} value={result.minMaxReuse.probes} />
        <Row ar={ar} label={ar ? 'زمن التحليل' : 'Analysis time'} value={`${result.elapsedMs} ms`} />
      </dl>
      <p className="mt-2 text-[11px] font-medium leading-5 text-[#666c68]">
        {ar
          ? 'الحدّ السريع يبقى كما هو في تقارير العدالة؛ والقويّ يُحسب هنا وحده لأنه أبطأ. وحدٌّ أدنى يعلو على الأمثل الحقيقي ليس حدًّا أدنى بل خطأ — وهذا مفحوصٌ بالعدّ الشامل على حالاتٍ صغيرة.'
          : 'The fast bound stays in the fairness reports; the strong one is computed only here. A lower bound above the true optimum is not a bound but a bug — checked exhaustively on small cases.'}
      </p>
    </section>

    {result.regret && (
      <section className="mizan-surface p-4">
        <h3 className="text-sm font-black">{ar ? 'ندم العدالة' : 'Fairness regret'}</h3>
        <p className="mt-1 text-[11px] font-medium leading-6 text-[#666c68]">
          {ar
            ? 'ما خسره ميزان لأنه يعمل على الخط ولا يعرف الغيب: يُعاد حلّ المسألة بمعرفةٍ تامّة بعد انتهائها، ثم يُقاس الفرق. وهذا وحده القياس الصادق لنجاح «حماية المتسابقين القادمين».'
            : 'What Mizan lost by working online without knowledge of the future — the honest measure of future-contestant protection.'}
        </p>
        <dl className="mt-2 space-y-1.5">
          <Row ar={ar} label={ar ? 'الندم الكلي على الهدف المعلن' : 'Total regret'} value={result.regret.totalRegret ?? (ar ? 'لم يُحسم' : 'undecided')} />
          {result.regret.regret.filter(row => (row.gap ?? 0) > 0).slice(0, 4).map(row => (
            <Row key={row.dimension} ar={ar} label={row.ar} value={`+${row.gap}`} />
          ))}
        </dl>
      </section>
    )}

    {result.minMaxReuse.feasibility.certificates.length > 0 && (
      <section className="mizan-surface p-4">
        <h3 className="text-sm font-black">{ar ? 'شواهد الاستحالة' : 'Impossibility certificates'}</h3>
        <ul className="mt-2 space-y-2">
          {result.minMaxReuse.feasibility.certificates.slice(0, 4).map((certificate, index) => (
            <li key={`${certificate.kind}-${index}`} className="rounded-xl border border-[#e0c6c1] bg-[#F9F0EE] p-3 text-xs font-bold leading-6 text-[#7a3b31]">
              {ar ? certificate.ar : certificate.en}
              <span className="mt-1 block text-[10px] font-medium text-[#7a3b31]">
                {ar ? 'القيود الحابسة: ' : 'Binding constraints: '}{certificate.bindingConstraints.join('، ')}
              </span>
            </li>
          ))}
        </ul>
      </section>
    )}
  </div>
);
