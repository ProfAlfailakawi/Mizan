/*
 * الطريقُ كلُّه من مُعطًى إلى بوّابة — يُقاس مرّةً واحدةً بتشغيلٍ حقيقيّ.
 *
 * فالوحداتُ مقيسةٌ كلٌّ على حدة، والوصلُ بينها هو ما يسقط عادةً: وسيطٌ لا يُقرأ،
 * وملفٌّ لا يُكتب، وأمرٌ يخرج بصفرٍ وهو لم يفعل شيئًا.
 *
 * ويُقاس على **المحرّك المرجعيّ**، وهو لا يتعرّف على شيء. فالمنتظَرُ أن يخرج خطأُ
 * الكلمة عاليًا وأن **تبقى البوّابةُ مغلقة** — وذلك هو الصواب: محرّكٌ لا يسمع لا
 * يُؤذن له. ولو فُتحت هنا لكان في الطريق كذب.
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { startReferenceEngine } from '../tools/asr-reference/server';
import { loadIslamwebReadingPackage } from '../server/islamweb-reading-packages';
import { AsrBenchmarkRepository } from '../server/recitation-recogniser';
import type { AsrBenchmarkReport } from '../server/recitation-asr-contract';

const ROOT = process.cwd();
/*
 * والنداءُ **غيرُ متزامن** عمدًا.
 *
 * فالمحرّكُ المرجعيُّ يعمل في هذه العمليّة نفسِها، و`execFileSync` يوقف حلقةَ الأحداث
 * — فلا يستطيع الخادمُ أن يردّ على العمليّة الابنة، فتتعلّق الاثنتان. وقد وقع ذلك
 * فعلًا: انتظارٌ مئةً وعشرين ثانيةً ثم قتل. وهو جمودٌ لا بطء.
 */
const run = promisify(execFile);
const TSX = path.join(ROOT, 'node_modules', '.bin', 'tsx');

/** نصوصٌ مرجعيّةٌ من حزمة الرواية نفسِها — لا نصَّ قرآنيًّا يُكتب في اختبار. */
function references(count: number): string[] {
  return loadIslamwebReadingPackage('hafs').verses
    .filter((v: { sura_no: number }) => v.sura_no === 1)
    .slice(0, count)
    .map((v: { aya_text: string }) => v.aya_text as string);
}

test('from an owner corpus to a gate verdict, in one real run', { timeout: 120_000 }, async () => {
  const engine = await startReferenceEngine();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-asr-pipeline-'));
  try {
    const texts = references(3);
    assert.equal(texts.length, 3, 'لم تُقرأ النصوصُ المرجعيّة من الحزمة');

    /* «صوتٌ» بايتاتٌ لا معنى لها: المحرّكُ المرجعيُّ لا يفكّ ترميزًا، والمقيسُ الوصل. */
    const slices = ['child', 'adult', 'noise'].map((name, index) => {
      const audio = `${name}.bin`;
      fs.writeFileSync(path.join(dir, audio), Buffer.alloc(2048, index + 1));
      return { name, items: [{ audio, reference: texts[index] }] };
    });

    const manifest = {
      reading: 'hafs', datasetReading: 'hafs', datasetId: 'pipeline-fixture-not-a-real-corpus',
      referenceIncludesDiacritics: true,
      approvedThresholds: { maxWordErrorRate: 0.1, maxDiacriticErrorRate: 0.06, maxP95LatencyMs: 2000, minSampleCount: 3 },
      approvedBy: ['reviewer-one', 'reviewer-two'],
      slices,
    };
    const manifestPath = path.join(dir, 'corpus.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const reportPath = path.join(dir, 'report.json');

    const { stdout: out } = await run(TSX, ['scripts/asr-benchmark.ts',
      `--manifest=${manifestPath}`, `--url=http://127.0.0.1:${engine.port}/recognise`, `--out=${reportPath}`],
      { cwd: ROOT, encoding: 'utf8' });

    assert.ok(fs.existsSync(reportPath), 'لم يُكتب التقرير');
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as AsrBenchmarkReport;
    assert.equal(report.reading, 'hafs');
    assert.equal(report.metrics.sampleCount, 3);
    assert.equal(report.slices.length, 3);
    assert.ok(engine.calls() === 3, `نداءاتُ المحرّك: ${engine.calls()}`);

    /* والمحرّكُ المرجعيُّ لا يسمع شيئًا، فخطؤه في الكلمة يجب أن يكون عاليًا. */
    assert.ok(report.metrics.wordErrorRate > 0.5, `خطأُ الكلمة ${report.metrics.wordErrorRate}`);
    assert.match(out, /البوّابة: كلمة CLOSED/, out);
    assert.match(out, /WORD_ERROR_RATE/, out);

    /* ثمّ يُسجَّل — ويُحفظ دليلًا وإن لم يُؤذن به. */
    const vaultDir = path.join(dir, 'intelligence');
    await run(TSX, ['scripts/asr-register-benchmark.ts', `--report=${reportPath}`, `--dir=${vaultDir}`],
      { cwd: ROOT, encoding: 'utf8' });
    const vault = new AsrBenchmarkRepository(path.join(vaultDir, 'asr-benchmarks'));
    assert.ok(vault.load('hafs'), 'لم يدخل التقريرُ الخزانة');
    const gate = vault.gate('hafs');
    assert.equal(gate.word, 'CLOSED', 'فُتحت البوّابةُ لمحرّكٍ لا يتعرّف على شيء');
    assert.ok(gate.reasons.includes('WORD_ERROR_RATE'), gate.reasons.join(','));
    /* ولا روايةَ أخرى تُفتح بهذا التقرير. */
    assert.equal(vault.gate('warsh').word, 'CLOSED');
  } finally {
    await engine.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a corpus that lies about its diacritics is refused before a single engine call', { timeout: 60_000 }, async () => {
  const engine = await startReferenceEngine();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-asr-lie-'));
  try {
    const bare = 'الحمد لله رب العلمين';   /* بلا حركة — والدعوى أنه مشكول */
    const slices = ['child', 'adult', 'noise'].map(name => {
      fs.writeFileSync(path.join(dir, `${name}.bin`), Buffer.alloc(512, 3));
      return { name, items: [{ audio: `${name}.bin`, reference: bare }] };
    });
    fs.writeFileSync(path.join(dir, 'corpus.json'), JSON.stringify({
      reading: 'hafs', datasetReading: 'hafs', datasetId: 'lying-fixture',
      referenceIncludesDiacritics: true,
      approvedThresholds: { maxWordErrorRate: 0.1, maxDiacriticErrorRate: 0.06, maxP95LatencyMs: 2000, minSampleCount: 1 },
      approvedBy: ['one', 'two'], slices,
    }));

    let failed = false, message = '';
    try {
      await run(TSX, ['scripts/asr-benchmark.ts',
        `--manifest=${path.join(dir, 'corpus.json')}`, `--url=http://127.0.0.1:${engine.port}/recognise`],
        { cwd: ROOT, encoding: 'utf8' });
    } catch (error) {
      failed = true;
      message = String((error as { stderr?: string }).stderr || '');
    }
    assert.ok(failed, 'مرّ مُعطًى يدّعي التشكيل ونصوصُه بلا حركة');
    assert.match(message, /REFERENCE_NOT_DIACRITIZED/, message);
    assert.equal(engine.calls(), 0, 'نُودي المحرّكُ قبل أن يُرفض المُعطى');
  } finally {
    await engine.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
