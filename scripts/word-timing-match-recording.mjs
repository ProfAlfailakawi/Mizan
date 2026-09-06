#!/usr/bin/env node
/*
 * هل تخصّ هذه المقاطع تسجيلَنا؟
 *
 * السؤال ليس «هل عندنا توقيت لهذا القارئ» بل «هل قيس على **هذا التسجيل**». والفرق حاسم: نسخة
 * أخرى لنفس القارئ — بترٌ مختلف للصمت، أو تسجيل آخر بالكامل — تُعطي فهارس كلمات تبدو سليمة
 * تمامًا، وتظليلًا واثقًا يمشي متأخّرًا عن الصوت. والحَكَم يصدّقه لأنه لا يبدو تقديرًا.
 *
 * الفحص الحاسم بسيط: نهاية آخر مقطع في الآية يجب أن تساوي مدّة ملف تلك الآية. يُجرَّب على عيّنة
 * من الآيات ويُقاس الانحراف. تسجيلان مختلفان ينكشفان فورًا؛ ولا حاجة إلى سماع شيء.
 *
 * الاستعمال:
 *   node scripts/word-timing-match-recording.mjs \
 *     --timings .mizan-data/word-timings/Husary_64kbps.json \
 *     --base https://mizan-xxxx.run.app \
 *     --recording hafs-muaiqly [--sample 40]
 *
 * المخرج حكمٌ صريح: MATCH أو MISMATCH، ولا شيء بينهما يُترك للتأويل.
 */

import fs from 'node:fs';
import { mp3DurationMs } from './lib/audio-duration.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const timingsPath = arg('--timings', '');
const base = String(arg('--base', '')).replace(/\/$/, '');
const recording = arg('--recording', '');
const sampleSize = Number(arg('--sample', '40'));

if (!timingsPath || !base || !recording) {
  console.error('Usage: --timings <file.json> --base <service-url> --recording <recording-id> [--sample N]');
  process.exit(2);
}

/* يقبل شكلين: مخرجات ابتلاعنا (ayat مفهرسة)، أو الشكل الخام لملفات المحاذاة المفتوحة. */
function loadAyat(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (raw && raw.ayat && typeof raw.ayat === 'object') return raw.ayat;
  if (Array.isArray(raw)) {
    const out = {};
    for (const row of raw) {
      if (!row || !Array.isArray(row.segments) || !row.segments.length) continue;
      out[`${row.surah}:${row.ayah}`] = row.segments;
    }
    return out;
  }
  throw new Error('Unrecognised timing file shape.');
}

/* عيّنة موزّعة على المصحف كله لا مجمّعة في أوّله: الانحراف قد يظهر في موضع دون آخر. */
function spread(keys, n) {
  if (keys.length <= n) return keys;
  const step = keys.length / n;
  return Array.from({ length: n }, (_, i) => keys[Math.floor(i * step)]);
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

async function main() {
  const ayat = loadAyat(timingsPath);
  const keys = spread(Object.keys(ayat), sampleSize);
  console.log(`Comparing ${keys.length} ayat of ${Object.keys(ayat).length} against recording "${recording}"`);
  console.log('');

  const offsets = [];
  let fetched = 0, unreadable = 0, missing = 0;

  for (const key of keys) {
    const [surah, ayah] = key.split(':');
    const url = `${base}/api/public/kfgqpc/audio/${encodeURIComponent(recording)}/${surah}/${ayah}`;
    let buf;
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) { missing++; continue }
      buf = Buffer.from(await r.arrayBuffer());
    } catch { missing++; continue }
    fetched++;

    const durationMs = mp3DurationMs(buf);
    // مدّة لا تُقرأ لا تُخمَّن: تُحسب كغير مقروءة ولا تدخل الإحصاء.
    if (durationMs === null) { unreadable++; continue }

    const segments = ayat[key];
    const measuredEnd = Math.max(...segments.map((s) => s[3]));
    offsets.push(measuredEnd - durationMs);
  }

  console.log(`Fetched ${fetched} · unreadable ${unreadable} · missing from the service ${missing}`);
  if (offsets.length < 5) {
    console.error('');
    console.error('Too few comparable ayat to judge. Check the recording id and that the service serves this audio.');
    process.exit(1);
  }

  const abs = offsets.map(Math.abs);
  const med = median(abs);
  const worst = Math.max(...abs);
  const within = (limit) => abs.filter((x) => x <= limit).length;

  console.log('');
  console.log(`Compared ${offsets.length} ayat`);
  console.log(`  median |segment end − audio duration| : ${med} ms`);
  console.log(`  worst                                 : ${worst} ms`);
  console.log(`  within 250 ms                         : ${within(250)}/${offsets.length}`);
  console.log(`  within 1000 ms                        : ${within(1000)}/${offsets.length}`);
  console.log('');

  /*
   * الحدّ: التوقيت المقيس على نفس التسجيل ينحرف بعشرات المللي لا بمئاتها. وانحراف يتجاوز
   * ثانية في ربع العيّنة يعني تسجيلين مختلفين، مهما تطابق اسم القارئ.
   */
  const goodShare = within(1000) / offsets.length;
  if (med <= 250 && goodShare >= 0.9) {
    console.log('MATCH — these segments belong to this recording.');
    console.log(`Register it: add "${recording}": "${timingsPath.split('/').pop()}" to the timings manifest.`);
    process.exit(0);
  }
  if (med <= 1000 && goodShare >= 0.75) {
    console.log('PARTIAL — close, but not close enough to trust for word highlighting.');
    console.log('A drift of this size is visible: the highlight lags the voice. Do not register it.');
    process.exit(1);
  }
  console.log('MISMATCH — a different recording of the same reciter, or a different reciter.');
  console.log('Do not register it. The runtime duration check would reject it anyway, but registering');
  console.log('it would mean every ayah pays for a fetch that is always refused.');
  process.exit(1);
}

main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1) });
