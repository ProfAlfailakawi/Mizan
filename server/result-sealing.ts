import crypto from 'node:crypto';
import { attestResult, type ResultAttestation } from './result-attestation';
import { computePanelScore, panelPenaltyCount, breakTie, type ScoringCriterion, type ScoringSubmission } from '../src/lib/scoring-core';

/*
 * ختم النتيجة على الخادم.
 *
 * صار الخادم يعيد احتساب النتيجة ويشهد عليها، لكنه ظلّ يشهد على رقمٍ **ألّفه العميل**. والشهادة
 * تكشف الخلاف ولا تمنع أن يكون المصدر واحدًا يمكن أن يخطئ أو يُبدَّل.
 *
 * هنا يؤلّف الخادم الرقم بنفسه من إرسالات المحكمين، ويختمه. الختم ليس تشفيرًا للثقة بل **مرساة
 * قابلة لإعادة الحساب**: من يملك الإرسالات نفسها يعيد إنتاج البصمة ذاتها، فأي تبديل لاحق في
 * الدرجة يظهر بمقارنة بسيطة لا بتصديق أحد.
 *
 * وما يبقى للبشر يبقى: الختم يسجّل من طلبه، ولا يُصدر إن لم تكتمل الأدلة، ولا يُعيد ختم نتيجة
 * مختومة بقيمة مختلفة دون أن يقول إنها تغيّرت.
 */

export interface SealRequest {
  competitionId: string;
  participantId: string;
  sessionId: string;
  categoryId?: string;
  submissions: ScoringSubmission[];
  criteria: ScoringCriterion[];
  mode: string;
  dropExtremes?: boolean;
  sessionEventCount?: number;
  /** من طلب الختم — يُسجَّل في الختم نفسه فلا يصير الختم مجهول النسب. */
  sealedBy: string;
  /** ختم سابق لنفس المشارك، إن وُجد: يُقارَن ولا يُدهس. */
  previousSealSha256?: string;
  previousFinalScore?: number;
}

export interface SealedResult {
  protocol: 'MIZAN-RESULT-SEAL-1';
  competitionId: string;
  participantId: string;
  sessionId: string;
  categoryId?: string;
  finalScore: number;
  criterionScores: Record<string, number>;
  penaltyCount: number;
  /** عدد المحكمين الذين قام عليهم هذا الرقم. */
  contributingJudges: number;
  attestation: ResultAttestation;
  sealedBy: string;
  sealedAt: string;
  inputsSha256: string;
  sealSha256: string;
  algorithm: string;
  /** يتغيّر عن ختم سابق؟ يُقال صراحةً بدل أن يُستبدل بصمت. */
  supersedes?: { previousSealSha256: string; previousFinalScore: number; delta: number };
}

export type SealOutcome =
  | { ok: true; sealed: SealedResult }
  | { ok: false; code: 'NO_SUBMISSIONS' | 'NO_CRITERIA' | 'NO_IDENTITY'; message: string };

/*
 * الصورة المعياريّة: ترتيب مفاتيح ثابت، و**إسقاط المفاتيح غير المعرّفة**. الإسقاط ليس تجميلًا:
 * الختم يعبر الشبكة بصيغة JSON، وJSON يحذف المفاتيح غير المعرّفة. لولا إسقاطها هنا لاختلفت
 * البصمة قبل الإرسال عنها بعده، فيفشل التحقّق من ختمٍ صحيح — وهو أسوأ من عدم الختم.
 */
function canonical(value: unknown): string {
  if (value === null || value === undefined || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}
const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

export function sealResult(req: SealRequest): SealOutcome {
  const submissions = Array.isArray(req.submissions) ? req.submissions : [];
  const criteria = Array.isArray(req.criteria) ? req.criteria : [];
  if (!req.competitionId || !req.participantId || !req.sessionId || !req.sealedBy)
    return { ok: false, code: 'NO_IDENTITY', message: 'ختمٌ بلا مسابقة أو مشارك أو جلسة أو خاتم لا يُنسب إلى شيء.' };
  if (!submissions.length) return { ok: false, code: 'NO_SUBMISSIONS', message: 'لا إرسالات محكمين لهذه الجلسة؛ لا يُختم رقم بلا مصدر.' };
  if (!criteria.length) return { ok: false, code: 'NO_CRITERIA', message: 'لا معايير رُبريك؛ لا يُختم رقم بلا قاعدة يُحسب بها.' };

  const panel = computePanelScore({ submissions, criteria, mode: req.mode, dropExtremes: !!req.dropExtremes });
  const penaltyCount = panelPenaltyCount(submissions, req.sessionEventCount || 0);

  // الشهادة تُبنى على الرقم الذي ألّفه الخادم نفسه، فتوثّق أن المختوم هو المُعاد حسابه.
  const attestation = attestResult({
    competitionId: req.competitionId, participantId: req.participantId,
    claim: { finalScore: panel.finalScore, criterionScores: panel.criterionScores, penaltyCount },
    submissions, criteria, mode: req.mode, dropExtremes: !!req.dropExtremes, sessionEventCount: req.sessionEventCount,
  });

  const inputsSha256 = sha256(canonical({
    competitionId: req.competitionId, participantId: req.participantId, sessionId: req.sessionId,
    submissions, criteria, mode: req.mode, dropExtremes: !!req.dropExtremes, sessionEventCount: req.sessionEventCount || 0,
  }));

  const body = {
    protocol: 'MIZAN-RESULT-SEAL-1' as const,
    competitionId: req.competitionId, participantId: req.participantId, sessionId: req.sessionId,
    categoryId: req.categoryId,
    finalScore: panel.finalScore, criterionScores: panel.criterionScores, penaltyCount,
    contributingJudges: submissions.length,
    attestation, sealedBy: req.sealedBy, sealedAt: new Date().toISOString(),
    inputsSha256,
    algorithm: 'SHA-256(canonical(submissions, criteria, mode)) → panel score → sealed digest',
  };

  const supersedes = req.previousSealSha256 && typeof req.previousFinalScore === 'number'
    ? { previousSealSha256: req.previousSealSha256, previousFinalScore: req.previousFinalScore, delta: Number((panel.finalScore - req.previousFinalScore).toFixed(4)) }
    : undefined;

  const sealed: SealedResult = { ...body, supersedes, sealSha256: sha256(canonical({ ...body, supersedes })) };
  return { ok: true, sealed };
}

/** ترتيب النتائج المختومة داخل فئة، بنفس قواعد الرُبريك التي تحكم اللجنة. */
export function rankSealedResults(results: SealedResult[], tieBreakRules: readonly string[] = []): SealedResult[] {
  return [...results].sort((a, b) =>
    (b.finalScore - a.finalScore) ||
    breakTie(a, b, tieBreakRules) ||
    a.participantId.localeCompare(b.participantId));
}

/** إعادة التحقق من ختم: من يملك مدخلاته يعيد إنتاج بصمته. */
export function verifySeal(sealed: SealedResult): boolean {
  const { sealSha256, ...body } = sealed;
  return sha256(canonical(body)) === sealSha256;
}
