import React, { useMemo, useState } from 'react';
import { localizedCountry } from '../../lib/ui-language';
import { Award, BadgeCheck, CalendarClock, Check, FileText, MapPin, QrCode, ShieldCheck, Sparkles, ArrowLeftRight} from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { getCompetitionPolicy } from '../../lib/competition-config';
import { surahAyahCount } from '../../lib/mushaf-map';
import { QuranScopePicker, ScopeSummary } from '../scope/QuranScopePicker';
import { describeScope, scopeMetrics, type QuranScope } from '../../lib/quran-scope';
import { selectionIsValid, validateParticipantSelection } from '../../lib/participant-scope';
import { categorySelectionRule } from '../../lib/scope-engine';
import { Badge } from '../design-system/Badge';
import { QueueRibbon } from '../design-system/QueueRibbon';
import { Button } from '../design-system/Button';
import { RegistrationFlow } from '../public/RegistrationFlow';
import { RealQRCode, makeMizanPassPayload } from '../design-system/RealQRCode';
import { TearOffQueueTicket } from '../design-system/TearOffQueueTicket';
import { PracticeStudio } from './PracticeStudio';
import { WarmupSanctuary } from './WarmupSanctuary';
import { deliveryReadingKeyFor, surahNameArabic } from '../judge/OfficialMushafSurface';

// Shared so the visible labels and the spoken ones can never drift apart.
const STEP_LABELS=[{ar:'التسجيل',en:'Register'},{ar:'القبول',en:'Approve'},{ar:'الحضور',en:'Arrive'},{ar:'الاختبار',en:'Recite'},{ar:'الشهادة',en:'Certificate'}];

/*
 * صفحة المتسابق كانت رصًّا عموديًّا: البطاقة، والإحماء، والتدرّب، وتذكرة الدور، والنتيجة،
 * والسجل، والشهادة — كلها مفتوحة معًا في عمود واحد يُمرَّر. وكل قسم منها يخصّ لحظة مختلفة
 * من يومه، فلا يحتاج إليها مجتمعةً في أي لحظة.
 *
 * صارت ثلاثة تبويبات بحسب ما يسأل عنه: أين دوري، وكيف أستعد، وماذا بقي عندي. وبطاقة
 * الهوية وحدها فوق التبويبات لأنها جوابُ سؤالٍ رابع لا يفارقه: من أنا وأين وصلت.
 *
 * والتبويب لا يظهر إن لم يكن خلفه شيء: «استعدادك» يختفي بدخوله اللجنة، و«سجلّك» لا يوجد
 * قبل أول شهادة. تبويبٌ فارغ زحمة مثل القسم الفارغ تمامًا.
 */
const scopeStatusText=(status:string,ar:boolean)=>({draft:['مسوّدة','Draft'],submitted:['بانتظار الاعتماد','Awaiting approval'],under_review:['قيد المراجعة','Under review'],approved:['معتمد','Approved'],rejected:['يحتاج تعديلًا','Needs a change'],locked:['مقفل','Locked'],superseded:['نسخة سابقة','Superseded']} as Record<string,[string,string]>)[status]?.[ar?0:1]||status;

type Tab='journey'|'prepare'|'record';

export const ParticipantDashboard: React.FC = () => {
 const store=useAppStore(); const {language,currentUser,participants,results,certificates,participantPassport,competition,checkInParticipant}=store; const ar=language==='ar';
 // يُحلّ المتسابق قبل الخطّافات: الفئة تُشتق منه، والخروج المبكر بعدها لا يجوز أن يتخطّى خطّافًا.
 const participant=participants.find(p=>String(p.email||'').toLowerCase()===currentUser.email.toLowerCase());
 const category=competition.categories.find(c=>c.id===participant?.categoryId);
 /*
  * نطاق التدرّب = النطاق الذي سيُسأل فيه بعينه.
  *
  * كان يُشتق من عدد أجزاء الفئة بافتراض أن النطاق يبدأ من الجزء الأول — وهو افتراضٌ يخطئ
  * كلما اختار المتسابق نطاقه بنفسه، أو بدأت الفئة من وسط المصحف. صار يُقرأ من نطاقه
  * المعتمد نفسه، فلا يتدرّب على ما لن يُسأل فيه ولا يُحرم مما سيُسأل فيه.
  */
 const scopeResolution=participant?store.participantEffectiveScope(participant.id):null;
 const scopeRecord=participant?store.activeParticipantScope(participant.id):undefined;
 const scopeHistory=participant?store.participantScopeHistory(participant.id):[];
 /*
  * تعديل النطاق بعد التسجيل.
  *
  * دورةُ الحياة كانت مبنيةً كاملةً (نسخٌ، واعتماد، ورفضٌ بسبب) ثم لا بابَ يدخل منها أحد:
  * `saveParticipantScope` لم تكن تُستدعى من أي شاشة، فلا نسخة ثانية تُولد أصلًا. وهذا هو
  * الباب: يفتح ما دام النطاق غير مقفل، ويُغلق بالقفل لا بالاعتماد — فالمعتمد يُراجَع،
  * والمقفول انتهى أمره.
  */
 const scopeRule=categorySelectionRule(category);
 const scopeEditable=!!participant&&scopeRule.enabled&&category?.scopeMode==='participant_selected'&&scopeRecord?.status!=='locked';
 const [editingScope,setEditingScope]=useState(false);
 const [draftScope,setDraftScope]=useState<QuranScope|null>(null);
 const [scopeChangeReason,setScopeChangeReason]=useState('');
 const [scopeNotice,setScopeNotice]=useState('');
 const workingScope=draftScope||scopeRecord?.scope||{version:1 as const,segments:[],assurance:'CANONICAL_TABLE' as const};
 const scopeIssues=useMemo(()=>validateParticipantSelection(scopeRule,workingScope),[scopeRule,workingScope]);
 const scopeValid=selectionIsValid(scopeIssues);
 const submitScopeChange=()=>{
  if(!participant||!draftScope)return;
  if(!scopeChangeReason.trim()){setScopeNotice(ar?'اكتب سبب التغيير — اللجنة تقرأ السبب لا الاختيار وحده.':'Write why you are changing it; the committee reads the reason, not only the choice.');return}
  const outcome=store.saveParticipantScope(participant.id,draftScope,{submit:true,reason:scopeChangeReason.trim()});
  if(!outcome.ok){setScopeNotice(outcome.issues?.find(i=>i.severity==='error')?.ar||(ar?'اختيارك لا يطابق لائحة هذه الفئة.':'Your choice does not match this category rule.'));return}
  setEditingScope(false);setDraftScope(null);setScopeChangeReason('');
  setScopeNotice(ar?'أُرسل نطاقك الجديد إلى اللجنة. نسختك السابقة محفوظة في سجلّك.':'Your new range was sent to the committee. Your previous version is kept in your history.');
 };
 const scopeSurahs=useMemo(()=>(scopeResolution&&!scopeResolution.blocked?scopeMetrics(scopeResolution.scope).surahs:[]),[scopeResolution?.signature]);
 const [tab,setTab]=useState<Tab>('journey');
 const [pSurah,setPSurah]=useState(0); const [pStart,setPStart]=useState(1); const [pCount,setPCount]=useState(4);
 const [showRegistration,setShowRegistration]=useState(false); const [showAppeal,setShowAppeal]=useState(false); const [appealText,setAppealText]=useState(''); const [showCert,setShowCert]=useState(false);
 const policy=getCompetitionPolicy(competition);
 const result=results.find(r=>r.participantId===participant?.id);
 const cert=certificates.find(c=>c.participantId===participant?.id);
 if(showRegistration) return <RegistrationFlow onSuccess={()=>setShowRegistration(false)}/>;
 if(!participant) return <div className="max-w-xl mx-auto px-4 py-16 text-center"><h1 className="text-2xl font-black">{ar?'ابدأ مشاركتك':'Start your participation'}</h1><Button className="mt-5" onClick={()=>setShowRegistration(true)}>{ar?'تسجيل':'Register'}</Button></div>;
 const step=statusStep(participant.status);
 const committee=store.committees.find(c=>c.id===participant.assignedCommitteeId);
 const resultVisible=policy.results.visibility==='immediate'||policy.results.visibility==='private_only'||result?.status==='published'||result?.status==='sealed';
 const passPayload=makeMizanPassPayload(participant.code);
 const queueEstimate=store.getQueueEstimate(participant.id);
 // التدرّب يكون على رواية المتسابق نفسها؛ رواية بلا حزمة تسليم لا تفتح الاستوديو أصلًا.
 const practiceReading=deliveryReadingKeyFor({riwaya:participant.riwaya});
 const passportRows=participantPassport.filter(x=>x.participantId===participant.id);

 const beforeSession=['approved','checked_in','in_queue'].includes(participant.status);
 const canPrepare=beforeSession; const hasRecord=passportRows.length>0||!!cert;
 // تبويبٌ اختاره ثم زال سببه (دخل اللجنة مثلًا) يعود إلى «دورك» بدل أن يترك فراغًا.
 const activeTab:Tab=(tab==='prepare'&&!canPrepare)||(tab==='record'&&!hasRecord)?'journey':tab;

 /* المقطع يُقصر على النطاق ويُقصّ على حدود السورة: لا آية ٩٩ في سورة من ثمانٍ. */
 const surah=pSurah&&scopeSurahs.includes(pSurah)?pSurah:(scopeSurahs.find(s=>s!==1)??scopeSurahs[0]??1);
 const maxAyah=surahAyahCount(surah)||1;
 const startAyah=Math.min(Math.max(1,pStart),maxAyah);
 const count=Math.max(1,Math.min(pCount,20,maxAyah-startAyah+1));

 return <div className="max-w-3xl mx-auto px-4 sm:px-6 py-7 space-y-4">
  <section className="mizan-surface p-6 sm:p-8"><div className="flex items-start justify-between gap-4"><div><div className="mizan-code">{participant.code}<small>{ar?'رقم وصولك':'your arrival code'}</small></div><h1 className="text-2xl sm:text-3xl font-black mt-2">{ar?participant.fullNameArabic:participant.fullName}</h1><p className="text-xs text-[#646965] mt-1">{localizedCountry(participant.country,ar)} · {participant.riwaya}</p></div><Badge>{statusText(participant.status,ar)}</Badge></div><div className="mt-7 flex items-start gap-1.5" role="list" aria-label={ar?'مراحل رحلتك':'Your journey'}>{[1,2,3,4,5].map(n=>{const state=n<step?'done':n===step?'current':'upcoming';return <React.Fragment key={n}><span role="listitem" aria-current={state==='current'?'step':undefined} aria-label={`${STEP_LABELS[n-1][ar?'ar':'en']} — ${ar?(state==='done'?'مكتملة':state==='current'?'أنت هنا':'لاحقًا'):(state==='done'?'done':state==='current'?'you are here':'upcoming')}`} className="flex flex-col items-center gap-2 shrink-0"><span className="mizan-step" data-state={state}>{state==='done'?<Check className="w-4 h-4"/>:n}</span><span className="mizan-step-label" data-state={state==='current'?'current':undefined}>{ar?STEP_LABELS[n-1].ar:STEP_LABELS[n-1].en}</span></span>{n<5&&<span className="mizan-step-rule mt-[17px]" data-done={n<step||undefined} aria-hidden="true"/>}</React.Fragment>})}</div></section>

  {(canPrepare||hasRecord)&&<div className="mizan-tabs" role="tablist" aria-label={ar?'أقسام صفحتك':'Your sections'}>
   <TabButton active={activeTab==='journey'} onClick={()=>setTab('journey')} icon={MapPin} label={ar?'دورك':'Your turn'}/>
   {canPrepare&&<TabButton active={activeTab==='prepare'} onClick={()=>setTab('prepare')} icon={Sparkles} label={ar?'استعدادك':'Prepare'}/>}
   {hasRecord&&<TabButton active={activeTab==='record'} onClick={()=>setTab('record')} icon={Award} label={ar?'سجلّك':'Your record'}/>}
  </div>}

  {activeTab==='journey'&&<>
   {/* نطاق حفظي: المتسابق يرى ما سيُسأل منه بالضبط قبل أن يدخل، لا بعد أن يخرج. */}
   {scopeResolution&&<section className="mizan-surface p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="mizan-kicker">{ar?'نطاق حفظي':'MY MEMORIZATION RANGE'}</div><h2 className="mt-1 text-lg font-black">{scopeResolution.blocked?(ar?'لم يُعتمد بعد':'Not approved yet'):describeScope(scopeResolution.scope,ar)}</h2><p className="mt-1 text-[11px] leading-6 text-[#646965]">{scopeResolution.blocked?(ar?'نطاق حفظك يحتاج مراجعة من إدارة المسابقة قبل أن تبدأ جلستك.':'Your range needs review from the organisers before your session can begin.'):(ar?'لن يُطرح عليك سؤال واحد خارج هذا النطاق.':'Not one question will come from outside this range.')}</p></div>{scopeRecord&&<Badge variant={scopeRecord.status==='approved'||scopeRecord.status==='locked'?'emerald':scopeRecord.status==='rejected'?'rose':'amber'}>{scopeStatusText(scopeRecord.status,ar)}</Badge>}</div>{!scopeResolution.blocked&&<div className="mt-4"><ScopeSummary scope={scopeResolution.scope} arabic={ar} compact/></div>}{scopeRecord?.rejectionReason&&<p role="status" className="mt-3 rounded-xl bg-[#F5EDE2] p-3 text-[11px] font-bold text-[#7a5a2f]">{scopeRecord.rejectionReason}</p>}
   {scopeNotice&&<p role="status" className="mt-3 rounded-xl bg-[#EEF2EF] p-3 text-[11px] font-bold text-[#24463a]">{scopeNotice}</p>}
   {/* الباب إلى دورة الحياة: نسخةٌ جديدة تُرسل إلى اللجنة، والسابقة تبقى. */}
   {scopeEditable&&!editingScope&&<div className="mt-4"><Button size="sm" variant="outline" onClick={()=>{setDraftScope(scopeRecord?.scope||null);setScopeNotice('')}}>{ar?'اطلب تعديل نطاقي':'Request a range change'}</Button></div>}
   {scopeEditable&&draftScope&&<div className="mt-4 rounded-2xl border border-[#e4e2da] bg-[#fbfaf6] p-4">
    <p className="text-[11px] leading-6 text-[#5b6460]">{ar?'اختر نطاقك الجديد. لن يُعتمد حتى تراجعه اللجنة، ونطاقك الحالي يبقى ساريًا حتى ذلك الحين.':'Choose your new range. It is not approved until the committee reviews it; your current range stays in force until then.'}</p>
    <div className="mt-3"><QuranScopePicker value={draftScope} onChange={setDraftScope} arabic={ar} parentScope={scopeRule.parentScope} idPrefix="participant"/></div>
    {!scopeValid&&<p role="status" className="mt-3 rounded-xl bg-[#F5EDE2] p-3 text-[11px] font-bold text-[#7a5a2f]">{scopeIssues.find(i=>i.severity==='error')?.[ar?'ar':'en']}</p>}
    <label className="mt-3 block"><span className="block text-[10px] font-black tracking-[.1em] text-[#696f6b]">{ar?'سبب التغيير':'Why are you changing it?'}</span>
     <input value={scopeChangeReason} onChange={e=>setScopeChangeReason(e.target.value)} placeholder={ar?'أتقنت الجزء الخامس أكثر من الأول':'I know juz 5 better than juz 1'} className="mizan-control mt-1 w-full px-3 py-2 text-[12px]"/></label>
    <div className="mt-3 flex flex-wrap gap-2">
     <Button size="sm" disabled={!scopeValid} onClick={submitScopeChange}>{ar?'أرسل إلى اللجنة':'Send to the committee'}</Button>
     <Button size="sm" variant="ghost" onClick={()=>{setDraftScope(null);setScopeChangeReason('');setScopeNotice('')}}>{ar?'إلغاء':'Cancel'}</Button>
    </div>
   </div>}
   {/* نسخُك السابقة تُعرض لك: نطاقك تاريخٌ تراه، لا حقلٌ يتغيّر من خلفك. */}
   {scopeHistory.length>1&&<details className="mizan-collapse mt-3 rounded-xl border border-[#e9e7e0] bg-[#fbfaf6]"><summary className="cursor-pointer select-none list-none px-3 py-2 text-[10px] font-black text-[#5b6460]">{ar?`سجل نطاقي (${scopeHistory.length} نسخة)`:`My range history (${scopeHistory.length} versions)`}</summary><ol className="space-y-1.5 px-3 pb-3">{scopeHistory.map(entry=><li key={entry.id} className="rounded-lg border border-[#e9e7e0] bg-white px-2.5 py-2"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] font-black text-[#24302b]">{ar?`النسخة ${entry.version}`:`v${entry.version}`} · {describeScope(entry.scope,ar)}</span><Badge variant={entry.status==='approved'||entry.status==='locked'?'emerald':entry.status==='rejected'?'rose':entry.status==='superseded'?'neutral':'amber'}>{scopeStatusText(entry.status,ar)}</Badge></div>{entry.changeReason&&<p className="mt-1 text-[10px] leading-5 text-[#5b6460]">{ar?'سبب التغيير: ':'Change reason: '}{entry.changeReason}</p>}</li>)}</ol></details>}</section>}
  {participant.status==='approved'&&<section className="mizan-surface p-6 sm:p-8 text-center"><div className="w-12 h-12 rounded-2xl bg-[#E7EEE9] text-[#214C40] grid place-items-center mx-auto"><QrCode className="w-6 h-6"/></div><h2 className="text-xl font-black mt-4">{ar?'بطاقتك جاهزة':'Your pass is ready'}</h2><div className="mt-5 w-44 h-44 border-8 border-white outline outline-1 outline-[#deddd6] bg-white rounded-2xl mx-auto grid place-items-center overflow-hidden"><RealQRCode value={passPayload} size={160} label={ar?'رمز دخول ميزان':'MIZAN entry pass'}/></div><div className="mt-3 text-[10px] font-mono text-[#656a66]">{participant.code}</div><div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-xs text-[#626a65]"><span className="flex items-center gap-1.5"><CalendarClock className="w-4 h-4"/>{participant.arrivalSlot||(ar?'يُحدد بعد الجدولة':'Set after scheduling')}</span><span className="flex items-center gap-1.5"><MapPin className="w-4 h-4"/>{competition.venueName}</span></div>{policy.operations.selfCheckIn&&<Button className="mt-6" onClick={()=>checkInParticipant(participant.id,'mobile_self')}>{ar?'أنا وصلت':'I’m here'}</Button>}</section>}

  {/*
    نقلٌ جرى له وهو ينتظر. لا يُفاجَأ بلجنةٍ تبدّلت ولا برقمٍ تأخّر: يُقال له من أين وإلى
    أين، وكم انتظر، وأين كان سيقع لولا مراعاة انتظاره وأين وقع بها.
  */}
  {participant.lastQueueTransfer&&participant.status==='in_queue'&&<section className="rounded-2xl border border-[#d8c7a7] bg-[#fffaf0] p-5">
   <div className="flex items-start gap-3">
    <span className="w-9 h-9 rounded-xl bg-white grid place-items-center shrink-0"><ArrowLeftRight className="w-4 h-4 text-[#7a5c2e]"/></span>
    <div className="min-w-0">
     <div className="text-xs font-black text-[#604724]">{ar?`تغيّرت لجنتك: من ${participant.lastQueueTransfer.fromCommitteeCode} إلى ${participant.lastQueueTransfer.toCommitteeCode}`:`Your panel changed: ${participant.lastQueueTransfer.fromCommitteeCode} → ${participant.lastQueueTransfer.toCommitteeCode}`}</div>
     {participant.lastQueueTransfer.equityApplied
      ?<p className="text-[11px] text-[#6b5b45] mt-1.5 leading-6">{ar
        ?`انتظارك السابق محسوب لك: انتظرت ${participant.lastQueueTransfer.waitedMinutes} دقيقة، فلم تبدأ من آخر الطابور. كان موضعك سيكون رقم ${participant.lastQueueTransfer.positionIfAppended}، وصار رقم ${participant.lastQueueTransfer.fairPosition}.`
        :`Your earlier wait counts: you had waited ${participant.lastQueueTransfer.waitedMinutes} min, so you did not restart at the back. You would have been ${participant.lastQueueTransfer.positionIfAppended}; you are ${participant.lastQueueTransfer.fairPosition}.`}</p>
      :<p className="text-[11px] text-[#6b5b45] mt-1.5 leading-6">{ar?`انتقل دورك معك. انتظرت ${participant.lastQueueTransfer.waitedMinutes} دقيقة قبل النقل.`:`Your turn moved with you. You had waited ${participant.lastQueueTransfer.waitedMinutes} min before the move.`}</p>}
     <div className="text-[10px] text-[#8a7a62] mt-2">{ar?'السبب: ':'Reason: '}{participant.lastQueueTransfer.reason}</div>
    </div>
   </div>
  </section>}
  {participant.status==='in_queue'&&<section className="mizan-surface p-7 text-center"><TearOffQueueTicket number={participant.originalQueueNumber||participant.queueNumber||1} committee={committee?.code} ar={ar}/><div className="mizan-kicker mt-2">{ar?'حالة الدور':'QUEUE STATUS'}</div><div className="text-4xl font-black mt-2">{queueEstimate?.ahead??0}</div><div className="text-sm font-bold mt-2">{(queueEstimate?.ahead||0)===0?(ar?'أنت التالي':'You’re next'):(ar?'متسابق أمامك':'ahead')}</div>{queueEstimate&&<QueueRibbon total={queueEstimate.basis.queueSize} youAt={queueEstimate.ahead+1} ar={ar} className="justify-center mt-4 text-[#214C40]"/>}{queueEstimate&&<div className="mt-5 grid grid-cols-2 gap-2"><div className="rounded-xl bg-[#f1efe9] p-3"><div className="text-lg font-black">~{queueEstimate.estimatedWaitMinutes}</div><div className="text-[10px] text-[#646965]">{ar?'دقيقة تقديريًا':'estimated min'}</div></div><div className="rounded-xl bg-[#f1efe9] p-3"><div className="text-lg font-black">{new Date(queueEstimate.expectedTurnAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div><div className="text-[10px] text-[#646965]">{ar?'وقت متوقع':'estimated turn'}</div></div></div>}<div className="mt-2 text-[10px] text-[#696f6b]">{ar?'يتغير التقدير مع حركة اللجان.':'Estimate updates with live flow.'}</div><div className="mt-4 text-xs font-bold text-[#626a65]">{committee?.code||'—'} · {ar?committee?.nameArabic:committee?.name}</div></section>}

  {participant.status==='in_session'&&<section className="mizan-surface p-7 text-center bg-[#fffefb]"><span className="inline-flex w-3 h-3 rounded-full bg-[#2F6555] animate-pulse"/><h2 className="text-2xl font-black mt-4">{ar?'اختبارك جارٍ الآن':'Your recitation is in progress'}</h2><p className="text-xs text-[#646965] mt-2">{ar?'المحكم يستمع. لا تحتاج إلى أي إجراء.':'The judges are listening. No action is required from you.'}</p></section>}

  {(participant.status==='tested'||participant.status==='certified'||participant.status==='appealed')&&<section className="mizan-surface p-6 sm:p-8"><div className="flex items-center justify-between gap-4"><div><div className="mizan-kicker">{ar?'بعد الاختبار':'AFTER RECITATION'}</div><h2 className="text-xl font-black mt-1">{resultVisible&&result?(ar?'نتيجتك':'Your result'):(ar?'تم حفظ تقييمك':'Assessment secured')}</h2></div><ShieldCheck className="w-6 h-6 text-[#2F6555]"/></div>{resultVisible&&result?<div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-[#f1efe9] p-5 text-center"><div className="text-3xl font-black">{result.finalScore.toFixed(2)}</div><div className="text-[10px] text-[#646965] mt-1">{ar?'الدرجة':'Score'}</div></div><div className="rounded-2xl bg-[#f1efe9] p-5 text-center"><div className="text-3xl font-black">#{result.rank||'—'}</div><div className="text-[10px] text-[#646965] mt-1">{ar?'الترتيب':'Rank'}</div></div></div>:<p className="text-sm text-[#646965] mt-4">{ar?'سياسة هذه المسابقة تؤجل إظهار النتائج حتى الموعد المعتمد.':'This competition delays result visibility until the approved release point.'}</p>}<div className="mt-5 flex flex-wrap gap-4 text-xs font-bold text-[#214C40]">{policy.appeals.enabled&&resultVisible&&<button onClick={()=>setShowAppeal(true)} className="hover:underline">{ar?'تقديم اعتراض وفق اللائحة':'Appeal under competition policy'}</button>}<button onClick={()=>{const receipt=store.getFairnessReceipt(participant.id);if(!receipt)return;const blob=new Blob([JSON.stringify(receipt,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`mizan-fairness-${participant.code}.json`;a.click();URL.revokeObjectURL(a.href)}} className="hover:underline">{ar?'إيصال النزاهة':'Fairness receipt'}</button></div></section>}
  </>}

  {activeTab==='prepare'&&<>
   {/* الإحماء قبل الدخول فقط: بمجرد أن يصير المتسابق داخل اللجنة يختفي التبويب كله. */}
   <WarmupSanctuary ar={ar}/>
   {/* بلا نطاق معتمد لا يُفتح الاستوديو: التدرّب على ما لن يُسأل فيه أسوأ من ألا يتدرّب. */}
   {practiceReading&&scopeSurahs.length?<section className="space-y-3">
    <div className="flex flex-wrap items-end justify-between gap-3">
     <div><div className="mizan-kicker">{ar?'قبل دورك':'BEFORE YOUR TURN'}</div>
      <h2 className="text-lg font-black mt-1">{ar?'تدرّب على المصحف نفسه':'Practise on the same Mushaf'}</h2>
      <p className="text-[10px] text-[#656b66] mt-1">{scopeResolution&&!scopeResolution.blocked?(ar?`داخل نطاقك المعتمد: ${describeScope(scopeResolution.scope,true)}`:`Within your approved range: ${describeScope(scopeResolution.scope,false)}`):(ar?'نطاقك المعتمد لم يُحدَّد بعد.':'Your approved range is not set yet.')}</p></div>
     <div className="rounded-2xl border border-[#e2e0d8] bg-[#fbfaf7] p-3"><div className="mizan-field-label mb-2">{ar?'مقطع التدريب':'Practice passage'}</div><div className="grid grid-cols-3 gap-2">
      <label className="block text-[9px] font-black text-[#59615c]">{ar?'السورة':'Surah'}
       <select value={surah} onChange={e=>{setPSurah(Number(e.target.value));setPStart(1)}} className="mizan-input mt-1 text-sm block">
        {scopeSurahs.map(s=><option key={s} value={s}>{ar?`${s} · ${surahNameArabic(s)||s}`:String(s)}</option>)}
       </select></label>
      <label className="block text-[9px] font-black text-[#59615c]">{ar?'من آية':'From ayah'}
       <input type="number" min={1} max={maxAyah} value={startAyah} onChange={e=>setPStart(Math.max(1,Math.min(maxAyah,Number(e.target.value)||1)))} className="mizan-input mt-1 text-sm block"/></label>
      <label className="block text-[9px] font-black text-[#59615c]">{ar?'عدد الآيات':'Ayat'}
       <input type="number" min={1} max={Math.min(20,maxAyah-startAyah+1)} value={count} onChange={e=>setPCount(Math.max(1,Math.min(20,Number(e.target.value)||1)))} className="mizan-input mt-1 text-sm block"/></label>
      </div></div>
    </div>
    <PracticeStudio reading={practiceReading} surah={surah} startAyah={startAyah} endAyah={startAyah+count-1} ar={ar}/>
   </section>:<p className="mizan-surface p-6 text-center text-xs text-[#656b66]">{!practiceReading
     ?(ar?'لا تتوفّر حزمة تسليم معتمدة لروايتك بعد، فلا يُفتح الاستوديو على نصّ غير معتمد.':'No certified delivery package for your reading yet — the studio will not open on unofficial text.')
     :(ar?'نطاق حفظك لم يُعتمد بعد، فلا يُفتح الاستوديو على مقطع قد لا يُسأل فيه. راجع إدارة المسابقة.':'Your range is not approved yet, so the studio will not open on a passage you may never be asked. Contact the organisers.')}</p>}
  </>}

  {activeTab==='record'&&<>
   {passportRows.length>0&&<section className="mizan-surface p-5"><div className="mizan-kicker">{ar?'سجل مشاركات ميزان':'MIZAN PASSPORT'}</div><div className="mt-3 space-y-2">{passportRows.slice(0,3).map(x=><div key={x.id} className="flex items-center gap-3 rounded-xl bg-[#f3f1eb] p-3"><BadgeCheck className="w-4 h-4 text-[#2F6555]"/><div className="flex-1 min-w-0"><div className="text-xs font-bold truncate">{x.competitionName}</div><div className="text-[10px] text-[#656b66] mt-1">{x.year} · {x.categoryName}</div></div><Badge variant={x.verified?'emerald':'neutral'}>{x.verified?(ar?'موثق':'Verified'):(ar?'غير موثق':'Unverified')}</Badge></div>)}</div></section>}
   {cert&&<section className="mizan-surface p-6 flex items-center gap-4"><span className="w-12 h-12 rounded-2xl bg-[#F2EADC] text-[#89673a] grid place-items-center"><Award className="w-6 h-6"/></span><div className="flex-1"><div className="font-black">{ar?'الشهادة جاهزة':'Certificate ready'}</div><div className="text-[11px] text-[#646965] mt-1">{cert.certificateNumber}</div></div><Button variant="outline" onClick={()=>setShowCert(true)} icon={<FileText className="w-4 h-4"/>}>{ar?'فتح':'Open'}</Button></section>}
  </>}

  {showAppeal&&<div role="dialog" aria-modal="true" aria-label={ar?'اعتراض':'Appeal'} className="fixed inset-0 z-50 bg-black/25 backdrop-blur-sm grid place-items-center p-4"><div className="mizan-surface p-6 w-full max-w-lg"><div className="flex items-center justify-between gap-4"><div><div className="mizan-kicker">{ar?'اعتراض':'APPEAL'}</div><h3 className="text-xl font-black mt-1">{ar?'طلب مراجعة علمية':'Scientific review request'}</h3></div><button onClick={()=>setShowAppeal(false)} className="text-xs text-[#777]">{ar?'إغلاق':'Close'}</button></div><textarea value={appealText} onChange={e=>setAppealText(e.target.value)} className="mizan-textarea mt-5 min-h-32 text-sm resize-none" placeholder={ar?'اذكر الموضع أو سبب طلب المراجعة باختصار':'Briefly state the segment or reason for review'}/><div className="mt-4 flex justify-end"><Button disabled={!appealText.trim()} onClick={()=>{store.submitAppeal(participant.id,'scoring_miscalculation',appealText);setShowAppeal(false);setAppealText('')}}>{ar?'إرسال':'Submit'}</Button></div></div></div>}
  {showCert&&cert&&<div role="dialog" aria-modal="true" aria-label={ar?'الشهادة':'Certificate'} className="fixed inset-0 z-50 bg-[#16241f]/85 backdrop-blur-sm grid place-items-center p-4"><div className="bg-[#fffefb] text-[#171b18] rounded-[28px] border border-[#dfded7] p-8 w-full max-w-2xl text-center shadow-lg"><div className="mizan-kicker">{ar?'شهادة موثقة من ميزان':'MIZAN VERIFIED CERTIFICATE'}</div><div className="w-12 h-12 rounded-2xl bg-[#F2EADC] text-[#89673a] grid place-items-center mx-auto mt-5"><Award className="w-6 h-6"/></div><h2 className="text-2xl font-black mt-4">{ar?cert.participantNameArabic:cert.participantName}</h2><p className="text-sm text-[#616762] mt-2">{ar?cert.competitionNameArabic:cert.competitionName}</p><div className="mt-6 rounded-xl bg-[#f1efe9] p-4 text-xs font-mono">{cert.certificateNumber}</div><div className="mt-6 flex justify-center gap-2"><Button variant="outline" onClick={()=>setShowCert(false)}>{ar?'إغلاق':'Close'}</Button><Button onClick={()=>window.print()}>{ar?'طباعة':'Print'}</Button></div></div></div>}

 </div>
}
const TabButton=({active,onClick,icon:Icon,label}:{active:boolean;onClick:()=>void;icon:React.ComponentType<{className?:string}>;label:string})=><button type="button" role="tab" aria-selected={active} onClick={onClick} className={`mizan-tab ${active?'is-active':''}`}><Icon className="w-4 h-4"/>{label}</button>;
const statusStep=(s:string)=>s==='draft'||s==='submitted'||s==='under_review'?1:s==='approved'?2:s==='checked_in'||s==='in_queue'?3:s==='in_session'?4:5;
const statusText=(s:string,ar:boolean)=>({submitted:ar?'قيد الاستلام':'Submitted',under_review:ar?'قيد المراجعة':'Under review',approved:ar?'مقبول':'Approved',checked_in:ar?'تم الحضور':'Checked in',in_queue:ar?'بالانتظار':'Waiting',in_session:ar?'داخل اللجنة':'In session',tested:ar?'اكتمل الاختبار':'Completed',certified:ar?'معتمد':'Certified',appealed:ar?'اعتراض':'Appeal'} as Record<string,string>)[s]||s;
