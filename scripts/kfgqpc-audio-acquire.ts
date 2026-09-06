#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

/**
 * MIZAN — اقتناء صوت التلاوة (آية-آية) إلى شجرة التسليم.
 *
 * حفص عن عاصم — الشيخ ماهر المعيقلي — من everyayah (مصدر مفتوح قابل للوصول)
 *   → delivery/audio/hafs/maher-al-muaiqly/v1/SSS/AAA.mp3   (سورة/آية بثلاث خانات)
 * وهو نفس مفتاح MIZAN (AUDIO_PREFIX: hafs/maher-al-muaiqly/v1).
 *
 * سياسة MIZAN: لا استبدال بين الروايات. الروايات الأخرى (ورش/قالون/شعبة/سوسي/الدوري)
 * تتطلب مصدرًا رواية-صحيح موثّقًا ولا تُشتق من حفص.
 */

// عدد آيات كل سورة (1..114) — المرجع القياسي
const AYAT = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];

const RECITERS: Record<string, { everyayah: string; prefix: string; readingArabic: string; reciterArabic: string }> = {
  'hafs-muaiqly': { everyayah: 'Maher_AlMuaiqly_64kbps', prefix: 'delivery/audio/hafs/maher-al-muaiqly/v1', readingArabic: 'حفص عن عاصم', reciterArabic: 'الشيخ ماهر المعيقلي' },
};

const args = process.argv.slice(2);
const val = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const outRoot = path.resolve(val('--out') || '.mizan-delivery');
const only = val('--only') || 'hafs-muaiqly';
const spec = RECITERS[only];
if (!spec) { console.error(`UNKNOWN_RECITER:${only}. متاح: ${Object.keys(RECITERS).join(', ')}`); process.exit(1); }

const pad3 = (n: number) => String(n).padStart(3, '0');

async function get(url: string): Promise<Buffer> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'mizan-audio' }, redirect: 'follow' });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      if (r.status === 404) throw new Error(`NOT_FOUND:${url}`);
    } catch (e) { if (attempt === 4) throw e; }
    await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
  }
  throw new Error(`FETCH_FAILED:${url}`);
}

(async () => {
  const outDir = path.join(outRoot, spec.prefix);
  let ok = 0, bytes = 0, expected = 0;
  const jobs: { s: number; a: number }[] = [];
  for (let s = 1; s <= 114; s++) for (let a = 1; a <= AYAT[s - 1]; a++) { jobs.push({ s, a }); expected++; }

  // دفعات متوازية صغيرة
  const CONCURRENCY = 12;
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async ({ s, a }) => {
      const dest = path.join(outDir, pad3(s), `${pad3(a)}.mp3`);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { ok++; bytes += fs.statSync(dest).size; return; }
      const body = await get(`https://everyayah.com/data/${spec.everyayah}/${pad3(s)}${pad3(a)}.mp3`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, body);
      ok++; bytes += body.length;
    }));
    if (i % (CONCURRENCY * 20) === 0) process.stderr.write(`   audio ${ok}/${expected}\r`);
  }
  process.stderr.write(`\n`);
  process.stdout.write(JSON.stringify({ ok: true, reciter: only, prefix: spec.prefix, ayat: ok, expected, bytes, totalMB: +(bytes / 1048576).toFixed(2), source: `everyayah/${spec.everyayah}` }) + '\n');
})().catch((e) => { console.error(e); process.exit(1); });
