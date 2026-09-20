import type {QuestionPoolItem} from '../types';
import {scopeContainsRange,scopeAyahCount,type QuranScope} from './quran-scope';

/*
 * نواةُ بناء بنك المواضع — بلا شبكةٍ ولا هوية.
 *
 * فُصلت عن `delivery-question-pool.ts` لتُقاس: ذلك الملفّ يستورد طبقةَ التسليم، وهي تستورد
 * هويّةَ Firebase، فلا يُحمَّل في اختبارٍ بلا مفاتيح. وما يُراد قياسُه هنا سلوكٌ محض:
 * أن الترشيح يحفظ الترتيب ولا يكرّر موضعًا، وأن قياسَ الصعوبة يمضي موجةً واحدة لا
 * واحدًا بعد واحد.
 */

export interface DrawnPassage{
 surah:number;startAyah:number;endAyah:number;text:string;
 surahNameArabic?:string;surahNameEnglish?:string;juz?:number;
}

export interface DifficultyVectorLike{score?:number;mutashabihat?:number}

/** متجه الصعوبة 0..1 → تقدير 1..5 المستعمل في سياسة المسابقة. */
export function difficultyRating(score:number):number{
 return Math.max(1,Math.min(5,Math.round(score*4)+1));
}

export function densityLabel(value:number):QuestionPoolItem['mutashabihatDensity']{
 return value>=0.5?'high':value>=0.25?'medium':value>0?'low':'none';
}

/**
 * ترشيحُ المواضع المسحوبة: يحفظ ترتيبَ السحب، ويُسقط ما خرج عن النطاق، ولا يكرّر موضعًا.
 * لا انتظارَ فيه، فلا يضيف زمنًا إلى ما بين ضغطة المحكّم وظهور الشاشة.
 */
export function selectPoolPassages(
 draws:readonly ({passage?:DrawnPassage|null}|null|undefined)[],
 options:{scope?:QuranScope;maxJuz?:number}={},
):DrawnPassage[]{
 const picked:DrawnPassage[]=[];
 const seen=new Set<string>();
 for(const draw of draws){
  const p=draw?.passage;
  if(!p)continue;
  // النطاق المعتمد هو المرجع القاطع؛ والموروث maxJuz لا يُستعمل إلا حين لا نطاق.
  if(options.scope&&scopeAyahCount(options.scope)>0){
   if(!scopeContainsRange(options.scope,{surah:p.surah,ayah:p.startAyah},{surah:p.surah,ayah:p.endAyah}))continue;
  } else if(options.maxJuz&&p.juz&&p.juz>options.maxJuz)continue;
  const key=`${p.surah}:${p.startAyah}-${p.endAyah}`;
  if(seen.has(key))continue;                       // لا يتكرر الموضع نفسه في البنك
  seen.add(key);
  picked.push(p);
 }
 return picked;
}

/**
 * بناءُ عناصر البنك. قياسُ الصعوبة يُطلق للمواضع كلِّها ثم يُنتظر مرّةً واحدة — لا نداءً
 * ينتظر الذي قبله. والترتيبُ يبقى ترتيبَ الترشيح.
 */
export async function buildPoolItems(
 picked:readonly DrawnPassage[],
 riwaya:string,
 reading:string,
 measure:(p:DrawnPassage)=>Promise<DifficultyVectorLike|null|undefined>,
):Promise<QuestionPoolItem[]>{
 const vectors=await Promise.all(picked.map(p=>measure(p)));
 return picked.map((p,i)=>{
  const vector=vectors[i];
  return {
   id:`kfgqpc-${reading}-${p.surah}-${p.startAyah}-${p.endAyah}`,
   surahNumber:p.surah,
   surahNameArabic:p.surahNameArabic||'',
   surahNameEnglish:p.surahNameEnglish||'',
   startAyah:p.startAyah,
   endAyah:p.endAyah,
   juzNumber:p.juz||1,
   riwaya,
   expectedTextArabic:p.text,
   difficultyRating:difficultyRating(vector?.score??0.5),
   mutashabihatDensity:densityLabel(vector?.mutashabihat??0),
   // درجة التجويد تتعلق بالأداء لا بالرسم، فلا تُشتق هنا ولا تُدّعى.
   tajweedComplexity:'intermediate' as const,
   timesUsed:0,
  };
 });
}
