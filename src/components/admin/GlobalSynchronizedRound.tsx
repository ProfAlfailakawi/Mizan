import { displayDateTime } from '../../lib/display-format';
import React, { useMemo } from 'react';
import { Globe2, Waypoints, ShieldCheck, LockKeyhole, CircleDot } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { Badge } from '../design-system/Badge';

/**
 * الجولة المتزامنة في الإنتاج هي مرآة للواقع فقط. لا تنشئ مدنًا أو قاعات أو نسب تقدم
 * افتراضية. إذا لم تُنشأ اللجان بعد تظهر حالة فارغة صريحة، وإذا أُنشئت نحسب المؤشرات من
 * سجلات المسابقة نفسها.
 */
export const GlobalSynchronizedRound: React.FC = () => {
  const store = useAppStore();
  const ar = store.language === 'ar';
  const committees = store.committees.filter(c => c.competitionId === store.competition.id);
  const participants = store.participants.filter(p => p.competitionId === store.competition.id);
  const roots = store.publicResultRoots.filter(r => r.competitionId === store.competition.id);

  const rows = useMemo(() => committees.map(c => {
    const assigned = participants.filter(p => p.assignedCommitteeId === c.id);
    const current = c.currentParticipantId ? participants.find(p => p.id === c.currentParticipantId) : undefined;
    const done = assigned.filter(p => ['tested','certified'].includes(p.status)).length;
    return { committee: c, assigned: assigned.length, done, current };
  }), [committees, participants]);

  if (!committees.length) {
    return <section className="dna-surface text-[var(--ink)] p-7 sm:p-9">
      <div className="max-w-2xl mx-auto text-center py-8">
        <span className="mx-auto w-14 h-14 rounded-2xl bg-[var(--emerald-soft)] grid place-items-center text-[var(--emerald)]"><CircleDot className="w-6 h-6"/></span>
        <div className="text-xs font-bold tracking-[.2em] text-[var(--muted)] mt-5">{ar?'الجولة المتزامنة':'SYNCHRONIZED ROUND'}</div>
        <h2 className="text-2xl font-black mt-2">{ar?'لا توجد قاعات أو لجان تشغيلية بعد':'No operational halls or panels yet'}</h2>
        <p className="text-xs text-[var(--muted)] leading-6 mt-3">{ar?'عند إنشاء اللجان وتوزيع المتسابقين ستظهر هنا الحالة الحقيقية فقط. لن يعرض ميزان مدنًا أو أرقامًا أو تقدمًا تجريبيًا.':'Once panels and participants are actually assigned, their real state appears here. MIZAN never invents cities, counts, or progress.'}</p>
      </div>
    </section>;
  }

  const assignedTotal = rows.reduce((n, x) => n + x.assigned, 0);
  const doneTotal = rows.reduce((n, x) => n + x.done, 0);
  const progress = assignedTotal ? Math.round((doneTotal / assignedTotal) * 100) : 0;
  const latestRoot = roots[0];

  return <section className="dna-surface overflow-hidden text-[var(--ink)]">
    <div className="p-6 sm:p-8">
      <div className="flex items-center gap-4">
        <span className="w-12 h-12 rounded-2xl bg-[var(--emerald-soft)] grid place-items-center text-[var(--emerald)]"><Globe2 className="w-6 h-6"/></span>
        <div>
          <div className="text-xs font-bold tracking-[.2em] text-[var(--muted)]">{ar?'حالة القاعات الفعلية':'LIVE HALL STATE'}</div>
          <h2 className="text-2xl sm:text-3xl font-black mt-1">{ar?'كل قاعة كما هي الآن':'Every hall, exactly as it is now'}</h2>
          <p className="text-xs text-[var(--muted)] mt-1">{ar?'المؤشرات أدناه مشتقة من اللجان والمتسابقين المسجلين فعليًا في هذه المسابقة.':'Every indicator below is derived from this competition’s actual panels and participants.'}</p>
        </div>
      </div>

      <div className="mt-6 grid lg:grid-cols-[1fr_1.4fr] gap-4">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--canvas)] p-5">
          <div className="flex items-center gap-2 text-[13px] font-bold text-[var(--muted)]"><LockKeyhole className="w-4 h-4"/>{ar?'حالة الكشف':'REVEAL STATE'}</div>
          <div className="mt-3 text-sm font-black">{store.activeSession.questionSelection ? (ar?'هناك جلسة تحكيم فعلية نشطة':'A real judging session is active') : (ar?'لا توجد جلسة كشف نشطة':'No active reveal session')}</div>
          <div className="mt-2 text-[13px] text-[var(--muted)] leading-6">{ar?'لا تُعرض كبسولة أو معرّف افتراضي. يظهر معرّف السؤال فقط داخل جلسة فعلية وبعد شروط الكشف.':'No placeholder capsule or identifier is shown. Question evidence appears only for a real session after reveal conditions are met.'}</div>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--amber-soft)] p-5">
          <div className="flex items-center gap-2 text-[13px] font-bold text-[var(--amber)]"><Waypoints className="w-4 h-4"/>{ar?'آخر جذر نتائج موثّق':'LATEST VERIFIED RESULT ROOT'}</div>
          <div className={`mt-3 text-xs sm:text-sm break-all text-[var(--ink)] min-h-[2.5em] ${latestRoot?"font-mono":""}`}>{latestRoot?.merkleRoot || (ar?'لم يُنشأ جذر نتائج بعد':'No result root has been created yet')}</div>
          <div className="mt-2 text-[13px] text-[var(--muted)]">{latestRoot ? displayDateTime(latestRoot.createdAt,ar) : (ar?'يظهر بعد وجود نتائج فعلية قابلة للختم.':'It appears only after actual results can be sealed.')}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat n={committees.length} t={ar?'لجنة/قاعة فعلية':'Real panels'} />
        <Stat n={assignedTotal} t={ar?'متسابق موزع':'Assigned'} />
        <Stat n={doneTotal} t={ar?'أكمل':'Completed'} />
        <Stat n={`${progress}%`} t={ar?'تقدم محسوب':'Measured progress'} />
      </div>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {rows.map(({committee,assigned,done,current}) => <div key={committee.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-black">{ar?committee.nameArabic:committee.name}</div><div className="text-xs text-[var(--muted)] mt-1">{committee.venueHall || (ar?'القاعة غير محددة':'Hall not assigned')} · {committee.code}</div></div><Badge variant={committee.status==='ready'?'emerald':committee.status==='paused'?'amber':'neutral'}>{committee.status}</Badge></div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-[var(--canvas)] p-2"><b className="text-sm block">{assigned}</b>{ar?'موزع':'assigned'}</div><div className="rounded-xl bg-[var(--canvas)] p-2"><b className="text-sm block">{done}</b>{ar?'مكتمل':'done'}</div></div>
          {current&&<div className="mt-3 text-xs text-[var(--emerald-2)]">{ar?'الآن:':'Now:'} {current.code}</div>}
        </div>)}
      </div>

      <div className="mt-5 flex items-start gap-2 text-[13px] text-[var(--muted)] leading-6"><ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-[var(--emerald)]"/>{ar?'هذه الشاشة لا تحتوي وضع عرض أو مولّد محاكاة؛ أي رقم يظهر فيها له سجل فعلي في المسابقة الحالية.':'This screen contains no synthetic-data generator; every displayed number has a real record in the active competition.'}</div>
    </div>
  </section>;
};

const Stat: React.FC<{ n: number|string; t: string }> = ({ n, t }) => <div className="rounded-2xl bg-[var(--canvas)] border border-[var(--line)] px-4 py-3"><div className="text-2xl font-black tabular-nums">{n}</div><div className="text-xs text-[var(--muted)] mt-0.5">{t}</div></div>;
