/*
 * ساعة المسابقة: ساعةٌ واحدة تحكم اليوم، لا ساعةُ كلِّ جهاز.
 *
 * كان كلُّ وقتٍ في دفتر الحجز وقتَ الجهاز الذي كتبه: `expiresAt` تحسبه ساعةُ الجهاز
 * الحاجز، ويقارنه بساعته جهازٌ آخر. والقاعات أجهزةٌ مستقلة، بعضها بلا شبكة، فساعاتها
 * تفترق — والأثر مقيس:
 *
 *   · جهازٌ ساعته متأخرة يُنشئ حجزًا **يولد منقضيًا**، فيكنسه أولُ جهازٍ غيره،
 *     فيصير الموضع حرًّا والمتسابق واقفٌ أمام اللجنة. ولا يُخبَر أحد.
 *   · وجهازٌ ساعته متقدمة يحجب ٤٥ دقيقة والمعلن ١٥.
 *
 * والعلّة ليست أن ساعةً **خاطئة**، بل أن الساعات **مختلفة**. فالمدد نسبية: لو أخطأت
 * الساعاتُ كلُّها ساعةً كاملة واتفقت، بقي ربعُ الساعة ربعَ ساعةٍ حقيقية. فالدواء اتفاقٌ
 * لا دقّة.
 *
 * فتُتّخذ ساعةُ **الجهاز المرجعي** — وهو منسّق الشبكة المحلية نفسه الذي يختاره
 * `startLocalMesh` (جهاز Edge، ثم جهاز العمليات، ثم أي متصل) — ساعةً للمسابقة كلها.
 * ولا يُنقل الوقت نفسه بل **الفرق** بينه وبين ساعة الجهاز، فيبقى صالحًا وإن انقطعت
 * الشبكة بعده: الفرق لا يشيخ بسرعة، والانحراف في ساعةٍ من الزمن ثوانٍ معدودة.
 *
 * ولم يُختَر وقتُ السحابة لأنه لا يصل قاعةً بلا شبكة — وهي حالةٌ يدعمها النظام صراحةً.
 *
 * وحين لا يكون للجهاز فرقٌ بعد (لم يلتقِ المرجع قطّ) فإنه يعمل بساعته **ويُعلن ذلك**:
 * الإيقاف يعطّل قاعةً، والسكوت يعيد العطب الأول. فالإعلان هو الوسط الذي لا يكذب.
 */

/** من أين جاء وقتُ هذا الجهاز الآن. */
export type CompetitionClockSource = 'reference_device' | 'local_unsynced' | 'local_stale';

export interface CompetitionClockState {
  /** الجهاز الذي أُخذت عنه الساعة. */
  referenceDeviceId?: string;
  /** الفرق بالمللي ثانية: وقتُ المرجع ناقص وقتَ هذا الجهاز. */
  offsetMs: number;
  /** وقتُ هذا الجهاز حين قيس الفرق — به يُعرف عمر القياس. */
  measuredAt?: string;
  source: CompetitionClockSource;
}

/** جهازٌ لم يلتقِ المرجع بعد: يعمل بساعته، والفرق صفر، والأمر معلن. */
export const UNSYNCED_COMPETITION_CLOCK: CompetitionClockState = { offsetMs: 0, source: 'local_unsynced' };

/** بعد هذه المدة يُعدّ القياس قديمًا — ويبقى مستعملًا لأنه خيرٌ من لا شيء، لكنه يُعلَن. */
export const CLOCK_MEASUREMENT_STALE_AFTER_SECONDS = 3600;

/** فرقٌ أكبر من هذا يستحقّ أن يُقال للمشغّل صراحةً: ساعةُ جهازك بعيدة. */
export const CLOCK_OFFSET_NOTEWORTHY_MS = 120_000;

const ms = (iso: string) => new Date(iso).getTime();

/**
 * اعتماد ساعة الجهاز المرجعي.
 *
 * لا يُخزَّن وقتُ المرجع بل الفرق، فيبقى الحساب صحيحًا كلما مضى الوقت بعد اللقاء.
 */
export function adoptReferenceTime(input: {
  referenceDeviceId: string;
  /** الوقت كما تقوله ساعة الجهاز المرجعي. */
  referenceNow: string;
  /** وقت هذا الجهاز في اللحظة نفسها. */
  deviceNow?: string;
}): CompetitionClockState {
  const deviceNow = input.deviceNow || new Date().toISOString();
  const reference = ms(input.referenceNow), local = ms(deviceNow);
  if (!Number.isFinite(reference) || !Number.isFinite(local)) return UNSYNCED_COMPETITION_CLOCK;
  return {
    referenceDeviceId: input.referenceDeviceId,
    offsetMs: reference - local,
    measuredAt: deviceNow,
    source: 'reference_device',
  };
}

/** الجهاز المرجعي نفسه: ساعتُه هي ساعة المسابقة، وفرقُه صفر بالتعريف. */
export function selfAsReference(deviceId: string, deviceNow = new Date().toISOString()): CompetitionClockState {
  return { referenceDeviceId: deviceId, offsetMs: 0, measuredAt: deviceNow, source: 'reference_device' };
}

/** وقت المسابقة الآن على هذا الجهاز. هذا ما يجب أن يُمرَّر إلى دفتر الحجز، لا وقتُ الجهاز. */
export function competitionNow(clock: CompetitionClockState | undefined, deviceNow = new Date().toISOString()): string {
  if (!clock || !clock.offsetMs) return deviceNow;
  const shifted = ms(deviceNow) + clock.offsetMs;
  return Number.isFinite(shifted) ? new Date(shifted).toISOString() : deviceNow;
}

export interface CompetitionClockStatus {
  source: CompetitionClockSource;
  offsetMs: number;
  /** عمر القياس بالثواني، أو undefined إن لم يُقَس قطّ. */
  ageSeconds?: number;
  /** هل يستحقّ أن يُعرض للمشغّل؟ */
  noteworthy: boolean;
  ar: string;
  en: string;
}

/** حال الساعة بلغةٍ تُقال للمشغّل — لا رقمٌ يُدفن في التخزين. */
export function competitionClockStatus(
  clock: CompetitionClockState | undefined,
  deviceNow = new Date().toISOString(),
): CompetitionClockStatus {
  const state = clock || UNSYNCED_COMPETITION_CLOCK;
  if (state.source === 'local_unsynced' || !state.measuredAt) {
    return {
      source: 'local_unsynced', offsetMs: 0, noteworthy: true,
      ar: 'هذا الجهاز لم يأخذ ساعته من الجهاز المرجعي بعد، فهو يعمل بساعته وحدها.',
      en: 'This device has not taken its clock from the reference device yet; it is running on its own clock.',
    };
  }
  const ageSeconds = Math.max(0, Math.round((ms(deviceNow) - ms(state.measuredAt)) / 1000));
  const stale = ageSeconds > CLOCK_MEASUREMENT_STALE_AFTER_SECONDS;
  const minutes = Math.round(Math.abs(state.offsetMs) / 60000);
  const far = Math.abs(state.offsetMs) > CLOCK_OFFSET_NOTEWORTHY_MS;
  const direction = state.offsetMs > 0 ? 'متأخرة' : 'متقدمة';
  return {
    source: stale ? 'local_stale' : 'reference_device',
    offsetMs: state.offsetMs,
    ageSeconds,
    noteworthy: stale || far,
    ar: stale
      ? `آخر مطابقة مع الجهاز المرجعي مضى عليها ${Math.round(ageSeconds / 60)} دقيقة؛ الفرق المحفوظ ما زال مستعملًا.`
      : far
        ? `ساعة هذا الجهاز ${direction} ${minutes} دقيقة عن ساعة المسابقة، والفرق مطبَّق فلا يختلّ الحجز.`
        : 'ساعة هذا الجهاز مطابقة لساعة المسابقة.',
    en: stale
      ? `Last sync with the reference device was ${Math.round(ageSeconds / 60)} minutes ago; the stored offset is still in use.`
      : far
        ? `This device's clock is ${minutes} minutes off the competition clock; the offset is applied so reservations stay correct.`
        : "This device's clock matches the competition clock.",
  };
}
