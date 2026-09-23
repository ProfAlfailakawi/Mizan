/*
 * قراراتُ مراجعة الوجه — محضةٌ، فتُقاس بلا متصفّحٍ ولا هويّة.
 *
 * وهي مفصولةٌ عن طلبات الشبكة عمدًا: تلك تحتاج جلسةً وهويّةً فلا تُحمَّل في اختبار،
 * وهذه هي التي يقع فيها الخطأُ الذي يُرى في وجه الطالب.
 */

import type { FaceMark } from './face-reading';
import type { FaceAttempt } from './face-memory';

/** ما يكفي للحكم على وجهٍ قبل فتحه — لا نصَّ فيه. */
export interface FaceExtent { page: number; surahStart: number; surahEnd: number }

/*
 * هل يصحّ الاستماعُ إلى هذا الوجه؟
 *
 * ومسارُ المحاذاة يُطلب **لسورةٍ واحدةٍ** ومدى آياتٍ فيها، فالوجهُ العابرُ سورتين لا
 * يُقاس كاملًا. وهذا سؤالٌ يُسأل عن الوجه المسحوب نفسِه، لا عن القائمة وحدها: فقد
 * يُسحب عابرٌ من قائمةٍ كلُّها عابرة، فيلزم أن يُعرف قبل أن يُفتح ميكروفون.
 */
export function faceSupportsListening(face: FaceExtent | null | undefined): boolean {
  return !!face && face.surahStart === face.surahEnd;
}

/*
 * الوجوهُ التي يصحّ الاستماعُ إليها.
 *
 * وهي نحوُ واحدٍ وتسعين في المئة من المصحف. وحين لا يبقى غيرُ العابرة في نطاق الطالب —
 * كنطاقٍ ضيّقٍ كلُّ وجوهه عابرة — تُعرض على أنّها هي، ولا يُقال له «لا وجهَ لك». لكنّها
 * حينئذٍ **تُراجَع صامتةً**: يُقال له إنّ الوجهَ يعبر سورتين فلا يُحلَّل، ولا يُفتح له
 * ميكروفونٌ يرسل إلى مقطعٍ لا يقبله المحرّك فيعود بتقريرٍ فارغ.
 */
export function listenableFaces(
  faces: readonly FaceExtent[],
  listening: unknown,
): readonly FaceExtent[] {
  if (!listening) return faces;
  const single = faces.filter(faceSupportsListening);
  return single.length ? single : faces;
}

/*
 * محاولةٌ تُحفظ أو لا تُحفظ.
 *
 * ولا تُحفظ محاولةٌ لم يُسمع فيها شيء: ذاكرةٌ مبنيّةٌ على صمتٍ ترجّح وجهًا بلا سبب،
 * فيعود الطالبُ إلى موضعٍ لم يتعثّر فيه قطّ — وإنما فشل ميكروفونُه.
 */
export function attemptFrom(
  page: number,
  marks: readonly Pick<FaceMark, 'kind' | 'intensity'>[],
  heardChunks: number,
  at: Date = new Date(),
): FaceAttempt | null {
  if (!Number.isInteger(heardChunks) || heardChunks <= 0) return null;
  return { page, at: at.toISOString(), marks: marks.map(m => ({ kind: m.kind, intensity: m.intensity })) };
}


/** سببُ التعذّر يُقال بلغة الطالب، ولا يُعرض رمزٌ داخليّ في وجهه. */
export function faceNote(code: string, ar: boolean): string {
  if (/READING_UNKNOWN/.test(code)) return ar ? 'روايتُك ليست من الروايات التي تحمل حزمُها مواضعَ صفحات بعد.' : 'Your reading has no page-positioned package yet.';
  if (/NOT_WHOLE|NOT_IN_PACKAGE/.test(code)) return ar ? 'هذا الوجهُ ناقصٌ في حزمة روايتك، فلا يُعرض. جرّب وجهًا آخر.' : 'That face is incomplete in your reading package.';
  if (/NOT_CONFIGURED|BACKEND/.test(code)) return ar ? 'خدمةُ الاستماع غيرُ مهيّأةٍ الآن، فالوجهُ مفتوحٌ للمراجعة بلا تحليل.' : 'The listening service is not available — review without analysis.';
  if (/BENCHMARK/.test(code)) return ar ? 'محرّكُ الاستماع لم يجتز معايرتَه لروايتك، ولا يُقاس بمحرّكٍ غير مُعاير.' : 'The listening engine is not benchmarked for your reading.';
  if (/IDENTITY_REQUIRED|HTTP_401|HTTP_403/.test(code)) return ar ? 'انتهت جلستُك. أعد الدخول ثم افتح الوجه.' : 'Your session expired — sign in again.';
  return ar ? 'تعذّر فتحُ الوجه الآن.' : 'The face could not be opened right now.';
}

/**
 * ولماذا لا يُقال لهذا الطالب «أخطأت».
 *
 * فبوّابةُ الحكم مغلقةٌ افتراضًا، وإغلاقُها ليس عيبًا يُخفى: يُقال له بأيّ سببٍ
 * أُغلقت، فيعرف أنّ الصمتَ عن خطئه ليس شهادةً بصوابه.
 *
 * ولا يُقال شيءٌ حين تكون مفتوحة: البابُ المفتوحُ يُرى بأثره على الوجه.
 */
export function judgingNote(
  gate: { word: 'OPEN' | 'CLOSED'; reasons: readonly string[] } | null,
  ar: boolean,
  lost = false,
): string | undefined {
  /*
   * وانقطاعُ السماع في أثناء المراجعة يُقال، ولا يُسكت عنه.
   *
   * فمقطعٌ لم يصل يترك ثقبًا في ما سُمع، والمقابلةُ تقرأ الثقبَ إسقاطًا فتُخطّئ
   * قارئًا مصيبًا. فيُطرح الحكمُ كلُّه لهذه المراجعة — **وسكوتٌ عن خطأٍ أهونُ من
   * تخطئةِ مصيب** — ويُقال للطالب لماذا سكت عنه.
   */
  if (lost)
    return ar ? 'وانقطع سماعُ بعض تلاوتك، فلم يُحكم على هذه المراجعة — ولا يُقال لك «أخطأت» على ما لم يُسمع كلُّه.'
      : 'Part of your recitation never reached the engine, so this review was not judged — nothing here says you erred.';
  if (!gate || gate.word === 'OPEN') return undefined;
  const why = gate.reasons.join(' ');
  if (/NOT_CONFIGURED/.test(why))
    return ar ? 'وكشفُ الخطأ غيرُ مهيّأٍ في هذه المسابقة بعد، فلا يُقال لك «أخطأت» ولا «أصبت».'
      : 'Mistake detection is not set up in this competition yet — nothing here says you erred, or that you did not.';
  if (/OTHER_RIWAYAH|DATASET_OTHER/.test(why))
    return ar ? 'ومحرّكُ السماع لم يُقس على روايتك أنت، ولا يُقاس قارئُ روايةٍ بمسطرة أخرى. فلا حكمَ هنا.'
      : 'The listening engine was not measured on your riwayah — one riwayah is never judged by another’s ruler.';
  if (/BENCHMARK_NOT_AVAILABLE|SAMPLE_COUNT|ERROR_RATE|LATENCY|MISSING_SLICE|DUAL_APPROVED|BENCHMARK_INVALID/.test(why))
    return ar ? 'ومحرّكُ السماع لم يجتز قياسَه لروايتك بعد، فلا يُحكم بما لم يُقس.'
      : 'The listening engine has not passed its measurement for your riwayah, so it does not judge.';
  return ar ? 'وكشفُ الخطأ مغلقٌ الآن، فالوجهُ يُقرأ ويُوصف ولا يُحكم عليه.'
    : 'Mistake detection is closed right now — the face is described, not judged.';
}

/* ── ذاكرةُ المحاولات، في الجهاز وحده ──────────────────────────────────── */




const STORE_PREFIX = 'mizan.face-attempts.v1';
/* حدٌّ للتاريخ المحفوظ: الاضمحلالُ نصفُ عمره عشرةُ أيّام، فما وراء المئتين لا يزن شيئًا. */
export const MAX_REMEMBERED_ATTEMPTS = 200;

const storeKey = (owner: string, reading: string) => `${STORE_PREFIX}:${owner}:${reading}`;

/** محاولةٌ صالحة: صفحةٌ في المصحف، ووقتٌ يُقرأ، وعلاماتٌ معروفةُ الشكل. */
function sane(row: unknown): row is FaceAttempt {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  if (!Number.isInteger(r.page) || (r.page as number) < 1 || (r.page as number) > 604) return false;
  if (typeof r.at !== 'string' || Number.isNaN(Date.parse(r.at))) return false;
  if (!Array.isArray(r.marks)) return false;
  return r.marks.every(m => m && typeof m === 'object'
    && typeof (m as { kind?: unknown }).kind === 'string'
    && Number.isFinite((m as { intensity?: unknown }).intensity));
}

export function loadFaceAttempts(owner: string, reading: string): FaceAttempt[] {
  try {
    const raw = window.localStorage.getItem(storeKey(owner, reading));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    /* بياناتٌ مشوّهةٌ تُطرح ولا تُصلَّح بالتخمين: ذاكرةٌ فارغةٌ أصدقُ من ذاكرةٍ مخترعة. */
    return Array.isArray(parsed) ? parsed.filter(sane) : [];
  } catch { return []; }
}

export function rememberFaceAttempt(owner: string, reading: string, attempt: FaceAttempt): FaceAttempt[] {
  const kept = [attempt, ...loadFaceAttempts(owner, reading)].slice(0, MAX_REMEMBERED_ATTEMPTS);
  try { window.localStorage.setItem(storeKey(owner, reading), JSON.stringify(kept)); } catch { /* لا مكان: تبقى الجلسةُ وحدها */ }
  return kept;
}

export function forgetFaceAttempts(owner: string, reading: string): void {
  try { window.localStorage.removeItem(storeKey(owner, reading)); } catch { /* لا شيء يُفعل */ }
}

/* ── طابورٌ متسلسل: ترتيبُ التلاوة لا ترتيبُ الشبكة ────────────────────── */

/*
 * مقاطعُ التلاوة تُرسل واحدًا بعد واحد، بترتيب تسجيلها.
 *
 * وكان كلُّ مقطعٍ يُرسل مستقلًّا، فتعود الردودُ بترتيب إتمامها لا بترتيب القراءة.
 * وذلك يصنع **رجوعًا كاذبًا**: مقطعٌ متأخّرٌ يسبق سابقَه فيبدو أنّ القارئ نكص. وهو
 * أسوأُ ما يقع هنا: «أعدتَ» واحدةٌ من ثلاثٍ يقدر هذا المسارُ على قياسها، فكذبُها
 * يمسّ ما بقي صادقًا.
 *
 * ومحرّكُ الخادم نفسُه ذو حالةٍ متّصلة، فترتيبُ وصول الصوت إليه يغيّر قراره — فلا
 * يكفي فرزُ الردود عند العميل، بل تُرسل مرتّبةً أصلًا.
 *
 * والدفعُ **تزامنيّ**: يُربط الطابورُ لحظةَ وصول المقطع، لا بعد انتظار. وإلا سبق
 * متأخّرٌ سابقَه في الربط نفسِه.
 */
/*
 * وللانتظار حدٌّ — وإلّا حبس طلبٌ لا يعود الشاشةَ إلى الأبد.
 *
 * فمقطعٌ يُرسل إلى خادمٍ توقّف عن الرد يبقى معلّقًا، فيبقى الطابورُ معلّقًا، فتبقى
 * الشاشةُ عند «يُقرأ ما سُمع…» ولا تصل إلى تقرير. والطالبُ لا يعرف ما جرى ولا يملك
 * إلا إغلاقَ الصفحة.
 *
 * فبعد هذا الحدّ يُقرأ ما وصل، **ويُقال إنّ بعضه لم يصل** — ولا يُعرض ناقصٌ على أنّه
 * تامّ. وخمسَ عشرةَ ثانيةً سعةٌ لمقطعٍ من ثانيتين على أبطأ شبكةٍ معقولة.
 */
export const DRAIN_DEADLINE_MS = 15_000;

export interface SerialQueue {
  /**
   * يُلحق مهمّةً بالطابور فورًا — ولا تبدأ حتى تنتهي ما قبلها.
   *
   * وتُعطى المهمّةُ `live()`: أما زال هذا الطابورُ هو الجاري؟ **فلتسأل قبل أن تكتب
   * شيئًا**. فمقطعٌ انقضت مهلتُه ثمّ عاد، والطالبُ قد انتقل إلى وجهٍ آخر، يكتب في
   * مواضع الوجه الجديد مواضعَ الوجه القديم — فيختلط تقريرٌ بتقرير، وتُحفظ محاولةٌ
   * مغشوشة. والطابورُ لا يملك إيقافَ مهمّةٍ جارية، لكنّه يملك أن يقول لها: كُفّي.
   */
  push(task: (live: () => boolean) => Promise<void>, onFailure?: (error: unknown) => void): void;
  /**
   * ينتظر ما في الطابور كلِّه، بما دُفع أثناء الانتظار — إلى حدٍّ.
   * ويُرجع `true` إن **وصل كلُّ شيءٍ وتمّ**؛ و`false` إن انقضى الحدُّ أو سقطت مهمّة.
   */
  drain(deadlineMs?: number): Promise<boolean>;
  /** يُنهي هذا الطابور: ما لم يبدأ لا يبدأ، وما بدأ يُقال له `live() === false`. */
  abandon(): void;
  /** كم مهمّةً دُخلت الطابورَ — للعرض لا للحكم. */
  readonly length: number;
  /** كم مهمّةً سقطت — وكلُّ ساقطةٍ مقطعٌ لم يصل. */
  readonly failed: number;
}

export function serialQueue(): SerialQueue {
  let tail: Promise<void> = Promise.resolve();
  let entered = 0;
  let failed = 0;
  let abandoned = false;
  const live = () => !abandoned;

  return {
    push(task, onFailure) {
      if (abandoned) return;
      entered += 1;
      /*
       * وخطأُ مهمّةٍ لا يقطع الطابور: المقطعُ الواحد يسقط، والتلاوةُ تمضي. لكنّه
       * **يُعدّ**: مقطعٌ سقط مقطعٌ لم يصل، فالتقريرُ ناقصٌ وإن لم تنقضِ مهلة.
       *
       * والبيانُ للطالب يقع بعد العدّ، وسقوطُه هو لا يُسقط العدّ.
       */
      tail = tail.then(() => (abandoned ? undefined : task(live))).catch(error => {
        failed += 1;
        /*
         * وبيانُ طابورٍ متروكٍ لا يُسلَّم.
         *
         * فقد حُرست الكتابةُ بـ`live()` وتُرك البيانُ بلا حارس — وهو أخطر: البيانُ
         * يوقف الميكروفون، فمقطعٌ من وجهٍ قديمٍ يسقط **فيُغلق ميكروفونَ الوجه الجديد**
         * والطالبُ يقرأ. فلا يُسلَّم بيانٌ من طابورٍ انتهى أمرُه، كما لا تُكتب فيه كلمة.
         */
        if (abandoned) return;
        try { onFailure?.(error); } catch { /* بيانٌ تعذّر لا يُلغي أنّ المقطع سقط */ }
      });
    },
    async drain(deadlineMs = DRAIN_DEADLINE_MS) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let expired = false;
      const deadline = new Promise<'expired'>(resolve => {
        timer = setTimeout(() => { expired = true; resolve('expired'); }, Math.max(0, deadlineMs));
      });
      try {
        /* ومهمّةٌ تُدفع أثناء الانتظار تُنتظر هي أيضًا — وإلا سقط آخرُ مقطع. */
        let seen: Promise<void> | null = null;
        while (seen !== tail) {
          seen = tail;
          const outcome = await Promise.race([tail.then(() => 'settled' as const), deadline]);
          if (outcome === 'expired') return false;
        }
        return !expired && failed === 0;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },
    abandon() { abandoned = true; },
    get length() { return entered; },
    get failed() { return failed; },
  };
}

/* ── ما يُقال للطالب تحت وجهه ──────────────────────────────────────────── */

/*
 * بيانُ حال المراجعة — وأمرُه أدقُّ ممّا يبدو.
 *
 * فقد كان ترتيبًا بسيطًا: «إن كان ناقصًا فقل انقضت المهلة، وإلا فقل ما وقع». فبلع
 * **سببًا بنيويًّا** يعرفه النظامُ ويحتاج فعلًا من الطالب: انتهاءُ جلسته، أو خدمةُ
 * استماعٍ غيرُ مهيّأة. إذ سقوطُ المقاطع يجعل التقريرَ ناقصًا، والنقصُ كان يتقدّم
 * فيُقال له «الشبكةُ بطيئة، أعِد» وجلستُه منتهيةٌ فلا يُفيده الإعادة.
 *
 * فالسببُ المعروفُ يتقدّم دائمًا، والنقصُ يُذكر معه لا بدله: يعرف ما يفعل، ويعرف أنّ
 * ما يراه ناقص.
 */
export interface ReviewNoteInput {
  /** أمهيّأٌ محرّكُ الاستماع في هذه المسابقة؟ */
  listening: boolean;
  /** أيقبل الوجهُ المسحوبُ القياسَ (في سورةٍ واحدة)؟ */
  faceListenable: boolean;
  /** بيانٌ بنيويٌّ وقع (جلسةٌ منتهية، خدمةٌ غيرُ مهيّأة…) — من `faceNote`. */
  note?: string;
  /** أنقص التقريرُ: مقطعٌ لم يصل أو سقط؟ */
  incomplete: boolean;
  ar: boolean;
}

export function reviewNote(input: ReviewNoteInput): string | undefined {
  const { listening, faceListenable, note, incomplete, ar } = input;
  if (!listening) {
    return ar
      ? 'محرّكُ الاستماع غيرُ مهيّأٍ في هذه المسابقة، فالوجهُ مفتوحٌ للمراجعة بلا تحليل — ولا يُتظاهر بسماعٍ لم يقع.'
      : 'The listening engine is not configured here — the face is open for review without analysis.';
  }
  if (!faceListenable) {
    return ar
      ? 'هذا الوجهُ يحمل خاتمةَ سورةٍ وفاتحةَ أخرى، والتتبّعُ يُطلب لسورةٍ واحدة — فيُراجَع بلا تحليل، ولا يُفتح ميكروفونٌ يعود بتقريرٍ فارغ.'
      : 'This face spans two surahs and tracking is requested per surah — review it without analysis.';
  }
  /*
   * ويُقال له أيضًا إنّها لم تُحفظ.
   *
   * فالمراجعةُ الناقصةُ لا تدخل ذاكرتَه — ولو سُكت عن ذلك لظنّ أنّ الوجهَ قد رُوجع
   * وحُسب، فلا يعود إليه. والصمتُ هنا كذبٌ في الأثر.
   */
  const partial = ar
    ? 'ولم يصل بعضُ المقاطع، فما تراه مبنيٌّ على ما وصل وحدَه — والنقصُ ليس من تلاوتك. ولم تُحفظ هذه المراجعةُ في ذاكرتك، فأعِد الوجهَ متى شئت.'
    : 'Some chunks never arrived, so what you see is built only on what did — the gap is not in your recitation. This review was not recorded; recite the face again whenever you wish.';
  /* السببُ المعروفُ أوّلًا: هو الذي يدلّ الطالبَ على ما يفعل. */
  if (note) return incomplete ? `${note} ${partial}` : note;
  return incomplete ? partial : undefined;
}
