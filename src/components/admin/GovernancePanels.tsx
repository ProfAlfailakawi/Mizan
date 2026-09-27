/*
 * لوحات الحوكمة التشغيلية: تضارب المصالح (للمحكّم ولرئيس التحكيم)، الجدولة الذكية مع
 * التعديل اليدوي، وهرم التأهيل. كل فعلٍ هنا يمرّ بأفعال المخزن المُدقَّقة، والقواعد في
 * وحداتٍ نقيّة مختبرة؛ هذه المكوّنات تعرض وتجمع المدخلات فقط.
 */
import React, { useMemo, useState } from 'react';
import { useAppStore } from '../../lib/store';
import type { ConflictDecision, ConflictKind, ConflictRelation } from '../../lib/conflict-of-interest';
import { hierarchyOf } from '../../lib/qualification';

const L = (ar: boolean, a: string, e: string) => (ar ? a : e);
const input = 'mizan-input text-sm';
const btn = 'rounded-full bg-[#214C40] px-4 py-2 text-xs font-bold text-white disabled:opacity-50';
const btn2 = 'rounded-full border border-[#214C40]/25 px-3 py-1.5 text-xs font-bold text-[#214C40]';

const Result: React.FC<{ r: { ok: boolean; code?: string } | null; ar: boolean }> = ({ r, ar }) => r ? <p role={r.ok ? 'status' : 'alert'} className={`text-xs font-bold ${r.ok ? 'text-[#2F6555]' : 'text-[#A34D43]'}`}>{r.ok ? L(ar, 'تم.', 'Done.') : `${L(ar, 'تعذّر', 'Failed')}: ${r.code}`}</p> : null;

const KIND: Record<ConflictKind, [string, string]> = { declared_conflict: ['تضارب مصالح', 'Conflict of interest'], recusal: ['تنحٍّ', 'Recusal'], abstention: ['امتناع', 'Abstention'] };
const RELATION: Record<ConflictRelation, [string, string]> = { student: ['طالبي', 'My student'], relative: ['قريب', 'Relative'], institution: ['مؤسستي', 'My institution'], employer: ['جهة عملي', 'Employer'], prior_judging: ['حكّمته سابقًا بصفةٍ مؤثّرة', 'Prior judging role'], other: ['سبب آخر', 'Other'] };
const DECISION: Record<ConflictDecision, [string, string]> = { reassigned_participant: ['نقل المتسابق إلى لجنة أخرى', 'Move participant to another panel'], replaced_judge: ['استبدال المحكّم في اللجنة', 'Replace the judge on the panel'], upheld_no_action: ['الإبقاء مع توثيق السبب', 'Keep with documented reason'], rejected: ['رفض الإعلان', 'Reject the declaration'] };

/* ═══ تضارب المصالح ═══ */
export const ConflictOfInterestPanel: React.FC<{ mode: 'judge' | 'review' }> = ({ mode }) => {
  const s = useAppStore(); const ar = s.language === 'ar';
  const cid = s.competition.id;
  const me = s.judges.find(j => j.userId === s.currentUser.id || j.id === s.currentUser.id);
  const judges = s.judges.filter(j => !j.competitionId || j.competitionId === cid);
  const participants = s.participants.filter(p => p.competitionId === cid);
  const committees = s.committees.filter(c => c.competitionId === cid);
  const cases = s.conflictCases.filter(c => c.competitionId === cid && (mode === 'review' || c.judgeId === me?.id));
  const [form, setForm] = useState({ judgeId: me?.id || '', participantId: '', institution: '', kind: 'declared_conflict' as ConflictKind, relation: 'student' as ConflictRelation, reason: '' });
  const [decision, setDecision] = useState<Record<string, { decision: ConflictDecision; note: string; committeeId: string; judgeId: string }>>({});
  const [result, setResult] = useState<{ ok: boolean; code?: string } | null>(null);
  const name = (id?: string) => { const p = participants.find(x => x.id === id); return p ? `${p.code} · ${ar ? p.fullNameArabic : p.fullName}` : id || '—'; };
  const judgeName = (id: string) => { const j = s.judges.find(x => x.id === id); return j ? (ar ? j.nameArabic || j.name : j.name) : id; };
  return <section className="space-y-4" aria-label={L(ar, 'تضارب المصالح', 'Conflicts of interest')}>
    <h2 className="text-base font-black">{mode === 'judge' ? L(ar, 'إعلان تضارب مصالح أو تنحٍّ', 'Declare a conflict or recuse') : L(ar, 'مراجعة تضارب المصالح', 'Conflict-of-interest review')}</h2>
    <form className="grid gap-3 rounded-2xl border border-[#e5e3dc] p-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); setResult(s.declareJudgeConflict({ ...form, participantId: form.participantId || undefined, institution: form.institution || undefined })); }}>
      {mode === 'review' && <label className="text-xs font-bold">{L(ar, 'المحكّم', 'Judge')}<select className={input} value={form.judgeId} onChange={e => setForm({ ...form, judgeId: e.target.value })}><option value="" />{judges.map(j => <option key={j.id} value={j.id}>{ar ? j.nameArabic || j.name : j.name}</option>)}</select></label>}
      <label className="text-xs font-bold">{L(ar, 'المتسابق', 'Participant')}<select className={input} value={form.participantId} onChange={e => setForm({ ...form, participantId: e.target.value })}><option value="">{L(ar, '— أو حدّد مؤسسة —', '— or name an institution —')}</option>{participants.map(p => <option key={p.id} value={p.id}>{name(p.id)}</option>)}</select></label>
      <label className="text-xs font-bold">{L(ar, 'المؤسسة (اختياري)', 'Institution (optional)')}<input className={input} value={form.institution} onChange={e => setForm({ ...form, institution: e.target.value })} /></label>
      <label className="text-xs font-bold">{L(ar, 'النوع', 'Type')}<select className={input} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as ConflictKind })}>{(Object.keys(KIND) as ConflictKind[]).map(k => <option key={k} value={k}>{KIND[k][ar ? 0 : 1]}</option>)}</select></label>
      <label className="text-xs font-bold">{L(ar, 'الصلة', 'Relation')}<select className={input} value={form.relation} onChange={e => setForm({ ...form, relation: e.target.value as ConflictRelation })}>{(Object.keys(RELATION) as ConflictRelation[]).map(k => <option key={k} value={k}>{RELATION[k][ar ? 0 : 1]}</option>)}</select></label>
      <label className="text-xs font-bold sm:col-span-2">{L(ar, 'السبب (مطلوب)', 'Reason (required)')}<textarea required minLength={5} className={`${input} min-h-20`} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></label>
      <div className="sm:col-span-2 flex items-center gap-3"><button className={btn} disabled={!form.judgeId || form.reason.trim().length < 5}>{L(ar, 'تسجيل الإعلان', 'Submit declaration')}</button><Result r={result} ar={ar} /></div>
    </form>
    <ul className="space-y-2">{cases.map(c => {
      const d = decision[c.id] || { decision: 'reassigned_participant' as ConflictDecision, note: '', committeeId: '', judgeId: '' };
      return <li key={c.id} className="rounded-2xl border border-[#e5e3dc] bg-white p-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2"><b>{judgeName(c.judgeId)} — {KIND[c.kind][ar ? 0 : 1]} · {RELATION[c.relation][ar ? 0 : 1]}</b><span className={`rounded-full px-2 py-0.5 font-bold ${c.status === 'open' ? 'bg-[#F5EDE2] text-[#725630]' : 'bg-[#E7EEE9] text-[#214C40]'}`}>{c.status === 'open' ? L(ar, 'مفتوح', 'Open') : L(ar, 'محسوم', 'Resolved')}</span></div>
        <div className="mt-1 text-[#4f5752]">{c.participantId ? name(c.participantId) : c.institution} · {c.reason}</div>
        <div className="mt-1 text-[#6a706c]">{L(ar, 'التعيين الأصلي', 'Original assignment')}: {c.originalAssignment.committeeId || '—'} ({c.originalAssignment.judgeIds.length})</div>
        {c.resolution && <div className="mt-2 rounded-xl bg-[#f4f2ec] p-2">{DECISION[c.resolution.decision][ar ? 0 : 1]} — {c.resolution.note}{c.resolution.reassignedToCommitteeId ? ` → ${c.resolution.reassignedToCommitteeId}` : ''}{c.resolution.replacementJudgeId ? ` → ${judgeName(c.resolution.replacementJudgeId)}` : ''}</div>}
        {mode === 'review' && c.status === 'open' && <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <select aria-label={L(ar, 'القرار', 'Decision')} className={input} value={d.decision} onChange={e => setDecision({ ...decision, [c.id]: { ...d, decision: e.target.value as ConflictDecision } })}>{(Object.keys(DECISION) as ConflictDecision[]).map(k => <option key={k} value={k}>{DECISION[k][ar ? 0 : 1]}</option>)}</select>
          {d.decision === 'reassigned_participant' && <select aria-label={L(ar, 'اللجنة الجديدة', 'Target panel')} className={input} value={d.committeeId} onChange={e => setDecision({ ...decision, [c.id]: { ...d, committeeId: e.target.value } })}><option value="" />{committees.filter(k => k.id !== c.originalAssignment.committeeId).map(k => <option key={k.id} value={k.id}>{k.code} · {ar ? k.nameArabic : k.name}</option>)}</select>}
          {d.decision === 'replaced_judge' && <select aria-label={L(ar, 'المحكّم البديل', 'Replacement judge')} className={input} value={d.judgeId} onChange={e => setDecision({ ...decision, [c.id]: { ...d, judgeId: e.target.value } })}><option value="" />{judges.filter(j => j.id !== c.judgeId).map(j => <option key={j.id} value={j.id}>{ar ? j.nameArabic || j.name : j.name}</option>)}</select>}
          <input aria-label={L(ar, 'ملاحظة القرار', 'Decision note')} placeholder={L(ar, 'ملاحظة القرار (مطلوبة)', 'Decision note (required)')} className={`${input} sm:col-span-2`} value={d.note} onChange={e => setDecision({ ...decision, [c.id]: { ...d, note: e.target.value } })} />
          <button className={btn} disabled={d.note.trim().length < 5} onClick={() => setResult(s.resolveJudgeConflict(c.id, { decision: d.decision, note: d.note, reassignedToCommitteeId: d.committeeId || undefined, replacementJudgeId: d.judgeId || undefined }))}>{L(ar, 'تسجيل القرار', 'Record decision')}</button>
        </div>}
      </li>;
    })}</ul>
  </section>;
};

/* ═══ الجدولة الذكية ═══ */
type Row = { date: string; start: string; end: string };
export const SmartSchedulePanel: React.FC = () => {
  const s = useAppStore(); const ar = s.language === 'ar';
  const cid = s.competition.id;
  const plans = s.schedulePlans.filter(p => p.competitionId === cid);
  const [days, setDays] = useState<Row[]>([{ date: s.competition.startDate?.slice(0, 10) || new Date().toISOString().slice(0, 10), start: '08:00', end: '16:00' }]);
  const [breaks, setBreaks] = useState<Row[]>([{ date: '', start: '10:30', end: '10:45' }]);
  const [prayers, setPrayers] = useState<Row[]>([{ date: '', start: '12:00', end: '12:30' }]);
  const [transition, setTransition] = useState(5);
  const [result, setResult] = useState<{ ok: boolean; code?: string } | null>(null);
  const [selected, setSelected] = useState(plans[0]?.id || '');
  const plan = plans.find(p => p.id === selected) || plans[0];
  const [move, setMove] = useState({ participantId: '', committeeId: '', date: '', start: '' });
  const pname = (id: string) => { const p = s.participants.find(x => x.id === id); return p ? `${p.code} · ${ar ? p.fullNameArabic : p.fullName}` : id; };
  const byDay = useMemo(() => { const m = new Map<string, typeof plan.plan.slots>(); for (const x of plan?.plan.slots || []) m.set(x.date, [...(m.get(x.date) || []), x]); return [...m.entries()]; }, [plan]);
  const rows = (list: Row[], set: (v: Row[]) => void, withDate: boolean, label: string) => <fieldset className="rounded-xl border border-[#e5e3dc] p-3"><legend className="px-1 text-[11px] font-black">{label}</legend>
    {list.map((r, i) => <div key={i} className="mb-2 flex flex-wrap items-center gap-2">
      {withDate && <input type="date" aria-label={L(ar, 'اليوم', 'Day')} className={`${input} max-w-[10rem]`} value={r.date} onChange={e => set(list.map((x, j) => j === i ? { ...x, date: e.target.value } : x))} />}
      <input type="time" aria-label={L(ar, 'من', 'From')} className={`${input} max-w-[8rem]`} value={r.start} onChange={e => set(list.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} />
      <input type="time" aria-label={L(ar, 'إلى', 'To')} className={`${input} max-w-[8rem]`} value={r.end} onChange={e => set(list.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} />
      <button type="button" className="text-xs font-bold text-[#A34D43]" onClick={() => set(list.filter((_, j) => j !== i))}>{L(ar, 'حذف', 'Remove')}</button></div>)}
    <button type="button" className={btn2} onClick={() => set([...list, { date: '', start: '09:00', end: '09:15' }])}>+</button></fieldset>;
  const UNSCHED: Record<string, [string, string]> = { NO_COMMITTEE_FOR_CATEGORY: ['لا لجنة لفئته', 'No panel for the category'], ALL_COMMITTEES_CONFLICTED: ['كل اللجان عليها تضارب مصالح', 'Every panel is conflicted'], NO_CAPACITY: ['لا سعة في الأيام المحددة', 'No capacity in the given days'], PIN_INVALID: ['تثبيت يدوي غير صالح', 'Invalid manual pin'] };
  return <section className="space-y-4">
    <h2 className="text-base font-black">{L(ar, 'الجدولة الذكية', 'Smart scheduler')}</h2>
    <p className="text-xs text-[#6a706c]">{L(ar, 'يُبنى الجدول من اللجان وفئاتها ومحكّميها، ومدة كل فئة، والاستراحات وأوقات الصلاة، وحالات تضارب المصالح. النتيجة قابلة للتفسير والتعديل اليدوي قبل الاعتماد.', 'Built from panels, categories, judges, session length, breaks, prayer times and conflicts. Explainable and manually adjustable before publishing.')}</p>
    <div className="grid gap-3 lg:grid-cols-3">{rows(days, setDays, true, L(ar, 'أيام المسابقة', 'Competition days'))}{rows(breaks, setBreaks, false, L(ar, 'الاستراحات', 'Breaks'))}{rows(prayers, setPrayers, false, L(ar, 'أوقات الصلاة', 'Prayer breaks'))}</div>
    <div className="flex flex-wrap items-end gap-3"><label className="text-xs font-bold">{L(ar, 'دقائق الانتقال بين الجلسات', 'Transition minutes')}<input type="number" min={0} className={`${input} max-w-[7rem]`} value={transition} onChange={e => setTransition(Number(e.target.value) || 0)} /></label>
      <button className={btn} onClick={() => { const r = s.generateSchedule({ days, breaks, prayerBreaks: prayers, transitionMinutes: transition }); setResult(r); if (r.ok) setSelected(r.plan.id); }}>{L(ar, 'توليد الجدول', 'Generate schedule')}</button><Result r={result} ar={ar} /></div>
    {plan && <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs"><select aria-label={L(ar, 'النسخة', 'Version')} className={`${input} max-w-xs`} value={plan.id} onChange={e => setSelected(e.target.value)}>{plans.map(p => <option key={p.id} value={p.id}>{new Date(p.createdAt).toLocaleString()} · {p.status}</option>)}</select>
        <span>{plan.plan.slots.length} {L(ar, 'موعدًا', 'slots')} · {plan.plan.unscheduled.length} {L(ar, 'بلا موعد', 'unscheduled')}</span>
        {plan.status !== 'published' && <button className={btn2} onClick={() => setResult(s.publishSchedule(plan.id))}>{L(ar, 'اعتماد الجدول', 'Publish schedule')}</button>}</div>
      {byDay.map(([date, list]) => <div key={date} className="overflow-x-auto rounded-2xl border border-[#e5e3dc]"><table className="w-full min-w-[640px] text-start text-xs"><caption className="p-2 text-start font-black">{date}</caption>
        <thead><tr className="text-[#6a706c]"><th scope="col" className="p-2">{L(ar, 'الوقت', 'Time')}</th><th scope="col">{L(ar, 'اللجنة', 'Panel')}</th><th scope="col">{L(ar, 'القاعة', 'Hall')}</th><th scope="col">{L(ar, 'المتسابق', 'Participant')}</th><th scope="col">{L(ar, 'سبب الاختيار', 'Why')}</th></tr></thead>
        <tbody>{list.map(x => <tr key={x.participantId} className="border-t border-[#ebe9e2]"><td className="p-2" dir="ltr">{x.start}–{x.end}{x.pinned ? ' 📌' : ''}</td><td>{x.committeeId}</td><td>{x.hallId}</td><td>{pname(x.participantId)}</td><td className="text-[#6a706c]">{x.reason}</td></tr>)}</tbody></table></div>)}
      {plan.plan.unscheduled.length > 0 && <div className="rounded-2xl bg-[#F5EDE2] p-3 text-xs"><b>{L(ar, 'تعذّرت جدولتهم', 'Could not be scheduled')}</b><ul className="mt-1 list-disc ps-5">{plan.plan.unscheduled.map(u => <li key={u.participantId}>{pname(u.participantId)} — {UNSCHED[u.reason][ar ? 0 : 1]}{u.detail ? ` (${u.detail})` : ''}</li>)}</ul></div>}
      {plan.status !== 'published' && <form className="flex flex-wrap items-end gap-2 rounded-2xl border border-[#e5e3dc] p-3" onSubmit={e => { e.preventDefault(); setResult(s.overrideScheduleSlot(plan.id, move)); }}>
        <b className="w-full text-xs">{L(ar, 'تعديل يدوي (تثبيت متسابق في لجنة ووقت)', 'Manual override (pin a participant)')}</b>
        <select aria-label={L(ar, 'المتسابق', 'Participant')} className={`${input} max-w-xs`} value={move.participantId} onChange={e => setMove({ ...move, participantId: e.target.value })}><option value="" />{plan.input.participants.map(p => <option key={p.id} value={p.id}>{pname(p.id)}</option>)}</select>
        <select aria-label={L(ar, 'اللجنة', 'Panel')} className={`${input} max-w-[10rem]`} value={move.committeeId} onChange={e => setMove({ ...move, committeeId: e.target.value })}><option value="" />{plan.input.committees.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}</select>
        <select aria-label={L(ar, 'اليوم', 'Day')} className={`${input} max-w-[10rem]`} value={move.date} onChange={e => setMove({ ...move, date: e.target.value })}><option value="" />{plan.input.days.map(d => <option key={d.date} value={d.date}>{d.date}</option>)}</select>
        <input type="time" aria-label={L(ar, 'الوقت', 'Time')} className={`${input} max-w-[8rem]`} value={move.start} onChange={e => setMove({ ...move, start: e.target.value })} />
        <button className={btn} disabled={!move.participantId || !move.committeeId || !move.date || !move.start}>{L(ar, 'تثبيت وإعادة الحساب', 'Pin & recompute')}</button>
        {move.participantId && plan.input.pins.some(p => p.participantId === move.participantId) && <button type="button" className={btn2} onClick={() => setResult(s.overrideScheduleSlot(plan.id, { participantId: move.participantId, unpin: true }))}>{L(ar, 'فكّ التثبيت', 'Unpin')}</button>}
      </form>}
      {plan.plan.warnings.length > 0 && <p className="text-[11px] text-[#725630]">{plan.plan.warnings.join(' · ')}</p>}
    </div>}
  </section>;
};

/* ═══ هرم التأهيل ═══ */
export const QualificationPanel: React.FC = () => {
  const s = useAppStore(); const ar = s.language === 'ar';
  const cid = s.competition.id;
  const others = s.competitions.filter(c => c.id !== cid && c.organizationId === s.competition.organizationId);
  const [form, setForm] = useState({ parent: '', topN: '3', minScore: '', perCategory: true, stage: '' });
  const [result, setResult] = useState<{ ok: boolean; code?: string } | null>(null);
  const tree = hierarchyOf(s.competitionRelationships, cid);
  const rels = s.competitionRelationships.filter(r => r.childCompetitionId === cid);
  const comp = (id: string) => { const c = s.competitions.find(x => x.id === id); return c ? (ar ? c.nameArabic : c.name || c.nameArabic) : id; };
  const pname = (id: string) => { const p = s.participants.find(x => x.id === id); return p ? `${p.code} · ${ar ? p.fullNameArabic : p.fullName}` : id; };
  const STATUS: Record<string, [string, string]> = { qualified: ['متأهّل', 'Qualified'], invited: ['مدعو', 'Invited'], accepted: ['قَبِل', 'Accepted'], declined: ['اعتذر', 'Declined'], revoked: ['أُلغي', 'Revoked'] };
  return <section className="space-y-4">
    <h2 className="text-base font-black">{L(ar, 'هرم التأهيل', 'Qualification hierarchy')}</h2>
    {(tree.up.length > 0 || tree.down.length > 0) && <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label={L(ar, 'المراحل', 'Stages')}>
      {[...tree.down.map(r => r.childCompetitionId).reverse(), cid, ...tree.up.map(r => r.parentCompetitionId)].map((id, i, all) => <li key={`${id}-${i}`} className="flex items-center gap-2"><span className={`rounded-full px-3 py-1 ${id === cid ? 'bg-[#214C40] text-white' : 'bg-[#f4f2ec]'}`}>{comp(id)}</span>{i < all.length - 1 && <span aria-hidden="true">←</span>}</li>)}
    </ol>}
    <form className="grid gap-3 rounded-2xl border border-[#e5e3dc] p-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); setResult(s.linkQualifierTo(form.parent, { topN: form.topN ? Number(form.topN) : undefined, minScore: form.minScore ? Number(form.minScore) : undefined, perCategory: form.perCategory }, form.stage || undefined)); }}>
      <label className="text-xs font-bold">{L(ar, 'هذه المسابقة تصفياتٌ لـ', 'This competition qualifies for')}<select className={input} value={form.parent} onChange={e => setForm({ ...form, parent: e.target.value })}><option value="" />{others.map(c => <option key={c.id} value={c.id}>{comp(c.id)}</option>)}</select></label>
      <label className="text-xs font-bold">{L(ar, 'اسم المرحلة', 'Stage label')}<input className={input} placeholder={L(ar, 'تصفيات إقليمية', 'Regional qualifier')} value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })} /></label>
      <label className="text-xs font-bold">{L(ar, 'أفضل N', 'Top N')}<input type="number" min={1} className={input} value={form.topN} onChange={e => setForm({ ...form, topN: e.target.value })} /></label>
      <label className="text-xs font-bold">{L(ar, 'أو حدّ أدنى للدرجة', 'Or minimum score')}<input type="number" className={input} value={form.minScore} onChange={e => setForm({ ...form, minScore: e.target.value })} /></label>
      <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={form.perCategory} onChange={e => setForm({ ...form, perCategory: e.target.checked })} />{L(ar, 'لكل فئة على حدة', 'Per category')}</label>
      <div className="flex items-center gap-3"><button className={btn} disabled={!form.parent}>{L(ar, 'ربط المرحلة', 'Link stage')}</button><Result r={result} ar={ar} /></div>
    </form>
    {rels.map(r => { const qs = s.qualifications.filter(q => q.relationshipId === r.id); return <div key={r.id} className="rounded-2xl border border-[#e5e3dc] p-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2"><b>{r.stageLabel || L(ar, 'تصفيات', 'Qualifier')} → {comp(r.parentCompetitionId)}</b><button className={btn2} onClick={() => setResult(s.computeQualifications(r.id))}>{L(ar, 'احتساب المتأهّلين من النتائج المختومة', 'Compute from sealed results')}</button></div>
      <p className="mt-1 text-[#6a706c]">{r.rule.topN ? `${L(ar, 'أفضل', 'Top')} ${r.rule.topN}` : ''}{r.rule.minScore !== undefined ? ` · ≥ ${r.rule.minScore}` : ''}{r.rule.perCategory ? L(ar, ' لكل فئة', ' per category') : ''}</p>
      <ul className="mt-2 divide-y divide-[#ebe9e2]">{qs.map(q => <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span>#{q.rank} · {pname(q.sourceParticipantId)} · {q.score}{q.evidence.sealChecksum ? ` · ${L(ar, 'مختوم', 'sealed')}` : ''}</span>
        <span className="flex items-center gap-2"><b>{STATUS[q.status][ar ? 0 : 1]}</b>
          {q.status === 'qualified' && <button className={btn2} onClick={() => setResult(s.setQualificationStatus(q.id, 'invited'))}>{L(ar, 'دعوة للمرحلة التالية', 'Invite to next stage')}</button>}
          {(q.status === 'qualified' || q.status === 'invited' || q.status === 'accepted') && <button className="text-[11px] font-bold text-[#A34D43]" onClick={() => { const note = window.prompt(L(ar, 'سبب الإلغاء', 'Reason for revoking')) || ''; setResult(s.setQualificationStatus(q.id, 'revoked', note)); }}>{L(ar, 'إلغاء', 'Revoke')}</button>}
        </span></li>)}</ul>
    </div>; })}
  </section>;
};

/* ═══ رسوم التسجيل (تفرضها الجهة) ═══ */
export const RegistrationPaymentsPanel: React.FC = () => {
  const s = useAppStore(); const ar = s.language === 'ar';
  const [q, setQ] = useState('');
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; code?: string } | null>(null);
  const rows = s.participants.filter(p => p.competitionId === s.competition.id && p.registrationPayment && `${p.code} ${p.fullName} ${p.fullNameArabic}`.toLowerCase().includes(q.toLowerCase()));
  const money = (m: number, c: string) => `${Math.floor(m / 100)}.${String(m % 100).padStart(2, '0')} ${c}`;
  const STATUS: Record<string, [string, string]> = { pending: ['معلّق', 'Pending'], paid: ['مدفوع', 'Paid'], refunded: ['مسترد', 'Refunded'], waived: ['معفى', 'Waived'], not_required: ['غير مطلوب', 'Not required'] };
  if (!rows.length && !q) return null;
  return <section className="mt-4 space-y-2 rounded-2xl border border-[#e5e3dc] p-4">
    <h3 className="text-sm font-black">{L(ar, 'تحصيل رسوم التسجيل', 'Registration fee collection')}</h3>
    <input type="search" aria-label={L(ar, 'بحث', 'Search')} className={input} value={q} onChange={e => setQ(e.target.value)} />
    <Result r={result} ar={ar} />
    <ul className="divide-y divide-[#ebe9e2] text-xs">{rows.map(p => { const pay = p.registrationPayment!; return <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span>{p.code} · {ar ? p.fullNameArabic : p.fullName} · {money(pay.amountMinor, pay.currency)} · <b>{STATUS[pay.status][ar ? 0 : 1]}</b>{pay.receiptReference ? ` · ${pay.receiptReference}` : ''}</span>
      <span className="flex flex-wrap items-center gap-2">
        <input aria-label={L(ar, 'مرجع الإيصال', 'Receipt reference')} placeholder={L(ar, 'مرجع الإيصال', 'Receipt ref.')} className={`${input} max-w-[9rem]`} value={refs[p.id] || ''} onChange={e => setRefs({ ...refs, [p.id]: e.target.value })} />
        {pay.status !== 'paid' && <button className={btn2} onClick={() => setResult(s.setRegistrationPayment(p.id, 'paid', refs[p.id]))}>{L(ar, 'مدفوع', 'Mark paid')}</button>}
        {pay.status === 'paid' && <button className={btn2} onClick={() => setResult(s.setRegistrationPayment(p.id, 'refunded', refs[p.id]))}>{L(ar, 'استرداد', 'Refund')}</button>}
        {pay.status === 'pending' && <button className={btn2} onClick={() => setResult(s.setRegistrationPayment(p.id, 'waived'))}>{L(ar, 'إعفاء', 'Waive')}</button>}
      </span></li>; })}</ul>
  </section>;
};
