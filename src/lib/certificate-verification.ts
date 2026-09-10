/*
 * التحقق العام من الشهادة — طرف العميل.
 *
 * الرابط المطبوع على الشهادة يعيش سنوات: يُبنى من دالة واحدة هنا لا في كل موضع على حدة،
 * وإلا اختلف ما يُطبع عمّا يفتحه الماسح فبطلت شهادات مطبوعة سلفًا.
 */

export const CERTIFICATE_VERIFY_ROUTE='#verify';

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
export async function fetchPublicCertificateVerdict(certificateNumber:string,fetcher:typeof fetch|undefined=typeof fetch==='function'?fetch:undefined):Promise<PublicCertificateVerdict|null>{
 const code=String(certificateNumber||'').trim();
 if(!code||!fetcher)return null;
 try{
  const res=await fetcher(`/api/public/certificates/${encodeURIComponent(code)}`,{headers:{accept:'application/json'}});
  if(res.status===503||res.status===501)return null;
  const body=await res.json().catch(()=>null) as PublicCertificateVerdict|null;
  if(!body||!body.state)return null;
  return body;
 }catch{return null}
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

export async function revokeCertificateInRegistry(certificateNumber:string,reason:string,bearer:string|undefined):Promise<'REVOKED'|'NOT_CONFIGURED'|'FAILED'>{
 if(!bearer||typeof fetch!=='function')return 'NOT_CONFIGURED';
 try{
  const res=await fetch(`/api/certificates/${encodeURIComponent(certificateNumber)}/revoke`,{method:'POST',headers:{authorization:`Bearer ${bearer}`,'content-type':'application/json'},body:JSON.stringify({reason})});
  if(res.status===503)return 'NOT_CONFIGURED';
  /* شهادة لم تُنشر أصلًا لا شيء يُبطَل لها في السجل: ليس فشلًا. */
  if(res.status===404)return 'NOT_CONFIGURED';
  return res.ok?'REVOKED':'FAILED';
 }catch{return 'FAILED'}
}
