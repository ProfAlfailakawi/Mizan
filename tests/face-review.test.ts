/*
 * ما يُقال للطالب حين لا يُحكم عليه.
 *
 * فبوّابةُ الحكم مغلقةٌ افتراضًا، وإغلاقُها ليس عيبًا يُخفى: **الصمتُ عن خطئه ليس
 * شهادةً بصوابه**. فيُقال له بأيّ سببٍ سُكت عنه، بلغةٍ يفهمها لا برمزٍ داخليّ.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { judgingNote } from '../src/lib/face-review';

const gate = (word: 'OPEN' | 'CLOSED', reasons: string[] = []) => ({ word, reasons });

test('بابٌ مفتوحٌ لا يُقال عنه شيء — يُرى بأثره على الوجه', () => {
  assert.equal(judgingNote(gate('OPEN'), true), undefined);
  assert.equal(judgingNote(null, true), undefined);
});

test('ولكلّ سببِ إغلاقٍ قولُه — ولا يُعرض رمزٌ داخليّ في وجه طالب', () => {
  const cases: [string, RegExp][] = [
    ['ASR_BACKEND_NOT_CONFIGURED', /غيرُ مهيّأ/],
    ['QURAN_INTELLIGENCE_NOT_CONFIGURED', /غيرُ مهيّأ/],
    ['ASR_BENCHMARK_OTHER_RIWAYAH', /روايتك/],
    ['DATASET_OTHER_RIWAYAH', /روايتك/],
    ['ASR_BENCHMARK_NOT_AVAILABLE', /لم يجتز/],
    ['WORD_ERROR_RATE', /لم يجتز/],
    ['MISSING_SLICE_CHILD', /لم يجتز/],
    ['THRESHOLDS_NOT_DUAL_APPROVED', /لم يجتز/],
  ];
  for (const [reason, expected] of cases) {
    const note = judgingNote(gate('CLOSED', [reason]), true);
    assert.ok(note, `${reason}: بلا بيان`);
    assert.match(note!, expected, `${reason}: ${note}`);
    assert.equal(/[A-Z_]{6,}/.test(note!), false, `${reason}: رمزٌ داخليٌّ في وجه الطالب — ${note}`);
  }
});

test('وسببٌ لا يُعرف يُقال عنه الحقُّ عامًّا، ولا يُسكت', () => {
  const note = judgingNote(gate('CLOSED', ['SOMETHING_NEW_ENTIRELY']), true);
  assert.ok(note && note.includes('مغلقٌ الآن'), note);
});

test('والإنجليزيّةُ تُقال كما تُقال العربيّة', () => {
  for (const reason of ['ASR_BACKEND_NOT_CONFIGURED', 'ASR_BENCHMARK_OTHER_RIWAYAH', 'WORD_ERROR_RATE']) {
    const note = judgingNote(gate('CLOSED', [reason]), false);
    assert.ok(note && /[a-z]/.test(note), `${reason}: ${note}`);
  }
});

test('انقطاعُ السماع يُقال للطالب، ولا يُسكت عنه', () => {
  /*
   * فمقطعٌ لم يصل يترك ثقبًا فيما سُمع، والمقابلةُ تقرأ الثقبَ إسقاطًا. فيُطرح الحكمُ
   * كلُّه — وسكوتٌ عن خطأٍ أهونُ من تخطئةِ مصيب — ويُقال للطالب لماذا سُكت عنه.
   */
  const lost = judgingNote(gate('OPEN'), true, true);
  assert.ok(lost && lost.includes('انقطع سماع'), `لم يُقل الانقطاع: ${lost}`);
  assert.ok(lost!.includes('فلم يُحكم'), 'لم يُقل إنّه لم يُحكم');
  /* ويسبق كلَّ سببٍ آخر: بابٌ مفتوحٌ وقع فيه انقطاعٌ يُقال عنه الانقطاع. */
  assert.equal(judgingNote(gate('OPEN'), true), undefined);
  assert.ok(judgingNote(null, true, true)!.includes('انقطع سماع'));
  assert.ok(judgingNote(gate('CLOSED', ['WORD_ERROR_RATE']), true, true)!.includes('انقطع سماع'));
});

test('وتبدّلُ القياس أثناء التلاوة يُقال بسببه — لا يُسمّى انقطاعًا', () => {
  const changed = judgingNote(gate('OPEN'), true, 'changed');
  assert.ok(changed && changed.includes('تغيّر محرّكُ السماع'), `لم يُقل التبدّل: ${changed}`);
  assert.ok(changed!.includes('فلم يُحكم'), 'لم يُقل إنّه لم يُحكم');
  assert.equal(changed!.includes('انقطع'), false, 'سُمّي التبدّلُ انقطاعًا');
  assert.ok(/changed/.test(judgingNote(gate('OPEN'), false, 'changed') || ''), 'الإنجليزيّةُ لا تقول التبدّل');
});
