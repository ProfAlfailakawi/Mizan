/*
 * قِيس على الموقع الحيّ بعد #283 (العفاسي، الوجه ٥٣٢ وحده، كما يقرؤه الطالب):
 *
 * ـ وقفت جبهةُ السماع عند الآية ٣٦، فبقيت ٣١ كلمةً إلى آخر الوجه لا تُعلَّم وقد قيلت: المحرّكُ
 *   يخطئ سماعَ اللازمة («آلاكما»، «بكما»، «يذبكما»)، فعُدّ خطؤه فجواتٍ، ولم تأتِ ستُّ كلماتٍ
 *   صحيحةٍ متّصلةٌ تفتح القفزة.
 * ـ و«يَٰمَعۡشَرَ» عُلّمت «سُمع غيرُها» والمحرّكُ سمع «يَا مَعْشَرَ» صحيحة.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { LIKENESS_FLOOR, followFrontier } from '../src/lib/live-judging';
import { wordLikeness } from '../src/lib/quran-orthography';
import { DEFAULT_DIFF_OPTIONS, diffRecitation } from '../src/lib/recitation-diff';

const exp = (words: string[]) => words.map((text, index) => ({ index, text }));
const said = (words: string[]) => words.map(text => ({ text, confidence: 0.95 }));

test('the vocative «يا», joined in the Mushaf and apart in speech, is one word', () => {
  for (const [page, heard] of [
    [['يَٰمَعۡشَرَ', 'ٱلۡجِنِّ', 'وَٱلۡإِنسِ'], ['يَا', 'مَعْشَرَ', 'الْجِنِّ', 'وَالْإِنْسِ']],
    [['يَٰٓأَيُّهَا', 'ٱلَّذِينَ', 'ءَامَنُوا۟'], ['يَا', 'أَيُّهَا', 'الَّذِينَ', 'آمَنُوا']],
    [['قَالَ', 'يَٰقَوۡمِ', 'ٱعۡبُدُوا۟'], ['قَالَ', 'يَا', 'قَوْمِ', 'اعْبُدُوا']],
  ] as [string[], string[]][]) {
    const diff = diffRecitation(exp(page), said(heard));
    assert.deepEqual(diff.mistakes, [], `${heard.join(' ')}: ${JSON.stringify(diff.mistakes)}`);
    assert.equal(diff.matched, page.length);
    /* ورسمُ الموصولة غيرُ هجائها بالضرورة: لا يُسأل فيها عن حركة. */
    const vowels = diffRecitation(exp(page), said(heard), { ...DEFAULT_DIFF_OPTIONS, detectTashkeel: true, minTashkeelConfidence: 0 });
    const joinedAt = page.findIndex(w => w.startsWith('يَٰ'));
    assert.equal(vowels.mistakes.some(m => m.wordIndex === joinedAt), false, JSON.stringify(vowels.mistakes));
  }
});

test('a «يا» that joins nothing on the page is still an added word', () => {
  const diff = diffRecitation(exp(['قَالَ', 'رَبِّ']), said(['يَا', 'قَالَ', 'رَبِّ']));
  assert.deepEqual(diff.mistakes.map(m => m.kind), ['added']);
});

test('a misheard word resembles the word; a word from another ayah does not', () => {
  assert.ok(wordLikeness('رَبِّكُمَا', 'بِكُمَا') > LIKENESS_FLOOR);
  assert.ok(wordLikeness('رَبِّكُمَا', 'يُذْبِكُمَا') > LIKENESS_FLOOR);
  assert.ok(wordLikeness('مِنْهُمَا', 'مِنْهُمْ') > LIKENESS_FLOOR);
  assert.ok(wordLikeness('ٱلثَّقَلَانِ', 'الثَّقَلَةِ') > LIKENESS_FLOOR);
  assert.ok(wordLikeness('مَرَجَ', 'أَلَّا') < LIKENESS_FLOOR);
  assert.ok(wordLikeness('ٱلْبَحْرَيْنِ', 'تَطْغَوْا') < LIKENESS_FLOOR);
});

/* الرحمن ٣٢–٣٧ برسم المصحف، وما سمعه المحرّكُ منها في الجولة الحيّة. */
const PAGE = ['فَبِأَيِّ', 'ءَالَآءِ', 'رَبِّكُمَا', 'تُكَذِّبَانِ',
  'يَٰمَعۡشَرَ', 'ٱلۡجِنِّ', 'وَٱلۡإِنسِ', 'إِنِ', 'ٱسۡتَطَعۡتُمۡ', 'أَن', 'تَنفُذُوا۟', 'مِنۡ', 'أَقۡطَارِ', 'ٱلسَّمَٰوَٰتِ', 'وَٱلۡأَرۡضِ', 'فَٱنفُذُوا۟', 'لَا', 'تَنفُذُونَ', 'إِلَّا', 'بِسُلۡطَٰنٖ',
  'فَبِأَيِّ', 'ءَالَآءِ', 'رَبِّكُمَا', 'تُكَذِّبَانِ',
  'يُرۡسَلُ', 'عَلَيۡكُمَا', 'شُوَاظٞ', 'مِّن', 'نَّارٖ', 'وَنُحَاسٞ', 'فَلَا', 'تَنتَصِرَانِ',
  'فَبِأَيِّ', 'ءَالَآءِ', 'رَبِّكُمَا', 'تُكَذِّبَانِ',
  'فَإِذَا', 'ٱنشَقَّتِ', 'ٱلسَّمَآءُ', 'فَكَانَتۡ', 'وَرۡدَةٗ', 'كَٱلدِّهَانِ'];
const HEARD = ['فَبِأَيِّ', 'آلَتِ', 'يُذْبِكُمَا', 'تُكَذِّبَانِ',
  'يَا', 'مَعْشَرَ', 'الْجِنِّ', 'وَالْإِنْسِ', 'إِنْ', 'اسْتَطَعْتُمْ', 'أَنْ', 'تَنْفُذُوا', 'مِنْ', 'أَقْطَارِ', 'السَّمَاوَاتِ', 'وَالْأَرْضِ', 'فَانْفُذُوا', 'لَا', 'تَنْفُذُونَ', 'إِلَّا', 'بِسُلْطَانٍ',
  'فَبِأَيِّ', 'آلَى', 'بِكُمَا', 'تُكَذِّبَانِ',
  'يُرْسَلُ', 'عَلَيْكُمَا', 'شُوَاظٌ', 'نَارٍ', 'وَنُحَاسٌ', 'فَلَا', 'تَنْتَصِرَانِ',
  'إِرَبِّكُمَا', 'تُكَذِّبَانِ',
  'فَإِذَا', 'انْشَقَّتِ', 'السَّمَاءُ', 'فَكَانَتْ', 'وَرْدَةً', 'كَالدِّهَانِ'];

test('word following reaches the end of the face through the recogniser\'s refrain errors', () => {
  let trusted = -1;
  for (let n = 1; n <= HEARD.length; n += 1) trusted = Math.max(trusted, followFrontier(exp(PAGE), said(HEARD.slice(0, n)), trusted));
  assert.ok(trusted >= PAGE.length - 2, `the frontier stopped at ${trusted} of ${PAGE.length - 1} — words said are never marked`);
});

test('words from another ayah still cannot carry the frontier onto a refrain', () => {
  /* الرحمن ١٩–٢١ على الوجه؛ والمسموع الآيةُ ١٢ (ليست على الوجه) ثمّ لازمةُ الآية ١٣. */
  const face = ['مَرَجَ', 'ٱلْبَحْرَيْنِ', 'يَلْتَقِيَانِ', 'بَيْنَهُمَا', 'بَرْزَخٌ', 'لَّا', 'يَبْغِيَانِ', 'فَبِأَيِّ', 'ءَالَآءِ', 'رَبِّكُمَا', 'تُكَذِّبَانِ'];
  const heard = ['وَالْحَبُّ', 'ذُو', 'الْعَصْفِ', 'وَالرَّيْحَانُ', 'فَبِأَيِّ', 'آلَاءِ', 'رَبِّكُمَا', 'تُكَذِّبَانِ'];
  let trusted = -1;
  for (let n = 1; n <= heard.length; n += 1) trusted = Math.max(trusted, followFrontier(exp(face), said(heard.slice(0, n)), trusted));
  assert.ok(trusted < 7, `the refrain at 21 was reached from ayah 12 (frontier ${trusted})`);
});
