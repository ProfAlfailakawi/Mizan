import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ChevronDown,FileCheck2,FileSearch,GitBranch,MapPin,Pause,Type,Play} from 'lucide-react';
import {fetchDeliveryPassage,fetchMushafLayout,fetchOfficialMushafPage,findLayoutWord,loadKfgqpcOfficialQuranFont,officialMushafPackageForReading,type DeliveryPassage,type MushafPageLayout} from '../../lib/kfgqpc-library';
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
 const packageId=q.quranSourcePackageId||(delivery?officialMushafPackageForReading(readingKey):undefined);
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
 const [audioOpen,setAudioOpen]=useState(false);
 const [divergenceOpen,setDivergenceOpen]=useState(false);
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
 /*
  * موضعُ القارئ الحيّ بدقّة السطر: الكلمةُ التي عاد بها المستمعُ تُسقَط على سطرها من
  * تخطيط الصفحة، فتمشي العدسةُ مع القارئ سطرًا سطرًا بدل أن تغطّي الآيةَ كلّها.
  */
 const trackSpot=useMemo(()=>{
  if(!tracking?.ayah||!delivery)return null;
  const a=delivery.ayat.find(x=>x.ayah===tracking.ayah&&(!tracking.surah||x.surah===tracking.surah));if(!a)return null;
  const layout=layouts[a.page]||null;
  const hit=tracking.wordIndex?findLayoutWord(layout,a.surah,a.ayah,tracking.wordIndex):null;
  return {page:a.page,line:hit?.line||null,bbox:hit?.bbox||null,lineStart:a.lineStart,lineEnd:a.lineEnd,lineCount:layout?.lineCount||15};
 },[tracking?.ayah,tracking?.surah,tracking?.wordIndex,delivery,layouts]);
 /*
  * الصفحةُ على قدر الشاشة — تُحسب ولا تُترك لسلسلة نسب مئوية.
  *
  * كانت الصورةُ تُحدّ بـ«100%» من وعاءٍ لا ارتفاعَ محسومًا له، فتأخذ حجمها الطبيعي وتفيض،
  * ويضطرّ المحكّم إلى التمرير فوق وتحت، ويغطّي شريطُ الاستماع أسفلها. الآن يُقاس الوعاءُ
  * نفسُه، وتُعطى الصفحةُ أكبرَ مقاسٍ يدخل فيه كاملًا — لا تمرير ولا قصّ.
  */
 const bodyRef=useRef<HTMLDivElement|null>(null);
 const [fitBox,setFitBox]=useState<{w:number;h:number}|null>(null);
 useEffect(()=>{const el=bodyRef.current;if(!el||typeof ResizeObserver==='undefined'||!el.closest('.mizan-judge-os')){setFitBox(null);return}
  const measure=()=>setFitBox(b=>{const w=Math.floor(el.clientWidth),h=Math.floor(el.clientHeight);return b&&b.w===w&&b.h===h?b:{w,h}});
  measure();const ro=new ResizeObserver(measure);ro.observe(el);return()=>ro.disconnect()});
 const [pages,setPages]=useState<Record<number,string>>({});const [checked,setChecked]=useState(false);const [officialFont,setOfficialFont]=useState(false);
 useEffect(()=>{let live=true;const urls:string[]=[];setPages({});setChecked(false);if(!packageId||!loci.length){setChecked(true);return}void Promise.all(loci.map(async locus=>{const url=await fetchOfficialMushafPage(packageId,locus.page);if(url)urls.push(url);return [locus.page,url] as const})).then(results=>{if(!live){urls.forEach(URL.revokeObjectURL);return}setPages(Object.fromEntries(results.filter((x):x is readonly [number,string]=>!!x[1])));setChecked(true)});return()=>{live=false;urls.forEach(URL.revokeObjectURL)}},[packageId,loci.map(x=>`${x.page}:${x.lineStart}:${x.lineEnd}`).join('|')]);
 useEffect(()=>{let live=true;if(!isKfgqpcPackage){setOfficialFont(false);return()=>{live=false}}void loadKfgqpcOfficialQuranFont(packageId||'primary').then(ok=>{if(live)setOfficialFont(ok)});return()=>{live=false}},[packageId,isKfgqpcPackage]);
 const loadedLoci=loci.filter(x=>!!pages[x.page]);const hasOfficialPage=loadedLoci.length>0;const trackingLost=tracking?.alignmentState==='LOST'||tracking?.alignmentState==='REACQUIRING';
 return <div className="mizan-mushaf-surface relative overflow-hidden rounded-[30px] border border-[#dad7cd] bg-[#fdfbf5] shadow-[0_18px_55px_rgba(25,39,33,.055)]">
  <div className="mizan-mushaf-bar flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-[#e5e1d7] bg-[#f7f4ec]"><div className="flex items-center gap-2 min-w-0"><span className="w-8 h-8 rounded-xl bg-[#E7EEE9] text-[#214C40] grid place-items-center"><FileCheck2 className="w-4 h-4"/></span><div className="min-w-0"><div className="text-[10px] font-black truncate">{ar?'سطح المصحف':'MUSHAF SURFACE'}</div><div className="text-[9px] text-[#656a66] truncate">{readingText||'—'}</div></div></div><div className="flex items-center gap-2">{loci.length>1?<Badge variant="neutral">{ar?`${loci.length} صفحات`:`${loci.length} pages`}</Badge>:loci[0]&&<span className="text-[10px] font-black tabular-nums text-[#59615c]">{ar?'ص':'p.'} {loci[0].page}</span>}</div></div>
  {hasOfficialPage&&!textView?<div ref={bodyRef} className="mizan-mushaf-body relative bg-[#efede6] p-2 sm:p-3 overflow-hidden"><div className={`mizan-mushaf-pages mx-auto grid items-start gap-4 ${loadedLoci.length>1?(fitBox?'grid-cols-2':'lg:grid-cols-2'):'grid-cols-1'}`}>{loci.map(locus=>pages[locus.page]?<OfficialPage key={locus.page} url={pages[locus.page]} locus={locus} ar={ar} tracking={tracking} trackSpot={trackSpot?.page===locus.page?trackSpot:null} fit={fitBox?{w:(fitBox.w-(loadedLoci.length>1?16:0))/Math.max(1,loadedLoci.length>1?2:1),h:fitBox.h}:null} audioFocus={activeDeliveryAyah&&activeDeliveryAyah.page===locus.page?activeDeliveryAyah:null} audioSpot={audioSpot?.page===locus.page?audioSpot:null}/>:<MissingPage key={locus.page} page={locus.page} ar={ar}/>)}</div>{tracking&&<div className="mizan-mushaf-trackchip mt-3 flex items-center justify-end gap-3"><div className={`rounded-xl px-3 py-2 text-[9px] font-black flex items-center gap-2 ${trackingLost?'bg-[#F2EADC] text-[#725630]':'bg-[#E7EEE9] text-[#214C40]'}`}><MapPin className="w-3.5 h-3.5"/>{trackingLost?(ar?'جارٍ إعادة تحديد الموضع — المؤشر ثابت':'Reacquiring — pointer held'):(ar?`القارئ عند الآية ${tracking.ayah||'—'}`:`Reciter at ayah ${tracking.ayah||'—'}`)}</div></div>}</div>:<MushafSheet ar={ar} surahName={q.surahNameArabic||q.surahNameEnglish} startAyah={q.startAyah} endAyah={q.endAyah}
    loci={loci.map(x=>({page:x.page,lineStart:x.lineStart,lineEnd:x.lineEnd}))}
    ayat={delivery?delivery.ayat:undefined} fallbackText={displayText} officialFont={officialFont}
    activeAyah={activeAyah} activeWords={activeWords} activeWordIndex={active?.word??-1}
    tajweedOn={tajweedOn} onToggleTajweed={()=>setTajweedOn(v=>!v)} tajweedScopeNote={delivery?.tajweedScopeNote}
    sourceLabel={surfaceAuthorityLabel} loaded={checked}/>}
  {delivery&&audioOpen&&<div className="mizan-mushaf-drawer"><PassageAudio reading={readingKey} ayat={delivery.ayat} ar={ar} onActive={setActive}/></div>}
  {delivery&&divergenceOpen&&<div className="mizan-mushaf-drawer"><DivergenceRadar reading={readingKey} surah={delivery.surah} startAyah={delivery.startAyah} endAyah={delivery.endAyah} ar={ar}/></div>}
  <div className="mizan-mushaf-tools mizan-mushaf-bar px-4 sm:px-5 py-2 border-t border-[#e5e1d7] flex items-center justify-between gap-2 text-[9px] text-[#676c68]">
   <div className="flex min-w-0 flex-wrap items-center gap-1.5">
    {delivery&&<MushafToolButton pressed={audioOpen} onClick={()=>setAudioOpen(v=>!v)} icon={<Play className="w-3.5 h-3.5"/>} label={ar?'استمع':'Listen'}/>}
    {delivery&&<MushafToolButton pressed={divergenceOpen} onClick={()=>setDivergenceOpen(v=>!v)} icon={<GitBranch className="w-3.5 h-3.5"/>} label={ar?'المتشابهات':'Forks'}/>}
    {delivery&&hasOfficialPage&&<MushafToolButton pressed={textView} onClick={()=>setTextView(v=>!v)} icon={<Type className="w-3.5 h-3.5"/>} label={textView?(ar?'عرض الصفحة':'Page'):(ar?'عرض النص':'Text')}/>}
   </div>
   <span className="shrink-0 font-black">{hasOfficialPage&&!textView?(ar?'صفحة كاملة':'FULL-PAGE FIT'):(ar?'عرض النص':'TEXT VIEW')}</span>
  </div>
 </div>
}

const MushafToolButton:React.FC<{pressed:boolean;onClick:()=>void;icon:React.ReactNode;label:string}>=({pressed,onClick,icon,label})=>
 <button type="button" onClick={onClick} aria-pressed={pressed} className={`mizan-mushaf-tool inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[9px] font-black transition ${pressed?'border-[#bca46b] bg-[#efe4c6] text-[#214C40]':'border-[#d9d4c6] bg-white/35 text-[#59615c] hover:text-[#214C40]'}`}>
  {icon}<span>{label}</span><ChevronDown className={`w-3 h-3 transition ${pressed?'rotate-180':''}`}/>
 </button>;

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

type TrackSpot={page:number;line:number|null;bbox:{x:number;y:number;width:number;height:number}|null;lineStart:number;lineEnd:number;lineCount:number};
const OfficialPage:React.FC<{url:string;locus:QuranPageLocus;ar:boolean;tracking?:QuranAlignmentResult|null;trackSpot?:TrackSpot|null;fit?:{w:number;h:number}|null;audioFocus?:{page:number;lineStart:number;lineEnd:number}|null;audioSpot?:{bbox:{x:number;y:number;width:number;height:number}|null;line:number|null;lineCount:number|null}|null}>=({url,locus,ar,tracking,trackSpot,fit,audioFocus,audioSpot})=>{const [aspect,setAspect]=useState(0.64);
 const box=fit&&fit.w>0&&fit.h>0?(()=>{const h=Math.min(fit.h,fit.w/aspect);return {width:Math.floor(h*aspect),height:Math.floor(h)}})():null;
 const trackLost=tracking?.alignmentState==='LOST'||tracking?.alignmentState==='REACQUIRING';const live=tracking?.visualLocation?.page===locus.page?tracking.visualLocation:null;const liveLocus=live?.loci?.find(x=>x.page===locus.page);const focus=liveLocus||locus;const word=tracking?.wordVector?.page===locus.page&&tracking.wordVector.resolution==='VERIFIED_WORD_MAPPING'?tracking.wordVector.normalizedBBox:undefined;
 /* أشرطة الأسطر تُقاس من حبر الصفحة نفسها؛ متى تعذّر القياس بقيت العدسة على التقدير. */
 const bands=useLineBands(url,audioSpot?.lineCount||focus.lineCount||15);
 return <figure className="mizan-official-page relative mx-auto flex flex-col max-h-[70vh] max-w-full items-center justify-center" data-fit={box?'true':undefined}><div className="mizan-official-page__frame relative inline-block max-h-[70vh] max-w-full" style={box||undefined}><img src={url} onLoad={e=>{const i=e.currentTarget;if(i.naturalWidth&&i.naturalHeight)setAspect(i.naturalWidth/i.naturalHeight)}} alt={ar?`صفحة المصحف ${locus.page}`:`Mushaf page ${locus.page}`} className="mizan-mushaf-page block w-auto h-auto max-h-[70vh] max-w-full object-contain rounded-[2px] shadow-[0_10px_24px_rgba(0,0,0,.07)]" style={box?{width:'100%',height:'100%',maxHeight:'none'}:undefined}/>
  {!audioSpot&&!audioFocus&&trackSpot
   ? (trackSpot.bbox?<WordVectorLens bbox={trackSpot.bbox}/>:<FocusLens lineStart={trackSpot.line||trackSpot.lineStart} lineEnd={trackSpot.line||trackSpot.lineEnd} lineCount={trackSpot.lineCount} ar={ar} tone={trackLost?'held':'track'} bands={bands}/>)
   : audioSpot?.bbox
   ? <RecitingWordLens bbox={audioSpot.bbox}/>
   : audioSpot?.line
     ? <FocusLens lineStart={audioSpot.line} lineEnd={audioSpot.line} lineCount={audioSpot.lineCount||15} ar={ar} tone="audio" bands={bands}/>
     : audioFocus
       ? <FocusLens lineStart={audioFocus.lineStart} lineEnd={audioFocus.lineEnd} lineCount={15} ar={ar} tone="audio" bands={bands}/>
       : (focus.lineCount&&focus.lineCount>=focus.lineEnd
          ? <FocusLens lineStart={focus.lineStart} lineEnd={focus.lineEnd} lineCount={focus.lineCount} ar={ar} tone="track" bands={bands}/>
          : word?<WordVectorLens bbox={word}/>:null)}</div><figcaption className="mt-2 text-center text-[9px] font-black text-[#606661]">{ar?'الصفحة':'Page'} {locus.page}{!focus.lineCount?<span className="ms-2 font-normal text-[#696f6b]">{ar?'هندسة الأسطر غير متاحة — بلا تخمين':'line geometry unavailable — no guess'}</span>:null}</figcaption></figure>}
const MissingPage:React.FC<{page:number;ar:boolean}>=({page,ar})=><div className="min-h-44 rounded-2xl border border-dashed border-[#d1cec5] bg-[#f8f6f0] grid place-items-center text-center p-6"><div><FileSearch className="w-5 h-5 mx-auto text-[#646965]"/><div className="text-xs font-black mt-2">{ar?`صفحة المصحف ${page} غير مستوردة`:`Mushaf page ${page} is not imported`}</div><div className="text-[9px] text-[#686d6a] mt-1">{ar?'لا يُستخدم بديل من رواية أخرى.':'No cross-riwayah visual fallback.'}</div></div></div>;

const FocusLens:React.FC<{lineStart:number;lineEnd:number;lineCount:number;ar:boolean;tone?:'track'|'audio'|'held';bands?:LineBand[]|null}>=({lineStart,lineEnd,lineCount,ar,tone='track',bands})=>{const total=Math.max(1,lineCount),start=Math.max(1,Math.min(total,lineStart)),end=Math.max(start,Math.min(total,lineEnd));
 const measured=bands&&bands.length?bandSpan(bands,start,end):null;
 const textTop=8.5,textHeight=83;
 const top=measured?measured.top*100:textTop+((start-1)/total)*textHeight,height=measured?Math.max(1.6,measured.height*100):Math.max(2.4,((end-start+1)/total)*textHeight);
 /* العدسةُ تُرى من مقعد المحكّم: لونٌ دافئٌ واضحٌ يعلو السطر ولا يحجب حرفًا. */
 const c=tone==='audio'?{band:'border-[#B07A2A]/55 bg-[#E2B45C]/[0.22]',bar:'bg-[#9A6420]',glow:'rgba(176,122,42,.22)'}:tone==='held'?{band:'border-[#8b8676]/40 bg-[#8b8676]/[0.10]',bar:'bg-[#8b8676]',glow:'rgba(139,134,118,.14)'}:{band:'border-[#2F6555]/50 bg-[#5FA387]/[0.20]',bar:'bg-[#2F6555]',glow:'rgba(47,101,85,.20)'};
 return <div aria-label={tone==='audio'?(ar?'عدسة الآية الجاري تلاوتها':'Reciting-ayah lens'):(ar?'عدسة موضع الاختبار':'Passage focus lens')} className="pointer-events-none absolute inset-0"><div className={`absolute start-[4%] end-[4%] rounded-lg border ${c.band} transition-all duration-300 ease-out mix-blend-multiply`} style={{top:`${top}%`,height:`${height}%`}}/><div className={`absolute end-[1.5%] w-[5px] rounded-full ${c.bar} transition-all duration-300`} style={{top:`${top}%`,height:`${height}%`,boxShadow:`0 0 0 4px ${c.glow}`}}/></div>}
const RecitingWordLens:React.FC<{bbox:{x:number;y:number;width:number;height:number}}>=({bbox})=>
 <div aria-hidden className="pointer-events-none absolute rounded-[4px] bg-[#E2B45C]/[0.30] shadow-[0_0_0_2px_rgba(154,100,32,.55)] mix-blend-multiply transition-all duration-150 ease-out"
  style={{left:`${bbox.x*100}%`,top:`${bbox.y*100}%`,width:`${bbox.width*100}%`,height:`${bbox.height*100}%`}}/>;
const WordVectorLens:React.FC<{bbox:{x:number;y:number;width:number;height:number}}>=({bbox})=><div aria-hidden className="pointer-events-none absolute rounded-[4px] border-2 border-[#2F6555]/70 bg-[#5FA387]/[0.22] mix-blend-multiply transition-all duration-200" style={{left:`${bbox.x*100}%`,top:`${bbox.y*100}%`,width:`${bbox.width*100}%`,height:`${bbox.height*100}%`}}/>;
