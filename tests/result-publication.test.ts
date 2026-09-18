/*
 * §30 — «نُشرت النتائج» أثرٌ يشهد به الخادم.
 *
 * النشرُ كان يقع في العميل وحده: هو يفحص فصلَ المهامّ، وهو يكتب الأثر. وقواعدُ Firestore
 * تحرس الكتابةَ نفسها — وهذا حقيقيّ — لكنّ السجلَّ الذي يُحتجّ به عند النزاع كان مؤلَّفًا
 * ممّن يُحتجّ عليه: عميلٌ مُعدَّل يكتب `RESULTS_PUBLISHED` لمسابقةٍ لم تُنشر نتائجُها.
 *
 * فصار النشرُ يمرّ من مسارٍ خادميّ: الهويةُ من الرمز المُصدَّق، وفصلُ المهامّ من سجلّ
 * الأختام لا من حقلٍ يرسله العميل، والأثرُ يكتبه الخادم.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  FilePublicationStore,
  MemoryPublicationStore,
  publicationDecision,
  type PublicationRecord,
} from '../server/result-publication';

const SERVER = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');
const sealers = (...uids: string[]) => new Set(uids);

test('the one who sealed may not be the one who publishes', () => {
  const decision = publicationDecision({ actorUid: 'judge-1', sealers: sealers('judge-1'), sealCount: 3 });
  assert.deepEqual(decision, { code: 'RESULT_PUBLICATION_SOD_BLOCKED' });
});

test('sealing even one of the results being published blocks the publisher', () => {
  /*
   * قاعدةُ Firestore تُطبَّق على كلِّ وثيقة: من ختمها لا ينشرها. فناشرٌ ختم واحدةً فقط
   * سيخالف القاعدةَ على تلك الوثيقة — فالرفضُ يقع على النشر كلِّه، لا على ما عداها.
   */
  const decision = publicationDecision({ actorUid: 'admin-2', sealers: sealers('judge-1', 'admin-2', 'judge-3'), sealCount: 12 });
  assert.deepEqual(decision, { code: 'RESULT_PUBLICATION_SOD_BLOCKED' });
});

test('a publisher who sealed nothing may publish', () => {
  const decision = publicationDecision({ actorUid: 'admin-9', sealers: sealers('judge-1', 'judge-3'), sealCount: 12 });
  assert.deepEqual(decision, { publish: true, sealCount: 12 });
});

test('publishing nothing is not publishing', () => {
  // إعلانُ نتائج لم تُختم ليس نشرًا، وهو أسوأ من غياب النشر: يُقرأ على أنه حسمٌ وقع.
  assert.deepEqual(publicationDecision({ actorUid: 'admin-9', sealers: sealers(), sealCount: 0 }),
    { code: 'RESULT_PUBLICATION_NO_SEALED_RESULTS' });
});

test('an unauthenticated actor never publishes', () => {
  assert.deepEqual(publicationDecision({ actorUid: '', sealers: sealers('judge-1'), sealCount: 4 }),
    { code: 'RESULT_PUBLICATION_SOD_BLOCKED' });
});

test('publishing twice returns the first publication, not a second one', () => {
  /*
   * ضغطةٌ مزدوجة أو إعادةُ محاولةٍ بعد انقطاع كانت تُعيد ختم `publishedAt` بوقتٍ جديد
   * وتكتب الأثر ثانيًا وتُرسل «صدرت نتيجتك» مرّةً أخرى — والمتسابق يقرأ الثانيةَ نتيجةً
   * جديدة. فالنداءُ الثاني يقول «تمّ» ولا يفعل شيئًا.
   */
  const existing: PublicationRecord = {
    organizationId: 'org-1', competitionId: 'comp-1', publishedBy: 'admin-9',
    publishedAt: '2026-09-18T00:00:00.000Z', sealCount: 12,
  };
  const decision = publicationDecision({ actorUid: 'admin-9', sealers: sealers('judge-1'), sealCount: 12, existing });
  assert.deepEqual(decision, { publish: false, idempotent: true, record: existing });
});

test('an already-published competition stays published even if the retry comes from the sealer', () => {
  // إعادةُ المحاولة لا تُعيد فتح قرارٍ وقع؛ ولا تُحوَّل إلى رفضٍ يربك المشغّل.
  const existing: PublicationRecord = {
    organizationId: 'org-1', competitionId: 'comp-1', publishedBy: 'admin-9',
    publishedAt: '2026-09-18T00:00:00.000Z', sealCount: 12,
  };
  const decision = publicationDecision({ actorUid: 'judge-1', sealers: sealers('judge-1'), sealCount: 12, existing });
  assert.ok('record' in decision, 'the recorded publication is returned');
});

test('the memory store keeps publications apart by tenant and competition', () => {
  const store = new MemoryPublicationStore();
  store.write({ organizationId: 'org-1', competitionId: 'comp-1', publishedBy: 'a', publishedAt: 't', sealCount: 1 });
  assert.equal(store.read('org-1', 'comp-2'), undefined, 'another competition is not published');
  assert.equal(store.read('org-2', 'comp-1'), undefined, 'another tenant is not published');
  assert.equal(store.read('org-1', 'comp-1')?.publishedBy, 'a');
});

test('the file store survives a restart and does not leak between competitions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-pub-'));
  try {
    const store = new FilePublicationStore(dir, fs, path);
    store.write({ organizationId: 'org-1', competitionId: 'comp-1', publishedBy: 'admin-9', publishedAt: 't', sealCount: 7 });
    // نسخةٌ جديدة تقرأ ما كتبته الأولى — وهو معنى «النشر وقع مرّة» عبر إعادة التشغيل.
    const reopened = new FilePublicationStore(dir, fs, path);
    assert.equal(reopened.read('org-1', 'comp-1')?.sealCount, 7);
    assert.equal(reopened.read('org-1', 'comp-2'), undefined);
    assert.equal(reopened.durability, 'LOCAL_DISK_DEVELOPMENT_ADAPTER',
      'the local adapter must say what it is, not be taken for shared durable storage');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a competition id that walks the filesystem cannot escape the store directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-pub-'));
  try {
    const store = new FilePublicationStore(dir, fs, path);
    store.write({ organizationId: '../../etc', competitionId: '../../passwd', publishedBy: 'x', publishedAt: 't', sealCount: 1 });
    const written = fs.readdirSync(dir);
    assert.equal(written.length, 1, 'exactly one file, inside the store directory');
    // الشرطُ الحقيقي ليس خلوَّ الاسم من نقطتين، بل ألّا يخرج المسارُ من المجلّد.
    const resolved = path.resolve(dir, written[0]);
    assert.equal(path.dirname(resolved), path.resolve(dir), `escaped to ${resolved}`);
    assert.equal(written[0].includes('/'), false, 'no separator may survive into the file name');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the route authors the event itself and reads the sealers from the registry', () => {
  const start = SERVER.indexOf("app.post('/api/results/publish'");
  assert.ok(start > 0, 'the publish route must exist');
  const body = SERVER.slice(start, start + 2600);
  assert.ok(body.includes("action:'RESULT_PUBLISHED'"), 'the server must author the event');
  assert.ok(body.includes('resultSealRegistry.sealersOf('), 'separation of duties must come from the seal registry');
  assert.equal(/publishedBy:\s*String\(req\.body/.test(body), false,
    'the publisher is the authenticated identity, never a name the client sends about itself');
  assert.ok(body.includes('String(actor.uid||actor.email||\'\')'), 'the publisher is taken from the verified identity');
  assert.ok(body.includes('auditRateLimit'), 'the route must be rate-limited like its neighbours');
});
