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
  judgeRecitation, type ExpectedWord, type HeardWord, type JudgingPermission, type Mistake, type RecitationDiff,
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
 * جبهةُ القراءة: أبعدُ موضعٍ في الوجه لم يُعدّ خطأً — أي ثبت أنّه قُرئ.
 *
 * وتُشتقّ من الحكم نفسِه لا من عدّادٍ مستقلّ: عدّادٌ ثانٍ يصف الشيءَ نفسَه يفارقه.
 */
function frontierOf(expectedCount: number, mistakes: readonly Mistake[]): number {
  const unread = new Set<number>();
  for (const mistake of mistakes) if (mistake.wordIndex !== null) unread.add(mistake.wordIndex);
  for (let index = expectedCount - 1; index >= 0; index -= 1) if (!unread.has(index)) return index;
  return -1;
}

export function liveJudgment(
  expected: readonly ExpectedWord[],
  heard: readonly HeardWord[],
  gate: JudgingPermission,
  margin: number = SETTLE_MARGIN_WORDS,
): LiveJudgment {
  const judgment = judgeRecitation(expected, heard, gate);
  if (!judgment) return { judgment: null, settled: [], frontier: -1 };
  const frontier = frontierOf(expected.length, judgment.mistakes);
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
