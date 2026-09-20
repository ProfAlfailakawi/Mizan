/*
 * مقابلةُ ما سُمع بما كان يجب أن يُقال — وهي موضعُ الحكم.
 *
 * وكلُّ ما قبلها في هذا النظام كان وصفًا: «لبثتَ»، «رجعتَ». وهذه أوّلُ وحدةٍ تقول
 * «أسقطتَ كلمة». فيلزمها من الحرص ما لا يلزم غيرَها: **أن يُقال لحافظٍ «أخطأت» وهو
 * مصيبٌ أسوأُ من السكوت**.
 *
 * ولذلك ثلاثةُ قيودٍ مبنيّةٌ في التوقيع نفسِه:
 *
 *  ١) **الكلمةُ تُحكم بهيكلها، والحركةُ حكمٌ آخر أضعف.** قِيس بين حفصٍ وورش: الهيكلُ
 *     يتّفق في ٩٧٫٣٪ من الكلمات، والحركةُ في ٤٢٫١٪ وحدها. فمن كشف الحركةَ بمحرّكٍ لم
 *     يسمع إلا روايةً واحدة، خطّأ قارئَ غيرها في أكثر من نصف كلماته الصحيحة. فكشفُ
 *     الحركة لا يُفتح إلا بإذنٍ صريح (`detectTashkeel`) لروايةٍ عُويرَ عليها المحرّك.
 *
 *  ٢) **ما دون عتبة الثقة لا يُقال، ويُعدّ.** فيُعلم أنّ ثمّة ما لم يُحسم، ولا يُعرض
 *     ظنٌّ في صورة حكم.
 *
 *  ٣) **لا درجةَ ولا نسبة.** تُخرَج مواضعُ بأعيانها وعددٌ لِما حُجب. والحكمُ في
 *     المسابقة للبشر كما كان.
 */

import { quranSkeleton, quranVoweled, sameWord } from './quran-orthography';

/** كلمةٌ سمعها المحرّك، بثقته فيها. */
export interface HeardWord { text: string; confidence: number; startMs?: number; endMs?: number }

/** كلمةٌ في نصّ الوجه — بفهرسها الذي تعرفه الشاشة. */
export interface ExpectedWord { index: number; text: string }

export type MistakeKind = 'skipped' | 'substituted' | 'tashkeel' | 'added';

export interface Mistake {
  kind: MistakeKind;
  /** موضعُها في نصّ الوجه؛ و`null` لِما زِيد ولا أصلَ له. */
  wordIndex: number | null;
  expected?: string;
  heard?: string;
  confidence: number;
}

export interface DiffOptions {
  /**
   * أيُكشف اختلافُ الحركة؟
   *
   * لا يُفتح إلا لروايةٍ صرّح المحرّكُ أنّه مُعايَرٌ عليها. وإلا فإنّ اختلافَ الحركة
   * بين الروايات هو القاعدةُ لا الاستثناء — فيصير الكشفُ تخطئةً للصواب.
   */
  detectTashkeel: boolean;
  /**
   * أتلاوةٌ جاريةٌ أم خاتمة؟
   *
   * فذيلُ الوجه الذي لم يُقرأ بعدُ ليس إسقاطًا ما دام القارئُ يقرأ. ولا يصير إسقاطًا
   * إلا حين تنتهي التلاوة — فيُحاسب عليه حينئذٍ.
   */
  freeTail?: boolean;
  /** ما دون هذه الثقة يُحجب ويُعدّ — لحكم الكلمة. */
  minConfidence: number;
  /**
   * وعتبةٌ أعلى لحكم الحركة، لا حطٌّ لثقته.
   *
   * وأوّلُ صياغةٍ حطّت الثقةَ بمعاملٍ (٠٫٦) ثمّ قاستها بعتبة الكلمة (٠٫٧٥) — فلزم
   * لحكمِ الحركة ثقةٌ ١٫٢٥، وهي مستحيلة. فكانت الميزةُ **ميتةً** وإن كانت شيفرتُها
   * حاضرة. فصار الشرطُ عتبةً صريحةً أعلى: أدقُّ ما يُقاس يلزمه يقينٌ أشدّ.
   */
  minTashkeelConfidence: number;
}

export const DEFAULT_DIFF_OPTIONS: DiffOptions = {
  detectTashkeel: false,
  minConfidence: 0.75,
  minTashkeelConfidence: 0.9,
};

export interface RecitationDiff {
  mistakes: Mistake[];
  /**
   * كلماتٌ سُمعت كما هي **بثقةٍ تبلغ العتبة**.
   *
   * ولا تُعدّ هنا مطابقةٌ دون العتبة: المحرّكُ لم يجزم أنّه سمعها، فعَدُّها «مثبَّتة»
   * يقلب الظنَّ يقينًا. وكانت تُعدّ، فرُفعت الملاحظةُ في مراجعةٍ آليّة (#252) وهي
   * صحيحة: كلمةٌ واحدةٌ بثقة ٠٫١ كانت تُخرج `matched: 1` و`withheld: 0`.
   */
  matched: number;
  expectedCount: number;
  heardCount: number;
  /** ما وقع دون عتبة الثقة فلم يُقل — يُعلن عددُه ولا يُكتم. */
  withheld: number;
  /**
   * ومطابقاتٌ دون العتبة: سُمع ما يشبهها ولم يُجزم.
   *
   * وتُعدّ في خانةٍ ثالثة لا في `withheld`: ذاك عددُ **أحكامٍ حُجبت**، وهذا عددُ
   * **مواضعَ لم يُحكم فيها أصلًا**. وخلطُهما يُخفي أيَّهما وقع.
   */
  uncertain: number;
}

type Op = 'match' | 'sub' | 'del' | 'ins';

/*
 * محاذاةُ تتابعين بأقلّ تحرير (Needleman–Wunsch).
 *
 * والمطابقةُ بالهيكل لا بالنصّ الخام: المحرّكُ الصوتيّ يكتب بهجائه هو، فمقابلةُ
 * الحروف كما وردت تجعل كلَّ كلمةٍ خطأً.
 *
 * و`freeTail` هو الفرقُ بين «يقرأ الآن» و«فرغ من القراءة».
 *
 * فقارئٌ في أوّل الوجه قرأ كلمتين: مقابلتُهما بالوجه كلِّه تجعل ذيلَه حذفًا، فتتساوى
 * كلُّ المواضع في الكلفة — إذ الحذفُ سبعٌ وعشرون أينما وُضعت المطابقتان. فتختار
 * المحاذاةُ موضعًا اعتباطيًّا، وقد تُطابقهما بكلمتين متأخّرتين تشبهانهما، **فتُعدّ
 * الكلماتُ التي قرأها فعلًا ساقطة**.
 *
 * وقد وقع ذلك مقيسًا: في أوّل مقطعٍ من تلاوةٍ صحيحةٍ نُبِّه على الكلمة الأولى بصوت،
 * والطالبُ قد قرأها. وكشفه عدُّ النغمات في متصفّحٍ حقيقيّ — ثلاثُ نغماتٍ لخطأٍ واحد.
 *
 * فإن كان `freeTail` صحيحًا لم يُحسب ذيلُ المنتظَر حذفًا: تُقابَل المسموعاتُ بأفضل
 * **بدايةٍ** من الوجه، وما بعدها لم يُقرأ بعدُ فلا يُقال فيه شيء. وعند الخاتمة يُحسب
 * الذيلُ حذفًا حقيقيًّا — إذ لم يبقَ ما يُنتظر.
 */
function align(
  expected: readonly ExpectedWord[],
  heard: readonly HeardWord[],
  freeTail = false,
): { op: Op; e?: number; h?: number }[] {
  const n = expected.length, m = heard.length;
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i <= n; i += 1) cost[i][0] = i;
  for (let j = 0; j <= m; j += 1) cost[0][j] = j;
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const hit = sameWord(expected[i - 1].text, heard[j - 1].text) ? 0 : 1;
      cost[i][j] = Math.min(cost[i - 1][j - 1] + hit, cost[i - 1][j] + 1, cost[i][j - 1] + 1);
    }
  }
  const trail: { op: Op; e?: number; h?: number }[] = [];
  /*
   * وبدايةُ التتبّع هي موضعُ الحسم: من آخر المنتظَر حين يُحاسب الذيل، ومن أرخص
   * موضعٍ في العمود الأخير حين لا يُحاسب — وهو أطولُ بدايةٍ فُسِّرت بما سُمع.
   */
  let i = n;
  if (freeTail) { for (let k = 0; k <= n; k += 1) if (cost[k][m] < cost[i][m]) i = k; }
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const hit = sameWord(expected[i - 1].text, heard[j - 1].text) ? 0 : 1;
      if (cost[i][j] === cost[i - 1][j - 1] + hit) {
        trail.push({ op: hit ? 'sub' : 'match', e: i - 1, h: j - 1 });
        i -= 1; j -= 1; continue;
      }
    }
    if (i > 0 && cost[i][j] === cost[i - 1][j] + 1) { trail.push({ op: 'del', e: i - 1 }); i -= 1; continue; }
    trail.push({ op: 'ins', h: j - 1 }); j -= 1;
  }
  return trail.reverse();
}

/** ثقةُ الجوار: حين لا يُسمع شيءٌ أصلًا، تُؤخذ الثقةُ ممّا حولَه. */
function neighbourConfidence(heard: readonly HeardWord[], at: number): number {
  const near = [heard[at - 1], heard[at]].filter(Boolean) as HeardWord[];
  if (!near.length) return 0;
  return near.reduce((sum, w) => sum + (Number.isFinite(w.confidence) ? w.confidence : 0), 0) / near.length;
}

export function diffRecitation(
  expected: readonly ExpectedWord[],
  heard: readonly HeardWord[],
  options: Partial<DiffOptions> = {},
): RecitationDiff {
  const opts = { ...DEFAULT_DIFF_OPTIONS, ...options };
  const mistakes: Mistake[] = [];
  let matched = 0, withheld = 0, uncertain = 0;

  const keep = (mistake: Mistake) => {
    const floor = mistake.kind === 'tashkeel' ? opts.minTashkeelConfidence : opts.minConfidence;
    if (!Number.isFinite(mistake.confidence) || mistake.confidence < floor) { withheld += 1; return; }
    mistakes.push(mistake);
  };

  let heardCursor = 0;
  for (const step of align(expected, heard, opts.freeTail === true)) {
    if (step.op === 'match') {
      heardCursor = (step.h as number) + 1;
      const e = expected[step.e as number], h = heard[step.h as number];
      /* والعتبةُ تُطبَّق قبل العدّ: مطابقةٌ لم يجزم بها المحرّكُ ليست تثبيتًا. */
      if (Number.isFinite(h.confidence) && h.confidence >= opts.minConfidence) matched += 1;
      else uncertain += 1;
      if (!opts.detectTashkeel) continue;
      /* الكلمةُ ثبتت، فبقي سؤالُ الحركة — وهو أضعفُ حكمًا فيُحطّ. */
      if (quranVoweled(e.text) !== quranVoweled(h.text)) {
        keep({ kind: 'tashkeel', wordIndex: e.index, expected: e.text, heard: h.text, confidence: h.confidence || 0 });
      }
      continue;
    }
    if (step.op === 'sub') {
      const e = expected[step.e as number], h = heard[step.h as number];
      heardCursor = (step.h as number) + 1;
      keep({ kind: 'substituted', wordIndex: e.index, expected: e.text, heard: h.text, confidence: h.confidence || 0 });
      continue;
    }
    if (step.op === 'del') {
      const e = expected[step.e as number];
      keep({ kind: 'skipped', wordIndex: e.index, expected: e.text, confidence: neighbourConfidence(heard, heardCursor) });
      continue;
    }
    const h = heard[step.h as number];
    heardCursor = (step.h as number) + 1;
    keep({ kind: 'added', wordIndex: null, heard: h.text, confidence: h.confidence || 0 });
  }

  return {
    mistakes: mistakes.sort((a, b) => (a.wordIndex ?? Number.MAX_SAFE_INTEGER) - (b.wordIndex ?? Number.MAX_SAFE_INTEGER)),
    matched,
    expectedCount: expected.length,
    heardCount: heard.length,
    withheld,
    uncertain,
  };
}

/** أفارغٌ ما سُمع؟ فلا يُقال «أسقطتَ الوجهَ كلَّه»: لم يُسمع أصلًا. */
export const heardNothing = (heard: readonly HeardWord[]) =>
  heard.every(w => quranSkeleton(w.text).length === 0);

/**
 * إذنُ الحكم كما يصل الشاشةَ من الخادم.
 *
 * والبوّابةُ نفسُها تُحسب في `server/recitation-asr-contract.ts` من تقرير قياسٍ
 * لكلّ رواية. أمّا هذا فشكلُها المنقول: الشاشةُ لا تحسب إذنًا لنفسها، تتلقّاه.
 */
export interface JudgingPermission { word: 'OPEN' | 'CLOSED'; tashkeel: 'OPEN' | 'CLOSED' }

/**
 * خياراتُ المقابلة تُشتقّ من الإذن ولا تُكتب بيد.
 *
 * حارسُ بناءٍ لا حارسُ اختبار: ما دام `detectTashkeel` يُولَد من الإذن وحدَه، فلا
 * موضعَ في الشيفرة يفتح حكمَ الحركة بلا قياسٍ يسنده.
 */
export function diffOptionsForGate(
  gate: JudgingPermission,
  thresholds: Pick<DiffOptions, 'minConfidence' | 'minTashkeelConfidence'> = DEFAULT_DIFF_OPTIONS,
): DiffOptions {
  return {
    detectTashkeel: gate.tashkeel === 'OPEN',
    minConfidence: thresholds.minConfidence,
    minTashkeelConfidence: thresholds.minTashkeelConfidence,
  };
}

/**
 * ولا يُحكم إلا بإذن.
 *
 * `diffRecitation` يقابل نصَّين ولا يسأل عن إذن — وهو صوابٌ في موضعه: مقابلةُ نصّين
 * عمليّةٌ محايدة تُستعمل في القياس وفي الاختبار. أمّا أن يُقال لطالبٍ «أخطأت»، فبابُه
 * هذا وحدَه: بابٌ **يعيد `null`** حين لا إذن، فلا يُخرج حكمًا فارغًا يُقرأ «لا أخطاء».
 *
 * والفرقُ بين `null` و«لا أخطاء» هو الفرقُ بين «لم يُحكم» و«حُكم فلم يُوجد خطأ».
 */
export function judgeRecitation(
  expected: readonly ExpectedWord[],
  heard: readonly HeardWord[],
  gate: JudgingPermission,
  thresholds: Pick<DiffOptions, 'minConfidence' | 'minTashkeelConfidence'> = DEFAULT_DIFF_OPTIONS,
): RecitationDiff | null {
  if (gate.word !== 'OPEN') return null;
  if (heardNothing(heard)) return null;
  return diffRecitation(expected, heard, diffOptionsForGate(gate, thresholds));
}
