#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * MIZAN — Mirror staging (Track 1: delivery).
 *
 * صار موقع مجمع الملك فهد (qurancomplex.gov.sa) محجوبًا عن مراكز البيانات وعن شبكات كثيرة،
 * فهذا السكربت يجهّز أصول التسليم من مرايا رسمية-المصدر مفتوحة (ترخيص MIT) وقابلة للوصول:
 *   - نص الروايات + الخط الأساسي: github.com/thetruetruth/quran-data-kfgqpc
 * ويكتبها في نفس مفاتيح R2 التي يخدمها سيرفر MIZAN تمامًا، مع بيان مصدر (provenance) لكل ملف.
 *
 * هذا مسار "التسليم" الذي يجعل الموقع يعرض المحتوى. مسار "المصدر العلمي" (source-vault + checksum)
 * منفصل ويُعالَج لاحقًا. لا يوجد تلفيق ولا OCR ولا استبدال بين الروايات.
 */

const MIRROR = 'thetruetruth/quran-data-kfgqpc';
const RAW = (p: string) => `https://raw.githubusercontent.com/${MIRROR}/main/${p}`;
const API = (p: string) => `https://api.github.com/repos/${MIRROR}/contents/${p}`;

// تعيين: رواية MIZAN ← مجلد المرآة + بادئة تسليم MIZAN الدقيقة (اسم النسخة هنا مساحة تسمية تسليم، والمحتوى أحدث نسخة رسمية متاحة)
type ReadingSpec = { mizan: string; mirrorDir: string; dataPrefix: string; fontPrefix: string; readingArabic: string };
const READINGS: ReadingSpec[] = [
  { mizan: 'hafs',          mirrorDir: 'hafs',   dataPrefix: 'delivery/quran-data/hafs/v13',         fontPrefix: 'delivery/fonts/hafs/v13',          readingArabic: 'حفص عن عاصم' },
  { mizan: 'warsh',         mirrorDir: 'warsh',  dataPrefix: 'delivery/quran-data/warsh/v6',         fontPrefix: 'delivery/fonts/warsh/v6',          readingArabic: 'ورش عن نافع' },
  { mizan: 'shubah',        mirrorDir: 'shouba', dataPrefix: 'delivery/quran-data/shubah/v4',        fontPrefix: 'delivery/fonts/shubah/v4',         readingArabic: 'شعبة عن عاصم' },
  { mizan: 'qalun',         mirrorDir: 'qaloon', dataPrefix: 'delivery/quran-data/qalun/v5',         fontPrefix: 'delivery/fonts/qalun/v5',          readingArabic: 'قالون عن نافع' },
  { mizan: 'duri-abi-amr',  mirrorDir: 'doori',  dataPrefix: 'delivery/quran-data/duri-abi-amr/v3',  fontPrefix: 'delivery/fonts/duri-abi-amr/v3',   readingArabic: 'الدوري عن أبي عمرو' },
  { mizan: 'susi-abi-amr',  mirrorDir: 'soosi',  dataPrefix: 'delivery/quran-data/susi-abi-amr/v3',  fontPrefix: 'delivery/fonts/susi-abi-amr/v3',   readingArabic: 'السوسي عن أبي عمرو' },
];

const args = process.argv.slice(2);
const val = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const outRoot = path.resolve(val('--out') || '.mizan-delivery');
const only = val('--only');

async function ghJson(url: string): Promise<any> {
  const headers: Record<string, string> = { 'User-Agent': 'mizan-mirror-stage' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`GITHUB_API_${r.status}:${url}`);
  return r.json();
}

async function download(url: string, dest: string): Promise<{ bytes: number; sha256: string }> {
  const r = await fetch(url, { headers: { 'User-Agent': 'mizan-mirror-stage' }, redirect: 'follow' });
  if (!r.ok || !r.body) throw new Error(`DOWNLOAD_${r.status}:${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return { bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
}

async function stageReading(spec: ReadingSpec) {
  const dataList: any[] = await ghJson(API(`${spec.mirrorDir}/data`));
  const jsonEntry = dataList.find((x) => x.name.toLowerCase().endsWith('.json'));
  if (!jsonEntry) throw new Error(`NO_JSON_DATA:${spec.mirrorDir}`);

  const fontList: any[] = await ghJson(API(`${spec.mirrorDir}/font`));
  const woff2 = fontList.find((x) => x.name.toLowerCase().endsWith('.woff2'));
  const ttf = fontList.find((x) => x.name.toLowerCase().endsWith('.ttf'));

  const records: any[] = [];

  // 1) بيانات النص → delivery/quran-data/<reading>/vN/data.json  (+ نحتفظ بالصيغ الأخرى إن رغبنا لاحقًا)
  const dataDest = path.join(outRoot, spec.dataPrefix, 'data.json');
  const d1 = await download(jsonEntry.download_url, dataDest);
  records.push({ kind: 'DATA', r2Key: `${spec.dataPrefix}/data.json`, sourceUrl: jsonEntry.download_url, ...d1 });

  // 2) الخط الأساسي → delivery/fonts/<reading>/vN/primary.woff2 (+ primary.ttf احتياطيًا)
  if (woff2) {
    const dest = path.join(outRoot, spec.fontPrefix, 'primary.woff2');
    const f = await download(woff2.download_url, dest);
    records.push({ kind: 'FONT', r2Key: `${spec.fontPrefix}/primary.woff2`, sourceUrl: woff2.download_url, ...f });
  }
  if (ttf) {
    const dest = path.join(outRoot, spec.fontPrefix, 'primary.ttf');
    const f = await download(ttf.download_url, dest);
    records.push({ kind: 'FONT', r2Key: `${spec.fontPrefix}/primary.ttf`, sourceUrl: ttf.download_url, ...f });
  }

  return { reading: spec.mizan, readingArabic: spec.readingArabic, mirror: MIRROR, records };
}

(async () => {
  const selected = only ? READINGS.filter((r) => r.mizan === only) : READINGS;
  if (only && !selected.length) throw new Error(`UNKNOWN_READING:${only}`);
  const manifest: any[] = [];
  let totalBytes = 0, totalFiles = 0;
  for (const spec of selected) {
    process.stderr.write(`↓ ${spec.mizan} (${spec.mirrorDir}) …\n`);
    const res = await stageReading(spec);
    for (const rec of res.records) { totalBytes += rec.bytes; totalFiles++; process.stderr.write(`   ${rec.kind}  ${rec.r2Key}  ${(rec.bytes/1024).toFixed(0)}KB\n`); }
    manifest.push(res);
  }
  const manDir = path.join(outRoot, 'delivery', '_mizan');
  fs.mkdirSync(manDir, { recursive: true });
  fs.writeFileSync(path.join(manDir, 'mirror-manifest.json'), JSON.stringify({ protocol: 'MIZAN-MIRROR-STAGE-1', mirror: MIRROR, license: 'MIT', stagedReadings: manifest.length, totalFiles, totalBytes, manifest }, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ ok: true, stagedReadings: manifest.length, totalFiles, totalBytes, totalMB: +(totalBytes/1048576).toFixed(2), out: outRoot }) + '\n');
})().catch((e) => { console.error(e); process.exit(1); });
