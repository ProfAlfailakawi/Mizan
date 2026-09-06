import { attestResult, type ResultAttestation } from './result-attestation';
import { computePanelScore, panelPenaltyCount, breakTie, type ScoringCriterion, type ScoringSubmission } from '../src/lib/scoring-core';

/*
 * بروفة الحِمل — يوم مسابقة كامل قبل يوم المسابقة.
 *
 * البروفة الموجودة قائمة تحقّق: تسأل «هل الميزة موجودة؟». وهذه تسأل السؤال الآخر: «هل تصمد
 * حين يدخل مئتا متسابق على ثماني لجان؟». وهي تقيس شيئين لا واحدًا: الزمن، و**سلامة النتائج على
 * النطاق** — فنظامٌ سريع يُخطئ نتيجةً واحدة من مئتين أسوأ من نظام بطيء يصيبها كلها.
 *
 * حتمية بالبذرة: نفس البذرة تعطي نفس اليوم الاصطناعي، فالانحدار قابل لإعادة الإنتاج لا حكاية.
 */

export interface LoadRehearsalRequest {
  participants: number;
  committees: number;
  judgesPerCommittee: number;
  mode?: string;
  dropExtremes?: boolean;
  seed?: string;
}

export interface StageTiming { stage: string; totalMs: number; p50Ms: number; p95Ms: number; maxMs: number; samples: number }

export interface LoadRehearsalReport {
  protocol: 'MIZAN-LOAD-REHEARSAL-1';
  request: Required<Omit<LoadRehearsalRequest, 'seed'>> & { seed: string };
  participantsScored: number;
  attestationsAgreed: number;
  attestationsDisagreed: number;
  attestationsInsufficient: number;
  /** أول اختلاف يُقابَل، ليُشخَّص لا ليُعدّ فقط. */
  firstDisagreement?: { participantId: string; discrepancies: ResultAttestation['discrepancies'] };
  rankingStable: boolean;
  timings: StageTiming[];
  wallClockMs: number;
  verdict: 'PASS' | 'FAIL';
  failures: string[];
}

const CRITERIA: ScoringCriterion[] = [
  { id: 'memorization', maxScore: 60 },
  { id: 'tajweed', maxScore: 30 },
  { id: 'voice', maxScore: 10 },
];

/** مولّد حتمي بسيط (mulberry32) — لا نريد عشوائية غير قابلة لإعادة الإنتاج في بروفة. */
function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19) }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}
function timing(stage: string, samples: number[]): StageTiming {
  const sorted = [...samples].sort((a, b) => a - b);
  return { stage, totalMs: round(samples.reduce((a, b) => a + b, 0)), p50Ms: round(percentile(sorted, 50)), p95Ms: round(percentile(sorted, 95)), maxMs: round(sorted[sorted.length - 1] || 0), samples: samples.length };
}
const round = (v: number) => Number(v.toFixed(3));

export function runLoadRehearsal(req: LoadRehearsalRequest): LoadRehearsalReport {
  const participants = Math.max(1, Math.floor(req.participants));
  const committees = Math.max(1, Math.floor(req.committees));
  const judgesPerCommittee = Math.max(1, Math.floor(req.judgesPerCommittee));
  const mode = req.mode || 'all_judges_all_criteria';
  const dropExtremes = !!req.dropExtremes;
  const seed = req.seed || 'mizan-load-rehearsal';
  const rand = rng(seed);
  const startedAt = Date.now();

  const scoreSamples: number[] = [], attestSamples: number[] = [];
  const results: { participantId: string; categoryId: string; finalScore: number; criterionScores: Record<string, number>; penaltyCount: number }[] = [];
  let agreed = 0, disagreed = 0, insufficient = 0;
  let firstDisagreement: LoadRehearsalReport['firstDisagreement'];

  for (let i = 0; i < participants; i++) {
    const participantId = `p${String(i + 1).padStart(4, '0')}`;
    const committee = i % committees;
    const submissions: ScoringSubmission[] = [];
    for (let j = 0; j < judgesPerCommittee; j++) {
      const m = 40 + Math.floor(rand() * 21), t = 18 + Math.floor(rand() * 13), v = 5 + Math.floor(rand() * 6);
      submissions.push(mode === 'all_judges_all_criteria'
        ? { totalScore: m + t + v, criterionScores: { memorization: m, tajweed: t, voice: v }, sessionPenaltyCount: rand() < 0.1 ? 1 : 0 }
        // لجنة متخصّصة: كل محكّم يحمل معيارًا واحدًا بالدور.
        : { totalScore: m + t + v, criterionScores: { [CRITERIA[j % CRITERIA.length].id]: [m, t, v][j % 3] }, scoredCriterionIds: [CRITERIA[j % CRITERIA.length].id], sessionPenaltyCount: rand() < 0.1 ? 1 : 0 });
    }

    let t0 = performance.now();
    const panel = computePanelScore({ submissions, criteria: CRITERIA, mode, dropExtremes });
    const penaltyCount = panelPenaltyCount(submissions, 0);
    scoreSamples.push(performance.now() - t0);

    t0 = performance.now();
    const attestation = attestResult({
      competitionId: 'load-rehearsal', participantId, resultId: `r-${participantId}`,
      claim: { finalScore: panel.finalScore, criterionScores: panel.criterionScores, penaltyCount },
      submissions, criteria: CRITERIA, mode, dropExtremes,
    });
    attestSamples.push(performance.now() - t0);

    if (attestation.verdict === 'AGREES') agreed++;
    else if (attestation.verdict === 'DISAGREES') { disagreed++; if (!firstDisagreement) firstDisagreement = { participantId, discrepancies: attestation.discrepancies } }
    else insufficient++;

    results.push({ participantId, categoryId: `cat${committee % 3}`, finalScore: panel.finalScore, criterionScores: panel.criterionScores, penaltyCount });
  }

  // الترتيب حتمي: نفس المدخلات تُرتَّب بنفس الشكل مرّتين، وإلا فترتيب اليوم غير قابل للدفاع عنه.
  const t0 = performance.now();
  const rankOnce = () => [...results].sort((a, b) => (b.finalScore - a.finalScore) || breakTie(a, b, ['memorization_priority', 'tajweed_priority', 'fewest_penalties']) || a.participantId.localeCompare(b.participantId)).map((r) => r.participantId);
  const first = rankOnce(), second = rankOnce();
  const rankingStable = first.length === second.length && first.every((v, i) => v === second[i]);
  const rankSamples = [performance.now() - t0];

  const failures: string[] = [];
  if (disagreed) failures.push(`${disagreed} result(s) failed server attestation`);
  if (insufficient) failures.push(`${insufficient} result(s) had insufficient evidence to attest`);
  if (!rankingStable) failures.push('ranking was not deterministic across two passes');
  if (agreed !== participants) failures.push(`only ${agreed}/${participants} results were attested as agreeing`);

  return {
    protocol: 'MIZAN-LOAD-REHEARSAL-1',
    request: { participants, committees, judgesPerCommittee, mode, dropExtremes, seed },
    participantsScored: results.length,
    attestationsAgreed: agreed, attestationsDisagreed: disagreed, attestationsInsufficient: insufficient,
    firstDisagreement, rankingStable,
    timings: [timing('panel-score', scoreSamples), timing('server-attestation', attestSamples), timing('ranking', rankSamples)],
    wallClockMs: Date.now() - startedAt,
    verdict: failures.length ? 'FAIL' : 'PASS',
    failures,
  };
}
