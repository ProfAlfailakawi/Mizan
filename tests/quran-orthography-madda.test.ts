/*
 * المدُّ بعد الهمزة برسمين: «ءَا» في المصحف، و«آ» في الهجاء المعتاد — كلمةٌ واحدة.
 *
 * قِيس في متصفّحٍ حقيقيّ على سورة الرحمن: المحرّكُ كتب «آلاء» صحيحة، فعُلّمت «ءالاء» على
 * الوجه خطأً في كلّ لازمة. وفي حفصٍ ١٠٧٥ كلمةً من هذا الرسم في ٩٤٢ آية.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { quranSkeleton, sameWord } from '../src/lib/quran-orthography';
import { diffRecitation, DEFAULT_DIFF_OPTIONS } from '../src/lib/recitation-diff';

const SAME: [string, string][] = [
  ['ءَالَآءِ', 'آلَاءِ'],
  ['ءَامَنُوا۟', 'آمَنُوا'],
  ['ٱلْقُرْءَانَ', 'الْقُرْآنَ'],
  ['ءَايَٰتِ', 'آيَاتِ'],
  ['ءَايَةً', 'آيَةً'],
  ['ءَادَمَ', 'آدَمَ'],
  ['ءَالِهَةً', 'آلِهَةً'],
];

test('hamza-then-alif in the Mushaf and the madda alif of ordinary spelling are one word', () => {
  for (const [mushaf, spelled] of SAME) {
    assert.ok(sameWord(mushaf, spelled), `${mushaf} ≠ ${spelled}: ${quranSkeleton(mushaf)} / ${quranSkeleton(spelled)}`);
  }
});

test('the unification does not blind the comparison to a real change', () => {
  assert.equal(sameWord('رَبِّ', 'رَبِّي'), false, 'an added ya is a different word');
  assert.equal(sameWord('ءَامَنُوا۟', 'آمَنَ'), false, 'a dropped suffix is a different word');
  assert.equal(sameWord('ءَالَآءِ', 'آلَى'), false, 'a mis-heard word stays mis-heard');
});

test('a correct refrain of Ar-Rahman is judged correct', () => {
  const expected = ['فَبِأَىِّ', 'ءَالَآءِ', 'رَبِّكُمَا', 'تُكَذِّبَانِ'].map((text, index) => ({ index, text }));
  const heard = ['فَبِأَيِّ', 'آلَاءِ', 'رَبِّكُمَا', 'تُكَذِّبَانِ'].map(text => ({ text, confidence: 0.95 }));
  const diff = diffRecitation(expected, heard, { ...DEFAULT_DIFF_OPTIONS, detectTashkeel: false });
  assert.deepEqual(diff.mistakes, [], JSON.stringify(diff.mistakes));
});
