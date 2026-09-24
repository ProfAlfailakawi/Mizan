/*
 * «أوّلُ آية» سطرًا واحدًا — في متصفّحٍ حقيقيّ بصوتٍ مصنوع.
 *   npx tsx tools/judge-harness/cue.ts [hafs-text.json]
 *
 * يُصنع ملفُّ صوتٍ لآية الدَّين (٢:٢٨٢): لكلّ كلمةٍ نغمةٌ ثم سكتةٌ قصيرة، وسكتةٌ أطول بعد
 * «فَٱكۡتُبُوهُۚ» كما يسكت القارئ عند علامة الوقف. ويُعطى تخطيطُ الصفحة سطرَ كلّ كلمة. ثم
 * يُضغط «استمع» ويُقاس: أين وقف الصوت؟ أعلى سكتةٍ؟ وقبل آخر السطر الأوّل؟
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { splitAyahWords, proportionalWordTimings } from '../../src/lib/word-timing';

const here = path.dirname(fileURLToPath(import.meta.url));
const verses: { s: number; a: number; t: string }[] = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const text = verses.find(v => v.s === 2 && v.a === 282)!.t;
const words = splitAyahWords(text);
const WAQF = words.findIndex(w => w.text === 'فَٱكۡتُبُوهُۚ');

/* الصوتُ يتبع التقدير النطقيّ نفسه (فالقطعُ المقدَّر يقع قرب الكلمة الصحيحة)، بسكتاتٍ بين الكلمات. */
const RATE = 16000, TOTAL_MS = 120_000;
const model = proportionalWordTimings(text, TOTAL_MS);
const pcm = new Int16Array(Math.ceil((RATE * TOTAL_MS) / 1000));
for (const w of model.words) {
  const gap = w.index === WAQF ? 450 : 70;
  const a = Math.floor((w.startMs * RATE) / 1000), b = Math.floor(((w.endMs - gap) * RATE) / 1000);
  for (let i = a; i < b; i += 1) pcm[i] = Math.round(9000 * Math.sin((2 * Math.PI * 220 * i) / RATE));
}
const wav = Buffer.alloc(44 + pcm.length * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcm.length * 2, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(RATE, 24);
wav.writeUInt32LE(RATE * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
wav.writeUInt32LE(pcm.length * 2, 40); Buffer.from(pcm.buffer).copy(wav, 44);

/* السطرُ الأوّل إحدى عشرة كلمة، والسطرُ التامّ في الصفحة إحدى عشرة. */
const layoutWords = words.map((w, i) => ({ surah: 2, ayah: 282, wordIndex: i, line: 1 + Math.floor(i / 11) }));

const server = await createServer({ configFile: path.resolve(here, 'vite.config.ts') });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.route('**/api/**', async route => {
  const url = new URL(route.request().url());
  if (/\/passage\/[^/]+\/2\/282\/282$/.test(url.pathname)) {
    const ayat = [{ surah: 2, ayah: 282, text, page: 48, lineStart: 1, lineEnd: 13, juz: 3 }];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reading: 'hafs', surah: 2, startAyah: 282, endAyah: 282, ayat, text, loci: [{ page: 48, lineStart: 1, lineEnd: 13 }], provenance: { mode: 'HARNESS', authority: 'KFGQPC', note: '' } }) });
  }
  if (url.pathname.endsWith('/mushaf-layout/48')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ page: 48, scale: 'LINE_ONLY', lineCount: 15, words: layoutWords }) });
  if (url.pathname === '/api/public/kfgqpc/audio/hafs-muaiqly/2/282') return route.fulfill({ status: 200, contentType: 'audio/wav', body: wav });
  return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
});
await page.goto('http://127.0.0.1:4174/?surah=2&start=282&end=282&name=البقرة');
await page.getByRole('button', { name: /استمع/ }).first().click();
await page.waitForSelector('[data-opening-cut="one-line"]', { timeout: 15000 });
await page.waitForTimeout(800);
/* يُرصد أعلى موضعٍ بلغه التشغيل قبل أن يقف (الشاشةُ تعيده إلى أوّله بعد الوقوف). */
await page.evaluate(`(() => { window.__maxT = 0; window.__stopped = false; setInterval(() => { const a = document.querySelector('.mizan-mushaf-drawer audio'); if (!a) return; if (!a.paused) window.__maxT = Math.max(window.__maxT, a.currentTime * 1000); else if (window.__maxT > 500) window.__stopped = true; }, 5); })()`);
await page.locator('.mizan-mushaf-drawer button').first().click();
await page.waitForFunction('window.__stopped === true', undefined, { timeout: 60000 });
const stoppedAtMs = Math.round(await page.evaluate('window.__maxT') as number);
const waqfEnd = model.words[WAQF].endMs;
const lineEnd = model.words[10].endMs;
const waqfSilence = [Math.round(waqfEnd - 450), Math.round(waqfEnd)];
const verdict = stoppedAtMs >= waqfSilence[0] - 60 && stoppedAtMs <= waqfSilence[1] + 60 ? 'STOPPED IN THE WAQF PAUSE' : stoppedAtMs <= lineEnd ? 'STOPPED BEFORE LINE END (not in the pause)' : 'OVERRAN THE LINE';
console.log(JSON.stringify({ waqfWord: `${WAQF}:${words[WAQF].text}`, waqfSilenceMs: waqfSilence, firstLineEndMs: Math.round(lineEnd), stoppedAtMs, verdict, label: await page.locator('[data-opening-cut]').textContent() }));
if (!verdict.startsWith('STOPPED IN')) process.exitCode = 1;
await page.screenshot({ path: process.argv[3] || 'cue.png' });
await browser.close();
await server.close();
