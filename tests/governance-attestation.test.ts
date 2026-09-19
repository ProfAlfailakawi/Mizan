/*
 * §30 — أربعةُ أفعالٍ حاكمة كان العميلُ يفحصها ويكتب أثرَها بنفسه.
 *
 * الفحصُ في جهازٍ يملكه صاحبُ المصلحة ليس فحصًا، والأثرُ الذي يؤلّفه من يُحتجّ عليه ليس
 * أثرًا. وهذه الاختبارات تثبت القرار نفسه: ما الذي يُرفض، ولماذا، وباسمٍ يُقرأ.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  policyChangeDecision,
  scoreCorrectionDecision,
  readingChangeDecision,
} from '../server/governance-attestation';

const refused = (decision: unknown) => (decision as { code?: string }).code;

/* ── تغييرُ سياسة ───────────────────────────────────────────────────────────── */

const policyBase = {
  actorUid: 'admin-1', actorRole: 'comp_admin', competitionId: 'comp-1',
  policyVersion: 'v7', policySha256: 'a'.repeat(64), kind: 'POLICY_COMPILATION_PUBLISHED', sealedResultCount: 0,
};

test('a policy change carries its version and digest, or it is not attestable', () => {
  assert.equal(refused(policyChangeDecision({ ...policyBase, policyVersion: '' })), 'POLICY_VERSION_REQUIRED');
  assert.equal(refused(policyChangeDecision({ ...policyBase, policySha256: 'not-a-digest' })), 'POLICY_DIGEST_REQUIRED');
  assert.equal(refused(policyChangeDecision({ ...policyBase, actorRole: 'judge' })), 'POLICY_CHANGE_NOT_AUTHORIZED');
});

test('changing the rulebook after results were sealed is allowed but never silent', () => {
  /*
   * منعُه قرارُ مالكٍ لا يُخترع هنا: قد يكون تصحيحًا لازمًا. لكنّ لائحةً تغيّرت بعد أن
   * بُني عليها حكمٌ لا تمرّ بلا وسم — فالمدقّقُ يقرأ في الأثر أن الترتيب تغيّر تحت الختم.
   */
  const clean = policyChangeDecision(policyBase);
  assert.ok('attested' in clean);
  assert.equal(clean.afterSealing, false);
  assert.equal(/AFTER/.test(clean.summary), false);

  const late = policyChangeDecision({ ...policyBase, sealedResultCount: 12 });
  assert.ok('attested' in late);
  assert.equal(late.afterSealing, true);
  assert.match(late.summary, /CHANGED AFTER 12 SEALED RESULT/);
});

test('the digest is normalised so the same policy never reads as two', () => {
  const upper = policyChangeDecision({ ...policyBase, policySha256: 'A'.repeat(64) });
  assert.ok('attested' in upper);
  assert.equal(upper.policySha256, 'a'.repeat(64));
});

/* ── تصحيحُ درجة ────────────────────────────────────────────────────────────── */

const scoreBase = {
  actorUid: 'hj-1', actorRole: 'head_judge', competitionId: 'comp-1', participantId: 'p-1',
  appealId: 'appeal-3', delta: -1.5, policyAllowsScoreChange: true, resultSealed: false,
};

test('a sealed result is not corrected — that is what sealing means', () => {
  /*
   * الشاشةُ تقول ذلك للمستخدم اليوم، ولا شيء يفرضه على الخادم؛ فمن نادى المسارَ مباشرةً
   * عدّل رقمًا مختومًا وبقي الختمُ يشهد لرقمٍ آخر.
   */
  assert.equal(refused(scoreCorrectionDecision({ ...scoreBase, resultSealed: true })),
    'SCORE_CORRECTION_ON_SEALED_RESULT_BLOCKED');
});

test('no correction without a recorded appeal to point at', () => {
  assert.equal(refused(scoreCorrectionDecision({ ...scoreBase, appealId: '' })), 'SCORE_CORRECTION_REQUIRES_APPEAL');
});

test('the competition policy decides whether an appeal may move a score at all', () => {
  assert.equal(refused(scoreCorrectionDecision({ ...scoreBase, policyAllowsScoreChange: false })),
    'SCORE_CORRECTION_FORBIDDEN_BY_POLICY');
});

test('a zero or non-numeric delta is not a correction', () => {
  assert.equal(refused(scoreCorrectionDecision({ ...scoreBase, delta: 0 })), 'SCORE_CORRECTION_DELTA_INVALID');
  assert.equal(refused(scoreCorrectionDecision({ ...scoreBase, delta: Number.NaN })), 'SCORE_CORRECTION_DELTA_INVALID');
});

test('a judge cannot correct a score, and a valid correction names its appeal', () => {
  assert.equal(refused(scoreCorrectionDecision({ ...scoreBase, actorRole: 'judge' })), 'SCORE_CORRECTION_NOT_AUTHORIZED');
  const ok = scoreCorrectionDecision(scoreBase);
  assert.ok('attested' in ok);
  assert.equal(ok.delta, -1.5);
  assert.match(ok.summary, /appeal-3/);
});

/* ── تغييرُ روايةِ مشارك ────────────────────────────────────────────────────── */

const readingBase = {
  actorUid: 'admin-1', actorRole: 'comp_admin', competitionId: 'comp-1', participantId: 'p-1',
  fromRiwaya: 'حفص', toRiwaya: 'ورش', questionDrawn: false,
};

test('the reading cannot change once the question has been drawn on it', () => {
  /*
   * السؤالُ يُسحب على الرواية: مقروءُها ومواضعُها ونصُّها. فتغييرُها بعد السحب يترك سؤالًا
   * على روايةٍ والمتسابقَ يُسمَّع بأخرى، ولا شيء في الشاشة يقول ذلك.
   */
  assert.equal(refused(readingChangeDecision({ ...readingBase, questionDrawn: true })),
    'READING_CHANGE_AFTER_DRAW_BLOCKED');
});

test('an unknown reading name is refused, never approximated', () => {
  assert.equal(refused(readingChangeDecision({ ...readingBase, toRiwaya: 'رواية لا وجود لها' })), 'READING_UNKNOWN');
});

test('a bare "al-Duri" is refused as unknown — the two Duris are never guessed between', () => {
  /*
   * «الدوري» راويان: الدوري عن أبي عمرو، والدوري عن الكسائي. والمُطابِقُ يشترط الاسمَ
   * المُميِّز، فلا يُحلّ الاسمُ المجرّد إلى أيٍّ منهما — وهو الصواب: اختيارُ أقربهما
   * إسنادُ متسابقٍ إلى روايةٍ لم تُختَر له.
   */
  assert.equal(refused(readingChangeDecision({ ...readingBase, toRiwaya: 'الدوري' })), 'READING_UNKNOWN');
});

test('an input that names two readings at once is refused as ambiguous, not narrowed to one', () => {
  const decision = readingChangeDecision({ ...readingBase, toRiwaya: 'الدوري عن أبي عمرو والدوري عن الكسائي' });
  assert.equal(refused(decision), 'READING_AMBIGUOUS');
});

test('a real change resolves to a canonical rawi on both sides', () => {
  const decision = readingChangeDecision(readingBase);
  assert.ok('attested' in decision, `expected attestation, got ${refused(decision)}`);
  assert.equal(decision.toRawiId, 'warsh');
  assert.equal(decision.fromRawiId, 'hafs');
  assert.match(decision.summary, /hafs → warsh/);
});

test('changing a reading to itself is refused, so the trail has no empty entries', () => {
  assert.equal(refused(readingChangeDecision({ ...readingBase, toRiwaya: 'حفص' })), 'READING_UNCHANGED');
});

test('only competition administration changes a reading — never a judge', () => {
  // §1: الحكمُ لا يختار الرواية. ومن لا يختارها لا يغيّرها.
  assert.equal(refused(readingChangeDecision({ ...readingBase, actorRole: 'judge' })), 'READING_CHANGE_NOT_AUTHORIZED');
  assert.equal(refused(readingChangeDecision({ ...readingBase, actorRole: 'head_judge' })), 'READING_CHANGE_NOT_AUTHORIZED');
});

/* ── الربط: المسارات تقرأ الحقيقة من الخادم، والعميل يمتنع إن امتنعت ──────────── */

import fs from 'node:fs';
import path from 'node:path';

const SERVER = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');
const STORE = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'store.ts'), 'utf8');
const routeBody = (route: string) => {
  const at = SERVER.indexOf(`app.post('${route}'`);
  assert.ok(at > 0, `${route} must exist`);
  return SERVER.slice(at, at + 2400);
};

test('each attestation route reads its facts from server state, never from the request', () => {
  /*
   * الحارسُ الذي يقرأ شرطَه من الطلب ليس حارسًا: من نادى المسارَ أعلن أن النتيجة لم
   * تُختم، وأن اللائحة لم يُبنَ عليها شيء، فمرّ.
   */
  const policy = routeBody('/api/governance/policy-change');
  assert.ok(policy.includes('resultSealRegistry.countFor('), 'sealed count must come from the seal registry');
  assert.equal(/sealedResultCount:\s*Number\(b\./.test(policy), false, 'never from the request body');

  const correction = routeBody('/api/results/score-correction');
  /* بلا `?.`: غيابُ السجلّ كان يُقرأ «لم تُختم» فيُفتح البابُ الأوسع — والمسار الآن
     يردّ 503 قبل السؤال. انظر `tests/result-seal-registry-fail-closed.test.ts`. */
  assert.ok(correction.includes('resultSealRegistry.latestFor('), '"is it sealed?" must come from the seal registry');
  assert.equal(/resultSealed:\s*b\./.test(correction), false, 'never from the request body');

  const reading = routeBody('/api/participants/reading-change');
  assert.ok(reading.includes('findActiveForParticipant('), '"was a question drawn?" must come from the question runtime');
  assert.equal(/questionDrawn:\s*b\./.test(reading), false, 'never from the request body');
});

test('a missing question runtime is read as "drawn", not as "not drawn"', () => {
  /*
   * الغيابُ الذي يُقرأ إذنًا يفتح البابَ الذي بُني ليُغلق: محرّكٌ غيرُ مهيّأ يعني أن كلَّ
   * تغييرِ روايةٍ يمرّ. فالافتراضُ أنه مسحوبٌ حتى يُثبت المحرّكُ خلافه.
   */
  const reading = routeBody('/api/participants/reading-change');
  assert.ok(/let questionDrawn=true;/.test(reading), 'the default must be the safe one');
  assert.ok(reading.includes("err.message==='QUESTION_RUNTIME_ACTIVE_SESSION_NOT_FOUND'"),
    'only the runtime saying "no active session" may clear it');
});

test('each attestation route writes its own event and is rate-limited', () => {
  for (const [route, action] of [
    ['/api/governance/policy-change', 'COMPETITION_POLICY_CHANGED'],
    ['/api/results/score-correction', 'SCORE_CORRECTED'],
    ['/api/participants/reading-change', 'PARTICIPANT_READING_CHANGED'],
  ] as const) {
    const body = routeBody(route);
    assert.ok(body.includes(`action:'${action}'`), `${route} must write ${action}`);
    assert.ok(body.includes('auditRateLimit'), `${route} must be rate-limited`);
    assert.ok(body.includes('actor.organizationId'), `${route} must scope to the verified tenant`);
  }
});

test('the client stops when the server refuses — it never applies the change locally anyway', () => {
  /*
   * تغييرٌ يقع محلّيًّا بعد امتناع الخادم يُري المشغّلَ أنه وقع، ولا أثرَ له حيث يُحتجّ.
   * وهي نفسُ سياسة الختم والنشر القائمة.
   */
  for (const [call, refusal] of [
    ['attestPolicyChangeOnServer(', 'POLICY_CHANGE_AUTHORITY_UNAVAILABLE'],
    ['attestScoreCorrectionOnServer(', 'SCORE_CORRECTION_AUTHORITY_UNAVAILABLE'],
    ['attestReadingChangeOnServer(', 'PARTICIPANT_READING_CHANGE_REFUSED'],
  ]) {
    assert.ok(STORE.includes(call), `the store must ask the server: ${call}`);
    assert.ok(STORE.includes(refusal), `a refusal must be recorded by name: ${refusal}`);
  }
});

test('only a reading change goes through the reading authority — not every participant edit', () => {
  /*
   * `updateParticipant` يعدّل حقولًا كثيرة. وإمرارُها كلِّها من حارس الرواية يوقف تصحيحَ
   * اسمٍ لأن محرّك الأسئلة غيرُ مهيّأ — وهو منعٌ بلا سبب.
   */
  const at = STORE.indexOf('const updateParticipant = async');
  assert.ok(at > 0, 'updateParticipant must exist');
  const body = STORE.slice(at, at + 1600);
  assert.ok(/if\(patch\.riwaya!==undefined && String\(patch\.riwaya\)!==String\(current\.riwaya\)\)/.test(body),
    'the authority is consulted only when the reading actually changes');
});

test('a refused score correction resolves the appeal without moving the score', () => {
  // حسمُ الاعتراض قرارٌ بشريّ وقع؛ وإلغاؤه لأن التصحيح رُفض يُلغي قرارًا لم يُرفض.
  const at = STORE.indexOf('const resolveAppeal = async');
  const body = STORE.slice(at, at + 1800);
  assert.ok(body.includes('appliedDelta=0;'), 'the appeal still resolves, only the delta is dropped');
  assert.equal(/SCORE_CORRECTION_AUTHORITY_UNAVAILABLE[\s\S]{0,200}return false/.test(body), false,
    'a refused correction must not abandon the human decision');
});
