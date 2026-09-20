/*
 * `npm run quran:asr-conformance` — أيلتزم محرّكٌ مرشّحٌ بالعقد؟
 *
 * بلا عنوانٍ يُشغَّل على **المحرّك المرجعيّ** في هذا المستودع: فحصٌ لا يُشغَّل يشيخ
 * ويُنكسر بصمت، والمرجعيُّ يُثبت أنّ الفاحصَ نفسَه يعمل. ومع `--url` يُشغَّل على
 * المرشّح الحقيقيّ.
 *
 * ولا يفتح هذا بوّابةً: يقول «يصلح أن يُقاس» لا «يصلح أن يحكم».
 */
import { runConformance, type EngineCall } from '../server/asr-conformance';
import { startReferenceEngine } from '../tools/asr-reference/server';
import { quranReadingDefinition } from '../server/quran-intelligence-policy';
import type { QuranReadingId } from '../server/quran-intelligence-types';

const arg = (name: string) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

async function main() {
  const readingArg = arg('reading') || 'hafs';
  const definition = quranReadingDefinition(readingArg);
  if (!definition) { console.error(`روايةٌ غيرُ معروفة: ${readingArg}`); process.exitCode = 1; return }
  const reading = definition.id as QuranReadingId;

  const explicit = arg('url') || process.env.MIZAN_QURAN_ASR_URL || '';
  const reference = explicit ? null : await startReferenceEngine();
  const url = explicit || `http://127.0.0.1:${reference!.port}/recognise`;
  if (!explicit) console.log('لا عنوانَ محرّك — يُفحص المحرّكُ المرجعيُّ في المستودع (لا يتعرّف على شيء، وإنّما يحمل العقد).\n');

  const token = process.env.MIZAN_QURAN_ASR_BEARER_TOKEN;
  const call = async ({ reading: asked, bytes }: { reading: string; bytes: Uint8Array }): Promise<EngineCall> => {
    const target = new URL(url);
    target.searchParams.set('reading', asked);
    const headers: Record<string, string> = { 'content-type': 'application/octet-stream' };
    if (token) headers.authorization = `Bearer ${token}`;
    const started = Date.now();
    const response = await fetch(target, { method: 'POST', headers, body: bytes });
    const latencyMs = Date.now() - started;
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body, latencyMs };
  };

  try {
    const report = await runConformance(url, reading, call);
    console.log(`المحرّك: ${report.url}`);
    console.log(`الرواية: ${report.reading} · النموذج: ${report.modelVersion ?? '—'}\n`);
    for (const c of report.checks) console.log(`${c.passed ? '✓' : '✗'} ${c.name.padEnd(22)} ${c.detail}`);
    console.log(`\nزمنُ الاستجابة (المئين ٩٥): ${report.p95LatencyMs ?? '—'} مللي ثانية`);
    if (!report.conformant) {
      console.error('\nالمحرّكُ لا يلتزم بالعقد — ولا يُقاس ما لا يلتزم.');
      process.exitCode = 1;
      return;
    }
    console.log('\nيلتزم بالعقد. وهذا إذنٌ بأن **يُقاس**، لا إذنٌ بأن يحكم: البوّابةُ لا تُفتح إلا بتقرير قياسٍ لروايةٍ بعينها.');
  } finally {
    await reference?.close();
  }
}

void main();
