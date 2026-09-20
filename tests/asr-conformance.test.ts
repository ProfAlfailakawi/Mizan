/*
 * الفاحصُ نفسُه يُفحص — وإلا كان حارسًا يبدو حارسًا ولا يحرس.
 *
 * فكلُّ بندٍ هنا يُجرَّب مرّتين: على محرّكٍ يلتزم فيمرّ، وعلى محرّكٍ يخالفه في ذلك
 * البند وحدَه فيسقط باسمه. ولو مرّ المخالفُ لكان الفحصُ زينةً.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { runConformance, PROBE_BYTES, type EngineCall, type EngineCaller } from '../server/asr-conformance';
import { startReferenceEngine, REFERENCE_MODEL_VERSION, REFERENCE_TOKENS } from '../tools/asr-reference/server';

const ok = (body: unknown, status = 200, latencyMs = 10): EngineCall => ({ status, body, latencyMs });
const goodBody = (reading: string) => ({
  reading, modelVersion: 'engine-1',
  words: [{ text: 'مقطع', confidence: 0.8, startMs: 0, endMs: 500 }],
});

/** محرّكٌ ملتزم، يُشتقّ منه كلُّ مخالفٍ بتغييرٍ واحد. */
const conformant: EngineCaller = async ({ reading, bytes }) =>
  (bytes.length ? ok(goodBody(reading)) : ok({ code: 'EMPTY_AUDIO' }, 400));

const verdict = (report: Awaited<ReturnType<typeof runConformance>>, name: string) =>
  report.checks.find(c => c.name === name);

test('a conformant engine passes every check', async () => {
  const report = await runConformance('http://engine', 'hafs', conformant);
  const failed = report.checks.filter(c => !c.passed).map(c => `${c.name}: ${c.detail}`);
  assert.deepEqual(failed, []);
  assert.equal(report.conformant, true);
  assert.equal(report.modelVersion, 'engine-1');
  assert.equal(report.p95LatencyMs, 10);
});

test('an engine that answers another riwayah than the one asked is caught', async () => {
  /*
   * وهذا أخطرُ بندٍ فيه: محرّكٌ يسمع حفصًا وحدَه ثمّ يردّ على طلب ورشٍ بنتيجةٍ
   * يسمّيها ورشًا هو التنازلُ بين الروايات بعينه.
   */
  const liar: EngineCaller = async ({ bytes }) => (bytes.length ? ok(goodBody('hafs')) : ok({}, 400));
  const report = await runConformance('http://engine', 'hafs', liar);
  const echo = verdict(report, 'riwayah-echo');
  assert.equal(echo?.passed, false, 'مرّ محرّكٌ يردّ باسم روايةٍ غير المطلوبة');
  assert.match(echo!.detail, /hafs/);
  assert.equal(report.conformant, false);
});

test('an engine that refuses a riwayah it does not serve is conformant', async () => {
  /* فالرفضُ الصريحُ صوابٌ — والمنكَرُ أن يُجيب بغير ما سُئل. */
  const honest: EngineCaller = async ({ reading, bytes }) => {
    if (reading !== 'hafs') return ok({ code: 'READING_NOT_SERVED' }, 422);
    return bytes.length ? ok(goodBody(reading)) : ok({}, 400);
  };
  const report = await runConformance('http://engine', 'hafs', honest);
  assert.equal(verdict(report, 'riwayah-echo')?.passed, true);
  assert.equal(report.conformant, true);
});

test('an answer that breaks the contract is named by the contract reader, not by a second reader here', async () => {
  const cases: [string, unknown][] = [
    ['confidence خارج المدى', { reading: 'hafs', modelVersion: 'engine-1', words: [{ text: 'مقطع', confidence: 4 }] }],
    ['كلمةٌ فارغة', { reading: 'hafs', modelVersion: 'engine-1', words: [{ text: '', confidence: 0.5 }] }],
    ['بلا words', { reading: 'hafs', modelVersion: 'engine-1' }],
    ['بلا نسخةِ نموذج', { reading: 'hafs', words: [] }],
  ];
  for (const [why, body] of cases) {
    const caller: EngineCaller = async ({ bytes }) => (bytes.length ? ok(body) : ok({}, 400));
    const report = await runConformance('http://engine', 'hafs', caller);
    assert.equal(verdict(report, 'shape')?.passed, false, `مرّ ردٌّ مخالف: ${why}`);
    assert.equal(report.conformant, false);
  }
});

test('an engine that accepts empty audio is caught', async () => {
  const sloppy: EngineCaller = async ({ reading }) => ok(goodBody(reading));
  const report = await runConformance('http://engine', 'hafs', sloppy);
  assert.equal(verdict(report, 'empty-audio')?.passed, false);
});

test('an engine whose model version changes between calls is caught', async () => {
  /* فقياسٌ نصفُه على نموذجٍ ونصفُه على آخر ليس قياسًا واحدًا. */
  let call = 0;
  const drifting: EngineCaller = async ({ reading, bytes }) => {
    if (!bytes.length) return ok({}, 400);
    call += 1;
    return ok({ ...goodBody(reading), modelVersion: call > 2 ? 'engine-2' : 'engine-1' });
  };
  const report = await runConformance('http://engine', 'hafs', drifting);
  const stable = verdict(report, 'model-version-stable');
  assert.equal(stable?.passed, false);
  assert.match(stable!.detail, /engine-1.*engine-2/);
});

test('an engine that never answers fails at the first check and says so', async () => {
  const dead: EngineCaller = async () => { throw new Error('ECONNREFUSED') };
  const report = await runConformance('http://engine', 'hafs', dead);
  assert.equal(report.conformant, false);
  assert.equal(report.checks.length, 1);
  assert.match(report.checks[0].detail, /ECONNREFUSED/);
});

test('a word with no timing is reported, because the echo guard depends on it', async () => {
  /* فبلا توقيتٍ يُفقد طرحُ أثر النغمة — ويُقال ذلك ولا يُسكت عنه. */
  const untimed: EngineCaller = async ({ reading, bytes }) =>
    (bytes.length ? ok({ reading, modelVersion: 'engine-1', words: [{ text: 'مقطع', confidence: 0.8 }] }) : ok({}, 400));
  const report = await runConformance('http://engine', 'hafs', untimed);
  assert.equal(report.conformant, true, 'التوقيتُ ليس شرطَ التزام');
  assert.match(verdict(report, 'timings')!.detail, /بلا توقيت/);
});

test('the reference engine in this repository obeys the contract it carries', async () => {
  /*
   * وهو لا يتعرّف على شيء — ألفاظُه عربيّةٌ عاديّةٌ ليست من القرآن. وفائدتُه أن
   * يُشغَّل الفاحصُ في كلّ دفعةٍ مجدولة، فلا يشيخ ويُنكسر بصمت.
   */
  const engine = await startReferenceEngine();
  try {
    const call: EngineCaller = async ({ reading, bytes }) => {
      const url = new URL(`http://127.0.0.1:${engine.port}/recognise`);
      url.searchParams.set('reading', reading);
      const started = Date.now();
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: bytes });
      return { status: response.status, body: await response.json().catch(() => ({})), latencyMs: Date.now() - started };
    };
    const report = await runConformance('reference', 'hafs', call);
    assert.deepEqual(report.checks.filter(c => !c.passed).map(c => c.name), []);
    assert.equal(report.modelVersion, REFERENCE_MODEL_VERSION);
    assert.ok(engine.calls() >= 5, `نداءاتٌ وصلت: ${engine.calls()}`);
  } finally { await engine.close() }
});

test('the reference engine carries no Quranic text at all', async () => {
  /* فنصٌّ قرآنيٌّ يُكتب في أداةٍ نصٌّ مُختلَق مهما بدا صحيحًا — ولا يُكتب هنا بحال. */
  assert.deepEqual([...REFERENCE_TOKENS], ['مقطع', 'صوت']);
  assert.equal(PROBE_BYTES.length, 4096, 'عيّنةُ الصوت بايتاتٌ لا معنى لها');
});
