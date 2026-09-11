import type { Committee } from '../types';

/*
 * إيقاع الجلسات — ما تفعله اللجنة فعلًا، لا ما قُدّر لها.
 *
 * `averageSessionMinutes` يُكتب **مرّة واحدة** عند إنشاء اللجنة ثم لا يتغيّر أبدًا. ويُقرأ
 * في كل موضعٍ يمسّ زمن المتسابق: حِملُ البوابة، ومرونة اللجان، وخطة الموجة، والزمن المتوقّع
 * على شاشة القاعة وشاشة اللجنة وصفحة المتسابق.
 *
 * فكل رقمٍ زمني في المنصّة مشتقٌّ من **قيمة إعداد** لا من لجنةٍ تعمل اليوم. ولجنةٌ قُدّرت
 * بثماني دقائق وهي تأخذ خمس عشرة تُنتج أرقامًا خاطئة في كل مكان — وشاشةٌ تقول «ثلاثون
 * دقيقة» ثم تمضي ساعة تُفقد الثقة في كل رقمٍ بعدها، وهو أسوأ من ألّا يُقال شيء.
 *
 * هنا تتعلّم اللجنة من جلساتها. وثلاث قواعد تحكم التعلّم:
 *
 *   ١) **الوسيط لا المتوسّط.** جلسةٌ واحدة تعطّل فيها الصوت نصف ساعة تُفسد المتوسّط ولا
 *      تحرّك الوسيط. والقاعة مليئة بمثل هذه.
 *   ٢) **لا يُوثَق بعيّنةٍ قليلة.** دون الحدّ الأدنى تبقى القيمة المُعدّة — تقديرٌ ضعيف
 *      أشرف من تعلّمٍ من جلستين.
 *   ٣) **وصفيّ لا حافز.** هذا الرقم للتخطيط وحده. لا يُعرض ترتيبًا للجان بالسرعة ولا
 *      يدخل تقييمًا — وإلا تحوّل إلى ضغطٍ على التحكيم، وهو ما يحظره النظام في كل موضع.
 */

export const SESSION_TEMPO_VERSION = 'MIZAN-SESSION-TEMPO-1';

/** أقلّ عدد جلسات قبل أن يُوثَق بالمقيس بدل المُعدّ. */
export const MIN_TEMPO_SAMPLES = 5;
/** أحدث ما يُحتسب: اليوم يتغيّر إيقاعه، وجلسات الصباح لا تصف العصر. */
export const TEMPO_WINDOW = 8;

/** جلسةٌ اكتملت: كم استغرقت فعلًا. */
export interface SessionTempoSample {
  committeeId: string;
  participantId: string;
  minutes: number;
  at: string;
}

/**
 * انتظارٌ انتهى: ما وُعد به، وما وقع.
 *
 * التقدير في هذه المنصّة كان يَعِد ولا يُحاسَب — وهي المكان الوحيد الذي يقول فيه النظام
 * رقمًا عن المستقبل ثم لا يعود إليه. وكل شيءٍ آخر هنا يُعلن حاله: الشاشة تقول إنها
 * متجمّدة، والإسقاط يُعلن عمره، والخطة تحمل بصمتها.
 */
export interface QueueWaitSample {
  participantId: string;
  committeeId: string;
  predictedMinutes: number;
  actualMinutes: number;
  at: string;
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** أحدث `TEMPO_WINDOW` جلسة لهذه اللجنة، الأحدث أولًا. */
export function recentSamples(samples: SessionTempoSample[], committeeId: string, window = TEMPO_WINDOW): SessionTempoSample[] {
  return samples
    .filter(x => x.committeeId === committeeId && Number.isFinite(x.minutes) && x.minutes > 0)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, Math.max(1, window));
}

export interface TempoReading {
  committeeId: string;
  /** ما يُستعمل فعلًا في الحساب. */
  minutes: number;
  /** من أين جاء: من الجلسات أم من الإعداد. */
  source: 'measured' | 'configured';
  sampleCount: number;
  configuredMinutes: number;
  /** الفارق بين المقيس والمُعدّ — يُظهر للمُعِدّ كم كان تقديره بعيدًا. */
  driftMinutes: number;
}

/**
 * إيقاع لجنةٍ واحدة. دون الحدّ الأدنى من العيّنات تبقى القيمة المُعدّة، ويُقال ذلك صراحةً
 * بدل أن يُخلط المقيس بالمقدَّر في رقمٍ واحد لا يُعرف أصله.
 */
export function committeeTempo(
  committee: Pick<Committee, 'id' | 'averageSessionMinutes'>,
  samples: SessionTempoSample[],
  minSamples = MIN_TEMPO_SAMPLES,
): TempoReading {
  const configured = Math.max(1, Number(committee.averageSessionMinutes) || 0);
  const recent = recentSamples(samples, committee.id);
  if (recent.length < Math.max(1, minSamples)) {
    return { committeeId: committee.id, minutes: configured, source: 'configured', sampleCount: recent.length, configuredMinutes: configured, driftMinutes: 0 };
  }
  const measured = Math.max(1, Math.round(median(recent.map(x => x.minutes)) * 10) / 10);
  return {
    committeeId: committee.id,
    minutes: measured,
    source: 'measured',
    sampleCount: recent.length,
    configuredMinutes: configured,
    driftMinutes: Math.round((measured - configured) * 10) / 10,
  };
}

/** إيقاع كل اللجان، جاهزًا للحساب: `{ [committeeId]: minutes }`. */
export function tempoMinutesByCommittee(
  committees: Pick<Committee, 'id' | 'averageSessionMinutes'>[],
  samples: SessionTempoSample[],
  minSamples = MIN_TEMPO_SAMPLES,
): Record<string, number> {
  return Object.fromEntries(committees.map(c => [c.id, committeeTempo(c, samples, minSamples).minutes]));
}

/* ── محاسبة التقدير ─────────────────────────────────────────────────────── */

export interface EtaAccuracy {
  version: string;
  sampleCount: number;
  /** متوسّط الخطأ المطلق بالدقائق. */
  meanAbsoluteErrorMinutes: number;
  /** الوسيط — أصدق من المتوسّط حين تُوجد حالاتٌ شاذّة، والقاعة مليئة بها. */
  medianAbsoluteErrorMinutes: number;
  /** الميل: موجبٌ يعني أن النظام يَعِد بأقصر مما يقع. */
  biasMinutes: number;
  /** نسبة من وقع انتظارهم داخل هامش خمس دقائق من الوعد. */
  withinFiveMinutesRate: number;
  /** لا يُحكم على تقديرٍ بعيّنةٍ قليلة. */
  trustworthy: boolean;
  statement: string;
}

export function etaAccuracy(samples: QueueWaitSample[], minSamples = MIN_TEMPO_SAMPLES): EtaAccuracy {
  const rows = samples.filter(x => Number.isFinite(x.predictedMinutes) && Number.isFinite(x.actualMinutes));
  const errors = rows.map(x => x.actualMinutes - x.predictedMinutes);
  const abs = errors.map(Math.abs);
  const within = rows.length ? rows.filter((_, i) => abs[i] <= 5).length / rows.length : 0;
  return {
    version: SESSION_TEMPO_VERSION,
    sampleCount: rows.length,
    meanAbsoluteErrorMinutes: rows.length ? Math.round((abs.reduce((a, b) => a + b, 0) / rows.length) * 10) / 10 : 0,
    medianAbsoluteErrorMinutes: Math.round(median(abs) * 10) / 10,
    biasMinutes: rows.length ? Math.round((errors.reduce((a, b) => a + b, 0) / rows.length) * 10) / 10 : 0,
    withinFiveMinutesRate: Math.round(within * 100) / 100,
    trustworthy: rows.length >= Math.max(1, minSamples),
    statement: 'تقديرُ الدور يُقاس بما وقع فعلًا. الرقم وصفيّ للتخطيط، ولا يُرتَّب به أحد.',
  };
}

/** عبارةٌ تُقرأ عن دقّة التقدير — لا رقمٌ خام يُترك للتأويل. */
export function describeEtaAccuracy(a: EtaAccuracy, ar = true): string {
  if (!a.trustworthy) {
    return ar
      ? `عيّنة صغيرة (${a.sampleCount}) — لا يُحكم على دقّة التقدير بعد.`
      : `Small sample (${a.sampleCount}) — not enough to judge the estimate yet.`;
  }
  const late = a.biasMinutes > 0;
  const dir = ar ? (late ? 'أطول من الوعد' : 'أقصر من الوعد') : (late ? 'longer than promised' : 'shorter than promised');
  return ar
    ? `خطأٌ وسيطه ${a.medianAbsoluteErrorMinutes} دقيقة، والانتظار ${dir} بـ${Math.abs(a.biasMinutes)} دقيقة وسطيًّا. و${Math.round(a.withinFiveMinutesRate * 100)}٪ وقعوا داخل خمس دقائق من الوعد.`
    : `Median error ${a.medianAbsoluteErrorMinutes} min; waits run ${dir} by ${Math.abs(a.biasMinutes)} min on average. ${Math.round(a.withinFiveMinutesRate * 100)}% landed within five minutes of the promise.`;
}
