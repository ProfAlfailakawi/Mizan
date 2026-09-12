/*
 * المدقّق المستقل لتخصيص الأسئلة.
 *
 * في ميزان اليوم تحقُّقٌ من النتائج والشهادات وسلاسل البصمات، وهو باقٍ على حاله. وهذا
 * شيءٌ آخر: تدقيق **التخصيص نفسه** — هل كان كل سؤالٍ خرج لمتسابقٍ حقَّه أصلًا؟
 *
 * وشرط المدقّق الوحيد، وهو الذي يجعله تدقيقًا لا تكرارًا:
 *
 *     لا يستدعي `QuestionAllocationEngine` ولا شيئًا منه، ولا يستورده أصلًا.
 *
 * فمدقّقٌ يسأل المحرّك «هل أصبتَ؟» ثم يكتب «سليم» لم يدقّق شيئًا: كل خطأٍ في المحرّك ينتقل
 * إليه حرفًا بحرف فيصير شاهد زور. ولذلك يقرأ هذا الملف لقطةً تاريخية فيها كل ما يحتاجه —
 * النطاقات، والمناطق، والبنك، والحالات، والحجر، والحجز، وتاريخ المتسابقين، وبصمات اللائحة —
 * ثم يعيد اشتقاق الأهلية بتنفيذٍ مختلف، ويحكم.
 *
 * (ويُختبر هذا الاستقلال نصًّا في tests/allocation-verifier.test.ts: يُقرأ هذا الملف
 * ويُتحقَّق أنه لا يستورد المحرّك. فقاعدةٌ لا يحرسها فحصٌ قاعدةٌ تُنسى.)
 *
 * والبصمات تُبنى على منظومة الإثبات القائمة (`hashCanonical`) ولا تُخترع منظومة تعمية ثانية.
 */

import { ayahCountOf, ayahOrdinal, isValidLocus } from './quran-canon';
import { scopeRanges, type QuranScope } from './quran-scope';
import { hashCanonical } from './trust-protocol';

export const ALLOCATION_VERIFIER_VERSION = 'MIZAN-ALLOCATION-VERIFIER-1';

export type VerifierSeverity = 'violation' | 'warning';

export interface VerifierFinding {
  code: string;
  severity: VerifierSeverity;
  participantId?: string;
  locusKey?: string;
  questionId?: string;
  ar: string;
  en: string;
}

/** حالة الحجز كما سُجّلت لحظة التخصيص. */
export type SnapshotReservationState = 'available' | 'temporarily_reserved' | 'assigned' | 'revealed' | 'released' | 'quarantined';

export interface SnapshotPoolItem {
  questionId: string;
  locusKey: string;
  surahNumber: number;
  startAyah: number;
  endAyah: number;
  approvalStatus: 'approved' | 'draft' | 'quarantined' | 'retired';
  difficultyAssurance: 'unknown' | 'automatically_estimated' | 'human_reviewed' | 'scientifically_approved';
  qiraahId?: string;
  rawiId?: string;
  tariqId?: string;
  /** اعتماد المصدر الذي جاء منه هذا الموضع. */
  sourceCertified?: boolean;
  priorUsageCount?: number;
}

export interface SnapshotZone { zoneId: string; scope: QuranScope }

export interface SnapshotParticipant {
  participantId: string;
  categoryId: string;
  /** النطاق المعتمد وقت السحب، بنسخته. */
  scope: QuranScope;
  scopeVersion?: number;
  reading?: { qiraahId?: string; rawiId?: string; tariqId?: string };
  questionCount: number;
  zones: SnapshotZone[];
  /** مواضع رآها هذا المتسابق قبل هذه المسابقة أو في جولةٍ سابقة. */
  priorHistory?: string[];
  hallId?: string;
}

export interface SnapshotAllocation {
  participantId: string;
  zoneId: string | null;
  slotIndex: number;
  questionId: string;
  locusKey: string;
}

export interface SnapshotPolicy {
  version: number;
  mode: 'strict_no_repeat' | 'repeat_when_necessary' | 'balanced_reuse';
  maxUsesPerQuestion?: number;
  noRepeatWithinParticipant: boolean;
  noRepeatWithinModel: boolean;
  allowUnreviewedDifficulty: boolean;
  requireReviewedDifficulty?: boolean;
  requireCertifiedSource?: boolean;
}

export interface AllocationSnapshot {
  competitionId: string;
  organizationId?: string;
  engineVersion: string;
  policyVersion: string;
  /** بصمة اللائحة كما أُعلنت وقت السحب — تُعاد حسابتها هنا وتُقارَن. */
  policyHash?: string;
  policy: SnapshotPolicy;
  participants: SnapshotParticipant[];
  pool: SnapshotPoolItem[];
  quarantinedLocusKeys?: string[];
  /** حالات الحجز لحظة السحب؛ المحجوز لغير صاحبه ممنوع. */
  reservations?: { locusKey: string; state: SnapshotReservationState; participantId?: string }[];
  allocations: SnapshotAllocation[];
  generatedAt?: string;
}

export interface VerificationReport {
  verifierVersion: typeof ALLOCATION_VERIFIER_VERSION;
  competitionId: string;
  allocationsChecked: number;
  participantsChecked: number;
  findings: VerifierFinding[];
  violations: number;
  warnings: number;
  passed: boolean;
  /** بصمة اللائحة المُعاد حسابها — تُنشر مع التقرير ليُقارَن بها. */
  recomputedPolicyHash: string;
  policyHashMatches: boolean | null;
  generatedAt: string;
}

const locusKeyFrom = (surah: number, ayah: number) => `${surah}:${ayah}`;

/** مطابقة سياق القراءة — مكتوبة هنا من أصلها، غير مستوردة من المحرّك عمدًا. */
function readingAgrees(item: SnapshotPoolItem, reading?: SnapshotParticipant['reading']): boolean {
  if (!reading) return true;
  if (reading.qiraahId && item.qiraahId && item.qiraahId !== reading.qiraahId) return false;
  if (reading.rawiId && item.rawiId && item.rawiId !== reading.rawiId) return false;
  if (reading.tariqId && item.tariqId && item.tariqId !== reading.tariqId) return false;
  // موضعٌ بلا سياق قراءة لا يُعدّ مطابقًا حين يُطلب سياقٌ بعينه — كما هو حكم اللائحة.
  if (reading.rawiId && !item.rawiId) return false;
  return true;
}

function rangeContains(ranges: readonly (readonly [number, number])[], from: number, to: number): boolean {
  for (const [a, b] of ranges) if (from >= a && to <= b) return true;
  return false;
}

/**
 * تدقيق لقطةٍ كاملة.
 *
 * المخرجات وقائع لا أحكام عامة: لكل مخالفةٍ رمزُها، ومن وقعت عليه، وأي موضعٍ تخصّ.
 * و«سليم» لا تُكتب إلا إذا لم تبقَ مخالفة واحدة.
 */
export async function verifyAllocationSnapshot(snapshot: AllocationSnapshot): Promise<VerificationReport> {
  const findings: VerifierFinding[] = [];
  const add = (finding: VerifierFinding) => findings.push(finding);

  const poolById = new Map(snapshot.pool.map(item => [item.questionId, item]));
  const quarantined = new Set(snapshot.quarantinedLocusKeys || []);
  const participants = new Map(snapshot.participants.map(p => [p.participantId, p]));
  const policy = snapshot.policy;

  // الحجز: الموضع المحجوز لغير صاحبه ممنوع، والمحجور ممنوع على الجميع.
  const heldBy = new Map<string, string | undefined>();
  for (const reservation of snapshot.reservations || []) {
    if (reservation.state === 'quarantined') { quarantined.add(reservation.locusKey); continue; }
    if (reservation.state === 'temporarily_reserved' || reservation.state === 'assigned') heldBy.set(reservation.locusKey, reservation.participantId);
  }

  const usesByLocus = new Map<string, number>();
  const perParticipantLoci = new Map<string, Set<string>>();
  const perModelLoci = new Map<string, Set<string>>();

  for (const allocation of snapshot.allocations) {
    const participant = participants.get(allocation.participantId);
    if (!participant) {
      add({ code: 'UNKNOWN_PARTICIPANT', severity: 'violation', participantId: allocation.participantId, questionId: allocation.questionId,
        ar: `تخصيصٌ لمتسابقٍ ليس في اللقطة: ${allocation.participantId}.`, en: `Allocation for a participant absent from the snapshot: ${allocation.participantId}.` });
      continue;
    }
    const item = poolById.get(allocation.questionId);
    if (!item) {
      add({ code: 'QUESTION_NOT_IN_POOL', severity: 'violation', participantId: allocation.participantId, questionId: allocation.questionId,
        ar: `السؤال ${allocation.questionId} ليس في البنك المسجَّل.`, en: `Question ${allocation.questionId} is not in the recorded pool.` });
      continue;
    }

    // ١) اتساق مفتاح الموضع مع بيانات السؤال نفسه — أول ما يُزوَّر عادةً.
    const derivedKey = locusKeyFrom(item.surahNumber, item.startAyah);
    if (derivedKey !== item.locusKey || derivedKey !== allocation.locusKey) {
      add({ code: 'LOCUS_KEY_MISMATCH', severity: 'violation', participantId: participant.participantId, questionId: item.questionId, locusKey: allocation.locusKey,
        ar: `مفتاح الموضع المسجَّل (${allocation.locusKey}) يخالف ما يُشتقّ من السؤال (${derivedKey}).`,
        en: `Recorded locus key (${allocation.locusKey}) disagrees with the key derived from the question (${derivedKey}).` });
    }
    if (!isValidLocus({ surah: item.surahNumber, ayah: item.startAyah }) || item.endAyah < item.startAyah || item.endAyah > ayahCountOf(item.surahNumber)) {
      add({ code: 'INVALID_PASSAGE', severity: 'violation', participantId: participant.participantId, questionId: item.questionId,
        ar: `مقطع السؤال ${item.questionId} خارج حدود السورة.`, en: `Passage of question ${item.questionId} falls outside its surah.` });
      continue;
    }

    const from = ayahOrdinal({ surah: item.surahNumber, ayah: item.startAyah });
    const to = ayahOrdinal({ surah: item.surahNumber, ayah: item.endAyah });

    // ٢) نطاق المتسابق — المقطع كله داخله، لا بدايته وحدها.
    if (!rangeContains(scopeRanges(participant.scope), from, to)) {
      add({ code: 'OUT_OF_PARTICIPANT_SCOPE', severity: 'violation', participantId: participant.participantId, questionId: item.questionId, locusKey: item.locusKey,
        ar: `الموضع ${item.locusKey} خارج نطاق المتسابق ${participant.participantId}.`,
        en: `Locus ${item.locusKey} lies outside participant ${participant.participantId}'s approved range.` });
    }

    // ٣) المنطقة — إن نُسبت السحبة إلى منطقة فالمقطع داخل نطاقها.
    if (allocation.zoneId) {
      const zone = participant.zones.find(z => z.zoneId === allocation.zoneId);
      if (!zone) {
        add({ code: 'UNKNOWN_ZONE', severity: 'violation', participantId: participant.participantId, questionId: item.questionId,
          ar: `السحبة منسوبة إلى منطقة (${allocation.zoneId}) ليست في خطة هذا المتسابق.`, en: `Allocation cites zone ${allocation.zoneId}, absent from this participant's plan.` });
      } else if (!rangeContains(scopeRanges(zone.scope), from, to)) {
        add({ code: 'OUT_OF_ZONE', severity: 'violation', participantId: participant.participantId, questionId: item.questionId, locusKey: item.locusKey,
          ar: `الموضع ${item.locusKey} خارج نطاق المنطقة ${allocation.zoneId}.`, en: `Locus ${item.locusKey} lies outside zone ${allocation.zoneId}.` });
      }
    }

    // ٤) سياق القراءة.
    if (!readingAgrees(item, participant.reading)) {
      add({ code: 'READING_MISMATCH', severity: 'violation', participantId: participant.participantId, questionId: item.questionId, locusKey: item.locusKey,
        ar: `سياق قراءة السؤال ${item.questionId} لا يطابق رواية المتسابق.`, en: `Question ${item.questionId} does not match the participant's reading context.` });
    }

    // ٥) حالة السؤال واعتماد مصدره ودرجة توثيق صعوبته.
    if (item.approvalStatus !== 'approved') {
      add({ code: 'QUESTION_NOT_APPROVED', severity: 'violation', participantId: participant.participantId, questionId: item.questionId,
        ar: `السؤال ${item.questionId} حالته «${item.approvalStatus}» لا «معتمد».`, en: `Question ${item.questionId} is "${item.approvalStatus}", not approved.` });
    }
    if (policy.requireCertifiedSource && item.sourceCertified === false) {
      add({ code: 'SOURCE_NOT_CERTIFIED', severity: 'violation', participantId: participant.participantId, questionId: item.questionId,
        ar: `مصدر السؤال ${item.questionId} غير معتمد واللائحة تشترط الاعتماد.`, en: `Question ${item.questionId} comes from an uncertified source while the policy requires certification.` });
    }
    if (policy.requireReviewedDifficulty && item.difficultyAssurance !== 'human_reviewed' && item.difficultyAssurance !== 'scientifically_approved') {
      add({ code: 'DIFFICULTY_NOT_REVIEWED', severity: 'violation', participantId: participant.participantId, questionId: item.questionId,
        ar: `صعوبة السؤال ${item.questionId} غير مراجَعة واللائحة تشترط المراجعة.`, en: `Question ${item.questionId} has unreviewed difficulty while the policy requires review.` });
    }
    if (!policy.allowUnreviewedDifficulty && item.difficultyAssurance === 'unknown') {
      add({ code: 'DIFFICULTY_UNKNOWN', severity: 'violation', participantId: participant.participantId, questionId: item.questionId,
        ar: `صعوبة السؤال ${item.questionId} مجهولة واللائحة تمنعها.`, en: `Question ${item.questionId} has unknown difficulty, which the policy forbids.` });
    }

    // ٦) الحجر والحجز.
    if (quarantined.has(item.locusKey)) {
      add({ code: 'QUARANTINED_LOCUS', severity: 'violation', participantId: participant.participantId, questionId: item.questionId, locusKey: item.locusKey,
        ar: `الموضع ${item.locusKey} محجور ومع ذلك خُصِّص.`, en: `Locus ${item.locusKey} is quarantined yet was allocated.` });
    }
    if (heldBy.has(item.locusKey) && heldBy.get(item.locusKey) !== participant.participantId) {
      add({ code: 'RESERVED_FOR_ANOTHER', severity: 'violation', participantId: participant.participantId, questionId: item.questionId, locusKey: item.locusKey,
        ar: `الموضع ${item.locusKey} محجوز لغير هذا المتسابق لحظة التخصيص.`, en: `Locus ${item.locusKey} was held for another participant at allocation time.` });
    }

    // ٧) تاريخ المتسابق وقيود التكرار.
    const seen = perParticipantLoci.get(participant.participantId) || new Set(participant.priorHistory || []);
    if (policy.noRepeatWithinParticipant && seen.has(item.locusKey)) {
      add({ code: 'REPEAT_FOR_PARTICIPANT', severity: 'violation', participantId: participant.participantId, questionId: item.questionId, locusKey: item.locusKey,
        ar: `الموضع ${item.locusKey} أُعيد للمتسابق ${participant.participantId} وقد سبق أن رآه.`,
        en: `Locus ${item.locusKey} was returned to participant ${participant.participantId}, who had already seen it.` });
    }
    seen.add(item.locusKey);
    perParticipantLoci.set(participant.participantId, seen);

    const modelKey = `${participant.participantId}|${allocation.zoneId ?? 'free'}`;
    const inModel = perModelLoci.get(participant.participantId) || new Set<string>();
    if (policy.noRepeatWithinModel && inModel.has(item.locusKey)) {
      add({ code: 'REPEAT_WITHIN_MODEL', severity: 'violation', participantId: participant.participantId, questionId: item.questionId, locusKey: item.locusKey,
        ar: `الموضع ${item.locusKey} تكرّر داخل نموذج المتسابق ${participant.participantId}.`, en: `Locus ${item.locusKey} repeats inside participant ${participant.participantId}'s model.` });
    }
    inModel.add(item.locusKey);
    perModelLoci.set(participant.participantId, inModel);
    void modelKey;

    const uses = (usesByLocus.get(item.locusKey) || (item.priorUsageCount || 0)) + 1;
    usesByLocus.set(item.locusKey, uses);
  }

  // ٨) سقف الاستعمال ووضع «لا تكرار إطلاقًا» — يُحكم عليهما بعد عدّ الجميع.
  const ceiling = policy.mode === 'strict_no_repeat' ? 1 : (policy.maxUsesPerQuestion && policy.maxUsesPerQuestion > 0 ? policy.maxUsesPerQuestion : Infinity);
  for (const [locusKey, uses] of usesByLocus) {
    if (uses > ceiling) {
      add({ code: 'MAX_USES_EXCEEDED', severity: 'violation', locusKey,
        ar: `الموضع ${locusKey} استُعمل ${uses} مرة والسقف ${ceiling}.`, en: `Locus ${locusKey} was used ${uses} times against a ceiling of ${ceiling}.` });
    }
  }

  // ٩) اكتمال النموذج — نقصٌ في العدد مخالفةٌ في حقّ المتسابق لا تفصيلٌ إحصائي.
  const countByParticipant = new Map<string, number>();
  for (const allocation of snapshot.allocations) countByParticipant.set(allocation.participantId, (countByParticipant.get(allocation.participantId) || 0) + 1);
  for (const participant of snapshot.participants) {
    const got = countByParticipant.get(participant.participantId) || 0;
    if (got !== participant.questionCount) {
      add({ code: 'MODEL_SIZE_MISMATCH', severity: got > participant.questionCount ? 'violation' : 'warning', participantId: participant.participantId,
        ar: `المتسابق ${participant.participantId} له ${got} سؤالًا والمقرَّر ${participant.questionCount}.`,
        en: `Participant ${participant.participantId} received ${got} questions against ${participant.questionCount} planned.` });
    }
  }

  const recomputedPolicyHash = await hashCanonical({ policy: snapshot.policy, policyVersion: snapshot.policyVersion, engineVersion: snapshot.engineVersion });
  const policyHashMatches = snapshot.policyHash ? snapshot.policyHash === recomputedPolicyHash : null;
  if (policyHashMatches === false) {
    add({ code: 'POLICY_HASH_MISMATCH', severity: 'violation',
      ar: 'بصمة اللائحة المعلنة لا تطابق اللائحة المرفقة في اللقطة.', en: 'The declared policy hash does not match the policy carried in the snapshot.' });
  }

  const violations = findings.filter(f => f.severity === 'violation').length;
  return {
    verifierVersion: ALLOCATION_VERIFIER_VERSION,
    competitionId: snapshot.competitionId,
    allocationsChecked: snapshot.allocations.length,
    participantsChecked: snapshot.participants.length,
    findings,
    violations,
    warnings: findings.length - violations,
    passed: violations === 0,
    recomputedPolicyHash,
    policyHashMatches,
    generatedAt: new Date().toISOString(),
  };
}

/** بصمة اللائحة كما يحسبها المدقّق — تُنشر مع اللقطة ليُقارَن بها لاحقًا. */
export async function allocationPolicyHash(input: { policy: SnapshotPolicy; policyVersion: string; engineVersion: string }): Promise<string> {
  return hashCanonical({ policy: input.policy, policyVersion: input.policyVersion, engineVersion: input.engineVersion });
}
