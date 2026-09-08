import {useEffect} from 'react';
import {useAppStore} from '../../lib/store';
import {COUNTRIES} from '../../lib/countries';
import {toAsciiDigits} from '../../lib/input-validation';

/*
 * Last-resort Arabic surface guard.
 * Primary localization still belongs in components. This layer only catches
 * known domain/status labels that can arrive dynamically from persisted data
 * or older deployments. It deliberately skips code, hashes and user input.
 */
const EXACT:Record<string,string>={
  'Nafi al-Madani':'نافع المدني',"Nafi' al-Madani":'نافع المدني','Nafiʿ al-Madani':'نافع المدني',
  'Qalun':'قالون','Warsh':'ورش','Ibn Kathir al-Makki':'ابن كثير المكي','Al-Bazzi':'البزي','Qunbul':'قنبل',
  'Abu Amr al-Basri':'أبو عمرو البصري','Al-Duri an Abi Amr':'الدوري عن أبي عمرو','Al-Susi':'السوسي',
  'Ibn Amir al-Dimashqi':'ابن عامر الدمشقي','Hisham':'هشام','Ibn Dhakwan':'ابن ذكوان','Asim al-Kufi':'عاصم الكوفي',
  "Shu'bah":'شعبة','Shubah':'شعبة','Hafs':'حفص','Hamzah al-Kufi':'حمزة الكوفي','Khalaf':'خلف عن حمزة','Khallad':'خلاد',
  "Al-Kisa'i":'الكسائي','Abu al-Harith':'أبو الحارث',"Al-Duri an Al-Kisa'i":'الدوري عن الكسائي',
  "Abu Ja'far al-Madani":'أبو جعفر المدني','Ibn Wardan':'ابن وردان','Ibn Jammaz':'ابن جماز',
  'Yaqub al-Hadrami':'يعقوب الحضرمي','Ruways':'رويس','Rawh':'روح','Khalaf al-Ashir':'خلف العاشر','Ishaq':'إسحاق','Idris':'إدريس',
  'READY':'جاهز','REVIEW':'يحتاج مراجعة','BLOCKED':'محظور','CERTIFIED':'معتمد','BETA':'تجريبي','UNSUPPORTED':'غير مدعوم',
  'PENDING':'بانتظار الإجراء','PENDING REVIEW':'بانتظار المراجعة','PENDING_REVIEW':'بانتظار المراجعة','DEVELOPMENT':'تطويري',
  'REVOKED':'ملغى','VERIFIED':'تم التحقق','SEALED':'مختوم','REVEALED':'تم الكشف','AUTHENTIC':'أصيل','NOT FOUND':'غير موجود',
  'INVALID PROOF':'إثبات غير صالح','NON-OFFICIAL':'غير رسمي','BASELINE INTACT':'خط الأساس سليم','BASELINE CHANGED':'تغير خط الأساس',
  'MIZAN':'ميزان','MIZAN CEREMONY':'حفل ميزان','CEREMONY VAULT':'خزنة الحفل','OFFICIAL RESULT REVEAL':'إعلان النتائج الرسمية',
  'FAIRDRAW DIVERSITY':'تنويع السحب العادل','REVIEW AVAILABLE':'مراجعة متاحة','LIVE INTEGRITY':'النزاهة الحية',
  'INTEGRITY SPINE':'سلسلة أدلة النزاهة','PLAINTEXT INCLUDED: NO':'نص السؤال: غير متاح',
  'Question integrity':'نزاهة السؤال','Source Vault':'خزنة المصادر','Reference audio':'الصوت المرجعي','AI capabilities':'قدرات الذكاء الاصطناعي',
  'Qiraat':'القراءات','Questions':'الأسئلة','Evidence':'الأدلة','Scientific Governance':'الحوكمة العلمية',
};


/* أسماء الدول تُشتق من مصدر واحد (قائمة الدول) فلا تتفرّع ترجمتان لبلد واحد. */
const COUNTRY_EXACT:Record<string,string>=Object.fromEntries(COUNTRIES.map(c=>[c.en,c.ar]));

/* الأدوار ومصطلحات تشغيلية كانت تصل خامًا من بيانات محفوظة أو رؤوس أقسام. */
const ROLE_EXACT:Record<string,string>={
  super_admin:'إدارة المنصة', org_admin:'مدير الجهة', comp_admin:'مدير المسابقة',
  head_judge:'رئيس التحكيم', judge:'المحكم', ops_manager:'غرفة العمليات', exception_host:'مكتب الاستثناءات',
  delegation_manager:'إدارة الوفد', participant:'المتسابق', broadcast_operator:'البث والحفل', auditor:'المدقق',
  guardian:'ولي الأمر', support_agent:'الدعم',
};

const OPS_EXACT:Record<string,string>={
  'MIZAN PLATFORM':'منصة ميزان','MIZAN EXCEPTION DESK':'مكتب الاستثناءات','MIZAN SUPPORT':'دعم ميزان',
  'EXCEPTION DESK':'مكتب الاستثناءات','PLATFORM':'المنصة','SUPPORT':'الدعم',
  'COMPETITION DNA':'هوية المسابقة','DNA':'هوية المسابقة',
  'Smart Queue Engine':'محرك الطابور الذكي','Cryptographic':'تشفيري','canonical':'قياسي','fallback':'بديل',
  'client_hash_chain':'سلسلة تجزئة موقّعة','WORM':'سجل لا يقبل التعديل','quiet_authority':'الطابع الرصين',
  'requested':'مطلوبة','active':'نشطة','Main Hall':'القاعة الرئيسية',
  'UAE':'الإمارات','Head Judge':'رئيس التحكيم','Participant':'متسابق','Request':'طلب','Engine':'محرك','Demo':'عرض تجريبي',
  'Judge':'محكم','Competition':'مسابقة','Organization':'جهة','Session':'جلسة','Result':'نتيجة','Certificate':'شهادة',
  'Grand Conference Recitation Auditorium':'قاعة التلاوة الكبرى',
  'International Quran Competition':'المسابقة الدولية للقرآن الكريم',
};

const PHRASES:[RegExp,string][]=[
  [/\bMIZAN\b/g,'ميزان'],[/\bFairDraw\b/g,'السحب العادل'],[/\bAI\b/g,'الذكاء الاصطناعي'],
  [/\bQR\b/g,'رمز الاستجابة السريعة'],[/\bKiosk\b/gi,'بوابة الخدمة الذاتية'],[/\bCeremony\b/gi,'الحفل'],
];

const LOOKUP:Record<string,string>={...COUNTRY_EXACT,...ROLE_EXACT,...OPS_EXACT,...EXACT};

/*
 * كثير من هذه المصطلحات لا تصل نصًا مستقلًا بل داخل جملة ("الأردن · Jordan"، "محكم · org_admin").
 * المطابقة على النص كاملًا تُخطئها، فنستبدل الكلمة داخل الجملة بحدود كلمات — الأطولُ أولًا حتى
 * لا يبتلع مفتاحٌ قصير مفتاحًا أطول يحتويه.
 */
const escapeRe=(v:string)=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const TOKEN_KEYS=Object.keys(LOOKUP).filter(k=>/[A-Za-z]/.test(k)).sort((a,b)=>b.length-a.length);
const TOKEN_RE=TOKEN_KEYS.length?new RegExp(`(?<![A-Za-z0-9_])(${TOKEN_KEYS.map(escapeRe).join('|')})(?![A-Za-z0-9_])`,'g'):null;
const localizeTokens=(value:string)=>TOKEN_RE?value.replace(TOKEN_RE,m=>LOOKUP[m]??m):value;
function localizeText(raw:string){const normalized=toAsciiDigits(raw);const trimmed=normalized.trim();if(!trimmed)return normalized;const exact=LOOKUP[trimmed];if(exact)return normalized.replace(trimmed,exact);let next=localizeTokens(normalized);for(const [pattern,value] of PHRASES)next=next.replace(pattern,value);return next}
function ignored(el:Element|null){if(!el)return true;return !!el.closest('code,pre,kbd,samp,script,style,textarea,input,[data-no-localize="true"],.font-mono,.mizan-proof-code')}
function translateNode(node:Node){if(node.nodeType===Node.TEXT_NODE){const parent=(node.parentElement||null);if(ignored(parent))return;const raw=node.nodeValue||'';const next=localizeText(raw);if(next!==raw)node.nodeValue=next;return}if(!(node instanceof Element)||ignored(node))return;for(const attr of ['aria-label','title','placeholder']){const raw=node.getAttribute(attr);if(!raw)continue;const next=localizeText(raw);if(next!==raw)node.setAttribute(attr,next)}for(const child of Array.from(node.childNodes))translateNode(child)}

export function ArabicInterfaceGuard(){const {language}=useAppStore();useEffect(()=>{if(language!=='ar')return;document.documentElement.lang='ar';document.documentElement.dir='rtl';translateNode(document.body);const observer=new MutationObserver(records=>{for(const rec of records){for(const n of Array.from(rec.addedNodes))translateNode(n);if(rec.type==='characterData')translateNode(rec.target)}});observer.observe(document.body,{subtree:true,childList:true,characterData:true});return()=>observer.disconnect()},[language]);return null}
