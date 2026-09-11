import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/*
 * الأصل هو السحابة، والمحلّي احتياطٌ لما لم يصلها بعد.
 *
 * كان اللحاق يرفع **كل** ما يملكه الدور في كل مزامنة — كل إشعار، كل ثانية. فجهازٌ لم يمسّ
 * سجلًّا قطّ يكتب نسخته القديمة منه فوق نسخة السحابة الأحدث التي كتبها جهازٌ آخر قبل لحظة،
 * وجهازٌ عاد من انقطاعِ ساعة يرفع عالَمه كلّه عمرَ ساعة فوق الحاضر. هذه الاختبارات تحرس
 * العقد: لا يُرفع إلا ما غُيِّر هنا ولم يصل، ولا يُكتب فوق الأصل بما هو أقدم منه.
 */
const store = fs.readFileSync('src/lib/store.ts', 'utf8');

const body = (name: string) => {
  const start = store.indexOf(`async function ${name}(){`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = store.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `${name} must be a closed function`);
  return store.slice(start, end);
};

test('the catch-up uploads only what this device changed and has not yet sent', () => {
  const catchUp = body('persistOwnedRecords');
  assert.match(catchUp, /for\(const entry of \[\.\.\.pendingWrites\.values\(\)\]\)/, 'it walks the pending register');
  for (const field of ['globalState.participants', 'globalState.results', 'globalState.judgeSubmissions', 'globalState.committees', 'globalState.certificates', 'globalState.appeals', 'globalState.reviewCases']) {
    assert.ok(!catchUp.includes(field), `the catch-up must not sweep all of ${field} into the cloud`);
  }
});

test('the catch-up yields to a cloud copy that moved on after our change', () => {
  const catchUp = body('persistOwnedRecords');
  assert.match(catchUp, /cloudUpdatedAt&&cloudUpdatedAt>entry\.markedAt/, 'a newer cloud row wins over a pending local one');
  assert.match(catchUp, /clearPendingWrite\(entry\.collection,entry\.id\);continue;/, 'and the stale pending write is dropped, not forced through');
});

test('a pending write is registered on every attempt and cleared only on success', () => {
  const persist = store.slice(store.indexOf('async function persistScopedDocument('), store.indexOf('async function deleteScopedDocument('));
  assert.match(persist, /markPendingWrite\(collectionName,id,data\);/, 'every attempt registers');
  assert.match(persist, /clearPendingWrite\(collectionName,id\);\n    resolveCloudScope/, 'only a completed write clears it');
  const markAt = persist.indexOf('markPendingWrite');
  const offlineGuard = persist.indexOf('globalState.isOffline||!auth.currentUser');
  assert.ok(markAt < offlineGuard, 'an offline write must still register as pending, not vanish');
});

test('a delete that has not reached the cloud is remembered, so the row cannot resurrect', () => {
  const del = store.slice(store.indexOf('async function deleteScopedDocument('), store.indexOf('const JOURNEY_PUBLISHERS'));
  assert.match(del, /pendingDeletes\.set\(/, 'the delete is registered before the network call');
  assert.match(del, /pendingDeletes\.delete\(pendingKey\(collectionName,id\)\)/, 'and cleared once the cloud confirms');
});

test('a cloud snapshot never overwrites a local row that is still pending', () => {
  const merge = store.slice(store.indexOf('function mergeById<T extends { id: string }>'), store.indexOf('const listeners = new Set'));
  assert.match(merge, /rowHasPendingDelete\(collection, row\.id\)\) continue;/, 'a locally deleted row stays deleted while its delete is pending');
  assert.match(merge, /rowHasPendingWrite\(collection, row\.id\) && byId\.has\(row\.id\)\) continue;/, 'a locally changed row survives until it is uploaded');
});

test('every mirrored watcher tells the merge which collection it carries', () => {
  for (const [collection, field] of [['participants', 'participants'], ['committees', 'committees'], ['certificates', 'certificates'], ['reviews', 'reviewCases'], ['appeals', 'appeals'], ['support_sessions', 'supportSessions']]) {
    const call = `watch('${collection}', rows => { globalState.${field} = mergeById(globalState.${field}, rows, '${collection}'); });`;
    assert.ok(store.includes(call), `${collection} must pass its name so pending rows are protected: ${call}`);
  }
});

test('sealing authority still outranks a pending local result', () => {
  const merge = store.slice(store.indexOf('function mergeResultsByAuthority'), store.indexOf('// Union judge submissions'));
  assert.match(merge, /remoteRank === localRank && rowHasPendingWrite\('results', r\.id\)/,
    'the pending guard applies only at equal rank, so a sealed cloud result is never held back');
});

test('the competition config is never overwritten by an older copy', () => {
  const sync = store.slice(store.indexOf('function syncToFirestore()'), store.indexOf('let auditHashing'));
  assert.match(sync, /cloudUpdatedAt > localUpdatedAt\) \{ resolveCloudScope\('competition'\); return; \}/,
    'a device holding an older config must stand down instead of writing over the newer one');
});

test('work that has not reached the cloud survives closing the tab', () => {
  assert.match(store, /const PENDING_CLOUD_KEY = 'mizan_pending_cloud_v1';/, 'the register has its own storage key');
  assert.match(store, /function savePendingRegister\(\)/, 'it is written on change');
  assert.match(store, /function loadPendingRegister\(\)/, 'and read back on boot');
  assert.match(store, /^loadPendingRegister\(\);$/m, 'the restore actually runs at module init');
  assert.match(store, /if \(pendingCloudWriteCount\(\) > 0\) syncToFirestore\(\);/,
    'restored work resumes as soon as a cloud session exists, not at the next incidental change');
});

test('a pending row is never written into another competition’s path', () => {
  assert.match(store, /const pendingKey = \(collection: string, id: string, competitionId = globalState\.competition\.id\)/,
    'the register is keyed by competition as well as row');
  assert.match(store, /const inCurrentScope = \(entry: PendingScope\)/, 'scope comparison exists');
  const catchUp = store.slice(store.indexOf('async function persistOwnedRecords(){'));
  assert.match(catchUp.slice(0, 1400), /if\(!inCurrentScope\(entry\)\)continue;/,
    'the catch-up skips entries belonging to a competition that is not open');
});

test('a failure inside the catch-up cannot abort the rest of the sync', () => {
  const sync = store.slice(store.indexOf('function syncToFirestore()'), store.indexOf('let auditHashing'));
  assert.match(sync, /try \{ await persistOwnedRecords\(\); \}\n    catch/, 'the flush is guarded');
  assert.match(sync, /try \{ await syncPublicJourneys\(\); \}\n    catch/, 'and so is the journey sync');
});

test('the register holds only what genuinely awaits the cloud', () => {
  assert.match(store, /const PENDING_EXEMPT_COLLECTIONS = new Set\(\['audit'\]\);/,
    'the audit ledger has its own durable outbox and must not be duplicated into browser storage');
  assert.match(store, /return !!auth\.currentUser \|\| cloudSessionEverEstablished;/,
    'a local-only demo session has no cloud to be pending for');
  assert.match(store, /function markPendingWrite\(collection: string, id: string, data: Record<string, unknown>\) \{\n  if \(!shouldRegisterPending\(collection\)\) return;/,
    'writes check the gate');
  assert.match(store, /if\(shouldRegisterPending\(collectionName\)\)pendingDeletes\.set\(/, 'and so do deletes');
});
