import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'crypto';
import {qiraahArabicById,rawiArabicById} from '../src/lib/arabic-labels';
import {WitnessModeRepository} from '../server/witness-mode';
import {ColdVaultRepository} from '../server/cold-vault';

test('canonical qiraat and rawi labels are Arabic',()=>{
 assert.equal(qiraahArabicById('nafi'),'نافع المدني');
 assert.equal(rawiArabicById('qalun'),'قالون');
 assert.equal(rawiArabicById('warsh'),'ورش');
 assert.equal(qiraahArabicById('abu-amr'),'أبو عمرو البصري');
 assert.equal(rawiArabicById('al-duri-abu-amr'),'الدوري عن أبي عمرو');
 assert.equal(rawiArabicById('al-duri-kisai'),'الدوري عن الكسائي');
 assert.notEqual(rawiArabicById('al-duri-abu-amr'),rawiArabicById('al-duri-kisai'));
});

test('witness mode enforces separation of duties and role diversity',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-witness-'));
 const repo=new WitnessModeRepository(root);
 const expiresAt=new Date(Date.now()+60_000).toISOString();
 const init={uid:'head-1',role:'head_judge',organizationId:'org-1',competitionId:'comp-1'} as any;
 const r=repo.create({actor:init,actionType:'QUESTION_REPLACEMENT',targetRef:'session-1',reason:'عطل موثق في السؤال',expiresAt,requiredWitnesses:2,requireDistinctRoles:true});
 assert.throws(()=>repo.attest(r.id,init),/INITIATOR_CANNOT_WITNESS/);
 repo.attest(r.id,{uid:'audit-1',role:'auditor',organizationId:'org-1',competitionId:'comp-1'} as any,'incident-1');
 assert.throws(()=>repo.attest(r.id,{uid:'audit-2',role:'auditor',organizationId:'org-1',competitionId:'comp-1'} as any),/ROLE_DIVERSITY_REQUIRED/);
 const ready=repo.attest(r.id,{uid:'ops-1',role:'operations',organizationId:'org-1',competitionId:'comp-1'} as any,'incident-1');
 assert.equal(ready.state,'READY');
 assert.ok(ready.evidenceHash.length===64);
 assert.equal(repo.verifyReady(r.id,{organizationId:'org-1',competitionId:'comp-1',actionType:'QUESTION_REPLACEMENT',targetRef:'session-1'}).state,'READY');
});

test('cold vault keeps keys external, rejects high-risk content and produces restore receipt',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-vault-'));
 const repo=new ColdVaultRepository(root); const key=crypto.randomBytes(32);
 assert.throws(()=>repo.export({competitionId:'c1',createdBy:'u1',transferKey:key,payload:{privateKey:'secret'}}),/FORBIDDEN_SECRET/);
 assert.throws(()=>repo.export({competitionId:'c1',createdBy:'u1',transferKey:key,payload:{questionPlaintext:'text'}}),/FORBIDDEN_HIGH_RISK_CONTENT/);
 const out=repo.export({competitionId:'c1',createdBy:'u1',transferKey:key,payload:{genome:{version:'g1'},publicKeys:['pk1'],checkpoint:{id:'cp1'}}});
 assert.equal(out.package.privateKeysIncluded,false);
 assert.equal(out.package.restorePolicy.keyExternalToPackage,true);
 const preview=repo.restorePreview(out.package,key);
 assert.equal(preview.questionPlaintextPresent,false);
 const tested=repo.testRestore(out.package,key,'auditor-1');
 assert.equal(tested.receipt.integrityVerified,true);
 assert.equal(tested.receipt.questionPlaintextPresent,false);
 assert.equal(tested.receipt.receiptHash.length,64);
});
