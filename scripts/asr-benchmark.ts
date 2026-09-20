/*
 * `npm run quran:asr-benchmark` — القياسُ الذي يفتح البوّابة.
 *
 *   tsx scripts/asr-benchmark.ts --manifest=corpus.json [--url=…] [--out=report.json]
 *
 * والمُعطى من المالك: تسجيلاتٌ ونصوصُها المرجعيّة، مقسّمةً شرائحَ (طفلٌ وبالغٌ
 * وضجيج). ولا يُصطنع منه شيءٌ هنا — لا صوتٌ ولا نصٌّ ولا عتبة.
 *
 * والناتجُ تقريرٌ بصيغة `MIZAN-QURAN-ASR-BENCHMARK-1` يُسجَّل في الخزانة، فتُفتح به
 * البوّابةُ أو تبقى مغلقةً **بحسب ما قِيس** لا بحسب ما يُرجى.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  aggregate, buildAsrBenchmarkReport, measureItem, validateManifest,
  type BenchmarkManifest, type ItemMeasurement,
} from '../server/asr-benchmark-runner';
import { readRecognitionResponse } from '../server/recitation-asr-contract';
import { recitationJudgingGate } from '../server/recitation-asr-contract';

const arg = (name: string) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

async function main() {
  const manifestPath = arg('manifest');
  if (!manifestPath) { console.error('يلزم --manifest=<ملف المُعطى>'); process.exitCode = 1; return }
  const url = arg('url') || process.env.MIZAN_QURAN_ASR_URL || '';
  if (!url) { console.error('يلزم --url=<عنوان المحرّك> أو MIZAN_QURAN_ASR_URL'); process.exitCode = 1; return }

  const root = path.dirname(path.resolve(manifestPath));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BenchmarkManifest;
  validateManifest(manifest);   /* يرمي باسم العلّة قبل أن يُنادى محرّك */

  const token = process.env.MIZAN_QURAN_ASR_BEARER_TOKEN;
  let modelVersion = '';
  const slices = [];
  for (const slice of manifest.slices) {
    const measurements: ItemMeasurement[] = [];
    for (const item of slice.items) {
      const bytes = fs.readFileSync(path.resolve(root, item.audio));
      const target = new URL(url);
      target.searchParams.set('reading', manifest.reading);
      const headers: Record<string, string> = { 'content-type': 'application/octet-stream' };
      if (token) headers.authorization = `Bearer ${token}`;
      const started = Date.now();
      const response = await fetch(target, { method: 'POST', headers, body: new Uint8Array(bytes) });
      const latencyMs = Date.now() - started;
      if (!response.ok) throw new Error(`ASR_BACKEND_HTTP_${response.status}: ${slice.name}/${item.audio}`);
      const body = await response.json();
      const declared = typeof (body as { modelVersion?: unknown })?.modelVersion === 'string'
        ? ((body as { modelVersion: string }).modelVersion).trim() : '';
      /*
       * ونسخةُ النموذج تُثبَّت من أوّل ردّ ثم تُشترط فيما بعده.
       *
       * فمُعطًى قِيس نصفُه على نموذجٍ ونصفُه على آخر ليس قياسًا واحدًا، والتقريرُ
       * يحمل نسخةً واحدة — فتكون كاذبةً عن نصفه.
       */
      if (!modelVersion) modelVersion = declared;
      const chunk = readRecognitionResponse(body, { reading: manifest.reading, modelVersion });
      measurements.push(measureItem(item.reference, chunk.words, latencyMs, manifest.referenceIncludesDiacritics));
      process.stdout.write(`\r${slice.name}: ${measurements.length}/${slice.items.length}   `);
    }
    process.stdout.write('\n');
    slices.push(aggregate(slice.name, measurements));
  }

  const report = buildAsrBenchmarkReport(manifest, modelVersion, slices);
  const out = arg('out') || path.resolve(root, `asr-benchmark-${manifest.reading}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2), { encoding: 'utf8', mode: 0o600 });

  console.log(`\nالرواية ${report.reading} · النموذج ${report.modelVersion} · ${report.metrics.sampleCount} مقطعًا`);
  for (const slice of report.slices) {
    const der = slice.diacriticErrorRate === undefined ? '—' : `${(slice.diacriticErrorRate * 100).toFixed(2)}٪`;
    console.log(`  ${slice.name.padEnd(8)} كلمة ${(slice.wordErrorRate * 100).toFixed(2)}٪ · حركة ${der} · زمن ${slice.p95LatencyMs}م.ث`);
  }
  const gate = recitationJudgingGate(manifest.reading, report);
  console.log(`\nالبوّابة: كلمة ${gate.word} · حركة ${gate.tashkeel}`);
  if (gate.reasons.length) console.log(`السبب: ${gate.reasons.join(' · ')}`);
  console.log(`\nالتقرير: ${out}`);
  console.log('ويُسجَّل بـ npm run quran:asr-register -- --report=<الملف>');
}

void main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 });
