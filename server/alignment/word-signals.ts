/*
 * إشاراتُ الكلمة — ما يحسبه القرارُ في كلّ إطار ثم يُطرح.
 *
 * القرارُ (`position-decoder`) يُخرج في كلّ إطارٍ صوتيّ أربعةَ أشياء لم يكن يبقى منها
 * شيء: أيّ **كلمة** بلغ القارئ، و**كلفةَ** مطابقة صوته بالمرجع عندها، و**أقربَ منافسٍ**
 * لها ومدى قربه، وهل سلك المسارُ **قفزة** غير متّصلة (إعادةٌ أو تخطٍّ). وكان الخارجُ من
 * كلّ هذا رقمًا واحدًا: «فقد أثرك ٣ مرّات».
 *
 * فهذه الوحدة تُراكمها كلمةً كلمة. وهي **محضةٌ**: لا صوتَ ولا شبكةَ ولا ساعة — تأخذ
 * خطواتٍ وتُرجع إشارات، فتُقاس بتسلسلٍ مصنوعٍ بدل انتظار تلاوةٍ حقيقية.
 *
 * وحدٌّ لا يُتجاوز: **الكلفةُ ليست خطأً**. `emission` مسافةٌ صوتيّةٌ بين تلاوته والمرجع،
 * ترتفع بالخطأ وترتفع أيضًا بخفوت الصوت وبالضجيج وباختلاف طبقة الصوت. فما يُبنى عليها
 * وصفٌ («هنا شقّ عليك») لا حكم («هنا أخطأت»). ومقياسُها نسبيٌّ لا مطلق: سلّمُها يتبع
 * الخلفيةَ الصوتية، فلا تُقارن جلسةٌ بجلسة إلا بعد تسوية.
 */

import { isDistantCompetitor } from './mutashabihat';

export interface AlignmentStep {
  /** الكلمةُ التي بلغها القارئ في هذا الإطار (فهرسٌ عامٌّ داخل المقطع). */
  word: number;
  /** كلفةُ المطابقة عند هذا الإطار — أقلُّ يعني أقربَ إلى المرجع. */
  emission: number;
  /** أقوى كلمةٍ منافسةٍ مغايرة، إن وُجدت. */
  competingWord: number | null;
  /** فجوةُ الأفضلية بين الكلمة ومنافسها — أصغرُ يعني التباسًا أشدّ. */
  competingGap: number;
  /** هل سلك المسارُ قفزةً غير متّصلة في هذا الإطار. */
  tookJump: boolean;
  /** هل كان المحرّك فاقدًا للأثر في هذا الإطار. */
  lost: boolean;
}

export interface WordSignal {
  word: number;
  /** كم إطارًا لبث القارئ عند هذه الكلمة — مجموعُ كلّ زياراته لها. */
  frames: number;
  /** أدنى كلفةٍ بلغها عندها: أقربُ لحظةٍ وافق فيها المرجع. */
  minEmission: number;
  /** متوسطُ الكلفة عندها. */
  meanEmission: number;
  /** أقربُ منافسٍ سُجِّل عندها، وأضيقُ فجوةٍ بلغها — موضعُ الالتباس. */
  nearestRival: number | null;
  narrowestGap: number;
  /** قفزاتٌ رجعت إلى هذه الكلمة من كلمةٍ بعدها: إعادةٌ أو تصحيحُ ذات. */
  backwardJumps: number;
  /** قفزاتٌ وصلت إليها من كلمةٍ قبلها بغير تتابع: تخطٍّ. */
  forwardJumps: number;
  /** كم إطارًا كان الأثرُ مفقودًا عندها. */
  lostFrames: number;
}

export interface FaceSignals {
  /** الإشاراتُ بترتيب الكلمة، وفيها الكلماتُ التي زارها القارئ فقط. */
  words: WordSignal[];
  /** عددُ إطاراتِ الصوت كلِّها. */
  frames: number;
  /** أوّلُ كلمةٍ بلغها وآخرُها — لا ترتيبَ الزيارة بل أدنى فهرسٍ وأقصاه. */
  firstWord: number | null;
  lastWord: number | null;
  /** كم كلمةً مغايرةً زارها. */
  visitedWords: number;
  /** إجماليُّ القفزات بنوعيها. */
  backwardJumps: number;
  forwardJumps: number;
  lostFrames: number;
}

interface Accumulator {
  frames: number;
  emissionSum: number;
  minEmission: number;
  nearestRival: number | null;
  narrowestGap: number;
  backwardJumps: number;
  forwardJumps: number;
  lostFrames: number;
}

const freshAccumulator = (): Accumulator => ({
  frames: 0, emissionSum: 0, minEmission: Number.POSITIVE_INFINITY,
  nearestRival: null, narrowestGap: Number.POSITIVE_INFINITY,
  backwardJumps: 0, forwardJumps: 0, lostFrames: 0,
});

/**
 * يراكم خطوات القرار إلى إشاراتِ كلمات.
 *
 * والقفزةُ تُنسب إلى الكلمة التي **وصل إليها**، لا التي غادرها: إن رجع من الكلمة ٩ إلى
 * ٤ فالإعادةُ عند ٤ — هناك وقف وأعاد. وإن قفز من ٤ إلى ٩ فالتخطّي عند ٩ — هناك ظهر
 * أنه ترك ما بينهما.
 *
 * وإطارٌ مفقودُ الأثر لا يُحتسب في الكلفة: المحرّكُ لا يعرف أين هو، فكلفتُه بلا معنى.
 * ويُعدّ لبثًا ضائعًا عند آخر كلمةٍ عُرفت، فيبقى للفقد مكانٌ يُشار إليه.
 */
export function accumulateWordSignals(steps: Iterable<AlignmentStep>): FaceSignals {
  const byWord = new Map<number, Accumulator>();
  const at = (word: number) => {
    const found = byWord.get(word);
    if (found) return found;
    const made = freshAccumulator();
    byWord.set(word, made);
    return made;
  };

  let frames = 0, previousWord: number | null = null, lastKnownWord: number | null = null;
  let backwardJumps = 0, forwardJumps = 0, lostFrames = 0;

  for (const step of steps) {
    frames += 1;
    if (step.lost) {
      lostFrames += 1;
      if (lastKnownWord !== null) at(lastKnownWord).lostFrames += 1;
      /* لا يُحدَّث `previousWord` من إطارٍ مفقود: موضعُه ظنٌّ لا يُبنى عليه قفزة. */
      continue;
    }
    if (!Number.isInteger(step.word) || step.word < 0) continue;

    const slot = at(step.word);
    slot.frames += 1;
    if (Number.isFinite(step.emission)) {
      slot.emissionSum += step.emission;
      if (step.emission < slot.minEmission) slot.minEmission = step.emission;
    }
    /*
     * والمنافسُ الجارُ ليس موضعًا مشابهًا.
     *
     * القرارُ يُخرج أقوى كلمةٍ **مغايرة** بلا قيدِ مسافة، وعند حدود الكلمات تكون الجارةُ
     * ثانيةً قريبةً في كلّ تلاوةٍ سليمة. فلو عُدّت التباسًا لظهرت للطالب «موضعٌ مشابه»
     * حيث لا تشابُهَ، ولرجّحت ذاكرةُ الوجوه ضعفًا لم يقع. والقاعدةُ هي التي يعمل بها
     * المحرّكُ الحيُّ نفسُه (`liveNearTie`) — مأخوذةٌ من موضعها لا منسوخة.
     */
    if (isDistantCompetitor(step.word, step.competingWord) && Number.isFinite(step.competingGap)) {
      if (step.competingGap < slot.narrowestGap) {
        slot.narrowestGap = step.competingGap;
        slot.nearestRival = step.competingWord;
      }
    }
    /*
     * و`tookJump` إزاحةُ **إطارٍ مرجعيّ** لا فجوةُ كلمات: القرارُ يرفعها حين يبعد أفضلُ
     * إطارٍ عن سابقه بأكثر من أربعة، وذلك يقع في الانتقال العاديّ إلى الكلمة التالية.
     * فالتخطّي يُشترط له فجوةُ كلمةٍ حقيقيّة — كلمةٌ تُركت بينهما — وإلا كان تتابعًا
     * سُمّي تخطّيًا. أمّا الرجوعُ فرجوعٌ ولو كلمةً واحدة: التلاوةُ لا تنكص.
     */
    if (step.tookJump && previousWord !== null) {
      if (step.word < previousWord) { slot.backwardJumps += 1; backwardJumps += 1; }
      else if (step.word > previousWord + 1) { slot.forwardJumps += 1; forwardJumps += 1; }
    }
    previousWord = step.word;
    lastKnownWord = step.word;
  }

  const words: WordSignal[] = [...byWord.entries()]
    .map(([word, a]) => ({
      word,
      frames: a.frames,
      minEmission: Number.isFinite(a.minEmission) ? a.minEmission : Number.NaN,
      meanEmission: a.frames > 0 ? a.emissionSum / a.frames : Number.NaN,
      nearestRival: a.nearestRival,
      narrowestGap: a.narrowestGap,
      backwardJumps: a.backwardJumps,
      forwardJumps: a.forwardJumps,
      lostFrames: a.lostFrames,
    }))
    .sort((x, y) => x.word - y.word);

  const visited = words.filter(w => w.frames > 0);
  return {
    words,
    frames,
    firstWord: visited.length ? visited[0].word : null,
    lastWord: visited.length ? visited[visited.length - 1].word : null,
    visitedWords: visited.length,
    backwardJumps,
    forwardJumps,
    lostFrames,
  };
}
