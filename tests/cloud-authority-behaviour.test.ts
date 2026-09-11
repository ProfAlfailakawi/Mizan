import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PendingRegister, decideUpload, configWriteAllowed,
  mergeRowsFromCloud, mergeRankedFromCloud, type PendingScope,
} from '../src/lib/cloud-authority';

/*
 * هذه الاختبارات **تُشغّل** قاعدة السلطة، لا تقرأ الكود.
 *
 * تُنشئ جهازين لهما سجلّان منفصلان، وتحاكي ما يقع في القاعة: مديران يعدّلان معًا، وجهازٌ
 * يعود من انقطاعِ ساعة، ومحكّمٌ يرصد بلا شبكة ثم يغلق جهازه، ونتيجةٌ يختمها الخادم بينما
 * على جهازٍ مسوّدة. لأن الخطأ هنا لا يُحدث رسالةً حمراء — يُخفي عملًا بصمت.
 */

const ORG = 'org-1';
const COMP: PendingScope = { organizationId: ORG, competitionId: 'comp-2027' };
const OTHER: PendingScope = { organizationId: ORG, competitionId: 'comp-2028' };
const always = () => true;

type Row = { id: string; name: string; status?: string };

test('a device that never touched a row cannot overwrite the cloud copy of it', () => {
  /* المدير الأول لم يمسّ المتسابق قطّ؛ المدير الثاني غيّر لجنته قبل لحظة. */
  const deviceOne = new PendingRegister();
  deviceOne.markWrite(COMP, 'participants', 'p-9', {id: 'p-9', name: 'تسعة'}, 1_000);

  const local: Row[] = [{id: 'p-1', name: 'قديم'}, {id: 'p-9', name: 'تسعة'}];
  const fromCloud: Row[] = [{id: 'p-1', name: 'حدّثه زميل'}, {id: 'p-9', name: 'قديم في السحابة'}];

  const merged = mergeRowsFromCloud(local, fromCloud, {
    isPendingWrite: id => deviceOne.rowHasWrite(COMP, 'participants', id),
    isPendingDelete: id => deviceOne.rowHasDelete(COMP, 'participants', id),
  });

  const byId = Object.fromEntries(merged.map(r => [r.id, r.name]));
  assert.equal(byId['p-1'], 'حدّثه زميل', 'a row this device never touched follows the cloud');
  assert.equal(byId['p-9'], 'تسعة', 'a row this device changed and has not uploaded survives');
});

test('a device back from an hour offline does not push its whole stale world', () => {
  const stale = new PendingRegister();
  /* غيّر صفًّا واحدًا قبل ساعة، وبقيت بقية الصفوف عنده كما استقبلها. */
  stale.markWrite(COMP, 'participants', 'p-changed', {id: 'p-changed'}, 1_000);

  assert.equal(stale.listWrites().length, 1, 'only the row it actually changed is pending');

  /* وذلك الصفّ نفسه: السحابة تحرّكت بعده، فيُترك الأصل. */
  const verdictStale = decideUpload(stale.listWrites()[0], {scope: COMP, canWrite: always, cloudUpdatedAt: 5_000});
  assert.equal(verdictStale, 'drop-cloud-is-newer');

  /* ولو لم تتحرّك السحابة، يُرفع تغييره — فلا يضيع. */
  const verdictFresh = decideUpload(stale.listWrites()[0], {scope: COMP, canWrite: always, cloudUpdatedAt: 500});
  assert.equal(verdictFresh, 'upload');
});

test('an equal timestamp is our own write coming back, not someone overtaking us', () => {
  const register = new PendingRegister();
  register.markWrite(COMP, 'results', 'r-1', {id: 'r-1'}, 2_000);
  assert.equal(decideUpload(register.listWrites()[0], {scope: COMP, canWrite: always, cloudUpdatedAt: 2_000}), 'upload');
});

test('the judge who scored offline and closed the tab does not lose the scores', () => {
  const judgeDevice = new PendingRegister();
  judgeDevice.markWrite(COMP, 'judge_submissions', 'sess-1_judge-7', {id: 'sub-1', name: 'درجات'}, 1_000);

  /* أُغلق التبويب: كل ما بقي هو ما كُتب في تخزين المتصفح. */
  const survived = PendingRegister.deserialize(judgeDevice.serialize());

  assert.equal(survived.size, 1, 'the pending work came back after the reload');
  const [entry] = survived.listWrites();
  assert.equal(entry.markedAt, 1_000, 'and it kept the moment it was changed, so the cloud check is still honest');
  assert.deepEqual(entry.data, {id: 'sub-1', name: 'درجات'}, 'with its payload intact');
  assert.equal(decideUpload(entry, {scope: COMP, canWrite: always, cloudUpdatedAt: 0}), 'upload');
});

test('a corrupt register does not stop the app from starting', () => {
  assert.equal(PendingRegister.deserialize('}{ not json').size, 0);
  assert.equal(PendingRegister.deserialize(null).size, 0);
  assert.equal(PendingRegister.deserialize('{"writes":[{"id":"x"}]}').size, 0, 'an entry with no competition is unusable and dropped');
});

test('pending work is never written into another competition’s path', () => {
  const register = new PendingRegister();
  register.markWrite(OTHER, 'participants', 'p-1', {id: 'p-1'}, 1_000);
  const [entry] = register.listWrites();

  assert.equal(decideUpload(entry, {scope: COMP, canWrite: always, cloudUpdatedAt: 0}), 'skip-other-competition',
    'it waits for its own competition to be open rather than landing in the wrong one');
  assert.equal(register.rowHasWrite(COMP, 'participants', 'p-1'), false,
    'and it does not shield a row in the competition actually on screen');
  assert.equal(register.rowHasWrite(OTHER, 'participants', 'p-1'), true);
});

test('a pending entry the role cannot write is dropped, not held forever', () => {
  const register = new PendingRegister();
  register.markWrite(COMP, 'results', 'r-1', {id: 'r-1'}, 1_000);
  assert.equal(decideUpload(register.listWrites()[0], {scope: COMP, canWrite: c => c !== 'results', cloudUpdatedAt: 0}), 'drop-not-writable');
});

test('a delete that has not reached the cloud keeps the row deleted on screen', () => {
  const register = new PendingRegister();
  register.markDelete(COMP, 'participants', 'p-5', 1_000);

  const merged = mergeRowsFromCloud<Row>([], [{id: 'p-5', name: 'المحذوف'}], {
    isPendingWrite: id => register.rowHasWrite(COMP, 'participants', id),
    isPendingDelete: id => register.rowHasDelete(COMP, 'participants', id),
  });
  assert.deepEqual(merged, [], 'the cloud copy cannot resurrect it while the delete is pending');

  /* وحين ينجح الحذف على الخادم، لا يبقى شيء يحجب لقطةً لاحقة. */
  register.clearDelete(COMP, 'participants', 'p-5');
  const after = mergeRowsFromCloud<Row>([], [{id: 'p-5', name: 'المحذوف'}], {
    isPendingWrite: () => false,
    isPendingDelete: id => register.rowHasDelete(COMP, 'participants', id),
  });
  assert.equal(after.length, 1, 'once the cloud confirms, the guard steps aside');
});

test('a delete supersedes an earlier pending write on the same row', () => {
  const register = new PendingRegister();
  register.markWrite(COMP, 'participants', 'p-5', {id: 'p-5'}, 1_000);
  register.markDelete(COMP, 'participants', 'p-5', 2_000);
  assert.equal(register.listWrites().length, 0, 'uploading a row we just deleted would resurrect it');
  assert.equal(register.listDeletes().length, 1);
});

test('a cloud row this device has never seen is simply adopted', () => {
  const register = new PendingRegister();
  const merged = mergeRowsFromCloud<Row>([], [{id: 'p-new', name: 'من جهاز آخر'}], {
    isPendingWrite: id => register.rowHasWrite(COMP, 'participants', id),
    isPendingDelete: id => register.rowHasDelete(COMP, 'participants', id),
  });
  assert.deepEqual(merged, [{id: 'p-new', name: 'من جهاز آخر'}]);
});

test('a sealed result from the server always outranks a local draft', () => {
  const RANK = {draft: 0, submitted: 1, sealed: 2};
  const local = [{id: 'r-1', status: 'submitted', name: 'مسوّدة'}];
  const remote = [{id: 'r-1', status: 'sealed', name: 'مختوم'}];

  /* حتى ولهذا الجهاز تغييرٌ معلَّق على النتيجة نفسها. */
  const merged = mergeRankedFromCloud(local, remote, RANK, () => true);
  assert.equal(merged[0].status, 'sealed', 'sealing authority is never held back by a pending local edit');
});

test('at equal rank a pending local result is protected, and a lower rank never wins', () => {
  const RANK = {draft: 0, submitted: 1, sealed: 2};
  const guarded = mergeRankedFromCloud(
    [{id: 'r-1', status: 'submitted', name: 'محليّ لم يُرفع'}],
    [{id: 'r-1', status: 'submitted', name: 'قديم في السحابة'}],
    RANK, id => id === 'r-1');
  assert.equal(guarded[0].name, 'محليّ لم يُرفع');

  const notRegressed = mergeRankedFromCloud(
    [{id: 'r-1', status: 'sealed', name: 'مختوم'}],
    [{id: 'r-1', status: 'draft', name: 'مسوّدة قديمة'}],
    RANK, () => false);
  assert.equal(notRegressed[0].status, 'sealed', 'a sealed result never regresses to a draft');
});

test('the competition config is not overwritten by an older copy', () => {
  assert.equal(configWriteAllowed(5_000, 1_000), false, 'ours is older — stand down');
  assert.equal(configWriteAllowed(1_000, 5_000), true, 'ours is newer — write');
  assert.equal(configWriteAllowed(1_000, 1_000), true, 'equal is our own copy');
  assert.equal(configWriteAllowed(0, 5_000), true, 'nothing in the cloud yet — write');
  assert.equal(configWriteAllowed(5_000, 0), true, 'no local stamp to compare — do not block the write');
});

test('two devices editing different rows both land, and neither erases the other', () => {
  /* المشهد الكامل: مديران، كلٌّ غيّر صفًّا، ثم وصلت لقطةٌ تحمل تغيير الآخر. */
  const one = new PendingRegister(), two = new PendingRegister();
  one.markWrite(COMP, 'participants', 'p-1', {id: 'p-1', name: 'غيّره الأول'}, 1_000);
  two.markWrite(COMP, 'participants', 'p-2', {id: 'p-2', name: 'غيّره الثاني'}, 1_000);

  const cloudAfterBothUploaded: Row[] = [{id: 'p-1', name: 'غيّره الأول'}, {id: 'p-2', name: 'غيّره الثاني'}];

  for (const [device, ownRow] of [[one, 'p-1'], [two, 'p-2']] as const) {
    const merged = mergeRowsFromCloud<Row>(
      [{id: ownRow, name: ownRow === 'p-1' ? 'غيّره الأول' : 'غيّره الثاني'}],
      cloudAfterBothUploaded,
      {
        isPendingWrite: id => device.rowHasWrite(COMP, 'participants', id),
        isPendingDelete: id => device.rowHasDelete(COMP, 'participants', id),
      });
    const byId = Object.fromEntries(merged.map(r => [r.id, r.name]));
    assert.equal(byId['p-1'], 'غيّره الأول');
    assert.equal(byId['p-2'], 'غيّره الثاني', 'each device ends up holding both changes');
  }
});
