#!/usr/bin/env node
/*
 * جلب توقيتات الكلمة المقيسة، والتحقّق منها قبل قبولها.
 *
 * ظلّ تظليل الكلمة في ميزان **تقديرًا** موسومًا (`ESTIMATED_PROPORTIONAL`) لأننا لم نجد مصدرًا
 * مقيسًا. المصدر موجود: مشروع `quran-align` ينشر توقيتات كلمة مقيسة بمحاذاة قسرية لاثني عشر
 * قارئًا، برخصة CC BY 4.0، ومع بصمات SHA-1 منشورة لكل ملف.
 *
 * وهذا السكربت لا يكتفي بالتنزيل. يفحص ثلاثة أشياء، وأيّها فشل يوقفه:
 *
 * 1. **البصمة** — كل ملف يُطابَق مع SHA-1 المنشور في حزمته. ملفٌ لا يطابق لا يدخل.
 * 2. **اتفاق التقطيع** — تُقارن أعداد كلمات كل آية مع تخطيط المصحف الذي يستعمله ميزان. المحاذاة
 *    قامت على نصّ تنزيل، وميزان يعرض نصّ المجمع؛ واختلاف التقطيع يعني فهارس تشير إلى غير
 *    مواضعها. النسبة تُطبع، والآيات المختلفة تُستبعد بالاسم لا بالجملة.
 * 3. **الحدود** — مقاطع مقلوبة أو متداخلة أو خارج عدد الكلمات تُسقط.
 *
 * المخرج ملف لكل قارئ يُرفع إلى R2 مع بقية الأصول. وما لم يجتز الفحص يبقى على التقدير الموسوم:
 * تظليلٌ واثق في غير موضعه أسوأ من تقديرٍ يقول عن نفسه إنه تقدير.
 *
 * الاستعمال:
 *   node scripts/word-timing-acquire.mjs --layout <dir> [--out <dir>] [--zip <path>]
 *     --layout  مجلد ملفات تخطيط المصحف (page-001.json …) المستعمل للتحقّق من التقطيع
 *     --zip     حزمة التوقيتات إن كانت منزّلة already؛ وإلا تُجلب من الإصدار المعلن
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const RELEASE = 'https://github.com/cpfair/quran-align/releases/download/release-2016-11-24/quran-align-data-2016-11-24.zip';
const ATTRIBUTION = {
  source: 'quran-align by Collin Fair',
  url: 'https://github.com/cpfair/quran-align',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  release: 'release-2016-11-24',
};

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const layoutDir = arg('--layout', '');
/*
 * أيّ القرّاء يُبتلع؟ ليس كل ما تنشره الحزمة يخصّ ميزان. والافتراض هنا **الاستبعاد لا الشمول**:
 * توقيتٌ لقارئ لا نخدم تسجيله حِملٌ بلا فائدة، وفرصةٌ لأن يُربط يومًا بتسجيل ليس له.
 *
 *   --reciters a,b   يبتلع المذكورين وحدهم (مطابقة جزئية غير حسّاسة لحالة الأحرف)
 *   --exclude  a,b   يستبعد المذكورين، ويُضاف إليهم المستبعَدون افتراضًا أدناه
 */
const listArg = (name) => String(arg(name, '')).split(',').map((x) => x.trim()).filter(Boolean);
const onlyReciters = listArg('--reciters');
/* السديس: ليس ضمن تسجيلات ميزان، وملفه في الحزمة هو الوحيد الذي نُشر ملوّثًا. */
const DEFAULT_EXCLUDED = ['Abdurrahmaan_As-Sudais'];
const excluded = [...DEFAULT_EXCLUDED, ...listArg('--exclude')];
const wanted = (reciter) => {
  if (excluded.some((x) => reciter.toLowerCase().includes(x.toLowerCase()))) return false;
  if (!onlyReciters.length) return true;
  return onlyReciters.some((x) => reciter.toLowerCase().includes(x.toLowerCase()));
};
const outDir = arg('--out', path.join(process.cwd(), '.mizan-data', 'word-timings'));
const zipPath = arg('--zip', '');

if (!layoutDir) {
  console.error('--layout <dir> is required: verification compares each ayah word count against the Mushaf layout MIZAN renders.');
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

function ensurePackage() {
  if (zipPath) return zipPath;
  const dest = path.join(outDir, 'quran-align-data.zip');
  fs.mkdirSync(outDir, { recursive: true });
  if (!fs.existsSync(dest)) {
    console.log(`Fetching ${RELEASE}`);
    execFileSync('curl', ['-sSL', '--max-time', '300', '-o', dest, RELEASE], { stdio: 'inherit' });
  }
  return dest;
}

/*
 * ملفٌ في الحزمة المنشورة (Sudais) يبدأ بسجلّ انهيار من أداة التوليد قبل مصفوفة JSON — عيبٌ
 * معروف في الإصدار نفسه، وبصمته المنشورة تطابقه لأن التلوّث نُشر معه.
 *
 * فلا نتجاهله ولا ننهار عليه: تُنتزع مصفوفة JSON صراحةً من آخر سطر يقرأ كمصفوفة، ويُعلَن أن
 * الملف احتاج إصلاحًا. الصمت هنا هو الخطأ — لا الإصلاح.
 */
function parseTimingFile(name, text) {
  try { const rows = JSON.parse(text); if (Array.isArray(rows)) return { rows, repaired: false } }
  catch { /* يُحاوَل الاستخراج أدناه */ }
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith('[')) continue;
    try {
      const rows = JSON.parse(line);
      if (Array.isArray(rows) && rows.length) {
        console.warn(`REPAIRED ${name}: the published file carries ${i} line(s) of generator crash log before the JSON array; the array itself parsed cleanly (${rows.length} rows).`);
        return { rows, repaired: true };
      }
    } catch { /* يُجرَّب السطر السابق */ }
  }
  console.error(`REFUSED ${name}: no parsable JSON array found.`);
  return null;
}

function main() {
  const counts = layoutWordCounts(layoutDir);
  if (!counts.size) { console.error(`No ayah word counts found under ${layoutDir}.`); process.exit(2) }
  console.log(`Layout reference: ${counts.size} ayat.`);

  const zip = ensurePackage();
  fs.mkdirSync(outDir, { recursive: true });
  const work = fs.mkdtempSync(path.join(outDir, 'unpack-'));
  execFileSync('unzip', ['-o', '-q', zip, '-d', work]);

  // البصمات المنشورة داخل الحزمة نفسها: ملفٌ لا يطابقها لا يُقبل.
  const readme = fs.readFileSync(path.join(work, 'README'), 'utf8');
  const declared = new Map([...readme.matchAll(/\* (\S+\.json)\n\s+\d+ \w+ \d+\n\s+([0-9a-f]{40})/g)].map((m) => [m[1], m[2]]));
  if (!declared.size) { console.error('The package declares no checksums; refusing to ingest unverifiable timing data.'); process.exit(1) }

  fs.mkdirSync(outDir, { recursive: true });
  const summary = [];

  const skipped = [];
  for (const [name, sha] of declared) {
    const reciterName = name.replace(/\.json$/, '');
    if (!wanted(reciterName)) { skipped.push(reciterName); continue }
    const file = path.join(work, name);
    const bytes = fs.readFileSync(file);
    const actual = crypto.createHash('sha1').update(bytes).digest('hex');
    if (actual !== sha) { console.error(`REFUSED ${name}: checksum ${actual} != published ${sha}`); continue }

    const parsed = parseTimingFile(name, bytes.toString('utf8'));
    if (!parsed) continue;
    const rows = parsed.rows;
    const ayat = {};
    let agreed = 0, mismatched = [], dropped = 0;

    for (const row of rows) {
      const key = `${row.surah}:${row.ayah}`;
      const expected = counts.get(key);
      const segments = (row.segments || []).filter((s) => Array.isArray(s) && s.length === 4 && s.every(Number.isFinite));
      if (!segments.length || expected === undefined) { dropped++; continue }
      const covered = Math.max(...segments.map((s) => s[1]));
      if (covered !== expected) { mismatched.push(key); continue }
      // مقاطع مقلوبة أو خارج المدى تُسقط الآية كلها: نصف توقيت أسوأ من لا توقيت.
      const sorted = [...segments].sort((a, b) => a[2] - b[2]);
      let sane = true;
      for (let i = 0; i < sorted.length; i++) {
        const [ws, we, ms, me] = sorted[i];
        if (ws < 0 || we <= ws || we > expected || me <= ms) { sane = false; break }
        if (i && sorted[i][2] < sorted[i - 1][3]) { sane = false; break }
      }
      if (!sane) { dropped++; continue }
      ayat[key] = sorted;
      agreed++;
    }

    const reciter = name.replace(/\.json$/, '');
    const payload = {
      protocol: 'MIZAN-WORD-TIMINGS-1',
      reciter,
      // التوقيت يخصّ تسجيلًا بعينه؛ تسميته صراحةً تمنع تركيبه على تسجيل آخر.
      recording: { source: 'everyayah', directory: reciter },
      assurance: 'MEASURED_ALIGNED',
      attribution: ATTRIBUTION,
      sourceSha1: sha,
      // التلوّث كان في الملف المنشور نفسه؛ يُسجَّل ولا يُخفى.
      sourceRepaired: parsed.repaired,
      coverage: { ayatWithTimings: agreed, ayatMismatched: mismatched.length, ayatDropped: dropped, layoutAyat: counts.size },
      mismatchedAyat: mismatched,
      ayat,
    };
    const outFile = path.join(outDir, `${reciter}.json`);
    fs.writeFileSync(outFile, JSON.stringify(payload));
    const pct = ((100 * agreed) / counts.size).toFixed(2);
    summary.push({ reciter, agreed, mismatched: mismatched.length, dropped, pct });
    console.log(`${reciter}: ${agreed}/${counts.size} ayat (${pct}%), ${mismatched.length} word-count mismatches, ${dropped} dropped → ${outFile}`);
  }

  fs.rmSync(work, { recursive: true, force: true });

  if (skipped.length) {
    console.log('');
    console.log(`Skipped ${skipped.length} reciter(s) not requested for MIZAN: ${skipped.join(', ')}`);
  }
  if (!summary.length) { console.error('No reciter passed verification. Check --reciters against the package contents.'); process.exit(1) }
  const worst = summary.reduce((a, b) => (Number(a.pct) < Number(b.pct) ? a : b));
  console.log('');
  console.log(`${summary.length} reciters ingested. Lowest coverage: ${worst.reciter} at ${worst.pct}%.`);
  console.log(`Attribution required by the licence (CC BY 4.0): ${ATTRIBUTION.source} — ${ATTRIBUTION.url}`);
  console.log('These timings belong to the EveryAyah recordings named in each file. Serving them against a');
  console.log('different master of the same reciter drifts the highlight; the runtime duration check catches');
  console.log('that and falls back to the marked estimate rather than highlighting the wrong word.');
}

main();
