import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { blobToBase64, runTashkeel, toWireSegment, type WireSegment } from '../src/lib/tashkeel-run';
import type { AyahSegment } from '../src/lib/recitation-segments';
import type { TashkeelFinding } from '../src/lib/quran-intelligence';

/*
 * «المعلّم» بعد التلاوة: الدفعات، والاستيقاظ، والتعذّر، والإلغاء — بلا شبكةٍ ولا شاشة.
 */
const seg = (ayah: number, extra: Partial<AyahSegment> = {}): AyahSegment => ({
  id: `2:${ayah}`, surah: 2, ayah, startMs: ayah * 1000 + 0.4, endMs: ayah * 1000 + 900.6,
  ayahWords: ['كلمة', 'أخرى'], wordIndices: [ayah * 2, ayah * 2 + 1], from: 0, to: 1, ...extra,
});
const finding = (wordIndex: number, kind: TashkeelFinding['kind'] = 'tashkeel'): TashkeelFinding => ({
  wordIndex, kind, speech: 'replace', messageAr: `ملاحظة ${wordIndex}`, messageEn: `note ${wordIndex}`,
});
const ok = (batch: WireSegment[], notes: Record<string, TashkeelFinding[]> = {}) => ({
  segments: batch.map(s => ({ id: s.id, status: 'ok' as const, findings: notes[s.id] ?? [] })),
});

test('segments go in batches of six, and every batch is reported as it returns', async () => {
  const sent: string[][] = [];
  const progress: number[] = [];
  const out = await runTashkeel({
    segments: Array.from({ length: 14 }, (_, i) => seg(i + 1)),
    submit: async batch => { sent.push(batch.map(s => s.id)); return ok(batch, { '2:3': [finding(6)], '2:9': [finding(18, 'tajweed')] }); },
    onProgress: p => progress.push(p.done),
    isCurrent: () => true,
  });
  assert.deepEqual(sent.map(b => b.length), [6, 6, 2]);
  assert.deepEqual(progress, [0, 6, 12, 14]);
  assert.equal(out.phase, 'done');
  if (out.phase !== 'done') return;
  assert.equal(out.reviewed, 14);
  assert.deepEqual(out.findings.map(f => f.wordIndex), [6, 18]);
});

test('the wire carries whole milliseconds and never an empty segment', () => {
  const w = toWireSegment(seg(4, { startMs: 1234.6, endMs: 1234.7 }));
  assert.equal(w.startMs, 1235);
  assert.ok(w.endMs > w.startMs);
  assert.ok(Number.isInteger(w.endMs));
});

test('a waking Teacher is retried every ten seconds within its budget, and the student is told it is waking', async () => {
  let calls = 0, clock = 0;
  const phases: string[] = [];
  const out = await runTashkeel({
    segments: [seg(1)],
    submit: async batch => { calls += 1; if (calls < 3) throw new Error('QURAN_MUAALEM_WARMING'); return ok(batch); },
    onProgress: p => phases.push(p.phase),
    isCurrent: () => true,
    wait: async ms => { clock += ms; },
    now: () => clock,
  });
  assert.equal(out.phase, 'done');
  assert.equal(calls, 3);
  assert.equal(clock, 20_000);
  assert.ok(phases.includes('warming'));
});

test('a Teacher that never wakes fails once the budget is spent — not forever', async () => {
  let clock = 0, calls = 0;
  const out = await runTashkeel({
    segments: [seg(1)],
    submit: async () => { calls += 1; throw new Error('QURAN_MUAALEM_WARMING'); },
    onProgress: () => {},
    isCurrent: () => true,
    wait: async ms => { clock += ms; },
    now: () => clock,
    warmingBudgetMs: 60_000,
  });
  assert.equal(out.phase, 'failed');
  assert.ok(calls >= 6 && calls <= 8, `${calls} calls`);
});

test('not configured in this deployment says nothing; a non-Hafs reading says so', async () => {
  const off = await runTashkeel({ segments: [seg(1)], submit: async () => { throw new Error('QURAN_MUAALEM_NOT_CONFIGURED'); }, onProgress: () => {}, isCurrent: () => true });
  assert.equal(off.phase, 'off');
  const warsh = await runTashkeel({ segments: [seg(1)], submit: async () => { throw new Error('TASHKEEL_READING_NOT_SUPPORTED'); }, onProgress: () => {}, isCurrent: () => true });
  assert.equal(warsh.phase, 'unsupported');
});

test('a failure keeps the notes that already came back', async () => {
  let n = 0;
  const out = await runTashkeel({
    segments: Array.from({ length: 8 }, (_, i) => seg(i + 1)),
    submit: async batch => { n += 1; if (n === 2) throw new Error('QURAN_MUAALEM_HTTP_502'); return ok(batch, { '2:2': [finding(4)] }); },
    onProgress: () => {},
    isCurrent: () => true,
  });
  assert.equal(out.phase, 'failed');
  if (out.phase !== 'failed') return;
  assert.equal(out.done, 6);
  assert.deepEqual(out.findings.map(f => f.wordIndex), [4]);
});

test('a student who moved to another face drops what is on the way', async () => {
  let current = true;
  const out = await runTashkeel({
    segments: [seg(1), seg(2)],
    submit: async batch => { current = false; return ok(batch, { '2:1': [finding(2)] }); },
    onProgress: () => {},
    isCurrent: () => current,
    batchSize: 1,
  });
  assert.equal(out.phase, 'cancelled');
});

test('the same note on the same word is said once; answers for segments not asked about are ignored', async () => {
  const out = await runTashkeel({
    segments: [seg(1)],
    submit: async batch => ({ segments: [
      { id: batch[0].id, status: 'ok' as const, findings: [finding(2), finding(2)] },
      { id: '99:1', status: 'ok' as const, findings: [finding(500)] },
    ] }),
    onProgress: () => {},
    isCurrent: () => true,
  });
  assert.equal(out.phase, 'done');
  if (out.phase !== 'done') return;
  assert.deepEqual(out.findings.map(f => f.wordIndex), [2]);
  assert.equal(out.reviewed, 1);
});

test('the recording becomes base64 in memory, byte for byte', async () => {
  const bytes = new Uint8Array(70_000).map((_, i) => i % 251);
  const b64 = await blobToBase64(new Blob([bytes]));
  assert.deepEqual(new Uint8Array(Buffer.from(b64, 'base64')), bytes);
});

test('the practice page runs the Teacher after the report, for Hafs only, and never stores the recording', () => {
  const page = fs.readFileSync('src/components/participant/MushafListens.tsx', 'utf8');
  assert.match(page, /recording\.current = all;/);
  assert.match(page, /if \(deliveryReading !== 'hafs'\) \{ setTashkeel\(\{ \.\.\.EMPTY_TASHKEEL, phase: 'unavailable', note: TASHKEEL_HAFS_ONLY_NOTE\(ar\) \}\); return; \}/);
  assert.match(page, /const segments = buildAyahSegments\(faceWords, heard\);/);
  assert.match(page, /setStage\('report'\);[\s\S]{0,200}void reviewTashkeel\(\);/);
  assert.match(page, /notes=\{stage === 'report' \? tashkeel\.findings : undefined\}/);
  /* ولا مخزن: لا localStorage ولا IndexedDB للتسجيل. */
  assert.doesNotMatch(page, /(localStorage|indexedDB|sessionStorage)[^\n]*recording/);
  const server = fs.readFileSync('server.ts', 'utf8');
  assert.match(server, /if\(access\.deliveryReading!=='hafs'\)throw new Error\('TASHKEEL_READING_NOT_SUPPORTED'\)/);
  assert.match(server, /practiceAyahWords\(hafsRawi,surah,ayah\)/, 'the ayah text comes from the Hafs package, not the browser');
  assert.match(server, /scoreAuthority:'HUMAN_ONLY'/);
});

test('the server reads each ayah’s words from the Hafs package — the same split as the practice face', async () => {
  const { practiceAyahWords } = await import('../server/practice-face-service');
  const { candidateRawiForDeliveryKey } = await import('../server/quran-reading-delivery');
  const hafs = candidateRawiForDeliveryKey('hafs')!;
  const baqarah26 = practiceAyahWords(hafs, 2, 26)!;
  assert.equal(baqarah26[0], '۞', '«۞» stays a token, as on the face');
  assert.equal(baqarah26.length, 40, "39 words of 2:26 and the quarter sign");
  assert.equal(practiceAyahWords(hafs, 71, 16)?.length, 7);
  assert.equal(practiceAyahWords(hafs, 2, 999), null);
});

test('«your recitation here» plays the word with a little of what surrounds it — from memory, never past the recording', async () => {
  const { snippetWindow, SNIPPET_LEAD_MS, SNIPPET_TAIL_MS } = await import('../src/lib/recitation-snippet');
  assert.deepEqual(snippetWindow(2000, 2600, 60_000), { from: 2000 - SNIPPET_LEAD_MS, to: 2600 + SNIPPET_TAIL_MS });
  assert.equal(snippetWindow(100, 500, 60_000).from, 0, 'never before the start');
  assert.equal(snippetWindow(59_800, 59_950, 60_000).to, 60_000, 'never past the end');
  const page = fs.readFileSync('src/components/participant/MushafListens.tsx', 'utf8');
  assert.match(page, /const times = alignHeardToFace\(faceWords, heard\);\n\s*wordTimes\.current = new Map\(\[\.\.\.times\]\.map\(\(\[i, t\]\) => \[i, \{ \.\.\.t, source: 0 \}\]\)\);/);
  /* المصدرُ صفرٌ لتسجيل الوجه، وما بعده لإعاداتِ الآيات — كلٌّ في الذاكرة. */
  assert.match(page, /t\.source === 0 \? recording\.current : retakeClips\.current\[t\.source - 1\]/);
  assert.match(page, /createSnippetPlayer\(parts\)/);
  assert.match(page, /canListen=\{index => wordTimes\.current\.has\(index\)\}/);
  /* ولا يُرسل التسجيلُ إلى أيّ مكانٍ للاستماع: مصدرُ صوتٍ في المتصفّح وحده. */
  const player = fs.readFileSync('src/lib/recitation-snippet.ts', 'utf8');
  assert.doesNotMatch(player, /fetch\(/);
  assert.match(player, /decodeAudioData/);
});
