#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * MIZAN — اقتناء صور صفحات المصحف إلى شجرة التسليم (مسار التسليم).
 *
 * - صور 604 صفحة (مصحف المدينة/حفص) من CDN quran.app → delivery/mushaf-pages/madinah/v1/NNN.png
 *   (MIZAN يخدم avif→webp→png؛ PNG مقبول مباشرة.)
 *
 * مصدرٌ مفتوحٌ قابل للوصول (عكس موقع المجمع المحجوب). لا تلفيق ولا استبدال.
 *
 * وكان هذا السكربت يجلب **التفسير الميسّر** كذلك، فحُذف ذلك الشطر مع إلغاء حزم الشرح
 * من النظام (قرارُ المالك، ٢٠ سبتمبر ٢٠٢٦) — وأُعيدت تسميةُ الملفّ لئلّا يَعِد اسمُه
 * بما لا يفعله.
 */

const args = process.argv.slice(2);
const val = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const has = (k: string) => args.includes(k);
const outRoot = path.resolve(val('--out') || '.mizan-delivery');
const width = val('--width') || 'width_1024';
const doPages = true;

const PAGE_BASE = `https://files.quran.app/hafs/madani/${width}`;

const pad3 = (n: number) => String(n).padStart(3, '0');

async function get(url: string): Promise<Buffer> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'mizan-acquire' }, redirect: 'follow' });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      if (r.status === 404) throw new Error(`NOT_FOUND:${url}`);
    } catch (e) { if (attempt === 3) throw e; }
    await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
  }
  throw new Error(`FETCH_FAILED:${url}`);
}

function writeFile(dest: string, body: Buffer) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, body);
  return crypto.createHash('sha256').update(body).digest('hex');
}

async function acquirePages() {
  const outDir = path.join(outRoot, 'delivery/mushaf-pages/madinah/v1');
  let ok = 0, bytes = 0;
  // تنزيل متوازٍ بدفعات صغيرة (10 في المرة) للحفاظ على استقرار الشبكة
  const pages = Array.from({ length: 604 }, (_, i) => i + 1);
  for (let i = 0; i < pages.length; i += 10) {
    const batch = pages.slice(i, i + 10);
    await Promise.all(batch.map(async (p) => {
      const body = await get(`${PAGE_BASE}/page${pad3(p)}.png`);
      writeFile(path.join(outDir, `${pad3(p)}.png`), body);
      ok++; bytes += body.length;
    }));
    process.stderr.write(`   pages ${ok}/604\r`);
  }
  process.stderr.write(`\n`);
  return { kind: 'MUSHAF_PAGES', count: ok, bytes, prefix: 'delivery/mushaf-pages/madinah/v1', source: PAGE_BASE };
}


(async () => {
  const results: any[] = [];
  if (doPages) { process.stderr.write('↓ mushaf pages …\n'); results.push(await acquirePages()); }
  const totalBytes = results.reduce((n, r) => n + (r.bytes || 0), 0);
  process.stdout.write(JSON.stringify({ ok: true, results, totalBytes, totalMB: +(totalBytes / 1048576).toFixed(2), out: outRoot }) + '\n');
})().catch((e) => { console.error(e); process.exit(1); });
