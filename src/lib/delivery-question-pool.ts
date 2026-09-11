import type {QuestionPoolItem} from '../types';
import {drawFairPassage,fetchDifficulty} from './kfgqpc-library';
import {resolveReading} from './scientific-core';
import {scopeContainsRange,scopeAyahCount,type QuranScope} from './quran-scope';

/*
 * بنك أسئلة مولَّد من المصحف بدل قائمة ثابتة.
 *
 * كان السحب — حين لا تكون خزنة المصدر المُصدّقة مركّبة — يقع على بضعة أسئلة تطويرية نصّها عبارة
 * إنجليزية لا آية، فتظهر في منصة التحكيم مكان القرآن. وحتى لو مُلئت تلك القائمة بأسئلة حقيقية،
 * تبقى قائمة محدودة تُحفظ وتتكرر.
 *
 * البديل هنا: يُولَّد كل موضع من نص الرواية نفسه لحظة السحب. والبداية دائمًا عند حدّ آية حقيقي،
 * فلا يبدأ المتسابق من وسط آية. ولكل موضع متجه صعوبة مقيس من النص (كثافة المتشابهات، وعورة
 * المفردات، تقارب أواخر الآيات، كثافة الوقف) لتصير القرعة متكافئة الطاقة الذهنية لا عشوائية فحسب.
 *
 * السحب حتمي بالبذرة: البذرة نفسها تعطي المواضع نفسها، فيمكن لأي مدقّق إعادة إنتاج القرعة
 * والتحقق منها. وآلية الالتزام والكشف (commitment/reveal) القائمة في MIZAN تبقى كما هي فوق هذا
 * البنك، فالتوليد يغذّي النزاهة القائمة ولا يستبدلها.
 *
 * وهذه طبقة تسليم لا مصدر علمي: متى توفّرت خزنة المصدر المُصدّقة فهي المقدَّمة، ولا يحلّ هذا محلها.
 */

/** رواية MIZAN القانونية → مفتاح حزمة التسليم. ما لا حزمة له لا يُولَّد له بنك. */
const DELIVERY_READING_BY_RAWI:Record<string,string>={hafs:'hafs',warsh:'warsh',shubah:'shubah',qalun:'qalun','al-duri-abu-amr':'duri-abi-amr','al-susi':'susi-abi-amr'};

export function deliveryReadingKey(riwaya?:string,qiraah?:string):string|null{
 const reading=resolveReading({rawi:riwaya,riwaya,qiraah});
 if(!reading)return null;
 return DELIVERY_READING_BY_RAWI[reading.rawiId]||null;
}

/** متجه الصعوبة 0..1 → تقدير 1..5 المستعمل في سياسة المسابقة. */
function difficultyRating(score:number):number{
 return Math.max(1,Math.min(5,Math.round(score*4)+1));
}
function densityLabel(value:number):QuestionPoolItem['mutashabihatDensity']{
 return value>=0.5?'high':value>=0.25?'medium':value>0?'low':'none';
}

export interface DeliveryPoolOptions{
 /** عدد المواضع المولَّدة. يُفضَّل أن يزيد على المطلوب ليجد السحب سعةً للموازنة. */
 size?:number;
 /** بذرة الأساس — تجعل البنك نفسه قابلًا لإعادة الإنتاج والتدقيق. */
 seedBase?:string;
 minAyahCount?:number;
 maxAyahCount?:number;
 /** جسر توافق موروث: أعلى جزء مسموح. يُستعمل فقط حين لا نطاق. */
 maxJuz?:number;
 /**
  * نطاق المتسابق المعتمد. متى وُجد فهو المرجع القاطع ويُهمل maxJuz تمامًا:
  * لا يُولَّد موضعٌ خارجه ولو أخطأت طبقة التسليم.
  */
 scope?:QuranScope;
}

/**
 * توليد بنك مواضع حقيقية لرواية بعينها.
 * يعود فارغًا — لا مختلقًا — متى تعذّر الوصول إلى حزمة التسليم أو لم تُعرف الرواية.
 */
export async function buildDeliveryQuestionPool(riwaya:string,options:DeliveryPoolOptions={}):Promise<QuestionPoolItem[]>{
 const reading=deliveryReadingKey(riwaya);
 if(!reading)return [];
 const size=Math.max(1,Math.min(40,options.size??12));
 const seedBase=options.seedBase||`mizan-pool-${riwaya}`;
 const min=options.minAyahCount??4,max=options.maxAyahCount??8;

 const draws=await Promise.all(Array.from({length:size},(_,i)=>
  drawFairPassage(reading,{seed:`${seedBase}#${i}`,min,max,...(options.maxJuz?{juz:undefined}:{})})
 ));

 const items:QuestionPoolItem[]=[];
 const seen=new Set<string>();
 for(const d of draws){
  if(!d?.passage)continue;
  const p=d.passage;
  // النطاق المعتمد هو المرجع القاطع؛ والموروث maxJuz لا يُستعمل إلا حين لا نطاق.
  if(options.scope&&scopeAyahCount(options.scope)>0){
   if(!scopeContainsRange(options.scope,{surah:p.surah,ayah:p.startAyah},{surah:p.surah,ayah:p.endAyah}))continue;
  } else if(options.maxJuz&&p.juz&&p.juz>options.maxJuz)continue;
  const key=`${p.surah}:${p.startAyah}-${p.endAyah}`;
  if(seen.has(key))continue;                       // لا يتكرر الموضع نفسه في البنك
  seen.add(key);
  const vector=await fetchDifficulty(reading,p.surah,p.startAyah,p.endAyah);
  items.push({
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
   tajweedComplexity:'intermediate',
   timesUsed:0,
  });
 }
 return items;
}
