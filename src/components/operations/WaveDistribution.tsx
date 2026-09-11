import React, { useState } from 'react';
import { ListChecks, ShieldCheck, Shuffle, TriangleAlert } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { Button } from '../design-system/Button';
import { Badge } from '../design-system/Badge';
import type { DistributionPlan } from '../../lib/distribution-plan';

/*
 * توزيع الموجة.
 *
 * البوابة تُسند كل واصلٍ وحده. وحين لا تؤهّله أيُّ لجنة يدخل الطابور برقمه بلا إسناد —
 * حالةٌ تُعلَن على شاشة القاعة وتُفتح لها حادثة، ولم يكن لها أداة. هذه هي: تُوزَّع الدفعة
 * كلّها مرّة واحدة بقيود عدالة، وتُعرض الخطة قبل تنفيذها.
 *
 * والنظام يقترح ولا ينفّذ: الخطة تُبنى ويوقّعها إنسان، كما تفعل مرونة اللجان. وتُعاد بناؤها
 * عند التوقيع ويُقارَن التزامها — فخطةٌ شاخت بين اللحظتين تُرفض بدل أن تُنفَّذ على واقعٍ
 * لم تعد تصفه.
 */

export const WaveDistribution: React.FC = () => {
  const s = useAppStore();
  const ar = s.language === 'ar';
  const [plan, setPlan] = useState<DistributionPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [allowException, setAllowException] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const waitingUnrouted = s.participants.filter(p => p.competitionId === s.competition.id && p.status === 'in_queue' && !p.assignedCommitteeId);
  if (!waitingUnrouted.length && !plan) return null;

  const build = async () => {
    setBusy(true); setResult(null);
    try {
      const next = await s.buildDistributionPlan(undefined, { allowCategoryException: allowException });
      setPlan(next);
      if (!next) setResult({ ok: false, message: ar ? 'لا يوجد من ينتظر بلا لجنة الآن.' : 'Nobody is waiting without a panel right now.' });
    } finally { setBusy(false) }
  };

  const apply = async () => {
    if (!plan) return;
    setBusy(true); setResult(null);
    try {
      const out = await s.applyDistributionPlan(plan);
      if (out.ok) {
        setResult({ ok: true, message: ar ? `نُفِّذت الخطة: أُسند ${out.assigned} متسابقًا مع حفظ أسبقية الوصول.` : `Applied: ${out.assigned} participants routed, arrival priority preserved.` });
        setPlan(null);
      } else setResult({ ok: false, message: reasonText(out.reason, ar) });
    } finally { setBusy(false) }
  };

  return <section className="mizan-surface p-5 sm:p-6">
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-xl bg-[#E7EEE9] text-[#214C40] grid place-items-center"><Shuffle className="w-5 h-5" /></span>
        <div>
          <div className="mizan-kicker">{ar ? 'توزيع الموجة' : 'WAVE DISTRIBUTION'}</div>
          <h2 className="font-black mt-1">{ar ? 'وزّع المنتظرين بلا لجنة دفعةً واحدة' : 'Route everyone waiting without a panel, in one batch'}</h2>
          <p className="text-[11px] text-[#646965] mt-2 max-w-2xl leading-5">
            {ar
              ? 'الدفعة ترى التركيبة كلّها فتوازن بالدقائق لا بالرؤوس، وتمنع وقوع وفدٍ كامل تحت لجنةٍ واحدة، وتحسم التعادل الحقيقي بقرعةٍ ملتزمة ببصمة. والأسبقية لا تُمسّ: يتغيّر بابه ولا يتغيّر دوره.'
              : 'A batch sees the whole intake: it balances minutes rather than heads, keeps one delegation from filling a panel, and settles genuine ties with a committed draw. Arrival priority is untouched.'}
          </p>
        </div>
      </div>
      <Badge variant="emerald">{ar ? 'سجل تدقيق' : 'Audited'}</Badge>
    </div>

    <div className="mt-5 flex flex-wrap items-center gap-3">
      <div className="rounded-2xl bg-[#F2EADC] text-[#725630] px-4 py-3 flex items-center gap-2.5">
        <TriangleAlert className="w-4 h-4 shrink-0" aria-hidden />
        <span className="text-xs font-black">{ar ? `${waitingUnrouted.length} في الانتظار بلا لجنة` : `${waitingUnrouted.length} waiting without a panel`}</span>
      </div>
      <Button onClick={() => void build()} loading={busy} disabled={!waitingUnrouted.length} icon={<ListChecks className="w-4 h-4" />}>
        {ar ? 'ابنِ خطة التوزيع' : 'Build distribution plan'}
      </Button>
    </div>

    {/*
      من لا لجنة لفئته لا تصله «عدالة الطابور» أصلًا — تحتاج لجنةَ مصدر وهو بلا لجنة.
      فهذا هو الباب الوحيد إليه: استثناءٌ يُطلب صراحةً، وأسئلته تبقى أسئلة فئته، وتُوسَم
      حالته فتعلم اللجنة أنها تحكم من ليس من فئتها.
    */}
    <label className="mt-3 flex items-start gap-2.5 rounded-2xl border border-[#e0d3b8] bg-[#fffaf0] p-3.5 cursor-pointer">
      <input type="checkbox" checked={allowException} onChange={e => setAllowException(e.target.checked)} className="mt-0.5" />
      <span>
        <span className="block text-xs font-black text-[#604724]">{ar ? 'اسمح بلجان لا تحكم فئتهم حين لا تبقى لجنة مؤهَّلة' : 'Allow panels outside their category when no qualifying panel remains'}</span>
        <span className="block text-[10px] text-[#6b5b45] mt-1 leading-5">
          {ar
            ? 'يُستعمل حين تتعطّل لجان فئتهم كلها. يبقون يُسألون في نطاق فئتهم هم — لا في تخصّص اللجنة — وتُوسَم حالتهم للمحكّمين. وبدون هذا الإذن يبقون بلا لجنة ويُقال السبب.'
            : 'For when every panel of their category is down. They are still questioned within their own scope, and the panel is warned. Without this they stay unrouted, and the plan says why.'}
        </span>
      </span>
    </label>

    {plan && <div className="mt-4 rounded-2xl border border-[#dfddd6] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-black">{ar ? 'الخطة المقترحة' : 'Proposed plan'}</div>
        <span className="mizan-proof-code text-[#646965]">{plan.planHash.slice(0, 24)}…</span>
      </div>

      <div className="grid sm:grid-cols-3 gap-2 mt-3">
        <Figure n={plan.assignments.length} t={ar ? 'سيُسنَدون' : 'To be routed'} />
        <Figure n={plan.drawsUsed} t={ar ? 'حُسمت بقرعة' : 'Settled by draw'} />
        <Figure n={plan.unassigned.length} t={ar ? 'بلا لجنة مؤهَّلة' : 'Still unroutable'} tone={plan.unassigned.length ? 'warn' : 'plain'} />
      </div>

      {/* أثر الخطة على أثقل لجنة — وهو ما يشعر به المنتظر، لا المتوسّط. */}
      <div className="mt-3 rounded-xl bg-[#E7EEE9] text-[#214C40] px-4 py-3 text-[11px] font-bold">
        {ar
          ? `أطول انتظارٍ متوقّع في أثقل لجنة: ${plan.maxLoadMinutesBefore} ← ${plan.maxLoadMinutesAfter} دقيقة${plan.swapsApplied ? ` · ${plan.swapsApplied} تبديلًا داخل الموجة` : ''}`
          : `Worst expected wait on the heaviest panel: ${plan.maxLoadMinutesBefore} → ${plan.maxLoadMinutesAfter} min${plan.swapsApplied ? ` · ${plan.swapsApplied} swaps inside the wave` : ''}`}
      </div>

      <ul className="mt-3 divide-y divide-[#e6e4dd] max-h-64 overflow-auto">
        {plan.assignments.map(row => <li key={row.participantId} className="py-2.5 flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="text-xs font-black">{row.participantCode} → {row.committeeCode}</span>
            <span className="block text-[10px] text-[#646965] mt-0.5 leading-4">{ar ? row.reasonArabic : row.reasonEnglish}</span>
          </span>
          <span className="flex items-center gap-1.5 shrink-0">
            {row.drawn && <Badge variant="neutral">{ar ? 'قرعة' : 'Draw'}</Badge>}
            {row.relaxed.length > 0 && <Badge variant="amber">{ar ? 'تخفيف قيد' : 'Relaxed'}</Badge>}
          </span>
        </li>)}
      </ul>

      {plan.unassigned.length > 0 && <div className="mt-3 rounded-xl bg-[#F4E6E3] text-[#88473f] px-4 py-3 text-[10px] leading-5">
        {ar
          ? `${plan.unassigned.length} لا تؤهّلهم أيُّ لجنة — يحتاجون لجنةً تغطي فئتهم أو إسنادًا يدويًا. لن تمسّهم الخطة.`
          : `${plan.unassigned.length} have no qualifying panel — they need a panel covering their category, or manual routing. The plan leaves them alone.`}
      </div>}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => void apply()} loading={busy} disabled={!plan.assignments.length} icon={<ShieldCheck className="w-4 h-4" />}>
          {ar ? 'اعتمد ونفّذ' : 'Approve and apply'}
        </Button>
        <Button variant="outline" onClick={() => { setPlan(null); setResult(null) }}>{ar ? 'تجاهل' : 'Discard'}</Button>
      </div>
    </div>}

    {result && <div className={`mt-3 rounded-xl p-3 text-xs font-bold ${result.ok ? 'bg-[#E7EEE9] text-[#214C40]' : 'bg-[#F4E6E3] text-[#88473f]'}`}>{result.message}</div>}
  </section>;
};

const Figure = ({ n, t, tone = 'plain' }: { n: number; t: string; tone?: 'plain' | 'warn' }) => (
  <div className={`rounded-xl px-4 py-3 ${tone === 'warn' ? 'bg-[#F2EADC] text-[#725630]' : 'bg-[#f1efe9] text-[#171b18]'}`}>
    <div className="text-lg font-black tabular-nums">{n}</div>
    <div className="text-[10px] opacity-75">{t}</div>
  </div>
);

const reasonText = (reason: string, ar: boolean) => ({
  UNAUTHORIZED: ar ? 'صلاحية هذا الحساب لا تسمح بتنفيذ خطة توزيع.' : 'This account may not apply a distribution plan.',
  OTHER_COMPETITION: ar ? 'الخطة تخصّ مسابقة أخرى.' : 'The plan belongs to another competition.',
  PLAN_STALE: ar ? 'تغيّر الواقع بعد بناء الخطة — أُغلقت لجنة أو وصل من ليس فيها. ابنِ خطة جديدة.' : 'Reality changed after the plan was built — rebuild it.',
  PLAN_REBUILD_FAILED: ar ? 'تعذّر التحقق من الخطة قبل تنفيذها.' : 'The plan could not be re-verified before applying.',
} as Record<string, string>)[reason] || reason;
