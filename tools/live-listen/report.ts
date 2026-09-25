/*
 * صفحةُ «مختبر يسمعك» — تُبنى من جولات `run.ts` وملفِّ إعدادٍ واحد.
 *
 *   npx tsx tools/live-listen/report.ts report.config.json
 *
 * والإعدادُ يسمّي الجولات («قبل» و«بعد» ولونَ كلٍّ ثابتٌ مع الجولة)، ويكتب نصوصَ الصفحة: ما تغيّر،
 * ولماذا، وحدودَ القياس. والصفحةُ مكتفيةٌ بنفسها: بياناتُها فيها، ولا تطلب شيئًا غيرَ الخطوط.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeRun } from './analyze';

interface RunEntry { file: string; name: string; note?: string; side?: 'before' | 'after'; color?: number }
interface ReportConfig { out: string; runs: RunEntry[]; [key: string]: unknown }

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function buildReport(config: ReportConfig, base: string): string {
  const runs = config.runs.map(entry => {
    const result = analyzeRun(JSON.parse(fs.readFileSync(path.resolve(base, entry.file), 'utf8')));
    const { recitation: r } = result;
    return {
      label: result.label, name: entry.name, note: entry.note ?? '', side: entry.side ?? null, color: entry.color ?? 1,
      mode: result.mode, recording: `${r.surah}:${r.fromAyah}-${r.toAyah}`, build: result.build,
      words: result.words, lag: result.lag, summary: result.summary,
    };
  });
  const { out: _out, runs: _runs, ...page } = config;
  const data = JSON.stringify({ ...page, runs }).replace(/</g, '\\u003c');
  return fs.readFileSync(path.join(HERE, 'report-template.html'), 'utf8').replace('/*__DATA__*/null', data);
}

if (process.argv[1] && /report\.ts$/.test(process.argv[1])) {
  const file = process.argv[2];
  if (!file) { console.error('usage: report.ts <report.config.json>'); process.exit(2); }
  const config = JSON.parse(fs.readFileSync(file, 'utf8')) as ReportConfig;
  const base = path.dirname(path.resolve(file));
  const html = buildReport(config, base);
  const out = path.resolve(base, config.out);
  fs.writeFileSync(out, html);
  console.log(`wrote ${out} (${Math.round(html.length / 1024)} KB)`);
}
