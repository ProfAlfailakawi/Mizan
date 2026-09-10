/*
 * التحقق العام من الشهادة — طرف العميل.
 *
 * الرابط المطبوع على الشهادة يعيش سنوات: يُبنى من دالة واحدة هنا لا في كل موضع على حدة،
 * وإلا اختلف ما يُطبع عمّا يفتحه الماسح فبطلت شهادات مطبوعة سلفًا.
 */

export const CERTIFICATE_VERIFY_ROUTE='#verify';

/*
 * رقم الشهادة يأتي من مسح رمز أو من لصق المستخدم، ثم يدخل في مسار طلب شبكي.
 * فيُقيَّد بمحارف الأرقام المعتمدة قبل أي طلب: ما لا يطابق ليس رقم شهادة أصلًا،
 * ولا يُرسل إلى الخادم لا للتحقق ولا للإبطال.
 */
const CERTIFICATE_NUMBER_PATTERN=/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
export const isCertificateNumber=(x:unknown)=>CERTIFICATE_NUMBER_PATTERN.test(String(x??'').trim());

export function certificateVerifyUrl(origin:string,certificateNumber:string){
 const base=String(origin||'').replace(/\/$/,'');
 return `${base}/${CERTIFICATE_VERIFY_ROUTE}?cert=${encodeURIComponent(String(certificateNumber||''))}`;
}

/** الرقم قد يصل في استعلام الصفحة أو داخل الجزء بعد #، فيُقرأ الاثنان. */
export function certificateCodeFromLocation(search:string,hash:string):string{
 const fromSearch=new URLSearchParams(String(search||'').replace(/^\?/,'')).get('cert');
 if(fromSearch)return fromSearch;
 const raw=String(hash||'');
 const q=raw.indexOf('?');
 if(q<0)return '';
 return new URLSearchParams(raw.slice(q+1)).get('cert')||'';
}

export interface PublicCertificateView{certificateNumber:string;competitionName:string;organizationName?:string;issuedAt:string;certificateVersion:string;disclosed:{participantCode:string;participantName?:string;categoryName?:string;finalScore?:number;rank?:number;status?:string}}
export interface PublicCertificateVerdict{state:'AUTHENTIC'|'REVOKED'|'INVALID_PROOF'|'NOT_FOUND';certificate?:PublicCertificateView;reason?:string;revokedAt?:string;merkleRoot?:string;proofPackageHash?:string}

/**
 * null تعني «لا سجل عام مُهيَّأ»، وهي ليست حكمًا: يواصل النداء إلى المخزن المحلي.
 * أما NOT_FOUND فحكم صادر عن السجل، ولا يُخفى بحكم محلي مناقض إلا بغياب السجل.
 */
/*
 * تعذّر الوصول إلى السجل ليس حكمًا على الشهادة. كان انقطاع الشبكة يُعيد null فيسقط النداء إلى
 * المخزن المحلي، والغريب الماسح لرمز مطبوع لا يملك ذلك المخزن، فتُعلن شهادة صحيحة «غير موجودة» —
 * أي تُتَّهم بالتزوير لأن الشبكة تعثّرت. لذلك يُميَّز التعذّر عن النفي بقيمة صريحة.
 */
export type CertificateLookupOutcome=PublicCertificateVerdict|'UNREACHABLE'|null;
export async function fetchPublicCertificateVerdict(certificateNumber:string,fetcher:typeof fetch|undefined=typeof fetch==='function'?fetch:undefined):Promise<CertificateLookupOutcome>{
 const code=String(certificateNumber??'').trim();
 /* الفحص هنا لا في دالة مساعدة: الحارس يجب أن يسبق النداء في المسار نفسه ليكون حارسًا فعلًا. */
 if(!CERTIFICATE_NUMBER_PATTERN.test(code)||!fetcher)return null;
 try{
  const res=await fetcher(`/api/public/certificates/${encodeURIComponent(code)}`,{headers:{accept:'application/json'}});
  if(res.status===503||res.status===501)return null;
  if(res.status>=500)return 'UNREACHABLE';
  const body=await res.json().catch(()=>null) as PublicCertificateVerdict|null;
  if(!body||!body.state)return res.ok?null:'UNREACHABLE';
  return body;
 }catch{return 'UNREACHABLE'}
}

/*
 * النشر إلى السجل العام. يُستدعى بعد الإصدار وبعد الإبطال، ولا يُفشل أيًّا منهما:
 * الشهادة صدرت فعلًا، وتعذّر النشر مشكلة تزامن تُعالَج بإعادة المحاولة لا بإلغاء الشهادة.
 */
export interface PublishCertificateInput{
 certificateNumber:string;certificateId:string;competitionId:string;organizationId:string;
 competitionName:string;organizationName?:string;issuedAt:string;
 disclosed:PublicCertificateView['disclosed'];
 certificateVersion:string;resultSealReference:string;resultId:string;merkleProofId:string;
 merkleRoot:string;merkleProof:{position:'left'|'right';hash:string}[];merkleLeafMaterial:string;proofPackageHash:string;
}

export async function publishCertificateToRegistry(input:PublishCertificateInput,bearer:string|undefined):Promise<'PUBLISHED'|'NOT_CONFIGURED'|'FAILED'>{
 if(!bearer||typeof fetch!=='function')return 'NOT_CONFIGURED';
 try{
  const res=await fetch('/api/certificates/publish',{method:'POST',headers:{authorization:`Bearer ${bearer}`,'content-type':'application/json'},body:JSON.stringify(input)});
  if(res.status===503)return 'NOT_CONFIGURED';
  return res.ok?'PUBLISHED':'FAILED';
 }catch{return 'FAILED'}
}

export async function revokeCertificateInRegistry(certificateNumber:string,reason:string,bearer:string|undefined):Promise<'REVOKED'|'NOT_CONFIGURED'|'NOT_PUBLISHED'|'FAILED'>{
 const code=String(certificateNumber??'').trim();
 if(!CERTIFICATE_NUMBER_PATTERN.test(code)||!bearer||typeof fetch!=='function')return 'NOT_CONFIGURED';
 try{
  const res=await fetch(`/api/certificates/${encodeURIComponent(code)}/revoke`,{method:'POST',headers:{authorization:`Bearer ${bearer}`,'content-type':'application/json'},body:JSON.stringify({reason})});
  if(res.status===503)return 'NOT_CONFIGURED';
  /*
   * «لا سجل مُهيَّأ» و«الشهادة ليست في السجل» حالتان مختلفتان، وخلطهما يُخفي عطلًا:
   * الثانية تعني أن نشر الشهادة فشل صامتًا عند إصدارها، فبقيت خارج السجل. الإبطال هنا
   * ليس فشلًا — لا يوجد ما يُبطَل — لكنه يستحق أن يُقال بدل أن يُبتلع كغياب إعداد.
   */
  if(res.status===404)return 'NOT_PUBLISHED';
  return res.ok?'REVOKED':'FAILED';
 }catch{return 'FAILED'}
}
