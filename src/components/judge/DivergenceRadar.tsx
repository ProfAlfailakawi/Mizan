import React,{useEffect,useMemo,useState} from 'react';
import {ChevronDown,GitBranch,Gauge} from 'lucide-react';
import {fetchDifficulty,fetchDivergencePoints,type DifficultyVector,type DivergencePoint} from '../../lib/kfgqpc-library';

/*
 * رادار المفترقات — تنبيه هادئ قبل موضع الالتباس.
 *
 * لماذا هذا الشكل تحديدًا:
 *  - السطح مطويّ افتراضيًا. المحكّم يسمع التلاوة، ولا يجوز أن تسرق لوحةٌ بصره عن المتسابق؛
 *    فالمعلومة حاضرة عند الطلب لا مفروضة. عنوان واحد يكفي ليعرف أن في المقطع مفترقات وكم عددها.
 *  - كل مفترق سطر واحد: المشترك ثم الكلمتان المتنافستان. لا ألوان صارخة ولا أيقونات متكررة —
 *    التمييز بالوزن والتباعد فقط، وهو ما يقرأ بسرعة تحت ضغط القاعة.
 *  - لا نِسَب ولا احتمالات: تلك أرقام لا تملك المنظومة ما يسندها، وعرضها يوهم بدقة غير موجودة.
 *
 * هذا سطح تنبيه لرئيس التحكيم والمحكّم؛ لا يرصد خطأ ولا يمسّ درجة.
 */

const Bar:React.FC<{label:string;value:number}>=({label,value})=>(
 <div className="flex items-center gap-2">
  <span className="text-[9px] text-[#6b716d] w-16 shrink-0">{label}</span>
  <span className="h-1 flex-1 rounded-full bg-[#e7e3d9] overflow-hidden"><span className="block h-full rounded-full bg-[#2F6555]/70" style={{width:`${Math.round(Math.max(0,Math.min(1,value))*100)}%`}}/></span>
 </div>);

export const DivergenceRadar:React.FC<{reading:string;surah:number;startAyah:number;endAyah:number;ar:boolean}>=({reading,surah,startAyah,endAyah,ar})=>{
 const [points,setPoints]=useState<DivergencePoint[]>([]);
 const [difficulty,setDifficulty]=useState<DifficultyVector|null>(null);
 const [open,setOpen]=useState(false);

 useEffect(()=>{let live=true;setPoints([]);setDifficulty(null);
  if(!reading||!surah||!startAyah||!endAyah)return;
  void fetchDivergencePoints(reading,surah,startAyah,endAyah).then(p=>{if(live)setPoints(p)});
  void fetchDifficulty(reading,surah,startAyah,endAyah).then(v=>{if(live)setDifficulty(v)});
  return()=>{live=false}},[reading,surah,startAyah,endAyah]);

 const load=useMemo(()=>{
  if(!difficulty)return null;
  const s=difficulty.score;
  return {label:s>=0.6?(ar?'حِمل ذهني مرتفع':'High load'):s>=0.35?(ar?'حِمل ذهني متوسط':'Moderate load'):(ar?'حِمل ذهني منخفض':'Light load'),score:s};
 },[difficulty,ar]);

 if(!points.length&&!difficulty)return null;

 return <div className="mt-3 rounded-[26px] border border-[#e2ded4] bg-[#fdfcf8] overflow-hidden">
  <button type="button" onClick={()=>setOpen(o=>!o)} aria-expanded={open}
   className="w-full min-h-11 px-4 sm:px-5 py-3 flex items-center justify-between gap-3 text-start">
   <span className="flex items-center gap-2.5 min-w-0">
    <span className="w-8 h-8 rounded-xl bg-[#EEF3F0] text-[#2F6555] grid place-items-center shrink-0"><GitBranch className="w-4 h-4"/></span>
    <span className="min-w-0">
     <span className="block text-[10px] font-black truncate">{ar?'مفترقات المتشابهات':'Divergence points'}</span>
     <span className="block text-[9px] text-[#6b716d] truncate">
      {points.length?(ar?`${points.length} موضع التباس في هذا المقطع`:`${points.length} fork${points.length>1?'s':''} in this passage`):(ar?'لا مفترقات في هذا المقطع':'No forks in this passage')}
      {load?` · ${load.label}`:''}
     </span>
    </span>
   </span>
   <ChevronDown className={`w-4 h-4 text-[#6b716d] shrink-0 transition-transform duration-200 ${open?'rotate-180':''}`}/>
  </button>

  {open&&<div className="px-4 sm:px-5 pb-4 space-y-4">
   {difficulty&&<div className="rounded-2xl bg-[#f7f5ef] p-3.5 space-y-2">
    <div className="flex items-center gap-2 text-[9px] font-black text-[#59615c]"><Gauge className="w-3.5 h-3.5"/>{ar?'متجه الصعوبة — مقيس من النص':'Difficulty vector — measured from the text'}</div>
    <Bar label={ar?'متشابهات':'Mutashabihat'} value={difficulty.mutashabihat}/>
    <Bar label={ar?'كلمات نادرة':'Rare words'} value={difficulty.rareWords}/>
    <Bar label={ar?'تقارب الأواخر':'Ending echo'} value={difficulty.endingSimilarity}/>
    <Bar label={ar?'حساسية الوقف':'Waqf density'} value={difficulty.waqfSensitivity}/>
   </div>}

   {points.map((p,i)=><div key={`${p.ayah}-${p.wordIndex}-${i}`} className="rounded-2xl bg-white border border-[#eae6dc] p-3.5">
    <div className="text-[9px] font-black text-[#6b716d]">{ar?'آية':'Ayah'} {p.ayah} · {ar?'المشترك':'shared'}</div>
    <div className="font-quran text-[15px] leading-8 text-[#2a312c] mt-1">{p.sharedPhrase}</div>
    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
     <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[9px] text-[#6b716d]">{ar?'هنا':'here'}</span>
      <span className="font-quran text-[15px] font-black text-[#214C40]">{p.expectedWord}</span>
     </span>
     {p.branches.map((b,k)=><span key={k} className="inline-flex items-baseline gap-1.5">
      <span className="text-[9px] text-[#8a6a33]">{b.surahNameArabic||''} {b.at.surah}:{b.at.ayah}</span>
      <span className="font-quran text-[15px] text-[#7a5a24]">{b.nextWord}</span>
     </span>)}
    </div>
   </div>)}

   <p className="text-[9px] leading-5 text-[#636864]">
    {ar?'وقائع نصية معدودة من حزمة الرواية نفسها. تنبيه للجنة فقط — لا يرصد خطأً ولا يؤثر في الدرجة.'
       :'Counted text facts from this reading\'s own package. Panel awareness only — it marks no error and moves no score.'}
   </p>
  </div>}
 </div>;
};
