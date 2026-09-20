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
