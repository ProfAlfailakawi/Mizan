import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ServerQuestionPoolRepository, SecureQuestionRuntimeRepository,
  type ServerQuestionBlueprint,
} from '../server/secure-question-runtime';
import { QuestionEscrowRepository, type EscrowActor } from '../server/question-escrow';
import { scopeFromAyahRange } from '../src/lib/quran-scope';
import { verifyAllocationSnapshot, type AllocationSnapshot } from '../src/lib/allocation-verifier';

/*
 * مسار النجاح الكامل — الفجوة التي كانت مفتوحة.
 *
 * في ميزان اليوم فحوصٌ كثيرة لزمن التشغيل الآمن، وكلها تحسن شيئًا واحدًا: **الرفض.** ترفض
 * السؤال خارج النطاق، وترفض الرواية المخالفة، وترفض الكشف بلا نصاب، وترفض التشغيل حين لا
 * يكون الخادم الآمن مهيّأً. والرفض عند الغياب سياسةٌ صحيحة.
 *
 * لكن نظامًا كل ما نملك عليه من دليلٍ أنه **يرفض** نظامٌ لم يُثبت أنه يعمل. ولو انكسر
 * مسار النجاح كلُّه لمرّت الفحوص كلها خضراء: كلُّها تنتظر رفضًا فتجده.
 *
 * فهذا الملف يُغلق تلك الفجوة وحدها — لا يعيد بناء شيء ولا يغيّر سطرًا في زمن التشغيل —
 * ويشترط أن يمرّ المسار كاملًا من أوله إلى آخره:
 *
 *   متسابق ← نطاق معتمد ← مصدر معتمد ← بنك ← تهيئة ← حضور ← اعتماد محكّم ← كشف ←
 *   السؤال التالي ← استبدال طارئ ← إتمام ← تدقيق ← تحقق من التخصيص.
 */

const ESCROW_KEY = Buffer.alloc(32, 7).toString('base64url');
const ORG = 'org-e2e', COMP = 'comp-e2e', SESSION = 's-e2e', PARTICIPANT = 'p-e2e';

const judge = (uid: string): EscrowActor => ({ uid, role: 'judge', organizationId: ORG, competitionId: COMP });
const headJudge: EscrowActor = { uid: 'hj-1', role: 'head_judge', organizationId: ORG, competitionId: COMP };
const auditor: EscrowActor = { uid: 'aud-1', role: 'auditor', organizationId: ORG, competitionId: COMP };

/* بنكٌ من مصدرٍ معتمد: البقرة ١–٦٠، مقاطع ثلاثية، كلها داخل نطاق المتسابق. */
const blueprint = (startAyah: number): ServerQuestionBlueprint => ({
  id: `bp-2-${startAyah}`, poolId: 'pool-e2e', qiraah: 'Asim', rawi: 'Hafs',
  surahNumber: 2, startAyah, endAyah: startAyah + 2, juzNumber: 1,
  difficultyRating: 3, enabled: true,
});

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-e2e-'));
  const pools = new ServerQuestionPoolRepository(path.join(dir, 'pools'));
  pools.save(COMP, 'pool-e2e', Array.from({ length: 30 }, (_, i) => blueprint(i + 1)));
  const escrow = new QuestionEscrowRepository(path.join(dir, 'escrow'), ESCROW_KEY);

  /*
   * مصدرٌ معتمد مصطنع — معتمدٌ علميًا، وبروايةٍ مطابقة، ويردّ نصًّا حقيقيَّ الشكل.
   * ولا يُقرأ من هنا قرآنٌ حقيقي: النص هنا رمزٌ للفحص لا تلاوة.
   */
  const quran = {
    manifest: () => ({ scientificApproval: { state: 'CERTIFIED' }, packageHash: 'pkg-hash-e2e', qiraah: 'Asim', rawi: 'Hafs', tariq: undefined }),
    questionStartMetadata: (_p: string, loci: { id: string }[]) => loci.map(l => ({ id: l.id, startClass: 'PAGE_OPENING', startAssurance: 'QURAN_AYAH_BOUNDARY', lineStart: 1, pageNumber: 3 })),
    resolvePassage: () => ({ verses: [{ aya_text: 'DEV-TEXT', sura_name_ar: 'البقرة', page: 3, line_start: 1, line_end: 3 }], text: 'DEV-TEXT' }),
    resolvePassageLoci: () => [{ page: 3, lineStart: 1, lineEnd: 3, lineCount: 15 }],
  } as never;

  const runtime = new SecureQuestionRuntimeRepository(path.join(dir, 'runtime'), quran, pools, escrow);
  return { dir, pools, escrow, runtime };
}

test('مسار النجاح الكامل لزمن التشغيل الآمن يمرّ من أوله إلى آخره', async () => {
  const f = fixture();
  try {
    const scope = scopeFromAyahRange({ surah: 2, ayah: 1 }, { surah: 2, ayah: 40 });

    // ١) التهيئة: مصدرٌ معتمد، وبنكٌ، ونطاقٌ معتمد بنسخته، ومحكّمان مطلوبان.
    const provisioned = f.runtime.provision({
      organizationId: ORG, competitionId: COMP, sessionId: SESSION, participantId: PARTICIPANT,
      committeeId: 'committee-1', requiredJudgeIds: ['j-1', 'j-2'], approvalMode: 'all_assigned',
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      sourcePackageId: 'pkg-1', poolId: 'pool-e2e', questionCount: 3,
      qiraah: 'Asim', rawi: 'Hafs', targetDifficulty: 3,
      participantScope: scope, participantScopeVersion: 4,
    });
    assert.equal(provisioned.questionCount, 3, 'التهيئة لم تُخرج العدد المطلوب');

    // ٢) لا كشفَ قبل الحضور — الرفض هنا جزءٌ من مسار النجاح لا نقيضه.
    assert.throws(() => f.runtime.revealQuestion(SESSION, 0, judge('j-1')), /ESCROW_NOT_RELEASED|ESCROW_PARTICIPANT_NOT_PRESENT/);

    // ٣) الحضور يؤكده محكّمٌ مُسنَد.
    const presence = f.runtime.confirmPresence(SESSION, judge('j-1'), 'manual_visual_confirmation');
    assert.equal(presence.escrow.presenceVerified, true);

    // ٤) نصاب الاعتماد: محكّمٌ واحد لا يكفي حين يكون المطلوب اثنين.
    const firstApproval = f.runtime.approveQuestion(SESSION, 0, judge('j-1'));
    assert.equal(firstApproval.escrow.ready.ready, false, 'اكتفى بمحكّمٍ واحد والمطلوب اثنان');
    assert.throws(() => f.runtime.revealQuestion(SESSION, 0, judge('j-1')), /ESCROW_NOT_RELEASED/);

    const secondApproval = f.runtime.approveQuestion(SESSION, 0, judge('j-2'));
    assert.equal(secondApproval.escrow.ready.ready, true, 'اكتمل النصاب ولم يُفرج عن السؤال');

    // ٥) الكشف: نصٌّ حقيقي، وإيصال انكشافٍ باسم من كشفه.
    const revealed = f.runtime.revealQuestion(SESSION, 0, judge('j-1'));
    assert.equal(revealed.payload.surahNumber, 2);
    assert.ok(Number(revealed.payload.startAyah) >= 1 && Number(revealed.payload.endAyah) <= 40, 'السؤال المكشوف خارج نطاق صاحبه');
    assert.ok(revealed.exposureReceipt.canaryToken, 'الكشف بلا إيصال انكشاف');
    assert.equal(revealed.exposureReceipt.judgeId, 'j-1');

    // ٦) السؤال التالي: النصاب يُستأنف لكل سؤالٍ على حدة، لا مرة واحدة للجلسة.
    assert.throws(() => f.runtime.revealQuestion(SESSION, 1, judge('j-1')), /ESCROW_NOT_RELEASED/);
    f.runtime.approveQuestion(SESSION, 1, judge('j-1'));
    f.runtime.approveQuestion(SESSION, 1, judge('j-2'));
    const second = f.runtime.revealQuestion(SESSION, 1, judge('j-2'));
    assert.notEqual(second.commitmentHash, revealed.commitmentHash, 'السؤالان بالبصمة نفسها');

    /*
     * ٧) الاستبدال الطارئ.
     *
     * ولا يقع إلا على سؤالٍ **بدأ** فعلًا (أُفرج عنه): الاستبدال علاجُ ما وقع لا اختيارٌ
     * مسبق، ولو جاز على سؤالٍ لم يبدأ لصار بابًا لتبديل الأسئلة قبل أن تُرى. فيُعتمد
     * السؤال الثالث أولًا ليصير مبدوءًا، ثم يُستبدل.
     */
    f.runtime.approveQuestion(SESSION, 2, judge('j-1'));
    f.runtime.approveQuestion(SESSION, 2, judge('j-2'));
    const beforeReplacement = f.runtime.revealFairDrawSeed(SESSION).selectionIds[2];
    const authorized = f.runtime.authorizeEmergencyReplacement({
      sessionId: SESSION, actor: headJudge, reason: 'انقطاع صوت في القاعة',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });
    assert.equal(authorized.emergencyReplacement.state, 'AUTHORIZED');
    const partial = f.runtime.approveEmergencyReplacement({ sessionId: SESSION, questionIndex: 2, actor: judge('j-1') });
    assert.equal(partial.replacementReady, false, 'الاستبدال تمّ بمحكّمٍ واحد');
    const consumed = f.runtime.approveEmergencyReplacement({ sessionId: SESSION, questionIndex: 2, actor: judge('j-2') });
    assert.equal(consumed.replacementReady, true, 'اكتمل النصاب ولم يقع الاستبدال');
    assert.equal(consumed.emergencyReplacement.state, 'CONSUMED');
    // ولا يُستبدل مرتين.
    assert.throws(() => f.runtime.authorizeEmergencyReplacement({
      sessionId: SESSION, actor: headJudge, reason: 'مرة ثانية',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    }), /QUESTION_REPLACEMENT_ALREADY_USED/);

    // ٨) الإتمام: السؤال المستبدل غيرُ الأول، ويستأنف نصابه من جديد، ثم يُكشف.
    const afterReplacement = f.runtime.revealFairDrawSeed(SESSION).selectionIds[2];
    assert.notEqual(afterReplacement, beforeReplacement, 'الاستبدال لم يبدّل شيئًا');
    /* والاعتماد السابق لا يُورَّث: سؤالٌ جديد يحتاج نصابًا جديدًا، وإلا لمرّ سؤالٌ لم يره أحد. */
    assert.throws(() => f.runtime.revealQuestion(SESSION, 2, judge('j-1')), /ESCROW_NOT_RELEASED/);
    f.runtime.approveQuestion(SESSION, 2, judge('j-1'));
    f.runtime.approveQuestion(SESSION, 2, judge('j-2'));
    const third = f.runtime.revealQuestion(SESSION, 2, judge('j-1'));
    assert.ok(third.payload.questionId, 'السؤال المستبدل لم يُكشف');
    assert.equal(third.payload.questionId, afterReplacement, 'المكشوف ليس السؤال المستبدل');

    // ٩) التدقيق: ممرّ الحراسة، ونصف قطر الانكشاف، وتتبّع الإيصال، وكشف بذرة القرعة.
    const corridor = f.escrow.custodyCorridor(SESSION);
    assert.equal(corridor.questions.length, 3);
    assert.ok(corridor.questions.every(q => q.state === 'RELEASED'), 'ليست كل الأسئلة مُفرجًا عنها بعد اكتمال الجلسة');
    assert.equal(corridor.plaintextIncluded, false, 'تقرير التدقيق يحمل نصًّا — وهذا لا يجوز');

    const radius = f.escrow.exposureRadius(SESSION);
    assert.equal(radius.withinConfiguredRadius, true, 'انكشف السؤال لمن ليس من المحكّمين المُسنَدين');
    assert.equal(radius.unexpectedRecipientCount, 0);

    const traced = f.escrow.traceCanary(revealed.exposureReceipt.canaryToken);
    assert.equal(traced.verified, true);
    assert.equal(traced.judgeId, 'j-1');
    assert.equal(traced.sessionId, SESSION);

    const seed = f.runtime.revealFairDrawSeed(SESSION);
    assert.equal(seed.selectionIds.length, 3);
    assert.ok(seed.seedCommitmentHash && seed.constraintHash && seed.poolSnapshotHash);

    const status = f.runtime.status(SESSION, auditor);
    assert.equal(status.participantId, PARTICIPANT);

    // ١٠) التحقق من التخصيص: التحقق الداخلي للخادم، ثم المدقّق المستقل على اللقطة نفسها.
    const enforcement = f.runtime.verifyAllocationScope(SESSION);
    assert.equal(enforcement.enforced, true);
    assert.deepEqual(enforcement.violations, [], 'موضعٌ خارج النطاق مرّ إلى التخصيص');

    const internal = f.escrow.internalRecord(SESSION);
    const pool = f.pools.load(COMP, 'pool-e2e');
    const byId = new Map(pool.map(item => [item.id, item]));
    const snapshot: AllocationSnapshot = {
      competitionId: COMP, organizationId: ORG,
      engineVersion: 'MIZAN-SERVER-FAIRDRAW-2', policyVersion: 'SERVER_POLICY_V2',
      policy: { version: 2, mode: 'repeat_when_necessary', noRepeatWithinParticipant: true, noRepeatWithinModel: true, allowUnreviewedDifficulty: true },
      participants: [{
        participantId: PARTICIPANT, categoryId: 'cat-e2e', scope, scopeVersion: 4,
        reading: { qiraahId: 'Asim', rawiId: 'Hafs' }, questionCount: 3, zones: [],
      }],
      pool: pool.map(item => ({
        questionId: item.id, locusKey: `${item.surahNumber}:${item.startAyah}`,
        surahNumber: item.surahNumber, startAyah: item.startAyah, endAyah: item.endAyah,
        approvalStatus: 'approved' as const, difficultyAssurance: 'human_reviewed' as const,
        qiraahId: item.qiraah, rawiId: item.rawi,
      })),
      allocations: internal.questions.map((question, index) => {
        const item = byId.get(question.questionId)!;
        return { participantId: PARTICIPANT, zoneId: null, slotIndex: index, questionId: item.id, locusKey: `${item.surahNumber}:${item.startAyah}` };
      }),
    };
    const verification = await verifyAllocationSnapshot(snapshot);
    assert.deepEqual(
      verification.findings.filter(finding => finding.severity === 'violation'),
      [],
      'المدقّق المستقل رفض تخصيصًا خرج من مسار النجاح الكامل',
    );
    assert.equal(verification.passed, true);
    assert.equal(verification.allocationsChecked, 3);
  } finally {
    fs.rmSync(f.dir, { recursive: true, force: true });
  }
});

test('ورفضُ التشغيل حين يغيب الخادم الآمن يبقى كما هو — الإغلاق لم يُفتح', () => {
  /*
   * الفحص أعلاه يثبت أن مسار النجاح يعمل. وهذا يثبّت أن إثبات النجاح لم يُرخِ الإغلاق:
   * جلسةٌ لا وجود لها، أو فاعلٌ من مستأجرٍ آخر، أو محكّمٌ غير مُسنَد — كلُّها تُردّ.
   */
  const f = fixture();
  try {
    assert.throws(() => f.runtime.status('session-does-not-exist', auditor), /QUESTION_RUNTIME|ENOENT|NOT_FOUND/);

    const scope = scopeFromAyahRange({ surah: 2, ayah: 1 }, { surah: 2, ayah: 40 });
    f.runtime.provision({
      organizationId: ORG, competitionId: COMP, sessionId: 'closed-1', participantId: PARTICIPANT,
      committeeId: 'committee-1', requiredJudgeIds: ['j-1'], approvalMode: 'all_assigned',
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      sourcePackageId: 'pkg-1', poolId: 'pool-e2e', questionCount: 2,
      qiraah: 'Asim', rawi: 'Hafs', participantScope: scope, participantScopeVersion: 1,
    });
    assert.throws(() => f.runtime.confirmPresence('closed-1', { uid: 'j-9', role: 'judge', organizationId: ORG, competitionId: COMP }, 'manual_visual_confirmation'), /ASSIGNED_JUDGE_REQUIRED/);
    assert.throws(() => f.runtime.status('closed-1', { uid: 'x', role: 'auditor', organizationId: 'org-other', competitionId: COMP }), /ORGANIZATION_MISMATCH/);
    assert.throws(() => f.runtime.status('closed-1', { uid: 'x', role: 'auditor', organizationId: ORG, competitionId: 'comp-other' }), /COMPETITION_MISMATCH/);
  } finally {
    fs.rmSync(f.dir, { recursive: true, force: true });
  }
});
