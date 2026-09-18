import React, { useEffect, useMemo, useRef, useState } from 'react';
import { bilingualName } from '../../lib/ui-language';
import { maskParticipantForJudge, resolveBlindness } from '../../lib/blind-chamber';
import { Ratio } from '../design-system/Ratio';
import { AlertTriangle, Check, CircleDot, CornerDownLeft, RotateCcw, SkipForward, Sparkles, Volume2, Mic, MicOff, LockKeyhole, UserCheck, UsersRound, ShieldCheck, Square, ChevronDown } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { errorMessageArabic } from '../../lib/error-catalog';
import { getCompetitionPolicy, getEnabledJudgeActions } from '../../lib/competition-config';
import { openingAudioWindow, passageTransitionPlan, selectApprovedOpeningAudio } from '../../lib/judging-integrity';
import { certifiedCapabilityFor, resolveReading } from '../../lib/scientific-core';
import { approveEmergencyQuestionReplacement, approveSecureQuestion, confirmSecureParticipantPresence, getSecureRuntimeStatus, revealSecureQuestion, type SecureQuestionPlaintext, type SecureQuestionRuntimeState } from '../../lib/server-question-client';
import { Button } from '../design-system/Button';
import { SurfaceBoundary } from '../design-system/SurfaceBoundary';
import { OfficialMushafSurface, deliveryReadingKeyFor, surahNumberFromName } from './OfficialMushafSurface';
import { fetchDeliveryPassage, fetchOfficialAyahAudio } from '../../lib/kfgqpc-library';
import { Badge } from '../design-system/Badge';
import { QuranIntelligenceDock } from './QuranIntelligenceDock';
import { RecitationReplay, type ReplayMark } from './RecitationReplay';
import { fetchQuranIntelligenceCapabilities, fetchQuranPassageIntelligence, fetchQuranReadingGuard, fetchQuranSessionEvidence, postQuranHumanMarker, quranReadingIdForPackage, resetQuranAlignment, submitQuranAlignmentChunk, type QuranAlignmentResult, type QuranPassageIntelligence, type QuranReadingGuard, type QuranReadingId, type QuranSessionEvidence } from '../../lib/quran-intelligence';

// Arabic counts do not pluralise the way English does: 1 takes the singular, 2 takes the
// dual, 3-10 take the plural, and 11+ return to the singular. "4 مرة" is simply wrong.
/*
 * سبب رفض فتح السؤال بلغة المحكّم، لا رمزًا خامًا في وجهه.
 *
 * وكلُّ سطر هنا يقول ما يُفعل، لا ما وقع فحسب: من قرأ «لست في هذه اللجنة» عرف أن يراجع
 * توزيع اللجان، ومن قرأ رمزًا إنجليزيًّا لم يعرف شيئًا.
 */
const revealRefusalText=(reason:string|undefined,ar:boolean):string=>{
 if(!ar)return `Could not open the question (${reason||'unknown'}).`;
 switch(reason){
  case 'ASSIGNED_JUDGE_REQUIRED':
   return 'حسابك ليس ضمن محكّمي هذه اللجنة، فلا يفتح السؤال. أضِف نفسك إلى اللجنة من «التحكيم ← أعضاء اللجنة» ثم أعد المحاولة.';
  case 'PARTICIPANT_NOT_PRESENT':
   return 'أكّد حضور المتسابق أمام اللجنة أولًا، ثم افتح السؤال.';
  case 'NO_ACTIVE_SESSION':
   return 'لا جلسة مفتوحة الآن، أو أُقفل تقييمها.';
  case 'NO_GATE':
   return 'لم تُجهَّز بوابة هذا السؤال بعد. أعد استقبال المتسابق، وإن تكرّر فراجع «ما يحتاج تدخّلك».';
  case 'UNAUTHORIZED':
   return 'دور هذا الحساب لا يؤكّد حضور المتسابق. يؤكّده المحكّم أو رئيس اللجنة أو غرفة العمليات أو إدارة المسابقة.';
  case 'NO_ELIGIBLE_JUDGES':
   return 'لا محكّم مُسنَد إلى هذه اللجنة، فلا أحد يفتح السؤال. أسنِد محكّمًا إليها أولًا.';
  default:
   return `تعذّر فتح السؤال${reason?` (${reason})`:''}. أعد المحاولة، وإن تكرّر فراجع «ما يحتاج تدخّلك».`;
 }
};
/* حالة المنتظر بلغة المحكّم: ما الذي ينتظره هذا الاسم الآن. */
const PARTICIPANT_WAIT_LABEL:Record<string,string>={
 in_queue:'في الطابور', checked_in:'سجّل حضوره', approved:'لم يسجّل حضوره',
 in_session:'جلسة معلّقة',
};
const marksAr=(n:number)=> n===1?'مرة واحدة' : n===2?'مرتين' : n<=10?`${n} مرات` : `${n} مرة`;
// نفس قاعدة العدد العربي، بلفظ «ملاحظة»: مفرد، مثنّى، جمع قلة، ثم تمييز مفرد.
const notesAr=(n:number)=> n===0?'لا ملاحظات' : n===1?'ملاحظة واحدة' : n===2?'ملاحظتان' : n<=10?`${n} ملاحظات` : `${n} ملاحظة`;
// Criterion names were only ever available in English, inside an Arabic-first surface.
import type { RegistrationStatus } from '../../types';
import { calculateCategoryPassageRange } from '../../lib/scope-engine';

const CRITERION_AR:Record<string,string>={memorization:'حفظ',tajweed:'تجويد',waqf_ibtida:'وقف وابتداء',performance:'أداء',custom:'خاص'};
const iconFor=(kind?:string)=> kind==='error'?AlertTriangle:kind==='open'?CornerDownLeft:kind==='repeat'?RotateCcw:kind==='tajweed'?Sparkles:kind==='stop'?CircleDot:AlertTriangle;

const passageSizeLabel = (category: any, ar: boolean) => {
  const range = calculateCategoryPassageRange(category);
  if (range.minAyahCount && range.maxAyahCount) {
    if (range.minAyahCount === range.maxAyahCount) {
      const n = range.minAyahCount;
      return ar ? `${n} ${n === 1 ? 'آية' : n <= 10 ? 'آيات' : 'آية'}` : `${n} ayah${n === 1 ? '' : 's'}`;
    }
    return ar ? `${range.minAyahCount}–${range.maxAyahCount} آيات` : `${range.minAyahCount}–${range.maxAyahCount} ayat`;
  }
  const target = range.targetAyahCount || 0;
  if (target > 0) {
    if (ar) {
      return `${target} ${target === 1 ? 'آية' : target <= 10 ? 'آيات' : 'آية'}`;
    }
    return `${target} ayah${target === 1 ? '' : 's'}`;
  }
  return ar ? 'حسب إعداد الفئة' : 'Category default';
};
const judgeSpecialties=(judge?:{specialty?:string;specialties?:string[]}|null)=>[...new Set((judge?.specialties?.length?judge.specialties:[judge?.specialty||'all']).filter(Boolean))];
const judgeCanScore=(judge:{specialty?:string;specialties?:string[]}|undefined,assigned:string|undefined,mode:string)=>mode==='all_judges_all_criteria'||!judge||judgeSpecialties(judge).includes('all')||!assigned||assigned==='all'||judgeSpecialties(judge).includes(assigned);

export const JudgeOS: React.FC = () => {
 const store=useAppStore();
 const {language,competition,activeSession,recordJudgeEvent,undoLastJudgeEvent,lockAndSubmitAssessment,nextQuestion,participants,startSessionForParticipant,sessionStartFailureCode,registerAudioRecording}=store;
 const ar=language==='ar'; const policy=getCompetitionPolicy(competition); const actions=getEnabledJudgeActions(competition);
 /*
  * المؤقّت يُقرأ من ساعة الحائط كل ثانية، لا من رقمٍ في الحالة العامة.
  *
  * زيادةُ رقمٍ في المخزن كانت ستُعيد رسم التطبيق كلّه كل ثانية بلا داعٍ؛ والقراءة هنا
  * محليّة، وتصحّ بعد نوم الجهاز أو تبديل التبويب لأن الفارق بين لحظتين لا يتوقف.
  */
 const [elapsed,setElapsed]=useState(()=>store.sessionElapsedSeconds());
 useEffect(()=>{setElapsed(store.sessionElapsedSeconds());const t=window.setInterval(()=>setElapsed(store.sessionElapsedSeconds()),1000);return()=>window.clearInterval(t)},[store,activeSession.sessionId,activeSession.startedAt,activeSession.carriedSeconds]);
 const participant=activeSession.participant; const participantCategory=competition.categories.find(c=>c.id===participant?.categoryId); const requestedPassageLabel=passageSizeLabel(participantCategory,ar); const secureMode=activeSession.secureQuestionMode==='SERVER'; const clientQuestion=activeSession.questionSelection?.questions[activeSession.currentQuestionIndex];
 const gate=store.questionRevealGates.find(g=>g.sessionId===activeSession.sessionId&&g.questionIndex===activeSession.currentQuestionIndex);
 const [secureRuntime,setSecureRuntime]=useState<SecureQuestionRuntimeState|null>(null); const [secureQuestion,setSecureQuestion]=useState<SecureQuestionPlaintext|null>(null); const [secureError,setSecureError]=useState(''); const [myRevealApproved,setMyRevealApproved]=useState(false); const [replacementBusy,setReplacementBusy]=useState(false);
 const q=secureMode?secureQuestion:clientQuestion; const questionRevealed=secureMode?!!secureQuestion:gate?.status==='REVEALED';
 const secureQuestionState=secureRuntime?.escrow.questions.find(x=>x.index===activeSession.currentQuestionIndex); const totalQuestions=secureMode?(secureRuntime?.questionCount||activeSession.secureQuestionCount||0):(activeSession.questionSelection?.questions.length||0);
 const ruleSet=useMemo(()=>competition.ruleSets?.find(r=>r.id===competition.categories.find(c=>c.id===participant?.categoryId)?.ruleSetId)||competition.ruleSet,[competition,participant?.categoryId]);
 const judge=store.judges.find(j=>j.userId===store.currentUser.id || j.id===store.currentUser.id);
 // Specialties are panel-scoped: use this session's committee scope, falling back to the profile.
 const sessionCommittee=activeSession.committee;
 const effectiveJudge=useMemo(()=>{if(!judge)return judge;const key=sessionCommittee?.judgeIds.includes(judge.id)?judge.id:(sessionCommittee?.judgeIds.includes(judge.userId)?judge.userId:undefined);const scoped=key?sessionCommittee?.judgeSpecialties?.[key]:undefined;return (scoped&&scoped.length)?{...judge,specialties:scoped,specialty:scoped[0]}:judge;},[judge,sessionCommittee]);
 const visibleCriteria=ruleSet.criteria.filter(c=> judgeCanScore(effectiveJudge,c.assignedJudgeType,policy.judging.mode) || (policy.judging.mode==='hybrid' && c.assignedJudgeType==='all'));
 const [directScores,setDirectScores]=useState<Record<string,number>>({});
 const [audioState,setAudioState]=useState<'not_ready'|'requesting'|'ready'|'failed'>(policy.judging.requireAudioRecording?'not_ready':'ready');
 /* مؤشر الميكروفون يخصّ تسجيل الجلسة، لا تلاوة المصدر المعتمد. إذا كانت اللائحة
    تشترط التسجيل فهو بوابة تشغيل حقيقية ولا توجد طريقة عرض تتجاوزها. */
 const micGateApplies=policy.judging.requireAudioRecording;
 /* لا يكفي أن يُمنح الميكروفون: لا بد أن نسمع صوتًا فعلًا قبل الدخول على الأسئلة،
    وإلا دخل المحكم بميكروفون صامت واكتُشف العطل بعد ضياع التلاوة. */
 const [micLevel,setMicLevel]=useState(0);
 const [micHeard,setMicHeard]=useState(false);
 /* بعض المتصفحات لا تملك واجهة تحليل صوت. حينها يمرّ المحكم على حالة التسجيل وحدها — وهذا
    مقصود، فحبسه عن التحكيم أسوأ من فقد مؤشّرٍ مساعد — لكن المرور يجب أن يُقال لا أن يُسكت عنه. */
 const [micMeterUnavailable,setMicMeterUnavailable]=useState(false);
 /*
  * مقياس الصوت في WebKit — ثلاثة أشياء تُسكته، وكلها معروفة.
  *
  *   ١) **سياقٌ يُنشأ بعد `await`.** إنشاء `AudioContext` بعد انتظار `getUserMedia` يقع
  *      خارج إيماءة المستخدم، فيبقى موقوفًا ولا ينفع استئنافه بعدها. فيُنشأ الآن قبل
  *      طلب الإذن، داخل الضغطة نفسها.
  *   ٢) **مصدرُ تيّارٍ بلا عنصر وسائط.** في سفاري لا يُخرج `MediaStreamAudioSourceNode`
  *      شيئًا ما لم يكن التيّار مُسندًا أيضًا إلى عنصر صوتٍ حيّ. فيُسند إلى عنصرٍ مكتوم
  *      لا يُسمع منه شيء، ووجودُه وحده يفتح المسار.
  *   ٣) **متصفّحٌ لا يقيس أصلًا.** فإن بقي القياس صفرًا مطلقًا — لا ضجيجَ أرضية ولا شيء —
  *      طوال ثوانٍ والتسجيل يعمل، فالمقياس هو المعطّل لا الميكروفون. حينها يُعلن عن نفسه
  *      عاطلًا بدل أن يتّهم الميكروفون بالصمت.
  */
 const meterRef=useRef<{ctx:AudioContext;raf:number;el:HTMLAudioElement|null}|null>(null);
 const meterProbeRef=useRef<{startedAt:number;sawAny:boolean}|null>(null);
 const stopMeter=()=>{const m=meterRef.current;if(!m)return;cancelAnimationFrame(m.raf);if(m.el){m.el.pause();m.el.srcObject=null}void m.ctx.close().catch(()=>{});meterRef.current=null;meterProbeRef.current=null;setMicLevel(0)};
 /** يُنشأ السياق داخل الضغطة نفسها، قبل انتظار الإذن — وإلا وُلد موقوفًا في سفاري. */
 const pendingCtxRef=useRef<AudioContext|null>(null);
 const primeAudioContext=()=>{
  try{
   const Ctor=window.AudioContext||(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
   if(!Ctor)return null;
   if(!pendingCtxRef.current||pendingCtxRef.current.state==='closed')pendingCtxRef.current=new Ctor();
   void pendingCtxRef.current.resume?.().catch(()=>{});
   return pendingCtxRef.current;
  }catch{return null}
 };
 const startMeter=(stream:MediaStream)=>{
  try{
   const ctx=pendingCtxRef.current||primeAudioContext();
   if(!ctx){setMicMeterUnavailable(true);setMicHeard(true);return}
   stopMeter();
   pendingCtxRef.current=ctx;
   void ctx.resume?.().catch(()=>{});
   /* عنصرٌ مكتوم يحمل التيّار: حيلة سفاري المعروفة، ولا يُسمع منه شيء ولا يظهر. */
   let el:HTMLAudioElement|null=null;
   try{el=new Audio();el.muted=true;el.srcObject=stream;el.play().catch(()=>{})}catch{el=null}
   const analyser=ctx.createAnalyser();analyser.fftSize=1024;
   ctx.createMediaStreamSource(stream).connect(analyser);
   const buf=new Uint8Array(analyser.fftSize);
   meterProbeRef.current={startedAt:Date.now(),sawAny:false};
   const tick=()=>{
    analyser.getByteTimeDomainData(buf);
    let peak=0;
    for(let i=0;i<buf.length;i+=1){const d=Math.abs(buf[i]-128)/128;if(d>peak)peak=d}
    setMicLevel(peak);
    if(peak>0.06)setMicHeard(true);
    /*
     * صفرٌ مطلق ليس هدوءًا: أيُّ ميكروفونٍ حيّ يُخرج ضجيج أرضية. فبقاء القياس صفرًا
     * تمامًا ثماني ثوانٍ يعني أن هذا المتصفّح لا يمرّر القياس — فيُعلن المقياس عاطلًا،
     * ولا يُقال للمحكّم إن ميكروفونه صامت وهو يعمل.
     */
    const probe=meterProbeRef.current;
    if(probe){
     if(peak>0)probe.sawAny=true;
     else if(!probe.sawAny&&Date.now()-probe.startedAt>8000){meterProbeRef.current=null;setMicMeterUnavailable(true)}
    }
    const raf=requestAnimationFrame(tick);
    meterRef.current={ctx,raf,el};
   };
   tick();
  }catch{
   /* المتصفح بلا واجهة تحليل صوت: تبقى البوابة على حالة التسجيل وحدها، ويُعلَن ذلك للمحكم */
   setMicMeterUnavailable(true);setMicHeard(true);
  }
 };
 useEffect(()=>()=>stopMeter(),[]);
 /*
  * شرطان لا شرط واحد، وكلٌّ في موضعه.
  *
  * `micRecording` هو ما تشترطه اللائحة فعلًا: أن تكون الجلسة تُسجَّل. وهو يتحقّق بمجرّد
  * أن يعمل المسجّل.
  *
  * و`micHeard` أقوى منه: أن يصل صوتٌ إلى الشريط. وهو نافعٌ لأنه يكشف ميكروفونًا مكتومًا
  * أو مصروفًا إلى مدخلٍ آخر — لكنه **لا يصلح بوابةً قاطعة**: قاعةٌ هادئة، أو متصفّحٌ لا
  * يمرّر مستوى الصوت، أو سياق صوتٍ لم يُستأنف، تترك المحكّم أمام جدار لا يتجاوزه أبدًا
  * — والجلسة تُسجَّل طوال الوقت. فوقوف المسابقة على شريطٍ لم يتحرّك أسوأ مما جاء الشريط
  * ليمنعه.
  *
  * فالبوابة على التسجيل، والتحذير يبقى ظاهرًا ما لم يصل صوت.
  */
 const micRecording=!micGateApplies||audioState==='ready';
 /*
  * `micVerified` حُذف مع الشريط العلوي الذي كان يحمله.
  *
  * كان يجمع شرطين — أن يعمل المسجّل وأن يصل صوتٌ إلى الشريط — لتلوين زرٍّ في الشريط.
  * والشرط الثاني تحذيرٌ لا بوابة (انظر أعلاه)، فبقاء حسابٍ يجمعهما بعد زوال مستعمله
  * الوحيد دعوةٌ لأن يُستعمل يومًا بوصفه بوابة. و`micHeard` باقٍ حيث يُقرأ: في التحذير.
  */
 const [openingAudioState,setOpeningAudioState]=useState<'idle'|'playing'|'unavailable'|'failed'>('idle');
 const [quranIntelligence,setQuranIntelligence]=useState<QuranPassageIntelligence|null>(null); const [alignmentResult,setAlignmentResult]=useState<QuranAlignmentResult|null>(null); const [alignmentConfigured,setAlignmentConfigured]=useState(false); const [shadowMicActive,setShadowMicActive]=useState(false); const [tajweedEducation,setTajweedEducation]=useState(false); const [sessionEvidence,setSessionEvidence]=useState<QuranSessionEvidence|null>(null); const [readingGuard,setReadingGuard]=useState<QuranReadingGuard|null>(null);
 // Confirming a mark: a tap in a noisy hall needs visible acknowledgement, and a
 // screen-reader user needs the same fact spoken. Both are driven from here.
 const [markedAction,setMarkedAction]=useState<string|null>(null);
 const [markAnnounce,setMarkAnnounce]=useState('');
 // بدء جلسة المتسابق التالي قد يفشل (لا لجنة متوافقة، أو تعذّر سحب الأسئلة). كان يفشل بصمت
 // فيبدو الزر معطلًا؛ الآن يُقال السبب بدل أن يبتلع الزرّ الرفض.
 const [startError,setStartError]=useState('');
 /*
  * السبب الواحد لا احتمالان.
  *
  * كانت الرسالة تقول «لا لجنة متوافقة، أو تعذّر تجهيز أسئلته» — وحرفُ «أو» يرسل المنظّم
  * يفتّش في غرفة العمليات بينما العطل في نطاق الحفظ، أو العكس. المخزن صار يسجّل رمز
  * السبب عند كل فشل، فيُقرأ من فهرس الأعطال ويُعرض هو وحده.
  */
 const callParticipant=async(id:string)=>{setStartError('');const ok=await startSessionForParticipant(id);
  if(ok)return;
  const code=sessionStartFailureCode?.()||'';
  const reason=code?errorMessageArabic(code):'';
  setStartError(ar
   ?`تعذّر بدء الجلسة لهذا المتسابق: ${reason||'راجع غرفة العمليات أو وزّعه على لجنة أخرى.'}`
   :`Could not start this participant.${code?` (${code})`:''}`)};
 const recorderRef=useRef<MediaRecorder|null>(null); const streamRef=useRef<MediaStream|null>(null); const chunksRef=useRef<Blob[]>([]); const audioStartedAt=useRef<string>(''); const promptAudioRef=useRef<HTMLAudioElement|null>(null); const transitionAudioRef=useRef<HTMLAudioElement|null>(null); const openingPlayedKeyRef=useRef('');
 const alignmentContextRef=useRef<{sessionId:string;reading:QuranReadingId;surah:number;startAyah:number;endAyah:number;sourcePackageId:string}|null>(null); const alignmentBusyRef=useRef(false);
 useEffect(()=>{setDirectScores(Object.fromEntries(visibleCriteria.map(c=>[c.id,c.maxScore])))},[activeSession.sessionId,ruleSet.id,judge?.id]);
 useEffect(()=>{ if(recorderRef.current?.state==='recording')recorderRef.current.stop(); streamRef.current?.getTracks().forEach(t=>t.stop()); recorderRef.current=null;streamRef.current=null;chunksRef.current=[];promptAudioRef.current?.pause();promptAudioRef.current=null;transitionAudioRef.current?.pause();transitionAudioRef.current=null;setOpeningAudioState('idle');setShadowMicActive(false);setAudioState(policy.judging.requireAudioRecording?'not_ready':'ready'); },[activeSession.sessionId,policy.judging.requireAudioRecording]);
 useEffect(()=>{promptAudioRef.current?.pause();promptAudioRef.current=null;openingPlayedKeyRef.current='';setOpeningAudioState('idle');setAlignmentResult(null);setQuranIntelligence(null);setSessionEvidence(null);setReadingGuard(null);setTajweedEducation(false)},[activeSession.currentQuestionIndex]);
 useEffect(()=>{setSecureQuestion(null);setMyRevealApproved(false);setSecureError('')},[activeSession.sessionId,activeSession.currentQuestionIndex,secureMode]);
 useEffect(()=>{if(!secureMode||!activeSession.secureRuntimeSessionId)return;let live=true;const refresh=async()=>{try{const runtime=await getSecureRuntimeStatus(activeSession.secureRuntimeSessionId!);if(live){setSecureRuntime(runtime);setSecureError('');const state=runtime.escrow.questions.find(x=>x.index===activeSession.currentQuestionIndex);if(state?.released&&myRevealApproved&&!secureQuestion){try{const revealed=await revealSecureQuestion(activeSession.secureRuntimeSessionId!,activeSession.currentQuestionIndex);if(live)setSecureQuestion(revealed.payload)}catch(e){if(live)setSecureError(e instanceof Error?e.message:'SECURE_REVEAL_FAILED')}}}}catch(e){if(live)setSecureError(e instanceof Error?e.message:'SECURE_RUNTIME_UNAVAILABLE')}};void refresh();
   // Adaptive cadence: poll fast (1.5s) only while the question is still sealed — the
   // latency-sensitive moment is quorum completion. Once the plaintext is revealed the panel is
   // in the long recitation, so we relax to 5s. Across many committees this cuts steady-state
   // status load ~3x versus a fixed 1.5s poll. (A push channel would need cookie-based auth; the
   // current escrow endpoints are bearer-token GETs, which EventSource cannot carry.)
   const pollMs=secureQuestion?5000:1500;const timer=window.setInterval(()=>void refresh(),pollMs);return()=>{live=false;window.clearInterval(timer)}},[secureMode,activeSession.secureRuntimeSessionId,activeSession.currentQuestionIndex,myRevealApproved,!!secureQuestion]);
 useEffect(()=>{alignmentContextRef.current=null;setAlignmentResult(null);if(!questionRevealed||!q)return;const x=q as any,readingId=quranReadingIdForPackage(x.quranSourcePackageId);if(!readingId||!x.quranSourcePackageId||!Number.isInteger(Number(x.surahNumber))||!Number.isInteger(Number(x.startAyah))||!Number.isInteger(Number(x.endAyah)))return;let live=true;const base={sessionId:activeSession.sessionId,reading:readingId,surah:Number(x.surahNumber),startAyah:Number(x.startAyah),endAyah:Number(x.endAyah),sourcePackageId:String(x.quranSourcePackageId)};void Promise.all([fetchQuranPassageIntelligence(readingId,base.surah,base.startAyah,base.endAyah),fetchQuranIntelligenceCapabilities(),fetchQuranReadingGuard(readingId,base.sourcePackageId)]).then(([data,c,guard])=>{if(!live)return;setQuranIntelligence(data);setReadingGuard(guard);const configured=guard.status==='CLEAR'&&c.streamingAlignment?.backendConfigured===true&&data.alignmentBenchmark?.status==='VERIFIED'&&data.alignmentBenchmark?.passed===true;setAlignmentConfigured(configured);alignmentContextRef.current=configured?base:null}).catch(()=>{if(live){setQuranIntelligence(null);setAlignmentConfigured(false);alignmentContextRef.current=null}});return()=>{live=false;alignmentContextRef.current=null}},[questionRevealed,activeSession.sessionId,(q as any)?.quranSourcePackageId,(q as any)?.surahNumber,(q as any)?.startAyah,(q as any)?.endAyah]);
 useEffect(()=>()=>{void resetQuranAlignment(activeSession.sessionId).catch(()=>{})},[activeSession.sessionId]);
 const refreshSessionEvidence=()=>void fetchQuranSessionEvidence(activeSession.sessionId).then(setSessionEvidence).catch(()=>{});
 const sendAlignmentChunk=(blob:Blob)=>{const context=alignmentContextRef.current;if(!context||alignmentBusyRef.current||!blob.size)return;alignmentBusyRef.current=true;void submitQuranAlignmentChunk({blob,...context}).then(x=>{setAlignmentResult(x);
  /* الإزاحة من لحظة بدء المسجّل، تُقرأ من الـref لا من حالة مُلتقَطة: هذا المُعالِج يُسنَد مرة
     واحدة عند تجهيز الصوت، فأي قيمة مُغلَقة عليه تبقى قيمة تلك اللحظة إلى آخر الجلسة. */
  const startedAt=audioStartedAt.current;
  const at=startedAt?Date.parse(x.timestamp)-Date.parse(startedAt):NaN;
  if(Number.isFinite(at)&&at>=0)setReplayTrail(t=>[...t,{offsetMs:at,ayah:x.ayah,wordIndex:x.wordIndex,alignmentState:x.alignmentState,confidence:x.smoothedConfidence??x.confidence,kind:'ALIGNMENT'}]);
  refreshSessionEvidence()}).catch(()=>{}).finally(()=>{alignmentBusyRef.current=false})};
 // Marks already logged for one action, from the same source the evidence timeline
 // uses, so the two can never disagree. Reversed marks are excluded, as elsewhere.
 const countFor=(eventType:any)=>activeSession.events.filter(e=>!e.reversed&&e.type===eventType).length;
 const recordJudgeEventWithEvidence=(eventType:any,action?:{id:string;shortArabic:string;shortEnglish:string;penalty:number})=>{
  // Read the tally *before* recording: recordJudgeEvent mutates the store synchronously,
  // so counting afterwards and adding one announced a number one too high.
  const tally=countFor(eventType)+1;
  recordJudgeEvent(eventType);
  if(action){
   setMarkedAction(action.id);
   window.setTimeout(()=>setMarkedAction(cur=>cur===action.id?null:cur),520);
   const label=ar?action.shortArabic:action.shortEnglish;
   setMarkAnnounce(ar?`سُجِّل ${label}. ${marksAr(tally)}. الخصم ${action.penalty}.`:`${label} recorded. ${tally} time${tally===1?'':'s'}. Penalty ${action.penalty}.`);
  }
  if(alignmentConfigured)void postQuranHumanMarker(activeSession.sessionId,String(eventType)).then(setSessionEvidence).catch(()=>{})};
 /*
  * «إعادة الفحص» كانت لا تفعل شيئًا: prepareAudio يعود فورًا ما دام المسجّل يعمل، فمحكّم
  * بميكروفون صامت يضغط الزر بلا نهاية ولا يُفتح له سطح التحكيم أبدًا. هذه تُغلق المسجّل
  * والمسار الصوتي ثم تبدأ من الصفر، وهو ما يعنيه الزر.
  */
 const restartAudio=async()=>{const recorder=recorderRef.current;if(recorder&&recorder.state!=='inactive')try{recorder.stop()}catch{/* مسجّل أُغلق مسبقًا */}
  streamRef.current?.getTracks().forEach(t=>t.stop());recorderRef.current=null;streamRef.current=null;stopMeter();
  setMicHeard(false);setMicMeterUnavailable(false);setAudioState('idle');await prepareAudio()};
 const prepareAudio=async()=>{ /* السياق يُنشأ ويُستأنف هنا — قبل أي `await` — فهذه اللحظة وحدها هي إيماءة المستخدم. */ primeAudioContext(); if(recorderRef.current?.state==='recording'){setShadowMicActive(!!alignmentContextRef.current);setAudioState('ready');return;} if(!policy.judging.requireAudioRecording&&!alignmentConfigured){setAudioState('ready');return;} if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setAudioState('failed');return;} setAudioState('requesting'); try{const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});streamRef.current=stream;startMeter(stream);const mime=['audio/webm;codecs=opus','audio/webm','audio/ogg'].find(m=>MediaRecorder.isTypeSupported(m));const recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);recorderRef.current=recorder;chunksRef.current=[];audioStartedAt.current=new Date().toISOString();recorder.ondataavailable=e=>{if(e.data.size){if(policy.judging.requireAudioRecording)chunksRef.current.push(e.data);sendAlignmentChunk(e.data)}};recorder.start(1500);setShadowMicActive(!!alignmentContextRef.current);setAudioState('ready');}catch{setShadowMicActive(false);setAudioState('failed')}};
 const finalizeAudio=async()=>{const recorder=recorderRef.current;if(!recorder||recorder.state!=='recording')return;if(!policy.judging.requireAudioRecording){recorder.stop();streamRef.current?.getTracks().forEach(t=>t.stop());recorderRef.current=null;streamRef.current=null;stopMeter();setShadowMicActive(false);return;}await new Promise<void>(resolve=>{recorder.onstop=async()=>{const blob=new Blob(chunksRef.current,{type:recorder.mimeType||'audio/webm'});const url=URL.createObjectURL(blob);await registerAudioRecording({sessionId:activeSession.sessionId,participantId:participant?.id||'',status:'completed',mimeType:blob.type,startedAt:audioStartedAt.current||new Date().toISOString(),stoppedAt:new Date().toISOString(),sizeBytes:blob.size,localObjectUrl:url,quality:blob.size>2048?'good':'degraded',checksumSource:`${activeSession.sessionId}|${blob.size}|${audioStartedAt.current}`});streamRef.current?.getTracks().forEach(t=>t.stop());recorderRef.current=null;streamRef.current=null;stopMeter();setShadowMicActive(false);resolve()};recorder.stop()})};
 const submitAndLock=async()=>{if(!micRecording)return;await finalizeAudio();lockAndSubmitAssessment(directScores)};
 const isLastQuestion=activeSession.currentQuestionIndex >= Math.max(1,totalQuestions)-1;
 /*
  * الطابور لجنةُ المحكّم، سواءٌ أكانت هناك جلسة مفتوحة أم لا.
  *
  * كان النطاق يُؤخذ من الجلسة الجارية وحدها، فقبل فتح أي جلسة يرى المحكّم طابور
  * المسابقة كلها — بما فيه متسابقو لجانٍ أخرى. فينادي أحدهم، ثم يُرفض فتح السؤال
  * بـ`ASSIGNED_JUDGE_REQUIRED` لأنه ليس من محكّمي تلك اللجنة. والرفض صحيح؛ الخطأ
  * أن نعرض عليه أسماءً لا يستطيع تحكيمها أصلاً.
  *
  * ومن لا لجنة له يرى الطابور كما كان — لا نحبس أحدًا خلف بيانات ناقصة.
  */
 const queueCommitteeId=activeSession.committee?.id||judge?.assignedCommitteeId;
 const committeeQueue=[...participants].filter(p=>p.status==='in_queue' && p.id!==participant?.id && (!queueCommitteeId||!p.assignedCommitteeId||p.assignedCommitteeId===queueCommitteeId)).sort((a,b)=>(a.queueOrderKey??a.queueNumber??999999)-(b.queueOrderKey??b.queueNumber??999999));
 const nextQueued=committeeQueue[0];
 /*
  * «لا توجد جلسة الآن» وحدها كانت تُقال لمحكّمٍ في مسابقةٍ فيها مئة متسابق مسجَّل.
  *
  * الطابور لا يمتلئ إلا بالحضور (check-in)، فإذا لم يُفتح الاستقبال — أو جرى التسجيل
  * ولم يصل أحد إلى الكشك — بقيت الشاشة فارغة بلا سبب معلن، فيظنّ المحكّم النظام معطلًا.
  * فتُعرض هنا حالة الكشوف كما هي: كم معتمدًا ينتظر الحضور، ويُفتح للمحكّم أن يُدخل
  * المتسابق الحاضر أمامه إلى الطابور مباشرة بدل أن يقف الجميع.
  */
 const rosterForCompetition=participants.filter(p=>p.competitionId===competition.id);
 /*
  * كل من يمكن نداؤه يُعرض باسمه.
  *
  * كان الكشف يقتصر على «معتمد» و«سجّل حضوره»، فمتسابقٌ عَلِقت حالته على «في الجلسة» بعد
  * محاولةٍ فاشلة يختفي من الشاشة كلها: لا هو في الطابور ولا في الكشف، والعدّاد يقول صفرًا
  * والجهة ترى في إدارتها متسابقًا مقبولًا. فصار يُعرض كل من له دور لم يُقيَّم بعد، وتُقال
  * حالته بجانب اسمه، ويُنادى مباشرة — ومن عَلِق تُفكّ حالته أولًا ثم يُنادى.
  */
 /*
  * ما قبل التقييم وحده يُنادى.
  *
  * «اعتراض» حالةُ من فرغ تقييمه، وإعادةُ اختباره لها مسارها المحكوم (إعادة كاملة بقرار).
  * ولو ظهر هنا بزرّ «إدخال ونداء» لفُتحت له جلسةٌ وسحبٌ جديد خارج ذلك المسار — فيصير
  * الاعتراض بابًا لإعادةٍ غير مأذونة.
  */
 const CALLABLE:RegistrationStatus[]=['approved','checked_in','in_session'];
 const awaitingArrival=rosterForCompetition
  .filter(p=>CALLABLE.includes(p.status)&&p.id!==participant?.id)
  .filter(p=>!committeeQueue.some(q=>q.id===p.id))
  .sort((a,b)=>(a.queueNumber??999999)-(b.queueNumber??999999)||a.code.localeCompare(b.code));
 const rosterCounts={
  total:rosterForCompetition.filter(p=>!['rejected','draft'].includes(p.status)).length,
  queued:committeeQueue.length,
  awaiting:awaitingArrival.length,
  pending:rosterForCompetition.filter(p=>['submitted','under_review'].includes(p.status)).length,
 };
 const deductions=activeSession.events.filter(e=>!e.reversed).reduce((s,e)=>s+e.penalty,0);
 const blindness=resolveBlindness(policy.judging);
 const masked=maskParticipantForJudge(participant,blindness,ar);
 const displayName=masked.displayName;
 const judgeActions=actions.filter(a=>{const criterion=ruleSet.criteria.find(c=>c.id===a.criterion);return a.criterion==='custom'||!criterion||judgeCanScore(effectiveJudge,criterion.assignedJudgeType,policy.judging.mode)});
 const directMode=policy.judging.scoreEntryMode==='direct_score'||policy.judging.scoreEntryMode==='hybrid';
 // كل مسابقة حسب سياستها: إظهار مجموع الخصم الجاري للمحكم، والسماح بالتراجع عن آخر ملاحظة.
 const showRunningScore=policy.judging.showRunningScoreToJudge!==false;
 const allowUndo=policy.judging.allowJudgeUndo!==false;
 const calibrationBlocked=policy.judging.calibrationRequired && !!judge && !judge.isReady;
 const reviewAvailable=activeSession.isLocked&&policy.aiPolicy.revealOnlyAfterJudgeLock&&policy.aiPolicy.mode!=='AI_DISABLED'&&policy.aiPolicy.mode!=='AI_RESEARCH_SHADOW_MODE'&&store.reviewCases.some(r=>r.sessionId===activeSession.sessionId&&r.status==='pending'&&r.reason==='ai_high_confidence_alert');
 const reading=participant?resolveReading({riwaya:participant.riwaya}):undefined; const readingQiraah=secureRuntime?.qiraah||activeSession.questionSelection?.qiraah||reading?.qiraah; const readingRawi=secureRuntime?.rawi||activeSession.questionSelection?.rawi||reading?.rawi; const readingTariq=secureRuntime?.tariq||activeSession.questionSelection?.tariq;
 const openingReference=q&&readingQiraah&&readingRawi?selectApprovedOpeningAudio({references:store.quranReferenceAudio,qiraah:readingQiraah,rawi:readingRawi,tariq:readingTariq,preferredReciter:policy.questions.openingPrompt?.preferredReciter,surah:q.surahNumber,ayah:q.startAyah}):undefined;
 const certifiedPosition=readingQiraah&&readingRawi?certifiedCapabilityFor(store.aiCapabilityValidations,{capability:'quran_position',qiraah:readingQiraah,rawi:readingRawi,tariq:readingTariq}):undefined;
 const sessionRecording=store.audioRecordings.find(x=>x.sessionId===activeSession.sessionId&&x.status==='completed'&&!!x.localObjectUrl);
 const replayEvidence=(offsetMs:number)=>{if(!sessionRecording?.localObjectUrl)return;const player=new Audio(sessionRecording.localObjectUrl);player.currentTime=Math.max(0,offsetMs/1000);void player.play().catch(()=>{})};
 /* أثر التتبّع كان يُستبدل عند كل مقطع فيضيع: تُحفظ الرصدات مع إزاحتها من بداية التسجيل حتى
    تستطيع إعادة التشغيل أن تُري لجنةَ المراجعة أين وقعت كل ملاحظة في النص. */
 const [replayTrail,setReplayTrail]=useState<ReplayMark[]>([]);
 useEffect(()=>{setReplayTrail([])},[activeSession.sessionId,activeSession.currentQuestionIndex]);
 /* نص المقطع لإعادة التشغيل يُجلب من نفس حزمة التسليم التي يعرضها سطح المصحف، فلا يتفرّع نصّان. */
 const [replayAyat,setReplayAyat]=useState<{ayah:number;text:string}[]>([]);
 useEffect(()=>{let live=true;setReplayAyat([]);
  const x=q as any;if(!questionRevealed||!x)return;
  const key=deliveryReadingKeyFor({qiraah:x.qiraah,rawi:x.rawi,riwaya:x.riwaya});
  const surah=Number(x.surahNumber)||surahNumberFromName(x.surahNameEnglish,x.surahNameArabic);
  if(!key||!surah||!Number(x.startAyah)||!Number(x.endAyah))return;
  void fetchDeliveryPassage(key,surah,Number(x.startAyah),Number(x.endAyah))
   .then(p=>{if(live&&p)setReplayAyat(p.ayat.map(a=>({ayah:a.ayah,text:a.text})))}).catch(()=>{});
  return()=>{live=false}},[questionRevealed,(q as any)?.surahNumber,(q as any)?.startAyah,(q as any)?.endAyah,(q as any)?.rawi,(q as any)?.riwaya]);
 const assignedJudgeId=judge?.userId||store.currentUser.id; const approvedByMe=secureMode?myRevealApproved:!!gate?.approvals.some(a=>a.judgeId===assignedJudgeId); const required=secureMode?(secureQuestionState?.required||activeSession.committee?.judgeIds.length||0):(gate?.requiredJudgeIds.length||activeSession.committee?.judgeIds.length||0); const approved=secureMode?(secureQuestionState?.approved||0):(gate?.approvals.length||0); const participantPresent=secureMode?!!secureRuntime?.escrow.presenceVerified:!!gate?.participantPresence.verified;

 // بلا مرجع صوتي في المتجر: نشغّل «أول آية» من مصدر التسليم الرسمي (Cloudflare R2) مباشرة —
 // ملف صوتي لآية واحدة، فيبدأ ويقف عند نهايتها وحده. صوت رسمي معتمد، لا تحويل نص إلى كلام.
 const playOfficialDeliveryAyah=async()=>{if(!q)return false;const anyq=q as any;const readingKey=deliveryReadingKeyFor({qiraah:anyq.qiraah||readingQiraah,rawi:anyq.rawi||readingRawi,riwaya:anyq.riwaya||participant?.riwaya});const surah=Number(anyq.surahNumber)||surahNumberFromName(anyq.surahNameEnglish,anyq.surahNameArabic);if(!readingKey||!surah||!q.startAyah)return false;const playKey=`${activeSession.sessionId}:${activeSession.currentQuestionIndex}:delivery:${surah}:${q.startAyah}`;if(openingPlayedKeyRef.current===playKey)return true;setOpeningAudioState('playing');const src=await fetchOfficialAyahAudio(readingKey,surah,q.startAyah);if(!src){setOpeningAudioState('unavailable');return false;}try{promptAudioRef.current?.pause();const player=new Audio(src);promptAudioRef.current=player;player.onended=()=>{setOpeningAudioState('idle');URL.revokeObjectURL(src)};player.onerror=()=>setOpeningAudioState('failed');await player.play();openingPlayedKeyRef.current=playKey;return true}catch{setOpeningAudioState('failed');return false}};
 const playOpeningAudio=async()=>{if(!questionRevealed||!q){setOpeningAudioState('unavailable');return false;}
   // الأولوية دائمًا لملف الآية الواحدة من مصدر التسليم الرسمي: ملف لآية واحدة يبدأ ويقف عند
   // نهايتها وحده. لا نلجأ إلى مقطع الخزنة إلا إذا تعذّر ملف الآية، ونضع له سقفًا ضيقًا.
   if(await playOfficialDeliveryAyah())return true;
   if(!openingReference?.audioUrl){setOpeningAudioState('unavailable');return false;}const playKey=`${activeSession.sessionId}:${activeSession.currentQuestionIndex}:${openingReference.id}`;if(openingPlayedKeyRef.current===playKey)return true;const window=openingAudioWindow(openingReference,q.startAyah);if(!window){setOpeningAudioState('unavailable');return false;}try{promptAudioRef.current?.pause();const player=new Audio(openingReference.audioUrl);promptAudioRef.current=player;player.currentTime=window.startMs/1000;setOpeningAudioState('playing');
   /* لا يُشغّل إلا أول آية من السؤال ثم يسكت. حين لا يتوفر توقيت نهاية الآية نضع سقفًا آمنًا
      قصيرًا حتى لا يُكمِل تلاوة الوجه كله بلا توقّف. */
   const limitMs=window.endMs!==undefined?window.endMs:window.startMs+7000;
   const stop=()=>{if(player.currentTime*1000>=limitMs){player.pause();player.removeEventListener('timeupdate',stop);setOpeningAudioState('idle')}};player.addEventListener('timeupdate',stop);player.onended=()=>setOpeningAudioState('idle');await player.play();openingPlayedKeyRef.current=playKey;store.markOpeningAudioPlayed(openingReference.id);return true}catch{setOpeningAudioState('failed');return false}};
 const confirmPresence=async()=>{if(!secureMode){setSecureError('');const out=await store.verifyParticipantPresenceForQuestion('manual_visual_confirmation');if(!out.ok)setSecureError(revealRefusalText(out.reason,ar));return out}if(!activeSession.secureRuntimeSessionId)return {ok:false,reason:'SECURE_RUNTIME_MISSING'} as const;try{const runtime=await confirmSecureParticipantPresence(activeSession.secureRuntimeSessionId);setSecureRuntime(runtime);setSecureError('');return {ok:true} as const}catch(e){setSecureError(e instanceof Error?e.message:'PRESENCE_FAILED');return {ok:false,reason:'PRESENCE_FAILED'} as const}};
 /*
  * رفضُ الفتح يُقال، لا يُبتلع.
  *
  * كان الرد يُهمَل ما لم يكن نجاحًا وكشفًا، فيضغط المحكّم الزرّ فلا يحدث شيء — لا سؤال
  * ولا سبب. وأكثر أسباب الرفض شيءٌ يملك المشغّل إصلاحه بنفسه لو قيل له.
  */
 const approveReveal=async()=>{if(!secureMode){setSecureError('');const result=await store.approveQuestionReveal();
   if(!result.ok){setSecureError(revealRefusalText(result.reason,ar));return}
   if(result.revealed&&policy.questions.openingPrompt?.autoplay!==false)window.setTimeout(()=>void playOpeningAudio(),30);return}if(!activeSession.secureRuntimeSessionId)return;try{setMyRevealApproved(true);const runtime=await approveSecureQuestion(activeSession.secureRuntimeSessionId,activeSession.currentQuestionIndex);setSecureRuntime(runtime);const state=runtime.escrow.questions.find(x=>x.index===activeSession.currentQuestionIndex);if(state?.released){const revealed=await revealSecureQuestion(activeSession.secureRuntimeSessionId,activeSession.currentQuestionIndex);setSecureQuestion(revealed.payload);setSecureError('')}}catch(e){setMyRevealApproved(false);setSecureError(e instanceof Error?e.message:'SECURE_APPROVAL_FAILED')}};
 const approveReplacement=async()=>{if(!secureMode||!activeSession.secureRuntimeSessionId)return;setReplacementBusy(true);try{const result=await approveEmergencyQuestionReplacement(activeSession.secureRuntimeSessionId,activeSession.currentQuestionIndex);setSecureRuntime(result);if(result.replacementReady){setSecureQuestion(null);setMyRevealApproved(false);setOpeningAudioState('idle')}setSecureError('')}catch(e){setSecureError(e instanceof Error?e.message:'QUESTION_REPLACEMENT_FAILED')}finally{setReplacementBusy(false)}};
 const speakTransition=()=>{if(!store.finishCurrentQuestionSegment())return;const transition=passageTransitionPlan({isLastQuestion,ar,cue:policy.questions.transitionCue,variantSeed:activeSession.currentQuestionIndex});const proceed=()=>{if(transition.autoAdvance)nextQuestion()};const afterCue=()=>window.setTimeout(proceed,transition.delayMs);if(!transition.enabled){afterCue();return;}let fallbackUsed=false;const speakFallback=()=>{if(fallbackUsed)return;fallbackUsed=true;if(typeof window!=='undefined'&&'speechSynthesis'in window){window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(transition.phrase);u.lang=ar?'ar-SA':'en-US';
  /* صوت المتصفح الافتراضي يبدو آليًا؛ نختار أقرب صوت عربي طبيعي متاح (Natural/Enhanced/Premium)
     ونضبط السرعة والنبرة لنبرة ألطف. هذا fallback فقط بعد فشل صوت ميزان المطابق. */
  /* المنادي في القاعة رجل: يُقدَّم الصوت الذكوري على غيره، ثم يُفاضَل بين الذكورية على الجودة. */
  try{const voices=window.speechSynthesis.getVoices()||[];const want=ar?'ar':'en';
   const pool=voices.filter(v=>v.lang?.toLowerCase().startsWith(want));
   const male=(v:SpeechSynthesisVoice)=>/male|رجل|ذكر|hamed|majed|maged|omar|khalid|tarik|amr|daniel|fred|george|rishi/i.test(v.name)&&!/female|امرأة|أنثى/i.test(v.name);
   const fine=(v:SpeechSynthesisVoice)=>/natural|enhanced|premium|neural/i.test(v.name);
   const men=pool.filter(male);
   const best=men.find(fine)||men[0]||pool.find(fine)||pool[0];if(best)u.voice=best;}catch{}
  u.rate=.9;u.pitch=.92;u.onend=afterCue;u.onerror=afterCue;window.speechSynthesis.speak(u);}else afterCue()};
 const playCueUrl=(url:string,onFail:()=>void)=>{if(typeof Audio==='undefined'){onFail();return}try{transitionAudioRef.current?.pause();const player=new Audio(url);transitionAudioRef.current=player;player.onended=afterCue;player.onerror=onFail;void player.play().catch(onFail)}catch{onFail()}};
 /* مصادر عبارة الإيقاف مملوكة لميزان ومطابقة للنص المختار: مقطع مدمج، ثم صوت الخادم
    لنفس العبارة غير القرآنية، ثم نطق الجهاز. لا رفع تسجيل يدوي ولا نص قرآني في TTS. */
 const serverCue=()=>playCueUrl(`/api/public/cue-audio?text=${encodeURIComponent(transition.phrase)}`,speakFallback);
 const storedCue=()=>playCueUrl(`/audio/cues/cue-${transition.variantIndex}.wav`,serverCue);
 storedCue()};

 useEffect(()=>{if(questionRevealed&&q&&policy.questions.openingPrompt?.autoplay!==false)window.setTimeout(()=>void playOpeningAudio(),80)},[questionRevealed,(q as any)?.questionId,(q as any)?.id,openingReference?.id,activeSession.currentQuestionIndex]);
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||activeSession.questionPhase!=='RECITING')return;if(e.key.toLowerCase()==='z'){if(allowUndo)undoLastJudgeEvent();return;}const action=judgeActions.find(a=>a.shortcut===e.key);if(action){e.preventDefault();recordJudgeEventWithEvidence(action.eventType)}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[judgeActions,activeSession.isLocked,activeSession.questionPhase]);
 useEffect(()=>{if(!certifiedPosition)return;const handler=(event:Event)=>{const detail=(event as CustomEvent<{sessionId?:string;questionIndex?:number;validationId?:string}>).detail;if(detail?.sessionId!==activeSession.sessionId||detail.questionIndex!==activeSession.currentQuestionIndex||detail.validationId!==certifiedPosition.id)return;speakTransition()};window.addEventListener('mizan:certified-passage-end',handler);return()=>window.removeEventListener('mizan:certified-passage-end',handler)},[certifiedPosition?.id,activeSession.sessionId,activeSession.currentQuestionIndex,isLastQuestion]);

 if(calibrationBlocked) return <div className="max-w-2xl mx-auto px-4 py-20"><div className="mizan-surface p-7 text-center"><div className="mizan-kicker">{ar?'جاهزية المحكم':'JUDGE READINESS'}</div><h1 className="text-2xl font-black mt-2">{ar?'المعايرة قبل التحكيم':'Calibrate before judging'}</h1><p className="text-xs text-[#646965] mt-3">{ar?'هذه المسابقة تشترط معايرة المحكم. التدريب لا يغيّر أي درجة؛ إنه فحص جاهزية فقط.':'This competition requires judge calibration. Training never alters contestant scores; it is a readiness gate only.'}</p><div className="mt-5 rounded-2xl bg-[#f3f1eb] p-4"><div className="text-3xl font-black">{judge?.calibrationScore||0}%</div><div className="text-[10px] text-[#656b66] mt-1">{ar?'التوافق الحالي':'Current agreement'}</div></div><Button className="mt-5" onClick={()=>store.completeJudgeCalibration(judge!.id,92)}>{ar?'تشغيل تدريب المعايرة':'Run calibration training'}</Button><div className="text-[10px] text-[#696f6b] mt-3">{ar?'تُستخدم تلاوات مرجعية من مصدر المصحف المعتمد.':'Reference recitations come from the approved Mushaf source.'}</div></div></div>;
 if(!participant) return <div className="max-w-3xl mx-auto px-4 py-16"><div className="text-center"><HeadphonesEmpty/>
  <h1 className="text-2xl font-black mt-4">{nextQueued?(ar?'لا توجد جلسة الآن':'No active session'):rosterCounts.awaiting?(ar?'لا أحد في الطابور — والكشوف ليست فارغة':'The queue is empty — the roster is not'):(ar?'لا توجد جلسة الآن':'No active session')}</h1>
  <p className="mt-2 text-xs leading-6 text-[#646965]">
   {ar
    ?`${rosterCounts.total} متسابقًا في هذه المسابقة · ${rosterCounts.queued} في طابور لجنتك · ${rosterCounts.awaiting} معتمدًا لم يُسجَّل حضوره بعد${rosterCounts.pending?` · ${rosterCounts.pending} طلبًا تحت المراجعة`:''}.`
    :`${rosterCounts.total} participants · ${rosterCounts.queued} in your panel queue · ${rosterCounts.awaiting} approved but not checked in${rosterCounts.pending?` · ${rosterCounts.pending} applications under review`:''}.`}
  </p>
  {nextQueued&&<Button className="mt-5" onClick={()=>void callParticipant(nextQueued.id)}>{ar?'استقبال المتسابق التالي':'Call next participant'}</Button>}
  {startError&&<div role="alert" className="mt-4 mx-auto max-w-md rounded-xl bg-[#F4E6E3] text-[#88473f] px-4 py-3 text-xs font-bold leading-5">{startError}</div>}
 </div>
 {!!committeeQueue.length&&<div className="mizan-surface mt-7 p-5 text-start">
  <div className="mizan-kicker">{ar?'من ينتظر دوره':'WAITING'}</div>
  <h2 className="mt-1 text-sm font-black">{ar?'صاحب الدور أوّلًا — بالترتيب':'The next in line — in order'}</h2>
  {/*
    * شاشة المحكّم لا تعرض إلا طابور لجنته، بترتيبه.
    *
    * كانت تعرض قائمتين: الطابور، ومعه «من لم يصل بعد» وزرُّ «أدخِله وابدأ» لكل صفّ فيها.
    * فيستطيع المحكّم أن يستقبل من لم يحضر ويبدأ به فورًا أمام عشرين منتظرًا — تخطٍّ أشدّ
    * من التخطّي داخل الطابور، لأن صاحبه لا يظهر في الطابور أصلًا فلا يُرى أن أحدًا تُخطّي.
    *
    * والاستقبال ليس عمل المحكّم أصلًا: هو إجراء حضورٍ يخصّ التشغيل ومكتب الاستثناء، ويُوثَّق
    * هناك باسم فاعله وسببه. فبقي للمحكّم ما يخصّه وحده: من أمامه الآن، ومن يليه.
    *
    * وصاحب الدور وحده يُبدأ به. والقاعدة نفسها مفروضة عند بدء الجلسة لا في الشاشة وحدها
    * (`SESSION_START_OUT_OF_TURN`)، فلا يفتحها مسارٌ آخر.
    */}
  <ul className="mt-4 divide-y divide-[#eceae3] rounded-2xl border border-[#e5e3dc] bg-white">
   {committeeQueue.slice(0,24).map((p,i)=>{const turn=i===0;return <li key={p.id} className={`flex items-center gap-3 px-3 py-2.5 ${turn?'':'opacity-60'}`}>
    <span className="w-6 shrink-0 text-[11px] font-black text-[#656b66] tabular-nums">{i+1}</span>
    <span className="font-mono text-[11px] font-black text-[#656b66]" dir="ltr">{p.code}</span>
    <span className="min-w-0 flex-1 truncate text-sm font-bold">{maskParticipantForJudge(p,blindness,ar).displayName}</span>
    <span className="shrink-0 text-[10px] font-black text-[#5f6663]">{turn?(ar?'صاحب الدور':'Next'):(ar?PARTICIPANT_WAIT_LABEL[p.status]||'ينتظر':'')}</span>
    <Button size="sm" variant={turn?'primary':'outline'} disabled={!turn} title={turn?undefined:(ar?'الترتيب مُلزم: يُنادى صاحب الدور أولًا. تأخُّر متسابقٍ يُعالَج من غرفة العمليات.':'Order is binding: the next in line is called first.')} onClick={()=>void callParticipant(p.id)}>{ar?'ابدأ جلسته':'Start'}</Button>
   </li>})}
  </ul>
  <p className="mt-2 text-[10px] leading-5 text-[#696f6b]">{ar?'الترتيب مُلزم ولا يُتخطّى من هذه الشاشة. واستقبال من لم يصل ليس من هذه الشاشة: يتم من غرفة العمليات أو مكتب الاستثناء، ثم يدخل الطابور بترتيبه.':'Order is binding here and cannot be skipped. Admitting a late arrival happens in operations, not on this screen.'}</p>
  {!!awaitingArrival.length&&<p className="mt-1.5 text-[10px] leading-5 text-[#696f6b]">{ar?`${awaitingArrival.length} متسابقًا لم يدخلوا الطابور بعد. استقبالهم من غرفة العمليات.`:`${awaitingArrival.length} not in the queue yet — admitted from operations.`}</p>}
  {committeeQueue.length>24&&<p className="mt-1.5 text-[10px] text-[#696f6b]">{ar?`و${committeeQueue.length-24} غيرهم في الطابور.`:`And ${committeeQueue.length-24} more in the queue.`}</p>}
 </div>}
 {!nextQueued&&!awaitingArrival.length&&!!rosterCounts.pending&&<div className="mizan-surface mt-7 p-5 text-center text-xs leading-6 text-[#646965]">
  {ar?`لا يوجد متسابق معتمد بعد: ${rosterCounts.pending} طلبًا ما زال تحت المراجعة. الاعتماد يتم من شاشة «المتسابقون» في الإدارة.`:`No approved participant yet: ${rosterCounts.pending} applications are still under review. Approval happens in the admin Participants screen.`}
 </div>}
 </div>;

 /*
  * قمرة المحكّم.
  *
  * كانت صفحةً تُمرَّر بين شريطين لاصقين: شريطٌ علويٌّ يحمل الاسم والمؤقّت وموضع السؤال،
  * ثم المصحف، ثم لوحةُ أزرارٍ ارتفاع زرّها ١٥٢px. والمصحف — وهو الشيء الوحيد الذي يُنظر
  * إليه أثناء التلاوة — كان محصورًا بينهما ولا يُرى كاملًا إلا بتمرير. والمحكّم لا يملك
  * يدًا فارغة للتمرير: أمامه متسابقٌ يقرأ، وأصابعه على الأزرار.
  *
  * فصارت قمرةً بارتفاع الشاشة لا تُمرَّر: المصحف يأخذ ما بقي، ويُمرَّر هو وحده إن طال.
  * والشريط العلوي حُذف ولم يضِع ما فيه — الاسم والحالة والمؤقّت وموضع السؤال انتقلت إلى
  * رأس اللوحة، تُقرأ دائمًا بلا أن تقتطع شريطًا عرضيًّا من فوق المصحف.
  *
  * وترتيب البوابات كما كان: الميكروفون حين تُلزم به السياسة، ثم الحضور والموافقة، ثم
  * الموضع. لم يُمَسّ منها شيء؛ المتغيّر هو أين تُرسم لا متى تُفتح.
  */
 return <div className="mizan-judge-os bg-[#fbfaf6]">

  {/* المصحف — الضوء كلّه عليه، وهو أوّل ما يُقرأ في اتجاه القراءة. */}
  <div className="mizan-judge-page">
   <div className="mizan-surface h-full p-3 sm:p-5 flex flex-col">

    {/*
     * استثناء عبر الفئات — يقف فوق كل شيء ولا يُطوى.
     *
     * متسابقٌ نُقل إلى لجنةٍ لا تحكم فئته. أسئلته تبقى أسئلة فئته لأن مرجع أهلية السؤال
     * نطاقُه المعتمد لا تخصّص اللجنة. النظام يفعل ذلك أصلًا، لكنّ اللجنة لا تعلم — فترى
     * موضعًا خارج ما اعتادت فتظنّه عطبًا، أو تحكم بمسطرة فئتها.
     */}
    {participant?.crossCategoryException&&<div role="alert" className="mb-3 rounded-2xl border border-[#d8bd6a] bg-[#fffaf0] px-3.5 py-3 flex items-start gap-2.5 shrink-0">
     <AlertTriangle className="w-4 h-4 text-[#8a6d1f] shrink-0 mt-0.5"/>
     <div className="min-w-0">
      <div className="text-[12px] font-black text-[#604724]">{ar?'استثناء: هذا المتسابق ليس من فئة هذه اللجنة':'Exception: not from this panel’s category'}</div>
      <p className="text-[11px] leading-5 text-[#6b5b45] mt-1">
       {ar
        ?`فئته «${bilingualName(participantCategory,true)||'—'}»، ونطاقها هو ما يُسأل فيه — لا تخصّص هذه اللجنة. الموضع صحيح وإن بدا خارج ما اعتدتموه، والتقييم يكون بمسطرة فئته هو.`
        :`His category is “${bilingualName(participantCategory,false)||'—'}”, and its scope governs the questions. The passage is correct even if unfamiliar, and he is scored by his own rubric.`}
      </p>
      <div className="text-[10px] text-[#8a7a62] mt-1.5">{ar?'اعتمده: ':'Approved by: '}{participant.crossCategoryException.approvedBy} · {participant.crossCategoryException.reason}</div>
     </div>
    </div>}

    {/* أعطالٌ تُقال ولا تمنع. */}
    <div className="space-y-2 empty:hidden shrink-0 mb-3">
     {micGateApplies&&micRecording&&!micHeard&&!micMeterUnavailable&&<div role="status" className="rounded-2xl border border-[#e8d6b8] bg-[#fdf6e8] px-3.5 py-2.5 text-[11px] font-bold leading-5 text-[#6b4f18] flex flex-wrap items-center gap-2"><Mic className="w-3.5 h-3.5 shrink-0"/><span className="flex-1 min-w-0">{ar?'التسجيل يعمل. ومؤشّر المستوى لم يتحرّك بعد — وقد يكون لأن التلاوة لم تبدأ، أو لأن هذا المتصفّح لا يعرض المستوى. إن كنت تسمع المتسابق فالجلسة تُسجَّل.':'Recording is running. The level meter has not moved yet — the recitation may not have started, or this browser may not report levels. If you can hear the participant, the session is being recorded.'}</span><Button size="sm" variant="outline" onClick={()=>void restartAudio()}>{ar?'إعادة الفحص':'Re-check'}</Button></div>}
     {micGateApplies&&micMeterUnavailable&&<div role="status" className="rounded-2xl border border-[#e2dfd5] bg-[#f8f6ef] px-3.5 py-2.5 text-[11px] font-bold leading-5 text-[#6f6a5c] flex items-center gap-2"><Mic className="w-3.5 h-3.5 shrink-0"/>{ar?'هذا المتصفّح لا يعرض مؤشّر مستوى الصوت، والتسجيل يعمل. لا شيء مطلوب منك هنا — تحقّق من وضوح الصوت بعد أول تلاوة.':'This browser does not show a live level meter, and recording is running. Nothing is required of you here — check the audio after the first recitation.'}</div>}
     {secureError&&<div role="alert" className="rounded-2xl bg-[#F4E6E3] text-[#88473f] px-3.5 py-2.5 text-[11px] font-bold leading-5 flex items-start gap-2"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5"/><span>{secureMode?(ar?'تعذر الوصول الآمن إلى كبسولة السؤال. لن يعرض ميزان نسخة محلية بديلة.':'Secure question capsule unavailable. MIZAN will not fall back to local question plaintext.'):secureError}{secureMode&&<span className="opacity-60 font-mono ms-1">{secureError}</span>}</span></div>}
     {secureMode&&questionRevealed&&['AUTHORIZED','PENDING_PANEL_QUORUM'].includes(secureRuntime?.emergencyReplacement.state||'')&&(secureRuntime?.emergencyReplacement.questionIndex===undefined||secureRuntime?.emergencyReplacement.questionIndex===activeSession.currentQuestionIndex)&&<div className="rounded-2xl border border-[#d7c39e] bg-[#F5EFE2] px-3.5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"><div><div className="text-[12px] font-black text-[#6f532d]">{ar?'تبديل طارئ مصرح — لهذا السؤال فقط':'Authorized emergency replacement — this question only'}</div><div className="text-[10px] text-[#806b4d] mt-0.5">{ar?'الإدارة سمحت بالتبديل. يحتاج موافقة اللجنة، وسؤالٌ واحد فقط في الجلسة.':'Administration authorized it. Panel quorum is required; only one question per session.'}</div></div><Button size="sm" variant="outline" disabled={replacementBusy} icon={<RotateCcw className="w-4 h-4"/>} onClick={()=>void approveReplacement()}>{replacementBusy?(ar?'جارٍ التحقق…':'Checking…'):(ar?'أوافق على التبديل':'Approve replacement')}</Button></div>}
    </div>

    {/* ── بوابة الميكروفون ────────────────────────────────────────────────── */}
    {micGateApplies&&!micRecording&&<div className="flex-1 min-h-0 grid place-content-center text-center px-4">
     <div className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${audioState==='failed'?'bg-[#F4E6E3] text-[#A34D43]':'bg-[#EEF2EF] text-[#214C40]'}`}>{audioState==='failed'?<MicOff className="h-6 w-6"/>:<Mic className="h-6 w-6"/>}</div>
     <h2 className="mt-4 text-base font-black text-[#20241f]">{audioState==='failed'?(ar?'تعذّر تشغيل الميكروفون':'Microphone unavailable'):(ar?'تأكيد الميكروفون قبل بدء الأسئلة':'Confirm the microphone first')}</h2>
     <p className="mx-auto mt-2 max-w-sm text-[11px] leading-6 text-[#656b66]">{audioState==='failed'?(ar?'لا تبدأ التلاوة بلا تسجيل، فسياسة هذه المسابقة تُلزم به. راجع توصيل الميكروفون وأذونات المتصفح ثم أعد المحاولة.':'Recording is required by this competition policy. Check the microphone and browser permission, then retry.'):(ar?'سياسة هذه المسابقة تُلزم بتسجيل الجلسة، ولا يُفتح الموضع قبل تشغيل الميكروفون.':'This competition requires session recording; the passage stays sealed until the microphone is running.')}</p>
     <div className="mx-auto mt-5 flex max-w-xs items-end justify-center gap-[3px]" aria-hidden="true">{Array.from({length:24}).map((_,i)=>{const on=micLevel*24>i;return <span key={i} className={`w-1.5 rounded-full transition-[height,background-color] duration-75 ${on?(i>19?'bg-[#A34D43]':i>14?'bg-[#9B7542]':'bg-[#2F6555]'):'bg-[#e8e6df]'}`} style={{height:`${6+i*0.75}px`}}/>})}</div>
     <div className="mt-2.5 text-[10px] font-black text-[#656b66]">{ar?'الشريط يعمل بعد تجهيز الميكروفون':'The level meter starts once the microphone is prepared'}</div>
     <div className="mt-5"><Button onClick={()=>void prepareAudio()} disabled={audioState==='requesting'}>{audioState==='requesting'?'…':(ar?'تجهيز الميكروفون':'Prepare microphone')}</Button></div>
     <p className="mx-auto mt-3.5 max-w-sm text-[10px] font-bold leading-5 text-[#656b66]">{ar?'بمجرد أن يعمل التسجيل يظهر تأكيد الحضور وموافقة المحكمين، ولا ينتظر ذلك وصول الصوت إلى الشريط.':'Once recording runs, presence and panel approval appear next — they do not wait on the level meter.'}</p>
    </div>}

    {/* ── بوابتا الحضور والموافقة ─────────────────────────────────────────── */}
    {!questionRevealed&&!activeSession.isLocked&&micRecording&&<div className="flex-1 min-h-0 grid place-content-center text-center px-4">
     <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#f0eee7] text-[#313a35]"><LockKeyhole className="h-6 w-6"/></div>
     <h2 className="mt-4 text-base font-black">{ar?'السؤال لم يُكشف':'Question remains sealed'}</h2>
     <p className="mx-auto mt-2 max-w-sm text-[11px] leading-6 text-[#636864]">{ar?'لا يظهر اسم السورة أو الآيات قبل وجود المتسابق أمام اللجنة وموافقة المحكمين المكلّفين.':'No passage details appear until the participant is present and assigned judges approve the reveal.'}</p>
     <div className="mx-auto mt-5 grid w-full max-w-sm grid-cols-2 gap-2.5">
      <GateState icon={UserCheck} ok={participantPresent} title={ar?'المتسابق أمام اللجنة':'Participant present'} value={participantPresent?(ar?'تم التحقق':'Verified'):(ar?'مطلوب':'Required')}/>
      <GateState icon={UsersRound} ok={required>0&&approved>=required} title={ar?'موافقة المحكمين':'Judge approvals'} value={`${approved} / ${required}`}/>
     </div>
     <div className="mt-5">{!participantPresent
      ?<Button icon={<UserCheck className="w-4 h-4"/>} onClick={()=>void confirmPresence()}>{ar?'المتسابق أمامي — تأكيد الحضور':'Participant is here — confirm presence'}</Button>
      :<Button disabled={approvedByMe} icon={<ShieldCheck className="w-4 h-4"/>} onClick={()=>void approveReveal()}>{approvedByMe?(ar?'تم تسجيل موافقتي':'My approval recorded'):(ar?'أوافق على فتح السؤال':'Approve question reveal')}</Button>}</div>
    </div>}

    {/* ── الموضع ─────────────────────────────────────────────────────────── */}
    {micRecording&&questionRevealed&&q&&!activeSession.isLocked&&!(activeSession.questionPhase==='TRANSITION'&&isLastQuestion)&&<>
     <div className="min-h-0 flex-1 overflow-auto"><OfficialMushafSurface question={q as any} ar={ar} tracking={alignmentResult}/></div>
     <div className="mt-3 flex flex-wrap items-center justify-center gap-2 shrink-0">
      {openingAudioState!=='unavailable'&&<Button size="sm" variant="outline" icon={<Volume2 className="w-4 h-4"/>} onClick={()=>void playOpeningAudio()} disabled={openingAudioState==='playing'}>{openingAudioState==='playing'?(ar?'تلاوة أول آية…':'Playing first ayah…'):(ar?'تلاوة أول آية':'First ayah')}</Button>}
      {alignmentConfigured&&!shadowMicActive&&<Button size="sm" variant="outline" icon={<Mic className="w-4 h-4"/>} onClick={()=>void prepareAudio()} disabled={audioState==='requesting'}>{audioState==='requesting'?'…':(ar?'تشغيل التتبع الحي':'Start live tracking')}</Button>}
      {alignmentConfigured&&shadowMicActive&&<Badge variant="emerald">{ar?'التتبع الحي يعمل':'Live tracking on'}</Badge>}
      {secureMode&&secureRuntime?.diversityMetrics&&<span className="text-[10px] font-bold text-[#656b66]">{secureRuntime.diversityMetrics.globalUniqueCoverageGuaranteed?(ar?'سعة فريدة كافية لكل المشاركين':'Unique capacity covers the full field'):(ar?`مواضع فريدة: ${secureRuntime.diversityMetrics.eligibleUniqueStartLoci}`:`Unique starts: ${secureRuntime.diversityMetrics.eligibleUniqueStartLoci}`)}</span>}
     </div>
    </>}

    {/* ── بين موضعين، وبعد القفل ─────────────────────────────────────────── */}
    {micRecording&&questionRevealed&&!activeSession.isLocked&&activeSession.questionPhase==='TRANSITION'&&<div className="flex-1 min-h-0 grid place-content-center text-center px-4">
     <Square className="mx-auto h-6 w-6 text-[#214C40]"/>
     <div className="mt-3 text-sm font-black">{isLastQuestion?(ar?'انتهى آخر موضع. اعتمد تقييمك عندما تكون جاهزًا.':'Final passage ended. Submit when ready.'):(ar?'تم إيقاف الموضع. انتقل إلى السؤال التالي.':'Passage stopped. Move to the next question.')}</div>
     <div className="mt-4">{isLastQuestion
      ?<Button onClick={submitAndLock} icon={<Check className="w-4 h-4"/>}>{ar?'اعتماد وقفل':'Submit & lock'}</Button>
      :<Button onClick={()=>nextQuestion()} icon={<SkipForward className="w-4 h-4"/>}>{ar?'السؤال التالي':'Next question'}</Button>}</div>
    </div>}

    {activeSession.isLocked&&<div className="flex-1 min-h-0 grid place-content-center text-center px-4">
     <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#E7EEE9] text-[#214C40]"><Check className="h-5 w-5"/></span>
     <div className="mt-3 text-sm font-black text-[#214C40]">{ar?'تم اعتماد تقييمك':'Assessment locked'}</div>
     <div className="mt-1 text-[11px] text-[#5d6b64]">{ar?'تقييم بقية المحكمين يبقى مخفيًا.':'Other judge assessments remain hidden.'}</div>
     {reviewAvailable&&<div className="mt-2 text-[10px] font-black tracking-[.14em] text-[#7a6134]">{ar?'مراجعة متاحة':'REVIEW AVAILABLE'}</div>}
     {nextQueued&&<div className="mt-4"><Button onClick={()=>void callParticipant(nextQueued.id)}>{ar?'المتسابق التالي':'Next participant'}</Button></div>}
    </div>}

    {startError&&<div role="alert" className="mt-3 shrink-0 rounded-xl bg-[#F4E6E3] text-[#88473f] px-3.5 py-2.5 text-[11px] font-bold leading-5">{startError}</div>}
   </div>
  </div>

  {/* ── اللوحة: رأسٌ يحمل ما كان في الشريط، ثم الأدوات ──────────────────── */}
  <div className="mizan-judge-deck">

   {/*
    * رأس اللوحة — بديل الشريط العلوي.
    *
    * ما كان شريطًا عرضيًّا فوق المصحف صار سطرين هنا: من أمامي وحالته، وكم مضى، وأين نحن
    * من المواضع. ولم يسقط منه شيء — بل صار المصحف يملك عرض الشاشة كلَّه وارتفاعها.
    */}
   <div className="mizan-judge-brief shrink-0">
    <div className="min-w-0">
     <div className="truncate text-[15px] font-black leading-tight text-[#20241f]">{displayName||'—'}</div>
     <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <Badge variant={activeSession.isLocked?'neutral':questionRevealed?'emerald':'amber'}>{activeSession.isLocked?(ar?'مقفل':'Locked'):questionRevealed?(ar?'التلاوة جارية':'Reciting'):(ar?'مختوم':'Sealed')}</Badge>
      <span className="text-[10px] font-bold text-[#6b716c]">{ar?'الموضع':'Q'} <Ratio value={activeSession.currentQuestionIndex+1} of={totalQuestions}/></span>
      {activeSession.committee?.code&&<span className="text-[10px] font-black text-[#6b716c]" dir="ltr">{activeSession.committee.code}</span>}
     </div>
    </div>
    <div className="shrink-0 text-end">
     <div className="text-2xl font-black leading-none tabular-nums tracking-tight" dir="ltr">{formatTime(elapsed)}</div>
     <div className="mt-1 text-[10px] font-bold text-[#6b716c]">{ar?'زمن الجلسة':'Session'}</div>
    </div>
   </div>

   {/* الموضع المعروض نصًّا: يُقرأ من رأس اللوحة بلا أن يُرفع البصر عن المصحف. */}
   {questionRevealed&&q&&<div className="shrink-0 rounded-2xl border border-[#e5e3dc] bg-[#f6f5f0] px-3.5 py-2.5">
    <div className="truncate text-[13px] font-black text-[#2c322e]">{q.surahNameArabic} · {q.startAyah}–{q.endAyah}</div>
    <div className="mt-0.5 text-[10px] font-bold text-[#6b716c]">{requestedPassageLabel}</div>
   </div>}

   {/* الأدوات — لا تظهر إلا والموضع مفتوح، فلا يضغط أحدٌ على ما لا أثر له. */}
   {questionRevealed&&!activeSession.isLocked&&micRecording&&activeSession.questionPhase!=='TRANSITION'&&<>
    {policy.judging.scoreEntryMode!=='direct_score'&&<>
     <div className="mizan-judge-grid" data-cols={judgeActions.length<=4?'4':'3'} role="group" aria-label={ar?'أدوات تسجيل الملاحظات':'Scoring actions'}>{judgeActions.map(a=>{
      const Icon=iconFor(a.icon);
      const tally=countFor(a.eventType);
      const label=ar?a.shortArabic:a.shortEnglish;
      const criterion=ruleSet.criteria.find(c=>c.id===a.criterion);const criterionName=criterion?(ar?criterion.nameArabic:criterion.name):(ar?(CRITERION_AR[a.criterion]||a.criterion):a.criterion);
      return <button
        key={a.id}
        onClick={()=>recordJudgeEventWithEvidence(a.eventType,a)}
        data-flash={markedAction===a.id||undefined}
        className={`mizan-judge-action ja-${a.criterion}`}
        data-weight={a.penalty>=1?'high':a.penalty>=0.5?'mid':'low'}
        aria-label={ar
          ?`${label} — ${criterionName} — خصم ${a.penalty}${tally?` — سُجِّل ${marksAr(tally)}`:''}`
          :`${label} — ${a.criterion} — penalty ${a.penalty}${tally?` — logged ${tally} time${tally===1?'':'s'}`:''}`}
      >
        <span className="mizan-judge-icon"><Icon className="w-7 h-7"/></span>
        <span className="min-w-0">
          <span className="mizan-judge-label block truncate">{label}</span>
          <span className="mizan-judge-cost block">−{a.penalty}</span>
        </span>
        <span className="mizan-judge-head">
          {tally>0&&<span className="mizan-judge-count">{tally}</span>}
          {a.shortcut&&<kbd className="mizan-judge-key">{a.shortcut}</kbd>}
        </span>
      </button>})}
     </div>
     <div className="sr-only" role="status" aria-live="polite">{markAnnounce}</div>
    </>}

    {directMode&&<div className="space-y-2">
     <div className="text-[10px] font-black text-[#6b716c]">{ar?'درجات اختصاصك':'YOUR CRITERIA'}</div>
     {visibleCriteria.map(c=><label key={c.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#deddd6] bg-[#fffefb] px-3 py-2.5">
      <span className="min-w-0"><span className="block truncate text-[13px] font-black">{bilingualName(c,ar)}</span><span className="text-[10px] font-semibold text-[#6b716c]">{ar?'من':'of'} {c.maxScore}</span></span>
      <input aria-label={bilingualName(c,ar)} type="number" min="0" max={c.maxScore} step={policy.judging.directScoreStep||.25} value={directScores[c.id]??c.maxScore} onChange={e=>setDirectScores(v=>({...v,[c.id]:Math.min(c.maxScore,Math.max(0,Number(e.target.value)))}))} className="w-20 min-h-11 shrink-0 rounded-xl border border-[#d9d7d0] bg-white px-2 text-center text-lg font-black"/>
     </label>)}
     <div className="text-[10px] leading-5 text-[#6b716c]">{ar?'تبقى هذه الدرجات مستقلة ولا يراها بقية المحكمين قبل القفل.':'These values remain an independent judge assessment until lock.'}</div>
    </div>}

    {/* الحصيلة ثم الإنهاء: آخرُ ما تقع عليه العين، وهو آخرُ ما يُفعل. */}
    <div className="mt-auto shrink-0 space-y-2 pt-1">
     <div className="flex items-center gap-2">
      {allowUndo&&<Button shape="square" variant="outline" onClick={undoLastJudgeEvent} disabled={!activeSession.events.length} aria-label={ar?'تراجع عن آخر ملاحظة':'Undo last mark'}><RotateCcw className="w-4 h-4"/></Button>}
      <span className="text-[11px] font-bold text-[#6b716c]">{ar?notesAr(activeSession.events.length):`${activeSession.events.length} events`}{showRunningScore?` · −${deductions.toFixed(2)}`:''}</span>
     </div>
     <Button className="w-full" onClick={speakTransition} icon={<Square className="w-4 h-4"/>}>{isLastQuestion?(ar?'إنهاء آخر موضع':'End final passage'):(ar?'إنهاء الموضع':'End passage')}</Button>
    </div>
   </>}

   {/* ما دام الموضع مغلقًا، تُقال حالةُ المنتظرين بدل لوحةٍ فارغة. */}
   {(!questionRevealed||activeSession.isLocked||!micRecording)&&<div className="mt-auto shrink-0 rounded-2xl border border-[#e5e3dc] bg-[#f6f5f0] px-3.5 py-3 text-[10px] font-bold leading-5 text-[#6b716c]">
    {micGateApplies&&!micRecording
     ?(ar?'الأدوات تظهر بعد تشغيل التسجيل وفتح الموضع.':'The scoring tools appear once recording runs and the passage opens.')
     :(ar?`الأدوات تظهر بعد فتح الموضع. ${committeeQueue.length} في طابور لجنتك.`:`Scoring tools appear once the passage opens. ${committeeQueue.length} waiting in your panel queue.`)}
   </div>}
  </div>
 </div>
}

const GateState=({icon:Icon,ok,title,value}:{icon:React.ComponentType<{className?:string}>;ok:boolean;title:string;value:string})=><div className={`rounded-2xl p-4 text-start ${ok?'bg-[#E7EEE9] text-[#214C40]':'bg-[#f2f0ea] text-[#626a65]'}`}><Icon className="w-5 h-5"/><div className="text-xs font-black mt-3">{title}</div><div className="text-[10px] mt-1 opacity-75">{value}</div></div>;
const specialtyAr=(v:string)=>({memorization:'الحفظ',tajweed:'التجويد',performance:'الأداء',waqf_ibtida:'الوقف والابتداء',all:'شامل'} as Record<string,string>)[v]||v;
const formatTime=(s:number)=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
const HeadphonesEmpty=()=> <div className="w-14 h-14 rounded-2xl bg-[#E7EEE9] text-[#214C40] grid place-items-center mx-auto"><Volume2 className="w-6 h-6"/></div>;
