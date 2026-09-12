import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const store = fs.readFileSync(path.join(process.cwd(), 'src/lib/store.ts'), 'utf8');

/*
 * الإيقاع تعلَّم ولم يصل.
 *
 * `session-tempo` يقيس كم تأخذ اللجنة فعلًا، ثم وُصِل بثلاثة مواضع من خمسة: تقديرُ
 * المتسابق، ووعدُ الانتظار، وخطةُ الموجة. وبقيت **الشاشة** — وهي أظهر سطحٍ في القاعة —
 * والبوابةُ واقتراحُ الموازنة تحسب بقيمة الإعداد. فلجنةٌ قُدّرت بثمان وهي تأخذ خمس عشرة
 * كانت تُعلن على الجدار انتظارًا أقصر من الواقع بالضعف، ويُرسل إليها الواصلُ لأنها تبدو
 * «أخفّ»، ويُقترح النقل إليها لأن فجوتها تبدو صغيرة.
 *
 * وهذه ثغرةٌ لا تظهر في أي اختبار وحدة: كل وحدةٍ صحيحة، والخطأ في ما يُمرَّر إليها.
 * فالحراسة هنا على **موضع التمرير** نفسه.
 */

/** الكود دون التعليقات: شرحٌ يذكر `globalState.committees` ليس استعمالًا له. */
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const body = codeOnly(store);
/** جسمُ نداءٍ بعينه: من اسم الدالة إلى إغلاق الأقواس المتوازن. */
const callBody = (needle: string) => {
  const at = body.indexOf(needle);
  assert.ok(at > 0, `${needle} must exist in the store`);
  let depth = 0;
  for (let i = at; i < body.length; i++) {
    if (body[i] === '(') depth++;
    else if (body[i] === ')') { depth--; if (depth === 0) return body.slice(at, i + 1) }
  }
  return body.slice(at);
};

test('the measured tempo exists as one helper, not copied at each call site', () => {
  assert.match(body, /const atMeasuredTempo = \(list: Committee\[\]/, 'one place decides what a panel’s minute is');
  assert.match(body, /const committeesAtMeasuredTempo = \(\) => atMeasuredTempo\(globalState\.committees\)/);
});

test('what the hall screens show is built from the measured tempo', () => {
  /* أظهرُ رقمٍ في القاعة، وأكثرُ ما يُبنى عليه قرارُ الناس: يبقى أو يخرج. */
  const call = callBody('buildDisplayBoard(');
  assert.match(call, /committees: committeesAtMeasuredTempo\(\)/);
  assert.doesNotMatch(call, /committees: globalState\.committees/, 'the raw configured minutes must not reach a screen');
});

test('the gate picks the lightest panel by measured minutes, not configured ones', () => {
  /* وإلّا أرسل الواصلَ إلى أثقل لجنةٍ وهو يحسب أنه أراحه. */
  const call = callBody('decideArrival(');
  assert.match(call, /eligibleCommittees: found \? atMeasuredTempo\(/);
  assert.match(call, /fallbackCommittees: found\s*\?\s*atMeasuredTempo\(/);
});

test('the balance recommendation measures its gap in real minutes', () => {
  const at = body.indexOf('const recommendCommitteeElasticity');
  const fn = body.slice(at, body.indexOf('const decideCommitteeElasticity', at));
  assert.match(fn, /const active=atMeasuredTempo\(/, 'ranking panels by a wrong minute proposes the wrong move');
  assert.doesNotMatch(fn, /'average session duration'/, 'and the audit line must not claim a configured value was checked');
});

test('the three consumers that were already wired stay wired', () => {
  assert.match(callBody('planDistribution('), /committees: committeesAtMeasuredTempo\(\)/);
  assert.match(body, /const measured=tempoMinutes\(\);/, 'the participant’s own estimate reads the measured tempo');
});
