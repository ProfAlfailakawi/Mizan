import React, { useMemo, useState } from 'react';
import { AdvisoryNote } from '../design-system/AdvisoryNote';
import { Activity, Coffee, TrendingDown, Gauge, ShieldCheck } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { Badge } from '../design-system/Badge';
import { Button } from '../design-system/Button';
import { computeAllJudgeDrift, computeJudgeDrift, type JudgeEventLike } from '../../lib/judge-drift';

// Silent Judge Drift — a Head-Judge-only advisory. It NEVER alters a score. It watches whether a
// judge has grown harsher than their own morning baseline and, past a 2σ threshold, gently
// suggests a human intervention (a break / re-listen) — protecting the late-afternoon contestant.

export const JudgeDriftMonitor: React.FC = () => {
  const store = useAppStore();
  const ar = store.language === 'ar';
  const [ackd, setAckd] = useState<Record<string, boolean>>({});

  // Production truth only: no synthetic judges and no derived preview events. Drift is meaningful only
  // after enough real judging events exist for the active panel; before that we show an explicit empty state.
  const events: JudgeEventLike[] = useMemo(() => store.activeSession.events.map((e) => ({
    judgeId: e.judgeId,
    relativeSeconds: e.relativeSeconds,
    penalty: e.penalty,
  })), [store.activeSession.events]);

  const realJudgeIds = useMemo(() => new Set(events.map(e => e.judgeId)), [events]);
  const enoughRealEvidence = store.judges.length > 0 && realJudgeIds.size > 0 && events.length >= 8;

  const signals = useMemo(() => enoughRealEvidence ? computeAllJudgeDrift(events, { driftSigma: 2 }) : [], [events, enoughRealEvidence]);
  const nameOf = (id: string) => { const j = store.judges.find((x) => x.userId === id || x.id === id); return j ? (ar ? j.nameArabic : j.name) : (ar ? 'محكم' : 'Judge'); };
  const committeeFor = (id: string) => { const j = store.judges.find((x) => x.userId === id || x.id === id); const c = store.committees.find((cc) => cc.judgeIds?.includes(j?.userId || '') || cc.judgeIds?.includes(j?.id || '')); return c?.code || '—'; };
  const judgeName = nameOf;

  const flagged = signals.filter((s) => s.attention);

  return (
    <section className="mizan-surface p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-[#F2EADC] text-[#7d5e34] grid place-items-center"><Gauge className="w-5 h-5" /></span>
          <div>
            <div className="mizan-kicker">{ar ? 'مراقبة انحراف المحكم' : 'JUDGE DRIFT'}</div>
            <h2 className="text-lg font-black mt-0.5">{ar ? 'عدّاد الإرهاق الصامت' : 'Silent fatigue monitor'}</h2>
            <p className="text-[11px] text-[#646965] mt-1 max-w-xl">{ar ? 'يقارن كل محكم بخط أساسه الصباحي. عند تجاوز انحرافين معياريين نحو التشدد، يقترح ميزان استراحة أو إعادة استماع.' : 'Each judge vs their own morning baseline. Past 2σ harsher, MIZAN suggests a break or re-listen.'}</p>
          </div>
        </div>
        <Badge variant={flagged.length ? 'amber' : 'emerald'}>{flagged.length ? (ar ? `${flagged.length} تنبيه` : `${flagged.length} flag`) : (ar ? 'مستقر' : 'Stable')}</Badge>
      </div>

      {!enoughRealEvidence && <div className="mt-5 rounded-2xl border border-[#e4e2db] bg-[#fffefb] p-8 text-center"><Activity className="w-6 h-6 text-[#696f6b] mx-auto"/><div className="text-sm font-black mt-3">{ar?'لا توجد بيانات تحكيم كافية بعد':'Not enough real judging data yet'}</div><p className="text-[11px] text-[#696f6b] mt-2 leading-6">{ar?'يبدأ عدّاد الانحراف بعد وصول أحداث فعلية من المحكمين. لا ينشئ ميزان محكمين أو إحصاءات تجريبية عندما لا تكون اللجان قد بدأت.':'The drift monitor starts only after real judge events arrive. MIZAN does not create preview judges or statistics before panels actually work.'}</p></div>}
      {enoughRealEvidence && <div className="mt-5 grid md:grid-cols-2 gap-3">
        {signals.map((s) => {
          const judgeEvents = events.filter((e) => e.judgeId === s.judgeId).sort((a, b) => a.relativeSeconds - b.relativeSeconds);
          const detail = computeJudgeDrift(judgeEvents, { driftSigma: 2 });
          const acked = ackd[s.judgeId];
          return (
            <div key={s.judgeId} className={`rounded-2xl border p-4 ${s.attention && !acked ? 'border-[#d7c39e] bg-[#F7F1E5]' : 'border-[#e4e2db] bg-[#fffefb]'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-black truncate">{judgeName(s.judgeId)}</div>
                  <div className="text-[10px] text-[#666b67] mt-0.5">{ar ? 'اللجنة' : 'Committee'} {committeeFor(s.judgeId)} · {s.minutesObserved}{ar ? ' د' : 'm'}</div>
                </div>
                <span className={`inline-flex items-center gap-1 text-[11px] font-black ${s.direction === 'harsher' ? 'text-[#92642d]' : s.direction === 'gentler' ? 'text-[#496477]' : 'text-[#5f6862]'}`}>
                  {s.direction === 'harsher' ? <TrendingDown className="w-3.5 h-3.5 rotate-180" /> : <Activity className="w-3.5 h-3.5" />}
                  {s.deltaSigma > 0 ? '+' : ''}{s.deltaSigma}σ
                </span>
              </div>

              <DriftSparkline events={judgeEvents} split={detail.baselineEvents} attention={s.attention} />

              <div className="mt-3 flex items-center justify-between text-[10px] text-[#636864]">
                <span>{ar ? 'الصباح' : 'AM'} <b className="text-[#333]">−{s.baselinePenaltyRate}</b></span>
                <span>{ar ? 'الآن' : 'now'} <b className="text-[#333]">−{s.recentPenaltyRate}</b></span>
              </div>

              {s.attention && !acked && (
                <div className="mt-3 rounded-xl bg-white border border-[#e6dcc4] p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-[11px] font-bold text-[#7d5e34]"><Coffee className="w-4 h-4" />{ar ? `${committeeFor(s.judgeId)} قد تحتاج استراحة` : `${committeeFor(s.judgeId)} may need a break`}</div>
                  <Button size="sm" variant="outline" onClick={() => setAckd((v) => ({ ...v, [s.judgeId]: true }))}>{ar ? 'رتّبت استراحة' : 'Arranged'}</Button>
                </div>
              )}
              {s.attention && acked && <div className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-[#2f6555]"><ShieldCheck className="w-4 h-4" />{ar ? 'تمت المعالجة بشريًا' : 'Handled by a human'}</div>}
            </div>
          );
        })}
      </div>}

      <div className="mt-4"><AdvisoryNote>
        {ar ? 'إشارة مساندة لرئيس التحكيم فقط، ولا تظهر للمحكم ولا تغيّر درجة. المقارنة ذاتية (كل محكم مع نفسه) وتعتمد على أحداث التحكيم الحقيقية فقط.' : 'Advisory to the Head Judge only — never shown to the judge and never a score change. The comparison is self-referential and uses real judging events only.'}
      </AdvisoryNote></div>
    </section>
  );
};

/** A tiny inline sparkline of penalty over the day, split into baseline vs recent. */
const DriftSparkline: React.FC<{ events: JudgeEventLike[]; split: number; attention: boolean }> = ({ events, split, attention }) => {
  const w = 260, h = 40, pad = 3;
  const max = Math.max(0.5, ...events.map((e) => e.penalty));
  const pts = events.map((e, i) => {
    const x = pad + (i / Math.max(1, events.length - 1)) * (w - pad * 2);
    const y = h - pad - (e.penalty / max) * (h - pad * 2);
    return { x, y };
  });
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const splitX = pad + (Math.max(0, split - 0.5) / Math.max(1, events.length - 1)) * (w - pad * 2);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 w-full h-10" preserveAspectRatio="none" aria-hidden="true">
      <rect x={splitX} y="0" width={w - splitX} height={h} fill={attention ? 'rgba(155,117,66,.08)' : 'rgba(47,101,85,.05)'} />
      <line x1={splitX} y1="0" x2={splitX} y2={h} stroke="#d7cdb6" strokeWidth="1" strokeDasharray="2 2" />
      <path d={line} fill="none" stroke={attention ? '#9a6a2f' : '#2f6555'} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="1.6" fill={attention ? '#9a6a2f' : '#2f6555'} />)}
    </svg>
  );
};
