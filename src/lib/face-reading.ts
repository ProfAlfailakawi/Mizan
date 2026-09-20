import type { FaceSignals, WordSignal } from '../../server/alignment/word-signals';

/*
 * قراءةُ الوجه — من إشاراتٍ خام إلى ما يُقال للطالب.
 *
 * وهذه الطبقةُ هي التي يقع فيها الكذبُ عادةً: تُؤخذ أرقامٌ صادقة فتُسمّى تسميةً
 * تدّعي أكثرَ مما قِيس. فحُكمت بثلاث قواعد:
 *
 *   ١) **كلُّ علامةٍ تُسمّى بما قِيس لا بما يُستنتج.** «لبثتَ هنا طويلًا» لا «ترددتَ»،
 *      و«بَعُد صوتُك عن المرجع» لا «أخطأت». والفرقُ ليس تلطّفًا: النظام **لا يعرف**
 *      أخطأ أم خفت صوتُه، فادّعاءُ المعرفة كذب.
 *
 *   ٢) **المقياسُ نسبيٌّ لا مطلق.** كلفةُ المطابقة سلّمُها يتبع الميكروفونَ والغرفةَ
 *      وطبقةَ الصوت. فرقمٌ مطلقٌ («كلفة ٤٫٢») بلا معنى، وتُقاس الكلمةُ بوسيط جلستها
 *      هي. فمن تلا في غرفةٍ ضاجّةٍ تُقارن كلماتُه بكلماته لا بكلمات غيره.
 *
 *   ٣) **لا رقمَ من مئة.** المؤشّراتُ أربعةٌ كلٌّ منها يُسمّي ما يعدّه، ولا يُجمع
 *      واحدٌ منها مع آخر في «درجة». ومن جمعها فقد ادّعى مسطرةً لا يملكها.
 */

export type FaceMarkKind = 'dwell' | 'repeat' | 'skip' | 'confusable' | 'lost' | 'strain';

export interface FaceMark {
  word: number;
  kind: FaceMarkKind;
  /** شدّةٌ نسبيّة 0..1 لتدرّج اللون — لا درجة ولا نسبة إتقان. */
  intensity: number;
  /** الكلمةُ المنافسة حين تكون العلامةُ التباسًا. */
  rival?: number;
}

export interface FaceIndices {
  /*
   * أبعدُ كلمةٍ بلغها القارئ، عددًا من الكلمات — لا عددَ الكلمات المرصودة.
   *
   * والفرقُ بينهما يظهر حين يكون القياسُ خشنًا: مسارُ التدريب الحيّ يرسل موضعًا كلَّ
   * ثانيتين، فيرصد ثلاثين كلمةً في وجهٍ من مئةٍ وخمسين قرأه الطالبُ كلَّه. فلو عُرض
   * المرصودُ لقيل له «بلغتَ ٣٠ من ١٥١» وهو قد أتمّها — وذلك كذبٌ في العرض.
   */
  reach: number;
  /** كم كلمةً من الوجه زارها المحرّك فعلًا، من كم. */
  traversed: number;
  expected: number;
  /** إطاراتٌ فُقد فيها الأثر، ونسبتُها من إطارات الجلسة. */
  lostFrames: number;
  totalFrames: number;
  /** مرّاتُ الإعادة والتخطّي. */
  repeats: number;
  skips: number;
  /** كلماتٌ بَعُد فيها صوتُه عن المرجع بالنسبة إلى بقيّة تلاوته هو. */
  strainedWords: number;
  /** مواضعُ التباسٍ مع كلمةٍ أخرى — مظنّةُ المتشابه. */
  confusableWords: number;
}

export interface FaceReading {
  marks: FaceMark[];
  indices: FaceIndices;
  /** وسيطُ الكلفة في هذه الجلسة — مرجعُ التسوية، يُنشر ليُراجَع. */
  emissionMedian: number;
}

export interface FaceReadingThresholds {
  /** الكلمةُ «شاقّة» حين تتجاوز كلفتُها وسيطَ الجلسة بهذا المعامل. */
  strainRatio: number;
  /** اللبثُ «طويل» حين يتجاوز وسيطَ اللبث بهذا المعامل. */
  dwellRatio: number;
  /** الفجوةُ «ضيّقة» حين تنزل تحت هذا الحدّ — أي كاد المحرّك يسمع الكلمة الأخرى. */
  confusableGap: number;
  /** أدنى عددِ إطاراتٍ لتُقاس كلمةٌ أصلًا؛ ما دونه ضجيجٌ لا إشارة. */
  minFrames: number;
}

/*
 * العتباتُ الافتراضية — قيمٌ مبدئيّةٌ تُعلن ولا تُخفى.
 *
 * وهي **غيرُ معايَرة على متلوّين**: لم تُقَس بعدُ على تلاواتٍ موسومةٍ من محكّمين، فهي
 * نقطةُ بدءٍ تُضبط حين تتوفّر تلك البيانات. ولذلك لا يُبنى عليها حكمٌ ولا درجة —
 * وهذا سببٌ ثانٍ لامتناع الرقم من مئة، فوق سبب المبدأ.
 */
export const DEFAULT_FACE_THRESHOLDS: FaceReadingThresholds = {
  strainRatio: 1.6,
  dwellRatio: 2.5,
  confusableGap: 0.15,
  minFrames: 2,
};

/** الوسيطُ لا المتوسّط: كلمةٌ واحدةٌ شاذّةٌ لا تجرّ المرجعَ كلَّه خلفها. */
export function median(values: readonly number[]): number {
  const clean = values.filter(v => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (!clean.length) return Number.NaN;
  const mid = clean.length >> 1;
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

/** شدّةٌ 0..1 من نسبةٍ إلى عتبة: عند العتبة صفر، وعند ضعفها واحد. */
function intensityOf(value: number, threshold: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(threshold) || threshold <= 0) return 0;
  return Math.max(0, Math.min(1, (value / threshold - 1)));
}

/**
 * يقرأ الوجه: علاماتٌ على الكلمات، ومؤشّراتٌ تُسمّي ما تعدّه.
 *
 * `expectedWords` عددُ كلمات الوجه كلِّه — يأتي من النصّ لا من التلاوة، وإلا صار
 * «أكملتَ كلَّ ما قرأت» وهي جملةٌ صادقةٌ دائمًا وبلا معنى.
 */
export function readFace(
  signals: FaceSignals,
  expectedWords: number,
  thresholds: FaceReadingThresholds = DEFAULT_FACE_THRESHOLDS,
): FaceReading {
  const measurable = signals.words.filter(w => w.frames >= thresholds.minFrames);
  const emissionMedian = median(measurable.map(w => w.meanEmission));
  /*
   * ومرجعُ اللبث يُؤخذ من **كلّ** كلمةٍ زارها، لا من المقيسة وحدها.
   *
   * فحدُّ `minFrames` موضوعٌ لردّ الاستدلال الصوتيّ عن لحظةٍ عابرة — والمدّةُ ليست
   * استدلالًا صوتيًّا بل عدًّا. ولو حُسب المرجعُ من المقيسة وحدها لانقلب على نفسه حين
   * يكون القياسُ خشنًا: تُستبعد كلُّ كلمةٍ مرّ بها سريعًا، فلا يبقى في المرجع إلا
   * الكلماتُ التي لبث عندها — فيصير اللبثُ هو المعيار، ولا يظهر لبثٌ أبدًا. وقد وقع
   * ذلك بالفعل: ثمانيةُ مقاطعَ على كلمةٍ واحدة ومقطعٌ على كلّ ما عداها، فلم تظهر علامة.
   */
  const dwellMedian = median(signals.words.filter(w => w.frames > 0).map(w => w.frames));

  const marks: FaceMark[] = [];
  let strainedWords = 0, confusableWords = 0;

  for (const w of signals.words) {
    marks.push(...marksForWord(w, { emissionMedian, dwellMedian }, thresholds));
  }
  for (const w of measurable) {
    if (isStrained(w, emissionMedian, thresholds)) strainedWords += 1;
    if (isConfusable(w, thresholds)) confusableWords += 1;
  }

  return {
    marks: marks.sort((a, b) => (a.word - b.word) || a.kind.localeCompare(b.kind)),
    emissionMedian,
    indices: {
      reach: signals.lastWord === null ? 0 : signals.lastWord + 1,
      traversed: signals.visitedWords,
      expected: Math.max(0, Math.trunc(expectedWords)),
      lostFrames: signals.lostFrames,
      totalFrames: signals.frames,
      repeats: signals.backwardJumps,
      skips: signals.forwardJumps,
      strainedWords,
      confusableWords,
    },
  };
}

const isStrained = (w: WordSignal, emissionMedian: number, t: FaceReadingThresholds) =>
  Number.isFinite(emissionMedian) && emissionMedian > 0
  && Number.isFinite(w.meanEmission) && w.meanEmission > emissionMedian * t.strainRatio;

const isConfusable = (w: FaceMarkSource, t: FaceReadingThresholds) =>
  w.nearestRival !== null && Number.isFinite(w.narrowestGap) && w.narrowestGap < t.confusableGap;

type FaceMarkSource = Pick<WordSignal, 'nearestRival' | 'narrowestGap'>;

function marksForWord(
  w: WordSignal,
  refs: { emissionMedian: number; dwellMedian: number },
  t: FaceReadingThresholds,
): FaceMark[] {
  const out: FaceMark[] = [];
  if (w.backwardJumps > 0) out.push({ word: w.word, kind: 'repeat', intensity: Math.min(1, w.backwardJumps / 3) });
  if (w.forwardJumps > 0) out.push({ word: w.word, kind: 'skip', intensity: Math.min(1, w.forwardJumps / 3) });
  if (w.lostFrames > 0) out.push({ word: w.word, kind: 'lost', intensity: Math.min(1, w.lostFrames / 20) });
  /*
   * وما فوق هذا الحدّ استدلالٌ صوتيٌّ لا حدثٌ منفصل، فلا يُقال إلا عن كلمةٍ لُبث عندها
   * ما يكفي لقياسها. أمّا الرجوعُ والتخطّي وانقطاعُ الأثر فأحداثٌ وقعت، تُقال ولو في
   * إطارٍ واحد.
   */
  if (w.frames < t.minFrames) return out;
  if (isConfusable(w, t)) {
    out.push({
      word: w.word, kind: 'confusable', rival: w.nearestRival as number,
      /* أضيقُ فجوةً ⇒ أشدُّ التباسًا: صفرٌ عند العتبة، وواحدٌ عند انعدام الفجوة. */
      intensity: Math.max(0, Math.min(1, 1 - w.narrowestGap / t.confusableGap)),
    });
  }
  if (isStrained(w, refs.emissionMedian, t)) {
    out.push({ word: w.word, kind: 'strain', intensity: intensityOf(w.meanEmission, refs.emissionMedian * t.strainRatio) });
  }
  if (Number.isFinite(refs.dwellMedian) && refs.dwellMedian > 0 && w.frames > refs.dwellMedian * t.dwellRatio) {
    out.push({ word: w.word, kind: 'dwell', intensity: intensityOf(w.frames, refs.dwellMedian * t.dwellRatio) });
  }
  return out;
}
