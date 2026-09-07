import test from 'node:test';
import assert from 'node:assert/strict';
import { CUE_PHRASES_AR, cueTextAllowed } from '../server/cue-tts';
import { TRANSITION_PHRASES_AR } from '../src/lib/judging-integrity';

test('server and client stop-cue phrase lists stay identical', () => {
  // العميل يطلب النطق بنص العبارة؛ لو انحرفت القائمتان لصار كل طلب خارج قائمة الخادم.
  assert.deepEqual(CUE_PHRASES_AR, TRANSITION_PHRASES_AR);
});

test('every shipped stop cue passes the synthesis guard', () => {
  for (const phrase of CUE_PHRASES_AR) assert.equal(cueTextAllowed(phrase), true, phrase);
});

test('the guard refuses anything that is not a short Arabic cue', () => {
  assert.equal(cueTextAllowed(''), false);
  assert.equal(cueTextAllowed('   '), false);
  // نص طويل ليس عبارة إيقاف
  assert.equal(cueTextAllowed('كلمة '.repeat(30)), false);
  // علامات مصحفية ⇒ رفض قاطع، فلا يمر نص قرآني إلى محرك النطق
  assert.equal(cueTextAllowed('الحمد لله رب العالمين ۝'), false);
  assert.equal(cueTextAllowed('﴿ الحمد لله ﴾'), false);
  // لاتيني
  assert.equal(cueTextAllowed('Please stop here'), false);
});
