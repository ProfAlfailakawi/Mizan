import { getCompetitionPolicy } from '../src/lib/competition-config';
import type { ScoringCriterion, ScoringSubmission } from '../src/lib/scoring-core';

/*
 * مدخلاتُ الختم من المخزَّن، لا من الطلب.
 *
 * كان مسارُ الختم يأخذ إرسالات المحكمين والمعايير والنمط من جسم الطلب، فيستطيع رئيسُ
 * تحكيمٍ أو مديرُ مسابقة أن ينال ختمًا موقَّعًا من الخادم على درجاتٍ يكتبها بيده. والتوقيعُ
 * يشهد بأن الخادم حسب، لا بأن ما حسبه هو ما منحه المحكّمون.
 *
 * فتُقرأ هنا من وثائق Firestore التي كتبها المحكّمون أنفسهم (`judge_submissions`، وقاعدتُها
 * تقصر الكتابة على المحكّم صاحب الإرسال) ومن وثيقة المسابقة (الجدول والسياسة). ولا يتغيّر
 * شيءٌ في الاحتساب: الدالّة نفسها (`computePanelScore`) والجدولُ نفسه الذي يختاره العميل —
 * جدولُ أوّل إرسالٍ مقفل إن حمل نسخةً، وإلا الجدول الحاضر.
 */

export interface StoredSealInputs {
  sessionId: string;
  submissions: Array<ScoringSubmission & Record<string, unknown>>;
  criteria: ScoringCriterion[];
  mode: string;
  dropExtremes: boolean;
}
export type StoredSealOutcome =
  | { ok: true; inputs: StoredSealInputs }
  | { ok: false; code: 'SEAL_COMPETITION_NOT_FOUND' | 'SEAL_NO_STORED_SUBMISSIONS' | 'SEAL_RULESET_NOT_FOUND' };

interface RuleSetLike { id?: string; version?: string; criteria?: Array<{ id?: unknown; maxScore?: unknown }>; dropExtremes?: boolean }

/** نفسُ منطق `ruleSetRevision` في العميل (src/lib/store.ts). */
function ruleSetRevision(comp: any, id?: string, version?: string): RuleSetLike | undefined {
  if (!id || !version) return undefined;
  const pool: RuleSetLike[] = Array.isArray(comp?.ruleSets) ? comp.ruleSets : [];
  const live: RuleSetLike | undefined = comp?.ruleSet;
  if (live && live.id === id && live.version === version) return live;
  return pool.find(r => r.id === id && r.version === version) || pool.find(r => r.id === `${id}#${version}`);
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : undefined; };

/*
 * الحقولُ التي يقوم عليها الاحتساب والنسب وحدها. حقولُ المزامنة (`updatedAt` وغيرها) تتغيّر
 * مع كل رفعٍ ولا تمسّ الدرجة، فإدخالُها في البصمة يُفسد كشفَ إعادة الختم بنفس المدخلات.
 */
function projectSubmission(row: any): ScoringSubmission & Record<string, unknown> {
  const criterionScores: Record<string, number> = {};
  for (const [k, v] of Object.entries(row?.criterionScores && typeof row.criterionScores === 'object' ? row.criterionScores : {})) {
    const n = num(v); if (n !== undefined) criterionScores[k] = n;
  }
  return {
    judgeId: String(row?.judgeId || ''),
    sessionId: String(row?.sessionId || ''),
    participantId: String(row?.participantId || ''),
    totalScore: num(row?.totalScore) ?? 0,
    criterionScores,
    scoredCriterionIds: Array.isArray(row?.scoredCriterionIds) ? row.scoredCriterionIds.map(String) : undefined,
    sessionPenaltyCount: num(row?.sessionPenaltyCount),
    submittedAt: row?.submittedAt ? String(row.submittedAt) : undefined,
    ruleSetId: row?.ruleSetId ? String(row.ruleSetId) : undefined,
    ruleSetVersion: row?.ruleSetVersion ? String(row.ruleSetVersion) : undefined,
  };
}

/**
 * @param competitionDoc وثيقةُ `organizations/{org}/competitions/{comp}` كما هي في Firestore.
 * @param submissionDocs وثائقُ `judge_submissions` لهذه المسابقة.
 */
export function sealInputsFromStore(competitionDoc: any, submissionDocs: unknown[], participantId: string): StoredSealOutcome {
  const comp = competitionDoc?.competition;
  if (!comp || typeof comp !== 'object') return { ok: false, code: 'SEAL_COMPETITION_NOT_FOUND' };
  const locked = (submissionDocs || [])
    .filter((r: any) => r && r.participantId === participantId && r.locked === true)
    .map(projectSubmission)
    .sort((a, b) => String(a.submittedAt || '').localeCompare(String(b.submittedAt || ''))
      || String(a.judgeId).localeCompare(String(b.judgeId)));
  if (!locked.length) return { ok: false, code: 'SEAL_NO_STORED_SUBMISSIONS' };
  const first = locked[0];
  const ruleSet = ruleSetRevision(comp, first.ruleSetId as string | undefined, first.ruleSetVersion as string | undefined) || comp.ruleSet;
  if (!ruleSet || !Array.isArray(ruleSet.criteria) || !ruleSet.criteria.length) return { ok: false, code: 'SEAL_RULESET_NOT_FOUND' };
  const criteria = ruleSet.criteria.map((c: any) => ({ id: String(c?.id || ''), maxScore: num(c?.maxScore) ?? 0 }));
  return {
    ok: true,
    inputs: {
      sessionId: String(first.sessionId || ''),
      submissions: locked,
      criteria,
      mode: String(getCompetitionPolicy(comp).judging.mode),
      dropExtremes: !!ruleSet.dropExtremes,
    },
  };
}
