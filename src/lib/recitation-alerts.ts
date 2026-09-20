/*
 * التنبيهُ بالصوت — ومتى يجب أن يسكت.
 *
 * طلب المالكُ أن يُنبَّه الطالبُ بصوتٍ عند خطئه. وبين الطلب وتنفيذه ثلاثةُ قيودٍ
 * ليست تجميلًا:
 *
 *  ١) **الميكروفونُ هنا خام.** الشاشةُ تطلبه بلا إلغاءِ صدًى ولا كبتِ ضجيجٍ ولا
 *     ضبطِ كسبٍ تلقائيّ — عمدًا، كي يصل المحرّكَ صوتُ الطالب لا صوتٌ مُعالَج. فكلُّ
 *     نغمةٍ تخرج من السمّاعة **يلتقطها الميكروفونُ نفسُه** وتُرسَل إلى محرّك
 *     التعرّف. ولو مرّت لعادت «كلمةً زائدة» — أي أنّ التنبيهَ على خطأٍ يصنع خطأً.
 *     فلكلّ نغمةٍ نافذةٌ زمنيّة، وما سُمع داخلها **يُطرح قبل الحكم**. وذلك ممكنٌ
 *     لأنّ الكلمةَ المسموعة تحمل `startMs`/`endMs` في عقد المحرّك.
 *
 *  ٢) **نغمةٌ لا كلام.** ولا يُقرأ للطالب لفظُ الكلمة الصحيحة: ذلك يقتضي صوتَ
 *     روايتِه بعينها، ولا يُستعار صوتُ حفصٍ دليلًا على غيرها. والنغمةُ لا رواية لها.
 *
 *  ٣) **وما يُسمع لا يُصفَّر.** كلمةٌ واحدةٌ تُنبَّه مرّةً واحدةً في المحاولة، وبين
 *     تنبيهين مهلةٌ لا تُخترق — وإلا صار وجهٌ فيه عشرةُ مواضعَ صفّارةَ إنذار.
 *
 * ولا يُنبَّه على حكمٍ ضعيف: ما حُجب دون عتبة الثقة لا يدخل هنا أصلًا (لا يصل في
 * `mistakes`)، وحكمُ الحركة والكلمةُ الزائدة **يُعرضان ولا يُصوَّتان** — فأوّلهما
 * أكثرُ ما يُخطئ بين الروايات (٥٨٪ مقيسة)، وثانيهما أكثرُ ما يأتي من ضجيج المحرّك.
 */

import type { Mistake, RecitationDiff } from './recitation-diff';

/** ما يُصوَّت عليه من الأخطاء — والباقي يُعرض على الوجه بلا صوت. */
export const SOUNDED_MISTAKES: readonly Mistake['kind'][] = ['skipped', 'substituted'];

/**
 * النغمةُ نفسُها — وصفًا لا تشغيلًا.
 *
 * فالوصفُ يُقاس في اختبار، والتشغيلُ لا يقع إلا في متصفّح. والفصلُ بينهما يجعل
 * القرارَ (متى يُسمع، وبأيّ نغمة) مُختبَرًا، ويترك للمتصفّح ما لا يُختبَر إلا فيه.
 */
export interface ToneStep { frequencyHz: number; durationMs: number; gain: number }
export const ALERT_TONE: readonly ToneStep[] = [
  { frequencyHz: 660, durationMs: 90, gain: 0.08 },
  { frequencyHz: 495, durationMs: 90, gain: 0.08 },
];

/** ويُشتقّ طولُ النغمة من خطواتها، فلا يفترق رقمان يصفان شيئًا واحدًا. */
export const toneDurationMs = (tone: readonly ToneStep[] = ALERT_TONE) =>
  tone.reduce((total, step) => total + step.durationMs, 0);

/** وطولُ النغمة **مُشتقٌّ** من خطواتها، فلا يفترق رقمان يصفان شيئًا واحدًا. */
export const ALERT_TONE_MS = toneDurationMs();

/** أقصرُ مهلةٍ بين تنبيهين. */
export const ALERT_MIN_GAP_MS = 1500;
/**
 * وهامشٌ حول النغمة يُطرح معها.
 *
 * فبين خروج الصوت من السمّاعة ووصوله إلى الميكروفون تأخّرٌ، ولمقطع الصوت ذيلٌ.
 * والهامشُ ليس قياسًا لذلك التأخّر — هو **سياجٌ سخيّ**: طرحُ كلمةٍ صحيحةٍ أهونُ من
 * تلحينِ خطأٍ من صدى نغمة.
 */
export const ALERT_ECHO_MARGIN_MS = 250;

export interface AlertSounded { wordIndex: number | null; kind: Mistake['kind']; at: number }
export interface AlertMemory {
  /** آخرُ تنبيهٍ سُمع — بمِلّي ثانية على ساعة الشاشة. */
  lastAt: number;
  /** ومواضعُ نُبّه عليها في هذه المحاولة. */
  announced: readonly number[];
}

export const EMPTY_ALERT_MEMORY: AlertMemory = { lastAt: Number.NEGATIVE_INFINITY, announced: [] };

export interface AlertPlan { sound: AlertSounded | null; memory: AlertMemory }

/**
 * ما الذي يُسمع الآن — واحدٌ على الأكثر.
 *
 * ولا تُجمع التنبيهاتُ في طابور: خطأٌ وقع قبل ثلاث ثوانٍ لا يُنبَّه عليه الآن، فقد
 * جاوزه الطالب. والمقصودُ أن يلتفت إلى موضعه لا أن يُلاحَق بما مضى.
 */
export function planAlert(mistakes: readonly Mistake[], memory: AlertMemory, now: number): AlertPlan {
  const announced = new Set(memory.announced);
  for (const mistake of mistakes) {
    if (!SOUNDED_MISTAKES.includes(mistake.kind)) continue;
    if (mistake.wordIndex === null) continue;
    if (announced.has(mistake.wordIndex)) continue;
    if (now - memory.lastAt < ALERT_MIN_GAP_MS) {
      /*
       * ولا يُعدّ «نُبِّه عليه»: المهلةُ تؤجّل السماعَ ولا تُسقط الموضع. فإن بقي
       * الخطأُ قائمًا بعد المهلة سُمع، وإلا فقد مضى ومضى معه سببُه.
       */
      return { sound: null, memory };
    }
    return {
      sound: { wordIndex: mistake.wordIndex, kind: mistake.kind, at: now },
      memory: { lastAt: now, announced: [...memory.announced, mistake.wordIndex] },
    };
  }
  return { sound: null, memory };
}

/** نافذةٌ خرج فيها صوتٌ من السمّاعة. */
export interface SoundWindow { startMs: number; endMs: number }

export function alertWindow(at: number, toneMs = ALERT_TONE_MS, margin = ALERT_ECHO_MARGIN_MS): SoundWindow {
  return { startMs: at - margin, endMs: at + toneMs + margin };
}

export interface TimedWord { text: string; confidence: number; startMs?: number; endMs?: number }

/**
 * يُطرح **أثرُ النغمة** مما سُمع قبل أن يُحكم — لا ما سُمع تحتها.
 *
 * وأوّلُ صياغةٍ طرحت كلَّ كلمةٍ تقع في نافذة نغمة، فصنعت ما جاءت تمنعه: الكلمةُ
 * المطروحةُ تصير «لم تُسمع»، فيُنبَّه عليها، فتُفتح نافذةٌ أخرى، فتُطرح كلمةٌ أخرى —
 * دورةٌ تُخطّئ قارئًا مصيبًا. **وكشفها أوّلُ تشغيلٍ في متصفّح**: ثلاثُ كلماتٍ قرأها
 * الطالبُ صحيحةً عُلّمت «لم تُسمع»، وكلُّها جارةُ نغمة.
 *
 * والصوابُ أنّ النغمةَ لا تصنع كلمةً من كلمات الوجه: أقصى ما تصنعه لفظٌ غريبٌ عنه.
 * فيُطرح ما اجتمع فيه أمران: أن يقع في النافذة، **وألّا يكون من كلمات هذا الوجه**.
 *
 * وثمنُ ذلك معلومٌ ومقبول: إبدالٌ وقع تحت النغمة بعينها يمرّ بلا أن يُقال. وسكوتٌ
 * عن خطأٍ أهونُ من أن يُقال لحافظٍ «لم تُسمع» وقد قرأها.
 *
 * وكلمةٌ بلا توقيتٍ تُبقى: لا يُطرح ما لا يُعرف موضعُه من الزمن. ويُعدّ ذلك ليُعرف
 * أنّ الحارسَ لم ينطبق عليها.
 */
export function dropWordsUnderAlert<T extends TimedWord>(
  words: readonly T[],
  windows: readonly SoundWindow[],
  belongsToFace: (text: string) => boolean = () => false,
) {
  if (!windows.length) return { kept: [...words], dropped: [] as T[], untimed: 0 };
  const kept: T[] = [], dropped: T[] = [];
  let untimed = 0;
  for (const word of words) {
    const start = word.startMs, end = word.endMs ?? word.startMs;
    if (start === undefined || end === undefined) { untimed += 1; kept.push(word); continue }
    const underTone = windows.some(w => start <= w.endMs && end >= w.startMs);
    (underTone && !belongsToFace(word.text) ? dropped : kept).push(word);
  }
  return { kept, dropped, untimed };
}

/**
 * أخطاءُ تقريرٍ لم يُحكم فيه لا تُصوَّت.
 *
 * وهذا حارسُ بناء: `judgeRecitation` يعيد `null` بلا إذن، وهذا الباب يقبل ذلك
 * `null` ويسكت — فلا موضعَ في الشيفرة يُسمع تنبيهًا بلا إذنٍ مقيس.
 */
export function planAlertForJudgment(judgment: RecitationDiff | null, memory: AlertMemory, now: number): AlertPlan {
  if (!judgment) return { sound: null, memory };
  return planAlert(judgment.mistakes, memory, now);
}

/*
 * والتشغيلُ في المتصفّح — سطورٌ قليلةٌ لا قرارَ فيها.
 *
 * كلُّ ما يُقرَّر قُرِّر فوق: أيُسمع، ومتى، وبأيّ نغمة. وهذا ينفّذ الوصفَ وحسب.
 * ويُفتح سياقُ الصوت **عند أوّل تنبيهٍ فعليّ** لا عند فتح الشاشة: سياقٌ يُفتح بلا
 * إيماءةٍ من المستخدم تُعلّقه المتصفّحاتُ صامتًا، فيُظنّ أنّ التنبيهَ يعمل وهو لا يُسمع.
 */
export interface AlertSpeaker { play(tone?: readonly ToneStep[]): void; close(): void }

interface AlertAudioContext {
  createOscillator(): { type: string; frequency: { value: number }; connect(node: unknown): void; start(at: number): void; stop(at: number): void };
  createGain(): { gain: { value: number }; connect(node: unknown): void };
  destination: unknown;
  currentTime: number;
  state: string;
  resume(): Promise<void>;
  close(): Promise<void>;
}
type AudioContextLike = new () => AlertAudioContext;

export function createAlertSpeaker(AudioCtor?: AudioContextLike): AlertSpeaker {
  const Ctor = AudioCtor
    || (typeof window === 'undefined' ? undefined : ((window as unknown as { AudioContext?: AudioContextLike; webkitAudioContext?: AudioContextLike }).AudioContext
      || (window as unknown as { webkitAudioContext?: AudioContextLike }).webkitAudioContext));
  let context: AlertAudioContext | null = null;
  return {
    play(tone: readonly ToneStep[] = ALERT_TONE) {
      if (!Ctor) return;
      try {
        if (!context) context = new Ctor();
        if (context.state === 'suspended') void context.resume();
        let at = context.currentTime;
        for (const step of tone) {
          const oscillator = context.createOscillator(), gain = context.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.value = step.frequencyHz;
          gain.gain.value = step.gain;
          oscillator.connect(gain); gain.connect(context.destination);
          oscillator.start(at); at += step.durationMs / 1000; oscillator.stop(at);
        }
      } catch { /* تنبيهٌ تعذّر لا يُسقط تلاوةً — والخطأُ يُعرض على الوجه كما هو. */ }
    },
    close() { const c = context; context = null; if (c) void c.close().catch(() => undefined) },
  };
}
