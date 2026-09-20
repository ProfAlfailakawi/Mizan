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
import http from 'node:http';
import { practiceFaceCatalogue, practiceFacePage } from '../../server/practice-face-service';
import { normalizeScope, fullQuranScope } from '../../src/lib/quran-scope';

export type Scenario = 'happy' | 'reordered' | 'hanging' | 'failing';

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

  let served = 0;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);

    if (url.pathname === '/api/quran/practice/faces') {
      /* وجهٌ واحدٌ يُعرض على المِشْحَن ليكون السحبُ حتميًّا. */
      return json(res, { rawiId: RAWI, supportsFaces: true, wholeFaces: catalogue.wholeFaces, faces: [single] });
    }
    if (url.pathname === '/api/quran/practice/face') {
      return json(res, pageOf(Number(url.searchParams.get('page'))));
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
