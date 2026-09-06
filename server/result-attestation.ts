import crypto from 'node:crypto';
import { computePanelScore, panelPenaltyCount, type ScoringCriterion, type ScoringMode, type ScoringSubmission } from '../src/lib/scoring-core';

/*
 * شهادة الخادم على النتيجة.
 *
 * كانت الدرجة تُحسب في المتصفّح وتُكتب كما وصلت، فصحّتها قائمة على سلامة العميل وحده. هنا يعيد
 * الخادم الاحتساب **من إرسالات المحكمين الخام** ويقارن الناتج بالمُدّعى. القاعدة مشتركة مع
 * العميل عمدًا (`scoring-core`) — نسختان تتباعدان فتصير الشهادة على قواعد أخرى — والاستقلال
 * يأتي من المُدخل: الخادم لا يقرأ الدرجة المُرسَلة إلا ليقارنها.
 *
 * الحدّ الصريح: بلا إرسالات أو بلا معايير لا تُمنح موافقة. غياب الدليل يُقال `INSUFFICIENT_EVIDENCE`
 * ولا يُقال «مطابِقة» — الشهادة الفارغة أسوأ من لا شهادة، لأنها تُقرأ ضمانًا.
 */

export type AttestationVerdict = 'AGREES' | 'DISAGREES' | 'INSUFFICIENT_EVIDENCE';

export interface ResultClaim {
  finalScore: number;
  criterionScores?: Record<string, number>;
  penaltyCount?: number;
}

export interface AttestationRequest {
  competitionId: string;
  participantId: string;
  resultId?: string;
  claim: ResultClaim;
  submissions: ScoringSubmission[];
  criteria: ScoringCriterion[];
  mode: ScoringMode;
  dropExtremes?: boolean;
  sessionEventCount?: number;
}

export interface AttestationDiscrepancy { field: string; claimed: number | null; recomputed: number; delta: number }

export interface ResultAttestation {
  protocol: 'MIZAN-RESULT-ATTESTATION-1';
  verdict: AttestationVerdict;
  reason?: string;
  competitionId: string;
  participantId: string;
  resultId?: string;
  recomputed: { finalScore: number; criterionScores: Record<string, number>; penaltyCount: number };
  claimed: ResultClaim;
  discrepancies: AttestationDiscrepancy[];
  evidence: { submissionCount: number; criterionCount: number; mode: ScoringMode; dropExtremes: boolean };
  attestedAt: string;
  inputsSha256: string;
  attestationSha256: string;
}

/** ترتيب المفاتيح ثابت حتى تُعاد البصمة نفسها لنفس المحتوى مهما اختلف ترتيب الإدخال. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
}
const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

/** فرق يُتجاوز عنه: الدرجات مقرّبة لخانتين، فما دون نصف أدنى خانة ضجيجُ تقريب لا خلاف. */
const EPSILON = 0.005;

export function attestResult(req: AttestationRequest): ResultAttestation {
  const attestedAt = new Date().toISOString();
  const submissions = Array.isArray(req.submissions) ? req.submissions : [];
  const criteria = Array.isArray(req.criteria) ? req.criteria : [];
  const dropExtremes = !!req.dropExtremes;
  const inputsSha256 = sha256(canonical({
    competitionId: req.competitionId, participantId: req.participantId,
    submissions, criteria, mode: req.mode, dropExtremes, sessionEventCount: req.sessionEventCount || 0,
  }));

  const base = {
    protocol: 'MIZAN-RESULT-ATTESTATION-1' as const,
    competitionId: String(req.competitionId || ''),
    participantId: String(req.participantId || ''),
    resultId: req.resultId,
    claimed: req.claim,
    evidence: { submissionCount: submissions.length, criterionCount: criteria.length, mode: req.mode, dropExtremes },
    attestedAt, inputsSha256,
  };

  if (!submissions.length || !criteria.length) {
    const empty = { finalScore: 0, criterionScores: {}, penaltyCount: 0 };
    const out = { ...base, verdict: 'INSUFFICIENT_EVIDENCE' as const,
      reason: !submissions.length ? 'NO_JUDGE_SUBMISSIONS' : 'NO_RUBRIC_CRITERIA',
      recomputed: empty, discrepancies: [] as AttestationDiscrepancy[] };
    return { ...out, attestationSha256: sha256(canonical(out)) };
  }

  const panel = computePanelScore({ submissions, criteria, mode: req.mode, dropExtremes });
  const penaltyCount = panelPenaltyCount(submissions, req.sessionEventCount || 0);
  const recomputed = { finalScore: panel.finalScore, criterionScores: panel.criterionScores, penaltyCount };

  const discrepancies: AttestationDiscrepancy[] = [];
  const compare = (field: string, claimed: number | undefined, actual: number) => {
    const c = typeof claimed === 'number' ? claimed : null;
    if (c === null || Math.abs(c - actual) > EPSILON) discrepancies.push({ field, claimed: c, recomputed: actual, delta: c === null ? actual : Number((actual - c).toFixed(4)) });
  };
  compare('finalScore', req.claim?.finalScore, recomputed.finalScore);
  compare('penaltyCount', req.claim?.penaltyCount, recomputed.penaltyCount);
  for (const c of criteria) compare(`criterionScores.${c.id}`, req.claim?.criterionScores?.[c.id], recomputed.criterionScores[c.id]);

  const out = { ...base, verdict: (discrepancies.length ? 'DISAGREES' : 'AGREES') as AttestationVerdict, recomputed, discrepancies };
  return { ...out, attestationSha256: sha256(canonical(out)) };
}
