/*
 * P19 (إنهاءُ المشارك) — الختمُ يقع مرّة.
 *
 * `sealResult` دالّةٌ بلا حالة تضع `sealedAt` في بصمتها، فنداءان بنفس المدخلات — انقطاعُ
 * شبكةٍ بعد نجاح الخادم، ضغطةٌ مزدوجة، إعادةُ محاولةٍ تلقائية — يخرجان ببصمتَي ختمٍ
 * مختلفتين لنفس الدرجة، ويكتبان صفَّي تدقيقٍ لحدثٍ واحد. فيرى المدقّق ختمين لنفس المشارك
 * بنفس الرقم وببصمتين ولا يعرف أيّهما المعتمَد.
 *
 * وهذه الاختبارات تفصل الحالتين: نفسُ المدخلات ⇒ الختم نفسه بلا أثرٍ ثانٍ؛ ومدخلاتٌ
 * تغيّرت ⇒ ختمٌ جديد يعلن ما نسخه.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { sealResult, verifySeal, type SealRequest } from '../server/result-sealing';
import {
  FileSealRegistryStore,
  MemorySealRegistryStore,
  ResultSealRegistry,
  type SealRegistryRecord,
} from '../server/result-seal-registry';

const criteria = [
  { id: 'hifz', nameArabic: 'الحفظ', weight: 60, maxScore: 60 },
  { id: 'tajweed', nameArabic: 'التجويد', weight: 40, maxScore: 40 },
] as never[];

const submissions = [
  { judgeId: 'usr-j1', scores: { hifz: 55, tajweed: 36 }, submittedAt: '2026-05-01T08:00:00.000Z' },
  { judgeId: 'usr-j2', scores: { hifz: 57, tajweed: 35 }, submittedAt: '2026-05-01T08:01:00.000Z' },
] as never[];

const request = (over: Partial<SealRequest> = {}): SealRequest => ({
  competitionId: 'comp-1', participantId: 'p-1', sessionId: 's-1', categoryId: 'cat-1',
  submissions, criteria, mode: 'all_judges_all_criteria', dropExtremes: false, sessionEventCount: 0,
  sealedBy: 'uid-head-judge', ...over,
});

const recordFor = (outcome: ReturnType<typeof sealResult>, organizationId = 'org-1'): SealRegistryRecord => {
  assert.ok('sealed' in outcome, 'the fixture must produce a seal');
  const sealed = outcome.sealed;
  return {
    organizationId, competitionId: sealed.competitionId, participantId: sealed.participantId,
    sessionId: sealed.sessionId, inputsSha256: sealed.inputsSha256, sealSha256: sealed.sealSha256,
    sealedBy: sealed.sealedBy, sealedAt: sealed.sealedAt, finalScore: sealed.finalScore,
    sealed: sealed as unknown as Record<string, unknown>,
  };
};

/*
 * تُضبط الساعةُ هنا ولا تُسابَق.
 *
 * كان هذا الاختبار ينادي `sealResult` مرّتين متتاليتين ويشترط اختلافَ البصمتين،
 * واختلافُهما مصدرُه `sealedAt` وحده — وهو بدقّة الملّي. فعلى عدّاءٍ سريع يقع
 * النداءان في الطرفة نفسها، فتتطابق البصمتان ويسقط التأكيد. وقد وقع ذلك فعلًا في
 * 19 سبتمبر 2026: مرّةً على #225 ومرّةً على `main` عند `9bc8a69`، وفي الحالتين
 * نجحت الحزمةُ كاملةً محليًّا. وأُعيد إنتاجُه حتميًّا بتجميد الساعة.
 *
 * و«تقطُّع» ليس سببًا جذريًّا، وإعادةُ التشغيل حتى يختفي هي كيف يُستأنس بالأحمر.
 * فالعلّةُ في الاختبار لا في المنتج: الخاصّيةُ التي يريد إثباتَها صحيحةٌ ومهمّة،
 * لكنّه كان يُثبتها بمصادفةِ توقيتٍ بدل أن يُصرّح بالآلية.
 *
 * فصارت الساعةُ مضبوطةً، ويُقال الحدّان معًا — وهما أقوى ممّا كان:
 *
 *   · طابعان مختلفان ⇒ بصمتا ختمٍ مختلفتان: `sealedAt` جزءٌ من البصمة حقًّا.
 *   · والطابعُ نفسُه ⇒ **البصمةُ نفسُها**: فالبصمةُ وحدها لا تُميّز إعادةَ محاولةٍ
 *     من ختمٍ جديد — وهذا بعينه سببُ وجوب السجلّ.
 */
const atFrozenTime = <T>(iso: string, body: () => T): T => {
  const RealDate = Date;
  const fixed = new RealDate(iso).getTime();
  class FrozenDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length) super(...(args as [])); else super(fixed);
    }
    static now() { return fixed; }
  }
  (globalThis as { Date: DateConstructor }).Date = FrozenDate as unknown as DateConstructor;
  try { return body(); } finally { (globalThis as { Date: DateConstructor }).Date = RealDate; }
};

test('the same inputs produce a different digest each call — which is exactly why a registry is needed', () => {
  const first = atFrozenTime('2026-05-01T09:00:00.000Z', () => sealResult(request()));
  const second = atFrozenTime('2026-05-01T09:00:01.000Z', () => sealResult(request()));
  assert.ok('sealed' in first && 'sealed' in second);
  assert.equal(first.sealed.inputsSha256, second.sealed.inputsSha256, 'the inputs are identical');
  assert.equal(first.sealed.finalScore, second.sealed.finalScore, 'and so is the score');
  assert.notEqual(first.sealed.sealedAt, second.sealed.sealedAt, 'only the moment differs');
  // ...ومع ذلك تختلف بصمة الختم، لأن `sealedAt` جزءٌ منها. فالتمييز يجب أن يكون بالمدخلات.
  assert.notEqual(first.sealed.sealSha256, second.sealed.sealSha256);
});

/*
 * وهذا الحدُّ يعزل `sealedAt` وحده.
 *
 * فقد نبّهت مراجعةُ Codex على #227 إلى أن الحدَّ السابق لا يُثبت ما يدّعيه: `sealResult`
 * ينادي `attestResult` في طريقه، و`attestedAt` فيه من `new Date()` أيضًا. فتجميدُ الساعة
 * على لحظتين يُحرّك الطابعين معًا، فاختلافُ البصمتين قد يكون من التصديق لا من الختم.
 * وقيس ذلك: أُخرِج `sealedAt` من البصمة إخراجًا تامًّا فاجتازت الاختبارات التسعة كلُّها.
 *
 * فيُبدَّل طابعٌ واحد على ختمٍ قائم، ولا يُمسّ سواه، ويُسأل `verifySeal`. ولا مخرج له
 * حينئذٍ: إن كان `sealedAt` داخل البصمة سقط التحقّق، وإن كان خارجها نجح — وهي الدعوى
 * نفسُها، مقيسةً لا مستنتَجة.
 */
test('tampering with sealedAt alone breaks the digest — proving the stamp is inside it', () => {
  const outcome = atFrozenTime('2026-05-01T09:00:00.000Z', () => sealResult(request()));
  assert.ok('sealed' in outcome);
  assert.equal(verifySeal(outcome.sealed), true, 'the untouched seal must verify first');

  const tampered = { ...outcome.sealed, sealedAt: '2026-05-01T09:00:01.000Z' };
  assert.equal(tampered.attestation.attestedAt, outcome.sealed.attestation.attestedAt,
    'and nothing else may move — the attestation stamp is held fixed');
  assert.equal(verifySeal(tampered), false,
    'sealedAt is covered by sealSha256; a seal whose stamp was rewritten is no longer its own seal');
});

test('two seals stamped in the same instant share a digest — so the digest can never be the duplicate check', () => {
  const [first, second] = atFrozenTime('2026-05-01T09:00:00.000Z',
    () => [sealResult(request()), sealResult(request())] as const);
  assert.ok('sealed' in first && 'sealed' in second);
  assert.equal(first.sealed.sealedAt, second.sealed.sealedAt, 'the fixture must pin the instant');
  assert.equal(first.sealed.sealSha256, second.sealed.sealSha256,
    'identical inputs at an identical instant are indistinguishable by digest — ' +
    'duplicate detection therefore belongs to the registry, never to sealSha256');
});

test('a retried seal returns the stored seal verbatim and records nothing new', () => {
  const registry = new ResultSealRegistry(new MemorySealRegistryStore());
  const first = registry.record(recordFor(sealResult(request())));
  assert.equal(first.idempotent, false);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const retry = registry.record(recordFor(sealResult(request())));
    assert.equal(retry.idempotent, true, `retry ${attempt} must be recognised as a repeat`);
    assert.deepEqual(retry.record, first.record, 'the very same seal comes back — same digest, same timestamp');
  }
  assert.equal(registry.sealersOf('org-1', 'comp-1').size, 1);
});

test('a real re-seal — inputs changed — is a new record that supersedes, not a duplicate', () => {
  const registry = new ResultSealRegistry(new MemorySealRegistryStore());
  const original = sealResult(request());
  assert.ok('sealed' in original);
  registry.record(recordFor(original));

  const corrected = sealResult(request({
    submissions: [...submissions, { judgeId: 'usr-j3', scores: { hifz: 50, tajweed: 30 }, submittedAt: '2026-05-01T08:02:00.000Z' }] as never[],
    previousSealSha256: original.sealed.sealSha256,
    previousFinalScore: original.sealed.finalScore,
  }));
  assert.ok('sealed' in corrected);
  assert.notEqual(corrected.sealed.inputsSha256, original.sealed.inputsSha256, 'different inputs, genuinely');
  assert.ok(corrected.sealed.supersedes, 'a real re-seal announces what it replaces');

  const outcome = registry.record(recordFor(corrected));
  assert.equal(outcome.idempotent, false, 'a changed result is not a repeat');
  assert.equal(registry.latestFor('org-1', 'comp-1', 'p-1')!.sealSha256, corrected.sealed.sealSha256);
});

test('a different participant with an identical score is never mistaken for a repeat', () => {
  const registry = new ResultSealRegistry(new MemorySealRegistryStore());
  registry.record(recordFor(sealResult(request())));
  const other = registry.record(recordFor(sealResult(request({ participantId: 'p-2' }))));
  assert.equal(other.idempotent, false);
  assert.notEqual(registry.latestFor('org-1', 'comp-1', 'p-2'), undefined);
  assert.notEqual(
    registry.latestFor('org-1', 'comp-1', 'p-1')!.sealSha256,
    registry.latestFor('org-1', 'comp-1', 'p-2')!.sealSha256,
  );
});

test('one tenant never sees another tenant seals', () => {
  const registry = new ResultSealRegistry(new MemorySealRegistryStore());
  registry.record(recordFor(sealResult(request()), 'org-1'));
  registry.record(recordFor(sealResult(request()), 'org-2'));
  const probe = sealResult(request());
  assert.ok('sealed' in probe);
  assert.equal(registry.findByInputs('org-2', 'comp-1', 'p-1', probe.sealed.inputsSha256)!.organizationId, 'org-2');
  assert.equal(registry.sealersOf('org-1', 'comp-1').size, 1);
  assert.equal(registry.latestFor('org-3', 'comp-1', 'p-1'), undefined, 'a tenant with no seals sees nothing');
});

test('the registry knows who sealed — which is what server-side separation of duties reads', () => {
  const registry = new ResultSealRegistry(new MemorySealRegistryStore());
  registry.record(recordFor(sealResult(request({ sealedBy: 'uid-head-judge' }))));
  registry.record(recordFor(sealResult(request({ participantId: 'p-2', sealedBy: 'uid-comp-admin' }))));
  assert.deepEqual([...registry.sealersOf('org-1', 'comp-1')].sort(), ['uid-comp-admin', 'uid-head-judge']);
  assert.equal(registry.latestFor('org-1', 'comp-1', 'p-2')!.sealedBy, 'uid-comp-admin');
});

test('the file adapter survives a restart and declares that it is a development adapter', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-seals-'));
  try {
    const store = new FileSealRegistryStore(dir);
    assert.equal(store.durability, 'LOCAL_DISK_DEVELOPMENT_ADAPTER',
      'the adapter must say plainly that it is not a multi-instance production store');
    const registry = new ResultSealRegistry(store);
    const first = registry.record(recordFor(sealResult(request())));

    // نسخةٌ جديدة على المسار نفسه = إقلاعٌ بعد إعادة تشغيل. السجلّ يبقى.
    const afterRestart = new ResultSealRegistry(new FileSealRegistryStore(dir));
    const retry = afterRestart.record(recordFor(sealResult(request())));
    assert.equal(retry.idempotent, true, 'a retry after a restart is still a retry');
    assert.equal(retry.record.sealSha256, first.record.sealSha256);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the seal route returns the stored seal instead of minting a second one', () => {
  const server = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');
  const route = server.split('\n').find(line => line.includes("app.post('/api/results/seal'")) || '';
  // المسار مكتوبٌ على أسطر، فيُقرأ المقطع كاملًا حتى المسار التالي.
  const start = server.indexOf("app.post('/api/results/seal',");
  const end = server.indexOf("app.post('/api/results/seal/verify'");
  const body = server.slice(start, end > start ? end : start + 6000);
  assert.ok(route || body, 'the seal route must exist');
  /* بلا `?.`: السجلُّ الغائب كان يُسقط كشفَ التكرار صامتًا، فصار المسارُ يردّ 503 قبله. */
  assert.ok(body.includes('resultSealRegistry.findByInputs('), 'the route must look for an existing seal first');
  assert.ok(body.includes('idempotent:true'), 'a repeat is reported as a repeat, not as a fresh seal');
  // وصفُّ التدقيق يأتي بعد الفحص، فلا يُكتب مرّتين لحدثٍ واحد.
  assert.ok(body.indexOf('resultSealRegistry.findByInputs(') < body.indexOf("action:'RESULT_SEALED'"),
    'the idempotency check must come before the audit append, or the ledger gains a duplicate row');
});
