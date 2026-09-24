/*
 * سائقُ المِشْحَن — يُجري التلاوةَ في متصفّحٍ حقيقيّ ويقيس ما وقع.
 *
 * ولا يقرأ نصَّ شيفرةٍ ولا يصيّر إلى سلسلة: يفتح الصفحة، ويفتح الميكروفون، ويقرأ
 * ثوانيَ، ويضغط «أنهيتُ»، ثمّ ينظر في الصفحة وفي مسار الصوت وفي مخزن الجهاز.
 */
import pw from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
import { startHarnessServer, type Scenario, type HarnessServer } from './server';

const { chromium } = pw;
const UI_PORT = 4173;
const API_PORT = 4322;

export interface RunOutcome {
  scenario: Scenario;
  chunksServed: number;
  stage: string | null;
  reachText: string | null;
  indices: Record<string, string>;
  marks: string[];
  analysisNote: string | null;
  /* مواضعُ الخطأ كما رُسمت على الوجه — نوعُ كلٍّ وفهرسُ كلمته. */
  mistakes: { word: number; kind: string }[];
  /* وبيانُ البوّابة حين تكون مغلقة. */
  gateNote: string | null;
  /* وكم نغمةَ تنبيهٍ خرجت فعلًا من مسار الصوت. */
  alertOscillators: number;
  attemptsStored: number;
  micTracksLive: number;
  reportShown: boolean;
  /* «المعلّم»: حالُ تقريره، وسطورُه، والكلماتُ المخطوطةُ في الصفحة، وما وصل خادمَه. */
  teacher: { phase: string | null; rows: string[]; notedWords: number[]; mode: string | null; unclearLeft: number; referenceButtons: number };
  /** «أعِد هذه الآية»: كم آيةً «لم تتّضح» قبل الإعادة. */
  retakeOffered: number;
  teacherCalls: import('./server').TeacherCall[];
  /* كم مقطعًا من تلاوة الطالب شُغِّل عند «تلاوتك». */
  snippetSources: number;
}

export async function runScenario(scenario: Scenario, reciteMs: number, settleMs: number): Promise<RunOutcome> {
  let api: HarnessServer | undefined;
  let ui: Awaited<ReturnType<typeof createServer>> | undefined;
  let browser: pw.Browser | undefined;
  try {
    api = await startHarnessServer(API_PORT, scenario);
    ui = await createServer({ configFile: path.resolve(HERE, 'vite.config.ts') });
    await ui.listen(UI_PORT);

    /*
     * ويُترك المسارُ لبلايرايت إلّا أن يُملى بمتغيّر البيئة — وهو ما تفعله بقيّةُ
     * فحوص المستودع. وكان هنا مسارٌ ثابتٌ إلى `/opt/pw-browsers/chromium`: يعمل على
     * آلةٍ بعينها ولا وجودَ له على عدّاء `ubuntu-latest` بعد
     * `npx playwright install`. أي أنّ الفحصَ كان سيسقط قبل أن يُفتح متصفّح.
     */
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    });
    const context = await browser.newContext({ permissions: ['microphone'] });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${UI_PORT}/`);

    /* الوجهُ يُسحب ويُعرض نظيفًا قبل أيّ ضغطة. */
    await page.waitForSelector('[data-face-words]', { timeout: 20_000 });
    await page.getByRole('button', { name: /ابدأ التلاوة|راجِع الوجه/ }).click();
    await page.waitForTimeout(reciteMs);
    await page.getByRole('button', { name: /أنهيتُ/ }).click();

    /* التقريرُ يُنتظر بالمهلة التي يحتاجها السيناريو — وتعليقُ مقطعٍ يبلغ حدَّ الإفراغ. */
    await page.waitForSelector('[data-index="reach"]', { timeout: settleMs }).catch(() => undefined);
    /* والمعلّمُ بعد التقرير: يُنتظر حتى يفرغ حيث يُتوقّع. */
    let snippetSources = 0;
    let retakeOffered = 0;
    if (scenario === 'teacher') {
      await page.waitForSelector('[data-tashkeel="done"],[data-tashkeel="failed"]', { timeout: 20_000 }).catch(() => undefined);
      /* «تلاوتك هنا»: يُضغط أوّلُها، ويُعدّ ما شُغِّل فعلًا من مسار الصوت (مصدرُ مخزنٍ مفكوك). */
      const listen = page.locator('[data-listen-word]').first();
      if (await listen.count()) {
        const before = await page.evaluate('window.__mizanAlerts().buffers') as number;
        await listen.click();
        await page.waitForTimeout(1500);
        snippetSources = (await page.evaluate('window.__mizanAlerts().buffers') as number) - before;
      }
      /* «أعِد هذه الآية»: تُقرأ الآيةُ وحدها ثانيتين، ثم «انتهيت»، فيراجعها المعلّم وتخرج من القائمة. */
      retakeOffered = await page.locator('[data-retake]').count();
      if (retakeOffered) {
        await page.locator('[data-retake]').first().click();
        await page.waitForSelector('[data-retake-stop]', { timeout: 5000 });
        await page.waitForTimeout(2500);
        await page.locator('[data-retake-stop]').click();
        await page.waitForFunction(n => document.querySelectorAll('[data-retake]').length < n, retakeOffered, { timeout: 15_000 }).catch(() => undefined);
      }
    }
    await page.waitForTimeout(500);
    if (process.env.HARNESS_SHOTS) {
      await page.screenshot({ path: path.join(process.env.HARNESS_SHOTS, `${scenario}.png`), fullPage: true });
      const report = page.locator('[data-tashkeel]').first();
      if (await report.count()) await report.screenshot({ path: path.join(process.env.HARNESS_SHOTS, `${scenario}-report.png`) });
      const surface = page.locator('[data-official-mushaf-page], [data-face-words]').first();
      if (await surface.count()) await surface.screenshot({ path: path.join(process.env.HARNESS_SHOTS, `${scenario}-face.png`) });
    }

    /*
     * ويُقرأ ما في الصفحة بنصٍّ يُرسل إلى المتصفّح كما هو.
     *
     * فمترجمُ الأنواع يحقن مساعدًا (`__name`) في الدوالّ المسمّاة، ولا وجودَ له في
     * صفحةِ متصفّح. فيُمرَّر النصُّ خامًا ليُقيَّم هناك.
     */
    const outcome = await page.evaluate(`(() => {
      const text = el => (el ? (el.textContent || '').replace(/\\s+/g, ' ').trim() : null);
      const indices = {};
      document.querySelectorAll('[data-index]').forEach(cell => {
        indices[cell.getAttribute('data-index') || ''] = text(cell.querySelector('dd')) || '';
      });
      const marks = [];
      document.querySelectorAll('[data-mark]').forEach(w => marks.push(w.getAttribute('data-mark') || ''));
      const mistakes = [];
      document.querySelectorAll('[data-mistake]').forEach(w => mistakes.push({
        word: Number(w.getAttribute('data-word')), kind: w.getAttribute('data-mistake') || '',
      }));
      const gateCell = document.querySelector('[data-judging-gate]');
      const alerts = window.__mizanAlerts();
      const note = Array.prototype.map.call(document.querySelectorAll('p'), p => (p.textContent || '').trim())
        .find(t => t.indexOf('لم يصل') >= 0 || t.indexOf('غيرُ مهيّأ') >= 0 || t.indexOf('جلستُك') >= 0 || t.indexOf('خاتمةَ سورةٍ') >= 0) || null;
      let attempts = 0;
      try {
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i) || '';
          if (key.indexOf('mizan.face-attempts') === 0) attempts += JSON.parse(localStorage.getItem(key) || '[]').length;
        }
      } catch (e) { /* مخزنٌ ممنوع */ }
      const streams = window.__mizanStreams();
      return {
        stage: text(document.querySelector('[data-stage]')),
        reachText: indices.reach || null,
        indices: indices, marks: marks, analysisNote: note,
        mistakes: mistakes, gateNote: text(gateCell),
        alertOscillators: alerts.oscillators,
        attemptsStored: attempts,
        micTracksLive: streams.reduce((sum, s) => sum + s.live, 0),
        reportShown: !!document.querySelector('[data-index="reach"]'),
        teacher: {
          phase: (document.querySelector('[data-tashkeel]') || { getAttribute: () => null }).getAttribute('data-tashkeel'),
          rows: Array.prototype.map.call(document.querySelectorAll('.mizan-tashkeel__row'), r => r.getAttribute('data-kind') + ':' + text(r.querySelector('.mizan-tashkeel__msg'))),
          notedWords: Array.prototype.map.call(document.querySelectorAll('[data-live-note],[data-note]'), w => Number(w.getAttribute('data-note-word') || w.getAttribute('data-word') || -1)),
          mode: (document.querySelector('[data-tashkeel-mode]') || { getAttribute: () => null }).getAttribute('data-tashkeel-mode'),
          unclearLeft: document.querySelectorAll('[data-retake]').length,
          referenceButtons: document.querySelectorAll('[data-reference-word]').length,
        },
      };
    })()`) as Omit<RunOutcome, 'scenario' | 'chunksServed' | 'teacherCalls' | 'snippetSources' | 'retakeOffered'>;

    if (errors.length) throw new Error(`أخطاءُ صفحة: ${errors.join(' | ')}`);
    return { scenario, chunksServed: api.chunks(), teacherCalls: api.teacherCalls(), snippetSources, retakeOffered, ...outcome };
  } finally {
    await browser?.close();
    await ui?.close();
    await api?.close();
  }
}
