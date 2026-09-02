import {useEffect} from 'react';
import {useAppStore} from '../../lib/store';

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

const PHRASES:[RegExp,string][]=[
  [/\bMIZAN\b/g,'ميزان'],[/\bFairDraw\b/g,'السحب العادل'],[/\bAI\b/g,'الذكاء الاصطناعي'],
  [/\bQR\b/g,'رمز الاستجابة السريعة'],[/\bKiosk\b/gi,'بوابة الخدمة الذاتية'],[/\bCeremony\b/gi,'الحفل'],
];

function localizeText(raw:string){const trimmed=raw.trim();if(!trimmed)return raw;const exact=EXACT[trimmed];if(exact)return raw.replace(trimmed,exact);let next=raw;for(const [pattern,value] of PHRASES)next=next.replace(pattern,value);return next}
function ignored(el:Element|null){if(!el)return true;return !!el.closest('code,pre,kbd,samp,script,style,textarea,input,[data-no-localize="true"],.font-mono,.mizan-proof-code')}
function translateNode(node:Node){if(node.nodeType===Node.TEXT_NODE){const parent=(node.parentElement||null);if(ignored(parent))return;const raw=node.nodeValue||'';const next=localizeText(raw);if(next!==raw)node.nodeValue=next;return}if(!(node instanceof Element)||ignored(node))return;for(const attr of ['aria-label','title','placeholder']){const raw=node.getAttribute(attr);if(!raw)continue;const next=localizeText(raw);if(next!==raw)node.setAttribute(attr,next)}for(const child of Array.from(node.childNodes))translateNode(child)}

export function ArabicInterfaceGuard(){const {language}=useAppStore();useEffect(()=>{if(language!=='ar')return;document.documentElement.lang='ar';document.documentElement.dir='rtl';translateNode(document.body);const observer=new MutationObserver(records=>{for(const rec of records){for(const n of Array.from(rec.addedNodes))translateNode(n);if(rec.type==='characterData')translateNode(rec.target)}});observer.observe(document.body,{subtree:true,childList:true,characterData:true});return()=>observer.disconnect()},[language]);return null}
