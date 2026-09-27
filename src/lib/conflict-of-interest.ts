/*
 * تضارب المصالح والتنحّي في التحكيم.
 *
 * المحكّم يعلن تضاربًا (طالبه، قريبه، مؤسسته…) أو يتنحّى أو يمتنع بسبب مكتوب. ورئيس
 * التحكيم أو الإدارة يراجع ويقرّر: نقل المتسابق إلى لجنة أخرى، أو استبدال المحكّم، أو
 * الإبقاء مع توثيق السبب، أو رفض الإعلان. ولا يُمحى شيء: التعيين الأصلي يُحفظ لقطةً داخل
 * الحالة، والقرار يُضاف إليها ولا يُكتب فوقها.
 *
 * والقاعدة التي يعتمد عليها التحكيم: محكّمٌ له حالة مفتوحة أو تضاربٌ صلب مع متسابق لا
 * يحكّم ذلك المتسابق حتى يُحسم الأمر بقرارٍ يسمح بذلك صراحةً.
 *
 * وحدة نقيّة: لا شبكة ولا حالة عامة.
 */

export type ConflictKind = 'declared_conflict' | 'recusal' | 'abstention';
export type ConflictRelation = 'student' | 'relative' | 'institution' | 'employer' | 'prior_judging' | 'other';
export type ConflictDecision = 'reassigned_participant' | 'replaced_judge' | 'upheld_no_action' | 'rejected';

export interface ConflictCase {
  id: string;
  competitionId: string;
  organizationId: string;
  judgeId: string;
  declaredByUid: string;
  /** Role of the declarer. A judge-declared case is binding only when the declarer is that judge (see judgeMayScore). */
  declaredByRole?: string;
  participantId?: string;
  institution?: string;
  kind: ConflictKind;
  relation: ConflictRelation;
  hardConflict: boolean;
  reason: string;
  status: 'open' | 'resolved';
  declaredAt: string;
  /** لقطة التعيين وقت الإعلان — لا تتغيّر بعد ذلك. */
  originalAssignment: { committeeId?: string; judgeIds: string[] };
  resolution?: {
    decision: ConflictDecision;
    note: string;
    resolvedBy: string;
    resolvedByRole: string;
    resolvedAt: string;
    reassignedToCommitteeId?: string;
    replacementJudgeId?: string;
    /** هل يجوز للمحكّم تحكيم هذا المتسابق بعد القرار؟ صحيحٌ فقط لـ upheld/rejected. */
    judgeMayScore: boolean;
  };
}

export const REVIEWER_ROLES = ['super_admin', 'org_admin', 'comp_admin', 'head_judge'] as const;

export interface DeclareInput {
  id: string;
  competitionId: string;
  organizationId: string;
  judgeId: string;
  declaredByUid: string;
  /** Role of the declarer. A judge-declared case is binding only when the declarer is that judge (see judgeMayScore). */
  declaredByRole?: string;
  participantId?: string;
  institution?: string;
  kind: ConflictKind;
  relation: ConflictRelation;
  reason: string;
  committeeId?: string;
  committeeJudgeIds: string[];
  now: string;
}

export class ConflictError extends Error {}

export function declareConflict(existing: readonly ConflictCase[], input: DeclareInput): ConflictCase {
  const reason = String(input.reason || '').trim();
  if (reason.length < 5) throw new ConflictError('CONFLICT_REASON_REQUIRED');
  if (!input.participantId && !String(input.institution || '').trim()) throw new ConflictError('CONFLICT_SUBJECT_REQUIRED');
  if (!['declared_conflict', 'recusal', 'abstention'].includes(input.kind)) throw new ConflictError('CONFLICT_KIND_INVALID');
  const duplicate = existing.find(c => c.status === 'open' && c.judgeId === input.judgeId && c.participantId === input.participantId && (c.institution || '') === (input.institution || ''));
  if (duplicate) return duplicate;
  return {
    id: input.id, competitionId: input.competitionId, organizationId: input.organizationId, judgeId: input.judgeId, declaredByUid: input.declaredByUid, declaredByRole: input.declaredByRole,
    participantId: input.participantId, institution: String(input.institution || '').trim() || undefined, kind: input.kind, relation: input.relation,
    /* التنحّي والتضارب مع طالبٍ أو قريبٍ صلبٌ دائمًا؛ الامتناع لسببٍ آخر يُراجَع. */
    hardConflict: input.kind === 'recusal' || ['student', 'relative'].includes(input.relation),
    reason: reason.slice(0, 1000), status: 'open', declaredAt: input.now,
    originalAssignment: { committeeId: input.committeeId, judgeIds: [...input.committeeJudgeIds] },
  };
}

export interface ResolveInput {
  decision: ConflictDecision;
  note: string;
  actorId: string;
  actorRole: string;
  now: string;
  reassignedToCommitteeId?: string;
  replacementJudgeId?: string;
}

export function resolveConflict(c: ConflictCase, input: ResolveInput): ConflictCase {
  if (!(REVIEWER_ROLES as readonly string[]).includes(input.actorRole)) throw new ConflictError('CONFLICT_REVIEWER_REQUIRED');
  if (c.status !== 'open') throw new ConflictError('CONFLICT_ALREADY_RESOLVED');
  if (input.actorId === c.declaredByUid) throw new ConflictError('CONFLICT_SELF_RESOLUTION_BLOCKED');
  const note = String(input.note || '').trim();
  if (note.length < 5) throw new ConflictError('CONFLICT_RESOLUTION_NOTE_REQUIRED');
  if (input.decision === 'reassigned_participant' && !input.reassignedToCommitteeId) throw new ConflictError('CONFLICT_TARGET_COMMITTEE_REQUIRED');
  if (input.decision === 'reassigned_participant' && input.reassignedToCommitteeId === c.originalAssignment.committeeId) throw new ConflictError('CONFLICT_TARGET_COMMITTEE_UNCHANGED');
  if (input.decision === 'replaced_judge' && (!input.replacementJudgeId || input.replacementJudgeId === c.judgeId)) throw new ConflictError('CONFLICT_REPLACEMENT_JUDGE_REQUIRED');
  /* تضاربٌ صلب مع طالبٍ أو قريب لا يُبقى المحكّمُ معه على المتسابق نفسه. */
  if (input.decision === 'upheld_no_action' && c.hardConflict && (c.relation === 'student' || c.relation === 'relative')) throw new ConflictError('CONFLICT_HARD_CANNOT_BE_UPHELD');
  return {
    ...c,
    status: 'resolved',
    resolution: {
      decision: input.decision, note: note.slice(0, 1000), resolvedBy: input.actorId, resolvedByRole: input.actorRole, resolvedAt: input.now,
      reassignedToCommitteeId: input.reassignedToCommitteeId, replacementJudgeId: input.replacementJudgeId,
      judgeMayScore: input.decision === 'upheld_no_action' || input.decision === 'rejected',
    },
  };
}

/**
 * Is an open case binding? A reviewer-declared case always is. A judge-declared case is binding
 * only when its authenticated declarer is the judge it names — otherwise one judge could forge a
 * case against another and block them. Unverified cases stay visible for the head judge to rule on.
 */
export function caseIsBinding(c: ConflictCase, judgeUids?: Record<string, string | undefined>) {
  if (c.status === 'resolved') return true;
  if (c.declaredByRole !== 'judge') return true;
  const uid = judgeUids?.[c.judgeId];
  /* محكّمٌ بلا هويةٍ مربوطة لا يمكن التحقق منه: يبقى الإعلان ملزمًا احتياطًا للنزاهة
     (يُبعد المحكّم ولا يُقرِّبه)، ويظهر لرئيس التحكيم «غير قابل للتحقق» ليحسمه. */
  if (!uid) return true;
  return uid === c.declaredByUid;
}

/** For the review UI: 'verified', 'forged' (declarer is another judge) or 'unverifiable' (no identity link). */
export function caseVerification(c: ConflictCase, judgeUids?: Record<string, string | undefined>): 'verified' | 'forged' | 'unverifiable' {
  if (c.declaredByRole !== 'judge') return 'verified';
  const uid = judgeUids?.[c.judgeId];
  if (!uid) return 'unverifiable';
  return uid === c.declaredByUid ? 'verified' : 'forged';
}

/** May this judge score this participant, given the conflict cases? */
export function judgeMayScore(cases: readonly ConflictCase[], judgeId: string, participant: { id: string; institution?: string }, judgeUids?: Record<string, string | undefined>): { allowed: boolean; caseId?: string } {
  const inst = String(participant.institution || '').trim().toLowerCase();
  for (const c of cases) {
    if (c.judgeId !== judgeId) continue;
    if (!caseIsBinding(c, judgeUids)) continue;
    const matches = c.participantId ? c.participantId === participant.id : !!inst && String(c.institution || '').trim().toLowerCase() === inst;
    if (!matches) continue;
    if (c.status === 'open') return { allowed: false, caseId: c.id };
    if (c.resolution && !c.resolution.judgeMayScore) return { allowed: false, caseId: c.id };
  }
  return { allowed: true };
}

/** Committees in which no panel judge is blocked for this participant. */
export function eligibleCommittees<T extends { id: string; judgeIds: string[] }>(committees: readonly T[], cases: readonly ConflictCase[], participant: { id: string; institution?: string }, judgeUids?: Record<string, string | undefined>): T[] {
  return committees.filter(k => k.judgeIds.every(j => judgeMayScore(cases, j, participant, judgeUids).allowed));
}
