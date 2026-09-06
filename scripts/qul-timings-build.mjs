#!/usr/bin/env node
/*
 * بناء ملف مقاطع ميزان من قاعدة توقيت QUL.
 *
 * المدخل تفريغ جدول `timings` بصيغة JSON (كما يخرجه `scripts/qul-handoff.sh`)، والمخرج بنفس
 * شكل `word-timing-acquire.mjs` فيقبله المخزن بلا تفريق.
 *
 * والتحقّق هنا شرط لا خطوة اختيارية: أعداد الكلمات تُقارن بتخطيط المصحف الذي يعرضه ميزان،
 * والآيات المختلفة تُستبعد بأسمائها. ونسبة الاتفاق تُطبع، فمصدرٌ يوافق في نصف المصحف ليس
 * مصدرًا بل مصيدة.
 *
 * الاستعمال:
 *   node scripts/qul-timings-build.mjs \
 *     --timings maher_al_muaiqly.timings.json \
 *     --layout <مجلد تخطيط المصحف> \
 *     --recording hafs-muaiqly [--out <مجلد>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { convertQulTimings } from './lib/qul-timings.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const timingsPath = arg('--timings', '');
const layoutDir = arg('--layout', '');
const recording = arg('--recording', '');
const outDir = arg('--out', path.join(process.cwd(), '.mizan-data', 'word-timings'));

if (!timingsPath || !layoutDir || !recording) {
  console.error('Usage: --timings <timings.json> --layout <mushaf-layout-dir> --recording <recording-id> [--out <dir>]');
  process.exit(2);
}

/** عدد كلمات كل آية بحسب تخطيط المصحف — المرجع الذي يعرضه ميزان فعلًا. */
function layoutWordCounts(dir) {
  const counts = new Map();
  for (const file of fs.readdirSync(dir)) {
    if (!/^page-\d+\.json$/.test(file)) continue;
    const page = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const line of page.lines || []) {
      for (const w of line.words || []) {
        const parts = String(w.location || '').split(':');
        if (parts.length !== 3) continue;
        const [s, a, n] = parts.map(Number);
        if (![s, a, n].every(Number.isInteger)) continue;
        const key = `${s}:${a}`;
        counts.set(key, Math.max(counts.get(key) || 0, n));
      }
    }
  }
  return counts;
}

const counts = layoutWordCounts(layoutDir);
if (!counts.size) { console.error(`No ayah word counts found under ${layoutDir}.`); process.exit(2) }

const raw = JSON.parse(fs.readFileSync(timingsPath, 'utf8'));
const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.rows) ? raw.rows : null;
if (!rows) { console.error('Expected a JSON array of timings rows.'); process.exit(2) }

const result = convertQulTimings(rows, counts);
if (!result.ok) {
  console.error(`REFUSED (${result.code}): ${result.message}`);
  process.exit(1);
}

const agreed = Object.keys(result.ayat).length;
const pct = ((100 * agreed) / counts.size).toFixed(2);

fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${recording}.json`);
fs.writeFileSync(outFile, JSON.stringify({
  protocol: 'MIZAN-WORD-TIMINGS-1',
  reciter: recording,
  // مصدر المقاطع يُسمّى: من يراجع بعد سنة يحتاج أن يعرف من أين جاء الرقم.
  recording: { source: 'qul-android-timing-db', recordingId: recording },
  assurance: 'MEASURED_ALIGNED',
  attribution: { source: 'Quranic Universal Library (QUL) / quran.com timing databases', url: 'https://qul.tarteel.ai' },
  indexBase: result.indexBase,
  coverage: { ayatWithTimings: agreed, ayatMismatched: result.mismatchedAyat.length, ayatDropped: result.dropped, layoutAyat: counts.size },
  mismatchedAyat: result.mismatchedAyat.slice(0, 200),
  ayat: result.ayat,
}));

console.log(`${recording}: ${agreed}/${counts.size} ayat (${pct}%)`);
console.log(`  word index base in source : ${result.indexBase}`);
console.log(`  word-count mismatches     : ${result.mismatchedAyat.length}`);
console.log(`  dropped                   : ${result.dropped}`);
console.log(`  → ${outFile}`);
console.log('');
console.log('This file is NOT yet usable. A matching reciter name is not a matching recording.');
console.log('Confirm it belongs to this recording before registering it:');
console.log(`  node scripts/word-timing-match-recording.mjs --timings ${outFile} --base <service-url> --recording ${recording}`);
