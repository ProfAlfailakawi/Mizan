import React,{useMemo} from 'react';

/*
 * عرض النص القرآني مع أحكام التجويد.
 *
 * قرارات بصرية مقصودة:
 *  - اللون يقع على الحرف المحكوم وحده، لأن الأحكام مشتقّة من فهارس هذا النص نفسه لا من نص آخر.
 *  - لوحة هادئة قريبة من ألوان المصاحف المطبوعة، بدرجات مشبعة قليلًا: المصحف يُقرأ لا يُزيَّن،
 *    والألوان الصارخة تُتعب العين في جلسة تمتد ساعات وتُشوّش على المتسابق في شاشة القاعة.
 *  - الأحكام المتقاربة تُجمع في عائلة لونية واحدة (أحكام النون، أحكام الميم، اللام) ليقرأها
 *    الحَكَم بالتجاور لا بالحفظ، مع بقاء التمييز في التسمية عند اللمس.
 *  - وضع التلوين اختياري ومطفأ افتراضيًا: أثناء التلاوة تُترك الصفحة كما هي في المصحف.
 */

export interface TajweedSpan{rule:string;start:number;end:number}

/* عائلات لونية: أحكام النون والتنوين خضراء، أحكام الميم زرقاء، اللام والهمزة ترابية، القلقلة حمراء. */
const RULE_COLOR:Record<string,string>={
 ikhfa:'#2F6555', idghaam_ghunnah:'#2F6555', idghaam_no_ghunnah:'#3E7C68', iqlab:'#1F4C40', izhar:'#4B8A76',
 ikhfa_shafawi:'#3A5F84', idghaam_shafawi:'#3A5F84', izhar_shafawi:'#5A7FA3',
 ghunnah:'#8A5A2B',
 hamzat_wasl:'#8A6A33', lam_shamsiyyah:'#9A7638', lam_qamariyyah:'#A98A55',
 qalqalah:'#9B3B2F',
};
const LABELS:Record<string,string>={
 hamzat_wasl:'همزة وصل', lam_shamsiyyah:'لام شمسية', lam_qamariyyah:'لام قمرية',
 ghunnah:'غنة', qalqalah:'قلقلة', izhar:'إظهار', ikhfa:'إخفاء', iqlab:'إقلاب',
 idghaam_ghunnah:'إدغام بغنة', idghaam_no_ghunnah:'إدغام بغير غنة',
 ikhfa_shafawi:'إخفاء شفوي', idghaam_shafawi:'إدغام شفوي', izhar_shafawi:'إظهار شفوي',
};
/* ترتيب المفتاح: مجموعات مفهومة بدل قائمة أبجدية لا يقرأها أحد. */
const LEGEND_ORDER=['ikhfa','idghaam_ghunnah','idghaam_no_ghunnah','iqlab','izhar','ikhfa_shafawi','idghaam_shafawi','izhar_shafawi','ghunnah','qalqalah','hamzat_wasl','lam_shamsiyyah','lam_qamariyyah'];

/** تقطيع النص إلى أجزاء ملوّنة دون أن تتداخل الأحكام أو يضيع حرف. */
function segment(text:string,spans:TajweedSpan[]){
 const clean=[...spans].filter(s=>s.start>=0&&s.end<=text.length&&s.end>s.start).sort((a,b)=>a.start-b.start||b.end-a.end);
 const out:{text:string;rule?:string}[]=[];let cursor=0;
 for(const s of clean){
  if(s.start<cursor)continue; // تداخل: نُبقي الأسبق ولا نلوّن حرفًا مرتين
  if(s.start>cursor)out.push({text:text.slice(cursor,s.start)});
  out.push({text:text.slice(s.start,s.end),rule:s.rule});
  cursor=s.end;
 }
 if(cursor<text.length)out.push({text:text.slice(cursor)});
 return out;
}

export const TajweedAyah:React.FC<{text:string;spans?:TajweedSpan[];enabled:boolean}>=({text,spans,enabled})=>{
 const parts=useMemo<{text:string;rule?:string}[]>(()=>enabled&&spans?.length?segment(text,spans):[{text}],[text,spans,enabled]);
 if(parts.length===1&&!parts[0].rule)return <>{text}</>;
 return <>{parts.map((p,i)=>p.rule
  ? <span key={i} style={{color:RULE_COLOR[p.rule]||undefined}} title={LABELS[p.rule]||p.rule}>{p.text}</span>
  : <span key={i}>{p.text}</span>)}</>;
};

/*
 * الآية مقطّعة إلى كلمات، فتُظلَّل الكلمة الجارية أثناء التلاوة المرجعية.
 *
 * التلوين والتظليل بُعدان متعامدان: أحكام التجويد إزاحاتٌ على نص الآية كلها، والتظليل يقع على
 * كلمة. فتُشرَّح الأحكام إلى إحداثيات كل كلمة ثم تُلوَّن داخلها، فلا يضيع حكم على حدود كلمة
 * ولا يُلوَّن حرف مرتين.
 */
export const TajweedAyahWords:React.FC<{text:string;spans?:TajweedSpan[];enabled:boolean;words:{index:number;start:number;end:number}[];activeWord:number}>=({text,spans,enabled,words,activeWord})=>{
 const pieces=useMemo(()=>{
  const out:{key:string;text:string;word:number}[]=[];let cursor=0;
  for(const w of words){
   if(w.start>cursor)out.push({key:`gap${cursor}`,text:text.slice(cursor,w.start),word:-1});
   out.push({key:`w${w.index}`,text:text.slice(w.start,w.end),word:w.index});
   cursor=w.end;
  }
  if(cursor<text.length)out.push({key:`tail${cursor}`,text:text.slice(cursor),word:-1});
  return out;
 },[text,words]);
 // أحكام كل كلمة بإحداثيات محلية، حتى يبقى اللون على حرفه بعد التقطيع.
 const localSpans=useMemo(()=>{
  const map=new Map<number,TajweedSpan[]>();if(!enabled||!spans?.length)return map;
  for(const w of words){
   const inside=spans.filter(s=>s.end>w.start&&s.start<w.end)
    .map(s=>({rule:s.rule,start:Math.max(0,s.start-w.start),end:Math.min(w.end-w.start,s.end-w.start)}));
   if(inside.length)map.set(w.index,inside);
  }
  return map;
 },[spans,words,enabled]);
 return <>{pieces.map(p=>p.word<0
  ? <span key={p.key}>{p.text}</span>
  : <span key={p.key} className={p.word===activeWord?'rounded-md bg-[#dCe9e1] shadow-[0_0_0_1px_#bcd6c9] transition-colors duration-150':'transition-colors duration-150'}>
     <TajweedAyah text={p.text} spans={localSpans.get(p.word)} enabled={enabled}/>
    </span>)}</>;
};

export const TajweedLegend:React.FC<{spans:TajweedSpan[];ar:boolean}>=({spans,ar})=>{
 const present=useMemo(()=>{const s=new Set(spans.map(x=>x.rule));return LEGEND_ORDER.filter(r=>s.has(r))},[spans]);
 if(!present.length)return null;
 return <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
  {present.map(r=><span key={r} className="inline-flex items-center gap-1.5 text-[9px] text-[#59615c]">
   <span className="w-2 h-2 rounded-full shrink-0" style={{background:RULE_COLOR[r]}}/>
   {ar?LABELS[r]:r.replace(/_/g,' ')}
  </span>)}
 </div>;
};
