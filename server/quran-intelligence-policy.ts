import crypto from 'crypto';
import type {KfgqpcOfficialPackage} from './kfgqpc-official-sources';
import type {QuranDatasetProvenance,QuranDatasetStatus,QuranReadingId} from './quran-intelligence-types';

export interface QuranReadingDefinition{
  id:QuranReadingId;
  aliases:string[];
  packageId:string;
  rawi:string;
  qiraah:string;
  officialPageCount?:number;
}

export const QURAN_READINGS:readonly QuranReadingDefinition[]=[
  {id:'hafs',aliases:['hafs','حفص'],packageId:'kfgqpc-hafs-uthmanic-v13',rawi:'Hafs',qiraah:'Asim',officialPageCount:604},
  {id:'warsh',aliases:['warsh','ورش'],packageId:'kfgqpc-warsh-uthmanic-v6',rawi:'Warsh',qiraah:'Nafi'},
  {id:'shubah',aliases:['shubah','shuba','shu-bah','شعبة'],packageId:'kfgqpc-shubah-uthmanic-v4',rawi:"Shu'bah",qiraah:'Asim'},
  {id:'qaloun',aliases:['qaloun','qalun','قالون'],packageId:'kfgqpc-qaloun-uthmanic-v5',rawi:'Qalun',qiraah:'Nafi'},
  {id:'douri-abu-amr',aliases:['douri-abu-amr','duri-abu-amr','aldouriabuamr','الدوريعنأبيعمرو','الدوري'],packageId:'kfgqpc-douri-abu-amr-uthmanic-v3',rawi:'Al-Duri',qiraah:'Abu Amr'},
  {id:'sousi-abu-amr',aliases:['sousi-abu-amr','susi-abu-amr','alsousiabuamr','السوسيعنأبيعمرو','السوسي'],packageId:'kfgqpc-sousi-abu-amr-uthmanic-v3',rawi:'Al-Susi',qiraah:'Abu Amr'}
] as const;

const norm=(v:string)=>String(v||'').toLowerCase().normalize('NFKD').replace(/[\u064b-\u065f\u0670]/g,'').replace(/[^a-z0-9\u0600-\u06ff]+/g,'');
export function quranReadingDefinition(value:string):QuranReadingDefinition|undefined{const n=norm(value);return QURAN_READINGS.find(x=>norm(x.id)===n||norm(x.packageId)===n||x.aliases.some(a=>norm(a)===n))}
export function quranReadingForPackage(packageId:string){return QURAN_READINGS.find(x=>x.packageId===packageId)}
export function assertReadingPackageMatch(reading:string,packageId:string){const r=quranReadingDefinition(reading);if(!r)throw new Error('QURAN_READING_UNSUPPORTED');if(r.packageId!==packageId)throw new Error('QURAN_READING_PACKAGE_MISMATCH');return r}
export function assertPackageReadingMatch(pkg:KfgqpcOfficialPackage,reading:QuranReadingDefinition){if(pkg.id!==reading.packageId)throw new Error('QURAN_READING_PACKAGE_MISMATCH');if(norm(pkg.rawi)!==norm(reading.rawi)||norm(pkg.qiraah)!==norm(reading.qiraah))throw new Error('QURAN_READING_IDENTITY_MISMATCH')}

export const sha256=(bytes:Buffer|string)=>crypto.createHash('sha256').update(bytes).digest('hex').toLowerCase();
export function canonicalJson(value:unknown):string{if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`;const obj=value as Record<string,unknown>;return `{${Object.keys(obj).sort().map(k=>`${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`}
export function generatedArtifactDigest<T extends {provenance:{generatedArtifactSha256:string}}>(value:T){return sha256(canonicalJson({...value,provenance:{...value.provenance,generatedArtifactSha256:''}}))}
export function officialKfgqpcUrl(url:string){try{const u=new URL(url);return u.protocol==='https:'&&(u.hostname==='qurancomplex.gov.sa'||u.hostname.endsWith('.qurancomplex.gov.sa'))}catch{return false}}
export function validSha256(value:string){return /^[a-f0-9]{64}$/i.test(value)}

export function validateDatasetProvenance(p:QuranDatasetProvenance):QuranDatasetProvenance{
  if(p.authority!=='KFGQPC')throw new Error('QURAN_PROVENANCE_AUTHORITY_INVALID');
  if(!officialKfgqpcUrl(p.sourceUrl))throw new Error('QURAN_PROVENANCE_SOURCE_NOT_KFGQPC');
  if(!p.sourceVersion.trim())throw new Error('QURAN_PROVENANCE_VERSION_REQUIRED');
  if(!p.parserVersion.trim())throw new Error('QURAN_PROVENANCE_PARSER_REQUIRED');
  if(!validSha256(p.localSha256)||!validSha256(p.generatedArtifactSha256))throw new Error('QURAN_PROVENANCE_SHA256_INVALID');
  if(Number.isNaN(Date.parse(p.retrievedAt)))throw new Error('QURAN_PROVENANCE_RETRIEVED_AT_INVALID');
  const allowed:QuranDatasetStatus[]=['VERIFIED','QUARANTINED','UNVERIFIED','OFFICIAL_DATA_UNAVAILABLE'];if(!allowed.includes(p.status))throw new Error('QURAN_PROVENANCE_STATUS_INVALID');
  if(p.officialChecksumVerified===true&&!p.officialChecksum)throw new Error('QURAN_PROVENANCE_CHECKSUM_PROOF_INVALID');
  const checksumProof=!!p.officialChecksum&&p.officialChecksumVerified===true;const reviewProof=!!p.reviewedAt&&(p.reviewedBy?.length||0)>=2;if(p.status==='VERIFIED'&&!checksumProof&&!reviewProof)throw new Error('QURAN_PROVENANCE_VERIFIED_REQUIRES_CHECKSUM_OR_DUAL_REVIEW');
  if(p.reviewedAt&&Number.isNaN(Date.parse(p.reviewedAt)))throw new Error('QURAN_PROVENANCE_REVIEWED_AT_INVALID');
  return p;
}

export function provenanceFromChecksums(input:{sourceUrl:string;retrievedAt:string;sourceVersion:string;officialChecksum?:string;observedOfficialChecksum?:string;localBytes:Buffer|string;parserVersion:string;generatedArtifact:unknown;reviewedBy?:string[];reviewedAt?:string}):QuranDatasetProvenance{
  let status:QuranDatasetStatus='UNVERIFIED';
  if(input.officialChecksum&&input.observedOfficialChecksum){status=input.officialChecksum.toLowerCase()===input.observedOfficialChecksum.toLowerCase()?'VERIFIED':'QUARANTINED'}
  else if(input.reviewedAt&&(input.reviewedBy?.length||0)>=2)status='VERIFIED';
  const checksumMatched=!!input.officialChecksum&&!!input.observedOfficialChecksum&&input.officialChecksum.toLowerCase()===input.observedOfficialChecksum.toLowerCase();
  const p:QuranDatasetProvenance={authority:'KFGQPC',sourceUrl:input.sourceUrl,retrievedAt:input.retrievedAt,sourceVersion:input.sourceVersion,officialChecksum:input.officialChecksum,officialChecksumVerified:input.officialChecksum&&input.observedOfficialChecksum?checksumMatched:undefined,localSha256:sha256(input.localBytes),parserVersion:input.parserVersion,generatedArtifactSha256:sha256(canonicalJson(input.generatedArtifact)),status,reviewedBy:input.reviewedBy,reviewedAt:input.reviewedAt};
  return validateDatasetProvenance(p);
}
