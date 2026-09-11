import React,{useMemo,useState} from 'react';
import { bilingualName } from '../../lib/ui-language';
import { ArrowLeftRight, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { queueOrderValue, queueTransferImpact } from '../../lib/judging-integrity';
import { accruedWaitMinutes, equityWarranted, recommendFairPosition } from '../../lib/queue-equity';
import { Button } from '../design-system/Button';
import { Badge } from '../design-system/Badge';

export const QueueJustice:React.FC=()=>{
 const s=useAppStore(),ar=s.language==='ar';
 const panels=s.committees.filter(c=>c.status!=='offline');
 const defaultSource=panels.find(c=>s.participants.some(p=>p.status==='in_queue'&&p.assignedCommitteeId===c.id))?.id||panels[0]?.id||'';
 const [source,setSource]=useState(defaultSource),[target,setTarget]=useState(panels.find(c=>c.id!==defaultSource)?.id||'');
 const [scope,setScope]=useState<'all'|'one'>('all'),[participantId,setParticipantId]=useState('');
 const [mode,setMode]=useState<'PRESERVE_ORIGINAL_TURN'|'MOVE_TO_END'|'EQUITY_BY_WAITING_TIME'>('PRESERVE_ORIGINAL_TURN');
 const [allowCrossCategory,setAllowCrossCategory]=useState(false);
 const [reason,setReason]=useState(''),[result,setResult]=useState<{ok:boolean;message:string}|null>(null);
 const queue=useMemo(()=>s.participants.filter(p=>p.status==='in_queue'&&p.assignedCommitteeId===source).sort((a,b)=>queueOrderValue(a)-queueOrderValue(b)),[s.participants,source]);
 const targetQueue=useMemo(()=>s.participants.filter(p=>p.status==='in_queue'&&p.assignedCommitteeId===target).sort((a,b)=>queueOrderValue(a)-queueOrderValue(b)),[s.participants,target]);
 const impact=useMemo(()=>queueTransferImpact({participants:s.participants,sourceCommitteeId:source,targetCommitteeId:target,participantIds:scope==='one'&&participantId?[participantId]:undefined,mode}),[s.participants,source,target,scope,participantId,mode]);
 /* ما يستردّه العدل، بالأرقام، قبل التنفيذ — فلا يُطبَّق استثناءٌ على ترتيب الوصول بلا أن يُرى أثره. */
 const equity=useMemo(()=>{
  const movers=scope==='one'&&participantId?queue.filter(p=>p.id===participantId):queue;
  if(!movers.length)return [];
  const growing=[...targetQueue];
  return [...movers].sort((a,b)=>accruedWaitMinutes(b)-accruedWaitMinutes(a)).map(p=>{
   const rec=recommendFairPosition({mover:p,targetQueue:growing});
   growing.push({...p,queueOrderKey:rec.orderKey});
   return {p,rec};
  });
 },[queue,targetQueue,scope,participantId]);
 const recovered=equity.filter(x=>equityWarranted(x.rec));
 const apply=()=>{const out=s.transferQueueParticipants({sourceCommitteeId:source,targetCommitteeId:target,participantIds:scope==='one'&&participantId?[participantId]:undefined,mode,reason,allowCrossCategory});if(out.ok&&'record' in out){setResult({ok:true,message:ar?`تم النقل مع حفظ سجل العدالة. عدد المنقولين: ${out.record.participantIds.length}`:`Transfer applied with an auditable fairness record. Moved: ${out.record.participantIds.length}`});setReason('');setParticipantId('')}else setResult({ok:false,message:ar?reasonAr(out.reason):String(out.reason)});};
 if(panels.length<2)return null;
 return <section className="mizan-surface p-5 sm:p-6"><div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4"><div className="flex items-start gap-3"><span className="w-11 h-11 rounded-xl bg-[#E7EEE9] text-[#214C40] grid place-items-center"><ArrowLeftRight className="w-5 h-5"/></span><div><div className="mizan-kicker">{ar?'عدالة الطابور':'QUEUE JUSTICE'}</div><h2 className="font-black mt-1">{ar?'انقل لجنة كاملة أو متسابقًا واحدًا دون ضياع الأسبقية':'Move a panel queue or one participant without losing priority'}</h2><p className="text-[11px] text-[#646965] mt-2 max-w-2xl">{ar?'رقم الوصول الأصلي لا يتغير. عند حفظ الأسبقية تندمج القائمتان حسب ترتيب الوصول الأول؛ ويمكن اختيار آخر الطابور صراحةً لمتسابق واحد.':'Original arrival number is immutable. Preserve mode merges queues by original arrival order; tail mode is explicit.'}</p></div></div><Badge variant="emerald">{ar?'سجل تدقيق':'Audited'}</Badge></div>
  <div className="grid md:grid-cols-2 gap-3 mt-5"><Select label={ar?'من اللجنة':'From panel'} value={source} onChange={v=>{setSource(v);if(v===target)setTarget(panels.find(c=>c.id!==v)?.id||'')}} options={panels.map(c=>({value:c.id,label:`${c.code} · ${bilingualName(c,ar)}`}))}/><Select label={ar?'إلى اللجنة':'To panel'} value={target} onChange={setTarget} options={panels.filter(c=>c.id!==source).map(c=>({value:c.id,label:`${c.code} · ${bilingualName(c,ar)}`}))}/></div>
  <div className="grid lg:grid-cols-[1fr_1fr] gap-3 mt-3"><div className="rounded-2xl border border-[#dfddd6] p-4"><div className="text-[10px] font-black text-[#646965]">{ar?'النطاق':'SCOPE'}</div><div className="grid grid-cols-2 gap-2 mt-3"><Choice active={scope==='all'} onClick={()=>setScope('all')} icon={UsersRound} title={ar?'كل المنتظرين':'All waiting'} note={`${queue.length}`}/><Choice active={scope==='one'} onClick={()=>setScope('one')} icon={UserRound} title={ar?'متسابق واحد':'One participant'} note={ar?'اختيار دقيق':'Select'}/></div>{scope==='one'&&<select value={participantId} onChange={e=>setParticipantId(e.target.value)} className="mizan-input mt-3 text-sm"><option value="">{ar?'اختر المتسابق':'Choose participant'}</option>{queue.map((p,i)=><option key={p.id} value={p.id}>{p.code} · {ar?p.fullNameArabic:p.fullName} · {ar?'أمامه': 'ahead'} {i}</option>)}</select>}</div>
   <div className="rounded-2xl border border-[#dfddd6] p-4"><div className="text-[10px] font-black text-[#646965]">{ar?'سياسة الدور':'TURN POLICY'}</div><div className="grid grid-cols-2 gap-2 mt-3"><button onClick={()=>setMode('PRESERVE_ORIGINAL_TURN')} className={`rounded-xl p-3 text-start border ${mode==='PRESERVE_ORIGINAL_TURN'?'border-[#214C40] bg-[#E7EEE9]':'border-[#dedcd5]'}`}><div className="text-xs font-black">{ar?'نفس الأسبقية':'Preserve priority'}</div><div className="text-[9px] mt-1 text-[#646965]">{ar?'حسب رقم الوصول الأصلي':'Original arrival number'}</div></button><button onClick={()=>setMode('MOVE_TO_END')} className={`rounded-xl p-3 text-start border ${mode==='MOVE_TO_END'?'border-[#214C40] bg-[#E7EEE9]':'border-[#dedcd5]'}`}><div className="text-xs font-black">{ar?'آخر الطابور':'Move to end'}</div><div className="text-[9px] mt-1 text-[#646965]">{ar?'قرار استثنائي واضح':'Explicit exception'}</div></button>
   <button onClick={()=>setMode('EQUITY_BY_WAITING_TIME')} className={`col-span-2 rounded-xl p-3 text-start border ${mode==='EQUITY_BY_WAITING_TIME'?'border-[#214C40] bg-[#E7EEE9]':'border-[#dedcd5]'}`}><div className="text-xs font-black">{ar?'بما انتظره فعلًا':'By time already waited'}</div><div className="text-[9px] mt-1 text-[#646965]">{ar?'من انتظر خمسين دقيقة لا يبدأ من جديد خلف من انتظر عشرًا':'Fifty minutes waited does not restart behind ten'}</div></button></div><div className="mt-3 text-[10px] text-[#646965]">{ar?`الهدف الآن: ${targetQueue.length} منتظرين`:`Target now: ${targetQueue.length} waiting`}</div></div>
  </div>
  {impact.ok&&<div className={`mt-3 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${impact.priorityPreserved?'bg-[#E7EEE9] text-[#214C40]':'bg-[#F2EADC] text-[#725630]'}`}><div><div className="text-xs font-black">{impact.priorityPreserved?(ar?'الأسبقية محفوظة':'Priority preserved'):(ar?'سيحدث تنازل عن الأسبقية':'Priority displacement is explicit')}</div><div className="text-[10px] mt-1 opacity-80">{impact.priorityPreserved?(ar?'لا توجد انعكاسات في ترتيب الوصول الأصلي بعد الدمج.':'No original-arrival inversions after the merge.'):(ar?`إجمالي المراكز المتنازل عنها: ${impact.totalLostPriorityPositions}`:`Total relinquished positions: ${impact.totalLostPriorityPositions}`)}</div></div><div className="text-2xl font-black tabular-nums">{impact.priorityInversions}</div></div>}
  {mode==='EQUITY_BY_WAITING_TIME'&&<div className="mt-3 rounded-2xl border border-[#dfddd6] p-4">
   <div className="text-[10px] font-black text-[#646965]">{ar?'ما يستردّه العدل':'WHAT EQUITY RECOVERS'}</div>
   {recovered.length?<ul className="mt-2.5 divide-y divide-[#e6e4dd] max-h-44 overflow-auto">{recovered.map(({p,rec})=><li key={p.id} className="py-2 flex items-center justify-between gap-3 text-[11px]">
    <span className="font-black">{p.code}</span>
    <span className="text-[#646965]">{ar?`انتظر ${rec.waitedMinutes} دقيقة`:`waited ${rec.waitedMinutes} min`}</span>
    <span className="font-black tabular-nums">{ar?`${rec.positionIfAppended} ← ${rec.fairPosition}`:`${rec.positionIfAppended} → ${rec.fairPosition}`}</span>
   </li>)}</ul>
   :<div className="mt-2 text-[10px] text-[#646965] leading-5">{ar?'لا أحد يخسر مركزًا بهذا النقل، فلا حاجة إلى استثناء على ترتيب الوصول.':'Nobody loses a place in this move, so no exception to arrival order is needed.'}</div>}
   <div className="mt-2.5 text-[9px] text-[#7a6a4e] leading-4">{ar?'هذا يخالف ترتيب الوصول عمدًا: العملة هنا كم انتظر لا متى وصل. يُسجَّل بسببه في سجل التدقيق.':'This deliberately departs from arrival order: the currency is time waited, not time of arrival. It is audited with its reason.'}</div>
  </div>}

  {/* لجنةٌ لا تحكم فئته: استثناءٌ يُطلب صراحةً، وأسئلته تبقى أسئلة فئته هو. */}
  <label className="mt-3 flex items-start gap-2.5 rounded-2xl border border-[#e0d3b8] bg-[#fffaf0] p-3.5 cursor-pointer">
   <input type="checkbox" checked={allowCrossCategory} onChange={e=>setAllowCrossCategory(e.target.checked)} className="mt-0.5"/>
   <span>
    <span className="block text-xs font-black text-[#604724]">{ar?'اسمح بالنقل إلى لجنة لا تحكم فئته':'Allow a panel that does not judge his category'}</span>
    <span className="block text-[10px] text-[#6b5b45] mt-1 leading-5">{ar?'يُستعمل حين تتعطّل لجان فئته. يبقى المتسابق يُسأل في نطاق فئته هو — لا في تخصّص اللجنة — وتُوسَم حالته للمحكّمين حتى لا يحكموا بمسطرة فئتهم.':'For when the panels of his own category are down. He is still questioned within his own category scope, and the panel is warned so it does not judge him by its usual rubric.'}</span>
   </span>
  </label>

  <div className="mt-3 grid sm:grid-cols-[1fr_auto] gap-3 sm:items-end"><label className="block"><span className="block text-[10px] font-black text-[#646965] mb-2">{ar?'سبب النقل (مطلوب)':'Transfer reason (required)'}</span><input value={reason} onChange={e=>setReason(e.target.value)} placeholder={ar?'سبب النقل: عطل، ازدحام، ظرف اللجنة…':'Reason: outage, congestion, panel exception…'} className="mizan-input text-sm"/></label><Button onClick={apply} disabled={!source||!target||!reason.trim()||(scope==='one'&&!participantId)} icon={<ShieldCheck className="w-4 h-4"/>}>{ar?'تنفيذ النقل العادل':'Apply fair transfer'}</Button></div>
  {result&&<div className={`mt-3 rounded-xl p-3 text-xs font-bold ${result.ok?'bg-[#E7EEE9] text-[#214C40]':'bg-[#F4E6E3] text-[#88473f]'}`}>{result.message}</div>}
 </section>
}
const Select=({label,value,onChange,options}:{label:string;value:string;onChange:(v:string)=>void;options:{value:string;label:string}[]})=><label><span className="block text-[10px] font-black text-[#646965] mb-2">{label}</span><select value={value} onChange={e=>onChange(e.target.value)} className="mizan-input text-sm">{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
const Choice=({active,onClick,icon:Icon,title,note}:{active:boolean;onClick:()=>void;icon:React.ComponentType<{className?:string}>;title:string;note:string})=><button onClick={onClick} className={`rounded-xl p-3 text-start border ${active?'border-[#214C40] bg-[#E7EEE9]':'border-[#dedcd5]'}`}><Icon className="w-4 h-4"/><div className="text-xs font-black mt-2">{title}</div><div className="text-[9px] text-[#646965] mt-1">{note}</div></button>;
const reasonAr=(r:string)=>({UNAUTHORIZED:'لا تملك صلاحية النقل.',EXCEPTION_NOT_AUTHORIZED:'النقل عبر الفئات يحتاج صلاحية مدير المسابقة أو مدير التشغيل.',REASON_REQUIRED:'اكتب سبب النقل.',COMMITTEE_NOT_FOUND:'اللجنة غير متاحة.',SAME_COMMITTEE:'اختر لجنة مختلفة.',NO_WAITING_PARTICIPANTS:'لا يوجد متسابقون منتظرون للنقل.',INCOMPATIBLE_TARGET:'اللجنة الهدف غير متوافقة مع أحد المتسابقين.'} as Record<string,string>)[r]||r;
