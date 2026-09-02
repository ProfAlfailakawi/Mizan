import type {QiraatGraphNode} from '../types';

const QIRAAH_AR:Record<string,string>={
 nafi:'نافع المدني','ibn-kathir':'ابن كثير المكي','abu-amr':'أبو عمرو البصري','ibn-amir':'ابن عامر الدمشقي',asim:'عاصم الكوفي',hamzah:'حمزة الكوفي','al-kisai':'الكسائي','abu-jafar':'أبو جعفر المدني',yaqub:'يعقوب الحضرمي','khalaf-al-ashir':'خلف العاشر'
};
const RAWI_AR:Record<string,string>={
 qalun:'قالون',warsh:'ورش','al-bazzi':'البزي',qunbul:'قنبل','al-duri-abu-amr':'الدوري عن أبي عمرو','al-susi':'السوسي',hisham:'هشام','ibn-dhakwan':'ابن ذكوان',shubah:'شعبة',hafs:'حفص','khalaf-hamzah':'خلف عن حمزة',khallad:'خلاد','abu-al-harith':'أبو الحارث','al-duri-kisai':'الدوري عن الكسائي','ibn-wardan':'ابن وردان','ibn-jammaz':'ابن جماز',ruways:'رويس',rawh:'روح',ishaq:'إسحاق',idris:'إدريس'
};
const TARIQ_AR:Record<string,string>={'al-azraq':'طريق الأزرق','al-asbahani':'طريق الأصبهاني',pending:'يُحدد عند اعتماد الطريق'};
const COUNTRY_AR:Record<string,string>={Kuwait:'الكويت','Saudi Arabia':'المملكة العربية السعودية',Qatar:'قطر',Bahrain:'البحرين',Oman:'عُمان','United Arab Emirates':'الإمارات العربية المتحدة',Egypt:'مصر',Jordan:'الأردن',Morocco:'المغرب',Algeria:'الجزائر',Tunisia:'تونس',Turkey:'تركيا',Indonesia:'إندونيسيا',Malaysia:'ماليزيا',Pakistan:'باكستان'};
const ROLE_AR:Record<string,string>={super_admin:'مدير المنصة',org_admin:'مدير المؤسسة',comp_admin:'مدير المسابقة',scientific_admin:'المسؤول العلمي',head_judge:'رئيس التحكيم',judge:'المحكم',ops_manager:'مدير العمليات',operations:'العمليات',exception_host:'مكتب الاستثناءات',delegation_manager:'إدارة الوفد',participant:'المتسابق',broadcast_operator:'البث والحفل',auditor:'المدقق',guardian:'ولي الأمر',support_agent:'الدعم'};

export function qiraahLabel(node:Pick<QiraatGraphNode,'qiraahId'|'qiraah'>,ar:boolean){return ar?(QIRAAH_AR[node.qiraahId]||node.qiraah):node.qiraah}
export function rawiLabel(node:Pick<QiraatGraphNode,'rawiId'|'rawi'>,ar:boolean){return ar?(RAWI_AR[node.rawiId]||node.rawi):node.rawi}
export function tariqLabel(id:string|undefined,ar:boolean){if(!id)return '—';return ar?(TARIQ_AR[id]||id.replaceAll('-',' ')):id.replaceAll('-',' ')}
export function countryLabel(value:string|undefined,ar:boolean){if(!value)return '—';return ar?(COUNTRY_AR[value]||value):value}
export function roleLabel(value:string|undefined,ar:boolean){if(!value)return '—';return ar?(ROLE_AR[value]||value):value.replaceAll('_',' ')}
export const qiraahArabicById=(id:string)=>QIRAAH_AR[id]||id;
export const rawiArabicById=(id:string)=>RAWI_AR[id]||id;
