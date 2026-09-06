import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SYNCED_COLLECTIONS,canWriteSyncedCollection,classifyCloudError,estimateDocumentBytes,exceedsSafeDocumentSize,writableCollectionsFor,SAFE_DOCUMENT_BYTES,FIRESTORE_DOCUMENT_LIMIT_BYTES} from '../src/lib/cloud-sync';

const rules=fs.readFileSync('firestore.rules','utf8');
const store=fs.readFileSync('src/lib/store.ts','utf8');

/*
 * القواعد والكود كانا يستعملان أسماء مجموعات مختلفة (judge_submissions مقابل judgeSubmissions)،
 * وقاعدة المنع الشاملة ترفض ما لا يُطابَق — فالكتابة تفشل بلا صوت. هذه الاختبارات تربط الاثنين.
 */

test('every collection the code writes has a matching Firestore rule',()=>{
  const written=[...store.matchAll(/persistScopedDocument\('([a-zA-Z_]+)'/g)].map(m=>m[1]);
  assert.ok(written.length>0,'the store still writes scoped documents');
  for(const name of new Set(written)){
    assert.match(rules,new RegExp(`match /${name}/`),`firestore.rules has no match block for '${name}' — the catch-all would deny it silently`);
  }
});

test('every collection the code listens to has a matching Firestore rule',()=>{
  const watched=[...store.matchAll(/watch\('([a-zA-Z_]+)'/g)].map(m=>m[1]);
  assert.ok(watched.length>=5,'subcollection listeners are attached');
  for(const name of new Set(watched)) assert.match(rules,new RegExp(`match /${name}/`),`no rule for watched collection '${name}'`);
});

test('the sync policy only names collections that exist in the rules',()=>{
  for(const name of SYNCED_COLLECTIONS) assert.match(rules,new RegExp(`match /${name}/`),`policy names '${name}' but no rule exists`);
});

test('least privilege: a judge authors evidence, not results or certificates',()=>{
  assert.equal(canWriteSyncedCollection('judge','judge_submissions'),true);
  assert.equal(canWriteSyncedCollection('judge','results'),false,'a single judge does not author the panel result');
  assert.equal(canWriteSyncedCollection('judge','certificates'),false);
  assert.equal(canWriteSyncedCollection('judge','participants'),false);
  assert.equal(canWriteSyncedCollection('head_judge','results'),true);
  assert.equal(canWriteSyncedCollection('comp_admin','participants'),true);
});

test('a contestant may raise an appeal and nothing else',()=>{
  assert.deepEqual(writableCollectionsFor('participant'),['appeals']);
  assert.deepEqual(writableCollectionsFor('guardian'),['appeals']);
});

test('an unknown collection is refused rather than allowed by silence',()=>{
  assert.equal(canWriteSyncedCollection('super_admin','anything_else'),false);
  assert.equal(canWriteSyncedCollection('super_admin',''),false);
});

test('an oversized payload is caught before it is sent',()=>{
  assert.ok(SAFE_DOCUMENT_BYTES<FIRESTORE_DOCUMENT_LIMIT_BYTES,'a margin exists below the hard limit');
  assert.equal(exceedsSafeDocumentSize({a:'x'}),false);
  const huge={rows:Array.from({length:40000},(_,i)=>({i,text:'حمولة كبيرة جدا'}))};
  assert.ok(estimateDocumentBytes(huge)>SAFE_DOCUMENT_BYTES);
  assert.equal(exceedsSafeDocumentSize(huge),true);
});

test('failures are classified into something an operator can act on',()=>{
  assert.equal(classifyCloudError(new Error('Missing or insufficient permissions')),'CLOUD_PERMISSION_DENIED');
  assert.equal(classifyCloudError(new Error('document exceeds maximum size')),'CLOUD_PAYLOAD_TOO_LARGE');
  assert.equal(classifyCloudError(new Error('network unreachable')),'CLOUD_WRITE_FAILED');
  assert.equal(classifyCloudError(undefined),'CLOUD_WRITE_FAILED');
});

test('cloud sync failure is raised to state, never swallowed into the console',()=>{
  assert.match(store,/function reportCloudError/,'a reporting path exists');
  assert.doesNotMatch(store,/console\.warn\('Firestore cloud sync paused/,'the silent swallow is gone');
  assert.match(store,/persistenceError\s*=\s*\{\s*code/,'the error reaches observable state');
});

test('the competition document no longer carries the whole competition',()=>{
  // الوثيقة الواحدة كانت تتجاوز حدّ فايرستور في يوم حقيقي فتتوقّف المزامنة بصمت.
  const config=store.slice(store.indexOf('const configuration = {'),store.indexOf('const configuration = {')+400);
  for(const banned of ['participants:','results:','auditLogs:','judgeSubmissions:','certificates:'])
    assert.ok(!config.includes(banned),`competition document must not carry ${banned}`);
});
