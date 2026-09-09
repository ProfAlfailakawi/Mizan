import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BadgeCheck, CalendarClock, CircleDot, LockKeyhole, MapPin, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { getFirestoreClient } from '../../lib/firebase';
import { sha256 } from '../../lib/crypto';
import { MizanLogo } from '../design-system/MizanLogo';
import { Button } from '../design-system/Button';
import { Badge } from '../design-system/Badge';

type Audience='participant'|'guardian';
type PublicJourney={
  organizationId:string;competitionId:string;participantId:string;audience:Audience;
  competitionName:string;competitionNameArabic:string;participantCode:string;participantName:string;participantNameArabic:string;
  status:string;arrivalSlot?:string|null;queueNumber?:number|null;venueName?:string|null;
  committee?:{code:string;name:string;nameArabic:string;hall?:string|null}|null;
  result?:{score:number;rank:number;status:string}|null;certificate?:{number:string;verificationUrl?:string}|null;
  revoked?:boolean;updatedAt:string;
};

const tokenFromHash=()=>{try{const q=window.location.hash.split('?')[1]||'';return new URLSearchParams(q).get('key')||''}catch{return''}};
const statusIndex=(s:string)=>{
  const order=['submitted','under_review','approved','checked_in','in_queue','in_session','tested','appealed','certified'];
  return Math.max(0,order.indexOf(s));
};
const stepLabel=(i:number,ar:boolean)=>{
  const arLabels=['تم استلام الطلب','المراجعة','تم الاعتماد','الحضور','الانتظار','التحكيم','اكتمل التحكيم','اعتراض','النتيجة/الشهادة'];
  const enLabels=['Application received','Review','Approved','Check-in','Waiting','Judging','Judging complete','Appeal','Result / certificate'];
  return (ar?arLabels:enLabels)[i];
};

export const JourneyAccess:React.FC<{audience:Audience}>=({audience})=>{
  const {competition,language}=useAppStore();const ar=language==='ar';const Arrow=ar?ArrowLeft:ArrowRight;
  const storageKey=`mizan_public_${audience}_${competition.id}`;
  const [token,setToken]=useState(()=>tokenFromHash()||localStorage.getItem(storageKey)||'');
  const [input,setInput]=useState(()=>tokenFromHash()||'');const [journey,setJourney]=useState<PublicJourney|null>(null);const [loading,setLoading]=useState(false);const [error,setError]=useState('');
  const closed=['completed','archived'].includes(competition.status);
  const load=async(raw:string)=>{const clean=raw.trim();if(!clean)return;setLoading(true);setError('');try{const key=await sha256(clean);const {db,doc,getDoc}=await getFirestoreClient();const snap=await getDoc(doc(db,'public_journeys',key));if(!snap.exists())throw new Error('NOT_FOUND');const data=snap.data() as PublicJourney;if(data.competitionId!==competition.id||data.audience!==audience||data.revoked)throw new Error('REVOKED');setJourney(data);setToken(clean);localStorage.setItem(storageKey,clean)}catch(e){setJourney(null);setError(e instanceof Error&&e.message==='REVOKED'?(ar?'هذا الرابط لم يعد صالحًا.':'This access link is no longer valid.'):(ar?'لم نعثر على رحلة بهذا الرمز. تأكد من الرابط أو اطلب بطاقة جديدة من الجهة.':'We could not find a journey for this code. Check the link or ask the organizer for a new pass.'))}finally{setLoading(false)}};
  useEffect(()=>{if(token&&!closed)void load(token)},[competition.id]);
  const idx=journey?statusIndex(journey.status):0;
  const next=useMemo(()=>journey&&idx<8?stepLabel(idx+1,ar):null,[journey,idx,ar]);

  if(closed)return <Closed ar={ar}/>;
  return <div className="min-h-screen bg-[#FAF8F2] text-[#171B18]" dir={ar?'rtl':'ltr'}>
    <header className="border-b border-[#e5dfd0] bg-[#FAF8F2]/95"><div className="max-w-4xl mx-auto h-16 px-4 flex items-center justify-between"><MizanLogo language={language} compact/><a href={`#competition?comp=${competition.id}`} className="text-xs font-black text-[#214C40] inline-flex items-center gap-2"><Arrow className="w-4 h-4"/>{ar?'واجهة المسابقة':'Competition page'}</a></div></header>
    <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
      {!journey?<section className="mizan-surface max-w-xl mx-auto p-6 sm:p-8 text-center"><div className="mx-auto w-14 h-14 rounded-2xl bg-[#E7EEE9] text-[#214C40] grid place-items-center">{audience==='guardian'?<UsersRound className="w-6 h-6"/>:<UserRound className="w-6 h-6"/>}</div><div className="mizan-kicker mt-5">{audience==='guardian'?(ar?'دخول ولي الأمر':'GUARDIAN ACCESS'):(ar?'رحلة المتسابق':'PARTICIPANT JOURNEY')}</div><h1 className="text-2xl font-black mt-2">{audience==='guardian'?(ar?'تابع ابنك بلا حساب وكلمة مرور':'Follow the journey without an account'):(ar?'وين وصلت؟ كل شيء هنا':'See exactly where you are')}</h1><p className="text-xs text-[#636864] leading-6 mt-3">{ar?'استخدم رمز الرحلة الخاص الذي أرسلته الجهة. الجهاز يتذكره بعد أول مرة، ولا تحتاج إلى إنشاء حساب أو كلمة مرور.':'Use the private journey code sent by the organizer. This device remembers it after the first use; no account or password is required.'}</p><div className="mt-6 flex gap-2"><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void load(input)}} className="mizan-input flex-1" dir="ltr" placeholder={ar?'رمز الرحلة الخاص':'Private journey code'}/><Button disabled={!input.trim()||loading} onClick={()=>void load(input)}>{loading?'…':(ar?'دخول':'Open')}</Button></div>{error&&<div role="alert" className="mt-4 rounded-xl bg-[#F4E6E3] text-[#87483f] p-3 text-xs font-bold">{error}</div>}<div className="mt-5 flex items-center justify-center gap-2 text-[10px] text-[#68706b]"><LockKeyhole className="w-4 h-4"/>{ar?'الرمز طويل وغير قابل للتخمين ويمكن للجهة إلغاؤه وإصدار بديل.':'The opaque code can be revoked and replaced by the organizer.'}</div></section>:
      <div className="space-y-4"><section className="mizan-surface p-6 sm:p-8"><div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5"><div><div className="mizan-kicker">{audience==='guardian'?(ar?'متابعة ولي الأمر':'GUARDIAN VIEW'):(ar?'رحلتي في المسابقة':'MY JOURNEY')}</div><h1 className="text-2xl sm:text-3xl font-black mt-2">{ar?journey.participantNameArabic:journey.participantName}</h1><div className="text-xs text-[#636864] mt-2">{journey.participantCode} · {ar?journey.competitionNameArabic:journey.competitionName}</div></div><Badge variant="emerald">{stepLabel(idx,ar)}</Badge></div>{next&&<div className="mt-6 rounded-2xl bg-[#E7EEE9] text-[#214C40] p-4"><div className="text-[10px] font-black">{ar?'الخطوة التالية':'NEXT'}</div><div className="font-black mt-1">{next}</div></div>}</section>
      <section className="mizan-surface p-5 sm:p-6"><div className="text-sm font-black">{ar?'مسار الرحلة':'Journey timeline'}</div><div className="mt-5 overflow-x-auto pb-2"><div className="min-w-[720px] flex items-start">{Array.from({length:9},(_,i)=><React.Fragment key={i}><div className="w-20 shrink-0 text-center"><div className={`mx-auto w-9 h-9 rounded-xl grid place-items-center ${i<idx?'bg-[#214C40] text-white':i===idx?'bg-[#E8CB93] text-[#183a31]':'bg-[#f0eee8] text-[#656b66]'}`}>{i<idx?<BadgeCheck className="w-4 h-4"/>:<span className="text-xs font-black">{i+1}</span>}</div><div className="mt-2 text-[9px] leading-4 font-bold">{stepLabel(i,ar)}</div></div>{i<8&&<div className={`h-px flex-1 mt-[18px] ${i<idx?'bg-[#214C40]':'bg-[#ddd9d0]'}`}/>}</React.Fragment>)}</div></div></section>
      <section className="grid sm:grid-cols-3 gap-3"><Info icon={CalendarClock} label={ar?'الموعد':'Time'} value={journey.arrivalSlot|| (ar?'لم يحدد بعد':'Not assigned yet')}/><Info icon={MapPin} label={ar?'المكان':'Location'} value={journey.committee?.hall||journey.venueName|| (ar?'لم يحدد بعد':'Not assigned yet')}/><Info icon={CircleDot} label={ar?'الدور':'Queue'} value={journey.queueNumber?String(journey.queueNumber):(ar?'لم يحدد بعد':'Not assigned yet')}/></section>
      {journey.committee&&<section className="mizan-surface p-5"><div className="text-[10px] font-black text-[#656b66]">{ar?'اللجنة':'PANEL'}</div><div className="font-black mt-1">{journey.committee.code} · {ar?journey.committee.nameArabic:journey.committee.name}</div></section>}
      {journey.result&&<section className="mizan-surface p-6 text-center"><ShieldCheck className="w-7 h-7 text-[#2F6555] mx-auto"/><div className="mizan-kicker mt-3">{ar?'النتيجة المعتمدة':'PUBLISHED RESULT'}</div><div className="text-4xl font-black mt-2">{journey.result.score}</div><div className="text-xs text-[#636864] mt-2">{ar?'الترتيب':'Rank'} #{journey.result.rank}</div>{journey.certificate&&<button onClick={()=>window.location.hash=`verify?certificate=${encodeURIComponent(journey.certificate!.number)}`} className="mt-5 min-h-11 px-4 rounded-xl border border-[#d9dfdb] text-xs font-black text-[#214C40]">{ar?'التحقق من الشهادة':'Verify certificate'}</button>}</section>}
      <div className="text-center"><button onClick={()=>{localStorage.removeItem(storageKey);setJourney(null);setToken('');setInput('')}} className="min-h-11 px-4 text-xs font-bold text-[#6b716d]">{ar?'استخدام بطاقة رحلة أخرى':'Use another journey pass'}</button></div></div>}
    </main>
  </div>;
};

const Info=({icon:Icon,label,value}:{icon:React.ComponentType<{className?:string}>;label:string;value:string})=><div className="mizan-surface p-4"><Icon className="w-4 h-4 text-[#2F6555]"/><div className="text-[10px] text-[#656b66] mt-3">{label}</div><div className="text-sm font-black mt-1">{value}</div></div>;
const Closed=({ar}:{ar:boolean})=><div className="min-h-screen bg-[#FAF8F2] grid place-items-center p-5" dir={ar?'rtl':'ltr'}><div className="mizan-surface max-w-md p-8 text-center"><LockKeyhole className="w-8 h-8 text-[#214C40] mx-auto"/><h1 className="text-2xl font-black mt-4">{ar?'انتهت المسابقة وأُغلق الدخول':'Competition access is closed'}</h1><p className="text-xs text-[#636864] leading-6 mt-3">{ar?'أوقفت الجهة كل روابط الدخول والتشغيل. تبقى النتائج المنشورة والتحقق من الشهادات عبر الواجهة العامة فقط.':'The organizer closed all journey and operational access. Published results and public certificate verification remain separate.'}</p></div></div>;
