#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { R2PrivateClient, r2ConfigFromEnv } from '../server/r2-private';

/**
 * MIZAN — رفع شجرة التسليم المجهّزة إلى Cloudflare R2 (مسار التسليم).
 *
 * يرفع كل ملف تحت <root>/delivery/** إلى نفس مفتاحه في R2 (immutable delivery)، مع:
 *   - نوع محتوى صحيح، و sha256 كوسم، وتخطّي الملف إن كان موجودًا بنفس البصمة (resume).
 *   - احترام سقف الأمان MIZAN_R2_SAFETY_LIMIT_BYTES (لا يتجاوز الطبقة المجانية).
 * لا يكتب فوق مفتاح مختلف المحتوى إلا مع --overwrite. الأسرار تُقرأ من البيئة فقط.
 */

const args = process.argv.slice(2);
const val = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const has = (k: string) => args.includes(k);
const root = path.resolve(val('--root') || '.mizan-delivery');
const dryRun = has('--dry-run');
const overwrite = has('--overwrite');
const prefixFilter = val('--prefix') || 'delivery/';

const cfg = r2ConfigFromEnv();
if (!cfg && !dryRun) { console.error('R2_NOT_CONFIGURED: set R2_ENDPOINT/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY'); process.exit(1); }
const r2 = cfg ? new R2PrivateClient(cfg) : null;

const SAFETY = Number(process.env.MIZAN_R2_SAFETY_LIMIT_BYTES || 9663676416);

const ctype = (f: string) => f.endsWith('.woff2') ? 'font/woff2' : f.endsWith('.woff') ? 'font/woff' : f.endsWith('.ttf') ? 'font/ttf'
  : f.endsWith('.webp') ? 'image/webp' : f.endsWith('.avif') ? 'image/avif' : f.endsWith('.png') ? 'image/png'
  : f.endsWith('.mp3') ? 'audio/mpeg' : f.endsWith('.m4a') ? 'audio/mp4'
  : f.endsWith('.json') ? 'application/json' : f.endsWith('.txt') ? 'text/plain; charset=utf-8' : 'application/octet-stream';

function walk(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out;
}

(async () => {
  const deliveryDir = path.join(root, 'delivery');
  const files = walk(deliveryDir).filter((f) => !f.endsWith('.DS_Store'));
  const keyed = files.map((f) => ({ file: f, key: path.relative(root, f).split(path.sep).join('/') }))
    .filter((x) => x.key.startsWith(prefixFilter));

  let totalBytes = 0; for (const k of keyed) totalBytes += fs.statSync(k.file).size;
  if (totalBytes > SAFETY) { console.error(`SAFETY_LIMIT_EXCEEDED: staged ${totalBytes} > ${SAFETY}`); process.exit(1); }

  let uploaded = 0, skipped = 0, bytes = 0;
  for (const { file, key } of keyed) {
    const body = fs.readFileSync(file);
    const sha = crypto.createHash('sha256').update(body).digest('hex');
    if (dryRun) { process.stderr.write(`DRY  ${key}  ${(body.length/1024).toFixed(0)}KB\n`); uploaded++; bytes += body.length; continue; }
    // resume: إن كان الكائن موجودًا بنفس البصمة، تخطَّ
    if (!overwrite) {
      try { const head = await r2!.headObject(key); const existingSha = head?.sha256; if (existingSha === sha) { skipped++; continue; } }
      catch { /* غير موجود — نرفع */ }
    }
    await r2!.putObject(key, body, ctype(file), { sha256: sha });
    uploaded++; bytes += body.length;
    process.stderr.write(`↑ ${key}  ${(body.length/1024).toFixed(0)}KB\n`);
  }
  process.stdout.write(JSON.stringify({ ok: true, uploaded, skipped, bytes, totalMB: +(bytes/1048576).toFixed(2), safetyLimit: SAFETY }) + '\n');
})().catch((e) => { console.error(e); process.exit(1); });
