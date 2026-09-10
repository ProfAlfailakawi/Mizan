import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/*
 * سجل الشهادات العام — ليتحقق الغريب من شهادة مطبوعة.
 *
 * صفحة التحقق كانت تسأل مخزن المتصفح نفسه، فمن لا يملك جلسة داخل المسابقة لا يجد شهادة أصلًا:
 * التحقق «ينجح» لمن لا يحتاجه ويفشل لمن يحتاجه. هذا السجل يجعل الإثبات على الخادم.
 *
 * لا يُنشر إلا ما يجوز لحامل الشهادة إظهاره: الرقم والاسم المعلن والدرجة والرتبة والبصمات.
 * لا درجات محكّمين، ولا هوية اتصال، ولا صوت.
 */

export interface PublicCertificateRecord{
  certificateNumber:string;
  certificateId:string;
  competitionId:string;
  organizationId:string;
  competitionName:string;
  organizationName?:string;
  issuedAt:string;
  /* المعروض على الشهادة نفسها فقط. */
  disclosed:{participantCode:string;participantName?:string;categoryName?:string;finalScore?:number;rank?:number;status?:string};
  certificateVersion:string;
  resultSealReference:string;
  merkleRoot:string;
  merkleProof:{position:'left'|'right';hash:string}[];
  merkleLeafMaterial:string;
  proofPackageHash:string;
  resultId:string;
  merkleProofId:string;
  revocationState:'ACTIVE'|'REVOKED';
  revokedAt?:string;
  revocationReason?:string;
  publishedAt:string;
}

export type CertificateVerdict=
 |{state:'NOT_FOUND'}
 |{state:'REVOKED';certificate:PublicView;revokedAt?:string;reason?:string}
 |{state:'INVALID_PROOF';reason:string;certificate:PublicView}
 |{state:'AUTHENTIC';certificate:PublicView;merkleRoot:string;proofPackageHash:string};

export interface PublicView{certificateNumber:string;competitionName:string;organizationName?:string;issuedAt:string;disclosed:PublicCertificateRecord['disclosed'];certificateVersion:string}

const canonical=(v:unknown):string=>{if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return `[${v.map(canonical).join(',')}]`;const o=v as Record<string,unknown>;return `{${Object.keys(o).sort().map(k=>`${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`};
const digest=(x:string)=>crypto.createHash('sha256').update(x).digest('hex');
const clean=(x:unknown,max:number)=>String(x??'').trim().slice(0,max);
/* رقم الشهادة يصير جزءًا من اسم ملف: يُقيَّد بالمحارف الآمنة قبل أي لمس للقرص. */
const key=(x:string)=>clean(x,120).toUpperCase().replace(/[^A-Z0-9._-]/g,'_');

export class PublicCertificateRegistry{
  constructor(private dir:string){if(!dir)throw new Error('CERTIFICATE_REGISTRY_DIR_REQUIRED');fs.mkdirSync(dir,{recursive:true,mode:0o700});}
  private file(number:string){return path.join(this.dir,`cert-${key(number)}.json`)}

  private read(number:string):PublicCertificateRecord|null{
    const file=this.file(number);if(!fs.existsSync(file))return null;
    try{return JSON.parse(fs.readFileSync(file,'utf8')) as PublicCertificateRecord}catch{throw new Error('CERTIFICATE_REGISTRY_CORRUPT')}
  }
  private write(rec:PublicCertificateRecord){fs.writeFileSync(this.file(rec.certificateNumber),JSON.stringify(rec,null,2),{encoding:'utf8',mode:0o600})}

  publish(input:Omit<PublicCertificateRecord,'publishedAt'|'revocationState'|'revokedAt'|'revocationReason'>&{revocationState?:'ACTIVE'|'REVOKED'}):PublicCertificateRecord{
    const number=clean(input.certificateNumber,120);
    if(!number||!input.certificateId||!input.competitionId||!input.organizationId)throw new Error('CERTIFICATE_PUBLISH_INVALID');
    if(!input.proofPackageHash||!input.merkleRoot||!input.merkleLeafMaterial)throw new Error('CERTIFICATE_PROOF_REQUIRED');
    const existing=this.read(number);
    /* إبطال الشهادة لا يُمحى بإعادة نشرها: من يعيد النشر بعد الإبطال لا يستطيع إحياءها من هنا. */
    if(existing&&existing.revocationState==='REVOKED')throw new Error('CERTIFICATE_ALREADY_REVOKED');
    if(existing&&existing.certificateId!==input.certificateId)throw new Error('CERTIFICATE_NUMBER_CONFLICT');
    const rec:PublicCertificateRecord={...input,certificateNumber:number,revocationState:'ACTIVE',publishedAt:new Date().toISOString()};
    this.write(rec);return rec;
  }

  revoke(number:string,actorOrganizationId:string,reason?:string):PublicCertificateRecord{
    const rec=this.read(number);if(!rec)throw new Error('CERTIFICATE_NOT_FOUND');
    if(rec.organizationId!==actorOrganizationId)throw new Error('CERTIFICATE_TENANT_MISMATCH');
    if(rec.revocationState==='REVOKED')return rec;
    const next:PublicCertificateRecord={...rec,revocationState:'REVOKED',revokedAt:new Date().toISOString(),revocationReason:clean(reason,300)||undefined};
    this.write(next);return next;
  }

  private view(rec:PublicCertificateRecord):PublicView{
    return {certificateNumber:rec.certificateNumber,competitionName:rec.competitionName,organizationName:rec.organizationName,issuedAt:rec.issuedAt,disclosed:rec.disclosed,certificateVersion:rec.certificateVersion};
  }

  /** الحكم يُعاد حسابه من محتوى السجل في كل مرة، فلا يُصدَّق حقل مخزَّن يقول «صحيحة». */
  verify(number:string):CertificateVerdict{
    const rec=this.read(number);
    if(!rec)return {state:'NOT_FOUND'};
    const certificate=this.view(rec);
    if(rec.revocationState==='REVOKED')return {state:'REVOKED',certificate,revokedAt:rec.revokedAt,reason:rec.revocationReason};
    const expectedPackage=digest(canonical({certificateId:rec.certificateId,resultId:rec.resultId,competitionId:rec.competitionId,certificateVersion:rec.certificateVersion,resultSealReference:rec.resultSealReference,merkleProofId:rec.merkleProofId,issuedTimestamp:rec.issuedAt,revocationState:'ACTIVE'}));
    if(expectedPackage!==rec.proofPackageHash)return {state:'INVALID_PROOF',reason:'PACKAGE_HASH_MISMATCH',certificate};
    let current=digest(rec.merkleLeafMaterial);
    for(const step of rec.merkleProof||[])current=digest(step.position==='left'?step.hash+current:current+step.hash);
    if(current!==rec.merkleRoot)return {state:'INVALID_PROOF',reason:'MERKLE_PROOF_INVALID',certificate};
    return {state:'AUTHENTIC',certificate,merkleRoot:rec.merkleRoot,proofPackageHash:rec.proofPackageHash};
  }
}

export function certificateRegistryFromEnv(env:NodeJS.ProcessEnv=process.env){
  const dir=String(env.MIZAN_CERTIFICATE_REGISTRY_DIR||'').trim();
  return dir?new PublicCertificateRegistry(dir):null;
}
