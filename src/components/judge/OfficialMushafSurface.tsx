import React,{useEffect,useMemo,useRef,useState} from 'react';
import {FileCheck2,FileSearch,MapPin,Highlighter,Pause,Type,Play,ShieldCheck} from 'lucide-react';
import {fetchDeliveryPassage,fetchMushafLayout,fetchOfficialMushafPage,findLayoutWordBox,loadKfgqpcOfficialQuranFont,type DeliveryPassage,type MushafPageLayout} from '../../lib/kfgqpc-library';
import type {QuranAlignmentResult,QuranPageLocus} from '../../lib/quran-intelligence';
import {Badge} from '../design-system/Badge';
import {DivergenceRadar} from './DivergenceRadar';
import {TajweedAyah,TajweedAyahWords,TajweedLegend} from './TajweedText';
import {proportionalWordTimings,splitAyahWords,wordAtTime} from '../../lib/word-timing';
import {resolveReading} from '../../lib/scientific-core';
import {qiraahLabel,rawiLabel,tariqLabel} from '../../lib/arabic-labels';

/* Canonical rawi id (scientific-core) → delivery reading key. Only narrations with an ingested
   delivery package appear here; anything else resolves to no delivery surface. */
const DELIVERY_READING_BY_RAWI:Record<string,string>={hafs:'hafs',warsh:'warsh',shubah:'shubah',qalun:'qalun','al-duri-abu-amr':'duri-abi-amr','al-susi':'susi-abi-amr'};

/*
 * Narration name → delivery key, for the six narrations MIZAN actually delivers.
 *
 * The canonical graph resolves a reading only when the display string maps to exactly one
 * transmission, and it refuses to choose when it does not — which is right for scientific
 * decisions. But addressing a delivery package is not a scientific decision, and when the graph
 * declines, the Mushaf surface was left with no text at all. This table is an explicit, auditable
 * list of the names we ship packages for; it never invents a narration, and a name outside it
 * still yields no delivery surface.
 */
const DELIVERY_READING_BY_NAME:Record<string,string>={
 hafs:'hafs','حفص':'hafs','hafsanasim':'hafs',
 warsh:'warsh','ورش':'warsh',
 shubah:'shubah','شعبة':'shubah',
 qalun:'qalun',qaloun:'qalun','قالون':'qalun',
 duri:'duri-abi-amr','aldurianabiamr':'duri-abi-amr','الدوري':'duri-abi-amr',
 susi:'susi-abi-amr',soosi:'susi-abi-amr','alsusi':'susi-abi-amr','السوسي':'susi-abi-amr',
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
 // The question pool carries the narration as the legacy `riwaya` display string, while secure
 // questions carry `rawi`. Reading either keeps the surface working for both without guessing.
 const rawiText=q.rawi||q.riwaya;
 const reading=resolveReading({qiraah:q.qiraah,rawi:rawiText,riwaya:rawiText});const readingText=reading?`${qiraahLabel(reading,ar)} · ${rawiLabel(reading,ar)}${q.tariq?` · ${tariqLabel(q.tariq,ar)}`:''}`:[rawiText,q.qiraah,q.tariq].filter(Boolean).join(' · ');
 /*
  * Delivery-layer resolution.
  *
  * A question may arrive without certified Source Vault text (development fixtures, or a venue
  * where the vault is not mounted). Rather than showing a placeholder sentence where the Quran
  * should be, resolve the exact passage for THIS reading from the R2 delivery package: real
  * Uthmanic text plus the official page/line loci that drive the page images and the focus lens.
  * Reading-isolated by construction — the server resolves only the requested narration.
  */
 // Canonical rawi id → delivery reading key. Unknown/ambiguous readings fall back to no delivery
 // resolution rather than guessing a narration.
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
 const displayText=delivery?.text||q.expectedTextArabic;
 // Tajweed is off by default: during a recitation the page should look like the Mushaf.
 const [tajweedOn,setTajweedOn]=useState(false);
 /* عرض الصفحة هو الأصل: المصحف كما طُبع. ووضع النص يفتح طبقة أحكام التجويد، وهي طبقة دراسة
    ومراجعة لا يحملها المصحف المطبوع. مبدّل واحد فقط، فلا يزدحم السطح أثناء التلاوة. */
 const [textView,setTextView]=useState(false);
 /* الآية والكلمة اللتان تُتليان الآن — تُظلَّلان في النص وعلى صورة الصفحة معًا. */
 const [active,setActive]=useState<{ayah:number;word:number}|null>(null);
 const activeAyah=active?.ayah??null;
 const activeDeliveryAyah=useMemo(()=>delivery?.ayat.find(a=>a.ayah===activeAyah)||null,[delivery,activeAyah]);
 const activeWords=useMemo(()=>activeDeliveryAyah?splitAyahWords(activeDeliveryAyah.text):[],[activeDeliveryAyah]);
 /* تخطيط الكلمة لصفحات المقطع — يُجلب مرة ويُخزَّن، ويبقى null بلا ضرر إن لم يتوفّر. */
 const [layouts,setLayouts]=useState<Record<number,MushafPageLayout|null>>({});
 useEffect(()=>{let live=true;const pages=loci.map(x=>x.page);if(!pages.length)return;
  void Promise.all(pages.map(async p=>[p,await fetchMushafLayout(p)] as const)).then(rows=>{if(live)setLayouts(Object.fromEntries(rows))});
  return()=>{live=false}},[loci.map(x=>x.page).join(',')]);
 /* عدسة الكلمة فوق الصفحة: تحتاج آية جارية وكلمة جارية وتخطيطًا يعرف موضعها. */
 const audioWordBox=useMemo(()=>{
  if(!activeDeliveryAyah||!active||active.word<0)return null;
  const box=findLayoutWordBox(layouts[activeDeliveryAyah.page]||null,activeDeliveryAyah.surah,activeDeliveryAyah.ayah,active.word);
  return box?{page:activeDeliveryAyah.page,bbox:box}:null;
 },[layouts,activeDeliveryAyah,active]);
 const allTajweed=useMemo(()=>delivery?delivery.ayat.flatMap(a=>a.tajweed||[]):[],[delivery]);
 const [pages,setPages]=useState<Record<number,string>>({});const [checked,setChecked]=useState(false);const [officialFont,setOfficialFont]=useState(false);
 useEffect(()=>{let live=true;const urls:string[]=[];setPages({});setChecked(false);if(!packageId||!loci.length){setChecked(true);return}void Promise.all(loci.map(async locus=>{const url=await fetchOfficialMushafPage(packageId,locus.page);if(url)urls.push(url);return [locus.page,url] as const})).then(results=>{if(!live){urls.forEach(URL.revokeObjectURL);return}setPages(Object.fromEntries(results.filter((x):x is readonly [number,string]=>!!x[1])));setChecked(true)});return()=>{live=false;urls.forEach(URL.revokeObjectURL)}},[packageId,loci.map(x=>`${x.page}:${x.lineStart}:${x.lineEnd}`).join('|')]);
 useEffect(()=>{let live=true;void loadKfgqpcOfficialQuranFont(packageId||'primary').then(ok=>{if(live)setOfficialFont(ok)});return()=>{live=false}},[packageId]);
 const loadedLoci=loci.filter(x=>!!pages[x.page]);const hasOfficialPage=loadedLoci.length>0;const trackingLost=tracking?.alignmentState==='LOST'||tracking?.alignmentState==='REACQUIRING';
 return <div className="relative overflow-hidden rounded-[30px] border border-[#dad7cd] bg-[#fdfbf5] shadow-[0_18px_55px_rgba(25,39,33,.055)]">
  <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-[#e5e1d7] bg-[#f7f4ec]"><div className="flex items-center gap-2 min-w-0"><span className="w-8 h-8 rounded-xl bg-[#E7EEE9] text-[#214C40] grid place-items-center"><FileCheck2 className="w-4 h-4"/></span><div className="min-w-0"><div className="text-[10px] font-black truncate">{ar?'سطح المصحف الرسمي':'OFFICIAL MUSHAF SURFACE'}</div><div className="text-[9px] text-[#656a66] truncate">{readingText||'—'}</div></div></div><div className="flex items-center gap-2"><Badge variant="emerald">{ar?'المصدر: مجمع الملك فهد':'KFGQPC SOURCE'}</Badge>{loci.length>1?<Badge variant="neutral">{ar?`${loci.length} صفحات رسمية`:`${loci.length} official pages`}</Badge>:loci[0]&&<span className="text-[10px] font-black tabular-nums text-[#59615c]">{ar?'ص':'p.'} {loci[0].page}</span>}</div></div>
  {hasOfficialPage&&!textView?<div className="relative bg-[#efede6] p-3 sm:p-5"><div className={`mx-auto grid gap-4 ${loadedLoci.length>1?'lg:grid-cols-2':'grid-cols-1'}`}>{loci.map(locus=>pages[locus.page]?<OfficialPage key={locus.page} url={pages[locus.page]} locus={locus} ar={ar} tracking={tracking} audioFocus={activeDeliveryAyah&&activeDeliveryAyah.page===locus.page?activeDeliveryAyah:null} audioWord={audioWordBox?.page===locus.page?audioWordBox.bbox:null}/>:<MissingPage key={locus.page} page={locus.page} ar={ar}/>)}</div><div className="mt-3 flex items-center justify-between gap-3"><div className="rounded-xl bg-[#202924]/90 text-white px-3 py-2 text-[9px] font-black flex items-center gap-2"><FileSearch className="w-3.5 h-3.5"/>{ar?'أصل الصفحة الرسمي المستورد دون تعديل':'Imported official page master — unmodified'}</div>{tracking&&<div className={`rounded-xl px-3 py-2 text-[9px] font-black flex items-center gap-2 ${trackingLost?'bg-[#F2EADC] text-[#725630]':'bg-[#E7EEE9] text-[#214C40]'}`}><MapPin className="w-3.5 h-3.5"/>{trackingLost?(ar?'جارٍ إعادة تحديد الموضع — المؤشر ثابت':'Reacquiring — pointer held'):(ar?`تتبّع حي · آية ${tracking.ayah||'—'}`:`Live tracking · ayah ${tracking.ayah||'—'}`)}</div>}</div></div>:<div className="px-5 sm:px-10 py-8 sm:py-12"><div className="max-w-4xl mx-auto"><div className="flex items-center justify-between gap-3 mb-7 text-[9px] font-black text-[#666a67]"><span>{q.surahNameArabic||q.surahNameEnglish||'—'} · {q.startAyah}–{q.endAyah}</span><span>{loci.map(x=>`${ar?'ص':'p.'}${x.page} · ${ar?'س':'L'}${x.lineStart}${x.lineEnd!==x.lineStart?`–${x.lineEnd}`:''}`).join(' | ')}</span></div><div className="font-quran text-center text-2xl sm:text-[2.05rem] leading-[2.25] text-[#202622]" style={officialFont?{fontFamily:'"MIZAN KFGQPC Official"'}:undefined}>{delivery?delivery.ayat.map((a,i)=><React.Fragment key={a.ayah}>{i?' ':''}<span className={a.ayah===activeAyah?'rounded-lg px-1.5 py-0.5 bg-[#E7EEE9] shadow-[0_0_0_2px_#d5e4dc] transition-colors duration-300':'transition-colors duration-300'}>{a.ayah===activeAyah&&activeWords.length
   ? <TajweedAyahWords text={a.text} spans={a.tajweed} enabled={tajweedOn} words={activeWords} activeWord={active?.word??-1}/>
   : <TajweedAyah text={a.text} spans={a.tajweed} enabled={tajweedOn}/>}</span></React.Fragment>):displayText}</div>{delivery&&allTajweed.length>0&&<div className="mt-6 flex flex-col items-center gap-2.5"><button type="button" onClick={()=>setTajweedOn(v=>!v)} aria-pressed={tajweedOn} className="min-h-11 px-3.5 inline-flex items-center gap-2 rounded-xl border border-[#e0dcd2] text-[9px] font-black text-[#59615c] hover:bg-[#f7f5ef]"><Highlighter className="w-3.5 h-3.5"/>{tajweedOn?(ar?'إخفاء أحكام التجويد':'Hide tajweed'):(ar?'إظهار أحكام التجويد':'Show tajweed')}</button>{tajweedOn&&<TajweedLegend spans={allTajweed} ar={ar}/>}{tajweedOn&&delivery.tajweedScopeNote&&<p className="max-w-xl text-center text-[9px] leading-5 text-[#636864]">{delivery.tajweedScopeNote}</p>}</div>}<div className="mt-8 flex items-center justify-center gap-2 text-[9px] text-[#666b68]"><ShieldCheck className="w-3.5 h-3.5 text-[#2F6555]"/><span>{checked?(ar?'النص باعتماد مجمع الملك فهد لطباعة المصحف الشريف.':'Text under the authority of the King Fahd Glorious Quran Printing Complex.'):(ar?'جارٍ تحميل أصل الصفحة…':'Loading the page master…')}</span></div></div></div>}
  {delivery&&<PassageAudio reading={readingKey} ayat={delivery.ayat} ar={ar} onActive={setActive}/>}
  {delivery&&<DivergenceRadar reading={readingKey} surah={delivery.surah} startAyah={delivery.startAyah} endAyah={delivery.endAyah} ar={ar}/>}
  <div className="px-4 sm:px-5 py-3 border-t border-[#e5e1d7] flex items-center justify-between gap-3 text-[9px] text-[#676c68]"><span className="font-mono truncate">{q.quranSourcePackageHash?`SHA-256 ${q.quranSourcePackageHash.slice(0,18)}…`:ar?'باعتماد مجمع الملك فهد':'KFGQPC authority'}</span><span className="flex items-center gap-3">{delivery&&hasOfficialPage&&<button type="button" onClick={()=>setTextView(v=>!v)} aria-pressed={textView} className="min-h-11 px-2.5 -my-3 inline-flex items-center gap-1.5 text-[9px] font-black text-[#59615c] hover:text-[#214C40]"><Type className="w-3.5 h-3.5"/>{textView?(ar?'عرض الصفحة':'Page view'):(ar?'عرض النص':'Text view')}</button>}<span>{hasOfficialPage&&!textView?(ar?'صفحة رسمية + عدسة منفصلة':'OFFICIAL PAGE + SEPARATE LENS'):officialFont?(ar?'نص وخط رسميان':'OFFICIAL TEXT + FONT'):(ar?'نص عثماني رسمي':'OFFICIAL UTHMANIC TEXT')}</span></span></div>
 </div>
}

/*
 * Official reference recitation for the drawn passage.
 *
 * Ayah-by-ayah official audio, played in order across the passage. This is a reference/calibration
 * surface for the panel — it is never a scoring input, and there is no cross-riwayah fallback:
 * a reading with no ingested recitation simply renders nothing.
 */
/* رواية MIZAN ← معرّف التلاوة المرجعية المرتبط بها. حفص يُغطّى بالكامل (٦٢٣٦ آية) عبر تسجيل
   المعيقلي؛ تُضاف الروايات الأخرى هنا حين تُقتنى تلاوتها. لا بديل بين الروايات. */
const AUDIO_ID_BY_READING:Record<string,string>={hafs:'hafs-muaiqly'};
export const PassageAudio:React.FC<{reading:string;ayat:{surah:number;ayah:number;text?:string}[];ar:boolean;onActive?:(state:{ayah:number;word:number}|null)=>void}>=({reading,ayat,ar,onActive})=>{
 const audioId=AUDIO_ID_BY_READING[reading];
 const [index,setIndex]=useState(0);const [playing,setPlaying]=useState(false);const [available,setAvailable]=useState<boolean|null>(null);
 const [posMs,setPosMs]=useState(0);const [durMs,setDurMs]=useState(0);
 const elRef=useRef<HTMLAudioElement|null>(null);
 const src=audioId&&ayat[index]?`/api/public/kfgqpc/audio/${audioId}/${ayat[index].surah}/${ayat[index].ayah}`:'';
 useEffect(()=>{setIndex(0);setPlaying(false)},[reading,ayat.map(a=>`${a.surah}:${a.ayah}`).join('|')]);
 useEffect(()=>{if(!audioId||!ayat.length){setAvailable(false);return}let live=true;
  void fetch(`/api/public/kfgqpc/audio/${audioId}/${ayat[0].surah}/${ayat[0].ayah}`,{method:'HEAD'}).then(r=>{if(live)setAvailable(r.ok)}).catch(()=>{if(live)setAvailable(false)});
  return()=>{live=false}},[audioId,ayat.length&&`${ayat[0].surah}:${ayat[0].ayah}`]);
 useEffect(()=>{const el=elRef.current;if(!el)return;if(playing)void el.play().catch(()=>setPlaying(false));else el.pause()},[playing,index,src]);
 // موضع التشغيل يُقرأ بإطار العرض لا بحدث timeupdate: الأخير يُطلق ~4 مرات في الثانية،
 // وهو تقطيعٌ مرئي حين ينتقل التظليل بين كلمة وكلمة.
 useEffect(()=>{const el=elRef.current;if(!el||!playing)return;let raf=0;
  const tick=()=>{setPosMs(el.currentTime*1000);raf=requestAnimationFrame(tick)};raf=requestAnimationFrame(tick);
  return()=>cancelAnimationFrame(raf)},[playing,index]);
 // نموذج التوقيت مبنيّ على نص الآية ومدّتها الحقيقية بعد تحميل الوسائط.
 const timing=useMemo(()=>proportionalWordTimings(ayat[index]?.text||'',durMs),[ayat,index,durMs]);
 const word=playing?wordAtTime(timing,posMs):-1;
 // تُبلِّغ السطحَ بالآية والكلمة الجاريتين؛ ويُخلى التظليل عند التوقّف أو إخفاء المشغّل.
 useEffect(()=>{onActive?.(playing&&ayat[index]?{ayah:ayat[index].ayah,word}:null)},[playing,index,ayat,word,onActive]);
 useEffect(()=>()=>onActive?.(null),[onActive]);
 if(!audioId||!ayat.length||available===false)return null;
 const onEnded=()=>{setPosMs(0);if(index<ayat.length-1)setIndex(i=>i+1);else{setPlaying(false);setIndex(0)}};
 const progress=durMs>0?Math.min(1,posMs/durMs):0;
 return <div className="px-4 sm:px-5 py-3 border-t border-[#e5e1d7] bg-[#f7f4ec]">
  <div className="flex items-center justify-between gap-3">
   <div className="flex items-center gap-3 min-w-0">
    <button type="button" onClick={()=>setPlaying(p=>!p)} aria-label={ar?(playing?'إيقاف التلاوة المرجعية':'تشغيل التلاوة المرجعية'):(playing?'Pause reference recitation':'Play reference recitation')}
     className="w-11 h-11 rounded-xl bg-[#214C40] text-white grid place-items-center shrink-0">{playing?<Pause className="w-4 h-4"/>:<Play className="w-4 h-4"/>}</button>
    <div className="min-w-0"><div className="text-[10px] font-black truncate">{ar?'تلاوة مرجعية رسمية':'Official reference recitation'}</div>
     <div className="text-[9px] text-[#656a66] truncate">{ar?`آية ${ayat[index]?.ayah} من ${ayat.length}`:`Ayah ${ayat[index]?.ayah} of ${ayat.length}`} · {ar?'مرجع فقط — لا يدخل في الدرجة':'reference only — never scored'}</div></div>
   </div>
   {/* التظليل على مستوى الكلمة تقديرٌ موزّع بالوزن النطقي، لا مقاطع زمنية مقيسة — يُقال كما هو. */}
   {playing&&timing.words.length>0&&<span className="shrink-0 rounded-lg bg-[#efe7d8] text-[#6f5733] px-2 py-1 text-[8px] font-black">{ar?'تتبّع الكلمة تقديري':'Word tracking estimated'}</span>}
  </div>
  <div className="mt-2.5 h-[3px] rounded-full bg-[#e3ded1] overflow-hidden"><div className="h-full bg-[#214C40] transition-[width] duration-100" style={{width:`${progress*100}%`}}/></div>
  <audio ref={elRef} src={src} onEnded={onEnded} preload="none"
   onLoadedMetadata={e=>setDurMs((e.currentTarget.duration||0)*1000)}
   onSeeked={e=>setPosMs(e.currentTarget.currentTime*1000)}/>
 </div>}

const OfficialPage:React.FC<{url:string;locus:QuranPageLocus;ar:boolean;tracking?:QuranAlignmentResult|null;audioFocus?:{page:number;lineStart:number;lineEnd:number}|null;audioWord?:{x:number;y:number;width:number;height:number}|null}>=({url,locus,ar,tracking,audioFocus,audioWord})=>{const live=tracking?.visualLocation?.page===locus.page?tracking.visualLocation:null;const liveLocus=live?.loci?.find(x=>x.page===locus.page);const focus=liveLocus||locus;const word=tracking?.wordVector?.page===locus.page&&tracking.wordVector.resolution==='VERIFIED_WORD_MAPPING'?tracking.wordVector.normalizedBBox:undefined;return <figure className="relative mx-auto w-fit"><div className="relative inline-block"><img src={url} alt={ar?`صفحة المصحف الرسمية ${locus.page}`:`Official Mushaf page ${locus.page}`} className="block max-h-[60vh] w-auto rounded-[2px] shadow-[0_12px_28px_rgba(0,0,0,.08)]"/>{focus.lineCount&&focus.lineCount>=focus.lineEnd?<FocusLens lineStart={focus.lineStart} lineEnd={focus.lineEnd} lineCount={focus.lineCount} ar={ar} tone="track"/>:null}{audioFocus?<FocusLens lineStart={audioFocus.lineStart} lineEnd={audioFocus.lineEnd} lineCount={15} ar={ar} tone="audio"/>:null}{audioWord&&<RecitingWordLens bbox={audioWord}/>}{word&&<WordVectorLens bbox={word}/>}</div><figcaption className="mt-2 text-center text-[9px] font-black text-[#606661]">{ar?'الصفحة':'Page'} {locus.page}{!focus.lineCount?<span className="ms-2 font-normal text-[#696f6b]">{ar?'هندسة الأسطر غير متاحة — بلا تخمين':'line geometry unavailable — no guess'}</span>:null}</figcaption></figure>}
const MissingPage:React.FC<{page:number;ar:boolean}>=({page,ar})=><div className="min-h-44 rounded-2xl border border-dashed border-[#d1cec5] bg-[#f8f6f0] grid place-items-center text-center p-6"><div><FileSearch className="w-5 h-5 mx-auto text-[#646965]"/><div className="text-xs font-black mt-2">{ar?`الصفحة الرسمية ${page} غير مستوردة`:`Official page ${page} is not imported`}</div><div className="text-[9px] text-[#686d6a] mt-1">{ar?'لا يُستخدم بديل من رواية أخرى.':'No cross-riwayah visual fallback.'}</div></div></div>;

const FocusLens:React.FC<{lineStart:number;lineEnd:number;lineCount:number;ar:boolean;tone?:'track'|'audio'}>=({lineStart,lineEnd,lineCount,ar,tone='track'})=>{const total=Math.max(1,lineCount),start=Math.max(1,Math.min(total,lineStart)),end=Math.max(start,Math.min(total,lineEnd));const textTop=8.5,textHeight=83;const top=textTop+((start-1)/total)*textHeight,height=Math.max(2.4,((end-start+1)/total)*textHeight);
 // نبرة خضراء للتتبّع الحيّ، ونبرة كهرمانية للتلاوة المرجعية، ليُفرّق الحَكَم بينهما بلمحة.
 const c=tone==='audio'?{band:'border-[#8A5A2B]/30 bg-[#8A5A2B]/[0.05]',bar:'bg-[#8A5A2B]',glow:'rgba(138,90,43,.10)'}:{band:'border-[#2F6555]/25 bg-[#2F6555]/[0.035]',bar:'bg-[#2F6555]',glow:'rgba(47,101,85,.08)'};
 return <div aria-label={tone==='audio'?(ar?'عدسة الآية الجاري تلاوتها':'Reciting-ayah lens'):(ar?'عدسة موضع الاختبار':'Passage focus lens')} className="pointer-events-none absolute inset-0"><div className={`absolute start-[7%] end-[7%] rounded-md border-y ${c.band} transition-all duration-300`} style={{top:`${top}%`,height:`${height}%`}}/><div className={`absolute end-[3.5%] w-[3px] rounded-full ${c.bar} transition-all duration-300`} style={{top:`${top}%`,height:`${height}%`,boxShadow:`0 0 0 4px ${c.glow}`}}/></div>}
/* الكلمة الجارية في التلاوة المرجعية: توهّج كهرماني خفيف يمشي مع الصوت فوق حرفها المطبوع.
   نبرة التلاوة كهرمانية ونبرة التتبّع الحيّ خضراء، فلا يختلط المرجع بالمتسابق أمام الحَكَم. */
const RecitingWordLens:React.FC<{bbox:{x:number;y:number;width:number;height:number}}>=({bbox})=>
 <div aria-hidden className="pointer-events-none absolute rounded-[3px] bg-[#C8922F]/[0.16] shadow-[0_0_0_1.5px_rgba(138,90,43,.42)] transition-all duration-150 ease-out"
  style={{left:`${bbox.x*100}%`,top:`${bbox.y*100}%`,width:`${bbox.width*100}%`,height:`${bbox.height*100}%`}}/>;
const WordVectorLens:React.FC<{bbox:{x:number;y:number;width:number;height:number}}>=({bbox})=><div aria-hidden className="pointer-events-none absolute rounded-sm border-2 border-[#2F6555]/55 bg-[#2F6555]/[0.025] transition-all duration-200" style={{left:`${bbox.x*100}%`,top:`${bbox.y*100}%`,width:`${bbox.width*100}%`,height:`${bbox.height*100}%`}}/>;
