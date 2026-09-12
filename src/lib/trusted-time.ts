/*
 * سلطة الوقت في ميزان.
 *
 * المشكلة التي يعالجها هذا الملف مكتوبة بصراحة في `question-reservation.ts` وتُقاس في
 * `tests/reservation-clock-skew.test.ts`: كل وقتٍ في النظام وقتُ الجهاز الذي كتبه. والمسابقة
 * تعمل على أجهزة قاعاتٍ متعددة، بعضها بلا شبكة، فساعاتها مستقلة. وأثر ذلك ليس نظريًا:
 *
 *   · جهازٌ ساعته متأخرة ثلاثين دقيقة يكتب حجزًا **وُلد منقضيًا**، فيَكنسه أولُ جهازٍ صحيح
 *     الساعة، ويصير الموضع حرًّا والمتسابق واقفٌ أمام اللجنة — ولا يُخبَر أحد.
 *   · جهازٌ ساعته متقدمة يحجب الموضع ثلاثة أضعاف المدة المعلنة.
 *
 * والعلاج ليس «ساعة صحيحة» — لا سبيل إلى اليقين المطلق بالوقت بلا مرجع — بل **مرجعٌ معلَن**:
 *
 *   ١) الخادم هو المرجع. يُسأل، فيُقاس الفرق بينه وبين الجهاز بطريقة الرحلة والعودة.
 *   ٢) ما بين النداءين يُحسب بساعةٍ **رتيبة** (monotonic) لا تتأثر بتعديل ساعة الجهاز ولا
 *      بالتوقيت الصيفي ولا بمنطقة زمنية.
 *   ٣) وإذا انقطع الخادم، **يُعلَن الانقطاع** ويُطبَّق عقدٌ مكتوب لا اجتهاد: إمّا الرفض
 *      القاطع للحالات الحرجة، أو القبول بمدةٍ رتيبة مع تصريحٍ بعدم الثقة.
 *
 * وما لا يفعله هذا الملف مهمٌّ كأهمّ ما يفعله: لا يدّعي يقينًا بالوقت المطلق بلا مرجع.
 * فـ`TrustedInstant` يحمل مصدره وسعة شكّه دائمًا، ومن قرأه عرف على أيّ أساسٍ يبني.
 *
 * (ولا يُستبدل هنا شيءٌ من دورة حياة الحجز القائمة: تلك تأخذ `now` نصًّا، وهذا الملف يقول
 * أيّ `now` يُعطى لها ومتى يُرفض أن يُعطى أصلًا.)
 */

export const TIME_AUTHORITY_VERSION = 'MIZAN-TIME-AUTHORITY-1';

/** مصدر اللحظة. لا يُطوى أبدًا: القارئ يستحق أن يعرف على أي أساسٍ بُنيت. */
export type TimeSource =
  /** وقتٌ مأخوذ من الخادم في هذا النداء نفسه. */
  | 'server'
  /** وقت الخادم ممتدًّا بساعةٍ رتيبة منذ آخر مزامنة. */
  | 'server_anchored_monotonic'
  /** ساعة الجهاز وحدها — لا مرجع لها. */
  | 'device';

export interface TrustedInstant {
  epochMs: number;
  source: TimeSource;
  /** سعة الشك بالميلي ثانية: نصف زمن الرحلة، زائدَ انجراف الساعة الرتيبة المقدَّر. */
  uncertaintyMs: number;
  /** هل يصلح هذا الوقت لحالةٍ حرجة بحسب العقد المعلن؟ */
  trusted: boolean;
  /** عمر آخر مزامنة مع الخادم بالميلي ثانية، أو `null` إن لم تقع مزامنة قط. */
  syncAgeMs: number | null;
}

/** عيّنة مزامنة واحدة بطريقة الرحلة والعودة. */
export interface TimeSample {
  /** ساعة الجهاز الرتيبة لحظة إرسال الطلب. */
  sentMonotonicMs: number;
  /** ساعة الجهاز الرتيبة لحظة وصول الجواب. */
  receivedMonotonicMs: number;
  /** الوقت الذي أعلنه الخادم (يونكس بالميلي ثانية). */
  serverEpochMs: number;
}

/*
 * عقد العمل بلا خادم.
 *
 * ثلاثة سلوكيات، كلها صريحة، ولا رابع. والاختيار قرار تنظيمي يُتخذ مرة ويُكتب، لا يُترك
 * لاجتهاد كل شاشة.
 */
export type OfflinePolicy =
  /** الحالات الحرجة تُرفض ما لم يكن الوقت موثوقًا. الأسلم، وهو الافتراضي. */
  | 'fail_closed'
  /** يُقبل الوقت الممتدّ بالساعة الرتيبة ما دام عمر المزامنة داخل الحدّ المعلن. */
  | 'monotonic_window'
  /** تُقبل ساعة الجهاز مع تصريحٍ بعدم الثقة. لا تُستعمل للحالات الحرجة. */
  | 'device_clock_declared';

export interface TimeAuthorityOptions {
  /** مصدر الساعة الرتيبة. يُحقن في الاختبار، ويُقرأ من `performance.now` في التشغيل. */
  monotonicNow?: () => number;
  /** ساعة الجهاز. تُحقن في الاختبار. */
  deviceNow?: () => number;
  offlinePolicy?: OfflinePolicy;
  /** أقصى عمرٍ للمزامنة يبقى معه الوقت موثوقًا. */
  maxSyncAgeMs?: number;
  /** أقصى سعة شكٍّ تبقى معها اللحظة صالحةً لحالةٍ حرجة. */
  maxUncertaintyMs?: number;
  /** انجراف الساعة الرتيبة المفترض، جزءًا من المليون. الافتراضي ٥٠ ج/م — تحفّظٌ معلن. */
  monotonicDriftPpm?: number;
  /** كم عيّنة تُحفظ لاختيار أقلّها زمن رحلة. */
  sampleWindow?: number;
}

const DEFAULT_MAX_SYNC_AGE_MS = 10 * 60_000;
const DEFAULT_MAX_UNCERTAINTY_MS = 5_000;
const DEFAULT_DRIFT_PPM = 50;

/** جواب طلب وقتٍ لحالةٍ حرجة: إمّا لحظة، وإمّا رفضٌ بسببٍ مكتوب. */
export interface TrustedNowDecision {
  ok: boolean;
  instant: TrustedInstant;
  code?: string;
  ar?: string;
  en?: string;
}

/**
 * سلطة الوقت.
 *
 * تُنشأ مرة لكل جهاز، وتُغذّى بعيّنات من الخادم كلما أمكن، ثم تُسأل عن اللحظة.
 */
export class TimeAuthority {
  private readonly monotonicNow: () => number;
  private readonly deviceNow: () => number;
  readonly offlinePolicy: OfflinePolicy;
  readonly maxSyncAgeMs: number;
  readonly maxUncertaintyMs: number;
  private readonly driftPpm: number;
  private readonly sampleWindow: number;
  private samples: { offsetMs: number; roundTripMs: number; atMonotonicMs: number }[] = [];

  constructor(options: TimeAuthorityOptions = {}) {
    this.monotonicNow = options.monotonicNow
      || (typeof performance !== 'undefined' && typeof performance.now === 'function' ? () => performance.now() : () => Date.now());
    this.deviceNow = options.deviceNow || (() => Date.now());
    this.offlinePolicy = options.offlinePolicy || 'fail_closed';
    this.maxSyncAgeMs = options.maxSyncAgeMs ?? DEFAULT_MAX_SYNC_AGE_MS;
    this.maxUncertaintyMs = options.maxUncertaintyMs ?? DEFAULT_MAX_UNCERTAINTY_MS;
    this.driftPpm = options.monotonicDriftPpm ?? DEFAULT_DRIFT_PPM;
    this.sampleWindow = Math.max(1, options.sampleWindow ?? 8);
  }

  /**
   * تسجيل عيّنة مزامنة.
   *
   * الفرق = وقت الخادم − منتصف الرحلة على ساعة الجهاز. وسعة الشك = نصف زمن الرحلة، لأن
   * الجواب قد يكون صدر في أي لحظةٍ بين الإرسال والاستلام. وهذا هو الحدّ الذي لا يُتجاوز:
   * من ادّعى دقةً أعلى من نصف الرحلة ادّعى ما لا دليل عليه.
   */
  recordSample(sample: TimeSample) {
    const roundTripMs = Math.max(0, sample.receivedMonotonicMs - sample.sentMonotonicMs);
    const midpointMonotonic = sample.sentMonotonicMs + roundTripMs / 2;
    this.samples.push({ offsetMs: sample.serverEpochMs - midpointMonotonic, roundTripMs, atMonotonicMs: sample.receivedMonotonicMs });
    if (this.samples.length > this.sampleWindow) this.samples.shift();
  }

  /** أفضل عيّنة = أقصرها رحلةً. قاعدةٌ قديمة في مزامنة الوقت، وسببها أن أقصر رحلةٍ أقلّ شكًّا. */
  private best() {
    if (!this.samples.length) return null;
    return this.samples.reduce((a, b) => (b.roundTripMs < a.roundTripMs ? b : a));
  }

  get synchronized(): boolean { return this.samples.length > 0; }

  /** فرق ساعة الجهاز عن الخادم بالميلي ثانية — موجبٌ يعني أن الجهاز متأخر. */
  clockOffsetMs(): number | null {
    const best = this.best();
    if (!best) return null;
    const monotonic = this.monotonicNow();
    return Number(((best.offsetMs + monotonic) - this.deviceNow()).toFixed(0));
  }

  /*
   * إعادة تشغيل الجهاز تُبطل المرساة.
   *
   * الساعة الرتيبة تبدأ من الصفر بعد إعادة التشغيل، فتصير المسافة المحسوبة منذ آخر مزامنة
   * سالبةً أو مستحيلة. وكشفُ ذلك واجب: مرساةٌ بُنيت على ساعةٍ صُفِّرت تعطي وقتًا خاطئًا
   * بثقةٍ كاملة — وهذا أسوأ من ألّا يكون هناك وقت أصلًا.
   */
  private anchorInvalidated(monotonic: number): boolean {
    return this.samples.some(sample => monotonic < sample.atMonotonicMs - 1);
  }

  /** يُعلن صراحةً أن الساعة الرتيبة صُفِّرت، فتُسقَط كل المراسي ويعود الجهاز غير موثوق. */
  noteMonotonicReset() { this.samples = []; }

  /*
   * قراءة الساعة الرتيبة.
   *
   * لا تصلح وقتًا مطلقًا — مبدؤها اعتباطي — لكنها تصلح **مدةً**، وهذا ما يُبنى عليه
   * السدّ الأخير للإجازات حين ينقطع الخادم: ما مضى على الساعة الرتيبة حدٌّ أدنى مُثبَت
   * لما مضى في الواقع، فلا تبقى إجازةٌ حاجبةً إلى الأبد لأن الشبكة انقطعت.
   */
  monotonic(): number { return this.monotonicNow(); }

  /** اللحظة الآن، بمصدرها وسعة شكّها. لا ترمي أبدًا: من أراد الرفض فليطلبه صراحةً. */
  now(): TrustedInstant {
    const monotonic = this.monotonicNow();
    if (this.anchorInvalidated(monotonic)) this.samples = [];
    const best = this.best();
    if (!best) {
      return { epochMs: this.deviceNow(), source: 'device', uncertaintyMs: Number.POSITIVE_INFINITY, trusted: false, syncAgeMs: null };
    }
    const syncAgeMs = Math.max(0, monotonic - best.atMonotonicMs);
    const drift = (syncAgeMs * this.driftPpm) / 1_000_000;
    const uncertaintyMs = Number((best.roundTripMs / 2 + drift).toFixed(3));
    const fresh = syncAgeMs <= 1_000;
    /*
     * الثقة تتبع العقد المعلن لا المزاج:
     *   · `fail_closed`      — مزامنة حديثة وشكٌّ ضيّق، وإلا فلا ثقة.
     *   · `monotonic_window` — مرساةٌ صحيحة تكفي مهما طال عمرها، والشك يُعلن ولا يُخفى.
     *   · `device_clock_declared` — لا ثقة أبدًا بهذا المعنى؛ الإجراء يمرّ مصرَّحًا بعدمها.
     */
    const trusted = this.offlinePolicy === 'monotonic_window'
      ? true
      : this.offlinePolicy === 'device_clock_declared'
        ? false
        : syncAgeMs <= this.maxSyncAgeMs && uncertaintyMs <= this.maxUncertaintyMs;
    return {
      epochMs: Math.round(best.offsetMs + monotonic),
      source: fresh ? 'server' : 'server_anchored_monotonic',
      uncertaintyMs,
      trusted,
      syncAgeMs,
    };
  }

  /*
   * اللحظة لحالةٍ حرجة.
   *
   * الحالات الحرجة — انقضاء الحجز، وملكية الإجازة، ونوافذ النصاب، وانتهاء تفويض الطوارئ —
   * لا تُبنى على ساعةٍ بلا مرجع. فإن لم يكن الوقت موثوقًا رُدَّ الطلب بسببٍ مكتوب، ولم
   * يُخترع وقتٌ ليمرّ الإجراء.
   *
   * و`device_clock_declared` وحده يمرّ بلا ثقة — وهو خيارٌ تنظيمي يُتخذ بعلمٍ لا بسكوت،
   * واللحظة الراجعة منه تحمل `trusted: false` فلا يُظنّ بها ما ليس فيها.
   */
  requireTrustedNow(purpose: string): TrustedNowDecision {
    const instant = this.now();
    if (instant.trusted) return { ok: true, instant };
    if (this.offlinePolicy === 'device_clock_declared' && instant.syncAgeMs !== null) return { ok: true, instant };
    return {
      ok: false,
      code: instant.syncAgeMs === null ? 'TIME_NOT_SYNCHRONIZED' : 'TIME_SYNC_STALE',
      instant,
      ar: instant.syncAgeMs === null
        ? `تعذّر تنفيذ «${purpose}»: لم تقع مزامنة وقتٍ مع الخادم قط، وساعة الجهاز وحدها لا تكفي لحالةٍ حرجة.`
        : `تعذّر تنفيذ «${purpose}»: آخر مزامنة وقتٍ مضى عليها ${Math.round((instant.syncAgeMs || 0) / 1000)} ثانية، وسعة الشك ${Math.round(instant.uncertaintyMs)} ملّي ثانية.`,
      en: instant.syncAgeMs === null
        ? `Refused "${purpose}": the device has never synchronized with the server clock, and its own clock is not a trusted reference.`
        : `Refused "${purpose}": the last clock synchronization is ${Math.round((instant.syncAgeMs || 0) / 1000)}s old with ${Math.round(instant.uncertaintyMs)}ms of uncertainty.`,
    };
  }

  /** نصّ ISO للحظة الآن — الصيغة التي تستهلكها دورة حياة الحجز القائمة بلا تغيير فيها. */
  nowIso(): string { return new Date(this.now().epochMs).toISOString(); }
}

/* ───────────────────────── الإجازات ───────────────────────── */

/**
 * إجازة يُصدرها الخادم بمدّة.
 *
 * المدة تُكتب بوقت الخادم لا بوقت الجهاز، فهي المدة المعلنة والمدة الواقعة معًا. والجهاز
 * لا يقرّر الانقضاء بساعته: يقارن بوقتٍ مرجعُه الخادم، فإن لم يكن له مرجع لم يقرّر.
 */
export interface ServerLease {
  leaseId: string;
  subject: string;
  issuedAtServerMs: number;
  expiresAtServerMs: number;
  ttlSeconds: number;
}

export function issueServerLease(input: { leaseId: string; subject: string; serverNowMs: number; ttlSeconds: number }): ServerLease {
  const ttlSeconds = Math.max(1, Math.round(input.ttlSeconds));
  return {
    leaseId: input.leaseId,
    subject: input.subject,
    issuedAtServerMs: input.serverNowMs,
    expiresAtServerMs: input.serverNowMs + ttlSeconds * 1000,
    ttlSeconds,
  };
}

/**
 * حالة الإجازة.
 *
 * و«غير محسوم» ليست حالةَ عجز: هي الجواب الصادق حين يقع الحدّ داخل سعة الشك. ومن أعلن
 * انقضاءً وهو لا يملك دقّةً تفصل بينهما فقد أعلن ما لا يعلم.
 */
export type LeaseState = 'active' | 'expired' | 'indeterminate' | 'untrusted_clock';

export interface LeaseVerdict {
  state: LeaseState;
  instant: TrustedInstant;
  /** ما بقي من المدة — للحالة النشطة وحدها. */
  remainingMs?: number;
  /** ما مضى بعد الانقضاء — للحالة المنقضية وحدها. */
  overdueMs?: number;
  reason?: string;
  code?: string;
  ar?: string;
  en?: string;
}

/**
 * الحكم على إجازة.
 *
 * وفيه ثلاثة أشياء لا يفعلها الحكم الساذج `expiresAt <= now`:
 *
 *   ١) لا يحكم بساعةٍ بلا مرجع حين يمنع العقد ذلك.
 *   ٢) لا يعلن انقضاءً داخل سعة الشك: إن كان الفرق بين الآن والانقضاء أصغر من الشك نفسه
 *      فالجواب «غير محسوم» لا «انقضى». وكسبُ ثانيةٍ لصالح المتسابق أهون من تحرير موضعٍ
 *      هو بيده.
 *   ٣) يعلن مصدر الوقت في كل حال، فلا يُظنّ اليقين حيث لا يقين.
 */
export function evaluateLease(
  lease: ServerLease,
  authority: TimeAuthority,
  options?: {
    /*
     * قراءة الساعة الرتيبة لحظة أول مشاهدةٍ لهذه الإجازة على هذا الجهاز.
     *
     * السدّ الأخير: إن انقطع الخادم فلا يبقى الموضع محجوزًا إلى الأبد. فما مضى على الساعة
     * الرتيبة لا يقلّ عمّا مضى في الواقع، فإذا تجاوز المدةَ المعلنة زائدَ الهامش حُكم
     * بالانقضاء — ولو كانت الساعة المطلقة مجهولة. والفرق بين هذا وبين ساعة الجهاز أن هذا
     * **مدة** لا **لحظة**، والمدة لا يفسدها تعديل الساعة ولا التوقيت الصيفي.
     */
    firstSeenMonotonicMs?: number;
    /** هامش تحفّظ يُضاف إلى المدة قبل الحكم بالانقضاء رتيبًا. */
    monotonicGraceMs?: number;
  },
): LeaseVerdict {
  const required = authority.requireTrustedNow(`الحكم على الإجازة ${lease.leaseId}`);
  if (!required.ok) {
    if (options?.firstSeenMonotonicMs !== undefined) {
      const elapsed = authority.monotonic() - options.firstSeenMonotonicMs;
      const ceiling = lease.ttlSeconds * 1000 + (options.monotonicGraceMs ?? 0);
      if (elapsed >= ceiling) {
        return {
          state: 'expired',
          overdueMs: Math.round(elapsed - ceiling),
          instant: required.instant,
          reason: `الساعة المطلقة غير موثوقة، لكن المدة الرتيبة منذ أول مشاهدة (${Math.round(elapsed / 1000)} ثانية) تجاوزت المدة المعلنة — فالانقضاء مُثبَت بالمدة لا باللحظة.`,
        };
      }
    }
    return { state: 'untrusted_clock', code: required.code, ar: required.ar, en: required.en, instant: required.instant };
  }
  const instant = required.instant;
  const delta = lease.expiresAtServerMs - instant.epochMs;
  if (Math.abs(delta) <= instant.uncertaintyMs) {
    return {
      state: 'indeterminate',
      reason: `الفرق عن حدّ الانقضاء ${Math.round(delta)} ملّي ثانية، وسعة الشك ${Math.round(instant.uncertaintyMs)} — لا يُحسم.`,
      instant,
    };
  }
  return delta > 0 ? { state: 'active', remainingMs: delta, instant } : { state: 'expired', overdueMs: -delta, instant };
}
