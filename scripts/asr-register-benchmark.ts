/*
 * `npm run quran:asr-register` — إدخالُ تقريرِ قياسٍ الخزانةَ.
 *
 * والخزانةُ تحت `MIZAN_QURAN_INTELLIGENCE_DIR/asr-benchmarks`، منها تقرأ البوّابةُ
 * إذنَها. وتقريرٌ مُختلُّ البنية يُردّ عند الباب فلا يُكتب — ويُقال بأيّ علّة.
 *
 * وتقريرٌ ساقطُ المقاييس **يُحفظ** دليلًا وتبقى البوّابةُ مغلقة: فيُقرأ منه لماذا
 * لا يُؤذن، بدل أن يُنسى ويُعاد القياسُ من أوّله.
 */
import fs from 'node:fs';
import path from 'node:path';

import { AsrBenchmarkRepository } from '../server/recitation-recogniser';
import type { AsrBenchmarkReport } from '../server/recitation-asr-contract';

const arg = (name: string) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

function main() {
  const file = arg('report');
  if (!file) { console.error('يلزم --report=<ملف التقرير>'); process.exitCode = 1; return }
  const root = arg('dir') || process.env.MIZAN_QURAN_INTELLIGENCE_DIR;
  if (!root) { console.error('يلزم --dir=<مجلّد الذكاء> أو MIZAN_QURAN_INTELLIGENCE_DIR'); process.exitCode = 1; return }

  const report = JSON.parse(fs.readFileSync(file, 'utf8')) as AsrBenchmarkReport;
  const vault = new AsrBenchmarkRepository(path.join(root, 'asr-benchmarks'));
  const verdict = vault.register(report);
  const gate = vault.gate(report.reading);

  console.log(`الرواية ${verdict.reading} · النموذج ${verdict.modelVersion} · المُعطى ${verdict.datasetId}`);
  console.log(`البوّابة: كلمة ${gate.word} · حركة ${gate.tashkeel}`);
  if (gate.reasons.length) console.log(`السبب: ${gate.reasons.join(' · ')}`);
  if (!verdict.passed) console.log('\nوالتقريرُ محفوظٌ دليلًا وإن لم يُؤذن به — فيُقرأ منه لماذا.');
}

try { main() } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 }
