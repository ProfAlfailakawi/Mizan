import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Mic, Square, Trash2} from 'lucide-react';
import {fetchDeliveryPassage,type DeliveryPassage} from '../../lib/kfgqpc-library';
import {PassageAudio} from '../judge/OfficialMushafSurface';
import {TajweedAyahWords} from '../judge/TajweedText';
import {splitAyahWords} from '../../lib/word-timing';
import {Button} from '../design-system/Button';
import {Badge} from '../design-system/Badge';

/*
 * استوديو التدرّب — للمتسابق قبل يوم المسابقة.
 *
 * التلاوة المرجعية بتظليل الكلمة كانت حكرًا على لجنة التحكيم، والمتسابق — وهو صاحب الحاجة
 * الأولى إليها — لا يراها إلا في الاختبار. هنا يسمع المقطع من المصحف نفسه ويتابع الكلمة، ثم
 * يسجّل نفسه ويقارن.
 *
 * حدود مقصودة:
 *  - **التسجيل محلي بالكامل**: يبقى في المتصفّح ولا يُرفع ولا يُحفظ في سجلّ المسابقة. صوت
 *    المتسابق في تدرّبه ليس دليلًا تشغيليًا، ولا يُجمع بلا سبب ولا إذن.
 *  - **لا درجة ولا تقييم آلي**: لا يُقال للمتسابق «أخطأت»؛ المصحف يُسمع ويُقرأ، والحكم للبشر
 *    في موضعه. أي إيحاء بتقييم هنا يخلق ثقة زائفة قبل الاختبار.
 */

export const PracticeStudio:React.FC<{reading:string;surah:number;startAyah:number;endAyah:number;ar:boolean}>=({reading,surah,startAyah,endAyah,ar})=>{
 const [passage,setPassage]=useState<DeliveryPassage|null>(null);
 const [active,setActive]=useState<{ayah:number;word:number}|null>(null);
 useEffect(()=>{let live=true;setPassage(null);setActive(null);
  if(!reading||!surah||!startAyah||!endAyah)return;
  void fetchDeliveryPassage(reading,surah,startAyah,endAyah).then(p=>{if(live)setPassage(p)});
  return()=>{live=false}},[reading,surah,startAyah,endAyah]);

 const activeAyah=active?.ayah??null;
 const activeText=useMemo(()=>passage?.ayat.find(a=>a.ayah===activeAyah)||null,[passage,activeAyah]);
 const activeWords=useMemo(()=>activeText?splitAyahWords(activeText.text):[],[activeText]);

 // ---- التسجيل الذاتي: محلي، ويُطوى أثره عند المغادرة ----
 const [recording,setRecording]=useState(false);
 const [selfUrl,setSelfUrl]=useState<string|null>(null);
 const [micError,setMicError]=useState('');
 const recRef=useRef<MediaRecorder|null>(null);const chunksRef=useRef<Blob[]>([]);const streamRef=useRef<MediaStream|null>(null);
 const stopTracks=()=>{streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null};
 useEffect(()=>()=>{stopTracks();if(selfUrl)URL.revokeObjectURL(selfUrl)},[selfUrl]);

 const start=async()=>{
  setMicError('');
  if(typeof navigator==='undefined'||!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){
   setMicError(ar?'التسجيل غير مدعوم في هذا المتصفّح.':'Recording is not supported in this browser.');return;}
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});streamRef.current=stream;
   const rec=new MediaRecorder(stream);recRef.current=rec;chunksRef.current=[];
   rec.ondataavailable=e=>{if(e.data.size)chunksRef.current.push(e.data)};
   rec.onstop=()=>{const blob=new Blob(chunksRef.current,{type:rec.mimeType||'audio/webm'});
    setSelfUrl(prev=>{if(prev)URL.revokeObjectURL(prev);return URL.createObjectURL(blob)});stopTracks()};
   rec.start();setRecording(true);
  }catch{setMicError(ar?'تعذّر الوصول إلى الميكروفون. تحقّق من إذن المتصفّح.':'Microphone access was refused. Check the browser permission.');stopTracks()}
 };
 const stop=()=>{recRef.current?.state==='recording'&&recRef.current.stop();setRecording(false)};
 const discard=()=>{setSelfUrl(prev=>{if(prev)URL.revokeObjectURL(prev);return null})};

 return <section className="rounded-[26px] border border-[#dad7cd] bg-[#fdfbf5] overflow-hidden">
  <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-[#e5e1d7] bg-[#f7f4ec]">
   <div className="min-w-0"><div className="text-[10px] font-black truncate">{ar?'استوديو التدرّب':'PRACTICE STUDIO'}</div>
    <div className="text-[9px] text-[#646965] truncate">{ar?'اسمع، تابع الكلمة، ثم سجّل نفسك':'Listen, follow the word, then record yourself'}</div></div>
   <Badge variant="emerald">{ar?'المصدر: مجمع الملك فهد':'KFGQPC SOURCE'}</Badge>
  </div>

  <div className="px-5 sm:px-8 py-7">
   {passage
    ? <div className="font-quran text-center text-xl sm:text-[1.9rem] leading-[2.2] text-[#202622]">
       {passage.ayat.map((a,i)=><React.Fragment key={a.ayah}>{i?' ':''}
        <span className={a.ayah===activeAyah?'rounded-lg px-1.5 py-0.5 bg-[#E7EEE9] transition-colors duration-300':'transition-colors duration-300'}>
         {a.ayah===activeAyah&&activeWords.length
          ? <TajweedAyahWords text={a.text} enabled={false} words={activeWords} activeWord={active?.word??-1}/>
          : a.text}
        </span></React.Fragment>)}
      </div>
    : <p className="text-center text-[10px] text-[#646965] py-6">{ar?'جارٍ تحميل المقطع…':'Loading the passage…'}</p>}
  </div>

  {passage&&<PassageAudio reading={reading} ayat={passage.ayat} ar={ar} onActive={setActive}/>}

  <div className="px-4 sm:px-5 py-4 border-t border-[#e5e1d7]">
   <div className="flex flex-wrap items-center gap-2">
    {!recording
     ? <Button size="sm" onClick={()=>void start()} icon={<Mic className="w-4 h-4"/>}>{ar?'سجّل تلاوتك':'Record yourself'}</Button>
     : <Button size="sm" variant="outline" onClick={stop} icon={<Square className="w-4 h-4"/>}>{ar?'إيقاف التسجيل':'Stop recording'}</Button>}
    {recording&&<span className="inline-flex items-center gap-1.5 text-[10px] font-black text-[#9B3B2F]"><span className="w-2 h-2 rounded-full bg-[#9B3B2F] animate-pulse"/>{ar?'يسجّل…':'Recording…'}</span>}
    {selfUrl&&!recording&&<Button size="sm" variant="ghost" onClick={discard} icon={<Trash2 className="w-4 h-4"/>}>{ar?'حذف':'Discard'}</Button>}
   </div>
   {micError&&<p className="mt-2 text-[10px] text-[#9B3B2F]">{micError}</p>}
   {selfUrl&&<div className="mt-3">
    <div className="text-[9px] font-black text-[#59615c] mb-1.5">{ar?'تلاوتك':'Your recitation'}</div>
    <audio src={selfUrl} controls className="w-full"/>
   </div>}
   <p className="mt-3 text-[9px] leading-4 text-[#646965]">
    {ar?'تسجيلك يبقى في متصفّحك ولا يُرفع ولا يدخل سجلّ المسابقة، ويُحذف بمغادرة الصفحة. لا يوجد تقييم آلي هنا؛ التدرّب للسماع والمقارنة، والحكم للبشر في موضعه.'
       :'Your recording stays in this browser, is never uploaded or added to competition records, and is discarded when you leave. Nothing here is scored; practice is for listening and comparison, and judging stays with people.'}
   </p>
  </div>
 </section>;
};
