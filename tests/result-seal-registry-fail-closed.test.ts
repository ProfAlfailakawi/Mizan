/*
 * ما لا يُسجَّل لا يُختم — ولا يُبنى على «لا أعلم» قرار.
 *
 * `MIZAN_SEAL_REGISTRY_DIR` لم يكن مضبوطًا في أيّ نشرة حتى 19 سبتمبر 2026، فكان
 * `resultSealRegistry` يساوي `null` في الإنتاج. والنداءات عليه كانت بـ`?.`، فترتّب على
 * غيابه عطلان صامتان لا يظهران إلا يوم النزاع:
 *
 *   · `POST /api/results/seal` يمضي ويردّ 201 ولا يُكتب صفٌّ في سجلّ الأختام. ومعه
 *     يسقط كشفُ إعادة الختم بنفس المدخلات — فكلُّ نداءٍ يُنشئ بصمةً جديدة لأن
 *     `sealedAt` يدخل البصمة — ويسقط أساسُ فصل المهامّ عند النشر.
 *
 *   · `POST /api/results/score-correction` يقرأ «هل خُتمت؟» فيجد `undefined` فيقرؤها
 *     «لم تُختم» — وهي البابُ الأوسع: التصحيح على غير المختومة أيسر. أي أن عطلًا في
 *     التهيئة كان يفتح البابَ الأوسع بلا أن ينطق.
 *
 * فيُسوَّى البابان ببابِ النشر الذي كان وحده أمينًا منذ البداية: 503 صريحة.
 *
 * وهذه الحرّاس تثبت ثلاثة: أن الحاجز موجود في المسارين، وأنه **قبل** أوّل استعمال في
 * كلٍّ منهما، وأن `?.` لم يعد على السجلّ في أيّ موضع — فالسطرُ الذي يُعيدها يسقط هنا.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

/* التعليقات تُنزع أوّلًا: تعليقٌ يشرح العطل يجب ألّا يُرضي حارسًا يبحث عن إصلاحه. */
const SERVER = fs
  .readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

const GUARD = "if(!resultSealRegistry)return res.status(503).json({code:'RESULT_SEAL_REGISTRY_NOT_CONFIGURED'});";

const routeBody = (route: string) => {
  const start = SERVER.indexOf(`app.post('${route}'`);
  assert.ok(start >= 0, `${route} must exist`);
  const next = SERVER.indexOf('app.post(', start + 1);
  return SERVER.slice(start, next > start ? next : undefined);
};

test('the seal registry is never optional-chained — a missing registry is never a silent skip', () => {
  assert.equal(/resultSealRegistry\?\./.test(SERVER), false,
    'an optional call turns "no registry" into "nothing happened", which is exactly the defect');
});

test('sealing refuses before it computes anything when the registry is absent', () => {
  const body = routeBody('/api/results/seal');
  assert.ok(body.includes(GUARD), 'the seal route must fail closed, as publication already does');
  const guardAt = body.indexOf(GUARD);
  const firstUse = body.indexOf('resultSealRegistry.');
  assert.ok(firstUse > guardAt,
    'the guard must precede every use — a guard after the first call protects nothing');
});

test('score correction refuses rather than reading an absent registry as "not sealed"', () => {
  const body = routeBody('/api/results/score-correction');
  assert.ok(body.includes(GUARD), '"I do not know" must not be answered as "no"');
  const guardAt = body.indexOf(GUARD);
  const firstUse = body.indexOf('resultSealRegistry.');
  assert.ok(firstUse > guardAt, 'the guard must precede the sealed/not-sealed read');
  assert.match(body, /resultSealed=!!resultSealRegistry\.latestFor\(/,
    'the answer still comes from the registry itself, not from the request body');
});

test('publication keeps its own refusal — the three doors stay consistent', () => {
  assert.match(SERVER, /if\(!resultSealRegistry\|\|!resultPublications\)return res\.status\(503\)\.json\(\{code:'RESULT_PUBLICATION_NOT_CONFIGURED'\}\)/,
    'publication was already fail-closed and must remain so');
});
