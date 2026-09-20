import type {QuestionPoolItem} from '../types';
import {drawFairPassage,fetchDifficulty} from './kfgqpc-library';
import {resolveReading} from './scientific-core';
import {DELIVERY_READING_BY_RAWI} from './delivered-readings';
import {isReadingQuestionSafe} from './quran-crosswalk-readiness';
import type {QuranScope} from './quran-scope';
import {buildPoolItems,selectPoolPassages} from './delivery-question-pool-core';

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

/* الجدول في وحدةٍ طرفية يقرأها هذا الملف والجاهزية معًا — انظر `delivered-readings.ts`. */
export { DELIVERY_READING_BY_RAWI, DELIVERED_RAWI_IDS } from './delivered-readings';

export function deliveryReadingKey(riwaya?:string,qiraah?:string):string|null{
 const reading=resolveReading({rawi:riwaya,riwaya,qiraah});
 if(!reading)return null;
 return DELIVERY_READING_BY_RAWI[reading.rawiId]||null;
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
 /* لا يُولَّد موضعٌ لرواية لا يُحلّ إحداثيها القانوني إلى ترقيمها الأصلي. الفراغ هنا
    مقصود ومكشوف: فحصُ ما قبل الانطلاق يمنع الفئة أصلًا ويسمّي السبب. */
 if(!isReadingQuestionSafe({riwaya}))return [];
 const size=Math.max(1,Math.min(40,options.size??12));
 const seedBase=options.seedBase||`mizan-pool-${riwaya}`;
 const min=options.minAyahCount??4,max=options.maxAyahCount??8;

 const draws=await Promise.all(Array.from({length:size},(_,i)=>
  drawFairPassage(reading,{seed:`${seedBase}#${i}`,min,max,...(options.maxJuz?{juz:undefined}:{})})
 ));

 /*
  * الترشيحُ أوّلًا بلا انتظار، ثم موجةُ قياسٍ واحدة.
  *
  * كان `await fetchDifficulty(...)` داخل حلقة الترشيح، فأربعةَ عشرَ نداءً تمشي واحدًا بعد
  * واحد ولا يبدأ اللاحقُ قبل أن يعود السابق. وعلى شبكةٍ حقيقية يكون ثمنُ ذلك زمنَ الذهاب
  * والإياب مضروبًا في عددها — والمحكّم واقفٌ أمام متسابقه ينتظر شاشةً لا تتحرّك، فيضغط
  * الزرَّ مرّتين. (قِيس على الخادم المحلّي: ١٤ نداءً بالتتابع ٥٢ms وبموجةٍ واحدة ٣٥ms؛
  * والفارقُ يتضاعف بزمن الشبكة لا بزمن الخادم.)
  *
  * والترتيبُ والتكرار لا يتغيّران — وكلاهما مُقاسٌ في `delivery-question-pool-core`.
  */
 const picked=selectPoolPassages(draws,{scope:options.scope,maxJuz:options.maxJuz});
 return buildPoolItems(picked,riwaya,reading,p=>fetchDifficulty(reading,p.surah,p.startAyah,p.endAyah));
}
