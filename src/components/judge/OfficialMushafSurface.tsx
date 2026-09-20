import React,{useEffect,useMemo,useRef,useState} from 'react';
import {FileCheck2,FileSearch,MapPin,Pause,Type,Play} from 'lucide-react';
import {fetchDeliveryPassage,fetchMushafLayout,fetchOfficialMushafPage,findLayoutWord,loadKfgqpcOfficialQuranFont,type DeliveryPassage,type MushafPageLayout} from '../../lib/kfgqpc-library';
import type {QuranAlignmentResult,QuranPageLocus} from '../../lib/quran-intelligence';
import {Badge} from '../design-system/Badge';
import {DivergenceRadar} from './DivergenceRadar';
import {MushafSheet} from './MushafSheet';
import {measuredWordTimings,splitAyahWords,wordAtTime,type MeasuredSegment} from '../../lib/word-timing';
import {resolveReading} from '../../lib/scientific-core';
import {DELIVERY_READING_BY_RAWI as DELIVERY_READING_BY_RAWI_MAP} from '../../lib/delivered-readings';
import {qiraahLabel,rawiLabel,tariqLabel} from '../../lib/arabic-labels';
import {bandsFromInkProfile,bandSpan,inkProfileFromImage,type LineBand} from '../../lib/mushaf-line-bands';
import {REFERENCE_AUDIO_BUTTON_AR,REFERENCE_AUDIO_BUTTON_EN,referenceAudioPolicy} from '../../lib/reference-audio-policy';

/*
 * جدول الرواة المسلَّمين واحد لا اثنان.
 *
 * كانت هذه النسخة الثانية من الجدول نفسه، فإضافةُ روايةٍ في أحدهما تترك الآخر خلفه: يُسحب
 * الموضع من رواية ولا يجد سطحُ المصحف نصًّا لها. فصار المصدر واحدًا يُستورد.
 */
export { DELIVERED_RAWI_IDS } from '../../lib/delivered-readings';

/*
 * Narration name → delivery key, for the narrations MIZAN actually delivers.
 *
 * The canonical graph resolves a reading only when the display string maps to exactly one
 * transmission, and it refuses to choose when it does not — which is right for scientific
 * decisions. But addressing a delivery package is not a scientific decision, and when the graph
 * declines, the Mushaf surface was left with no text at all. This table is an explicit, auditable
 * list of the names we ship packages for; it never invents a narration, and a name outside it
 * still yields no delivery surface.
 */
const DELIVERY_READING_BY_RAWI=DELIVERY_READING_BY_RAWI_MAP;
const DELIVERY_READING_BY_NAME:Record<string,string>={
 hafs:'hafs','حفص':'hafs','hafsanasim':'hafs',
 warsh:'warsh','ورش':'warsh',
 shubah:'shubah','شعبة':'shubah',
 qalun:'qalun',qaloun:'qalun','قالون':'qalun',
 duri:'duri-abi-amr','aldurianabiamr':'duri-abi-amr','الدوري':'duri-abi-amr',
 susi:'susi-abi-amr',soosi:'susi-abi-amr','alsusi':'susi-abi-amr','السوسي':'susi-abi-amr',
 bazzi:'bazzi','albazzi':'bazzi','البزي':'bazzi',
 qunbul:'qunbul',qumbul:'qunbul','قنبل':'qunbul',
};
const readingNameKey=(v?:string)=>v?v.toLowerCase().replace(/['`’\-\s_]/g,'').replace(/[ًٌٍَُِّْ]/g,''):'';
/* Delivery package id per reading — used only to address the delivery surface (pages/fonts). */
const PACKAGE_BY_READING:Record<string,string>={hafs:'kfgqpc-hafs-uthmanic-v13',warsh:'kfgqpc-warsh-uthmanic-v6',shubah:'kfgqpc-shubah-uthmanic-v4',qalun:'kfgqpc-qaloun-uthmanic-v5','duri-abi-amr':'kfgqpc-douri-abu-amr-uthmanic-v3','susi-abi-amr':'kfgqpc-sousi-abu-amr-uthmanic-v3'};

/* Surah name → number, so a question that carries only a name can still address the delivery
   package. Returns undefined rather than guessing when the name is unknown. */
const SURAH_EN=['Al-Fatihah','Al-Baqarah','Ali Imran','An-Nisa','Al-Maidah','Al-Anam','Al-Araf','Al-Anfal','At-Tawbah','Yunus','Hud','Yusuf','Ar-Rad','Ibrahim','Al-Hijr','An-Nahl','Al-Isra','Al-Kahf','Maryam','Ta-Ha','Al-Anbiya','Al-Hajj','Al-Muminun','An-Nur','Al-Furqan','Ash-Shuara','An-Naml','Al-Qasas','Al-Ankabut','Ar-Rum','Luqman','As-Sajdah','Al-Ahzab','Saba','Fatir','Ya-Sin','As-Saffat','Sad','Az-Zumar','Ghafir','Fussilat','Ash-Shura','Az-Zukhruf','Ad-Dukhan','Al-Jathiyah','Al-Ahqaf','Muhammad','Al-Fath','Al-Hujurat','Qaf','Adh-Dhariyat','At-Tur','An-Najm','Al-Qamar','Ar-Rahman','Al-Waqiah','Al-Hadid','Al-Mujadila','Al-Hashr','Al-Mumtahanah','As-Saff','Al-Jumuah','Al-Munafiqun','At-Taghabun','At-Talaq','At-Tahrim','Al-Mulk','Al-Qalam','Al-Haqqah','Al-Maarij','Nuh','Al-Jinn','Al-Muzzammil','Al-Muddaththir','Al-Qiyamah','Al-Insan','Al-Mursalat','An-Naba','An-Naziat','Abasa','At-Takwir','Al-Infitar','Al-Mutaffifin','Al-Inshiqaq','Al-Buruj','At-Tariq','Al-Ala','Al-Ghashiyah','Al-Fajr','Al-Balad','Ash-Shams','Al-Layl','Ad-Duha','Ash-Sharh','At-Tin','Al-Alaq','Al-Qadr','Al-Bayyinah','Az-Zalzalah','Al-Adiyat','Al-Qariah','At-Takathur','Al-Asr','Al-Humazah','Al-Fil','Quraysh','Al-Maun','Al-Kawthar','Al-Kafirun','An-Nasr','Al-Masad','Al-Ikhlas','Al-Falaq','An-Nas'];
const norm=(v:string)=>v.replace(/[^a-z]/gi,'').toLowerCase();
export function surahNumberFromName(en?:string,ar?:string):number|undefined{
 if(en){const i=SURAH_EN.findIndex(x=>norm(x)===norm(en));if(i>=0)return i+1}
 if(ar){const a=ar.replace(/[ً-ْ\s]/g,'');const i=SURAH_AR.findIndex(x=>x.replace(/[ً-ْ\s]/g,'')===a);if(i>=0)return i+1}
 return undefined}
/* الاتجاه المعاكس، من القائمة نفسها: اسمان للسورة الواحدة في مكانين يفترقان عند أول تعديل. */
export const surahNameArabic=(n:number):string|undefined=>SURAH_AR[n-1];
const SURAH_AR=['الفاتحة','البقرة','آل عمران','النساء','المائدة','الأنعام','الأعراف','الأنفال','التوبة','يونس','هود','يوسف','الرعد','إبراهيم','الحجر','النحل','الإسراء','الكهف','مريم','طه','الأنبياء','الحج','المؤمنون','النور','الفرقان','الشعراء','النمل','القصص','العنكبوت','الروم','لقمان','السجدة','الأحزاب','سبأ','فاطر','يس','الصافات','ص','الزمر','غافر','فصلت','الشورى','الزخرف','الدخان','الجاثية','الأحقاف','محمد','الفتح','الحجرات','ق','الذاريات','الطور','النجم','القمر','الرحمن','الواقعة','الحديد','المجادلة','الحشر','الممتحنة','الصف','الجمعة','المنافقون','التغابن','الطلاق','التحريم','الملك','القلم','الحاقة','المعارج','نوح','الجن','المزمل','المدثر','القيامة','الإنسان','المرسلات','النبأ','النازعات','عبس','التكوير','الانفطار','المطففين','الانشقاق','البروج','الطارق','الأعلى','الغاشية','الفجر','البلد','الشمس','الليل','الضحى','الشرح','التين','العلق','القدر','البينة','الزلزلة','العاديات','القارعة','التكاثر','العصر','الهمزة','الفيل','قريش','الماعون','الكوثر','الكافرون','النصر','المسد','الإخلاص','الفلق','الناس'];

/*
 * الرواية → مفتاح حزمة التسليم. مُصدَّر ليستعمله من يحتاج نفس نص المقطع الذي يعرضه هذا السطح
 * (إعادة التشغيل مثلًا)، فلا يتفرّع نصّان لنفس الموضع.
 */
export function deliveryReadingKeyFor(input:{qiraah?:string;rawi?:string;riwaya?:string}):string{
 const rawiText=input.rawi||input.riwaya;
 const reading=resolveReading({qiraah:input.qiraah,rawi:rawiText,riwaya:rawiText});
 return DELIVERY_READING_BY_RAWI[reading?.rawiId||'']||DELIVERY_READING_BY_NAME[readingNameKey(rawiText)]||'';
}

export interface MushafSurfaceQuestion{
 expectedTextArabic:string;surahNameArabic?:string;surahNameEnglish?:string;surahNumber?:number;startAyah:number;endAyah:number;quranSourcePackageId?:string;quranSourcePackageHash?:string;pageNumber?:number;lineStart?:number;lineEnd?:number;pageLoci?:QuranPageLocus[];locationAssurance?:string;officialSurfaceAuthority?:string;officialSurfaceMode?:string;rawi?:string;
 /** Legacy display string carried by the question pool (e.g. "Hafs"); resolved to a canonical rawi. */
 riwaya?:string;qiraah?:string;tariq?:string
}

export const OfficialMushafSurface:React.FC<{question:MushafSurfaceQuestion;ar:boolean;tracking?:QuranAlignmentResult|null}>=({question:q,ar,tracking})=>{
 const rawiText=q.rawi||q.riwaya;
 const reading=resolveReading({qiraah:q.qiraah,rawi:rawiText,riwaya:rawiText});const readingText=reading?`${qiraahLabel(reading,ar)} · ${rawiLabel(reading,ar)}${q.tariq?` · ${tariqLabel(q.tariq,ar)}`:''}`:[rawiText,q.qiraah,q.tariq].filter(Boolean).join(' · ');
 const readingKey=DELIVERY_READING_BY_RAWI[reading?.rawiId||'']||DELIVERY_READING_BY_NAME[readingNameKey(rawiText)]||'';
 const [delivery,setDelivery]=useState<DeliveryPassage|null>(null);
 useEffect(()=>{let live=true;setDelivery(null);
  if(!q.startAyah||!q.endAyah)return;
  const surah=q.surahNumber??surahNumberFromName(q.surahNameEnglish,q.surahNameArabic);
  if(!surah)return;
  void fetchDeliveryPassage(readingKey,surah,q.startAyah,q.endAyah).then(p=>{if(live)setDelivery(p)});
  return()=>{live=false}},[readingKey,q.surahNumber,q.surahNameEnglish,q.startAyah,q.endAyah]);

 const loci=useMemo<QuranPageLocus[]>(()=>{
  if(q.pageLoci?.length)return q.pageLoci;
  if(q.pageNumber&&q.lineStart)return [{page:q.pageNumber,lineStart:q.lineStart,lineEnd:q.lineEnd||q.lineStart,lineCount:undefined}];
  if(delivery?.loci?.length)return delivery.loci.map(x=>({page:x.page,lineStart:x.lineStart,lineEnd:x.lineEnd,lineCount:15}));
  return [];
 },[q.pageLoci,q.pageNumber,q.lineStart,q.lineEnd,delivery]);
 const packageId=q.quranSourcePackageId||(delivery?PACKAGE_BY_READING[readingKey]:undefined);
 const isKfgqpcPackage=!!packageId?.startsWith('kfgqpc-');
 /*
  * سلطةُ المصدر تُقرأ من الحزمة التي جاء منها النصّ فعلًا.
  *
  * كان السطر يستنتجها من معرّف الحزمة وحده، فكل ما ليس KFGQPC يظهر بوسمٍ عامّ «مصدر
  * مسجّل» — واسمُ الناشر الحقيقي مفقود. وميزان يُسلّم اليوم نصوصًا من ناشرَين، فالوسم
  * العامّ يخفي أيّهما بين يدَي المحكّم. والتسليم يعيد إسنادَه مع كل مقطع، فيُقرأ منه.
  */
 const surfaceAuthority=(q.officialSurfaceAuthority||delivery?.provenance?.authority||(isKfgqpcPackage?'KFGQPC':'')).trim();
 const surfaceAuthorityLabel=surfaceAuthority|| (ar?'مصدر مسجّل':'REGISTERED SOURCE');
 const displayText=delivery?.text||q.expectedTextArabic;
 const [tajweedOn,setTajweedOn]=useState(false);
 const [textView,setTextView]=useState(false);
 const [active,setActive]=useState<{ayah:number;word:number}|null>(null);
 const activeAyah=active?.ayah??null;
 const activeDeliveryAyah=useMemo(()=>delivery?.ayat.find(a=>a.ayah===activeAyah)||null,[delivery,activeAyah]);
 const activeWords=useMemo(()=>activeDeliveryAyah?splitAyahWords(activeDeliveryAyah.text):[],[activeDeliveryAyah]);
 const [layouts,setLayouts]=useState<Record<number,MushafPageLayout|null>>({});
 useEffect(()=>{let live=true;const pages=loci.map(x=>x.page);if(!pages.length)return;
  void Promise.all(pages.map(async p=>[p,await fetchMushafLayout(p)] as const)).then(rows=>{if(live)setLayouts(Object.fromEntries(rows))});
  return()=>{live=false}},[loci.map(x=>x.page).join(',')]);
 const audioSpot=useMemo(()=>{
  if(!activeDeliveryAyah||!active||active.word<0)return null;
  const layout=layouts[activeDeliveryAyah.page]||null;
  const hit=findLayoutWord(layout,activeDeliveryAyah.surah,activeDeliveryAyah.ayah,active.word);
  if(!hit)return null;
  return {page:activeDeliveryAyah.page,bbox:hit.bbox||null,line:hit.line||null,lineCount:layout?.lineCount||null};
 },[layouts,activeDeliveryAyah,active]);
 const [pages,setPages]=useState<Record<number,string>>({});const [checked,setChecked]=useState(false);const [officialFont,setOfficialFont]=useState(false);
 useEffect(()=>{let live=true;const urls:string[]=[];setPages({});setChecked(false);if(!packageId||!loci.length){setChecked(true);return}void Promise.all(loci.map(async locus=>{const url=await fetchOfficialMushafPage(packageId,locus.page);if(url)urls.push(url);return [locus.page,url] as const})).then(results=>{if(!live){urls.forEach(URL.revokeObjectURL);return}setPages(Object.fromEntries(results.filter((x):x is readonly [number,string]=>!!x[1])));setChecked(true)});return()=>{live=false;urls.forEach(URL.revokeObjectURL)}},[packageId,loci.map(x=>`${x.page}:${x.lineStart}:${x.lineEnd}`).join('|')]);
 useEffect(()=>{let live=true;if(!isKfgqpcPackage){setOfficialFont(false);return()=>{live=false}}void loadKfgqpcOfficialQuranFont(packageId||'primary').then(ok=>{if(live)setOfficialFont(ok)});return()=>{live=false}},[packageId,isKfgqpcPackage]);
 const loadedLoci=loci.filter(x=>!!pages[x.page]);const hasOfficialPage=loadedLoci.length>0;const trackingLost=tracking?.alignmentState==='LOST'||tracking?.alignmentState==='REACQUIRING';
 return <div className="mizan-mushaf-surface relative overflow-hidden rounded-[30px] border border-[#dad7cd] bg-[#fdfbf5] shadow-[0_18px_55px_rgba(25,39,33,.055)]">
  <div className="mizan-mushaf-bar flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-[#e5e1d7] bg-[#f7f4ec]"><div className="flex items-center gap-2 min-w-0"><span className="w-8 h-8 rounded-xl bg-[#E7EEE9] text-[#214C40] grid place-items-center"><FileCheck2 className="w-4 h-4"/></span><div className="min-w-0"><div className="text-[10px] font-black truncate">{ar?'سطح المصحف':'MUSHAF SURFACE'}</div><div className="text-[9px] text-[#656a66] truncate">{readingText||'—'}</div></div></div><div className="flex items-center gap-2"><Badge variant="emerald">{ar?`المصدر: ${surfaceAuthorityLabel}`:`SOURCE: ${surfaceAuthorityLabel}`}</Badge>{loci.length>1?<Badge variant="neutral">{ar?`${loci.length} صفحات`:`${loci.length} pages`}</Badge>:loci[0]&&<span className="text-[10px] font-black tabular-nums text-[#59615c]">{ar?'ص':'p.'} {loci[0].page}</span>}</div></div>
  {hasOfficialPage&&!textView?<div className="mizan-mushaf-body relative bg-[#efede6] p-3 sm:p-5"><div className={`mx-auto grid gap-4 ${loadedLoci.length>1?'lg:grid-cols-2':'grid-cols-1'}`}>{loci.map(locus=>pages[locus.page]?<OfficialPage key={locus.page} url={pages[locus.page]} locus={locus} ar={ar} tracking={tracking} audioFocus={activeDeliveryAyah&&activeDeliveryAyah.page===locus.page?activeDeliveryAyah:null} audioSpot={audioSpot?.page===locus.page?audioSpot:null}/>:<MissingPage key={locus.page} page={locus.page} ar={ar}/>)}</div>{tracking&&<div className="mt-3 flex items-center justify-end gap-3"><div className={`rounded-xl px-3 py-2 text-[9px] font-black flex items-center gap-2 ${trackingLost?'bg-[#F2EADC] text-[#725630]':'bg-[#E7EEE9] text-[#214C40]'}`}><MapPin className="w-3.5 h-3.5"/>{trackingLost?(ar?'جارٍ إعادة تحديد الموضع — المؤشر ثابت':'Reacquiring — pointer held'):(ar?`تتبّع حي · آية ${tracking.ayah||'—'}`:`Live tracking · ayah ${tracking.ayah||'—'}`)}</div></div>}</div>:<MushafSheet ar={ar} surahName={q.surahNameArabic||q.surahNameEnglish} startAyah={q.startAyah} endAyah={q.endAyah}
    loci={loci.map(x=>({page:x.page,lineStart:x.lineStart,lineEnd:x.lineEnd}))}
    ayat={delivery?delivery.ayat:undefined} fallbackText={displayText} officialFont={officialFont}
    activeAyah={activeAyah} activeWords={activeWords} activeWordIndex={active?.word??-1}
    tajweedOn={tajweedOn} onToggleTajweed={()=>setTajweedOn(v=>!v)} tajweedScopeNote={delivery?.tajweedScopeNote}
    sourceLabel={surfaceAuthorityLabel} loaded={checked}/>}
  {delivery&&<PassageAudio reading={readingKey} ayat={delivery.ayat} ar={ar} onActive={setActive}/>}
  {delivery&&<DivergenceRadar reading={readingKey} surah={delivery.surah} startAyah={delivery.startAyah} endAyah={delivery.endAyah} ar={ar}/>}
  <div className="mizan-mushaf-bar px-4 sm:px-5 py-3 border-t border-[#e5e1d7] flex items-center justify-between gap-3 text-[9px] text-[#676c68]"><span className="font-mono truncate">{q.quranSourcePackageHash?`SHA-256 ${q.quranSourcePackageHash.slice(0,18)}…`:surfaceAuthorityLabel}</span><span className="flex items-center gap-3">{delivery&&hasOfficialPage&&<button type="button" onClick={()=>setTextView(v=>!v)} aria-pressed={textView} className="min-h-11 px-2.5 -my-3 inline-flex items-center gap-1.5 text-[9px] font-black text-[#59615c] hover:text-[#214C40]"><Type className="w-3.5 h-3.5"/>{textView?(ar?'عرض الصفحة':'Page view'):(ar?'عرض النص':'Text view')}</button>}<span>{hasOfficialPage&&!textView?(ar?'صفحة المصدر + عدسة منفصلة':'SOURCE PAGE + SEPARATE LENS'):officialFont?(ar?'نص وخط من المصدر':'SOURCE TEXT + FONT'):(ar?'نص من المصدر':'SOURCE TEXT')}</span></span></div>
 </div>
}

/*
 * Reference recitation is deliberately decoupled from the displayed riwayah. Product policy uses
 * one Hafs recording for all twenty rawis. It is never evidence for the displayed reading and
 * never affects scoring. Hafs word timing is projected only when the displayed text is Hafs;
 * other readings receive ayah-level focus so Hafs timing cannot be mistaken for their word map.
 */
export const PassageAudio:React.FC<{reading:string;ayat:{surah:number;ayah:number;text?:string}[];ar:boolean;onActive?:(state:{ayah:number;word:number}|null)=>void}>=({reading,ayat,ar,onActive})=>{
 const audioPolicy=referenceAudioPolicy(reading);
 const audioId=audioPolicy.audioId;
 const allowWordTiming=audioPolicy.mayProjectWordTiming;
 const [index,setIndex]=useState(0);const [playing,setPlaying]=useState(false);const [available,setAvailable]=useState<boolean|null>(null);
 const [posMs,setPosMs]=useState(0);const [durMs,setDurMs]=useState(0);
 const elRef=useRef<HTMLAudioElement|null>(null);
 const src=ayat[index]?`/api/public/kfgqpc/audio/${audioId}/${ayat[index].surah}/${ayat[index].ayah}`:'';
 useEffect(()=>{setIndex(0);setPlaying(false)},[reading,ayat.map(a=>`${a.surah}:${a.ayah}`).join('|')]);
 useEffect(()=>{if(!ayat.length){setAvailable(false);return}let live=true;
  void fetch(`/api/public/kfgqpc/audio/${audioId}/${ayat[0].surah}/${ayat[0].ayah}`,{method:'HEAD'}).then(r=>{if(live)setAvailable(r.ok)}).catch(()=>{if(live)setAvailable(false)});
  return()=>{live=false}},[audioId,ayat.length&&`${ayat[0].surah}:${ayat[0].ayah}`]);
 useEffect(()=>{const el=elRef.current;if(!el)return;if(playing)void el.play().catch(()=>setPlaying(false));else el.pause()},[playing,index,src]);
 useEffect(()=>{const el=elRef.current;if(!el||!playing)return;let raf=0;
  const tick=()=>{setPosMs(el.currentTime*1000);raf=requestAnimationFrame(tick)};raf=requestAnimationFrame(tick);
  return()=>cancelAnimationFrame(raf)},[playing,index]);
 const [segments,setSegments]=useState<MeasuredSegment[]|undefined>(undefined);
 const current=ayat[index];
 useEffect(()=>{
  setSegments(undefined);
  if(!allowWordTiming||!current)return;let live=true;
  void fetch(`/api/public/kfgqpc/word-timings/${audioId}/${current.surah}/${current.ayah}`,{cache:'force-cache'})
   .then(r=>r.ok?r.json():null)
   .then(b=>{if(live&&Array.isArray(b?.segments))setSegments(b.segments as MeasuredSegment[])})
   .catch(()=>{/* غياب التوقيت المقيس ليس خطأً يُعرض؛ التقدير يعمل لحفص فقط */});
  return()=>{live=false}},[audioId,allowWordTiming,current&&`${current.surah}:${current.ayah}`]);
 const timing=useMemo(()=>measuredWordTimings(allowWordTiming?(current?.text||''):'',durMs,allowWordTiming?segments:undefined).model,[allowWordTiming,current,durMs,segments]);
 const measured=allowWordTiming&&timing.assurance==='MEASURED_ALIGNED';
 const word=playing&&allowWordTiming?wordAtTime(timing,posMs):-1;
 useEffect(()=>{onActive?.(playing&&ayat[index]?{ayah:ayat[index].ayah,word}:null)},[playing,index,ayat,word,onActive]);
 useEffect(()=>()=>onActive?.(null),[onActive]);
 if(!ayat.length||available===false)return null;
 const onEnded=()=>{setPosMs(0);setPlaying(false);setIndex(0)};
 const progress=durMs>0?Math.min(1,posMs/durMs):0;
 return <div className="mizan-mushaf-bar px-4 sm:px-5 py-3 border-t border-[#e5e1d7] bg-[#f7f4ec]">
  <div className="flex items-center justify-between gap-3">
   <div className="flex items-center gap-3 min-w-0">
    <button type="button" onClick={()=>setPlaying(p=>!p)} aria-label={ar?REFERENCE_AUDIO_BUTTON_AR:REFERENCE_AUDIO_BUTTON_EN}
     className="w-11 h-11 rounded-xl bg-[#214C40] text-white grid place-items-center shrink-0">{playing?<Pause className="w-4 h-4"/>:<Play className="w-4 h-4"/>}</button>
    <div className="min-w-0"><div className="text-[10px] font-black truncate">{ar?REFERENCE_AUDIO_BUTTON_AR:REFERENCE_AUDIO_BUTTON_EN}</div>
     <div className="text-[9px] text-[#656a66] truncate">{ar?`آية ${ayat[0]?.ayah} · تتوقف بعدها`:`Ayah ${ayat[0]?.ayah} · stops after it`}</div></div>
   </div>
   {playing&&allowWordTiming&&timing.words.length>0&&<span className={`shrink-0 rounded-lg px-2 py-1 text-[8px] font-black ${measured?'bg-[#E7EEE9] text-[#214C40]':'bg-[#efe7d8] text-[#6f5733]'}`}>
    {measured?(ar?'تتبّع الكلمة مقيس':'Word tracking measured'):(ar?'تتبّع الكلمة تقديري':'Word tracking estimated')}</span>}
  </div>
  <div className="mt-2.5 h-[3px] rounded-full bg-[#e3ded1] overflow-hidden"><div className="h-full bg-[#214C40] transition-[width] duration-100" style={{width:`${progress*100}%`}}/></div>
  <audio ref={elRef} src={src} onEnded={onEnded} preload="none"
   onLoadedMetadata={e=>setDurMs((e.currentTarget.duration||0)*1000)}
   onSeeked={e=>setPosMs(e.currentTarget.currentTime*1000)}/>
 </div>}

const bandsCache=new Map<string,LineBand[]>();
const useLineBands=(url:string,expectedLines?:number)=>{
 const [bands,setBands]=useState<LineBand[]|null>(()=>bandsCache.get(`${url}|${expectedLines||''}`)||null);
 useEffect(()=>{
  const key=`${url}|${expectedLines||''}`;
  const cached=bandsCache.get(key);
  if(cached){setBands(cached);return}
  if(!url||typeof document==='undefined'){setBands(null);return}
  let live=true;const img=new Image();
  img.onload=()=>{
   if(!live)return;
   const ink=inkProfileFromImage(img,img.naturalWidth,img.naturalHeight);
   const found=ink?bandsFromInkProfile(ink,{expectedLines}):[];
   if(found.length)bandsCache.set(key,found);
   setBands(found.length?found:null);
  };
  img.onerror=()=>{if(live)setBands(null)};
  img.src=url;
  return()=>{live=false};
 },[url,expectedLines]);
 return bands;
};

const OfficialPage:React.FC<{url:string;locus:QuranPageLocus;ar:boolean;tracking?:QuranAlignmentResult|null;audioFocus?:{page:number;lineStart:number;lineEnd:number}|null;audioSpot?:{bbox:{x:number;y:number;width:number;height:number}|null;line:number|null;lineCount:number|null}|null}>=({url,locus,ar,tracking,audioFocus,audioSpot})=>{const live=tracking?.visualLocation?.page===locus.page?tracking.visualLocation:null;const liveLocus=live?.loci?.find(x=>x.page===locus.page);const focus=liveLocus||locus;const word=tracking?.wordVector?.page===locus.page&&tracking.wordVector.resolution==='VERIFIED_WORD_MAPPING'?tracking.wordVector.normalizedBBox:undefined;
 /* أشرطة الأسطر تُقاس من حبر الصفحة نفسها؛ متى تعذّر القياس بقيت العدسة على التقدير. */
 const bands=useLineBands(url,audioSpot?.lineCount||focus.lineCount||15);
 return <figure className="relative mx-auto w-fit"><div className="relative inline-block"><img src={url} alt={ar?`صفحة المصحف ${locus.page}`:`Mushaf page ${locus.page}`} className="mizan-mushaf-page block w-auto rounded-[2px] shadow-[0_12px_28px_rgba(0,0,0,.08)]"/>
  {audioSpot?.bbox
   ? <RecitingWordLens bbox={audioSpot.bbox}/>
   : audioSpot?.line
     ? <FocusLens lineStart={audioSpot.line} lineEnd={audioSpot.line} lineCount={audioSpot.lineCount||15} ar={ar} tone="audio" bands={bands}/>
     : audioFocus
       ? <FocusLens lineStart={audioFocus.lineStart} lineEnd={audioFocus.lineEnd} lineCount={15} ar={ar} tone="audio" bands={bands}/>
       : (focus.lineCount&&focus.lineCount>=focus.lineEnd
          ? <FocusLens lineStart={focus.lineStart} lineEnd={focus.lineEnd} lineCount={focus.lineCount} ar={ar} tone="track" bands={bands}/>
          : word?<WordVectorLens bbox={word}/>:null)}</div><figcaption className="mt-2 text-center text-[9px] font-black text-[#606661]">{ar?'الصفحة':'Page'} {locus.page}{!focus.lineCount?<span className="ms-2 font-normal text-[#696f6b]">{ar?'هندسة الأسطر غير متاحة — بلا تخمين':'line geometry unavailable — no guess'}</span>:null}</figcaption></figure>}
const MissingPage:React.FC<{page:number;ar:boolean}>=({page,ar})=><div className="min-h-44 rounded-2xl border border-dashed border-[#d1cec5] bg-[#f8f6f0] grid place-items-center text-center p-6"><div><FileSearch className="w-5 h-5 mx-auto text-[#646965]"/><div className="text-xs font-black mt-2">{ar?`صفحة المصدر ${page} غير مستوردة`:`Source page ${page} is not imported`}</div><div className="text-[9px] text-[#686d6a] mt-1">{ar?'لا يُستخدم بديل من رواية أخرى.':'No cross-riwayah visual fallback.'}</div></div></div>;

const FocusLens:React.FC<{lineStart:number;lineEnd:number;lineCount:number;ar:boolean;tone?:'track'|'audio';bands?:LineBand[]|null}>=({lineStart,lineEnd,lineCount,ar,tone='track',bands})=>{const total=Math.max(1,lineCount),start=Math.max(1,Math.min(total,lineStart)),end=Math.max(start,Math.min(total,lineEnd));
 const measured=bands&&bands.length?bandSpan(bands,start,end):null;
 const textTop=8.5,textHeight=83;
 const top=measured?measured.top*100:textTop+((start-1)/total)*textHeight,height=measured?Math.max(1.6,measured.height*100):Math.max(2.4,((end-start+1)/total)*textHeight);
 const c=tone==='audio'?{band:'border-[#8A5A2B]/30 bg-[#8A5A2B]/[0.05]',bar:'bg-[#8A5A2B]',glow:'rgba(138,90,43,.10)'}:{band:'border-[#2F6555]/25 bg-[#2F6555]/[0.035]',bar:'bg-[#2F6555]',glow:'rgba(47,101,85,.08)'};
 return <div aria-label={tone==='audio'?(ar?'عدسة الآية الجاري تلاوتها':'Reciting-ayah lens'):(ar?'عدسة موضع الاختبار':'Passage focus lens')} className="pointer-events-none absolute inset-0"><div className={`absolute start-[7%] end-[7%] rounded-md border-y ${c.band} transition-all duration-300`} style={{top:`${top}%`,height:`${height}%`}}/><div className={`absolute end-[3.5%] w-[3px] rounded-full ${c.bar} transition-all duration-300`} style={{top:`${top}%`,height:`${height}%`,boxShadow:`0 0 0 4px ${c.glow}`}}/></div>}
const RecitingWordLens:React.FC<{bbox:{x:number;y:number;width:number;height:number}}>=({bbox})=>
 <div aria-hidden className="pointer-events-none absolute rounded-[3px] bg-[#C8922F]/[0.16] shadow-[0_0_0_1.5px_rgba(138,90,43,.42)] transition-all duration-150 ease-out"
  style={{left:`${bbox.x*100}%`,top:`${bbox.y*100}%`,width:`${bbox.width*100}%`,height:`${bbox.height*100}%`}}/>;
const WordVectorLens:React.FC<{bbox:{x:number;y:number;width:number;height:number}}>=({bbox})=><div aria-hidden className="pointer-events-none absolute rounded-sm border-2 border-[#2F6555]/55 bg-[#2F6555]/[0.025] transition-all duration-200" style={{left:`${bbox.x*100}%`,top:`${bbox.y*100}%`,width:`${bbox.width*100}%`,height:`${bbox.height*100}%`}}/>;
