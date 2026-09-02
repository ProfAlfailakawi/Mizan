import React,{useMemo,useState} from 'react';
import {ArrowLeft,ArrowRight,BadgeCheck,Building2,Gavel,ShieldCheck,Sparkles,UsersRound} from 'lucide-react';
import {useAppStore} from '../../lib/store';
import {MizanLogo,MizanMark} from '../design-system/MizanLogo';

const STORAGE_KEY='mizan_onboarding_quiet_v2';
export const onboardingWasSeen=()=>{try{return localStorage.getItem(STORAGE_KEY)==='1'}catch{return false}};
export const markOnboardingSeen=()=>{try{localStorage.setItem(STORAGE_KEY,'1')}catch{}};

export const OnboardingExperience:React.FC<{onDone:()=>void}>=({onDone})=>{
 const {language}=useAppStore();const ar=language==='ar';const [step,setStep]=useState(0);const Back=ar?ArrowRight:ArrowLeft;const Next=ar?ArrowLeft:ArrowRight;
 const slides=useMemo(()=>ar?[
  {eyebrow:'بداية هادئة',title:'أهلًا بك في ميزان',body:'منصة واحدة تدير المسابقة من المصدر القرآني إلى الشهادة، مع بقاء التعقيد في الخلفية.',kind:'welcome' as const},
  {eyebrow:'نزاهة السؤال',title:'السؤال يبقى سرًا حتى اللحظة الصحيحة',body:'لا يُكشف موضع الاختبار إلا بعد حضور المتسابق واكتمال موافقة اللجنة، ولا يرى التشغيل نص السؤال.',kind:'custody' as const},
  {eyebrow:'جاهزية المسابقة',title:'كل ما يحتاجه يوم المسابقة في مسار واحد',body:'الأدوار، الاستمرارية، النزاهة، والتحكيم تعمل معًا من دون ازدحام الواجهة.',kind:'ready' as const}
 ]:[
  {eyebrow:'Quiet start',title:'Welcome to MIZAN',body:'One platform from approved Quran source to certificate, with complexity kept beneath the surface.',kind:'welcome' as const},
  {eyebrow:'Question integrity',title:'The question stays sealed until the right moment',body:'The passage is revealed only after participant presence and panel quorum.',kind:'custody' as const},
  {eyebrow:'Competition readiness',title:'One calm flow for competition day',body:'Roles, continuity, integrity and judging work together without interface clutter.',kind:'ready' as const}
 ],[ar]);
 const s=slides[step];const finish=()=>{markOnboardingSeen();onDone()};
 return <div className="fixed inset-0 z-[120] overflow-y-auto bg-[#F8F5ED] text-[#18211D] font-arabic" dir={ar?'rtl':'ltr'}>
  <div className="min-h-screen max-w-[1280px] mx-auto px-5 sm:px-8 py-6 sm:py-9 flex flex-col">
   <header className="flex items-center justify-between gap-4"><MizanLogo language={language} compact/><button onClick={finish} className="rounded-full px-4 py-2 text-[11px] font-black text-[#6E746F] hover:bg-white/70">{ar?'تخطي مؤقتًا':'Skip for now'}</button></header>
   <main className="flex-1 grid place-items-center py-10"><div className="w-full grid lg:grid-cols-[.82fr_1.18fr] gap-9 lg:gap-16 items-center">
    <div className="order-2 lg:order-1 max-w-xl"><div className="text-[10px] font-black tracking-[.16em] text-[#8C724D]">{s.eyebrow}</div><h1 className="mt-4 text-[36px] sm:text-[52px] lg:text-[62px] leading-[1.08] font-black tracking-[-.045em] text-[#142C25]">{s.title}</h1><p className="mt-5 text-sm sm:text-base leading-8 text-[#6A716D] max-w-lg">{s.body}</p>
     <div className="mt-8"><SlideDetails kind={s.kind} ar={ar}/></div>
     <div className="mt-10 flex items-center gap-3"><button onClick={()=>step===slides.length-1?finish():setStep(step+1)} className="min-w-[180px] h-12 rounded-2xl bg-[#174B3F] px-5 text-sm font-black text-white shadow-[0_10px_30px_rgba(23,75,63,.12)] inline-flex items-center justify-center gap-2">{step===slides.length-1?(ar?'ابدأ الإعداد':'Start setup'):(ar?'التالي':'Next')}<Next className="w-4 h-4"/></button>{step>0&&<button onClick={()=>setStep(step-1)} className="h-12 rounded-2xl px-5 text-sm font-black text-[#5B625E] hover:bg-white/70 inline-flex items-center gap-2"><Back className="w-4 h-4"/>{ar?'السابق':'Back'}</button>}</div>
    </div>
    <div className="order-1 lg:order-2"><HeroVisual kind={s.kind} ar={ar}/></div>
   </div></main>
   <footer className="flex items-center justify-between gap-5"><div className="flex items-center gap-2">{slides.map((_,i)=><button key={i} onClick={()=>setStep(i)} aria-label={ar?`الخطوة ${i+1}`:`Step ${i+1}`} className={`h-2 rounded-full transition-all ${i===step?'w-9 bg-[#174B3F]':'w-2 bg-[#D7D4CA]'}`}/>)}</div><div className="text-[10px] text-[#929690]">{ar?`الخطوة ${step+1} من ${slides.length}`:`Step ${step+1} of ${slides.length}`}</div></footer>
  </div>
 </div>
}

const HeroVisual:React.FC<{kind:'welcome'|'custody'|'ready';ar:boolean}>=({kind,ar})=><div className="relative mx-auto aspect-[1.03] w-full max-w-[570px] rounded-[44px] border border-white/80 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,.95),rgba(243,238,226,.72)_58%,rgba(235,230,217,.75))] shadow-[0_30px_80px_rgba(31,48,41,.07)] overflow-hidden">
 <div className="absolute inset-0 opacity-[.34]" style={{backgroundImage:'radial-gradient(circle at 1px 1px, rgba(32,76,64,.10) 1px, transparent 0)',backgroundSize:'28px 28px'}}/>
 <div className="absolute inset-0 grid place-items-center"><div className="relative w-[72%] aspect-square rounded-full bg-white/55 border border-white shadow-[0_20px_70px_rgba(28,64,53,.06)] grid place-items-center">
  {kind==='welcome'?<><MizanMark className="w-[54%] h-[54%]" decorative/><div className="absolute bottom-[17%] flex gap-2"><SoftPill icon={Building2} text={ar?'المؤسسة':'Organization'}/><SoftPill icon={Gavel} text={ar?'المسابقة':'Competition'}/><SoftPill icon={UsersRound} text={ar?'اللجان':'Panels'}/></div></>:kind==='custody'?<><div className="w-[44%] aspect-[1.28] rounded-[28px] border border-[#DAD5C9] bg-[#FFFDF8] shadow-[0_18px_45px_rgba(40,45,39,.08)] grid place-items-center"><ShieldCheck className="w-16 h-16 text-[#174B3F]"/></div><div className="absolute bottom-[14%] flex gap-2"><StateDot label={ar?'المتسابق حاضر':'Present'}/><StateDot label={ar?'النصاب مكتمل':'Quorum'}/><StateDot label={ar?'السؤال مختوم':'Sealed'}/></div></>:<><div className="grid grid-cols-2 gap-3 w-[62%]"><ReadyTile icon={BadgeCheck} label={ar?'المصدر المعتمد':'Approved source'}/><ReadyTile icon={UsersRound} label={ar?'الأدوار':'Roles'}/><ReadyTile icon={Sparkles} label={ar?'الاستمرارية':'Continuity'}/><ReadyTile icon={ShieldCheck} label={ar?'إثبات النزاهة':'Integrity proof'}/></div></>}
 </div></div>
</div>

const SoftPill=({icon:Icon,text}:{icon:any;text:string})=><div className="rounded-full bg-[#F5F2EA]/90 border border-white px-3 py-2 text-[9px] font-black text-[#58635D] flex items-center gap-1.5"><Icon className="w-3.5 h-3.5 text-[#2F6656]"/>{text}</div>;
const StateDot=({label}:{label:string})=><div className="rounded-full bg-white/90 border border-[#E2DED3] px-3 py-2 text-[9px] font-black text-[#53615A] flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#2E6A58]"/>{label}</div>;
const ReadyTile=({icon:Icon,label}:{icon:any;label:string})=><div className="min-h-24 rounded-[24px] bg-white/80 border border-white shadow-[0_8px_30px_rgba(31,55,47,.05)] grid place-items-center text-center p-3"><Icon className="w-5 h-5 text-[#275C4E]"/><div className="text-[10px] font-black text-[#425149]">{label}</div></div>;
const SlideDetails=({kind,ar}:{kind:'welcome'|'custody'|'ready';ar:boolean})=>kind==='welcome'?<div className="flex flex-wrap gap-2 text-[11px] font-black text-[#4F5D56]"><span className="onboarding-chip">{ar?'إعداد مرة واحدة':'One-time setup'}</span><span className="onboarding-chip">{ar?'يتكيف مع الدور':'Role aware'}</span><span className="onboarding-chip">{ar?'يعمل دون ازدحام':'Low clutter'}</span></div>:kind==='custody'?<div className="grid sm:grid-cols-3 gap-2"><StateLine n="01" text={ar?'حضور المتسابق':'Presence'}/><StateLine n="02" text={ar?'موافقة اللجنة':'Panel approval'}/><StateLine n="03" text={ar?'كشف موثق':'Audited reveal'}/></div>:<div className="rounded-2xl border border-[#E3DFD4] bg-white/65 px-4 py-3 text-xs font-bold text-[#59635D] flex items-center gap-2"><BadgeCheck className="w-4 h-4 text-[#2E6656]"/>{ar?'جاهز لبناء المسابقة خطوة بخطوة':'Ready to build the competition step by step'}</div>;
const StateLine=({n,text}:{n:string;text:string})=><div className="rounded-2xl border border-[#E4E0D6] bg-white/55 px-3 py-3"><div className="text-[9px] font-black text-[#A18358]">{n}</div><div className="mt-1 text-[11px] font-black text-[#4B5751]">{text}</div></div>;
