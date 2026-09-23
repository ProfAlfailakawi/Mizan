/*
 * أبوابُ التدريب — كلُّها، لا التي أذكرها.
 *
 * فمسارُ «المصحفُ يسمعك» يفتح ميكروفونَ طفلٍ ويرسل صوتَه إلى الخادم. وبابٌ واحدٌ
 * يُنسى بلا هويّةٍ أو بلا حدِّ معدّلٍ يكفي: يُقرأ نطاقُ متسابقٍ آخر، أو يُغرَق المحرّكُ
 * بمقاطعَ حتى يسقط على كلّ الطلبة.
 *
 * والقائمةُ **تُشتقّ من `server.ts`** لا تُكتب هنا: بابٌ يُضاف غدًا يشمله الشرطُ بلا
 * أن يتذكّره أحد — وهي العلّةُ نفسُها التي تحرس منها بقيّةُ حرّاس هذا المستودع.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const SERVER = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');

interface Route { method: string; url: string; line: number; head: string }

/** كلُّ بابٍ تحت `/api/quran/practice/` كما هو مكتوبٌ في الخادم. */
function practiceRoutes(): Route[] {
  const out: Route[] = [];
  SERVER.split('\n').forEach((line, index) => {
    const m = /^\s*app\.(get|post|put|delete)\('(\/api\/quran\/practice\/[^']*)'\s*,([\s\S]*)$/.exec(line);
    if (!m) return;
    out.push({ method: m[1], url: m[2], line: index + 1, head: m[3] });
  });
  return out;
}

const routes = practiceRoutes();

test('the scan sees the practice doors it is meant to guard', () => {
  // ولو عمي عنها لمرّ الاختبارُ فارغًا وهو يبدو حارسًا.
  assert.ok(routes.length >= 4, `expected the practice routes, found ${routes.length}`);
  const urls = routes.map(r => r.url);
  for (const required of ['/api/quran/practice/align', '/api/quran/practice/face', '/api/quran/practice/judging-gate', '/api/quran/practice/recognise'])
    assert.ok(urls.includes(required), `${required} must be among the scanned routes: ${urls.join(', ')}`);
});

test('every practice door asks who is knocking', () => {
  const offenders = routes.filter(r => !/requireFirebaseRoles\(\['participant'\]\)/.test(r.head));
  assert.deepEqual(offenders.map(r => `${r.url}:${r.line}`), [],
    'a practice route without participant identity reads another competitor’s scope');
});

test('every practice door is rate limited by address', () => {
  const offenders = routes.filter(r => !/practiceAlignmentIpRateLimit/.test(r.head));
  assert.deepEqual(offenders.map(r => `${r.url}:${r.line}`), [],
    'an unlimited practice route can be flooded until it falls for every student');
});

test('a door that swallows audio is limited per actor too, and bounded in size', () => {
  /*
   * فحدُّ العنوان وحده يقف أمام عنوانٍ واحدٍ يُغرق الخادم، ولا يقف أمام حسابٍ واحدٍ
   * يرسل من عناوين. والحجمُ يُقيَّد حيث يُقرأ الجسمُ خامًا: `express.raw` بلا `limit`
   * يقبل ما يُرسَل.
   */
  const audio = routes.filter(r => /express\.raw\(/.test(r.head));
  assert.ok(audio.length >= 2, `expected the audio routes, found ${audio.length}`);
  for (const route of audio) {
    /*
     * وحدُّ الفاعل يُطلب بوصفه لا باسم واحدٍ بعينه: مساران يبتلعان صوتًا، وحدٌّ
     * مشتركٌ بينهما يُستهلك في نصف الزمن فيقطع كليهما. فيكفي أن يحمل كلٌّ حدًّا
     * للفاعل — ويُشترط بعدُ ألّا يكون الحدُّ واحدًا للمسارين.
     */
    assert.match(route.head, /practice[A-Za-z]*RateLimit/, `${route.url}: needs a per-actor limit`);
    assert.match(route.head, /limit:'[0-9]+[km]b'/i, `${route.url}: raw body must be bounded`);
    assert.match(route.head, /type:\['audio\/\*','application\/octet-stream'\]/, `${route.url}: only audio is read raw`);
  }
  /*
   * ولا يتقاسم مساران يبتلعان صوتًا حدًّا واحدًا للفاعل.
   *
   * فالمقطعُ يذهب إليهما معًا حين تُفتح بوّابةُ الحكم، فيُستهلك الحدُّ في نصف الزمن،
   * ثمّ يردّ الخادمُ 429 للمسارين — فينقطع **وصفُ التلاوة** أيضًا، وهو يعمل اليوم
   * ولا شأن له بكشف الخطأ.
   */
  const perActor = audio.map(route => [...route.head.matchAll(/practice[A-Za-z]*RateLimit/g)]
    .map(m => m[0]).filter(name => name !== 'practiceAlignmentIpRateLimit'));
  audio.forEach((route, index) => assert.ok(perActor[index].length, `${route.url}: بلا حدٍّ للفاعل`));
  const names = perActor.map(list => list.join('+'));
  assert.equal(new Set(names).size, names.length, `مساران يبتلعان صوتًا يتقاسمان الحدّ نفسَه: ${names.join(' · ')}`);
});

test('a repeated query parameter never becomes an array on a practice door', () => {
  /*
   * `?reading=hafs&reading=warsh` يصل `req.query.reading` مصفوفةً. و`String([a,b])`
   * يُخرج «a,b» فيُقاس الطالبُ بروايةٍ ليست روايته، و`Number([1,2])` يُخرج `NaN`.
   * و`soleParam` يرفض التكرار باسمه.
   */
  for (const route of routes) {
    for (const match of route.head.matchAll(/req\.query\.([a-zA-Z]+)/g)) {
      const use = match[0];
      const index = route.head.indexOf(use);
      const before = route.head.slice(Math.max(0, index - 40), index);
      assert.match(before, /soleParam\($/, `${route.url}: ${use} must go through soleParam`);
    }
  }
});

test('the judging gate answers without a body, and the recogniser reads one', () => {
  const gate = routes.find(r => r.url === '/api/quran/practice/judging-gate')!;
  assert.equal(gate.method, 'get', 'asking for permission changes nothing');
  assert.equal(/express\.raw\(|express\.json\(/.test(gate.head), false, 'and carries no body');
  const recognise = routes.find(r => r.url === '/api/quran/practice/recognise')!;
  assert.equal(recognise.method, 'post');
  assert.match(recognise.head, /express\.raw\(/);
});
