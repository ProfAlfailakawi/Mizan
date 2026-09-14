import React, { useEffect, useRef, useState } from 'react';
import { useDialogBehavior } from '../../lib/useDialogBehavior';
import { Camera, Check, Keyboard, QrCode, ScanLine, X } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { Button } from '../design-system/Button';
import { Participant } from '../../types';
import { TearOffQueueTicket } from '../design-system/TearOffQueueTicket';
import { useBrandName } from '../design-system/MizanLogo';
import { bilingualName } from '../../lib/ui-language';
import { parseMizanPassPayload } from '../design-system/RealQRCode';
import jsQR from 'jsqr';

export const KioskMode: React.FC<{onClose?:()=>void}> = ({onClose}) => {
 // Full-screen venue modes open over the app, but had no Escape and no dialog
 // semantics: a keyboard or screen-reader user had no way back out.
 const venueRef = useRef<HTMLDivElement|null>(null);
 useDialogBehavior(!!onClose, onClose||(()=>{}), venueRef, {autoFocus:false});
 const {language,checkInParticipant,verifyOfflineJourneyPass,committees,competition,participants}=useAppStore(); const ar=language==='ar';
 /*
  * البوابة تحمل اسم المسابقة، لا اسم المنصّة.
  *
  * كانت تقول «بوابة ميزان» ثابتةً، وتذيّل الشاشة بـ«ميزان · تشغيل هادئ». والمتسابق لا
  * يعرف ميزان ولا يعنيه: هو جاء إلى مسابقةٍ باسمها، والجهة التي تنظّمها اشترت أن تظهر
  * باسمها هي. فصار العنوان اسم المسابقة، والشعار شعارها أو شعار الجهة، وحرف الشارة أوّل
  * حرفٍ من ذلك الاسم — ولا يبقى في الشاشة اسم منصّةٍ يزاحم اسم صاحب القاعة.
  */
 const brand=useBrandName();
 const gateTitle=bilingualName(competition,ar)||(ar?brand.ar:brand.en);
 const gateMark=(gateTitle.trim()[0]||'').toUpperCase();
 const [code,setCode]=useState(''); const [done,setDone]=useState<Participant|null>(null); const [error,setError]=useState(false); const [errorReason,setErrorReason]=useState('');
 const [camera,setCamera]=useState<'idle'|'starting'|'active'|'unsupported'|'denied'>('idle');
 const videoRef=useRef<HTMLVideoElement|null>(null); const streamRef=useRef<MediaStream|null>(null); const scanTimer=useRef<number|undefined>(undefined);
 const stopCamera=()=>{if(scanTimer.current)window.clearTimeout(scanTimer.current);scanTimer.current=undefined;streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;setCamera(current=>current==='active'||current==='starting'?'idle':current)};
 const finishCheckIn=(p:Participant|null)=>{
  /* checkInParticipant deliberately returns the original record for rejected states. The kiosk
     must not turn that into a green welcome screen merely because the participant exists. */
  if(p&&['checked_in','in_queue','in_session'].includes(p.status)){setDone(p);setError(false);setErrorReason('');setCode('');stopCamera();return true;}
  setError(true);setErrorReason('PARTICIPANT_NOT_ELIGIBLE');
  console.warn('MIZAN kiosk check-in refused','PARTICIPANT_NOT_ELIGIBLE');
  return false;
 };
 const submit=async(raw=code)=>{
  const scanned=parseMizanPassPayload(raw);
  /* Printed participant cards intentionally contain the short MZ1|A-123 arrival code. It is a
     roster lookup, not an offline trust credential: accept it only when it resolves exactly inside
     the competition already selected on this kiosk. Signed offline journey passes still use the
     cryptographic verifier below. */
  const roster=participants.filter(p=>p.competitionId===competition.id);
  const direct=roster.find(p=>p.id===scanned||p.code.trim().toLowerCase()===scanned.toLowerCase());
  if(direct){finishCheckIn(checkInParticipant(direct.id,'kiosk_qr'));return;}

  const checked=await verifyOfflineJourneyPass(raw);
  if(!checked.valid){console.warn('MIZAN kiosk pass rejected',checked.reason);setError(true);setErrorReason(checked.reason);return;}
  finishCheckIn(checkInParticipant(checked.payload.participantToken,'kiosk_qr'));
 };
 const startCamera=async()=>{
  if(!navigator.mediaDevices?.getUserMedia){setCamera('unsupported');return;}
  setCamera('starting');setError(false);setErrorReason('');
  try{
   const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});streamRef.current=stream;
   /* The video must already be mounted while permission is pending. This matters on iPad/Safari,
      where assigning a stream to a ref that was conditionally absent made the camera look broken. */
   await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
   const video=videoRef.current;
   if(!video)throw new Error('CAMERA_VIDEO_NOT_MOUNTED');
   video.srcObject=stream;await video.play();

   const Detector=(window as any).BarcodeDetector;
   let detector:any=null;
   if(Detector){
    try{
     const formats=typeof Detector.getSupportedFormats==='function'?await Detector.getSupportedFormats():['qr_code'];
     if(!Array.isArray(formats)||formats.includes('qr_code'))detector=new Detector({formats:['qr_code']});
    }catch{/* Safari/iPad fallback below is intentionally independent of BarcodeDetector. */}
   }
   setCamera('active');
   const canvas=document.createElement('canvas');
   const tick=async()=>{
    if(!streamRef.current||!videoRef.current)return;
    let decoded='';
    if(detector){
     try{const hits=await detector.detect(videoRef.current);decoded=String(hits?.[0]?.rawValue||'')}catch{/* fall through to the JS decoder */}
    }
    if(!decoded&&videoRef.current.readyState>=2&&videoRef.current.videoWidth&&videoRef.current.videoHeight){
     const vw=videoRef.current.videoWidth;const vh=videoRef.current.videoHeight;const scale=Math.min(1,720/Math.max(vw,vh));
     canvas.width=Math.max(1,Math.round(vw*scale));canvas.height=Math.max(1,Math.round(vh*scale));
     const ctx=canvas.getContext('2d',{willReadFrequently:true});
     if(ctx){
      ctx.drawImage(videoRef.current,0,0,canvas.width,canvas.height);
      const frame=ctx.getImageData(0,0,canvas.width,canvas.height);
      const hit=jsQR(frame.data,frame.width,frame.height,{inversionAttempts:'attemptBoth'});
      decoded=hit?.data||'';
     }
    }
    if(decoded){void submit(decoded);return;}
    scanTimer.current=window.setTimeout(tick,detector?220:320);
   };
   void tick();
  }catch(error){
   console.warn('MIZAN kiosk camera unavailable',error);
   setCamera(error instanceof DOMException&&error.name==='NotAllowedError'?'denied':'unsupported');
   streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;
  }
 };
 useEffect(()=>()=>stopCamera(),[]);
 useEffect(()=>{if(!done)return;const t=setTimeout(()=>{setDone(null);setCode('');setError(false)},4500);return()=>clearTimeout(t)},[done]);
 const committee=done?committees.find(c=>c.competitionId===done.competitionId&&c.id===done.assignedCommitteeId):null;
 // A kiosk stands in front of families: a fabricated ticket number is worse than
 // no ticket, and a raw enum tells them nothing. Both are stated or omitted honestly.
 const ticketNumber=done?(done.originalQueueNumber||done.queueNumber||0):0;
 const reasonSentence=(r:string)=>{
  const map:Record<string,[string,string]>={
   NOT_FOUND:['لم نجد هذا الكود في كشف اليوم.','This code is not on today\u2019s roster.'],
   REVOKED:['هذه البطاقة أُلغيت وتحتاج بديلًا.','This pass was revoked and needs a replacement.'],
   TRUST_KEY_NOT_CACHED:['الجهاز لم يُحمّل مفاتيح التحقق بعد.','This device has not loaded its verification keys yet.'],
   NO_SELECTION:['لا توجد مسابقة مفعّلة على هذا الجهاز.','No competition is active on this device.'],
   PARTICIPANT_NOT_ELIGIBLE:['المتسابق غير مؤهَّل للدخول الآن.','This participant is not eligible to check in right now.'],
  };
  const hit=map[r];
  return hit?(ar?hit[0]:hit[1]):(ar?'تعذّر التحقق من البطاقة.':'We could not verify this pass.');
 };
 return <div ref={venueRef} role={onClose?"dialog":undefined} aria-modal={onClose?true:undefined} aria-label={ar?'بوابة الحضور':'Gate kiosk'} className="fixed inset-0 z-50 mizan-venue text-white p-5 sm:p-8 flex flex-col">
   <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3 min-w-0">{brand.logoUrl
     ?<img src={brand.logoUrl} alt="" className="w-10 h-10 rounded-xl object-contain bg-white/8 border border-white/10 p-1 shrink-0"/>
     :<span aria-hidden className="w-10 h-10 rounded-xl bg-white/8 border border-white/10 grid place-items-center font-black text-[#dbe7df] shrink-0">{gateMark}</span>}
    <div className="min-w-0"><div className="font-black truncate">{gateTitle}</div><div className="text-[10px] text-white/50">{ar?'حضور ذاتي':'Self check-in'}</div></div></div>{onClose&&<button onClick={()=>{stopCamera();onClose()}} className="w-11 h-11 rounded-xl grid place-items-center hover:bg-white/10 text-white/60" aria-label={ar?'إغلاق':'Close'}><X className="w-5 h-5"/></button>}</div>
   <div className="my-auto max-w-lg w-full mx-auto">
    {!done?<div className="text-center">
      <div className="w-52 h-52 rounded-[32px] border border-white/15 bg-white/[.035] grid place-items-center mx-auto relative overflow-hidden">
       {(camera==='active'||camera==='starting')?<video ref={videoRef} muted playsInline className="absolute inset-0 w-full h-full object-cover" aria-label={ar?'كاميرا مسح رمز الاستجابة السريعة':'QR scanner camera'}/>:<><QrCode className="w-20 h-20 text-[#b9cec4] stroke-[1.3]"/><span className="absolute start-7 end-7 h-px bg-[#b9cec4]/60"/></>}
       {(camera==='active'||camera==='starting')&&<span className="absolute inset-5 rounded-2xl border border-white/70 pointer-events-none"/>}
      </div>
      <h1 className="text-3xl font-black mt-7">{ar?'امسح بطاقتك':'Scan your pass'}</h1>
      <div className="mt-6 flex justify-center"><Button variant="secondary" disabled={camera==='starting'} onClick={camera==='active'?stopCamera:startCamera} icon={<Camera className="w-4 h-4"/>}>{camera==='starting'?(ar?'جارٍ تشغيل الكاميرا…':'Starting camera…'):camera==='active'?(ar?'إيقاف الكاميرا':'Stop camera'):(ar?'تشغيل الكاميرا':'Use camera')}</Button></div>
      {(camera==='unsupported'||camera==='denied')&&<p className="text-xs mizan-venue-muted mt-3">{camera==='unsupported'?(ar?'الكاميرا غير مدعومة هنا. استخدم قارئ USB أو الكود.':'Camera scanning is unavailable here. Use a USB scanner or code.'):(ar?'لم تُمنح صلاحية الكاميرا. استخدم القارئ أو الكود.':'Camera permission was not granted. Use a scanner or code.')}</p>}
      <div className="mt-5 max-w-sm mx-auto"><div className="flex gap-2"><div className="relative flex-1"><Keyboard className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 mizan-venue-muted"/><input value={code} onChange={e=>{setCode(e.target.value);setError(false)}} onKeyDown={e=>{if(e.key==='Enter')void submit()}} placeholder={ar?'الكود / قارئ USB':'Code / USB scanner'} className="mizan-input-dark mizan-input-icon-start text-sm"/></div><Button variant="secondary" disabled={!code.trim()} onClick={()=>void submit()} icon={<ScanLine className="w-4 h-4"/>}>{ar?'دخول':'Go'}</Button></div>{error&&<div role="alert" className="mt-2 text-sm font-bold text-[#e3afa7]">{reasonSentence(errorReason)} {ar?'مكتب الاستثناء يساعدك.':'Use the exception desk.'}</div>}</div>
     </div>
    :<div className="rounded-[32px] border border-white/12 bg-white/[.055] p-8 text-center"><span className="w-16 h-16 rounded-full bg-[#dbe7df] text-[#214C40] grid place-items-center mx-auto"><Check className="w-8 h-8"/></span><div className="mizan-kicker !mizan-venue-muted mt-6">{done.code}</div><h1 className="text-2xl sm:text-3xl font-black mt-2">{ar?`أهلًا ${done.fullNameArabic}`:`Welcome ${done.fullName}`}</h1>{!!ticketNumber&&<div className="mt-5 rounded-[26px] bg-[#f8f6ef] text-[#17352c] p-2 overflow-hidden"><TearOffQueueTicket number={ticketNumber} committee={committee?.code} ar={ar} compact/></div>}{(!!done.queueNumber||!!committee)&&<div className={`mt-3 grid gap-3 ${done.queueNumber&&committee?'grid-cols-2':'grid-cols-1'}`}>{!!done.queueNumber&&<div className="rounded-2xl bg-black/10 p-4"><div className="text-[10px] mizan-venue-muted">{ar?'أمامك':'Ahead'}</div><div className="text-3xl font-black mt-1">{Math.max(0,done.queueNumber-1)}</div></div>}{!!committee&&<div className="rounded-2xl bg-black/10 p-4"><div className="text-[10px] mizan-venue-muted">{ar?'اللجنة':'Committee'}</div><div className="text-lg font-black mt-2">{committee.code}</div></div>}</div>}</div>}
   </div>
 </div>
}
