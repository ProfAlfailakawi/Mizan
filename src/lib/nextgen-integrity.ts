import type { Certificate, Competition, CompetitionBenchmarkRecord, DeviceRecord, DeviceReassignmentRecord, DisasterPackRecord, FederationAttestationRecord, FederationTrustRecord, JudgeFatigueRecommendationRecord, JourneyPassRecord, RehearsalCheckRecord, RehearsalRecord } from '../types';
import { canonicalStringify, hashCanonical } from './trust-protocol';
import { newId, sha256 } from './crypto';

const encoder=new TextEncoder();
const decoder=new TextDecoder();
const b64=(bytes:Uint8Array)=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
const unb64=(s:string)=>{s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const raw=atob(s);return Uint8Array.from(raw,c=>c.charCodeAt(0))};

export async function generateSigningKeyPair(){return crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])}
export async function exportPublicJwk(publicKey:CryptoKey){return crypto.subtle.exportKey('jwk',publicKey)}
export async function importPublicJwk(jwk:JsonWebKey){return crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},true,['verify'])}

export interface CompactPassPayload {v:'MZP1';competition:string;participantToken:string;categoryEntitlement:string;validFrom:string;expiry:string;credentialId:string;issuer:string}
export async function issueSignedPass(payload:CompactPassPayload,privateKey:CryptoKey){
 const body=b64(encoder.encode(canonicalStringify(payload))); const signature=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,encoder.encode(body)));
 return `${body}.${b64(signature)}`;
}
export async function verifySignedPass(compact:string,publicKey:CryptoKey,input:{competition:string;now?:Date;revokedCredentialIds?:Set<string>;usedCredentialIds?:Set<string>;singleUse?:boolean}){
 const [body,sig]=compact.split('.');if(!body||!sig)return {valid:false,reason:'MALFORMED'} as const;
 const signatureOk=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},publicKey,unb64(sig),encoder.encode(body));if(!signatureOk)return {valid:false,reason:'INVALID_SIGNATURE'} as const;
 let payload:CompactPassPayload;try{payload=JSON.parse(decoder.decode(unb64(body)))}catch{return {valid:false,reason:'MALFORMED_PAYLOAD'} as const}
 if(payload.v!=='MZP1'||payload.competition!==input.competition)return {valid:false,reason:'WRONG_COMPETITION',payload} as const;
 const now=(input.now||new Date()).getTime();if(now<Date.parse(payload.validFrom))return {valid:false,reason:'NOT_YET_VALID',payload} as const;if(now>Date.parse(payload.expiry))return {valid:false,reason:'EXPIRED',payload} as const;
 if(input.revokedCredentialIds?.has(payload.credentialId))return {valid:false,reason:'REVOKED',payload} as const;
 if(input.singleUse&&input.usedCredentialIds?.has(payload.credentialId))return {valid:false,reason:'ALREADY_USED',payload} as const;
 return {valid:true,payload,assurance:'ECDSA_P256_SHA256'} as const;
}


export async function federationAttestationDigest(a:Pick<FederationAttestationRecord,'organizationId'|'subjectRef'|'issuer'|'claim'|'value'|'scope'|'issuedAt'|'expiresAt'|'evidencePolicy'|'privacyClassification'>){
 return hashCanonical({organizationId:a.organizationId,subjectRef:a.subjectRef,issuer:a.issuer,claim:a.claim,value:a.value,scope:a.scope,issuedAt:a.issuedAt,expiresAt:a.expiresAt,evidencePolicy:a.evidencePolicy,privacyClassification:a.privacyClassification});
}
export async function developmentFederationSignature(evidenceDigest:string,issuer:string){return `development://sha256/${await sha256(`MIZAN-FEDERATION-DEVELOPMENT:${evidenceDigest}:${issuer}`)}`}
export async function verifyFederationAttestationEvidence(a:FederationAttestationRecord,input:{receivingOrganizationId:string;receivingOrganizationName?:string;trustList:FederationTrustRecord[];now?:Date}){
 if(a.status!=='valid')return {valid:false,reason:'revoked'} as const;
 if(a.expiresAt&&Date.parse(a.expiresAt)<(input.now||new Date()).getTime())return {valid:false,reason:'expired'} as const;
 const selfIssued=!!input.receivingOrganizationName&&a.issuer===input.receivingOrganizationName;
 const trust=input.trustList.find(x=>x.organizationId===input.receivingOrganizationId&&x.issuer===a.issuer);
 if(!selfIssued&&(!trust?.trusted||!trust.claimScopes.includes(a.claim)))return {valid:false,reason:'issuer_not_trusted'} as const;
 const digest=await federationAttestationDigest(a);if(digest!==a.evidenceDigest)return {valid:false,reason:'digest_mismatch'} as const;
 if(a.signatureRef.startsWith('development://')){const expected=await developmentFederationSignature(a.evidenceDigest,a.issuer);if(expected!==a.signatureRef)return {valid:false,reason:'signature_mismatch'} as const;return {valid:true,assurance:'development_adapter',trust:selfIssued?'self_issuer':'trusted_issuer'} as const}
 if(!a.signatureRef.trim())return {valid:false,reason:'signature_missing'} as const;
 return {valid:true,assurance:'external_signature_reference',trust:selfIssued?'self_issuer':'trusted_issuer'} as const;
}

async function importAes(raw:Uint8Array,usage:KeyUsage[]){return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,usage)}
export async function generateEncryptionKey(){return crypto.getRandomValues(new Uint8Array(32))}
export async function encryptJson(value:unknown,keyRaw:Uint8Array){const iv=crypto.getRandomValues(new Uint8Array(12));const key=await importAes(keyRaw,['encrypt']);const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(canonicalStringify(value))));return `MZE1.${b64(iv)}.${b64(cipher)}`}
export async function decryptJson<T>(sealed:string,keyRaw:Uint8Array):Promise<T>{const [v,iv,cipher]=sealed.split('.');if(v!=='MZE1')throw new Error('UNSUPPORTED_ENCRYPTED_PACKAGE');const key=await importAes(keyRaw,['decrypt']);const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv)},key,unb64(cipher));return JSON.parse(decoder.decode(plain)) as T}

export async function buildDisasterPack(input:{competition:Competition;createdBy:string;minimumData:Record<string,unknown>;keyRaw:Uint8Array;productionKms?:boolean}){
 const contentsManifest=Object.keys(input.minimumData).sort();const encryptedPayload=await encryptJson(input.minimumData,input.keyRaw);const packageHash=await hashCanonical({competitionId:input.competition.id,version:'MZ-DR-1',contentsManifest,encryptedPayload});
 const pack:DisasterPackRecord={id:newId('disaster'),competitionId:input.competition.id,version:'MZ-DR-1',createdAt:new Date().toISOString(),createdBy:input.createdBy,packageHash,encryptedPayload,encryptionMode:input.productionKms?'production_kms':'development_adapter',contentsManifest,status:'EXPORTED'};return pack;
}
export async function verifyDisasterPack(pack:DisasterPackRecord){const computed=await hashCanonical({competitionId:pack.competitionId,version:pack.version,contentsManifest:[...pack.contentsManifest].sort(),encryptedPayload:pack.encryptedPayload});return {valid:computed===pack.packageHash,computed}}
export async function testRestoreDisasterPack(pack:DisasterPackRecord,keyRaw:Uint8Array){const valid=await verifyDisasterPack(pack);if(!valid.valid)return {ok:false,reason:'HASH_MISMATCH'} as const;try{const preview=await decryptJson<Record<string,unknown>>(pack.encryptedPayload,keyRaw);return {ok:true,previewKeys:Object.keys(preview).sort()} as const}catch{return {ok:false,reason:'DECRYPT_FAILED'} as const}}

export function proposeDeviceReassignment(input:{competitionId:string;failed:DeviceRecord;devices:DeviceRecord[];activeLockedJudgeDeviceIds?:Set<string>;requiredCachedState?:string[]}){
 if(input.failed.status!=='offline'&&input.failed.status!=='degraded')return null;if(!input.failed.role)return null;
 const candidates=input.devices.filter(d=>d.id!==input.failed.id&&d.status==='online'&&!['audio','printer'].includes(d.type));
 const spare=candidates.find(d=>!(d.role==='JudgeOS'&&input.activeLockedJudgeDeviceIds?.has(d.id)))||null;if(!spare)return null;
 const rec:DeviceReassignmentRecord={id:newId('reassign'),competitionId:input.competitionId,failedDeviceId:input.failed.id,spareDeviceId:spare.id,fromRole:spare.role,toRole:input.failed.role,requiredCachedState:input.requiredCachedState||['competition_policy','role_config','revocation_cache'],status:'PROPOSED',reason:`${input.failed.name} unavailable; ${spare.name} is compatible and authorized.`,createdAt:new Date().toISOString()};return rec;
}
export function canApplyDeviceReassignment(rec:DeviceReassignmentRecord,devices:DeviceRecord[],activeLockedJudgeDeviceIds:Set<string>){const spare=devices.find(d=>d.id===rec.spareDeviceId);if(!spare)return {ok:false,reason:'SPARE_NOT_FOUND'};if(spare.role==='JudgeOS'&&activeLockedJudgeDeviceIds.has(spare.id))return {ok:false,reason:'ACTIVE_JUDGEOS_LOCKED'};if(spare.status!=='online')return {ok:false,reason:'SPARE_NOT_ONLINE'};return {ok:true as const}}

export function fatigueRecommendation(input:{competitionId:string;committeeId:string;continuousMinutes:number;sessions:number;timeSinceBreakMinutes:number;targetMinutes:number;recommendedBreakMinutes:number;enabled:boolean}){
 const status:JudgeFatigueRecommendationRecord['status']=!input.enabled?'DISABLED':input.continuousMinutes>input.targetMinutes?'RECOMMENDED':'DISMISSED';
 const message=status==='RECOMMENDED'?`Continuous session window exceeds configured target (${input.targetMinutes} min).`:'No operational break recommendation.';
 return {id:newId('fatigue'),competitionId:input.competitionId,committeeId:input.committeeId,continuousMinutes:input.continuousMinutes,sessions:input.sessions,timeSinceBreakMinutes:input.timeSinceBreakMinutes,recommendedBreakMinutes:input.recommendedBreakMinutes,policyTargetMinutes:input.targetMinutes,message,status,createdAt:new Date().toISOString()} satisfies JudgeFatigueRecommendationRecord;
}

export function simulateNotificationFailureRecovery(input:{providerConfigured:boolean;primaryFailed:boolean;attempts:number;maxAttempts:number;fallbackConfigured:boolean}){
 if(!input.providerConfigured)return {resilient:false,state:'PROVIDER_NOT_CONFIGURED' as const};
 if(!input.primaryFailed)return {resilient:true,state:'PRIMARY_SENT' as const};
 if(input.attempts<input.maxAttempts)return {resilient:true,state:'RETRY_QUEUED' as const};
 if(input.fallbackConfigured)return {resilient:true,state:'FALLBACK_QUEUED' as const};
 return {resilient:false,state:'DELIVERY_EXHAUSTED' as const};
}

export function privacySafeBenchmark(input:{competitionId:string;metric:string;values:number[];basis:CompetitionBenchmarkRecord['basis'];minimumCohortSize:number;peerGroup?:string}){
 if(input.values.length<input.minimumCohortSize)return {published:false,reason:'COHORT_SUPPRESSED'} as const;
 const sorted=[...input.values].sort((a,b)=>a-b);const mid=Math.floor(sorted.length/2);const value=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
 const record:CompetitionBenchmarkRecord={id:newId('benchmark'),competitionId:input.competitionId,metric:input.metric,value:Number(value.toFixed(2)),basis:input.basis,cohortSize:input.values.length,peerGroup:input.peerGroup,minimumCohortSize:input.minimumCohortSize,createdAt:new Date().toISOString()};return {published:true,record} as const;
}

export async function certificateProofPackage(cert:Certificate,input:{resultId:string;resultSealReference:string;merkleProofId?:string;issuerPrivateKey?:CryptoKey}){
 const payload={certificateId:cert.id,resultId:input.resultId,competitionId:cert.competitionId,certificateVersion:cert.certificateVersion||'MZ-CERT-1',resultSealReference:input.resultSealReference,merkleProofId:input.merkleProofId,issuedTimestamp:cert.issuedTimestamp||new Date().toISOString(),revocationState:cert.revocationState||'ACTIVE'};
 const proofPackageHash=await hashCanonical(payload);let issuerSignature:string|undefined;
 if(input.issuerPrivateKey){const sig=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},input.issuerPrivateKey,encoder.encode(proofPackageHash)));issuerSignature=b64(sig)}
 return {...payload,proofPackageHash,issuerSignature};
}

export async function verifyCertificateProofPackage(pkg:Awaited<ReturnType<typeof certificateProofPackage>>,publicKey?:CryptoKey){
 const {proofPackageHash,issuerSignature,...payload}=pkg;const computed=await hashCanonical(payload);if(computed!==proofPackageHash)return {state:'INVALID_PROOF' as const};if(payload.revocationState==='REVOKED')return {state:'REVOKED' as const};if(issuerSignature&&publicKey){const ok=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},publicKey,unb64(issuerSignature),encoder.encode(proofPackageHash));if(!ok)return {state:'INVALID_PROOF' as const}}return {state:'AUTHENTIC' as const};
}

export const REQUIRED_REHEARSAL_CHECK_IDS=['gate-scan','offline-pass','participant-checkin','queue','routing','judge-session','judge-lock','head-judge-review','fairdraw','network-interruption','offline-continuation','reconnect','conflict-reconciliation','device-failure','device-reassignment','judge-absence','committee-reassignment','emergency-mode','notification-failure','ai-outage','result-seal','quorum','appeal','certificate-issuance','certificate-verification','disaster-restore'] as const;
export async function runRehearsal(input:{competitionId:string;createdBy:string;checks:(()=>Promise<RehearsalCheckRecord>|RehearsalCheckRecord)[];requiredCheckIds?:readonly string[]}){
 const startedAt=new Date().toISOString();const checks:RehearsalCheckRecord[]=[];for(const run of input.checks){try{checks.push(await run())}catch(e){checks.push({id:`check-${checks.length+1}`,name:'Automated check',status:'FAIL',impact:'Automated rehearsal check did not complete.',evidence:[e instanceof Error?e.message:String(e)],fix:'Inspect the failed subsystem and re-test.'})}}
 const required=input.requiredCheckIds||REQUIRED_REHEARSAL_CHECK_IDS;const ran=new Set(checks.map(c=>c.id));const missing=required.filter(id=>!ran.has(id));if(missing.length)checks.push({id:'required-checks',name:'Required automated rehearsal coverage',status:'FAIL',impact:'A PASS cannot be issued because required checks did not actually run.',evidence:missing.map(x=>`MISSING:${x}`),fix:'Run every required rehearsal check and re-test.'});
 if(!checks.length)checks.push({id:'required-checks',name:'Required automated rehearsal coverage',status:'FAIL',impact:'No automated rehearsal checks ran.',evidence:['NO_CHECKS_EXECUTED'],fix:'Run the configured rehearsal matrix.'});
 const status:RehearsalRecord['status']=checks.some(c=>c.status==='FAIL')?'FAIL':checks.some(c=>c.status==='WARNING')?'PASS_WITH_WARNINGS':'PASS';const completedAt=new Date().toISOString();const reportHash=await hashCanonical({competitionId:input.competitionId,startedAt,completedAt,checks,status});return {id:newId('rehearsal'),competitionId:input.competitionId,nonOfficial:true,startedAt,completedAt,createdBy:input.createdBy,checks,status,reportHash} satisfies RehearsalRecord;
}

export function rehearsalIsolation<T extends {competitionId:string}>(records:T[],rehearsalCompetitionId:string,officialCompetitionId:string){return records.filter(r=>r.competitionId===officialCompetitionId&&r.competitionId!==rehearsalCompetitionId)}

export async function compactCredentialToJourneyRecord(input:{compact:string;payload:CompactPassPayload;participantId:string;participantCode:string}){
 return {id:newId('pass'),competitionId:input.payload.competition,participantId:input.participantId,participantCode:input.participantCode,version:'MZ1',payload:input.compact,checksum:await sha256(input.compact),issuedAt:new Date().toISOString(),status:'active',validFrom:input.payload.validFrom,expiresAt:input.payload.expiry,credentialId:input.payload.credentialId,issuer:input.payload.issuer,categoryEntitlement:input.payload.categoryEntitlement,signature:input.compact.split('.')[1],signatureAlgorithm:'ECDSA-P256-SHA256'} satisfies JourneyPassRecord;
}
