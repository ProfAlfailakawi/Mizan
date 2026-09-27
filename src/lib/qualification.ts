/*
 * هرم التأهيل: تصفيات محلية → إقليمية → نهائي وطني → نهائي دولي.
 *
 * العلاقة بين مسابقتين صريحة (`qualifier_for`) ومعها قاعدة التأهل (أفضل N لكل فئة، أو حدّ
 * أدنى للدرجة، أو كلاهما) وخريطة الفئات بين المرحلتين. والتأهل يُحسب من النتائج المختومة أو
 * المنشورة وحدها، ويحمل دليله: معرّف النتيجة، المرتبة، الدرجة، وبصمة الختم.
 *
 * والنقل لا يسجّل أحدًا تلقائيًا: يُنشئ دعوةً (`invited`) تحمل هوية المتسابق ومصدر تأهله،
 * ويبقى قبولها — بموافقاته وأهلية المرحلة الجديدة — قرارًا في المسابقة المستهدفة.
 *
 * وحدة نقيّة.
 */
import type { Participant, ResultRecord } from '../types';

export interface QualificationRule { topN?: number; minScore?: number; perCategory: boolean; categoryMap?: Record<string, string> }
export interface CompetitionRelationship {
  id: string;
  organizationId: string;
  parentCompetitionId: string; // the later stage (e.g. national final)
  childCompetitionId: string;  // the qualifier
  type: 'qualifier_for';
  stageLabel?: string;
  rule: QualificationRule;
  createdAt: string;
  createdBy: string;
}
export interface QualificationRecord {
  id: string;
  relationshipId: string;
  sourceCompetitionId: string;
  targetCompetitionId: string;
  sourceParticipantId: string;
  sourceResultId: string;
  sourceCategoryId: string;
  targetCategoryId?: string;
  rank: number;
  score: number;
  status: 'qualified' | 'invited' | 'accepted' | 'declined' | 'revoked';
  evidence: { resultStatus: ResultRecord['status']; sealChecksum?: string; sealedAt?: string };
  targetParticipantId?: string;
  decidedAt: string;
  decidedBy: string;
  history: { at: string; by: string; from: string; to: string; note?: string }[];
}

export class QualificationError extends Error {}

const FINAL_RESULT_STATES: ResultRecord['status'][] = ['sealed', 'published'];

export function createRelationship(existing: readonly CompetitionRelationship[], input: Omit<CompetitionRelationship, 'type'>): CompetitionRelationship {
  if (input.parentCompetitionId === input.childCompetitionId) throw new QualificationError('QUALIFICATION_SELF_REFERENCE');
  if (!input.rule.topN && input.rule.minScore === undefined) throw new QualificationError('QUALIFICATION_RULE_REQUIRED');
  if (input.rule.topN !== undefined && !(Number.isInteger(input.rule.topN) && input.rule.topN > 0)) throw new QualificationError('QUALIFICATION_TOPN_INVALID');
  /* لا دوائر: لا يجوز أن تكون المرحلة الأعلى تصفيةً لمرحلةٍ تحتها. */
  const reaches = (from: string, to: string, seen = new Set<string>()): boolean => {
    if (from === to) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return existing.filter(r => r.childCompetitionId === from).some(r => reaches(r.parentCompetitionId, to, seen));
  };
  if (reaches(input.parentCompetitionId, input.childCompetitionId)) throw new QualificationError('QUALIFICATION_CYCLE');
  if (existing.some(r => r.parentCompetitionId === input.parentCompetitionId && r.childCompetitionId === input.childCompetitionId)) throw new QualificationError('QUALIFICATION_RELATIONSHIP_EXISTS');
  return { ...input, type: 'qualifier_for' };
}

/** Deterministic qualifiers from final (sealed/published) results only. */
export function computeQualifiers(relationship: CompetitionRelationship, results: readonly ResultRecord[], now: string, actor: string, newId: () => string): QualificationRecord[] {
  const finals = results.filter(r => r.competitionId === relationship.childCompetitionId && FINAL_RESULT_STATES.includes(r.status));
  const groups = new Map<string, ResultRecord[]>();
  for (const r of finals) {
    const key = relationship.rule.perCategory ? r.categoryId : '*';
    groups.set(key, [...(groups.get(key) || []), r]);
  }
  const out: QualificationRecord[] = [];
  for (const [, rows] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const ranked = [...rows].sort((a, b) => a.rank - b.rank || b.finalScore - a.finalScore || a.participantId.localeCompare(b.participantId));
    const picked = ranked.filter((r, i) => (relationship.rule.topN === undefined || i < relationship.rule.topN) && (relationship.rule.minScore === undefined || r.finalScore >= relationship.rule.minScore));
    for (const r of picked) out.push({
      id: newId(), relationshipId: relationship.id, sourceCompetitionId: r.competitionId, targetCompetitionId: relationship.parentCompetitionId,
      sourceParticipantId: r.participantId, sourceResultId: r.id, sourceCategoryId: r.categoryId, targetCategoryId: relationship.rule.categoryMap?.[r.categoryId],
      rank: r.rank, score: r.finalScore, status: 'qualified',
      evidence: { resultStatus: r.status, sealChecksum: r.sealMetadata?.cryptographicChecksum, sealedAt: r.sealMetadata?.sealedAt },
      decidedAt: now, decidedBy: actor, history: [{ at: now, by: actor, from: 'none', to: 'qualified' }],
    });
  }
  return out;
}

/** Merge a fresh computation into existing records without duplicating or reviving revoked ones. */
export function mergeQualifications(existing: readonly QualificationRecord[], fresh: readonly QualificationRecord[]) {
  const key = (q: QualificationRecord) => `${q.relationshipId}|${q.sourceParticipantId}`;
  const known = new Set(existing.map(key));
  return [...existing, ...fresh.filter(q => !known.has(key(q)))];
}

export function transitionQualification(q: QualificationRecord, to: QualificationRecord['status'], by: string, at: string, note?: string): QualificationRecord {
  const allowed: Record<QualificationRecord['status'], QualificationRecord['status'][]> = {
    qualified: ['invited', 'revoked'], invited: ['accepted', 'declined', 'revoked'], accepted: ['revoked'], declined: [], revoked: [],
  };
  if (!allowed[q.status].includes(to)) throw new QualificationError(`QUALIFICATION_TRANSITION_INVALID:${q.status}->${to}`);
  if (to === 'revoked' && String(note || '').trim().length < 5) throw new QualificationError('QUALIFICATION_REVOKE_REASON_REQUIRED');
  return { ...q, status: to, decidedAt: at, decidedBy: by, history: [...q.history, { at, by, from: q.status, to, note }] };
}

/**
 * Invitation into the target stage: a new participant record carrying the same identity and the
 * provenance of the qualification. Status `draft` — not a registration until the person confirms.
 * Operational fields (scores, attendance, results) are never carried over.
 */
export function invitationParticipant(q: QualificationRecord, source: Participant, target: { competitionId: string; organizationId: string }, ids: { id: string; code: string }, at: string): Participant {
  if (q.status !== 'qualified') throw new QualificationError('QUALIFICATION_NOT_INVITABLE');
  if (source.id !== q.sourceParticipantId) throw new QualificationError('QUALIFICATION_SOURCE_MISMATCH');
  return {
    id: ids.id, code: ids.code, competitionId: target.competitionId, organizationId: target.organizationId,
    fullName: source.fullName, fullNameArabic: source.fullNameArabic, email: source.email, phone: source.phone, country: source.country,
    nationality: source.nationality, nationalIdOrPassport: source.nationalIdOrPassport, identityLast4: source.identityLast4, dateOfBirth: source.dateOfBirth,
    gender: source.gender, categoryId: q.targetCategoryId || '', riwaya: source.riwaya, institution: source.institution, delegationId: source.delegationId,
    status: 'draft', statusHistory: [{ status: 'draft', timestamp: at, actor: 'Qualification invitation', reason: `Qualified from ${q.sourceCompetitionId} rank ${q.rank}` }],
    qualifiedFrom: { competitionId: q.sourceCompetitionId, participantId: q.sourceParticipantId, qualificationId: q.id, rank: q.rank, score: q.score, resultId: q.sourceResultId, sealChecksum: q.evidence.sealChecksum },
  } as Participant;
}

/** The chain of stages above and below a competition, for the hierarchy view. */
export function hierarchyOf(relationships: readonly CompetitionRelationship[], competitionId: string) {
  const up: CompetitionRelationship[] = [], down: CompetitionRelationship[] = [];
  let cursor = competitionId; const seen = new Set<string>();
  while (!seen.has(cursor)) { seen.add(cursor); const r = relationships.find(x => x.childCompetitionId === cursor); if (!r) break; up.push(r); cursor = r.parentCompetitionId; }
  const walk = (id: string, depth: number) => { if (depth > 10) return; for (const r of relationships.filter(x => x.parentCompetitionId === id)) { down.push(r); walk(r.childCompetitionId, depth + 1); } };
  walk(competitionId, 0);
  return { up, down };
}
