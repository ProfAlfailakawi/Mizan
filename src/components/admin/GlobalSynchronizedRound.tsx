import React, { useEffect, useMemo, useState } from 'react';
import { Globe2, Waypoints, ShieldCheck, LockKeyhole, Play, Pause, CheckCircle2 } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { Badge } from '../design-system/Badge';
import { buildGlobalRound, HALL_COUNT, type GlobalHall, type HallStage } from '../../lib/global-round';

// Distributed final: one sealed question capsule, many halls worldwide, one Merkle root.
// Demonstrates that MIZAN's server-held escrow already supports a synchronized global round —
// every hall opens the capsule only under its own presence + quorum, and all sealed results fold
// into a single verifiable anchor.

const STAGE_META: Record<HallStage, { ar: string; en: string; cls: string; dot: string }> = {
  sealed:    { ar: 'مختوم',        en: 'Sealed',    cls: 'bg-[#EFEEE9] text-[#606863]', dot: 'bg-[#9aa09b]' },
  present:   { ar: 'حضور',         en: 'Present',   cls: 'bg-[#E8EEF1] text-[#496477]', dot: 'bg-[#496477]' },
  quorum:    { ar: 'نصاب اللجنة',  en: 'Quorum',    cls: 'bg-[#F2EADC] text-[#7d5e34]', dot: 'bg-[#9B7542]' },
  revealed:  { ar: 'كُشف محليًا',  en: 'Revealed',  cls: 'bg-[#F2EADC] text-[#7d5e34]', dot: 'bg-[#c49a5d]' },
  reciting:  { ar: 'تلاوة',        en: 'Reciting',  cls: 'bg-[#E7EEE9] text-[#214C40]', dot: 'bg-[#2f6555]' },
  submitted: { ar: 'خُتم وأُرسل',  en: 'Sealed',    cls: 'bg-[#214C40] text-white',     dot: 'bg-white' },
};

export const GlobalSynchronizedRound: React.FC = () => {
  const { language } = useAppStore();
  const ar = language === 'ar';
  const capsuleId = 'CAPSULE-GLOBAL-FINAL-01';

  const [progress, setProgress] = useState(0.32);
  const [playing, setPlaying] = useState(true);
  const [round, setRound] = useState<Awaited<ReturnType<typeof buildGlobalRound>> | null>(null);

  useEffect(() => { if (!playing) return; const t = setInterval(() => setProgress((p) => (p >= 1 ? 1 : Math.round((p + 0.04) * 100) / 100)), 1400); return () => clearInterval(t); }, [playing]);
  useEffect(() => { let live = true; void buildGlobalRound(progress, capsuleId).then((r) => { if (live) setRound(r); }); return () => { live = false; }; }, [progress]);

  const halls = round?.halls || [];
  const grouped = useMemo(() => halls, [halls]);

  return (
    <section className="rounded-[30px] overflow-hidden border border-[#1e3a30] bg-gradient-to-b from-[#12251d] to-[#0e1c16] text-white">
      <div className="p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <span className="w-12 h-12 rounded-2xl bg-white/10 grid place-items-center text-[#bfe0d3]"><Globe2 className="w-6 h-6" /></span>
            <div>
              <div className="text-[10px] font-black tracking-[.2em] text-[#a9c6ba]">{ar ? 'الجولة العالمية المتزامنة' : 'GLOBAL SYNCHRONIZED ROUND'}</div>
              <h2 className="text-2xl sm:text-3xl font-black mt-1">{ar ? 'سؤال واحد مختوم · قاعات حول العالم' : 'One sealed question · halls worldwide'}</h2>
              <p className="text-xs text-white/50 mt-1 max-w-xl">{ar ? `${HALL_COUNT} قاعة، السؤال لا يُكشف في أي قاعة قبل حضور متسابقها ونصاب لجنتها — وكل النتائج تندمج في جذر ميركل واحد.` : `${HALL_COUNT} halls; the question opens in a hall only under its own presence + quorum — and every result folds into one Merkle root.`}</p>
            </div>
          </div>
          <button onClick={() => setPlaying((v) => !v)} className="self-start inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-black hover:bg-white/10">{playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}{ar ? (playing ? 'إيقاف المحاكاة' : 'تشغيل') : (playing ? 'Pause' : 'Play')}</button>
        </div>

        {/* Sealed capsule + merged root */}
        <div className="mt-6 grid lg:grid-cols-[1fr_1.4fr] gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/[.04] p-5">
            <div className="flex items-center gap-2 text-[11px] font-black text-[#a9c6ba]"><LockKeyhole className="w-4 h-4" />{ar ? 'الكبسولة المختومة' : 'SEALED CAPSULE'}</div>
            <div className="mt-3 font-mono text-sm text-white/80">{capsuleId}</div>
            <div className="mt-2 text-[11px] text-white/45 leading-6">{ar ? 'نفس الكبسولة زُوّدت لكل القاعات. لا خادم ولا مشرف يرى النص قبل شروط الكشف المحلية.' : 'The same capsule is provisioned to every hall. No server or admin sees the text before local reveal conditions.'}</div>
          </div>
          <div className="rounded-2xl border border-[#c49a5d]/25 bg-[#c49a5d]/[.07] p-5">
            <div className="flex items-center gap-2 text-[11px] font-black text-[#d9c193]"><Waypoints className="w-4 h-4" />{ar ? 'جذر ميركل الموحّد' : 'UNIFIED MERKLE ROOT'}</div>
            <div className="mt-3 font-mono text-xs sm:text-sm break-all text-white/85 min-h-[2.5em]">{round?.mergedRoot || (ar ? 'بانتظار أول قاعة تختم نتيجتها…' : 'Awaiting the first hall to seal…')}</div>
            <div className="mt-2 text-[11px] text-white/45">{ar ? `${round?.submittedCount || 0} قاعة أسهمت بنتيجتها المختومة في الجذر` : `${round?.submittedCount || 0} halls folded into the root`}</div>
          </div>
        </div>

        {/* Fleet stats */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat n={HALL_COUNT} t={ar ? 'قاعة' : 'Halls'} />
          <Stat n={round?.totalParticipants || 0} t={ar ? 'متسابق' : 'Finalists'} />
          <Stat n={round?.revealedCount || 0} t={ar ? 'كشف محلي' : 'Local reveals'} />
          <Stat n={round?.submittedCount || 0} t={ar ? 'خُتمت' : 'Sealed'} />
        </div>

        {/* Progress scrubber */}
        <div className="mt-4 flex items-center gap-3">
          <span className="text-[10px] text-white/40 w-16">{ar ? 'تقدّم الجولة' : 'Round'}</span>
          <input type="range" min={0} max={1} step={0.01} value={progress} onChange={(e) => { setPlaying(false); setProgress(Number(e.target.value)); }} className="flex-1 accent-[#c49a5d]" />
          <span className="text-[10px] font-black text-[#d9c193] w-10 text-end">{Math.round(progress * 100)}%</span>
        </div>

        {/* World fleet grid */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {grouped.map((h) => <HallCard key={h.id} hall={h} ar={ar} />)}
        </div>

        <div className="mt-5 flex items-start gap-2 text-[11px] text-white/40 leading-6">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-[#a9c6ba]" />
          {ar ? 'محاكاة تنسيق مبنية على حجز الأسئلة الخادمي الحقيقي في ميزان. البنية جاهزة؛ تشغيل حدث عالمي فعلي يتطلب تزويد القاعات وتحقق الشبكة وموافقات الجهات. لا يُكشف نص أي قاعة لأخرى، ولا تُدمج نتيجة إلا بعد ختمها محليًا.' : "A coordination simulation over MIZAN's real server-held escrow. The architecture is ready; a live global event still needs hall provisioning, network verification and institutional approvals. No hall's text is exposed to another, and a result folds in only after it is sealed locally."}
        </div>
      </div>
    </section>
  );
};

const HallCard: React.FC<{ hall: GlobalHall; ar: boolean }> = ({ hall, ar }) => {
  const m = STAGE_META[hall.stage as HallStage];
  return (
    <div className={`rounded-2xl border p-3.5 transition-colors duration-500 ${hall.stage === 'submitted' ? 'border-[#2f6555] bg-[#183a2e]' : 'border-white/10 bg-white/[.03]'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg leading-none">{hall.flag}</span>
          <div className="min-w-0"><div className="text-sm font-black truncate">{ar ? hall.cityArabic : hall.city}</div><div className="text-[10px] text-white/40">{hall.localTime} · {hall.participants} {ar ? 'متسابق' : ''}</div></div>
        </div>
        {hall.stage === 'submitted' ? <CheckCircle2 className="w-4 h-4 text-[#7fae9c] shrink-0" /> : <span className={`w-2 h-2 rounded-full shrink-0 ${m.dot}`} />}
      </div>
      <div className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black ${m.cls}`}>{ar ? m.ar : m.en}</div>
      {hall.resultDigest && <div className="mt-2 font-mono text-[9px] text-white/35 truncate">{hall.resultDigest.slice(0, 22)}…</div>}
    </div>
  );
};

const Stat: React.FC<{ n: number; t: string }> = ({ n, t }) => (
  <div className="rounded-2xl bg-white/[.05] px-4 py-3"><div className="text-2xl font-black tabular-nums">{n}</div><div className="text-[10px] text-white/45 mt-0.5">{t}</div></div>
);
