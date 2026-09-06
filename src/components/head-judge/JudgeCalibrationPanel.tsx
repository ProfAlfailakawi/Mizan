import React,{useMemo,useState} from 'react';
import {ChevronDown,Scale} from 'lucide-react';

/*
 * ميزان اتزان المحكمين — لوحة استشارية لرئيس التحكيم.
 *
 * المسطرة تختلف بين المحكمين: شيخ لا يمنح 95 وآخر يبدأ من 98. ومن وقعت قرعته مع الأول يُظلم بلا
 * ذنب. هذه اللوحة تُظهر ذلك الفارق مقيسًا لا مظنونًا، ليقرر رئيس التحكيم مراجعة المقطع الصوتي.
 *
 * ثلاثة قيود بصرية مقصودة:
 *  - لا تُعرض «درجة معدّلة» بجانب درجة المحكّم في أي شاشة تحكيم. الدرجة البشرية تبقى هي الدرجة،
 *    والمقارنة المعيارية تُعرض هنا وحدها بوصفها سيناريو مقارنة لا نتيجة.
 *  - لا يُوصم محكّم قليل الجلسات: من لم تكتمل بياناته يظهر بحالة «بيانات غير كافية» صراحةً بدل
 *    تصنيفه صقرًا أو حمامة من عيّنة صغيرة.
 *  - اللوحة مطويّة، ولا تُبرز إلا الفروق ذات الأثر — فالغاية تنبيه لا تشويش.
 */

export interface JudgeCalibrationRow{judgeId:string;judgeName?:string;observations:number;mean:number;rawBias:number;shrunkBias:number;confidence:number;tendency:'HAWK'|'DOVE'|'BALANCED'|'INSUFFICIENT_DATA'}
export interface RankScenarioRow{participantId:string;actualScore:number;normalizedScore:number;actualRank:number;normalizedRank:number;rankDelta:number}

const TENDENCY_AR:Record<JudgeCalibrationRow['tendency'],string>={HAWK:'أشدّ من زملائه',DOVE:'أيسر من زملائه',BALANCED:'متزن',INSUFFICIENT_DATA:'بيانات غير كافية'};
const TENDENCY_EN:Record<JudgeCalibrationRow['tendency'],string>={HAWK:'stricter than peers',DOVE:'more lenient than peers',BALANCED:'balanced',INSUFFICIENT_DATA:'insufficient data'};
const TONE:Record<JudgeCalibrationRow['tendency'],string>={HAWK:'#7A4A3A',DOVE:'#3A5F84',BALANCED:'#2F6555',INSUFFICIENT_DATA:'#6b716d'};

/** شريط انحراف حول الصفر: يسار = أشدّ، يمين = أيسر. المدى ±3 درجات يغطي كل ما له أثر عملي. */
const BiasBar:React.FC<{value:number;tone:string}>=({value,tone})=>{
 const clamped=Math.max(-3,Math.min(3,value));const pct=(clamped/3)*50;
 return <span className="relative h-1.5 flex-1 min-w-[72px] rounded-full bg-[#ece8de]">
  <span className="absolute inset-y-0 left-1/2 w-px bg-[#cfc9bb]"/>
  <span className="absolute inset-y-0 rounded-full" style={{background:tone,left:pct<0?`${50+pct}%`:'50%',width:`${Math.abs(pct)}%`}}/>
 </span>;
};

export const JudgeCalibrationPanel:React.FC<{judges:JudgeCalibrationRow[];scenario?:RankScenarioRow[];ar:boolean}>=({judges,scenario,ar})=>{
 const [open,setOpen]=useState(false);
 const notable=useMemo(()=>judges.filter(j=>j.tendency==='HAWK'||j.tendency==='DOVE'),[judges]);
 const movers=useMemo(()=>(scenario||[]).filter(r=>r.rankDelta!==0),[scenario]);
 if(!judges.length)return null;

 return <div className="rounded-[26px] border border-[#e2ded4] bg-[#fdfcf8] overflow-hidden">
  <button type="button" onClick={()=>setOpen(o=>!o)} aria-expanded={open}
   className="w-full min-h-11 px-4 sm:px-5 py-3 flex items-center justify-between gap-3 text-start">
   <span className="flex items-center gap-2.5 min-w-0">
    <span className="w-8 h-8 rounded-xl bg-[#EEF3F0] text-[#2F6555] grid place-items-center shrink-0"><Scale className="w-4 h-4"/></span>
    <span className="min-w-0">
     <span className="block text-[10px] font-black truncate">{ar?'اتزان المسطرة بين المحكمين':'Judge calibration'}</span>
     <span className="block text-[9px] text-[#636864] truncate">
      {notable.length?(ar?`${notable.length} محكّم يبتعد عن متوسط زملائه`:`${notable.length} judge${notable.length>1?'s':''} away from the peer mean`):(ar?'المسطرة متقاربة بين الجميع':'Rulers are consistent across the panel')}
      {movers.length?(ar?` · ${movers.length} مركز يتغير في المقارنة`:` · ${movers.length} rank${movers.length>1?'s':''} differ in comparison`):''}
     </span>
    </span>
   </span>
   <ChevronDown className={`w-4 h-4 text-[#636864] shrink-0 transition-transform duration-200 ${open?'rotate-180':''}`}/>
  </button>

  {open&&<div className="px-4 sm:px-5 pb-4 space-y-4">
   <div className="space-y-2">
    {judges.map(j=><div key={j.judgeId} className="flex items-center gap-3">
     <span className="text-[10px] font-black text-[#2a312c] w-28 sm:w-36 truncate shrink-0">{j.judgeName||j.judgeId}</span>
     <BiasBar value={j.shrunkBias} tone={TONE[j.tendency]}/>
     <span className="text-[9px] tabular-nums w-12 text-end shrink-0" style={{color:TONE[j.tendency]}}>
      {j.tendency==='INSUFFICIENT_DATA'?'—':`${j.shrunkBias>0?'+':''}${j.shrunkBias.toFixed(2)}`}
     </span>
     <span className="text-[9px] text-[#636864] w-24 sm:w-32 truncate shrink-0">{ar?TENDENCY_AR[j.tendency]:TENDENCY_EN[j.tendency]}</span>
    </div>)}
   </div>

   {movers.length>0&&<div className="rounded-2xl bg-[#f7f5ef] p-3.5">
    <div className="text-[9px] font-black text-[#59615c]">{ar?'سيناريو مقارنة — لا يُعتمد':'Comparison scenario — not applied'}</div>
    <div className="mt-2 space-y-1.5">
     {movers.slice(0,6).map(r=><div key={r.participantId} className="flex items-center justify-between gap-3 text-[10px]">
      <span className="font-black text-[#2a312c] truncate">{r.participantId}</span>
      <span className="text-[#636864] tabular-nums shrink-0">
       {ar?'الفعلي':'actual'} {r.actualRank} → {ar?'المعياري':'normalized'} {r.normalizedRank}
      </span>
     </div>)}
    </div>
   </div>}

   <p className="text-[9px] leading-5 text-[#636864]">
    {ar?'الانحراف مقيس بمقارنة كل محكّم بزملائه على المتسابقين أنفسهم، ومسحوب نحو الاتزان بقدر قلّة بياناته حتى لا يُوصم من قلّت جلساته. مؤشر استشاري: لا يعدّل درجة ولا يعيد ترتيبًا؛ غايته توجيه مراجعة المقاطع الصوتية قبل الاعتماد.'
       :'Bias is measured against peers on the same participants and shrunk toward balanced in proportion to how little data a judge has, so a short record never brands anyone. Advisory only: it changes no score and re-ranks nothing — it points the head judge to the recordings worth reviewing before results are sealed.'}
   </p>
  </div>}
 </div>;
};
