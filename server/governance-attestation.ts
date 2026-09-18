/*
 * أربعةُ أفعالٍ حاكمة يشهد بها الخادم.
 *
 * هذه الأربعة تقع اليوم في العميل: هو يفحص الصلاحية، وهو يكتب الأثر. والفحصُ في جهازٍ
 * يملكه صاحبُ المصلحة ليس فحصًا، والأثرُ الذي يؤلّفه من يُحتجّ عليه ليس أثرًا.
 *
 *   · تغييرُ دور        — من يرفع دورَ حسابٍ يرفع صلاحيةً، وقد يرفعها لنفسه.
 *   · تغييرُ سياسة      — لائحةُ المسابقة تُغيَّر بعد أن بُني عليها تحكيم.
 *   · تصحيحُ درجة       — رقمٌ يتغيّر بعد أن رآه صاحبُه.
 *   · تغييرُ روايةِ مشارك — والسؤالُ يُسحب على الرواية، فتغييرُها بعد السحب يُبطله.
 *
 * والقراراتُ هنا منطقٌ نقيّ: بلا شبكةٍ ولا تخزين، لتُختبر كما هي، ويقرؤها المسارُ من
 * مكانٍ واحد فلا تفترق السياسةُ عن تنفيذها. وكلُّ رفضٍ باسمٍ يُقرأ، لا برايةٍ صامتة.
 */

import { resolveReading, resolveReadings } from '../src/lib/scientific-core';

export type Attestation<T> = { code: string; detail?: string } | T;

/*
 * ملحوظةٌ عن تغيير الدور.
 *
 * لا قرارَ له هنا، وليس سهوًا: `server/identity-governance.ts` يفصل فيه بالفعل —
 * `updateGrant` و`suspendGrant` و`removeGrant` تفرض مصفوفةَ المنح، وبقاءَ مدير الجهة،
 * وانغلاقَ المسابقة، ومنعَ التكرار، وتُلغي الجلساتِ القائمة. وبناءُ قرارٍ ثانٍ هنا
 * يخلق مصدرَي حقيقةٍ يفترقان بعد أوّل تعديل.
 *
 * والناقصُ كان الأثر لا القرار: تلك المسارات تكتب في سجلّ حوكمة الهوية وحده، فلا يرى
 * مَن يقرأ `/api/audit/ledger` تغييرَ صلاحيةٍ قطّ. فصارت تكتب `ROLE_CHANGED` في السجلّ
 * الرئيس أيضًا، من حيث تقع.
 */

/* ── ٢) تغييرُ سياسة ────────────────────────────────────────────────────────── */

const POLICY_AUTHORITIES = new Set<string>(['super_admin', 'org_admin', 'comp_admin']);

export interface PolicyChangeRequest {
  actorUid: string;
  actorRole: string;
  competitionId: string;
  /** نسخةُ اللائحة بعد التغيير — بها يُعرف أثرُ التغيير على ما بُني عليه. */
  policyVersion: string;
  /** بصمةُ اللائحة كما صارت، ليُقارن أثرٌ بأثر. */
  policySha256: string;
  kind: string;
  reason?: string;
  /** هل خُتمت نتيجةٌ في هذه المسابقة؟ يُقرأ من حالة الخادم، لا من الطلب. */
  sealedResultCount: number;
}

export interface PolicyChangeAttested {
  attested: true;
  competitionId: string;
  policyVersion: string;
  policySha256: string;
  /** تحذيرٌ يُكتب في الأثر: اللائحةُ تغيّرت بعد أن بُني عليها ختم. */
  afterSealing: boolean;
  summary: string;
}

/**
 * يقرّر هل يقع تغييرُ اللائحة، ويُعلن إن وقع **بعد** ختم نتائج.
 *
 * ولا يُمنع التغييرُ بعد الختم هنا: قد يكون تصحيحًا لازمًا، ومنعُه قرارُ مالكٍ لا يُخترع.
 * لكنّه لا يمرّ صامتًا — يُوسَم في الأثر بأن لائحةً تغيّرت بعد أن بُني عليها حكم.
 */
export function policyChangeDecision(request: PolicyChangeRequest): Attestation<PolicyChangeAttested> {
  if (!request.actorUid) return { code: 'POLICY_CHANGE_ACTOR_UNKNOWN' };
  if (!POLICY_AUTHORITIES.has(request.actorRole)) return { code: 'POLICY_CHANGE_NOT_AUTHORIZED' };
  if (!request.competitionId) return { code: 'COMPETITION_REQUIRED' };
  if (!request.policyVersion) return { code: 'POLICY_VERSION_REQUIRED' };
  if (!/^[a-f0-9]{64}$/i.test(request.policySha256 || '')) return { code: 'POLICY_DIGEST_REQUIRED' };
  const afterSealing = request.sealedResultCount > 0;
  return {
    attested: true,
    competitionId: request.competitionId,
    policyVersion: request.policyVersion,
    policySha256: request.policySha256.toLowerCase(),
    afterSealing,
    summary: `Policy ${request.policyVersion} (${request.kind || 'UPDATED'})${afterSealing ? ` — CHANGED AFTER ${request.sealedResultCount} SEALED RESULT(S)` : ''}`,
  };
}

/* ── ٣) تصحيحُ درجة ─────────────────────────────────────────────────────────── */

export interface ScoreCorrectionRequest {
  actorUid: string;
  actorRole: string;
  competitionId: string;
  participantId: string;
  /** لا يقع تصحيحٌ بلا اعتراضٍ مُسجَّل يُحال إليه. */
  appealId: string;
  delta: number;
  reason?: string;
  /** من اللائحة، تُقرأ في الخادم: هل يجوز أن ينتج عن الاعتراض تعديلُ درجة؟ */
  policyAllowsScoreChange: boolean;
  /** من سجلّ الأختام: هل خُتمت نتيجةُ هذا المشارك؟ */
  resultSealed: boolean;
}

export interface ScoreCorrectionAttested {
  attested: true;
  participantId: string;
  appealId: string;
  delta: number;
  summary: string;
}

/**
 * يقرّر هل يقع تصحيحُ الدرجة.
 *
 * والشرطُ الحاسم: **النتيجةُ المختومة لا تُعدَّل**. الشاشةُ تقول ذلك للمستخدم اليوم، لكن
 * لا شيء يفرضه على الخادم؛ فمن نادى المسار مباشرةً عدّل رقمًا مختومًا. وتصحيحُ درجةٍ
 * مختومة يُبطل ختمَها، فالطريقُ إليه فكُّ الختم بأثرٍ مستقلّ لا الالتفافُ عليه.
 */
export function scoreCorrectionDecision(request: ScoreCorrectionRequest): Attestation<ScoreCorrectionAttested> {
  if (!request.actorUid) return { code: 'SCORE_CORRECTION_ACTOR_UNKNOWN' };
  if (!['super_admin', 'org_admin', 'comp_admin', 'head_judge'].includes(request.actorRole)) {
    return { code: 'SCORE_CORRECTION_NOT_AUTHORIZED' };
  }
  if (!request.participantId) return { code: 'PARTICIPANT_REQUIRED' };
  if (!request.appealId) return { code: 'SCORE_CORRECTION_REQUIRES_APPEAL' };
  if (!request.policyAllowsScoreChange) return { code: 'SCORE_CORRECTION_FORBIDDEN_BY_POLICY' };
  if (request.resultSealed) return { code: 'SCORE_CORRECTION_ON_SEALED_RESULT_BLOCKED' };
  if (!Number.isFinite(request.delta) || request.delta === 0) return { code: 'SCORE_CORRECTION_DELTA_INVALID' };
  return {
    attested: true,
    participantId: request.participantId,
    appealId: request.appealId,
    delta: request.delta,
    summary: `Score corrected by ${request.delta > 0 ? '+' : ''}${request.delta} under appeal ${request.appealId}`,
  };
}

/* ── ٤) تغييرُ روايةِ مشارك ─────────────────────────────────────────────────── */

export interface ReadingChangeRequest {
  actorUid: string;
  actorRole: string;
  competitionId: string;
  participantId: string;
  fromRiwaya: string;
  toRiwaya: string;
  reason?: string;
  /** هل سُحب لهذا المشارك سؤالٌ بعد؟ يُقرأ من محرّك الأسئلة الخادميّ. */
  questionDrawn: boolean;
}

export interface ReadingChangeAttested {
  attested: true;
  participantId: string;
  fromRawiId?: string;
  toRawiId: string;
  summary: string;
}

/**
 * يقرّر هل يقع تغييرُ الرواية.
 *
 * والسؤالُ يُسحب على الرواية: مقروءُها ومواضعُها ونصُّها. فتغييرُ الرواية بعد السحب يترك
 * سؤالًا مسحوبًا على روايةٍ والمتسابقَ يُسمَّع بأخرى — والشاشةُ لا تُظهر التناقض. فيُمنع
 * بعد السحب، وطريقُه إبطالُ السحب بأثرٍ مستقلّ.
 *
 * ولا يُقبل اسمٌ لا يُحلّ إلى روايةٍ واحدة بعينها: `resolveReading` يمتنع عن التخمين حين
 * يحتمل الاسمُ أكثرَ من رواية، والامتناعُ هنا هو الصواب — لا يُختار أقربُها.
 */
export function readingChangeDecision(request: ReadingChangeRequest): Attestation<ReadingChangeAttested> {
  if (!request.actorUid) return { code: 'READING_CHANGE_ACTOR_UNKNOWN' };
  if (!['super_admin', 'org_admin', 'comp_admin'].includes(request.actorRole)) {
    return { code: 'READING_CHANGE_NOT_AUTHORIZED' };
  }
  if (!request.participantId) return { code: 'PARTICIPANT_REQUIRED' };
  if (request.questionDrawn) return { code: 'READING_CHANGE_AFTER_DRAW_BLOCKED' };

  const candidates = resolveReadings({ riwaya: request.toRiwaya });
  if (candidates.length === 0) return { code: 'READING_UNKNOWN', detail: request.toRiwaya };
  if (candidates.length > 1) return { code: 'READING_AMBIGUOUS', detail: request.toRiwaya };
  const to = candidates[0];
  const from = resolveReading({ riwaya: request.fromRiwaya });
  if (from && from.rawiId === to.rawiId) return { code: 'READING_UNCHANGED' };

  return {
    attested: true,
    participantId: request.participantId,
    fromRawiId: from?.rawiId,
    toRawiId: to.rawiId,
    summary: `Reading changed ${from?.rawiId || '(unresolved)'} → ${to.rawiId}`,
  };
}
