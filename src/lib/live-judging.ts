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

import { quranSkeleton, wordLikeness } from './quran-orthography';
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

/*
 * والجبهةُ لا تتقدّم بكلمةٍ واحدةٍ طابقت.
 *
 * قِيس في متصفّحٍ حقيقيّ: سمع المحرّكُ «ألا تطغوا في الميزان» (الآية 8، خارج الوجه) فطابقت
 * «لا» كلمةَ 20:3، فقفزت الجبهةُ إليها، وصار كلُّ ما قبلها «سُمع غيرُها» — كلماتٌ لم يبلغها
 * القارئُ بعد تُعلَّم حمراء. وسمع لازمةَ الآية 13 فقفزت إلى لازمة 21 على الوجه.
 *
 * فالجبهةُ لا تُقبل إلا في آخر **سلسلةٍ متّصلةٍ** من الكلمات المطابقة. وإن كان بين آخر جبهةٍ
 * مقبولة وأوّل السلسلة أكثرُ من `NEAR_GAP_WORDS` **فجوات**، فهي قفزةٌ لا متابعة: تحتاج سلسلةً
 * أطول من اللازمة («فبأيّ آلاء ربّكما تكذّبان» أربعُ كلمات). والرجوعُ لا قيد عليه.
 *
 * والفجوةُ كلمةٌ لم يُسمع في موضعها شيء، أو سُمع فيه ما لا يشبهها (`wordLikeness` دون الثلث):
 * كلامٌ من غير هذا الموضع. أمّا كلمةٌ سُمعت شبيهةً بها فقراءةٌ متّصلةٌ أخطأ المحرّكُ سماعَها.
 *
 * وقِيس لماذا: كانت الفجوةُ كلَّ ما لم يطابق، فعلى وجهٍ لوازمُه بين كلّ آيتين والمحرّكُ يخطئ
 * سماعَها («آلاكما»، «بكما»، «يذبكما») تجمّعت الفجوات، ولم تأتِ ستُّ كلماتٍ صحيحةٍ متّصلة —
 * فوقفت الجبهةُ عند الآية ٣٦ من الرحمن، وبقيت ٣١ كلمةً إلى آخر الوجه لا تُعلَّم وقد قيلت.
 */
export const FRONTIER_RUN_WORDS = 2;
export const NEAR_GAP_WORDS = 3;
export const FAR_JUMP_RUN_WORDS = 6;
export const LIKENESS_FLOOR = 1 / 3;

/** الفجواتُ بين `from` و`to` (شاملًا): ما لم يُسمع، وما سُمع غيرَ شبيه. */
function gapsBetween(mistakes: readonly Mistake[], from: number, to: number): number {
  let gaps = 0;
  for (const m of mistakes) {
    if (m.wordIndex === null || m.wordIndex < from || m.wordIndex > to) continue;
    if (m.kind === 'skipped') gaps += 1;
    else if (m.kind === 'substituted' && wordLikeness(m.expected ?? '', m.heard ?? '') < LIKENESS_FLOOR) gaps += 1;
  }
  return gaps;
}

/** طولُ السلسلة المطابقة المنتهية عند `index`: كلماتٌ لم تُسمع غيرَها ولم تسقط. */
function matchedRunEndingAt(mistakes: readonly Mistake[], index: number): number {
  const miss = new Set<number>();
  for (const mistake of mistakes) {
    if (mistake.wordIndex !== null && (mistake.kind === 'substituted' || mistake.kind === 'skipped')) miss.add(mistake.wordIndex);
  }
  let run = 0;
  for (let at = index; at >= 0 && !miss.has(at); at -= 1) run += 1;
  return run;
}

/**
 * الجبهةُ الموثوقة: أبعدُ موضعٍ ≤ `raw` تنتهي عنده سلسلةٌ كافية. و`previous` آخرُ جبهةٍ مقبولة
 * (`-1` في أوّل التلاوة). وبلا `previous` لا تُقاس الفجوة، وتكفي السلسلةُ القصيرة.
 */
export function credibleFrontier(mistakes: readonly Mistake[], raw: number, previous?: number): number {
  const floor = previous ?? -1;
  if (raw <= floor) return raw;
  for (let at = raw; at > floor; at -= 1) {
    const run = matchedRunEndingAt(mistakes, at);
    const far = previous !== undefined && gapsBetween(mistakes, floor + 1, at - run) > NEAR_GAP_WORDS;
    if (run >= Math.min(far ? FAR_JUMP_RUN_WORDS : FRONTIER_RUN_WORDS, at + 1)) return at;
  }
  return floor;
}

/*
 * وقبل أن يثبت دخولُ الوجه لا يُحفظ من المسموع إلا آخرُه.
 *
 * فمن بدأ قبل الوجه (أوّلُ السورة، أو وجهٌ سابقٌ يصل به) حُسب كلُّ ما قاله مسموعًا يُقابَل بالوجه:
 * ستّون كلمةً من خارجه، فيها لوازمُ تطابق لوازمه، تُحاذى على أوّل كلماته فتصير فجواتٍ، ولا يُقبل
 * الدخولُ إلا بسلسلة ستّ كلماتٍ صحيحة. قِيس في ٢٥ سبتمبر ٢٠٢٦ بتلاوةٍ من أوّل الرحمن على الوجه ٥٣٢:
 * بلغ القارئُ الوجهَ ولم تتحرّك الجبهةُ ستًّا وأربعين ثانية. وما قيل قبل الوجه لا يدلّ على موضعٍ فيه.
 *
 * والدخولُ يثبت بكلمتين لا بكلمة: الجبهةُ على أوّل كلمةٍ تُقبل بمطابقةٍ واحدة (لا تنتظر الثانية)،
 * فلو كان ذلك دخولًا لتوقّف التقليمُ على مطابقةٍ عابرة. والقفزةُ من الجبهة الفارغة ما زالت تحتاج
 * سلسلتها — فلازمةٌ خارج الوجه لا تُدخل القارئَ إليه.
 */
export const PREFACE_WORDS = 24;

export function keepFaceEntry<T>(heard: readonly T[], frontier: number): T[] {
  return frontier < 1 && heard.length > PREFACE_WORDS ? heard.slice(-PREFACE_WORDS) : [...heard];
}

export function liveJudgment(
  expected: readonly ExpectedWord[],
  heard: readonly HeardWord[],
  gate: JudgingPermission,
  margin: number = SETTLE_MARGIN_WORDS,
  previous?: number,
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
  const frontier = credibleFrontier(judgment.mistakes, frontierOf(judgment.mistakes, Math.max(judgedUpTo + 1, reachedByMatch)), previous);
  const limit = frontier - margin;
  const settled = judgment.mistakes.filter(m => m.wordIndex !== null && m.wordIndex <= limit);
  return { judgment, settled, frontier };
}

/**
 * «أين بلغ؟» بالكلمات المسموعة وحدها — بلا حكم.
 *
 * يُستعمل حين يكون الحكمُ مغلقًا (روايةٌ لم تُقَس، أو سقط إذنُ المحاولة): الموضعُ يتبع
 * ما قيل فعلًا كلمةً كلمة، ولا يُعرض خطأٌ ولا يُنبَّه بصوت. والتشكيلُ لا يُقابَل هنا.
 */
export function followFrontier(expected: readonly ExpectedWord[], heard: readonly HeardWord[], previous?: number): number {
  if (heardNothing(heard)) return -1;
  const judgment = diffRecitation(expected, heard, { ...DEFAULT_DIFF_OPTIONS, detectTashkeel: false, freeTail: true });
  const judgedUpTo = judgment.mistakes.reduce((max, m) => (m.wordIndex !== null && m.wordIndex > max ? m.wordIndex : max), -1);
  const reachedByMatch = judgment.matched + judgment.uncertain + judgment.mistakes.filter(m => m.wordIndex !== null).length;
  return credibleFrontier(judgment.mistakes, frontierOf(judgment.mistakes, Math.max(judgedUpTo + 1, reachedByMatch)), previous);
}

/**
 * كم يُكشف فوق الجبهة ممّا سُمع عند حافّة النافذة ولم يُثبَّت بعد؟
 *
 * الكلمةُ عند الحافّة تُمسك عن التثبيت مهلةً (قد تكون مقطوعة، فتُسمع كاملةً في النافذة التالية)
 * — وهي مهلةٌ يدفعها القلمُ تأخّرًا. فما سُمع هناك **مطابقًا بهيكله الكلمةَ التالية تمامًا**
 * قد قيل يقينًا، فيُكشف الآن. ويمضي كلمةً كلمة من بعد الجبهة، ويقف عند أوّل ما لا يطابق:
 * فلا يقفز، ولا يُكشف ما لم يُسمع. ولا يدخل الحكمَ شيءٌ منه — الحكمُ بما ثبت وحده.
 */
export function provisionalReach(expected: readonly ExpectedWord[], frontier: number, tail: readonly string[]): number {
  let at = frontier;
  for (const text of tail) {
    const next = expected[at + 1];
    const heard = quranSkeleton(text);
    if (!next || !heard || heard !== quranSkeleton(next.text)) break;
    at += 1;
  }
  return at;
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
