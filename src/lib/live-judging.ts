/*
 * الحكمُ أثناء التلاوة — وما الذي يجعله ممكنًا بلا أن يُخطَّأ مصيب.
 *
 * فمقابلةُ ما سُمع بنصّ الوجه كاملًا وهو في منتصفه تقول: «أسقطتَ كلَّ ما بقي».
 * وذلك صحيحٌ في الحساب وكذبٌ في المعنى — لم يبلغه بعد.
 *
 * والحدُّ الفاصل هنا **جبهةُ القراءة**: أبعدُ كلمةٍ من نصّ الوجه ثبت أنّها سُمعت.
 * فما قبلها بمسافةِ أمانٍ **استقرّ حكمُه**، وما بعدها لم يُقرأ بعد فلا يُقال فيه شيء.
 *
 * ومسافةُ الأمان ليست تجميلًا: المحرّكُ يردّ الكلماتِ متأخّرةً عن نطقها، وآخرُ ما
 * وصل قد يكون ناقصَ الذيل. فكلمةٌ تبدو ساقطةً عند الجبهة قد تكون في الطريق. والتأخّرُ
 * بالحكم لحظةً أهونُ من أن يُقال لحافظٍ «أسقطتَ» وهو قد قالها.
 *
 * ولا شيءَ من هذا يُخرج حكمًا بلا إذن: المدخلُ إذنٌ، وبلا إذنٍ يعود `null`.
 */

import {
  DEFAULT_DIFF_OPTIONS, diffRecitation, heardNothing, judgeRecitation,
  type ExpectedWord, type HeardWord, type JudgingPermission, type Mistake, type RecitationDiff,
} from './recitation-diff';

/**
 * كم كلمةً تُترك خلف الجبهة قبل أن يُنطق بالحكم.
 *
 * وهي **ثلاث**، وليست قياسًا لتأخّر محرّكٍ بعينه — لا محرّكَ مضبوطٌ بعد ليُقاس عليه.
 * إنما هي أصغرُ ما يغطّي ذيلَ مقطعٍ واحدٍ من مقاطع الثانيتين عند قراءةٍ متأنّية.
 * ومتى قِيس محرّكٌ حقيقيّ، قِيست معه وصارت من تقريره لا من هنا.
 */
export const SETTLE_MARGIN_WORDS = 3;

export interface LiveJudgment {
  /** الحكمُ الكاملُ كما هو — للعرض على الوجه. */
  judgment: RecitationDiff | null;
  /** وما استقرّ منه — وهو وحده ما يُصوَّت عليه. */
  settled: readonly Mistake[];
  /** أبعدُ كلمةٍ ثبت أنّها سُمعت، و`-1` إن لم يثبت شيء. */
  frontier: number;
}

/**
 * جبهةُ القراءة: أبعدُ موضعٍ في الوجه ثبت أنّه قُرئ.
 *
 * وتُشتقّ من الحكم نفسِه لا من عدّادٍ مستقلّ: عدّادٌ ثانٍ يصف الشيءَ نفسَه يفارقه.
 *
 * وأوّلُ صياغةٍ عرّفتها بـ«آخرِ موضعٍ ليس في الأخطاء»، وكانت تنقلب على صاحبها حين
 * يُقابَل أوّلُ المسموع بالوجه كلِّه: كلمتان تُطابقان كلمتين متأخّرتين تشبهانهما،
 * فتقفز الجبهةُ إلى آخر الوجه وتصير الكلماتُ المقروءةُ ساقطة. فصارت تُقاس بما
 * **طوبق** فعلًا، ومعها محاذاةٌ لا تُحاسب الذيلَ ما دام القارئ يقرأ.
 */
function frontierOf(mistakes: readonly Mistake[], judged: number): number {
  const unread = new Set<number>();
  for (const mistake of mistakes) if (mistake.wordIndex !== null) unread.add(mistake.wordIndex);
  for (let index = judged - 1; index >= 0; index -= 1) if (!unread.has(index)) return index;
  return -1;
}

export function liveJudgment(
  expected: readonly ExpectedWord[],
  heard: readonly HeardWord[],
  gate: JudgingPermission,
  margin: number = SETTLE_MARGIN_WORDS,
): LiveJudgment {
  if (gate.word !== 'OPEN' || heardNothing(heard)) return { judgment: null, settled: [], frontier: -1 };
  /*
   * والذيلُ لا يُحاسب هنا: القارئُ لم يبلغه بعد. فتُقابَل المسموعاتُ بأطول بدايةٍ
   * تُفسّرها، وما وراءها ليس إسقاطًا — هو موضعٌ لم يُقرأ.
   */
  const judgment = diffRecitation(expected, heard, {
    ...DEFAULT_DIFF_OPTIONS,
    detectTashkeel: gate.tashkeel === 'OPEN',
    freeTail: true,
  });
  /* وأبعدُ موضعٍ دخل الحكمَ أصلًا: ما بعده لم يُقابَل بشيء. */
  const judgedUpTo = judgment.mistakes.reduce((max, m) => (m.wordIndex !== null && m.wordIndex > max ? m.wordIndex : max), -1);
  const reachedByMatch = judgment.matched + judgment.uncertain + judgment.mistakes.filter(m => m.wordIndex !== null).length;
  const frontier = frontierOf(judgment.mistakes, Math.max(judgedUpTo + 1, reachedByMatch));
  const limit = frontier - margin;
  const settled = judgment.mistakes.filter(m => m.wordIndex !== null && m.wordIndex <= limit);
  return { judgment, settled, frontier };
}

/**
 * وحكمُ الخاتمة يختلف عن حكم الأثناء في شيءٍ واحد: لا جبهةَ بعده.
 *
 * فما كان مؤجَّلًا بمسافة الأمان يُقال الآن — إذ لم يبقَ ما يُنتظر. وما بعد الجبهة
 * يبقى خطأً حقيقيًّا: الوجهُ انتهى ولم يُقرأ آخرُه.
 */
export function finalJudgment(
  expected: readonly ExpectedWord[],
  heard: readonly HeardWord[],
  gate: JudgingPermission,
): RecitationDiff | null {
  return judgeRecitation(expected, heard, gate);
}

/**
 * أيُحكم بجوابٍ على إذنٍ التُقط قبله؟
 *
 * فالإذنُ يُلتقط عند بدء المحاولة ويثبت لها، والخادمُ يعيد قراءةَ بوّابته مع كلّ
 * مقطع ويردّها مع الجواب. فإن تبدّل تقريرُ القياس في أثناء التلاوة — نموذجٌ آخر، أو
 * بابُ الحركة فُتح أو أُغلق — صارت المحاولةُ الواحدةُ تجمع كلماتٍ من محرّكين، أو
 * تُحاسَب بإذنٍ لم يعد قائمًا. **فالجوابُ لا يُقبل إلا والبوّابةُ التي معه هي بعينها
 * التي بدأت بها المحاولة**: الروايةُ والبابان والنموذج — ونموذجُ الجواب نفسُه أيضًا.
 */
export function answerKeepsPermission(
  permission: { reading: string; word: string; tashkeel: string; modelVersion: string | null },
  answer: { gate: { reading: string; word: string; tashkeel: string; modelVersion: string | null }; modelVersion: string },
): boolean {
  /* وجوابٌ بلا بوّابةٍ خالفَ العقد — لا يُقبل، ولا يُسقط الشاشةَ بخطأ قراءة. */
  const gate = answer?.gate;
  if (!gate) return false;
  return permission.modelVersion !== null
    && gate.reading === permission.reading
    && gate.word === permission.word
    && gate.tashkeel === permission.tashkeel
    && gate.modelVersion === permission.modelVersion
    && answer.modelVersion === permission.modelVersion;
}
