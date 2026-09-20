import test from 'node:test';
import assert from 'node:assert/strict';

import { diffOptionsForGate, diffRecitation, heardNothing, judgeRecitation, DEFAULT_DIFF_OPTIONS, type ExpectedWord, type HeardWord } from '../src/lib/recitation-diff';
import { quranSkeleton, quranVoweled, sameWord } from '../src/lib/quran-orthography';
import { loadIslamwebReadingPackage } from '../server/islamweb-reading-packages';
import { splitAyahWords } from '../server/practice-face-service';

/*
 * أوّلُ وحدةٍ في هذا النظام تقول «أخطأت» — فتُحرس بما لا يُحرس به وصف.
 *
 * والخطرُ الأكبرُ ليس أن يفوتها خطأ، بل أن **تُخطّئ مصيبًا**. وأشدُّ صورِه أن يُقاس
 * قارئُ روايةٍ بمسطرة رواية أخرى.
 */

const expectedOf = (texts: string[]): ExpectedWord[] => texts.map((text, index) => ({ index, text }));
const heardOf = (texts: string[], confidence = 0.95): HeardWord[] => texts.map(text => ({ text, confidence }));

const FATIHA = ['ٱلۡحَمۡدُ', 'لِلَّهِ', 'رَبِّ', 'ٱلۡعَٰلَمِينَ'];

test('تلاوةٌ مطابقةٌ لا تُخرج خطأً واحدًا', () => {
  const diff = diffRecitation(expectedOf(FATIHA), heardOf(FATIHA));
  assert.deepEqual(diff.mistakes, [], `أخطاءٌ في تلاوةٍ صحيحة: ${JSON.stringify(diff.mistakes)}`);
  assert.equal(diff.matched, 4);
  assert.equal(diff.withheld, 0);
});

test('هجاءُ المحرّك غيرُ هجاء المصحف — ولا يُعدّ ذلك خطأً', () => {
  /*
   * فالمحرّكُ الصوتيّ يكتب بما تعلّم: بلا ألفِ وصلٍ ولا سكونٍ عثمانيّ. ولو قُوبل
   * النصُّ خامًا لصارت كلُّ كلمةٍ خطأً.
   */
  const plain = ['الحمد', 'لله', 'رب', 'العالمين'];
  const diff = diffRecitation(expectedOf(FATIHA), heardOf(plain));
  assert.deepEqual(diff.mistakes, [], `الهجاءُ عُدّ خطأً: ${JSON.stringify(diff.mistakes)}`);
  assert.equal(diff.matched, 4);
});

test('كلمةٌ أُسقطت تُعرف بموضعها', () => {
  const diff = diffRecitation(expectedOf(FATIHA), heardOf(['ٱلۡحَمۡدُ', 'رَبِّ', 'ٱلۡعَٰلَمِينَ']));
  assert.equal(diff.mistakes.length, 1, JSON.stringify(diff.mistakes));
  assert.equal(diff.mistakes[0].kind, 'skipped');
  assert.equal(diff.mistakes[0].wordIndex, 1);
  assert.equal(diff.mistakes[0].expected, 'لِلَّهِ');
});

test('كلمةٌ أُبدلت بغيرها تُعرف، ويُقال ما سُمع', () => {
  const diff = diffRecitation(expectedOf(FATIHA), heardOf(['ٱلۡحَمۡدُ', 'لِلَّهِ', 'مَٰلِكِ', 'ٱلۡعَٰلَمِينَ']));
  assert.equal(diff.mistakes.length, 1, JSON.stringify(diff.mistakes));
  assert.equal(diff.mistakes[0].kind, 'substituted');
  assert.equal(diff.mistakes[0].wordIndex, 2);
  assert.equal(diff.mistakes[0].heard, 'مَٰلِكِ');
});

test('كلمةٌ زِيدت لا أصلَ لها تُعرف بلا موضع', () => {
  const diff = diffRecitation(expectedOf(FATIHA), heardOf(['ٱلۡحَمۡدُ', 'لِلَّهِ', 'ٱلرَّحۡمَٰنِ', 'رَبِّ', 'ٱلۡعَٰلَمِينَ']));
  const added = diff.mistakes.filter(m => m.kind === 'added');
  assert.equal(added.length, 1, JSON.stringify(diff.mistakes));
  assert.equal(added[0].wordIndex, null);
  assert.equal(added[0].heard, 'ٱلرَّحۡمَٰنِ');
});

test('⚠ الحركةُ لا تُكشف إلا بإذنٍ صريح', () => {
  /*
   * وهذا أثقلُ حارسٍ هنا. قِيس بين حفصٍ وورش: الهيكلُ يتّفق في ٩٧٫٣٪ من الكلمات،
   * والحركةُ في ٤٢٫١٪ وحدها. فمن كشف الحركةَ بمحرّكٍ لم يسمع إلا روايةً واحدة، خطّأ
   * قارئَ غيرها في أكثر من نصف كلماته الصحيحة.
   */
  const withVowelSlip = ['ٱلۡحَمۡدَ', 'لِلَّهِ', 'رَبِّ', 'ٱلۡعَٰلَمِينَ'];
  assert.equal(sameWord(FATIHA[0], withVowelSlip[0]), true, 'العيّنةُ لا تقيس ما وُضعت له: الكلمةُ نفسُها');
  assert.notEqual(quranVoweled(FATIHA[0]), quranVoweled(withVowelSlip[0]), 'العيّنةُ لا تختلف في الحركة أصلًا');

  const silent = diffRecitation(expectedOf(FATIHA), heardOf(withVowelSlip));
  assert.deepEqual(silent.mistakes, [], 'كُشفت الحركةُ بلا إذن');
  assert.equal(silent.withheld, 0, 'حُجب شيءٌ ولم يُفتح البابُ أصلًا');

  const allowed = diffRecitation(expectedOf(FATIHA), heardOf(withVowelSlip), { detectTashkeel: true });
  assert.equal(allowed.mistakes.length, 1, JSON.stringify(allowed.mistakes));
  assert.equal(allowed.mistakes[0].kind, 'tashkeel');
  assert.equal(allowed.mistakes[0].wordIndex, 0);
});

test('⚠ ولا يُقاس قارئُ روايةٍ بنصّ رواية أخرى — والعددُ يُقاس لا يُقدَّر', () => {
  /*
   * يُحاكى هنا الخطرُ بعينه: قارئُ ورشٍ يقرأ **صوابًا**، والنصُّ المقابَلُ به نصُّ
   * حفص. فإن فُتح كشفُ الحركة امتلأ وجهُه بالخطأ وهو مصيب.
   */
  const wordsOf = (rawi: string, surah: number) => loadIslamwebReadingPackage(rawi).verses
    .filter(v => v.sura_no === surah).sort((a, b) => a.aya_no - b.aya_no)
    .flatMap(v => splitAyahWords(v.aya_text));

  const hafs = wordsOf('hafs', 78).slice(0, 60);
  const warsh = wordsOf('warsh', 78).slice(0, 60);

  const wordLevel = diffRecitation(expectedOf(hafs), heardOf(warsh));
  const tashkeelLevel = diffRecitation(expectedOf(hafs), heardOf(warsh), { detectTashkeel: true });

  /* على مستوى الكلمة: الفرقُ قليل — فالكشفُ متينٌ عبر الروايات. */
  assert.ok(wordLevel.mistakes.length <= 8,
    `أخطاءٌ على مستوى الكلمة: ${wordLevel.mistakes.length} من ${hafs.length} — أكثرُ من المقيس`);

  /* وعلى مستوى الحركة: كارثة. وهذا هو الرقمُ الذي يُغلق البابَ ما لم يُعايَر المحرّك. */
  assert.ok(tashkeelLevel.mistakes.length > wordLevel.mistakes.length * 3,
    `فتحُ الحركة لم يُظهر الخطرَ: ${tashkeelLevel.mistakes.length} مقابل ${wordLevel.mistakes.length}`);
});

test('ما دون عتبة الثقة يُحجب ويُعدّ — ولا يُكتم', () => {
  const unsure = diffRecitation(expectedOf(FATIHA), heardOf(['ٱلۡحَمۡدُ', 'لِلَّهِ', 'مَٰلِكِ', 'ٱلۡعَٰلَمِينَ'], 0.3));
  assert.deepEqual(unsure.mistakes, [], 'قيل حكمٌ بثقةٍ ٠٫٣');
  assert.equal(unsure.withheld, 1, 'حُجب ولم يُعدّ — فلا يُعلم أنّ ثمّة ما لم يُحسم');

  const sure = diffRecitation(expectedOf(FATIHA), heardOf(['ٱلۡحَمۡدُ', 'لِلَّهِ', 'مَٰلِكِ', 'ٱلۡعَٰلَمِينَ'], 0.9));
  assert.equal(sure.mistakes.length, 1);
  assert.equal(sure.withheld, 0);
});

test('صمتٌ تامّ لا يُقرأ «أسقطتَ الوجهَ كلَّه»', () => {
  assert.equal(heardNothing([]), true);
  assert.equal(heardNothing(heardOf(['', '   '])), true);
  assert.equal(heardNothing(heardOf(['ٱلۡحَمۡدُ'])), false);
});

test('العتباتُ الافتراضيّةُ مُعلنةٌ ومحافِظة', () => {
  assert.equal(DEFAULT_DIFF_OPTIONS.detectTashkeel, false, 'كشفُ الحركة مفتوحٌ افتراضًا');
  assert.ok(DEFAULT_DIFF_OPTIONS.minConfidence >= 0.7, `عتبةُ الثقة ${DEFAULT_DIFF_OPTIONS.minConfidence} متساهلة`);
  assert.ok(DEFAULT_DIFF_OPTIONS.minTashkeelConfidence > DEFAULT_DIFF_OPTIONS.minConfidence,
    'حكمُ الحركة لا يلزمه يقينٌ أشدُّ من حكم الكلمة');
  /*
   * وأوّلُ صياغةٍ حطّت ثقةَ الحركة بمعاملٍ ثمّ قاستها بعتبة الكلمة، فلزمها يقينٌ
   * يفوق الواحد — فكانت ميزةً ميتةً وشيفرتُها حاضرة. فيُقاس أنّها قابلةٌ للبلوغ.
   */
  assert.ok(DEFAULT_DIFF_OPTIONS.minTashkeelConfidence <= 1, 'عتبةُ الحركة لا يبلغها يقينٌ أصلًا');
});

test('والهيكلُ لا يطمس فرقًا حقيقيًّا بين روايتين', () => {
  /* إبدالُ الهمزة في ورشٍ نطقٌ مختلفٌ لا رسمٌ مختلف، فيبقى كلمتين. */
  assert.equal(sameWord('يُؤۡمِنُونَ', 'يُومِنُونَ'), false, 'طُمس فرقُ نطقٍ حقيقيّ');
  /* وألفُ الوصل والياءُ البرّيّة رسمان لمنطوقٍ واحد، فيُوحَّدان. */
  assert.equal(sameWord('ٱلۡحَمۡدُ', 'اِ۬لْحَمْدُ'), true);
  assert.equal(sameWord('فِي', 'فِے'), true);
  assert.equal(quranSkeleton('ٱلرَّحۡمَٰنِ'), 'الرحمن');
});


/* ── لا يُحكم إلا بإذن ────────────────────────────────────────────────────── */

const OPEN = { word: 'OPEN', tashkeel: 'OPEN' } as const;
const WORD_ONLY = { word: 'OPEN', tashkeel: 'CLOSED' } as const;
const SHUT = { word: 'CLOSED', tashkeel: 'CLOSED' } as const;

test('بابٌ مغلقٌ يعيد لا شيء — لا «لا أخطاء»', () => {
  /*
   * والفرقُ بينهما هو الفرقُ بين «لم يُحكم» و«حُكم فلم يُوجد خطأ». ولو أعاد تقريرًا
   * فارغًا لقرأته الشاشةُ طمأنينةً لا سندَ لها، وقالت لطالبٍ لم يُسمع له «أحسنتَ».
   */
  const wrong = heardOf(['ٱلۡحَمۡدُ', 'لِلَّهِ', 'رَبِّ', 'ٱلنَّاسِ']);
  assert.equal(judgeRecitation(expectedOf(FATIHA), wrong, SHUT), null);
  const judged = judgeRecitation(expectedOf(FATIHA), wrong, WORD_ONLY);
  assert.ok(judged, 'بابُ الكلمة مفتوحٌ فيجب أن يُحكم');
  assert.equal(judged!.mistakes.length, 1);
  assert.equal(judged!.mistakes[0].kind, 'substituted');
});

test('صمتٌ تامٌّ لا يُقرأ «أسقطتَ الوجهَ كلَّه»', () => {
  assert.equal(judgeRecitation(expectedOf(FATIHA), heardOf(['', '   ']), OPEN), null);
  assert.equal(judgeRecitation(expectedOf(FATIHA), [], OPEN), null);
});

test('إذنُ الحركة وحدَه هو ما يفتح حكمَ الحركة', () => {
  /* كلمةٌ واحدةٌ يختلف شكلُها ويتّفق هيكلُها — فلا يراها إلا مَن أُذن له. */
  const heard = [{ text: 'ٱلۡحَمۡدَ', confidence: 0.99 }, ...heardOf(FATIHA.slice(1), 0.99)];
  assert.equal(diffOptionsForGate(WORD_ONLY).detectTashkeel, false);
  assert.equal(diffOptionsForGate(OPEN).detectTashkeel, true);
  assert.deepEqual(judgeRecitation(expectedOf(FATIHA), heard, WORD_ONLY)!.mistakes, []);
  const strict = judgeRecitation(expectedOf(FATIHA), heard, OPEN)!;
  assert.equal(strict.mistakes.length, 1);
  assert.equal(strict.mistakes[0].kind, 'tashkeel');
});

test('العتباتُ تُنقل كما هي ولا تُخترع عند الإذن', () => {
  const options = diffOptionsForGate(OPEN, DEFAULT_DIFF_OPTIONS);
  assert.equal(options.minConfidence, DEFAULT_DIFF_OPTIONS.minConfidence);
  assert.equal(options.minTashkeelConfidence, DEFAULT_DIFF_OPTIONS.minTashkeelConfidence);
});
