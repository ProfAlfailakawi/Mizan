import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/*
 * الأصل هو السحابة، والمحلّي احتياطٌ لما لم يصلها بعد.
 *
 * قواعد هذه السلطة تعيش في `cloud-authority` نقيّة، و`cloud-authority-behaviour` يختبرها
 * **بتشغيلها**: يُنشئ جهازين ويحاكي مديرين يعدّلان معًا، وجهازًا عاد من انقطاع، ومحكّمًا
 * أغلق جهازه بلا شبكة. فهذا الملف لا يعيد اختبار المنطق — يحرس ما لا يراه تشغيلُ وحدةٍ
 * نقيّة: أن المخزن **يستدعي** تلك القاعدة ولا يكتب نسخةً ثانية منها تنحرف عنها بصمت.
 */
const store = fs.readFileSync('src/lib/store.ts', 'utf8');

const body = (name: string) => {
  const start = store.indexOf(`async function ${name}(){`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = store.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `${name} must be a closed function`);
  return store.slice(start, end);
};

test('the store owns no second copy of the authority rules', () => {
  assert.match(store, /import \{ PendingRegister, decideUpload, configWriteAllowed, mergeRowsFromCloud, mergeRankedFromCloud, sameScope, type PendingScope \} from '\.\/cloud-authority';/,
    'the rules come from the tested module');
  for (const reimplementation of [
    'const pendingWrites = new Map',
    'const pendingDeletes = new Map',
    'cloudUpdatedAt>entry.markedAt',
    'cloudUpdatedAt > localUpdatedAt',
  ]) {
    assert.ok(!store.includes(reimplementation),
      `the store must delegate, not re-implement: found "${reimplementation}"`);
  }
});

test('the catch-up uploads only what this device changed, and asks the rule for its verdict', () => {
  const catchUp = body('persistOwnedRecords');
  assert.match(catchUp, /for\(const entry of pendingRegister\.listWrites\(\)\)/, 'it walks the pending register');
  assert.match(catchUp, /const verdict=decideUpload\(entry,\{scope,canWrite:/, 'and the shared rule decides');
  assert.match(catchUp, /if\(verdict==='skip-other-competition'\)continue;/, 'work for another competition waits, it is not dropped');
  assert.match(catchUp, /if\(verdict!=='upload'\)\{clearPendingWrite/, 'anything the rule refuses is dropped, not forced through');
  for (const field of ['globalState.participants', 'globalState.results', 'globalState.judgeSubmissions', 'globalState.committees', 'globalState.certificates', 'globalState.appeals', 'globalState.reviewCases']) {
    assert.ok(!catchUp.includes(field), `the catch-up must not sweep all of ${field} into the cloud`);
  }
});

test('a pending write is registered on every attempt and cleared only on success', () => {
  const persist = store.slice(store.indexOf('async function persistScopedDocument('), store.indexOf('async function deleteScopedDocument('));
  assert.match(persist, /markPendingWrite\(collectionName,id,data\);/, 'every attempt registers');
  assert.match(persist, /clearPendingWrite\(collectionName,id\);\n    resolveCloudScope/, 'only a completed write clears it');
  const markAt = persist.indexOf('markPendingWrite');
  const offlineGuard = persist.indexOf('globalState.isOffline||!auth.currentUser');
  assert.ok(markAt < offlineGuard, 'an offline write must still register as pending, not vanish');
});

test('a delete is registered before the network call and cleared only when the cloud confirms', () => {
  const del = store.slice(store.indexOf('async function deleteScopedDocument('), store.indexOf('const JOURNEY_PUBLISHERS'));
  assert.match(del, /markPendingDelete\(collectionName,id\);/, 'registered up front');
  assert.match(del, /clearPendingDelete\(collectionName,id\);/, 'and cleared on confirmation');
  assert.ok(del.indexOf('markPendingDelete') < del.indexOf('globalState.isOffline'),
    'an offline delete must be remembered, or the row resurrects on the next snapshot');
});

test('every mirrored watcher tells the merge which collection it carries', () => {
  for (const [collection, field] of [['participants', 'participants'], ['committees', 'committees'], ['certificates', 'certificates'], ['reviews', 'reviewCases'], ['appeals', 'appeals'], ['support_sessions', 'supportSessions']]) {
    const call = `watch('${collection}', rows => { globalState.${field} = mergeById(globalState.${field}, rows, '${collection}'); });`;
    assert.ok(store.includes(call), `${collection} must pass its name so pending rows are protected: ${call}`);
  }
  assert.match(store, /return mergeRowsFromCloud\(local, remote, collection \? \{/, 'and the merge itself is the shared rule');
});

test('the result merge and the config write both defer to the shared rules', () => {
  assert.match(store, /return mergeRankedFromCloud\(local, remote, RESULT_STATUS_RANK, \(rowId\) => rowHasPendingWrite\('results', rowId\)\);/,
    'sealing authority and the pending guard come from one place');
  const configPersist = store.slice(store.indexOf('async function persistCompetitionConfiguration('), store.indexOf('function syncToFirestore()'));
  assert.match(configPersist, /if\(!configWriteAllowed\(cloudUpdatedAt,localUpdatedAt\)\)\{resolveCloudScope\('competition'\);return 'stale';\}/,
    'a device holding an older config stands down instead of writing over the newer one');
});

test('work that has not reached the cloud survives closing the tab', () => {
  assert.match(store, /const PENDING_CLOUD_KEY = 'mizan_pending_cloud_v1';/, 'the register has its own storage key');
  assert.match(store, /PendingRegister\.deserialize\(/, 'it is read back on boot');
  assert.match(store, /const payload = pendingRegister\.serialize\(\);/, 'and written on change');
  assert.match(store, /if \(pendingCloudWriteCount\(\) > 0\) syncToFirestore\(\);/,
    'restored work resumes as soon as a cloud session exists, not at the next incidental change');
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
  assert.match(store, /function markPendingDelete\(collection: string, id: string\) \{\n  if \(!shouldRegisterPending\(collection\)\) return;/,
    'and so do deletes');
});
