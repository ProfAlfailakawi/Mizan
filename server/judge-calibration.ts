/**
 * MIZAN — معايرة اتزان المحكمين (الصقر/الحمامة) والتشريح الإحصائي بعد الجلسة
 *
 * مشكلتان حقيقيتان في البطولات الكبرى:
 *  - **اختلاف المسطرة**: محكّم لا يمنح 95 أبدًا وآخر يبدأ من 98. من وقع مع الأول يُظلم بلا ذنب.
 *  - **أثر القطيع والانحياز**: محكّم ينتظر رئيس اللجنة، أو يميل نمطيًا لجنسية بعينها.
 *
 * القاعدة الحاكمة هنا — وهي غير قابلة للتفاوض:
 *   **لا يُعدَّل حكم بشري.** كل ما يخرج من هذا الملف **استشاري** يُعرض لرئيس التحكيم ليقرر هو
 *   مراجعة المقطع الصوتي أو إبقاء النتيجة. لا كتابة على الدرجة، ولا ترتيب بديل يُعتمد آليًا.
 *
 * الأسلوب: تطبيع بايزي بانكماش نحو المتوسط العام (shrinkage). المحكّم قليل الجلسات لا يُحاكم
 * بانحرافٍ محسوب من عيّنة صغيرة؛ يُسحب تقديره نحو المتوسط بقدر قلّة بياناته. هذا يمنع وصم
 * محكّم جديد بأنه «متشدد» من ثلاث جلسات.
 */

export interface JudgeScoreObservation {
  judgeId: string;
  judgeName?: string;
  sessionId: string;
  participantId: string;
  criterionId?: string;
  score: number;
  /** توقيت اعتماد الدرجة — يُستخدم لكشف التبعية الزمنية. */
  submittedAtMs?: number;
  /** جنسية المتسابق — لكشف الانحياز المناطقي فقط، ولا تُعرض في أي واجهة تحكيم. */
  participantCountry?: string;
}

export interface JudgeCalibration {
  judgeId: string;
  judgeName?: string;
  observations: number;
  /** متوسط درجات المحكّم. */
  mean: number;
  /** الانحراف الخام عن متوسط بقية اللجان على المتسابقين أنفسهم. */
  rawBias: number;
  /** الانحراف بعد الانكماش البايزي (المعتمد للعرض). */
  shrunkBias: number;
  /** ثقة التقدير 0..1 — تزيد بعدد الملاحظات. */
  confidence: number;
  tendency: 'HAWK' | 'DOVE' | 'BALANCED' | 'INSUFFICIENT_DATA';
}

export interface CalibrationReport {
  protocol: 'MIZAN-JUDGE-CALIBRATION-1';
  advisoryOnly: true;
  note: string;
  globalMean: number;
  priorStrength: number;
  judges: JudgeCalibration[];
}

/** قوة السابق البايزي: عدد الملاحظات التي يعادلها الافتراض المسبق «المحكّم متزن». */
export const DEFAULT_PRIOR_STRENGTH = 8;
/** عتبة اعتبار الميل ذا دلالة عملية (بالدرجات). */
export const TENDENCY_THRESHOLD = 0.75;

export function calibrateJudges(observations: JudgeScoreObservation[], options: { priorStrength?: number; threshold?: number } = {}): CalibrationReport {
  const priorStrength = options.priorStrength ?? DEFAULT_PRIOR_STRENGTH;
  const threshold = options.threshold ?? TENDENCY_THRESHOLD;

  // متوسط كل (متسابق، معيار) عبر جميع المحكمين — هو المرجع الذي يُقاس عليه انحراف الفرد.
  const key = (o: JudgeScoreObservation) => `${o.sessionId}|${o.participantId}|${o.criterionId || '*'}`;
  const groups = new Map<string, JudgeScoreObservation[]>();
  for (const o of observations) {
    const k = key(o);
    const g = groups.get(k);
    if (g) g.push(o); else groups.set(k, [o]);
  }

  const all = observations.map((o) => o.score);
  const globalMean = all.length ? all.reduce((n, x) => n + x, 0) / all.length : 0;

  const perJudge = new Map<string, { name?: string; scores: number[]; deltas: number[] }>();
  for (const [, group] of groups) {
    // مرجع كل محكّم: متوسط زملائه على نفس المتسابق والمعيار (استبعاد الذات يمنع مقارنة المرء بنفسه).
    for (const o of group) {
      const peers = group.filter((x) => x.judgeId !== o.judgeId);
      if (!peers.length) continue;
      const peerMean = peers.reduce((n, x) => n + x.score, 0) / peers.length;
      const entry = perJudge.get(o.judgeId) || { name: o.judgeName, scores: [], deltas: [] };
      entry.name = entry.name || o.judgeName;
      entry.scores.push(o.score);
      entry.deltas.push(o.score - peerMean);
      perJudge.set(o.judgeId, entry);
    }
  }

  const judges: JudgeCalibration[] = [];
  for (const [judgeId, e] of perJudge) {
    const n = e.deltas.length;
    const rawBias = n ? e.deltas.reduce((a, b) => a + b, 0) / n : 0;
    // الانكماش نحو الصفر (لا انحياز) بقدر قلّة البيانات: n/(n+k)
    const shrunkBias = rawBias * (n / (n + priorStrength));
    const confidence = n / (n + priorStrength);
    const mean = e.scores.length ? e.scores.reduce((a, b) => a + b, 0) / e.scores.length : 0;
    const tendency: JudgeCalibration['tendency'] = n < 3 ? 'INSUFFICIENT_DATA'
      : shrunkBias <= -threshold ? 'HAWK'
      : shrunkBias >= threshold ? 'DOVE' : 'BALANCED';
    judges.push({ judgeId, judgeName: e.name, observations: n, mean, rawBias, shrunkBias, confidence, tendency });
  }

  judges.sort((a, b) => a.shrunkBias - b.shrunkBias);
  return {
    protocol: 'MIZAN-JUDGE-CALIBRATION-1',
    advisoryOnly: true,
    note: 'مؤشر استشاري لرئيس التحكيم. لا يعدّل أي درجة بشرية ولا يعيد ترتيب النتائج؛ غايته توجيه مراجعة المقاطع الصوتية عند الحاجة.',
    globalMean,
    priorStrength,
    judges,
  };
}

/**
 * الأثر المعياري على الترتيب — «ماذا لو أُزيل انحراف المسطرة؟»
 *
 * يُعرض كسيناريو مقارنة فقط، مصحوبًا بالترتيب الفعلي. لا يُعتمد، ولا يُنشر للجمهور، ولا يدخل
 * حفل التتويج إلا بقرار بشري موثّق بعد مراجعة الأدلة.
 */
export interface RankScenarioRow { participantId: string; actualScore: number; normalizedScore: number; actualRank: number; normalizedRank: number; rankDelta: number }
export function normalizedRankScenario(observations: JudgeScoreObservation[], calibration: CalibrationReport): RankScenarioRow[] {
  const biasOf = new Map(calibration.judges.map((j) => [j.judgeId, j.shrunkBias]));
  const byParticipant = new Map<string, { actual: number[]; normalized: number[] }>();
  for (const o of observations) {
    const e = byParticipant.get(o.participantId) || { actual: [], normalized: [] };
    e.actual.push(o.score);
    e.normalized.push(o.score - (biasOf.get(o.judgeId) || 0));
    byParticipant.set(o.participantId, e);
  }
  const rows = [...byParticipant.entries()].map(([participantId, e]) => ({
    participantId,
    actualScore: e.actual.reduce((a, b) => a + b, 0) / e.actual.length,
    normalizedScore: e.normalized.reduce((a, b) => a + b, 0) / e.normalized.length,
    actualRank: 0, normalizedRank: 0, rankDelta: 0,
  }));
  [...rows].sort((a, b) => b.actualScore - a.actualScore).forEach((r, i) => { r.actualRank = i + 1 });
  [...rows].sort((a, b) => b.normalizedScore - a.normalizedScore).forEach((r, i) => { r.normalizedRank = i + 1 });
  for (const r of rows) r.rankDelta = r.actualRank - r.normalizedRank;
  return rows.sort((a, b) => a.actualRank - b.actualRank);
}
