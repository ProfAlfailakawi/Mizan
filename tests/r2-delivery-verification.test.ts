/*
 * البوّابةُ تتحقّق الآن من الشجرة التي يعتمد عليها المنتج — لا من تخطيطٍ لا يكتب فيه أحد.
 *
 * والخطرُ في هذا التحويل واحدٌ وواضح: أن يصير أخضرَ ما كان أحمر **لأن الفحص لان**، لا
 * لأن الشجرة سليمة. فلكلِّ وجهٍ من وجوه اللين اختبارٌ هنا:
 *
 *   · بصمةٌ لا تُعاد بالخوارزميّة نفسها ⇒ رقمٌ آخرُ يُقرأ فسادًا حيث لا فساد، أو — أسوأ —
 *     مقارنةٌ تُلغى بصمت. فالبصمةُ تُقارن بما يُنتجه `hashDirectory` نفسُه على مجلَّدٍ حقيقيّ.
 *   · حزمةٌ بلا بصمةٍ معلنة ⇒ لا يُتحقَّق منها بحال، فلا تُعدّ سليمةً لمطابقة العدد.
 *   · كتالوجٌ بمخطّطٍ آخر ⇒ يُرفض، ولا يُقرأ «قديمًا يُتسامح معه».
 *   · قائمةُ المطلوب تُكتب هنا ⇒ تفارق ما يعلنه المنتج بصمت. فتُقرأ منه.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { hashDirectory, KFGQPC_REQUIRED_DELIVERY_DATASETS } from '../server/kfgqpc-ingest-core';
import {
  DELIVERY_CATALOG_KEY, DeliveryVerificationError, datasetIntegrityVerdict, deliveryDirectoryDigest,
  packageLayoutMode, readDeliveryCatalog, relativeKey, requiredDatasetVerdicts,
} from '../server/r2-delivery-verification';

const dataset = (id: string, over: Record<string, unknown> = {}) => ({
  id, status: 'VERIFIED', r2Prefix: `delivery/quran-data/${id}/v1`,
  fileCount: 2, totalBytes: 30, sha256: 'a'.repeat(64), ...over,
}) as never;

const catalogOf = (datasets: unknown[]) => ({
  schemaVersion: 'MIZAN-R2-CATALOG-1', state: 'READY', generatedAt: '2026-09-18T00:00:00.000Z',
  datasets, unavailableAudio: [], unverifiedAudio: [],
});

test('the digest is the one the ingest actually wrote, byte for byte', () => {
  /*
   * هذا هو الاختبار الذي يمنع اللين: لو حُسبت البصمةُ بترتيبٍ آخر أو بصيغةٍ نصّيّةٍ بدل
   * البايتات، لأعطت رقمًا لا يطابق شيئًا — فإمّا تحمرّ البوّابةُ أبدًا بلا سبب، وإمّا
   * يُسكَت عن المقارنة. فتُقارن بالمصدر نفسه على مجلَّدٍ حقيقيّ.
   */
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-digest-'));
  try {
    fs.mkdirSync(path.join(root, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(root, 'b.json'), '{"ayah":"٢٥٥"}');
    fs.writeFileSync(path.join(root, 'a.json'), 'first');
    fs.writeFileSync(path.join(root, 'nested', 'c.txt'), 'ثالث');

    const onDisk = hashDirectory(root);
    const fromStorage = deliveryDirectoryDigest(
      onDisk.files.map(file => ({
        relativePath: path.relative(root, file).split(path.sep).join('/'),
        bytes: new Uint8Array(fs.readFileSync(file)),
      })),
    );

    assert.equal(fromStorage.sha256, onDisk.sha256, 'the storage-side digest must reproduce the ingest-side digest');
    assert.equal(fromStorage.fileCount, onDisk.fileCount);
    assert.equal(fromStorage.totalBytes, onDisk.totalBytes);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the digest depends on the path, not only on the bytes', () => {
  // ملفّان بنفس المحتوى وباسمين مختلفين ليسا الشيءَ نفسه — وإلّا مرّت إعادةُ تسميةٍ صامتة.
  const bytes = new Uint8Array(Buffer.from('نصّ'));
  const a = deliveryDirectoryDigest([{ relativePath: 'data.json', bytes }]).sha256;
  const b = deliveryDirectoryDigest([{ relativePath: 'other.json', bytes }]).sha256;
  assert.notEqual(a, b);
});

test('order does not change the digest — the storage lists in its own order', () => {
  const one = { relativePath: 'a.json', bytes: new Uint8Array([1, 2]) };
  const two = { relativePath: 'b.json', bytes: new Uint8Array([3]) };
  assert.equal(deliveryDirectoryDigest([one, two]).sha256, deliveryDirectoryDigest([two, one]).sha256);
});

test('a package with different bytes does not pass', () => {
  const declared = dataset('hafs', { sha256: crypto.createHash('sha256').update('original').digest('hex') });
  const verdict = datasetIntegrityVerdict(declared, { fileCount: 2, totalBytes: 30, sha256: 'b'.repeat(64) });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, 'DATASET_DIGEST_MISMATCH');
});

test('a package with no declared digest is not called sound because its file count matches', () => {
  // تحقّقٌ من حزمةٍ بلا مرجعٍ تُقاس إليه تحقّقٌ وهميّ — وهو أسوأ من لا تحقّق.
  const verdict = datasetIntegrityVerdict(dataset('warsh', { sha256: undefined }), { fileCount: 2, totalBytes: 30, sha256: 'c'.repeat(64) });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, 'DATASET_DIGEST_NOT_DECLARED');
});

test('an empty prefix on the storage is a failure, not an empty success', () => {
  const verdict = datasetIntegrityVerdict(dataset('qalun'), { fileCount: 0, totalBytes: 0 });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, 'DATASET_EMPTY_ON_STORAGE');
});

test('file count and size are compared even without --deep', () => {
  assert.equal(datasetIntegrityVerdict(dataset('shubah'), { fileCount: 3, totalBytes: 30 }).code?.startsWith('DATASET_FILE_COUNT_MISMATCH'), true);
  assert.equal(datasetIntegrityVerdict(dataset('shubah'), { fileCount: 2, totalBytes: 31 }).code?.startsWith('DATASET_SIZE_MISMATCH'), true);
  assert.equal(datasetIntegrityVerdict(dataset('shubah'), { fileCount: 2, totalBytes: 30 }).ok, true);
});

test('the required list is read from the product, never restated here', () => {
  /*
   * قائمةٌ تُكتب في الاختبار تفارق قائمةَ المنتج بصمت: تُضاف حزمةٌ مطلوبةٌ هناك ولا
   * تُتحقَّق هنا، والبوّابةُ خضراءُ وهي لا تنظر إليها.
   */
  const verdicts = requiredDatasetVerdicts(catalogOf([]) as never);
  assert.equal(verdicts.length, KFGQPC_REQUIRED_DELIVERY_DATASETS.length);
  assert.deepEqual(verdicts.map(v => v.id), [...KFGQPC_REQUIRED_DELIVERY_DATASETS]);
  assert.ok(verdicts.every(v => !v.ok && v.code === 'DATASET_MISSING_FROM_CATALOG'),
    'a catalog that declares nothing must fail every requirement, not pass vacuously');
});

test('a dataset the catalog has not verified does not count as verified', () => {
  const verdicts = requiredDatasetVerdicts(catalogOf([dataset('hafs', { status: 'QUARANTINED' })]) as never);
  const hafs = verdicts.find(v => v.id === 'hafs')!;
  assert.equal(hafs.ok, false);
  assert.equal(hafs.code, 'DATASET_NOT_VERIFIED:QUARANTINED');
});

test('a catalog of another schema is refused, not tolerated as old', () => {
  assert.throws(() => readDeliveryCatalog({ schemaVersion: 'MIZAN-R2-CATALOG-0', state: 'READY', datasets: [] }),
    (err: unknown) => err instanceof DeliveryVerificationError && err.code.startsWith('DELIVERY_CATALOG_SCHEMA_UNSUPPORTED'));
  assert.throws(() => readDeliveryCatalog({ schemaVersion: 'MIZAN-R2-CATALOG-1', state: 'DRAFT', datasets: [] }),
    (err: unknown) => err instanceof DeliveryVerificationError && err.code.startsWith('DELIVERY_CATALOG_NOT_READY'));
  assert.throws(() => readDeliveryCatalog(null),
    (err: unknown) => err instanceof DeliveryVerificationError && err.code === 'DELIVERY_CATALOG_UNREADABLE');
});

test('the catalog keeps the two declared audio exceptions readable', () => {
  // استثناءٌ معلنٌ في الكتالوج ليس استثناءً صامتًا — يُقرأ ويُطبع.
  const catalog = readDeliveryCatalog({ ...catalogOf([]), unavailableAudio: ['audio-warsh'], unverifiedAudio: ['audio-duri'] });
  assert.deepEqual(catalog.unavailableAudio, ['audio-warsh']);
  assert.deepEqual(catalog.unverifiedAudio, ['audio-duri']);
});

test('an object outside the package prefix is refused, never trimmed into place', () => {
  assert.equal(relativeKey('delivery/quran-data/hafs/v13', 'delivery/quran-data/hafs/v13/data.json'), 'data.json');
  assert.throws(() => relativeKey('delivery/quran-data/hafs/v13', 'delivery/quran-data/warsh/v6/data.json'),
    (err: unknown) => err instanceof DeliveryVerificationError && err.code.startsWith('OBJECT_OUTSIDE_PREFIX'));
});

test('the unpublished package layout is off by default, and only an explicit setting turns it on', () => {
  /*
   * حذفُ التحقّق إخفاء، وإبقاؤه بوّابةً إحمرارٌ أبديٌّ يُعلَّم تجاهلُه. فإعدادٌ معلن —
   * وهو النمطُ نفسُه المفروض على سياسة التعادل: قرارٌ لا يُخترع بل يُصرَّح بغيابه.
   */
  assert.equal(packageLayoutMode({}), 'not-in-use');
  assert.equal(packageLayoutMode({ MIZAN_QURAN_PACKAGE_LAYOUT: '' }), 'not-in-use');
  assert.equal(packageLayoutMode({ MIZAN_QURAN_PACKAGE_LAYOUT: 'true' }), 'not-in-use', 'only the documented word turns it on');
  assert.equal(packageLayoutMode({ MIZAN_QURAN_PACKAGE_LAYOUT: 'enabled' }), 'enabled');
  assert.equal(packageLayoutMode({ MIZAN_QURAN_PACKAGE_LAYOUT: ' Enabled ' }), 'enabled');
});

test('the catalog key is the one the product health check already reads', () => {
  // مفتاحان لكتالوجٍ واحد يعني بوّابةً تقرأ غيرَ ما يقرأ المنتج.
  const client = fs.readFileSync(path.join(process.cwd(), 'server', 'r2-private.ts'), 'utf8');
  assert.ok(client.includes(`'${DELIVERY_CATALOG_KEY}'`),
    'the verifier and the runtime health check must read the same catalog object');
});
