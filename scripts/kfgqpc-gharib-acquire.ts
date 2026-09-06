#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * MIZAN — اقتناء «الميسّر في الغريب» (غريب القرآن الميسّر) إلى شجرة التسليم.
 *
 * المصدر: spa5k/tafsir_api → طبعة `al-muyassar-fi-al-gharib` (عربي، شرح كلمات بين ﴿﴾ لكل آية).
 * الوجهة: delivery/quran-data/ghareeb-muyassar/v1/data.json  — نفس مفتاح MIZAN.
 */

const SLUG = 'al-muyassar-fi-al-gharib';
const BASE = `https://raw.githubusercontent.com/spa5k/tafsir_api/main/tafsir/${SLUG}`;

const args = process.argv.slice(2);
const val = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const outRoot = path.resolve(val('--out') || '.mizan-delivery');

async function get(url: string): Promise<Buffer> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'mizan-gharib' }, redirect: 'follow' });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      if (r.status === 404) throw new Error(`NOT_FOUND:${url}`);
    } catch (e) { if (attempt === 3) throw e; }
    await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
  }
  throw new Error(`FETCH_FAILED:${url}`);
}

(async () => {
  const surahs: any[] = [];
  let sourceBytes = 0;
  for (let s = 1; s <= 114; s++) {
    const body = await get(`${BASE}/${s}.json`);
    sourceBytes += body.length;
    try { surahs.push({ surah: s, ayat: JSON.parse(body.toString('utf8')) }); }
    catch { surahs.push({ surah: s, raw: body.toString('utf8') }); }
    if (s % 20 === 0) process.stderr.write(`   gharib ${s}/114\r`);
  }
  process.stderr.write('\n');
  const dest = path.join(outRoot, 'delivery/quran-data/ghareeb-muyassar/v1/data.json');
  const payload = Buffer.from(JSON.stringify({ resource: 'الميسّر في الغريب — غريب القرآن', slug: SLUG, reading: 'حفص عن عاصم', wordLevel: true, surahs }), 'utf8');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, payload);
  const sha = crypto.createHash('sha256').update(payload).digest('hex');
  process.stdout.write(JSON.stringify({ ok: true, surahs: surahs.length, bytes: payload.length, sourceBytes, sha256: sha, r2Key: 'delivery/quran-data/ghareeb-muyassar/v1/data.json', source: BASE }) + '\n');
})().catch((e) => { console.error(e); process.exit(1); });
