/*
 * محرّكٌ مرجعيٌّ للعقد — **لا يتعرّف على شيء**.
 *
 * وهذا مقصودٌ ومكتوبٌ في أوّل سطر: هو غلافُ العقد لا مضمونُه. يردّ ردًّا صحيحَ
 * البنية بكلماتٍ **عربيّةٍ عاديّةٍ ليست من القرآن** (`مقطع` و`صوت`)، كي لا يُظنّ يومًا
 * أنّ في المستودع نصًّا قرآنيًّا مُختلَقًا، ولا أنّ ثمّة محرّكًا يعمل.
 *
 * وفائدتُه اثنتان:
 *  ١) يُشغَّل عليه `quran:asr-conformance` في كلّ دفعةٍ مجدولة، فيُثبت أنّ **الفاحصَ**
 *     نفسَه يعمل — فحصٌ لا يُشغَّل يشيخ ويُنكسر بصمت.
 *  ٢) ويجرّب عليه المالكُ أنابيبَه قبل أن يصل محرّكٌ حقيقيّ.
 */
import http from 'node:http';

/** كلماتٌ عربيّةٌ عاديّة — وليست من القرآن بحال. */
export const REFERENCE_TOKENS = ['مقطع', 'صوت'] as const;
export const REFERENCE_MODEL_VERSION = 'mizan-asr-reference-0';

export interface ReferenceEngine { port: number; close(): Promise<void>; calls(): number }

export async function startReferenceEngine(port = 0): Promise<ReferenceEngine> {
  let calls = 0;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    const reply = (body: unknown, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'POST') return reply({ code: 'METHOD_NOT_ALLOWED' }, 405);

    /* الروايةُ تُطلب صراحةً وتُردّ صراحةً — ولا تُخمَّن ولا تُبدَّل بغيرها. */
    const reading = url.searchParams.get('reading') || '';
    if (!reading) return reply({ code: 'READING_REQUIRED' }, 400);

    const chunks: Buffer[] = [];
    for await (const part of req) chunks.push(part as Buffer);
    const bytes = Buffer.concat(chunks);
    if (!bytes.length) return reply({ code: 'EMPTY_AUDIO' }, 400);

    calls += 1;
    return reply({
      reading,
      modelVersion: REFERENCE_MODEL_VERSION,
      words: REFERENCE_TOKENS.map((text, index) => ({
        text, confidence: 0.5, startMs: index * 800, endMs: index * 800 + 700,
      })),
    });
  });
  await new Promise<void>(r => server.listen(port, '127.0.0.1', r));
  const bound = (server.address() as { port: number }).port;
  return {
    port: bound,
    calls: () => calls,
    close: () => new Promise<void>(r => { server.closeAllConnections?.(); server.close(() => r()) }),
  };
}
