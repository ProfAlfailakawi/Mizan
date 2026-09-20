/*
 * البابُ الذي لا يُفتح إلا بثلاثة — وهذه الاختباراتُ تقف عليه.
 *
 * والأرقامُ في تقارير هذا الملفّ مُفتعَلةٌ للبنية ولا تدّعي قياسَ محرّكٍ حقيقيّ،
 * واسمُ مُعطاها يقول ذلك. والمقيسُ هنا سلوكُ الباب: متى يُفتح، ومتى يُغلق، وبأيّ
 * اسمٍ يُغلق، وماذا يفعل بما يعود إليه من الشبكة.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { AsrBenchmarkRepository, RecitationRecogniser, MAX_ASR_CHUNK_BYTES } from '../server/recitation-recogniser';
import { ASR_BENCHMARK_VERSION, type AsrBenchmarkReport, type RecitationJudgingGate } from '../server/recitation-asr-contract';

const HAFS_PACKAGE = 'kfgqpc-hafs-uthmanic-v13';

function report(over: Partial<AsrBenchmarkReport> = {}): AsrBenchmarkReport {
  return {
    version: ASR_BENCHMARK_VERSION,
    reading: 'hafs', datasetReading: 'hafs',
    modelVersion: 'fixture-model-1', datasetId: 'fixture-not-a-real-measurement',
    referenceIncludesDiacritics: true, measuredAt: '2026-09-20T00:00:00.000Z',
    metrics: { wordErrorRate: 0.08, diacriticErrorRate: 0.05, p95LatencyMs: 180, sampleCount: 4000 },
    approvedThresholds: { maxWordErrorRate: 0.1, maxDiacriticErrorRate: 0.06, maxP95LatencyMs: 200, minSampleCount: 1000 },
    slices: [
      { name: 'child', sampleCount: 1200, wordErrorRate: 0.09, diacriticErrorRate: 0.055, p95LatencyMs: 190 },
      { name: 'adult', sampleCount: 1800, wordErrorRate: 0.06, diacriticErrorRate: 0.04, p95LatencyMs: 170 },
      { name: 'noise', sampleCount: 1000, wordErrorRate: 0.1, diacriticErrorRate: 0.06, p95LatencyMs: 195 },
    ],
    approvedBy: ['reviewer-one', 'reviewer-two'],
    ...over,
  };
}

function vault(): AsrBenchmarkRepository {
  return new AsrBenchmarkRepository(fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-asr-')));
}

const openVault = () => { const v = vault(); v.register(report()); return v };
const shutVault = () => ({ gate: (reading: string) => ({ reading, word: 'CLOSED', tashkeel: 'CLOSED', modelVersion: null, reasons: ['ASR_BENCHMARK_NOT_AVAILABLE'] }) as unknown as RecitationJudgingGate });

function answers(body: unknown, ok = true, status = 200) {
  const calls: { url: string; headers: Record<string, string>; bytes: number }[] = [];
  const fetchImpl = async (url: string | URL, init?: { headers?: Record<string, string>; body?: Uint8Array }) => {
    calls.push({ url: String(url), headers: init?.headers || {}, bytes: init?.body?.length || 0 });
    return { ok, status, json: async () => body };
  };
  return { fetchImpl, calls };
}

const audio = (n = 1024) => new Uint8Array(n).fill(7);
const chunk = { reading: 'hafs', sourcePackageId: HAFS_PACKAGE, contentType: 'audio/webm', bytes: audio() };

test('a reading with a passing report and a configured engine may be heard', async () => {
  const net = answers({ reading: 'hafs', modelVersion: 'fixture-model-1', words: [{ text: 'الحمد', confidence: 0.9 }] });
  const recogniser = new RecitationRecogniser({ url: 'https://asr.example/listen' }, openVault(), net.fetchImpl);
  const out = await recogniser.recognise(chunk);
  assert.equal(out.gate.word, 'OPEN');
  assert.equal(out.words.length, 1);
  assert.equal(out.words[0].text, 'الحمد');
  assert.equal(net.calls.length, 1);
  assert.match(net.calls[0].url, /reading=hafs/);
  assert.equal(net.calls[0].headers['x-mizan-source-package'], HAFS_PACKAGE);
  assert.equal(net.calls[0].bytes, 1024, 'the audio itself must reach the engine');
});

test('no engine address: the door is shut and nothing is invented', async () => {
  const net = answers({ reading: 'hafs', modelVersion: 'fixture-model-1', words: [] });
  const recogniser = new RecitationRecogniser({}, openVault(), net.fetchImpl);
  assert.equal(recogniser.configured(), false);
  const gate = recogniser.gate('hafs');
  assert.equal(gate.word, 'CLOSED');
  assert.deepEqual(gate.reasons, ['ASR_BACKEND_NOT_CONFIGURED']);
  await assert.rejects(() => recogniser.recognise(chunk), /BACKEND_NOT_CONFIGURED/);
  assert.equal(net.calls.length, 0, 'and not one byte of a child’s voice leaves the server');
});

test('a closed gate is never asked over the network', async () => {
  const net = answers({ reading: 'hafs', modelVersion: 'fixture-model-1', words: [] });
  const recogniser = new RecitationRecogniser({ url: 'https://asr.example/listen' }, shutVault(), net.fetchImpl);
  await assert.rejects(() => recogniser.recognise(chunk), /JUDGING_CLOSED/);
  assert.equal(net.calls.length, 0);
});

test("a riwayah's audio is never sent under another riwayah's package", async () => {
  const net = answers({ reading: 'hafs', modelVersion: 'fixture-model-1', words: [] });
  const recogniser = new RecitationRecogniser({ url: 'https://asr.example/listen' }, openVault(), net.fetchImpl);
  await assert.rejects(() => recogniser.recognise({ ...chunk, sourcePackageId: 'kfgqpc-warsh-uthmanic-v6' }), /SOURCE_READING_MISMATCH/);
  assert.equal(net.calls.length, 0);
});

test('an answer that names another riwayah is refused, however well formed', async () => {
  const net = answers({ reading: 'warsh', modelVersion: 'fixture-model-1', words: [{ text: 'الحمد', confidence: 1 }] });
  const recogniser = new RecitationRecogniser({ url: 'https://asr.example/listen' }, openVault(), net.fetchImpl);
  await assert.rejects(() => recogniser.recognise(chunk), /CROSS_RIWAYAH_REJECTED/);
});

test('an answer from a model that was never benchmarked is refused', async () => {
  const net = answers({ reading: 'hafs', modelVersion: 'some-other-model', words: [] });
  const recogniser = new RecitationRecogniser({ url: 'https://asr.example/listen' }, openVault(), net.fetchImpl);
  await assert.rejects(() => recogniser.recognise(chunk), /MODEL_NOT_BENCHMARKED/);
});

test('a backend failure is named by its status, not swallowed', async () => {
  const net = answers({}, false, 503);
  const recogniser = new RecitationRecogniser({ url: 'https://asr.example/listen' }, openVault(), net.fetchImpl);
  await assert.rejects(() => recogniser.recognise(chunk), /QURAN_ASR_BACKEND_HTTP_503/);
});

test('a payload that only looks like bytes never reaches the network', async () => {
  const net = answers({ reading: 'hafs', modelVersion: 'fixture-model-1', words: [] });
  const recogniser = new RecitationRecogniser({ url: 'https://asr.example/listen' }, openVault(), net.fetchImpl);
  for (const bytes of ['ا'.repeat(100) as unknown as Uint8Array, [1, 2, 3] as unknown as Uint8Array, new Uint8Array(0), new Uint8Array(MAX_ASR_CHUNK_BYTES + 1)]) {
    await assert.rejects(() => recogniser.recognise({ ...chunk, bytes }), /AUDIO_CHUNK_INVALID/);
  }
  assert.equal(net.calls.length, 0);
});

test('the vault keeps a report per riwayah, and one riwayah never opens another', () => {
  const store = vault();
  store.register(report());
  assert.equal(store.gate('hafs').word, 'OPEN');
  assert.equal(store.gate('warsh').word, 'CLOSED');
  assert.deepEqual(store.gate('warsh').reasons, ['ASR_BENCHMARK_NOT_AVAILABLE']);
  assert.equal(store.load('warsh'), null);
});

test('a structurally broken report is refused at the door of the vault, not at the student', () => {
  const store = vault();
  assert.throws(() => store.register(report({ version: 'x' })), /VERSION_INVALID/);
  assert.equal(store.load('hafs'), null, 'and nothing is written');
  assert.equal(store.gate('hafs').word, 'CLOSED');
});

test('a report that fails its thresholds is stored, and still closes the door', () => {
  /* فالتقريرُ الساقطُ دليلٌ يُحفظ: يُقرأ منه لماذا لا يُؤذن. */
  const store = vault();
  const verdict = store.register(report({ metrics: { wordErrorRate: 0.9, diacriticErrorRate: 0.9, p95LatencyMs: 180, sampleCount: 4000 } }));
  assert.equal(verdict.passed, false);
  assert.ok(store.load('hafs'), 'the failing report is kept as evidence');
  const gate = store.gate('hafs');
  assert.equal(gate.word, 'CLOSED');
  assert.ok(gate.reasons.includes('WORD_ERROR_RATE'), gate.reasons.join(','));
});

test('a corrupted file on disk closes the door instead of throwing at the student', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-asr-'));
  fs.writeFileSync(path.join(root, 'asr-benchmark-hafs.json'), '{ not json');
  const store = new AsrBenchmarkRepository(root);
  assert.equal(store.load('hafs'), null);
  assert.equal(store.gate('hafs').word, 'CLOSED');
});
