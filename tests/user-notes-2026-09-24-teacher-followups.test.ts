import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

/*
 * متابعاتُ «المعلّم» (٢٤ سبتمبر ٢٠٢٦): أ) تنظيفُ الصور، ب) «لم يتّضح» وإعادةُ الآية،
 * ج) مفتاحُ المعلّم وبوّابةُ القياس، د) القياسُ على كبار القرّاء، و«القارئ» عند كلّ ملاحظة.
 */
const read = (p: string) => fs.readFileSync(p, 'utf8');

test('أ) every deploy keeps the image store bounded: latest ten kept, older than 30 days deleted', () => {
  const build = read('cloudbuild.yaml');
  const step = build.slice(build.indexOf('id: image-cleanup'), build.indexOf('substitutions:'));
  assert.match(step, /allowFailure: true/, 'a missing permission never fails the release');
  assert.match(step, /waitFor: \['-'\]/);
  assert.match(step, /set-cleanup-policies cloud-run-source-deploy/);
  assert.match(step, /--no-dry-run/, 'a dry-run policy deletes nothing');
  const body = step.slice(step.indexOf("<<'JSON'\n") + "<<'JSON'\n".length, step.indexOf('\n        JSON\n'));
  const policy = JSON.parse(body);
  assert.deepEqual(policy.map((p: any) => p.action.type), ['Keep', 'Delete', 'Delete']);
  assert.equal(policy[0].mostRecentVersions.keepCount, 10);
  assert.equal(policy[2].condition.olderThan, '30d');
  assert.match(read('docs/DEPLOYMENT.md'), /roles\/artifactregistry\.repoAdmin/);
});

test('ب) an ayah skipped before the last heard one is named «not heard»; stopping early is not held against the student', async () => {
  const { notHeardAyat } = await import('../src/lib/tashkeel-run');
  const face = [
    { index: 0, surah: 2, ayah: 1 }, { index: 1, surah: 2, ayah: 2 }, { index: 2, surah: 2, ayah: 2 },
    { index: 3, surah: 2, ayah: 3 }, { index: 4, surah: 2, ayah: 4 }, { index: 5, surah: 2, ayah: 5 },
  ];
  const heard = new Map([[0, 1], [3, 1]]);
  const out = notHeardAyat(face, heard, new Set(['2:1', '2:3']));
  assert.deepEqual(out.map(u => [u.ayah, u.reason]), [[2, 'NOT_HEARD']], '2:4 and 2:5 come after where the student stopped');
  assert.deepEqual(notHeardAyat(face, new Map(), new Set()), []);
});

test('ب) every unclear ayah says why and offers «أعِد هذه الآية»; the retake stays in memory and replaces only that ayah', () => {
  const report = read('src/components/participant/TashkeelReport.tsx');
  for (const reason of ['LOW_CONFIDENCE', 'NOT_HEARD']) assert.match(report, new RegExp(`case '${reason}'`));
  assert.match(report, /data-retake=\{`\$\{u\.surah\}:\$\{u\.ayah\}`\}/);
  assert.match(report, /data-retake-stop/);
  const page = read('src/components/participant/MushafListens.tsx');
  assert.match(page, /onRetake=\{u => void startRetake\(u\)\}/);
  assert.match(page, /window\.setTimeout\(\(\) => stopRetake\(\), 30_000\)/, 'a retake is one ayah — thirty seconds at most');
  assert.match(page, /retakeClips\.current\.push\(chunks\)/);
  assert.match(page, /st\.findings\.filter\(f => !own\.has\(f\.wordIndex\)\)/, 'only that ayah’s notes are replaced');
  const retake = page.slice(page.indexOf('const startRetake'), page.indexOf('rec.start();'));
  assert.doesNotMatch(retake, /localStorage|indexedDB|sessionStorage|upload/i, 'the retake is never stored');
  assert.match(retake, /media\.getTracks\(\)\.forEach\(t => t\.stop\(\)\)/, 'the microphone is released');
  /* ضغطتان والإذنُ معلّق لا تفتحان ميكروفونين؛ ومغادرةٌ والإذنُ معلّق لا تترك تسجيلًا يعمل. */
  assert.match(retake, /if \(!face \|\| retakeRec\.current \|\| retakePending\.current\) return;/);
  assert.match(retake, /retakePending\.current = true;\n\s*try \{\n\s*media = await navigator\.mediaDevices\.getUserMedia/);
  assert.match(retake, /if \(!isCurrent\(\)\) \{ media\.getTracks\(\)\.forEach\(t => t\.stop\(\)\); return; \}/);
});

test('ج) the teacher switch: off hides it, trial labels it, open needs a passing benchmark of the very engine that runs', async () => {
  const { muaalemGate } = await import('../server/muaalem-gate');
  const live = { model: 'obadx/muaalem-model-v3_2@01a1ef9fbe40', analysis: '2026-09-24.2' };
  const passing = {
    protocol: 'MIZAN-MUAALEM-BENCH-1', reading: 'hafs', status: 'MEASURED', passes: true,
    model: 'obadx/muaalem-model-v3_2@01a1ef9fbe40', analysisVersion: '2026-09-24.2', measuredAt: '2026-09-25',
    gates: { falseAlarmRate: true, unclearRate: true, substitutionRecall: true, minWords: true, minSubstitutions: true },
    correct: { words: 6000, falseAlarm: { rate: 0.002 }, unclear: { rate: 0.05 } },
    substitutions: { recall: { rate: 0.9 } },
    reciters: [{ id: 'husary', words: 400 }, { id: 'x', words: 0 }],
  };
  assert.equal(muaalemGate({ requested: 'off', report: passing, live }).mode, 'off');
  assert.equal(muaalemGate({ requested: undefined, report: passing, live }).mode, 'trial', 'trial unless the owner opens it');
  const open = muaalemGate({ requested: 'open', report: passing, live });
  assert.equal(open.mode, 'open');
  assert.equal(open.benchmark?.reciters, 1);
  const committed = JSON.parse(read('services/quran-muaalem/benchmark/reports/hafs.json'));
  assert.deepEqual(muaalemGate({ requested: 'open', report: committed, live }), { mode: 'trial', reason: 'NOT_MEASURED' }, 'no measurement, no opening');
  const cases: [unknown, typeof live | null, string][] = [
    [{ ...passing, passes: false }, live, 'BENCHMARK_NOT_PASSED'],
    [{ ...passing, status: 'PARTIAL' }, live, 'BENCHMARK_PARTIAL'],
    [{ ...passing, gates: { ...passing.gates, substitutionRecall: false } }, live, 'BENCHMARK_NOT_PASSED'],
    [passing, null, 'LIVE_ENGINE_UNKNOWN'],
    [passing, { ...live, model: 'obadx/muaalem-model-v4@abc' }, 'BENCHMARK_MODEL_MISMATCH'],
    [passing, { ...live, model: 'obadx/muaalem-model-v3_2@ffffffffffff' }, 'BENCHMARK_MODEL_MISMATCH'],
    [{ ...passing, model: 'obadx/muaalem-model-v3_2' }, live, 'BENCHMARK_MODEL_MISMATCH'],
    [passing, { ...live, analysis: '2026-10-01.1' }, 'BENCHMARK_RULES_MISMATCH'],
    [{ ...passing, correct: { words: 6000 } }, live, 'BENCHMARK_MALFORMED'],
  ];
  for (const [report, l, reason] of cases) assert.deepEqual(muaalemGate({ requested: 'open', report, live: l }), { mode: 'trial', reason });
  const server = read('server.ts');
  assert.match(server, /muaalemGate\(\{requested:process\.env\.MIZAN_QURAN_MUAALEM_MODE,report:muaalemBenchmarkReport,live\}\)/);
  assert.match(server, /if\(gate\.mode==='off'\)throw new Error\('QURAN_MUAALEM_OFF'\)/);
  assert.match(read('.env.example'), /^MIZAN_QURAN_MUAALEM_MODE=$/m);
});

test('د) the benchmark measures the live rules on master reciters, with gates that cannot be softened in the workflow', () => {
  const bench = read('services/quran-muaalem/benchmark/bench.py');
  assert.match(bench, /PROTOCOL = "MIZAN-MUAALEM-BENCH-1"/);
  assert.match(bench, /"falseAlarmRateMax": 0\.005,/);
  assert.match(bench, /"substitutionRecallMin": 0\.80,/);
  assert.match(bench, /"minWords": 5_000,/);
  const reciters = JSON.parse(read('services/quran-muaalem/benchmark/reciters.json'));
  const ids = reciters.reciters.map((r: any) => r.id);
  for (const master of ['husary', 'minshawi', 'abdulbasit']) assert.ok(ids.includes(master), master);
  assert.ok(ids.length >= 15);
  const wf = read('.github/workflows/muaalem-benchmark.yml');
  assert.match(wf, /workflow_dispatch:/);
  assert.doesNotMatch(wf, /\$\{\{\s*(github\.event\.)?inputs\.[a-z_]+\s*\}\}[^\n]*python/, 'inputs reach the script through env, never interpolated into the shell');
  assert.doesNotMatch(wf, /RateMax|RecallMin|minWords|minSubstitutions|--gate/, 'the workflow cannot pass its own gates');
  assert.match(read('services/quran-muaalem/Dockerfile'), /COPY benchmark \.\/benchmark/);
});

test('«القارئ»: the noted word in the reference reciter’s voice (Hafs), beside the student’s own', async () => {
  const { spokenPosition } = await import('../src/lib/reference-word');
  assert.equal(spokenPosition(['۞', 'إِنَّ', 'ٱللَّهَ', 'لَا'], 2), 1, '«۞» is not recited');
  assert.equal(spokenPosition(['۞', 'إِنَّ'], 0), -1);
  const ref = read('src/lib/reference-word.ts');
  assert.match(ref, /REFERENCE_AUDIO_ID/);
  assert.match(ref, /fetchDeliveryPassage\(REFERENCE_AUDIO_READING/);
  assert.match(read('src/components/participant/TashkeelReport.tsx'), /data-reference-word=\{finding\.wordIndex\}/);
  assert.match(read('src/components/participant/MushafListens.tsx'), /if \(!w \|\| deliveryReading !== 'hafs'\) return null;/, 'the teacher is Hafs-only, so is its reference');
});
