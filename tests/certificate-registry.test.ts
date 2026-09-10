import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {PublicCertificateRegistry} from '../server/certificate-registry';
import {certificateVerifyUrl,certificateCodeFromLocation,fetchPublicCertificateVerdict} from '../src/lib/certificate-verification';

const canonical=(v:unknown):string=>{if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return `[${v.map(canonical).join(',')}]`;const o=v as Record<string,unknown>;return `{${Object.keys(o).sort().map(k=>`${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`};
const digest=(x:string)=>crypto.createHash('sha256').update(x).digest('hex');

const withRegistry=(fn:(r:PublicCertificateRegistry)=>void|Promise<void>)=>async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-cert-'));
 try{await fn(new PublicCertificateRegistry(dir))}finally{fs.rmSync(dir,{recursive:true,force:true})}
};

const sibling=digest('sibling-leaf');
const material=canonical({v:'mizan-merkle-v1',disclosed:{participantCode:'A-104',finalScore:92},salt:'s1'});
const root=digest(digest(material)+sibling);
const base={certificateId:'cert-1',competitionId:'comp-1',organizationId:'org-1',competitionName:'مسابقة الكويت',organizationName:'دار القرآن',
 issuedAt:'2026-06-01T00:00:00.000Z',disclosed:{participantCode:'A-104',participantName:'أحمد',finalScore:92,rank:1,status:'sealed'},
 certificateVersion:'MZ-CERT-1',resultSealReference:'seal-1',merkleRoot:root,merkleProof:[{position:'right' as const,hash:sibling}],
 merkleLeafMaterial:material,resultId:'res-1',merkleProofId:'proof-1'};
const packageHash=(revocationState:'ACTIVE',certificateId=base.certificateId)=>digest(canonical({certificateId,resultId:base.resultId,competitionId:base.competitionId,certificateVersion:base.certificateVersion,resultSealReference:base.resultSealReference,merkleProofId:base.merkleProofId,issuedTimestamp:base.issuedAt,revocationState}));
const record=(n='MZN-2026-KW-A104',certificateId=base.certificateId)=>({...base,certificateId,certificateNumber:n,proofPackageHash:packageHash('ACTIVE',certificateId)});

test('a stranger holding the paper gets a verdict computed on the server, not from their browser',withRegistry(r=>{
 assert.deepEqual(r.verify('MZN-2026-KW-A104'),{state:'NOT_FOUND'});
 r.publish(record());
 const verdict=r.verify('MZN-2026-KW-A104');
 assert.equal(verdict.state,'AUTHENTIC');
 assert.equal(r.verify('mzn-2026-kw-a104').state,'AUTHENTIC','the number on paper is not case sensitive');

 // Only what is printed on the certificate is disclosed — nothing about judging.
 const shown=JSON.stringify((verdict as any).certificate);
 for(const secret of ['judge','criterion','audio','email','phone'])assert.ok(!shown.includes(secret),`the public view must not carry ${secret}`);
}));

test('the registry recomputes the proof and refuses to be told the answer',withRegistry(r=>{
 // A record whose package hash does not match its own contents is never AUTHENTIC.
 r.publish({...record('MZN-BAD-HASH'),proofPackageHash:digest('made-up')});
 const bad=r.verify('MZN-BAD-HASH');
 assert.equal(bad.state,'INVALID_PROOF');
 assert.equal((bad as any).reason,'PACKAGE_HASH_MISMATCH');

 // A tampered inclusion proof is caught even when the package hash is right.
 r.publish({...record('MZN-BAD-PROOF'),merkleProof:[{position:'right',hash:digest('other')}]});
 assert.equal((r.verify('MZN-BAD-PROOF') as any).reason,'MERKLE_PROOF_INVALID');
}));

test('revocation is final and cannot be undone by republishing',withRegistry(r=>{
 r.publish(record());
 r.revoke('MZN-2026-KW-A104','org-1','سُحبت بقرار اللجنة');
 const after=r.verify('MZN-2026-KW-A104');
 assert.equal(after.state,'REVOKED');
 assert.equal((after as any).reason,'سُحبت بقرار اللجنة');
 assert.throws(()=>r.publish(record()),/CERTIFICATE_ALREADY_REVOKED/);
 assert.equal(r.verify('MZN-2026-KW-A104').state,'REVOKED');

 // Another organization cannot revoke a certificate that is not theirs.
 r.publish(record('MZN-OTHER'));
 assert.throws(()=>r.revoke('MZN-OTHER','org-2'),/CERTIFICATE_TENANT_MISMATCH/);
 assert.throws(()=>r.revoke('MZN-MISSING','org-1'),/CERTIFICATE_NOT_FOUND/);
}));

test('the file name is derived from the number, so no number escapes the directory or collides',withRegistry(r=>{
 r.publish(record('../../etc/passwd'));
 assert.equal(r.verify('../../etc/passwd').state,'AUTHENTIC');
 assert.ok(!fs.existsSync('/etc/passwd.json'));

 // Numbers that a character filter would have flattened together stay separate certificates.
 r.publish(record('MZN-A/B','cert-slash'));
 r.publish(record('MZN-A_B','cert-underscore'));
 assert.equal(r.verify('MZN-A/B').state,'AUTHENTIC');
 assert.equal(r.verify('MZN-A_B').state,'AUTHENTIC');
 r.revoke('MZN-A/B','org-1');
 assert.equal(r.verify('MZN-A/B').state,'REVOKED');
 assert.equal(r.verify('MZN-A_B').state,'AUTHENTIC','revoking one must not touch the other');

 // Every file the registry writes is a fixed-shape name with no request data in it.
 for(const f of fs.readdirSync((r as any).dir))assert.match(f,/^cert-[0-9a-f]{32}\.json$/,`unexpected file name ${f}`);

 // The same number may not be re-pointed at a different certificate id.
 r.publish(record('MZN-CONFLICT'));
 assert.throws(()=>r.publish(record('MZN-CONFLICT','cert-2')),/CERTIFICATE_NUMBER_CONFLICT/);
}));

test('the printed link opens the verification page and carries the number back',()=>{
 const url=certificateVerifyUrl('https://mizan.example/','MZN-2026-KW-A104');
 assert.equal(url,'https://mizan.example/#verify?cert=MZN-2026-KW-A104');
 const hash=url.slice(url.indexOf('#'));
 assert.equal(certificateCodeFromLocation('',hash),'MZN-2026-KW-A104','a scanned link must re-verify on open');
 assert.equal(certificateCodeFromLocation('?cert=MZN-QUERY','#verify'),'MZN-QUERY');
 assert.equal(certificateCodeFromLocation('','#verify'),'');
});

test('a number that is not a certificate number never reaches the network',async()=>{
 const {fetchPublicCertificateVerdict,revokeCertificateInRegistry,isCertificateNumber}=await import('../src/lib/certificate-verification');
 for(const bad of ['../../etc/passwd','MZN 1','http://evil.example/x','MZN/../../x','','..','MZN?a=b','MZN#f'])assert.equal(isCertificateNumber(bad),false,`${bad} must not pass as a certificate number`);
 for(const good of ['MZN-2026-KW-A104','abc.def_1'])assert.equal(isCertificateNumber(good),true);

 let called=false;
 const spy=(async()=>{called=true;return new Response('{}',{status:200})}) as any;
 assert.equal(await fetchPublicCertificateVerdict('../../etc/passwd',spy),null);
 assert.equal(called,false,'a malformed number must not be sent to the server at all');

 const g=globalThis as any;const realFetch=g.fetch;
 try{g.fetch=async()=>{called=true;return new Response('{}',{status:200})};
  assert.equal(await revokeCertificateInRegistry('../../etc/passwd','r','tok'),'NOT_CONFIGURED');
  assert.equal(called,false);
 }finally{g.fetch=realFetch}
});

test('an unconfigured registry falls back to the local check instead of denying a real certificate',async()=>{
 const unconfigured=await fetchPublicCertificateVerdict('MZN-1',(async()=>new Response('{}',{status:503})) as any);
 assert.equal(unconfigured,null,'503 means no registry, which is not a verdict');
 const offline=await fetchPublicCertificateVerdict('MZN-1',(async()=>{throw new Error('offline')}) as any);
 assert.equal(offline,null);
 const found=await fetchPublicCertificateVerdict('MZN-1',(async()=>new Response(JSON.stringify({state:'REVOKED'}),{status:200})) as any);
 assert.equal(found?.state,'REVOKED','a real verdict is never swallowed');
});

test('publication never breaks issuance and never leaks beyond the certificate',async()=>{
 const {publishCertificateToRegistry,revokeCertificateInRegistry}=await import('../src/lib/certificate-verification');
 const input={certificateNumber:'MZN-1',certificateId:'c1',competitionId:'comp',organizationId:'org',competitionName:'م',issuedAt:'2026-06-01T00:00:00.000Z',
  disclosed:{participantCode:'A-1',participantName:'أحمد',finalScore:92,rank:1,status:'sealed'},
  certificateVersion:'MZ-CERT-1',resultSealReference:'s',resultId:'r',merkleProofId:'p',merkleRoot:'root',merkleProof:[],merkleLeafMaterial:'m',proofPackageHash:'h'};

 // Without a signed-in issuer nothing is attempted, and an unconfigured registry is not a failure.
 assert.equal(await publishCertificateToRegistry(input,undefined),'NOT_CONFIGURED');
 assert.equal(await revokeCertificateInRegistry('MZN-1','r',undefined),'NOT_CONFIGURED');

 // Revoking a certificate the registry never held is not a failure either.
 const g=globalThis as any;const realFetch=g.fetch;
 try{
  g.fetch=async()=>new Response('{}',{status:404});
  assert.equal(await revokeCertificateInRegistry('MZN-1','r','tok'),'NOT_PUBLISHED','a certificate the registry never held is distinct from having no registry');
  g.fetch=async()=>new Response('{}',{status:503});
  assert.equal(await publishCertificateToRegistry(input,'tok'),'NOT_CONFIGURED');
  // A network error is reported, never thrown — issuance must not be undone by a publish problem.
  g.fetch=async()=>{throw new Error('offline')};
  assert.equal(await publishCertificateToRegistry(input,'tok'),'FAILED');
  assert.equal(await revokeCertificateInRegistry('MZN-1','r','tok'),'FAILED');

  // The body carries the certificate's own facts and no judging detail.
  let sent='';
  g.fetch=async(_u:string,init:any)=>{sent=String(init?.body||'');return new Response('{}',{status:201})};
  assert.equal(await publishCertificateToRegistry(input,'tok'),'PUBLISHED');
  const body=JSON.parse(sent);
  assert.deepEqual(Object.keys(body).sort(),Object.keys(input).sort(),'no field is added or dropped on the way out');
  for(const secret of ['judge','criterion','audio','email','phone','nationalId'])assert.ok(!sent.includes(secret),`published payload must not carry ${secret}`);
 }finally{g.fetch=realFetch}
});
