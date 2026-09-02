import test from 'node:test';
import assert from 'node:assert/strict';
import type { Certificate, DeviceRecord, FederationAttestationRecord, FederationTrustRecord } from '../src/types';
import { SEED_COMPETITION } from '../src/lib/seed-data';
import {
 buildDisasterPack, canApplyDeviceReassignment, certificateProofPackage, developmentFederationSignature, federationAttestationDigest,
 fatigueRecommendation, generateEncryptionKey, generateSigningKeyPair, issueSignedPass, privacySafeBenchmark, proposeDeviceReassignment,
 rehearsalIsolation, runRehearsal, simulateNotificationFailureRecovery, testRestoreDisasterPack, verifyCertificateProofPackage, verifyDisasterPack, verifyFederationAttestationEvidence, verifySignedPass
} from '../src/lib/nextgen-integrity';

test('offline signed pass verifies signature and rejects revocation/tampering',async()=>{
 const keys=await generateSigningKeyPair();const now=new Date('2026-09-02T00:00:00Z');
 const payload={v:'MZP1' as const,competition:'comp-1',participantToken:'PSEUDO-1',categoryEntitlement:'cat-a',validFrom:'2026-09-01T00:00:00Z',expiry:'2026-09-03T00:00:00Z',credentialId:'cred-1',issuer:'MIZAN'};
 const compact=await issueSignedPass(payload,keys.privateKey);assert.equal((await verifySignedPass(compact,keys.publicKey,{competition:'comp-1',now})).valid,true);
 assert.equal((await verifySignedPass(compact,keys.publicKey,{competition:'comp-1',now,revokedCredentialIds:new Set(['cred-1'])})).reason,'REVOKED');
 const tampered=compact.replace(/.$/,compact.endsWith('A')?'B':'A');assert.equal((await verifySignedPass(tampered,keys.publicKey,{competition:'comp-1',now})).valid,false);
});

test('Disaster Box verifies hash and test restore without embedding key',async()=>{
 const key=await generateEncryptionKey();const pack=await buildDisasterPack({competition:SEED_COMPETITION,createdBy:'ops',minimumData:{genome:{version:'1'},publicKeys:['k1']},keyRaw:key});
 assert.equal((await verifyDisasterPack(pack)).valid,true);assert.equal((await testRestoreDisasterPack(pack,key)).ok,true);assert.equal(pack.encryptedPayload.includes(Array.from(key).join(',')),false);
 const tampered={...pack,encryptedPayload:pack.encryptedPayload+'x'};assert.equal((await verifyDisasterPack(tampered)).valid,false);
});

test('device reassignment protects active locked JudgeOS',()=>{
 const failed:DeviceRecord={id:'gate',competitionId:'c',name:'Gate-01',type:'kiosk',role:'Gate',status:'offline',lastSeenAt:'2026-01-01',softwareVersion:'1'};
 const judge:DeviceRecord={id:'judge',competitionId:'c',name:'Judge-01',type:'judge_tablet',role:'JudgeOS',status:'online',lastSeenAt:'2026-01-01',softwareVersion:'1'};
 const spare:DeviceRecord={id:'spare',competitionId:'c',name:'Tablet-03',type:'judge_tablet',role:'Operations',status:'online',lastSeenAt:'2026-01-01',softwareVersion:'1'};
 const proposal=proposeDeviceReassignment({competitionId:'c',failed,devices:[failed,judge,spare],activeLockedJudgeDeviceIds:new Set(['judge'])});assert.equal(proposal?.spareDeviceId,'spare');
 const forced={...proposal!,spareDeviceId:'judge'};assert.equal(canApplyDeviceReassignment(forced,[failed,judge,spare],new Set(['judge'])).reason,'ACTIVE_JUDGEOS_LOCKED');
});

test('fatigue guard is operational, neutral and can be disabled',()=>{
 const rec=fatigueRecommendation({competitionId:'c',committeeId:'3',continuousMinutes:112,sessions:15,timeSinceBreakMinutes:112,targetMinutes:90,recommendedBreakMinutes:12,enabled:true});
 assert.equal(rec.status,'RECOMMENDED');assert.match(rec.message,/Continuous session window exceeds configured target/);assert.doesNotMatch(rec.message,/tired|poor performance/i);
 assert.equal(fatigueRecommendation({...rec,enabled:false,targetMinutes:90,recommendedBreakMinutes:12} as any).status,'DISABLED');
});

test('benchmark suppresses small cohorts and never fabricates a global value',()=>{
 assert.deepEqual(privacySafeBenchmark({competitionId:'c',metric:'wait',values:[1,2],basis:'OBSERVED',minimumCohortSize:5}),{published:false,reason:'COHORT_SUPPRESSED'});
 const local=privacySafeBenchmark({competitionId:'c',metric:'wait',values:[1,2,3,4,5],basis:'OBSERVED',minimumCohortSize:5});assert.equal(local.published,true);if(local.published)assert.equal(local.record.basis,'OBSERVED');
});

test('proof-carrying certificate verifies, detects tampering and revocation',async()=>{
 const keys=await generateSigningKeyPair();const cert={id:'cert-1',certificateNumber:'MZ-1',competitionId:'c',competitionName:'C',competitionNameArabic:'C',organizationName:'O',organizationNameArabic:'O',participantId:'p',participantName:'P',participantNameArabic:'P',categoryName:'K',categoryNameArabic:'K',score:0,awardTextArabic:'',issueDate:'2026-01-01',signatories:[],verificationToken:'v',verificationUrl:'v',isAuthentic:true,qrPayload:'q'} satisfies Certificate;
 const pkg=await certificateProofPackage(cert,{resultId:'r1',resultSealReference:'seal-1',issuerPrivateKey:keys.privateKey});assert.equal((await verifyCertificateProofPackage(pkg,keys.publicKey)).state,'AUTHENTIC');
 assert.equal((await verifyCertificateProofPackage({...pkg,resultSealReference:'tampered'},keys.publicKey)).state,'INVALID_PROOF');
 assert.equal((await verifyCertificateProofPackage({...pkg,revocationState:'REVOKED',proofPackageHash:await (async()=>{const {proofPackageHash,issuerSignature,...payload}={...pkg,revocationState:'REVOKED' as const};return (await import('../src/lib/trust-protocol')).hashCanonical(payload)})(),issuerSignature:undefined})).state,'REVOKED');
});

test('federation attestation requires trust, verifies development signature, and honors revocation',async()=>{
 const core={organizationId:'issuer-org',subjectRef:'pseudo-1',issuer:'Issuer A',claim:'age_verified' as const,value:'18+',scope:'competition',issuedAt:'2026-09-01T00:00:00Z',expiresAt:'2026-10-01T00:00:00Z',evidencePolicy:'claim_only',privacyClassification:'restricted_claim' as const};const digest=await federationAttestationDigest(core);const att:FederationAttestationRecord={id:'a1',...core,subjectKind:'participant',status:'valid',evidenceDigest:digest,signatureRef:await developmentFederationSignature(digest,core.issuer),privacyMode:'claim_only'};
 const trust:FederationTrustRecord={id:'t1',organizationId:'receiver',issuer:'Issuer A',trusted:true,claimScopes:['age_verified'],updatedAt:'2026-09-01',updatedBy:'admin'};
 assert.equal((await verifyFederationAttestationEvidence(att,{receivingOrganizationId:'receiver',trustList:[trust],now:new Date('2026-09-02')})).valid,true);
 assert.equal((await verifyFederationAttestationEvidence(att,{receivingOrganizationId:'receiver',trustList:[{...trust,trusted:false}],now:new Date('2026-09-02')})).reason,'issuer_not_trusted');
 assert.equal((await verifyFederationAttestationEvidence({...att,status:'revoked'},{receivingOrganizationId:'receiver',trustList:[trust],now:new Date('2026-09-02')})).reason,'revoked');
});

test('rehearsal cannot PASS unless required automated checks actually ran, and isolation excludes rehearsal records',async()=>{
 const missing=await runRehearsal({competitionId:'c',createdBy:'a',requiredCheckIds:['a','b'],checks:[()=>({id:'a',name:'A',status:'PASS',impact:'',evidence:[],fix:''})]});assert.equal(missing.status,'FAIL');assert.ok(missing.checks.some(x=>x.id==='required-checks'));
 const complete=await runRehearsal({competitionId:'c',createdBy:'a',requiredCheckIds:['a','b'],checks:[()=>({id:'a',name:'A',status:'PASS',impact:'',evidence:[],fix:''}),()=>({id:'b',name:'B',status:'PASS',impact:'',evidence:[],fix:''})]});assert.equal(complete.status,'PASS');
 assert.deepEqual(rehearsalIsolation([{competitionId:'official',id:1},{competitionId:'reh',id:2}], 'reh','official').map(x=>x.id),[1]);
});


test('notification rehearsal checks a real retry/fallback decision instead of unconditional success',()=>{
 assert.equal(simulateNotificationFailureRecovery({providerConfigured:false,primaryFailed:true,attempts:0,maxAttempts:3,fallbackConfigured:false}).resilient,false);
 assert.equal(simulateNotificationFailureRecovery({providerConfigured:true,primaryFailed:true,attempts:0,maxAttempts:3,fallbackConfigured:false}).state,'RETRY_QUEUED');
 assert.equal(simulateNotificationFailureRecovery({providerConfigured:true,primaryFailed:true,attempts:3,maxAttempts:3,fallbackConfigured:true}).state,'FALLBACK_QUEUED');
 assert.equal(simulateNotificationFailureRecovery({providerConfigured:true,primaryFailed:true,attempts:3,maxAttempts:3,fallbackConfigured:false}).resilient,false);
});
