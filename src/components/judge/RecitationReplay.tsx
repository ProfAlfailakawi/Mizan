import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Pause,Play,RotateCcw} from 'lucide-react';
import {TajweedAyahWords} from './TajweedText';
import {splitAyahWords} from '../../lib/word-timing';

/*
 * إعادة تشغيل التلاوة — «أرِني اللحظة».
 *
 * كان الدليل يُسمع مقطوعًا: زر يفتح الصوت من إزاحة ثم يتركك تبحث بأذنك عن الموضع. والمراجعة
 * العلمية ولجنة الطعون تسألان سؤالًا واحدًا: أين وقعت الملاحظة في النص؟
 *
 * هنا يمشي الثلاثة معًا: الصوت، والموضع في المصحف، وحالة التتبّع. والعلامات على الشريط ليست
 * زينة — هي اللحظات التي فقد فيها المحرّك الموضع أو استعاده أو وضع فيها الحَكَم علامة يدوية،
 * فيُقفز إليها مباشرة بدل الاستماع من الأول.
 *
 * الحدّ المحفوظ: هذا عرضُ أدلة لا حكم. لا يُحتسب منه شيء، والقرار يبقى للحَكَم وحده.
 */

export interface ReplayMark {
  /** إزاحة اللحظة من بداية التسجيل بالمللي ثانية. */
  offsetMs: number;
  ayah?: number;
  wordIndex?: number;
  alignmentState?: string;
  confidence?: number;
  kind: 'ALIGNMENT' | 'HUMAN_MARKER';
}

/** اللحظات التي تستحق قفزة: فقدُ الموضع واستعادته، وعلامة الحَكَم اليدوية. */
const NOTABLE=(m:ReplayMark)=>m.kind==='HUMAN_MARKER'||m.alignmentState==='LOST'||m.alignmentState==='REACQUIRING'||m.alignmentState==='REACQUIRED';
const markTone=(m:ReplayMark)=>m.kind==='HUMAN_MARKER'?'#214C40':m.alignmentState==='LOST'?'#9B3B2F':'#8A5A2B';
const markLabel=(m:ReplayMark,ar:boolean)=>m.kind==='HUMAN_MARKER'?(ar?'علامة الحَكَم':'Judge marker')
 :m.alignmentState==='LOST'?(ar?'فقد الموضع':'Position lost')
 :m.alignmentState==='REACQUIRING'?(ar?'إعادة تحديد':'Reacquiring')
 :m.alignmentState==='REACQUIRED'?(ar?'استعاد الموضع':'Reacquired'):(ar?'تتبّع':'Tracking');

const mmss=(ms:number)=>{const t=Math.max(0,Math.floor(ms/1000));return `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`};

export const RecitationReplay:React.FC<{recordingUrl:string;ayat:{ayah:number;text:string}[];trail:ReplayMark[];ar:boolean}>=({recordingUrl,ayat,trail,ar})=>{
 const elRef=useRef<HTMLAudioElement|null>(null);
 const [playing,setPlaying]=useState(false);const [posMs,setPosMs]=useState(0);const [durMs,setDurMs]=useState(0);
 const marks=useMemo(()=>[...trail].sort((a,b)=>a.offsetMs-b.offsetMs),[trail]);
 const notable=useMemo(()=>marks.filter(NOTABLE),[marks]);

 useEffect(()=>{const el=elRef.current;if(!el)return;if(playing)void el.play().catch(()=>setPlaying(false));else el.pause()},[playing]);
 useEffect(()=>{const el=elRef.current;if(!el||!playing)return;let raf=0;
  const tick=()=>{setPosMs(el.currentTime*1000);raf=requestAnimationFrame(tick)};raf=requestAnimationFrame(tick);
  return()=>cancelAnimationFrame(raf)},[playing]);

 /* الموضع المعروض هو آخر رصد وقع قبل اللحظة الحالية — لا نستكمل بين رصدين بتخمين. */
 const current=useMemo(()=>{let hit:ReplayMark|null=null;for(const m of marks){if(m.offsetMs<=posMs)hit=m;else break}return hit},[marks,posMs]);
 const activeAyah=current?.ayah??null;
 const activeAyahText=useMemo(()=>ayat.find(a=>a.ayah===activeAyah)||null,[ayat,activeAyah]);
 const activeWords=useMemo(()=>activeAyahText?splitAyahWords(activeAyahText.text):[],[activeAyahText]);

 const seek=(ms:number)=>{const el=elRef.current;const next=Math.max(0,Math.min(durMs||ms,ms));setPosMs(next);if(el)el.currentTime=next/1000};
 const step=(dir:1|-1)=>{
  const pool=dir>0?notable.filter(m=>m.offsetMs>posMs+250):notable.filter(m=>m.offsetMs<posMs-250).reverse();
  if(pool.length)seek(pool[0].offsetMs);
 };
 const progress=durMs>0?Math.min(1,posMs/durMs):0;

 return <section className="rounded-[26px] border border-[#dad7cd] bg-[#fdfbf5] overflow-hidden">
  <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-[#e5e1d7] bg-[#f7f4ec]">
   <div className="min-w-0"><div className="text-[10px] font-black truncate">{ar?'إعادة تشغيل التلاوة':'RECITATION REPLAY'}</div>
    <div className="text-[9px] text-[#646965] truncate">{ar?'الصوت والموضع وحالة التتبّع معًا — عرض أدلة لا درجة':'Audio, position and tracking together — evidence only, never scored'}</div></div>
   {/* الزمن يُعزل اتجاهه: «0:04 / 1:20» داخل فقرة عربية ينقلب فيصير الموضع مدةً والمدة موضعًا. */}
   <span dir="ltr" className="shrink-0 text-[10px] font-black tabular-nums text-[#59615c]">{mmss(posMs)} / {mmss(durMs)}</span>
  </div>

  {/* الموضع في المصحف عند هذه اللحظة */}
  <div className="px-5 sm:px-8 py-6">
   {activeAyahText
    ? <div className="font-quran text-center text-xl sm:text-[1.7rem] leading-[2.1] text-[#202622]">
       <TajweedAyahWords text={activeAyahText.text} enabled={false} words={activeWords} activeWord={current?.wordIndex??-1}/>
      </div>
    : <p className="text-center text-[10px] text-[#646965] py-4">{ar?'لا يوجد رصد موضع عند هذه اللحظة.':'No tracked position at this moment.'}</p>}
   {current&&<div className="mt-4 flex items-center justify-center gap-2 text-[9px] font-black">
    <span className="rounded-lg px-2 py-1" style={{background:'#efeae0',color:markTone(current)}}>{markLabel(current,ar)}</span>
    {activeAyah!==null&&<span className="text-[#59615c]">{ar?`آية ${activeAyah}`:`Ayah ${activeAyah}`}</span>}
    {typeof current.confidence==='number'&&<span className="text-[#646965]">{ar?'ثقة':'confidence'} {(current.confidence*100).toFixed(0)}%</span>}
   </div>}
  </div>

  {/* الشريط الزمني وعلاماته */}
  <div className="px-4 sm:px-5 pb-4">
   <div className="relative h-8">
    <input type="range" min={0} max={Math.max(1,durMs)} value={posMs} step={50}
     onChange={e=>seek(Number(e.target.value))}
     aria-label={ar?'موضع التشغيل':'Playback position'}
     className="absolute inset-x-0 top-1/2 -translate-y-1/2 w-full appearance-none bg-transparent cursor-pointer"/>
    <div aria-hidden className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[4px] rounded-full bg-[#e3ded1] overflow-hidden"><div className="h-full bg-[#214C40]" style={{width:`${progress*100}%`}}/></div>
    {durMs>0&&notable.map((m,i)=><button key={i} type="button" onClick={()=>seek(m.offsetMs)}
      title={`${markLabel(m,ar)} · ${mmss(m.offsetMs)}`} aria-label={`${markLabel(m,ar)} ${mmss(m.offsetMs)}`}
      className="absolute top-0 h-full w-3 -translate-x-1/2 grid place-items-center"
      style={{insetInlineStart:`${Math.min(100,(m.offsetMs/durMs)*100)}%`}}>
      <span className="w-[3px] h-3.5 rounded-full" style={{background:markTone(m)}}/>
     </button>)}
   </div>
   <div className="mt-2 flex items-center justify-between gap-3">
    <div className="flex items-center gap-1.5">
     <button type="button" onClick={()=>setPlaying(p=>!p)} aria-label={ar?(playing?'إيقاف':'تشغيل'):(playing?'Pause':'Play')}
      className="w-11 h-11 rounded-xl bg-[#214C40] text-white grid place-items-center">{playing?<Pause className="w-4 h-4"/>:<Play className="w-4 h-4"/>}</button>
     <button type="button" onClick={()=>seek(0)} aria-label={ar?'من البداية':'Restart'} className="w-11 h-11 rounded-xl border border-[#dcdad2] grid place-items-center text-[#59615c]"><RotateCcw className="w-4 h-4"/></button>
    </div>
    <div className="flex items-center gap-1.5">
     <button type="button" onClick={()=>step(-1)} disabled={!notable.length} aria-label={ar?'العلامة السابقة':'Previous marker'} className="min-h-11 px-3 rounded-xl border border-[#dcdad2] text-[9px] font-black text-[#59615c] disabled:opacity-40 inline-flex items-center gap-1"><ChevronRight className="w-3.5 h-3.5"/>{ar?'السابقة':'Prev'}</button>
     <button type="button" onClick={()=>step(1)} disabled={!notable.length} aria-label={ar?'العلامة التالية':'Next marker'} className="min-h-11 px-3 rounded-xl border border-[#dcdad2] text-[9px] font-black text-[#59615c] disabled:opacity-40 inline-flex items-center gap-1">{ar?'التالية':'Next'}<ChevronLeft className="w-3.5 h-3.5"/></button>
    </div>
   </div>
   {!notable.length&&<p className="mt-2 text-[9px] text-[#646965]">{ar?'لا توجد لحظات مُعلَّمة في هذه الجلسة.':'No flagged moments in this session.'}</p>}
  </div>

  <audio ref={elRef} src={recordingUrl} preload="metadata"
   onLoadedMetadata={e=>setDurMs((e.currentTarget.duration||0)*1000)}
   onEnded={()=>setPlaying(false)}
   onSeeked={e=>setPosMs(e.currentTarget.currentTime*1000)}/>
 </section>;
};
