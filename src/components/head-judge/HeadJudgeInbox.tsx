import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Bot, Check, FileCheck2, Gavel, Headphones, LockKeyhole, ShieldCheck, X, Activity } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { getCompetitionPolicy } from '../../lib/competition-config';
import { sealFailureLabel } from '../../lib/ui-language';
import { Badge } from '../design-system/Badge';
import { Ratio } from '../design-system/Ratio';
import { Button } from '../design-system/Button';
import { AudioWaveform } from '../design-system/AudioWaveform';
import { ContinuityRecovery } from '../operations/ContinuityRecovery';

import { EmergencyQuestionAuthorization } from '../admin/EmergencyQuestionAuthorization';
import { JudgeDriftMonitor } from './JudgeDriftMonitor';
import { JudgeCalibrationPanel, type JudgeCalibrationRow, type RankScenarioRow } from './JudgeCalibrationPanel';
import { fetchJudgeCalibration, measureJudgingReliability, type ReliabilityReport } from '../../lib/judge-calibration-client';
import { ReliabilityPanel } from './ReliabilityPanel';
type Tab='reviews'|'appeals'|'panel'|'seal';
// Severity was printed raw — "medium", "low" — inside an Arabic triage list, and
// only two of the three levels were ever distinguished by tone.
const SEVERITY:Record<string,{ar:string;en:string}>={
 high:{ar:'عالية',en:'High'},
 medium:{ar:'متوسطة',en:'Medium'},
 low:{ar:'منخفضة',en:'Low'},
};

export const HeadJudgeInbox: React.FC = () => {
 const store=useAppStore(); const {language,reviewCases,appeals,competition,sealApprovals}=store; const ar=language==='ar'; const policy=getCompetitionPolicy(competition);
 const pending=reviewCases.filter(r=>r.status==='pending'); const pendingAppeals=appeals.filter(a=>a.status==='submitted'||a.status==='under_review'); const [tab,setTab]=useState<Tab>('reviews');
 const [selected,setSelected]=useState(pending[0]?.id||''); const [note,setNote]=useState(''); const current=reviewCases.find(r=>r.id===selected)||pending[0];
 const [appealId,setAppealId]=useState(pendingAppeals[0]?.id||''); const [appealNote,setAppealNote]=useState(''); const [delta,setDelta]=useState(0); const currentAppeal=appeals.find(a=>a.id===appealId)||pendingAppeals[0];
 const approvals=new Set(sealApprovals.map(a=>a.actorId)).size; const guardian=store.getIntegrityAnalytics(); const guardianAttention=guardian.filter(x=>x.attention);
 const canSeal=reviewCases.every(r=>r.status!=='pending')&&appeals.every(a=>a.status!=='submitted'&&a.status!=='under_review')&&store.results.length>0;
 const alreadyApproved=sealApprovals.some(a=>a.actorId===store.currentUser.id);
 /* Calibration compares each judge with the peers who scored the same participant, so a
    difference in ruler shows up as a difference in ruler rather than as a difference between
    participants. The maths runs server-side behind the head-judge role — the panel simply stays
    hidden for anyone not entitled to see it. Advisory only: nothing here edits a score. */
 const [calibration,setCalibration]=useState<{judges:JudgeCalibrationRow[];scenario:RankScenarioRow[]}>({judges:[],scenario:[]});
 const [reliability,setReliability]=useState<ReliabilityReport|null>(null);
 /* رفض الختم يجب أن يُقال. زرٌّ يُضغط فلا يقع شيء ولا يُشرح سببه أسوأ من زرٍّ معطّل. */
 const [sealNote,setSealNote]=useState('');
 /* الختم نداءٌ إلى الخادم: بلا حارس انشغال يُضغط الزر مرتين فتُرسل موافقتان من جهاز واحد. */
 const [sealBusy,setSealBusy]=useState(false);
 const approveSeal=async()=>{setSealBusy(true);setSealNote('');try{const out=await store.sealResults();setSealNote(sealFailureLabel(out as {sealed?:boolean;reason?:string;message?:string},ar))}finally{setSealBusy(false)}};
 useEffect(()=>{let live=true;
  const observations=store.judgeSubmissions.flatMap(sub=>Object.entries(sub.criterionScores||{}).map(([criterionId,score])=>({
   judgeId:sub.judgeId,judgeName:sub.judgeName,sessionId:sub.sessionId,participantId:sub.participantId||sub.sessionId,criterionId,score:Number(score),
  }))).filter(o=>Number.isFinite(o.score));
  if(observations.length<6){setCalibration({judges:[],scenario:[]});return}
  void fetchJudgeCalibration(observations).then(r=>{if(live&&r)setCalibration(r)});
  return()=>{live=false}},[store.judgeSubmissions]);

 /*
  * موثوقية التحكيم تُقاس من حكمين مستقلّين على الجلسة نفسها. لا يُفتعل زوجٌ حين لا يوجد:
  * جلسة حكمها محكّم واحد لا تُنتج قياسًا، واللوحة تغيب بدل أن تعرض رقمًا بلا سند.
  */
 useEffect(()=>{let live=true;
  const byId=new Map<string,typeof store.judgeSubmissions>();
  for(const x of store.judgeSubmissions){const k=x.sessionId;byId.set(k,[...(byId.get(k)||[]),x])}
  const assignments:any[]=[],originals:any[]=[],reviews:any[]=[];
  for(const [sessionId,subs] of byId){
   if(subs.length<2)continue;
   const [first,second]=[...subs].sort((a,b)=>String(a.submittedAt||'').localeCompare(String(b.submittedAt||'')));
   assignments.push({sessionId,participantId:first.participantId||'',reviewerId:second.judgeId,originalJudgeId:first.judgeId,assignedAt:''});
   originals.push({sessionId,participantId:first.participantId||'',judgeId:first.judgeId,submittedAt:first.submittedAt||'',totalScore:first.totalScore,criterionScores:first.criterionScores});
   reviews.push({sessionId,participantId:second.participantId||'',judgeId:second.judgeId,submittedAt:second.submittedAt||'',totalScore:second.totalScore,criterionScores:second.criterionScores});
  }
  if(!assignments.length){setReliability(null);return}
  void measureJudgingReliability({assignments,originals,reviews,criteria:(store.competition.ruleSet?.criteria||[]).map(c=>({id:c.id,maxScore:c.maxScore}))}).then(r=>{if(live)setReliability(r)});
  return()=>{live=false}},[store.judgeSubmissions]);
 return <div className="max-w-6xl mx-auto px-4 sm:px-6 py-7 space-y-5">
  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"><div><div className="mizan-kicker">{ar?'رئيس التحكيم':'HEAD JUDGE'}</div><h1 className="text-3xl sm:text-4xl font-black mt-1">{ar?'القرار البشري في الحالات المهمة':'Human decision where it matters'}</h1><p className="text-sm text-[#636864] mt-2">{ar?'لا تراجع الطبيعي. النظام يجلب لك الاختلاف، الاعتراض، واعتماد الختم فقط.':'Routine stays out of the way; you receive discrepancies, appeals and seal approval only.'}</p></div><div className="flex gap-2"><Badge variant={pending.length?'amber':'emerald'}>{pending.length} {ar?'مراجعة':'reviews'}</Badge><Badge variant={pendingAppeals.length?'amber':'neutral'}>{pendingAppeals.length} {ar?'اعتراض':'appeals'}</Badge></div></div>
  {store.continuityIncidents.some(x=>x.status!=='RESOLVED')&&<ContinuityRecovery/>}
  {/* الأقسام كانت مكدّسة كلها ظاهرة: أربعة أقسام وخمسة رسوم قبل أن يصل رئيس التحكيم إلى عمله.
      صارت خلف تبويب واحد أعلى الشاشة، ويبقى بلاغ الاستمرارية وحده فوق التبويب لأنه حادث جارٍ. */}
  <div className="mizan-tabs" role="tablist"><TabButton active={tab==='reviews'} onClick={()=>setTab('reviews')} icon={Gavel} label={ar?'مراجعات التحكيم':'Judging reviews'} count={pending.length}/><TabButton active={tab==='appeals'} onClick={()=>setTab('appeals')} icon={FileCheck2} label={ar?'الاعتراضات':'Appeals'} count={pendingAppeals.length}/><TabButton active={tab==='panel'} onClick={()=>setTab('panel')} icon={Activity} label={ar?'حالة اللجنة':'Panel health'} count={0}/><TabButton active={tab==='seal'} onClick={()=>setTab('seal')} icon={LockKeyhole} label={ar?'الختم والطوارئ':'Seal & emergency'} count={0}/></div>
  {tab==='panel'&&<>
  <ReliabilityPanel data={reliability} ar={ar}/>
  <JudgeCalibrationPanel judges={calibration.judges} scenario={calibration.scenario} ar={ar}/>
  <JudgeDriftMonitor/>
  </>}
  {tab==='seal'&&<>
  <EmergencyQuestionAuthorization/>
  {guardianAttention.length>0&&<div className="mizan-surface p-4 flex items-center gap-3"><span className="w-10 h-10 rounded-xl bg-[#F2EADC] text-[#7d5e34] grid place-items-center"><ShieldCheck className="w-5 h-5"/></span><div className="flex-1"><div className="text-sm font-black">{ar?'مراجعة مساندة · ميل مسطرة يحتاج انتباه':'Judge Guardian · scale tendency needs attention'}</div><div className="text-[10px] text-[#656b66] mt-1">{guardianAttention.map(x=>`${x.name}: ${x.deviationFromPanel>0?'+':''}${x.deviationFromPanel} ${ar?(x.tendency==='HAWK'?'أشدّ':'أليَن'):x.tendency}`).join(' · ')}</div><div className="text-[9px] leading-4 text-[#6b706c] mt-1">{ar?'مقارنة مع بقية اللجنة على المتسابق نفسه، بانكماش يمنع الحكم من عيّنة صغيرة. استشاري فقط: لا يُعدَّل حكم محكّم.':'Compared with the rest of the panel on the same participant, shrunk so a small sample cannot label a judge. Advisory only: no judge score is altered.'}</div></div><Badge variant="amber">{guardianAttention.length}</Badge></div>}
  <div className="mizan-surface p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="w-10 h-10 rounded-xl bg-[#E7EEE9] text-[#214C40] grid place-items-center"><LockKeyhole className="w-5 h-5"/></span><div><div className="text-sm font-black">{ar?'اعتماد ختم النتائج':'Result seal approval'}</div><div className="text-[11px] text-[#646965] mt-1">{policy.results.requireDualApprovalToSeal?<>{/* «2/1 اعتمادات» تنقلب في العربية فتُقرأ اعتمادين من واحد. */}<Ratio value={approvals} of={2}/>{ar?' اعتمادات مستقلة':' independent approvals'}</>:(ar?'لا تتطلب هذه المسابقة اعتمادًا مزدوجًا':'Dual approval is disabled for this competition')}</div></div></div><Button size="sm" variant={alreadyApproved?'secondary':'outline'} disabled={!canSeal||alreadyApproved||sealBusy} onClick={()=>void approveSeal()} icon={alreadyApproved?<BadgeCheck className="w-4 h-4"/>:<LockKeyhole className="w-4 h-4"/>}>{sealBusy?(ar?'جارٍ الاعتماد…':'Approving…'):alreadyApproved?(ar?'تم اعتمادي':'Approved'):(ar?'أعتمد الختم':'Approve seal')}</Button></div>
  {sealNote&&<p role="status" className="rounded-2xl bg-[#F5EDE2] px-4 py-3 text-[11px] font-bold leading-5 text-[#7a5a2f]">{sealNote}</p>}
  </>}
  {tab==='reviews'&&(!current?<ClearState ar={ar} textAr="لا توجد مراجعات تحكيم معلقة" textEn="No judging reviews are pending"/>:<div className="grid lg:grid-cols-[300px_1fr] gap-4">
   <aside className="mizan-surface p-2 h-fit flex items-stretch gap-1 overflow-x-auto lg:block"><div className="px-3 py-3 text-[11px] font-black text-[#666a67] shrink-0 self-center lg:self-auto">{ar?'الوارد':'INBOX'}</div>{pending.map(r=><button key={r.id} onClick={()=>{setSelected(r.id);setNote('')}} className={`w-64 shrink-0 lg:w-full lg:shrink text-start rounded-xl p-3 lg:mb-1 transition ${current.id===r.id?'bg-[#E7EEE9]':'hover:bg-[#f2f0ea]'}`}><div className="flex items-center justify-between"><span className="text-sm font-black">{r.participantCode}</span><Badge variant={r.severity==='high'?'rose':r.severity==='medium'?'amber':'neutral'}>{SEVERITY[r.severity]?.[ar?'ar':'en']||r.severity}</Badge></div><div className="text-[11px] text-[#636864] mt-1 truncate">{reasonLabel(r.reason,ar)}</div></button>)}</aside>
   <section className="mizan-surface p-5 sm:p-7"><div className="flex items-start justify-between gap-4 pb-5 border-b border-[#e5e3dc]"><div><div className="flex items-center gap-2"><Badge variant="neutral" dot={false}>{current.participantCode}</Badge><Badge variant={current.reason==='ai_high_confidence_alert'?'amber':'neutral'}>{reasonLabel(current.reason,ar)}</Badge></div><h2 className="text-xl font-black mt-3">{ar?'مقطع مراجعة مركز':'Focused review clip'}</h2><p className="text-xs text-[#646965] mt-1">{current.timestampSec}s · {current.details}</p></div><ShieldCheck className="w-6 h-6 text-[#2F6555]"/></div><div className="py-6"><div className="rounded-2xl bg-[#17221e] p-5 text-white"><div className="flex items-center gap-3 mb-4"><span className="w-10 h-10 rounded-xl bg-white/10 grid place-items-center"><Headphones className="w-5 h-5"/></span><div><div className="text-sm font-black">{ar?'السياق القريب':'Focused context'}</div><div className="text-[10px] text-white/45">{ar?'التسجيل الكامل يبقى متاحًا وفق سياسة الاحتفاظ':'Full recording remains available under retention policy'}</div></div></div><AudioWaveform active={false} height={42}/></div></div>{current.reason==='ai_high_confidence_alert'&&<div className="rounded-xl bg-[#F2EADC] text-[#70542f] p-3 text-xs flex gap-2"><Bot className="w-4 h-4 shrink-0"/><span>{ar?'إشارة آلية مساندة فقط. لا يوجد خصم تلقائي.':'Assistive AI observation only. No automatic deduction.'}</span></div>}<textarea aria-label={ar?'ملاحظة القرار':'Decision note'} value={note} onChange={e=>setNote(e.target.value)} placeholder={ar?'ملاحظة مختصرة — اختيارية':'Short note — optional'} className="mizan-textarea mt-5 min-h-24 resize-none text-sm"/><div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={()=>store.resolveReviewCase(current.id,'dismissed',note)} icon={<X className="w-4 h-4"/>}>{ar?'استبعاد':'Dismiss'}</Button><Button onClick={()=>store.resolveReviewCase(current.id,'confirmed',note)} icon={<Check className="w-4 h-4"/>}>{ar?'تأكيد للمراجعة العلمية':'Confirm review finding'}</Button></div></section>
  </div>)}
  {tab==='appeals'&&(!currentAppeal?<ClearState ar={ar} textAr="لا توجد اعتراضات معلقة" textEn="No appeals are pending"/>:<div className="grid lg:grid-cols-[300px_1fr] gap-4"><aside className="mizan-surface p-2 h-fit flex items-stretch gap-1 overflow-x-auto lg:block"><div className="px-3 py-3 text-[11px] font-black text-[#666a67] shrink-0 self-center lg:self-auto">{ar?'الاعتراضات':'APPEALS'}</div>{pendingAppeals.map(a=><button key={a.id} onClick={()=>{setAppealId(a.id);setAppealNote('');setDelta(0)}} className={`w-64 shrink-0 lg:w-full lg:shrink text-start rounded-xl p-3 lg:mb-1 ${currentAppeal.id===a.id?'bg-[#E7EEE9]':'hover:bg-[#f2f0ea]'}`}><div className="text-sm font-black">{a.participantCode}</div><div className="text-[11px] text-[#636864] mt-1">{a.grounds}</div></button>)}</aside><section className="mizan-surface p-5 sm:p-7"><div className="mizan-kicker">{currentAppeal.participantCode}</div><h2 className="text-xl font-black mt-2">{ar?'اعتراض وفق لائحة المسابقة':'Appeal under competition policy'}</h2><p className="text-sm text-[#666e69] mt-4 leading-7">{currentAppeal.reasonText}</p><div className="mt-5 grid sm:grid-cols-[1fr_160px] gap-3"><label className="block"><span className="block text-xs font-bold text-[#5f6661] mb-2">{ar?'قرار وتعليل مختصر':'Decision note'}</span><textarea value={appealNote} onChange={e=>setAppealNote(e.target.value)} className="mizan-textarea min-h-28 text-sm resize-none" placeholder={ar?'اكتب القرار وسببه…':'Write the decision and why…'}/></label>{policy.appeals.allowScoreChange&&<label><span className="block text-xs font-bold text-[#5f6661] mb-2">{ar?'تعديل الدرجة':'Score delta'}</span><input type="number" step="0.25" value={delta} onChange={e=>setDelta(Number(e.target.value))} className="mizan-input text-sm"/><span className="block text-[10px] text-[#696e6b] mt-2">{ar?'لا يطبق إذا كانت النتيجة مختومة':'Cannot mutate a sealed result'}</span></label>}</div><div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={()=>store.resolveAppeal(currentAppeal.id,false,appealNote,0)}>{ar?'رفض':'Reject'}</Button><Button onClick={()=>store.resolveAppeal(currentAppeal.id,true,appealNote,delta)}>{ar?'قبول':'Accept'}</Button></div></section></div>)}
 </div>;
};
const TabButton=({active,onClick,icon:Icon,label,count}:{active:boolean;onClick:()=>void;icon:React.ComponentType<{className?:string}>;label:string;count:number})=><button type="button" role="tab" aria-selected={active} onClick={onClick} className={`mizan-tab ${active?'is-active':''}`}><Icon className="w-4 h-4"/>{label}{count>0&&<span className={`ms-1 rounded-full px-1.5 py-0.5 text-[10px] ${active?'bg-white/15':'bg-[#efede7] text-[#59615c]'}`}>{count}</span>}</button>;
const ClearState=({ar,textAr,textEn}:{ar:boolean;textAr:string;textEn:string})=><div className="mizan-surface p-14 text-center"><BadgeCheck className="w-8 h-8 text-[#2F6555] mx-auto"/><h2 className="font-black mt-3">{ar?textAr:textEn}</h2></div>;
const reasonLabel=(r:string,ar:boolean)=>({judge_variance:ar?'اختلاف المحكمين':'Judge variance',ai_high_confidence_alert:ar?'ملاحظة نزاهة آلية':'AI integrity observation',audio_dropout:ar?'مشكلة صوت':'Audio issue',score_outlier:ar?'تباين درجة':'Score outlier'} as Record<string,string>)[r]||r;
