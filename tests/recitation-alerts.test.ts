/*
 * التنبيهُ بالصوت — ومتى يجب أن يسكت.
 *
 * وأخطرُ ما في هذه الطبقة أنّ الميكروفونَ في شاشة «المصحفُ يسمعك» **خام**: يُطلب
 * بلا إلغاءِ صدًى ولا كبتِ ضجيجٍ ولا ضبطِ كسب، عمدًا، كي يصل المحرّكَ صوتُ الطالب.
 * فنغمةٌ تخرج من السمّاعة يلتقطها الميكروفونُ نفسُه وتُرسَل إلى محرّك التعرّف —
 * فيعود «كلمةً زائدة». أي أنّ التنبيهَ على خطأٍ **يصنع خطأً**. وهذا ما تحرسه أكثرُ
 * هذه الاختبارات.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ALERT_ECHO_MARGIN_MS, ALERT_MIN_GAP_MS, ALERT_TONE, ALERT_TONE_MS, EMPTY_ALERT_MEMORY, SOUNDED_MISTAKES,
  alertWindow, createAlertSpeaker, dropWordsUnderAlert, planAlert, planAlertForJudgment, toneDurationMs,
  type AlertMemory,
} from '../src/lib/recitation-alerts';
import type { Mistake, RecitationDiff } from '../src/lib/recitation-diff';

const mistake = (over: Partial<Mistake> = {}): Mistake =>
  ({ kind: 'skipped', wordIndex: 3, expected: 'رَبِّ', confidence: 0.9, ...over });

test('a real mistake is sounded once, and never twice in one attempt', () => {
  const first = planAlert([mistake()], EMPTY_ALERT_MEMORY, 10_000);
  assert.ok(first.sound, 'the first mistake must be heard');
  assert.equal(first.sound!.wordIndex, 3);
  /* والوقتُ يمضي حتى تنقضي المهلة، ثمّ يُسأل عن الموضع نفسِه. */
  const again = planAlert([mistake()], first.memory, 10_000 + ALERT_MIN_GAP_MS * 3);
  assert.equal(again.sound, null, 'the same word must not sound twice');
});

test('two mistakes in quick succession do not become a siren', () => {
  const first = planAlert([mistake({ wordIndex: 1 })], EMPTY_ALERT_MEMORY, 5_000);
  assert.ok(first.sound);
  const tooSoon = planAlert([mistake({ wordIndex: 2 })], first.memory, 5_000 + ALERT_MIN_GAP_MS - 1);
  assert.equal(tooSoon.sound, null, 'inside the gap nothing sounds');
  assert.deepEqual(tooSoon.memory, first.memory, 'and the word is not marked as announced');
  const later = planAlert([mistake({ wordIndex: 2 })], first.memory, 5_000 + ALERT_MIN_GAP_MS);
  assert.ok(later.sound, 'once the gap has passed it is heard');
  assert.equal(later.sound!.wordIndex, 2);
});

test('the throttle delays a word, it does not swallow it', () => {
  /*
   * ولو عُدّ الموضعُ «نُبِّه عليه» وهو لم يُسمع، لسكت عنه إلى آخر المحاولة — وذلك
   * أسوأُ من صفّارة: خطأٌ وقع ولم يُقل.
   */
  const first = planAlert([mistake({ wordIndex: 1 })], EMPTY_ALERT_MEMORY, 0);
  const blocked = planAlert([mistake({ wordIndex: 9 })], first.memory, 100);
  assert.equal(blocked.sound, null);
  const heard = planAlert([mistake({ wordIndex: 9 })], blocked.memory, ALERT_MIN_GAP_MS + 1);
  assert.equal(heard.sound!.wordIndex, 9);
});

test('tashkeel and an added word are shown, never sounded', () => {
  /*
   * فأوّلُهما أكثرُ ما يُخطئ بين الروايات — ٥٨٪ من حركات قارئ ورشٍ تُخطَّأ بنصّ
   * حفصٍ — وثانيهما أكثرُ ما يأتي من ضجيج المحرّك. ويبقيان على الوجه مكتوبين.
   */
  assert.deepEqual([...SOUNDED_MISTAKES], ['skipped', 'substituted']);
  for (const kind of ['tashkeel', 'added'] as const) {
    const plan = planAlert([mistake({ kind, wordIndex: kind === 'added' ? null : 4 })], EMPTY_ALERT_MEMORY, 1_000);
    assert.equal(plan.sound, null, `${kind} must not sound`);
  }
});

test('a mistake with no place on the page is not sounded', () => {
  assert.equal(planAlert([mistake({ wordIndex: null })], EMPTY_ALERT_MEMORY, 1_000).sound, null);
});

test('nothing sounds when nothing was judged', () => {
  /* حارسُ بناء: بلا إذنٍ يعيد الحكمُ `null`، وهذا البابُ يقبله ويسكت. */
  assert.equal(planAlertForJudgment(null, EMPTY_ALERT_MEMORY, 1_000).sound, null);
  const judged = { mistakes: [mistake()], matched: 3, expectedCount: 4, heardCount: 3, withheld: 0 } as RecitationDiff;
  assert.ok(planAlertForJudgment(judged, EMPTY_ALERT_MEMORY, 1_000).sound, 'and a real judgment does sound');
});

test('what the microphone heard under the tone is thrown away before judging', () => {
  /*
   * وهذا هو القيدُ الذي يجعل التنبيهَ ممكنًا أصلًا على ميكروفونٍ خام. ولولاه لعاد
   * صدى النغمة «كلمةً زائدة»، فيُنبَّه عليها، فتُصنع نغمةٌ أخرى — دورةٌ لا تنتهي.
   */
  const windows = [alertWindow(2_000)];
  const words = [
    { text: 'رب', confidence: 0.9, startMs: 1_000, endMs: 1_400 },
    { text: 'شششش', confidence: 0.3, startMs: 1_950, endMs: 2_100 },
    { text: 'العالمين', confidence: 0.95, startMs: 3_000, endMs: 3_500 },
  ];
  const { kept, dropped, untimed } = dropWordsUnderAlert(words, windows);
  assert.deepEqual(kept.map(w => w.text), ['رب', 'العالمين']);
  assert.deepEqual(dropped.map(w => w.text), ['شششش']);
  assert.equal(untimed, 0);
});

test('the window is wider than the tone, on both sides', () => {
  const w = alertWindow(1_000);
  assert.equal(w.startMs, 1_000 - ALERT_ECHO_MARGIN_MS);
  assert.equal(w.endMs, 1_000 + ALERT_TONE_MS + ALERT_ECHO_MARGIN_MS);
  assert.ok(ALERT_ECHO_MARGIN_MS > 0, 'a window exactly as long as the tone leaves its tail in the audio');
});

test('a word with no timing is kept, and the loss of the guard is counted', () => {
  /* ولا يُطرح ما لا يُعرف موضعُه من الزمن: ذلك طرحٌ بالظنّ. */
  const { kept, dropped, untimed } = dropWordsUnderAlert(
    [{ text: 'رب', confidence: 0.9 }, { text: 'العالمين', confidence: 0.9, startMs: 1_900, endMs: 2_000 }],
    [alertWindow(2_000)],
  );
  assert.deepEqual(kept.map(w => w.text), ['رب']);
  assert.deepEqual(dropped.map(w => w.text), ['العالمين']);
  assert.equal(untimed, 1, 'and the caller can see the guard did not apply to one word');
});

test('with no tone played, nothing is thrown away', () => {
  const words = [{ text: 'رب', confidence: 0.9, startMs: 0, endMs: 100 }];
  const out = dropWordsUnderAlert(words, []);
  assert.deepEqual(out.kept, words);
  assert.deepEqual(out.dropped, []);
});

test('the tone length is derived from the tone, not written twice', () => {
  assert.equal(ALERT_TONE_MS, toneDurationMs(ALERT_TONE));
  assert.equal(ALERT_TONE_MS, ALERT_TONE.reduce((n, s) => n + s.durationMs, 0));
  assert.ok(ALERT_TONE.every(s => s.gain > 0 && s.gain <= 0.2), 'an alert is a nudge, not a shout');
});

test('the speaker schedules the tone it was given, and survives a browser with no audio', () => {
  const started: { frequency: number; start: number; stop: number }[] = [];
  let closed = 0, resumed = 0;
  class FakeOscillator {
    type = ''; frequency = { value: 0 }; private from = 0;
    connect() {}
    start(at: number) { this.from = at }
    stop(at: number) { started.push({ frequency: this.frequency.value, start: this.from, stop: at }) }
  }
  class FakeContext {
    destination = {}; currentTime = 0; state = 'suspended';
    async resume() { resumed += 1; this.state = 'running' }
    async close() { closed += 1 }
    createGain() { return { gain: { value: 0 }, connect() {} } }
    createOscillator() { return new FakeOscillator() }
  }
  const speaker = createAlertSpeaker(FakeContext as never);
  speaker.play();
  assert.equal(started.length, ALERT_TONE.length);
  assert.equal(started[0].frequency, ALERT_TONE[0].frequencyHz);
  assert.equal(Math.round((started[0].stop - started[0].start) * 1000), ALERT_TONE[0].durationMs);
  assert.equal(resumed, 1, 'a suspended context is resumed, or the alert is silent while looking alive');
  speaker.close();
  assert.equal(closed, 1);

  /* ومتصفّحٌ بلا صوتٍ لا يُسقط التلاوة. */
  const deaf = createAlertSpeaker(undefined);
  assert.doesNotThrow(() => { deaf.play(); deaf.close() });
});
