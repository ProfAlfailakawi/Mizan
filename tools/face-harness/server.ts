/*
 * خادمُ المِشْحَن — يُخرج وجوهًا **حقيقيّة** من حزمة الرواية، وشبكةً تتلكّأ بأمر.
 *
 * فالوجوهُ والكلماتُ تُقرأ من `practice-face-service` نفسِه الذي يعمل في الإنتاج: لا
 * يُختلق نصٌّ قرآنيٌّ في مشحنٍ ولا في غيره. وإنّما يُصطنع **سلوكُ الشبكة** وحدَه —
 * تأخيرٌ، وتعليقٌ، وسقوط — لأنّه موضعُ العيوب السبعة.
 *
 * ومسارُ المحاذاة يردّ موضعًا **متقدّمًا بانتظام**: كلمةٌ بعد كلمة. فإن ظهر في التقرير
 * «أعدتَ» فذلك رجوعٌ لم يقع — صنعته فوضى الوصول، لا القارئ.
 */
import { CHUNK_MS, recognitionWindow } from '../../src/lib/recognition-window';
import http from 'node:http';
import { practiceFaceCatalogue, practiceFacePage } from '../../server/practice-face-service';
import { normalizeScope, fullQuranScope } from '../../src/lib/quran-scope';

export type Scenario = 'happy' | 'reordered' | 'hanging' | 'failing' | 'judging' | 'judging-closed' | 'judging-dropped' | 'judging-changed' | 'judging-changed-late';

/*
 * ومسارُ السماع يُصطنع كذلك — وهذا أوّلُ ما يقول «أخطأت» في هذا النظام.
 *
 * فـ`judging` تفتح البوّابةَ وتُسقط كلمةً واحدةً من التلاوة المُعادة: الكلمةُ الرابعة.
 * فإن لم تظهر تحتها علامةٌ في الصفحة فالربطُ لا يعمل، وإن ظهرت تحت غيرها فالتوقيتُ
 * أو الترتيبُ مكسور.
 *
 * و`judging-closed` تُبقيها مغلقةً كما هي في الإنتاج اليوم — فيُقاس أنّ الشاشةَ
 * **لا تحكم** وتقول للطالب لماذا.
 */
const SKIPPED_WORD_INDEX = 3;
const HARNESS_MODEL = 'harness-model-1';
/* السيناريوهاتُ التي يُفتح فيها بابُ الحكم. */
const OPEN_SCENARIOS: ReadonlySet<Scenario> = new Set(['judging', 'judging-dropped', 'judging-changed', 'judging-changed-late']);

const RAWI = 'hafs';
const json = (res: http.ServerResponse, body: unknown, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface HarnessServer { port: number; close(): Promise<void>; chunks(): number }

export async function startHarnessServer(port: number, scenario: Scenario = 'happy'): Promise<HarnessServer> {
  const catalogue = practiceFaceCatalogue(RAWI, normalizeScope(fullQuranScope()));
  /* وجهٌ في سورةٍ واحدةٍ ليُقاس الاستماع، ووجهٌ عابرٌ ليُقاس امتناعُه. */
  const single = catalogue.faces.find(f => f.surahStart === f.surahEnd && f.ayahCount >= 4)!;
  const pages = new Map<number, ReturnType<typeof practiceFacePage>>();
  const pageOf = (page: number) => {
    const found = pages.get(page) || practiceFacePage(RAWI, page);
    pages.set(page, found);
    return found;
  };

  let served = 0, heard = 0;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);

    if (url.pathname === '/api/quran/practice/faces') {
      /* وجهٌ واحدٌ يُعرض على المِشْحَن ليكون السحبُ حتميًّا. */
      return json(res, { rawiId: RAWI, supportsFaces: true, wholeFaces: catalogue.wholeFaces, faces: [single] });
    }
    if (url.pathname === '/api/quran/practice/face') {
      return json(res, pageOf(Number(url.searchParams.get('page'))));
    }
    if (url.pathname === '/api/quran/practice/judging-gate') {
      const open = OPEN_SCENARIOS.has(scenario);
      return json(res, {
        reading: RAWI,
        word: open ? 'OPEN' : 'CLOSED',
        tashkeel: 'CLOSED',
        modelVersion: open ? HARNESS_MODEL : null,
        reasons: open ? [] : ['ASR_BENCHMARK_NOT_AVAILABLE'],
      });
    }
    if (url.pathname === '/api/quran/practice/recognise') {
      if (!OPEN_SCENARIOS.has(scenario)) return json(res, { code: 'QURAN_ASR_JUDGING_CLOSED' }, 409);
      const index = heard;
      heard += 1;
      /*
       * و`judging-dropped` تُسقط مقطعَ سماعٍ واحدًا بعطبٍ عابر — وهو أكثرُ ما يقع:
       * شبكةٌ تتعثّر، أو ٥٠٢، أو تجاوزُ حدّ. فيصير في ما سُمع **ثقب**، والمقابلةُ
       * تقرأ الثقبَ إسقاطًا فتُخطّئ قارئًا مصيبًا. والمنتظَرُ ألّا يُحكم أصلًا.
       */
      if (scenario === 'judging-dropped' && index === 2) return json(res, { code: 'HARNESS_ASR_DROPPED' }, 502);
      /*
       * و`judging-changed-late` يحكي ما يكشفه الخادمُ وحده: تقريرُ القياس استُبدل والطلبُ
       * في الطريق، فيردّ الخادمُ 409 بعد أن يعيد قراءةَ الباب — لا بوّابةً مختلفةً في الجواب.
       */
      if (scenario === 'judging-changed-late' && index === 2) return json(res, { code: 'QURAN_ASR_GATE_CHANGED' }, 409);
      const face = pageOf(single.page);
      /*
       * ويُعاد نصُّ الوجه نفسُه كلمتين في كلّ مقطع — من حزمة الرواية لا من اختراع —
       * إلا الكلمةَ الرابعة، فتُسقط عمدًا. فالمقصودُ قياسُ الربط لا قياسُ محرّك.
       */
      /*
       * والمحرّكُ يسمع **النافذةَ** كلَّها لا المقطعَ وحده: كلماتِ كلّ مقطعٍ فيها، وأزمنتُها
       * من أوّل محتواها (بعد الترويسة المطروحة). والقاعدةُ تُقرأ من الشاشة نفسِها
       * (`recognitionWindow`)، فلا يخترع المِشحَنُ نوافذَه — وإلا قاس ما لا يقع.
       */
      const win = recognitionWindow(index, false);
      const words = [];
      for (let c = win.first; c <= index; c += 1) {
        for (const offset of [0, 1]) {
          const at = c * 2 + offset;
          if (at >= face.words.length || at === SKIPPED_WORD_INDEX) continue;
          const startMs = (c - win.first) * CHUNK_MS + offset * 800;
          words.push({ text: face.words[at].text, confidence: 0.95, startMs, endMs: startMs + 700 });
        }
      }
      await sleep(30);
      /*
       * والجوابُ بشكل الخادم الحقيقيّ: `{gate, words, modelVersion}` — فالخادمُ يعيد
       * قراءةَ بوّابته مع كلّ مقطع ويردّها. وكان المِشحَنُ يُسقط `gate`، فكان الردُّ
       * المزيّفُ أفقرَ من الحقيقيّ، ولم يظهر ذلك حتى صارت الشاشةُ تقرؤها.
       *
       * و`judging-changed` يُبدّل النموذجَ من المقطع الثالث — تقريرُ قياسٍ استُبدل
       * والطالبُ يقرأ. والمنتظَرُ ألّا تُجمع مراجعةٌ واحدةٌ من محرّكين.
       */
      const model = scenario === 'judging-changed' && index >= 2 ? `${HARNESS_MODEL}-next` : HARNESS_MODEL;
      const gate = { reading: RAWI, word: 'OPEN', tashkeel: 'CLOSED', modelVersion: model, reasons: [] };
      return json(res, { gate, modelVersion: model, words });
    }
    if (url.pathname === '/api/quran/practice/align') {
      const index = served;
      served += 1;
      const face = pageOf(single.page);
      /* موضعٌ يتقدّم كلمةً كلَّ مقطع — فأيُّ رجوعٍ في التقرير رجوعٌ مُختلَق. */
      const word = face.words[Math.min(index, face.words.length - 1)];

      const behaviour = harnessBehaviour(scenario, index);
      if (behaviour.hang) return; /* لا ردَّ أبدًا */
      await sleep(behaviour.delayMs);
      if (behaviour.fail) return json(res, { code: 'HARNESS_CHUNK_FAILED' }, 502);

      return json(res, {
        timestamp: new Date().toISOString(), reading: RAWI,
        surah: word.surah, ayah: word.ayah, wordIndex: word.ayahWordIndex,
        confidence: 0.9, smoothedConfidence: 0.9,
        alignmentState: 'LOCKED', recoveryState: 'STABLE', pointerMoved: true,
        scoreAuthority: 'HUMAN_ONLY', scoreDelta: 0, shadowMode: true, practice: true,
      });
    }
    res.writeHead(404); res.end();
  });

  await new Promise<void>(r => server.listen(port, '127.0.0.1', r));
  return {
    port,
    chunks: () => served,
    close: () => new Promise<void>(r => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}

/*
 * سلوكُ الشبكة لكلّ مقطع — وهو وحدَه المُصطنَع في هذا المِشْحَن.
 *
 * و`reordered` مقصودٌ على أسوأ حال: الأوّلُ أبطأُ ما يكون. فبلا طابورٍ يعود ردُّه بعد
 * ما بعده، فيُقرأ المسارُ رجوعًا.
 */
export function harnessBehaviour(scenario: Scenario, index: number): { delayMs: number; hang: boolean; fail: boolean } {
  if (scenario === 'reordered') return { delayMs: index === 0 ? 2500 : 30, hang: false, fail: false };
  if (scenario === 'hanging') return { delayMs: 0, hang: index === 1, fail: false };
  if (scenario === 'failing') return { delayMs: 30, hang: false, fail: index === 1 };
  return { delayMs: 30, hang: false, fail: false };
}
