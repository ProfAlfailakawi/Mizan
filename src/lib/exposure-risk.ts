/*
 * نموذج خطر الانكشاف.
 *
 * السؤال الذي يُلقى في قاعةٍ فيها ثلاثون منتظرًا لم يعد سؤالًا مجهولًا لهم. والذي يُبثّ
 * مباشرةً لم يعد مجهولًا لأحد. وميزان لا يستطيع أن يمنع الأذن من السماع، لكنه يستطيع أن
 * يقيس كم انكشف الموضع، ولمن، ومتى — ثم يمنع إعادته حيث يضرّ.
 *
 * القياس هنا **نصف قطر انكشاف** لا رقم مبهم: لكل موضع نحصي من سمعه (قاعةً وبثًّا)، وكم
 * مضى على آخر مرة، فنخرج بدرجة ٠–١ يستهلكها المحرك عبر ScarcityOracle نفسه — لا بمسارٍ
 * ثانٍ موازٍ. ثم نقول للمنظم صراحةً: هذا الموضع لا يصلح لهذه القاعة اليوم، وهذا سببه.
 *
 * وحدّ الصدق: لا ندّعي أننا نعرف من حفظ السؤال ممن سمعه. ندّعي أنه سُمع، وأن إعادته على
 * من سمعه ظلمٌ قابل للقياس.
 */

import type { ScarcityOracle } from './question-engine';

export type BroadcastReach = 'none' | 'hall_only' | 'venue_wide' | 'public_stream';

/** كم شخصًا يُقدَّر أنه سمع الموضع، بحسب مدى البثّ. تقديرٌ معلَن لا رقم قاطع. */
export const BROADCAST_MULTIPLIER: Record<BroadcastReach, number> = {
  none: 0,
  hall_only: 1,
  venue_wide: 4,
  public_stream: 40,
};

export interface ExposureEvent {
  locusKey: string;
  hallId?: string;
  /** عدد الحاضرين في القاعة لحظة الكشف (المنتظرون + اللجنة + المرافقون). */
  audienceSize?: number;
  broadcast?: BroadcastReach;
  /** رقم تسلسلي للسحب؛ يُستعمل للتقادم حين لا يوجد وقت دقيق. */
  sequence?: number;
  at?: string;
  day?: string;
  stage?: string;
}

export interface ExposureProfile {
  locusKey: string;
  reveals: number;
  /** مجموع من قُدِّر أنهم سمعوه عبر كل مرات الكشف. */
  estimatedListeners: number;
  halls: string[];
  days: string[];
  stages: string[];
  lastSequence: number;
  broadcastReach: BroadcastReach;
  /** ٠ إلى ١؛ ١ أعلى انكشاف مرصود في هذه المسابقة. */
  risk: number;
  level: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

export interface ExposureModelOptions {
  /** حجم القاعة الافتراضي حين لا يُصرَّح به. */
  defaultAudienceSize?: number;
  /** الموضع الذي كُشف قبل هذا العدد من السحوبات يُعدّ متقادمًا فيهبط خطره. */
  decayWindow?: number;
  currentSequence?: number;
}

const levelOf = (risk: number): ExposureProfile['level'] =>
  risk <= 0 ? 'none' : risk < 0.2 ? 'low' : risk < 0.5 ? 'medium' : risk < 0.8 ? 'high' : 'critical';

/**
 * بناء ملفات الانكشاف من أحداث الكشف.
 *
 * الوزن = (عدد من سمع) × (تقادم). والتقادم يهبط خطيًّا على نافذة معلنة، فموضعٌ كُشف أول
 * الأمس ليس كموضعٍ كُشف قبل سحبتين، ولو تساوى عدد سامعيهما.
 */
export function buildExposureProfiles(events: ExposureEvent[], options: ExposureModelOptions = {}): Map<string, ExposureProfile> {
  const defaultAudience = Math.max(0, options.defaultAudienceSize ?? 12);
  const window = Math.max(1, options.decayWindow ?? 200);
  const current = options.currentSequence ?? Math.max(0, ...events.map(e => e.sequence ?? 0));
  const raw = new Map<string, ExposureProfile & { weight: number }>();

  for (const event of events) {
    const broadcast: BroadcastReach = event.broadcast || 'hall_only';
    const audience = Math.max(0, event.audienceSize ?? defaultAudience);
    const listeners = Math.round(audience * Math.max(1, BROADCAST_MULTIPLIER[broadcast] || 0));
    const sequence = event.sequence ?? current;
    const age = Math.max(0, current - sequence);
    const recency = Math.max(0, 1 - age / window);
    const existing = raw.get(event.locusKey);
    const profile = existing || {
      locusKey: event.locusKey, reveals: 0, estimatedListeners: 0, halls: [], days: [], stages: [],
      lastSequence: sequence, broadcastReach: broadcast, risk: 0, level: 'none' as const, weight: 0,
    };
    profile.reveals += 1;
    profile.estimatedListeners += listeners;
    profile.weight += listeners * recency;
    if (event.hallId && !profile.halls.includes(event.hallId)) profile.halls.push(event.hallId);
    if (event.day && !profile.days.includes(event.day)) profile.days.push(event.day);
    if (event.stage && !profile.stages.includes(event.stage)) profile.stages.push(event.stage);
    profile.lastSequence = Math.max(profile.lastSequence, sequence);
    if (BROADCAST_MULTIPLIER[broadcast] > BROADCAST_MULTIPLIER[profile.broadcastReach]) profile.broadcastReach = broadcast;
    raw.set(event.locusKey, profile);
  }

  const peak = Math.max(1, ...[...raw.values()].map(p => p.weight));
  const out = new Map<string, ExposureProfile>();
  for (const [key, profile] of raw) {
    const risk = Number(Math.min(1, profile.weight / peak).toFixed(4));
    const { weight: _weight, ...rest } = profile;
    void _weight;
    out.set(key, { ...rest, risk, level: levelOf(risk) });
  }
  return out;
}

/** مِرصد ندرة مبني على الانكشاف — يدخل المحرك من البوابة نفسها، لا من باب ثانٍ. */
export function buildExposureOracle(profiles: Map<string, ExposureProfile>): ScarcityOracle {
  return { pressureOfLocus: (key: string) => profiles.get(key)?.risk ?? 0 };
}

/** دمج مِرصدين: الندرة الهيكلية وخطر الانكشاف، بوزن معلن لكل منهما. */
export function combineOracles(structural: ScarcityOracle, exposure: ScarcityOracle, exposureWeight = 0.5): ScarcityOracle {
  const w = Math.max(0, Math.min(1, exposureWeight));
  return { pressureOfLocus: (key: string) => structural.pressureOfLocus(key) * (1 - w) + exposure.pressureOfLocus(key) * w };
}

export interface ExposureVerdict {
  allowed: boolean;
  risk: number;
  level: ExposureProfile['level'];
  reasonArabic: string;
  reasonEnglish: string;
}

/**
 * هل يصلح هذا الموضع لهذه القاعة اليوم؟
 *
 * الردّ ليس رأيًا: من سمعه في هذه القاعة نفسها اليوم نفسه لا يُسأل عنه مرة أخرى — هذا شرط.
 * وما دون ذلك تفضيلٌ يُقال سببه ويُترك القرار فيه للمحرك بالوزن لا بالمنع.
 */
export function exposureVerdict(input: {
  profiles: Map<string, ExposureProfile>;
  locusKey: string;
  hallId?: string;
  day?: string;
  stage?: string;
  /** أعلى خطر يُقبل قبل أن يُمنع الموضع منعًا. */
  hardLimit?: number;
}): ExposureVerdict {
  const profile = input.profiles.get(input.locusKey);
  if (!profile) return { allowed: true, risk: 0, level: 'none', reasonArabic: 'لم يُكشف هذا الموضع من قبل.', reasonEnglish: 'This locus has not been revealed before.' };
  const sameHallToday = !!input.hallId && profile.halls.includes(input.hallId) && (!input.day || profile.days.includes(input.day));
  if (sameHallToday) return {
    allowed: false, risk: profile.risk, level: profile.level,
    reasonArabic: `كُشف هذا الموضع في القاعة نفسها${input.day ? ' في اليوم نفسه' : ''}؛ من سمعه لا يُسأل عنه.`,
    reasonEnglish: 'This locus was revealed in the same hall on the same day; those who heard it must not be asked it.',
  };
  if (profile.broadcastReach === 'public_stream' && profile.risk >= (input.hardLimit ?? 0.8)) return {
    allowed: false, risk: profile.risk, level: profile.level,
    reasonArabic: 'بُثّ هذا الموضع بثًّا عامًّا وخطر انكشافه بالغ؛ إعادته لا تقيس حفظًا.',
    reasonEnglish: 'This locus was publicly broadcast and its exposure risk is extreme; reusing it measures nothing.',
  };
  if (input.stage && profile.stages.includes(input.stage) && profile.risk >= 0.5) return {
    allowed: true, risk: profile.risk, level: profile.level,
    reasonArabic: 'استُعمل في هذه المرحلة وخطره متوسط فأعلى؛ يُفضَّل غيره إن وُجد.',
    reasonEnglish: 'Used in this stage with medium-or-higher risk; prefer an alternative when one exists.',
  };
  return {
    allowed: true, risk: profile.risk, level: profile.level,
    reasonArabic: profile.risk > 0 ? `كُشف ${profile.reveals} مرة، ويُقدَّر أن ${profile.estimatedListeners} سمعوه.` : 'انكشاف مهمل.',
    reasonEnglish: profile.risk > 0 ? `Revealed ${profile.reveals} time(s); an estimated ${profile.estimatedListeners} people heard it.` : 'Negligible exposure.',
  };
}

/** أعلى المواضع انكشافًا — لتظهر للمنظم قبل أن تظهر في قاعة. */
export function topExposedLoci(profiles: Map<string, ExposureProfile>, limit = 10): ExposureProfile[] {
  return [...profiles.values()].sort((a, b) => b.risk - a.risk).slice(0, limit);
}
