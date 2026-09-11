import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Lock,LockKeyhole,ShieldAlert,X} from 'lucide-react';
import {UNLOCK_GESTURE_MS,clearVenueLock,createVenueLock,isValidPin,isWeakPin,readVenueLock,unlockDelayMs,verifyVenuePin,writeVenueLock,type VenueLock} from '../../lib/venue-lock';

/*
 * لوحة قفل شاشة القاعة.
 *
 * مفتوحة: زرّ «اقفل الجهاز» يطلب رمزًا من المشرف.
 * مقفولة: لا زرّ خروج ولا Escape — والعودة بضغط مطوّل على الزاوية العليا اليمنى ثم رمز.
 * الإيماءة أولًا عمدًا: حقلُ إدخالٍ ظاهر يدعو المارّ للتجريب، والخفيّ لا يُجرَّب.
 */

export function useVenueLockState(){
  const [lock,setLock]=useState<VenueLock|null>(()=>typeof window==='undefined'?null:readVenueLock(window.localStorage));
  const apply=useCallback((next:VenueLock|null)=>{
    setLock(next);
    if(typeof window==='undefined')return;
    if(next)writeVenueLock(window.localStorage,next); else clearVenueLock(window.localStorage);
  },[]);
  return {lock,apply};
}

/** يمنع مغادرة الصفحة أثناء القفل: رجوع المتصفّح كان مخرجًا لا يحرسه أحد. */
function useNavigationTrap(active:boolean){
  useEffect(()=>{
    if(!active||typeof window==='undefined')return;
    const push=()=>window.history.pushState(null,'',window.location.href);
    push();
    const onPop=()=>push();
    const onBeforeUnload=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};
    window.addEventListener('popstate',onPop);
    window.addEventListener('beforeunload',onBeforeUnload);
    return()=>{window.removeEventListener('popstate',onPop);window.removeEventListener('beforeunload',onBeforeUnload)};
  },[active]);
}

const PinPad:React.FC<{value:string;onChange:(v:string)=>void;disabled?:boolean;ar:boolean}>=({value,onChange,disabled,ar})=>(
  /* لوحة الأرقام تبقى من اليسار إلى اليمين حتى في واجهة عربية: هذا عُرف الهاتف والصرّاف
     الذي تحفظه الأصابع، وقلبُها يجعل المشرف يخطئ الرمز الذي يعرفه. */
  <div dir="ltr" className="grid grid-cols-3 gap-2 mt-4" role="group" aria-label={ar?'لوحة الرمز':'PIN pad'}>
    {['1','2','3','4','5','6','7','8','9'].map(d=>
      <button key={d} type="button" disabled={disabled} onClick={()=>onChange((value+d).slice(0,8))}
        className="min-h-14 rounded-2xl bg-white/10 text-white text-lg font-black hover:bg-white/20 disabled:opacity-40 tabular-nums">{d}</button>)}
    <button type="button" disabled={disabled} onClick={()=>onChange('')} className="min-h-14 rounded-2xl bg-white/5 text-white/70 text-[10px] font-black hover:bg-white/15 disabled:opacity-40">{ar?'مسح':'Clear'}</button>
    <button type="button" disabled={disabled} onClick={()=>onChange((value+'0').slice(0,8))} className="min-h-14 rounded-2xl bg-white/10 text-white text-lg font-black hover:bg-white/20 disabled:opacity-40 tabular-nums">0</button>
    <button type="button" disabled={disabled} onClick={()=>onChange(value.slice(0,-1))} aria-label={ar?'حذف':'Backspace'} className="min-h-14 rounded-2xl bg-white/5 text-white/70 hover:bg-white/15 disabled:opacity-40 grid place-items-center"><X className="w-4 h-4"/></button>
  </div>
);

/* ثماني نقاط ثابتة تَعِد بطول لا يلزم؛ النقاط تنمو مع ما أُدخل، وخطٌّ باهت يدلّ على المكان. */
const Dots:React.FC<{n:number}>=({n})=><div className="flex justify-center items-center gap-2 mt-4 min-h-[10px]" aria-hidden>{n===0?<span className="h-px w-16 bg-white/25"/>:Array.from({length:n},(_,i)=><span key={i} className="w-2.5 h-2.5 rounded-full bg-white"/>)}</div>;

/** الزرّ الذي يقفل الشاشة، يظهر فقط وهي مفتوحة. */
export const VenueLockButton:React.FC<{surface:string;ar:boolean;onLocked:(l:VenueLock)=>void}>=({surface,ar,onLocked})=>{
  const [open,setOpen]=useState(false);const [pin,setPin]=useState('');const [confirm,setConfirm]=useState('');const [err,setErr]=useState('');
  const stage=confirm===null?0:1;
  const [step,setStep]=useState<'set'|'repeat'>('set');
  const submit=async()=>{
    setErr('');
    if(step==='set'){
      if(!isValidPin(pin)){setErr(ar?'الرمز من ٤ إلى ٨ أرقام.':'The code must be 4 to 8 digits.');return}
      if(isWeakPin(pin)){setErr(ar?'رمز متكرّر أو متسلسل يسهل تخمينه على جهاز عام.':'A repeated or sequential code is easy to guess on a public device.');return}
      setStep('repeat');setConfirm('');return;
    }
    if(confirm!==pin){setErr(ar?'الرمزان غير متطابقين.':'The two codes do not match.');setConfirm('');return}
    try{ onLocked(await createVenueLock(pin,surface)); setOpen(false);setPin('');setConfirm('');setStep('set') }
    catch{ setErr(ar?'تعذّر إنشاء القفل على هذا المتصفّح.':'This browser cannot create the lock.') }
  };
  const current=step==='set'?pin:confirm;const setCurrent=step==='set'?setPin:setConfirm;
  return <>
    <button type="button" onClick={()=>setOpen(true)} className="min-h-11 px-3.5 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-[#101a16]/92 backdrop-blur-md text-white text-[10px] font-black shadow-[0_8px_24px_rgba(0,0,0,.35)] hover:bg-[#101a16] transition">
      <Lock className="w-3.5 h-3.5"/>{ar?'اقفل الجهاز':'Lock device'}
    </button>
    {open&&<div role="dialog" aria-modal="true" aria-label={ar?'قفل جهاز القاعة':'Lock venue device'} className="fixed inset-0 z-[100] bg-[#0d1512]/95 grid place-items-center p-5">
      <div className="w-full max-w-xs text-center">
        <LockKeyhole className="w-7 h-7 mx-auto text-white/80"/>
        <h2 className="text-white font-black mt-3">{step==='set'?(ar?'اختر رمز فتح الجهاز':'Choose the unlock code'):(ar?'أعد إدخال الرمز':'Re-enter the code')}</h2>
        <p className="text-[10px] text-white/55 mt-2 leading-5">{ar?'بعد القفل تملأ الشاشة الجهاز. اضغط مطولًا على الزاوية العليا اليمنى ثم أدخل هذا الرمز للخروج.':'Once locked, the surface fills the device. Long-press the upper-right corner, then enter this code to leave.'}</p>
        <Dots n={current.length}/>
        <PinPad value={current} onChange={setCurrent} ar={ar}/>
        {err&&<p className="text-[10px] text-[#f0b3aa] mt-3">{err}</p>}
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={()=>{setOpen(false);setPin('');setConfirm('');setStep('set');setErr('')}} className="flex-1 min-h-11 rounded-xl bg-white/5 text-white/70 text-[11px] font-black">{ar?'إلغاء':'Cancel'}</button>
          <button type="button" onClick={()=>void submit()} className="flex-1 min-h-11 rounded-xl bg-[#2F6555] text-white text-[11px] font-black">{step==='set'?(ar?'متابعة':'Continue'):(ar?'اقفل':'Lock')}</button>
        </div>
      </div>
    </div>}
  </>;
};

/**
 * الطبقة التي تحرس الشاشة المقفولة: تلتقط الإيماءة الخفية وتطلب الرمز.
 * لا تُظهر أي أثر مرئي وهي ساكنة، فالشاشة تبدو للناظر بلا مخرج.
 */
export const VenueUnlockGuard:React.FC<{lock:VenueLock;ar:boolean;onUnlocked:()=>void}>=({lock,ar,onUnlocked})=>{
  const [asking,setAsking]=useState(false);const [pin,setPin]=useState('');const [err,setErr]=useState('');
  const [fails,setFails]=useState(0);const [waitUntil,setWaitUntil]=useState(0);const [now,setNow]=useState(Date.now());
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useNavigationTrap(true);
  useEffect(()=>{const i=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(i)},[]);
  const blockedMs=Math.max(0,waitUntil-now);

  const begin=()=>{ if(timer.current)clearTimeout(timer.current); timer.current=setTimeout(()=>setAsking(true),UNLOCK_GESTURE_MS) };
  const cancel=()=>{ if(timer.current){clearTimeout(timer.current);timer.current=null} };

  const attempt=async()=>{
    if(blockedMs>0)return;
    if(await verifyVenuePin(lock,pin)){ onUnlocked(); return }
    const next=fails+1;setFails(next);setPin('');
    setErr(ar?'رمز غير صحيح.':'Incorrect code.');
    const delay=unlockDelayMs(next);
    if(delay>0)setWaitUntil(Date.now()+delay);
  };

  return <>
    {/* الإيماءة الخفية: الزاوية العليا اليمنى فقط، وتعمل للمس والماوس. */}
    <div aria-hidden onPointerDown={begin} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}
      className="fixed top-0 right-0 h-24 w-24 z-[90]" style={{touchAction:'none'}}/>
    {asking&&<div role="dialog" aria-modal="true" aria-label={ar?'فتح قفل الجهاز':'Unlock venue device'} className="fixed inset-0 z-[100] bg-[#0d1512]/96 grid place-items-center p-5">
      <div className="w-full max-w-xs text-center">
        <ShieldAlert className="w-7 h-7 mx-auto text-white/80"/>
        <h2 className="text-white font-black mt-3">{ar?'أدخل رمز فتح الجهاز':'Enter the unlock code'}</h2>
        <p className="text-[10px] text-white/55 mt-2">{ar?`الشاشة المقفولة: ${lock.surface}`:`Locked surface: ${lock.surface}`}</p>
        <Dots n={pin.length}/>
        <PinPad value={pin} onChange={v=>{setPin(v);setErr('')}} disabled={blockedMs>0} ar={ar}/>
        {err&&blockedMs<=0&&<p className="text-[10px] text-[#f0b3aa] mt-3">{err}</p>}
        {blockedMs>0&&<p className="text-[10px] text-[#f0c9a0] mt-3">{ar?`محاولات خاطئة متتابعة — انتظر ${Math.ceil(blockedMs/1000)} ثانية.`:`Repeated wrong attempts — wait ${Math.ceil(blockedMs/1000)}s.`}</p>}
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={()=>{setAsking(false);setPin('');setErr('')}} className="flex-1 min-h-11 rounded-xl bg-white/5 text-white/70 text-[11px] font-black">{ar?'رجوع':'Back'}</button>
          <button type="button" disabled={blockedMs>0} onClick={()=>void attempt()} className="flex-1 min-h-11 rounded-xl bg-[#2F6555] text-white text-[11px] font-black disabled:opacity-40">{ar?'افتح':'Unlock'}</button>
        </div>
      </div>
    </div>}
  </>;
};
