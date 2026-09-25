/*
 * «يسمعك» على الموقع الحيّ — تلاوةٌ حقيقيّةٌ في كروم بميكروفونٍ وهميّ.
 *
 * يُفتح كرومُ بخيارات الميكروفون الوهميّ فيقرأ ملفَّ التلاوة المرجعيّة، وتُفتح بطاقةُ رحلةِ
 * متسابقٍ معتمَد، ويُختار الوجه، ويُضغط «ابدأ التلاوة»، ويُترك حتى ينتهي الملفّ وصمتُه، ثمّ
 * «أنهيتُ». ويُحفظ كلُّ شيءٍ في ملفٍّ واحد يقرؤه `analyze.ts` و`report.ts`.
 *
 *   npx tsx tools/live-listen/run.ts --journey "<رابط بطاقة الرحلة>" --page 532 \
 *     --range 55:19-41 --mode normal --label live-normal
 *
 * ولقياس تعديلٍ قبل دمجه: ابنِ الواجهة وقدّمها بـ`serve-build.ts`، ومرّر `--base` إليه —
 * فالواجهةُ الجديدة تخاطب مستمعَ الإنتاج نفسه.
 *
 * ورابطُ البطاقة سرٌّ يفتح رحلةَ متسابق: يُمرَّر بالوسيط أو بـ`MIZAN_LIVE_JOURNEY`، ولا يُكتب في المستودع.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pw from 'playwright';
import { parseArgs } from './args';
import { RECORDER } from './recorder';
import { buildRecitation, parseRange, type Recitation } from './recitation';

const { chromium } = pw;

export interface LiveRun {
  meta: { label: string; mode: 'normal' | 'veil'; page: number; origin: string; build: string | null; startedAt: string; bundles: string[] };
  recitation: Omit<Recitation, 'wav'>;
  faceWords: { index: number; text: string; surah: number; ayah: number; ayahWordIndex?: number; endsAyah?: boolean }[];
  rec: {
    gum: number | null; onset: number | null; trans: [number, number, string][];
    /** مقاطعُ المسجِّل كما وصلت: `[لحظةُ الوصول، timecode المتصفّح، الحجم]`. */
    recorders?: { startedAt: number; slice: number | null; mime: string | null; chunks: [number, number | null, number][] }[];
  };
  clickAt: number;
  net: { kind: 'align' | 'recognise'; sentAt: number | null; at: number; status: number; body: any }[];
  report: string | null;
}

const ARGS = ['journey', 'base', 'page', 'range', 'pad', 'mode', 'label', 'out', 'cache', 'shots', 'seconds'] as const;

const CHROME = process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined);
const race = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), ms))]);

async function main() {
  const a = parseArgs(process.argv.slice(2), ARGS);
  const journey = a.journey || process.env.MIZAN_LIVE_JOURNEY;
  if (!journey) throw new Error('JOURNEY_REQUIRED: pass --journey "<https://…/#journey?comp=…&key=…>" or set MIZAN_LIVE_JOURNEY');
  const url = new URL(journey);
  const hash = new URLSearchParams(url.hash.split('?')[1] || '');
  const comp = hash.get('comp'), key = hash.get('key');
  if (!comp || !key) throw new Error('JOURNEY_INVALID: the link must carry comp= and key=');
  const origin = (a.base || url.origin).replace(/\/$/, '');
  const page = Number(a.page || 532);
  if (a.mode && a.mode !== 'normal' && a.mode !== 'veil') throw new Error(`MODE_INVALID «${a.mode}»: normal or veil`);
  const mode = (a.mode === 'veil' ? 'veil' : 'normal') as 'normal' | 'veil';
  const label = a.label || `${mode}-${page}-${Date.now()}`;
  const outDir = path.resolve(a.out || 'tools/live-listen/out');
  const cacheDir = path.resolve(a.cache || 'tools/live-listen/.cache');
  const shots = a.shots ? path.resolve(a.shots) : null;
  fs.mkdirSync(outDir, { recursive: true });
  if (shots) fs.mkdirSync(shots, { recursive: true });

  const recitation = await buildRecitation({ segments: parseRange(a.range || '55:19-41'), padSeconds: Number(a.pad || 120), cacheDir });
  const reciteMs = Number(a.seconds || 0) * 1000 || recitation.totalMs;
  const headers = { 'x-mizan-competition-id': comp, 'x-mizan-journey-key': key, accept: 'application/json' };
  const context = await (await fetch(`${origin}/api/public/journeys/practice/context`, { method: 'POST', headers })).json() as { deliveryReading: string; owner: string };
  if (!context.owner) throw new Error(`PRACTICE_CONTEXT_FAILED ${JSON.stringify(context).slice(0, 200)}`);
  const face = await (await fetch(`${origin}/api/public/journeys/practice/face?reading=${encodeURIComponent(context.deliveryReading)}&page=${page}`, { headers })).json() as { words: LiveRun['faceWords'] };
  /* رقمُ البناء في جواب الصحّة متداخلٌ في كائن؛ يُلتقط أينما كان. */
  const findBuild = (o: unknown): string | null => {
    if (!o || typeof o !== 'object') return null;
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) { if (k === 'build' && typeof v === 'string') return v; const inner = findBuild(v); if (inner) return inner; }
    return null;
  };
  const build = await fetch(`${origin}/api/health`).then(r => r.json()).then(findBuild).catch(() => null);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'live-listen-'));
  const browser = await chromium.launchPersistentContext(profile, {
    executablePath: CHROME, headless: false, locale: 'ar', viewport: { width: 1280, height: 900 },
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${recitation.wav}`,
      '--autoplay-policy=no-user-gesture-required', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  });
  const p = await browser.newPage();
  await p.addInitScript(RECORDER);
  let timeOrigin = 0;
  const net: LiveRun['net'] = [];
  const sent = new Map<object, number>();
  const bundles = new Set<string>();
  const now = () => (timeOrigin ? Date.now() - timeOrigin : null);
  p.on('request', r => { if (/practice\/(align|recognise)/.test(r.url())) sent.set(r, now() ?? -1); });
  p.on('response', async r => {
    const u = r.url();
    if (/assets\/(index|MushafListens)-[^/]*\.js$/.test(u)) bundles.add(u.split('/').pop()!);
    if (!/practice\/(align|recognise)/.test(u)) return;
    const at = now();
    let body: any = null; try { body = await r.json(); } catch { /* ليس JSON */ }
    net.push({ kind: u.includes('align') ? 'align' : 'recognise', sentAt: sent.get(r.request()) ?? null, at: at ?? -1, status: r.status(), body });
  });

  const journeyUrl = `${origin}/#journey?comp=${encodeURIComponent(comp)}&key=${encodeURIComponent(key)}`;
  await p.goto(journeyUrl); await p.waitForTimeout(3000);
  /* خريطةُ «رحلة حفظك» لا تظهر إلا بعد محاولة: تُزرع محاولةٌ على وجهٍ آخر في مخزن هذا الملفّ المؤقّت وحده. */
  await p.evaluate(([k, other]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify([{ page: other, at: new Date().toISOString(), marks: [] }])); },
    [`mizan.face-attempts.v1:${context.owner}:${context.deliveryReading}`, page === 1 ? 2 : page - 1] as const);
  await p.reload(); timeOrigin = await p.evaluate(() => performance.timeOrigin); await p.waitForTimeout(6000);
  await p.getByText('التهيئة قبل دورك').click(); await p.waitForTimeout(1500);
  await p.locator('button').filter({ hasText: /^يسمعك$/ }).first().click(); await p.waitForTimeout(7000);
  await p.evaluate(() => { const d = document.querySelector('[data-hifz-journey]') as HTMLDetailsElement | null; if (d) d.open = true; });
  await p.locator(`[data-hifz-journey] button[data-page="${page}"]`).click(); await p.waitForTimeout(6000);
  const faceCount = await p.locator('[data-word]').count();
  if (faceCount !== face.words.length) throw new Error(`FACE_MISMATCH page shows ${faceCount} words, API says ${face.words.length}`);
  if (mode === 'veil') { await p.getByRole('button', { name: 'اختبر حفظك' }).click(); await p.waitForTimeout(800); }
  for (let i = 0; i < 240 && !(await p.locator('button[data-listens="yes"]:not([disabled])').count()); i += 1) await p.waitForTimeout(1000);
  const clickAt = await p.evaluate(() => performance.now());
  await p.locator('button[data-listens="yes"]').click();
  console.log(`[${label}] started ${new Date().toISOString()} · ${origin} · build ${build} · page ${page} · ${mode} · ${Math.round(reciteMs / 1000)} s`);

  const cdp = await browser.newCDPSession(p);
  const partial = path.join(outDir, `${label}.partial.json`);
  for (let t = 0; t < reciteMs; t += 30_000) {
    await p.waitForTimeout(Math.min(30_000, reciteMs - t));
    if (shots) {
      const s = await race(cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 50 }).catch(() => null), 5000) as { data: string } | null;
      if (s) fs.writeFileSync(path.join(shots, `${label}-${String(Math.round((t + 30_000) / 1000)).padStart(3, '0')}.jpg`), Buffer.from(s.data, 'base64'));
    }
    const rec = await race(p.evaluate(() => (window as any).__liveListen).catch(() => null), 10_000);
    if (rec) fs.writeFileSync(partial, JSON.stringify({ rec, net }));
  }
  const rec = (await race(p.evaluate(() => { const r = (window as any).__liveListen; return { gum: r.gum, onset: r.onset, trans: r.trans, recorders: r.recorders }; }), 20_000))
    ?? JSON.parse(fs.readFileSync(partial, 'utf8')).rec;
  await p.locator('button').filter({ hasText: /أنهيت/ }).first().click().catch(() => {});
  await p.waitForTimeout(40_000);
  const report = await race(p.evaluate(() => { const t = document.body.innerText; const i = t.indexOf('بلغتَ'); return i < 0 ? null : t.slice(Math.max(0, i - 200), i + 2500); }), 20_000);
  await browser.close().catch(() => {});
  fs.rmSync(profile, { recursive: true, force: true });

  const { wav: _wav, ...timeline } = recitation;
  const run: LiveRun = {
    meta: { label, mode, page, origin, build, startedAt: new Date().toISOString(), bundles: [...bundles] },
    recitation: timeline, faceWords: face.words, rec: { gum: rec.gum, onset: rec.onset, trans: rec.trans, recorders: rec.recorders }, clickAt, net, report,
  };
  const file = path.join(outDir, `${label}.json`);
  fs.writeFileSync(file, JSON.stringify(run));
  fs.rmSync(partial, { force: true });
  console.log(`[${label}] saved ${file}`);
}

main().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
