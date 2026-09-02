import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, Keyboard, QrCode, ScanLine, X } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { Button } from '../design-system/Button';
import { Participant } from '../../types';

export const KioskMode: React.FC<{onClose?:()=>void}> = ({onClose}) => {
 const {language,checkInParticipant,verifyOfflineJourneyPass,committees}=useAppStore(); const ar=language==='ar';
 const [code,setCode]=useState(''); const [done,setDone]=useState<Participant|null>(null); const [error,setError]=useState(false); const [errorReason,setErrorReason]=useState('');
 const [camera,setCamera]=useState<'idle'|'starting'|'active'|'unsupported'|'denied'>('idle');
 const videoRef=useRef<HTMLVideoElement|null>(null); const streamRef=useRef<MediaStream|null>(null); const scanTimer=useRef<number|undefined>(undefined);
 const stopCamera=()=>{if(scanTimer.current)window.clearTimeout(scanTimer.current);scanTimer.current=undefined;streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;if(camera==='active'||camera==='starting')setCamera('idle')};
 const submit=async(raw=code)=>{const checked=await verifyOfflineJourneyPass(raw);if(!checked.valid){setError(true);setErrorReason(checked.reason);return;}const p=checkInParticipant(checked.payload.participantToken,'kiosk_qr');if(p){setDone(p);setError(false);setErrorReason('');setCode('');stopCamera()}else{setError(true);setErrorReason('PARTICIPANT_NOT_ELIGIBLE')}};
 const startCamera=async()=>{
  const Detector=(window as any).BarcodeDetector;
  if(!Detector||!navigator.mediaDevices?.getUserMedia){setCamera('unsupported');return;}
  setCamera('starting');setError(false);
  try{
   const formats=typeof Detector.getSupportedFormats==='function'?await Detector.getSupportedFormats():['qr_code'];
   if(Array.isArray(formats)&&!formats.includes('qr_code')){setCamera('unsupported');return;}
   const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});streamRef.current=stream;
   if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play();}
   setCamera('active');const detector=new Detector({formats:['qr_code']});
   const tick=async()=>{if(!streamRef.current||!videoRef.current)return;try{const hits=await detector.detect(videoRef.current);const raw=hits?.[0]?.rawValue;if(raw){void submit(String(raw));return;}}catch{/* keep manual path available */}scanTimer.current=window.setTimeout(tick,220)};void tick();
  }catch{setCamera('denied');streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;}
 };
 useEffect(()=>()=>stopCamera(),[]);
 useEffect(()=>{if(!done)return;const t=setTimeout(()=>{setDone(null);setCode('');setError(false)},4500);return()=>clearTimeout(t)},[done]);
 const committee=done?committees.find(c=>c.id===done.assignedCommitteeId):null;
 return <div className="fixed inset-0 z-50 bg-[#16241f] text-white bg-islamic-subtle p-5 sm:p-8 flex flex-col">
   <div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="w-10 h-10 rounded-xl bg-white/8 border border-white/10 grid place-items-center font-black text-[#dbe7df]">م</span><div><div className="font-black">MIZAN Gate</div><div className="text-[10px] text-white/50">{ar?'حضور ذاتي':'Self check-in'}</div></div></div>{onClose&&<button onClick={()=>{stopCamera();onClose()}} className="w-11 h-11 rounded-xl grid place-items-center hover:bg-white/10 text-white/60" aria-label={ar?'إغلاق':'Close'}><X className="w-5 h-5"/></button>}</div>
   <div className="my-auto max-w-lg w-full mx-auto">
    {!done?<div className="text-center">
      <div className="w-52 h-52 rounded-[32px] border border-white/15 bg-white/[.035] grid place-items-center mx-auto relative overflow-hidden">
       {camera==='active'?<video ref={videoRef} muted playsInline className="absolute inset-0 w-full h-full object-cover" aria-label={ar?'كاميرا مسح رمز QR':'QR scanner camera'}/>:<><QrCode className="w-20 h-20 text-[#b9cec4] stroke-[1.3]"/><span className="absolute start-7 end-7 h-px bg-[#b9cec4]/60"/></>}
       {camera==='active'&&<span className="absolute inset-5 rounded-2xl border border-white/70 pointer-events-none"/>}
      </div>
      <h1 className="text-3xl font-black mt-7">{ar?'امسح بطاقتك':'Scan your pass'}</h1>
      <div className="mt-6 flex justify-center"><Button variant="secondary" onClick={camera==='active'?stopCamera:startCamera} icon={<Camera className="w-4 h-4"/>}>{camera==='active'?(ar?'إيقاف الكاميرا':'Stop camera'):(ar?'تشغيل الكاميرا':'Use camera')}</Button></div>
      {(camera==='unsupported'||camera==='denied')&&<p className="text-xs text-white/45 mt-3">{camera==='unsupported'?(ar?'الكاميرا غير مدعومة هنا. استخدم قارئ USB أو الكود.':'Camera scanning is unavailable here. Use a USB scanner or code.'):(ar?'لم تُمنح صلاحية الكاميرا. استخدم القارئ أو الكود.':'Camera permission was not granted. Use a scanner or code.')}</p>}
      <div className="mt-5 max-w-sm mx-auto"><div className="flex gap-2"><div className="relative flex-1"><Keyboard className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-white/40"/><input value={code} onChange={e=>{setCode(e.target.value);setError(false)}} onKeyDown={e=>{if(e.key==='Enter')void submit()}} placeholder={ar?'الكود / قارئ USB':'Code / USB scanner'} className="w-full rounded-xl border border-white/15 bg-white/[.06] ps-10 pe-3 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-[#8faf9f]"/></div><Button variant="secondary" disabled={!code.trim()} onClick={()=>void submit()} icon={<ScanLine className="w-4 h-4"/>}>{ar?'دخول':'Go'}</Button></div>{error&&<div className="text-xs text-[#e3afa7] mt-2">{ar?`تعذر التحقق من الاعتماد (${errorReason}). مكتب الاستثناء يساعدك.`:`Credential verification failed (${errorReason}). Use the exception desk.`}</div>}</div>
     </div>
    :<div className="rounded-[32px] border border-white/12 bg-white/[.055] p-8 text-center"><span className="w-16 h-16 rounded-full bg-[#dbe7df] text-[#214C40] grid place-items-center mx-auto"><Check className="w-8 h-8"/></span><div className="mizan-kicker !text-white/45 mt-6">{done.code}</div><h1 className="text-2xl sm:text-3xl font-black mt-2">{ar?`أهلًا ${done.fullNameArabic}`:`Welcome ${done.fullName}`}</h1><div className="mt-7 rounded-[26px] bg-[#dbe7df] text-[#17352c] p-5"><div className="text-[10px] font-black tracking-[.16em] opacity-60">{ar?'رقم الانتظار':'QUEUE NUMBER'}</div><div className="text-6xl sm:text-7xl font-black tracking-tight tabular-nums mt-1">{String(done.queueNumber||1).padStart(3,'0')}</div></div><div className="mt-3 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-black/10 p-4"><div className="text-[10px] text-white/40">{ar?'أمامك':'Ahead'}</div><div className="text-3xl font-black mt-1">{Math.max(0,(done.queueNumber||1)-1)}</div></div><div className="rounded-2xl bg-black/10 p-4"><div className="text-[10px] text-white/40">{ar?'اللجنة':'Committee'}</div><div className="text-lg font-black mt-2">{committee?.code||'—'}</div></div></div></div>}
   </div>
   <div className="text-center text-[10px] text-white/25">MIZAN · Quiet automation</div>
 </div>
}
