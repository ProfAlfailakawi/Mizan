/*
 * الختمُ يُبنى من إرسالات المحكمين المخزَّنة، لا من جسم الطلب.
 *
 * كان `POST /api/results/seal` يقرأ `submissions` و`criteria` و`mode` من الطلب، فينال رئيسُ
 * تحكيمٍ أو مديرُ مسابقة ختمًا موقَّعًا من الخادم على درجاتٍ يكتبها بيده. وفي النمط المفروض
 * (`hybrid`) تُجمَع درجاتُ المعايير، فمعيارٌ مختلَق بلا إرسالات يُضيف `maxScore` كاملًا.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { sealInputsFromStore } from '../server/seal-inputs';
import { sealResult } from '../server/result-sealing';

const SERVER = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const sealRoute = () => {
  const start = SERVER.indexOf("app.post('/api/results/seal',");
  const end = SERVER.indexOf("app.post('/api/results/seal/verify'");
  assert.ok(start >= 0 && end > start);
  return SERVER.slice(start, end);
};

const competitionDoc = {
  competition: {
    id: 'c1',
    ruleSet: { id: 'rs', version: '2', dropExtremes: false, criteria: [{ id: 'hifz', maxScore: 60 }, { id: 'tajweed', maxScore: 40 }] },
    ruleSets: [{ id: 'rs', version: '1', dropExtremes: false, criteria: [{ id: 'hifz', maxScore: 70 }, { id: 'tajweed', maxScore: 30 }] }],
  },
};
const sub = (judgeId: string, hifz: number, tajweed: number, extra: Record<string, unknown> = {}) => ({
  participantId: 'p1', judgeId, sessionId: 's1', locked: true, submittedAt: `2026-10-29T10:00:0${judgeId.length}Z`,
  criterionScores: { hifz, tajweed }, totalScore: hifz + tajweed, scoredCriterionIds: ['hifz', 'tajweed'],
  uploaderUid: `uid-${judgeId}`, updatedAt: new Date().toISOString(), ...extra,
});

test('the seal route never reads scores, criteria or mode from the request body', () => {
  const body = sealRoute();
  for (const field of ['body.submissions', 'body.criteria', 'body.mode', 'body.dropExtremes', 'body.sessionEventCount', 'body.previousFinalScore', 'body.previousSealSha256'])
    assert.equal(body.includes(field), false, `${field} must not feed the seal`);
  assert.match(body, /sealInputsFromStore\(/, 'the inputs come from the stored judge submissions');
  assert.match(body, /judge_submissions/, 'the route reads the judges\' own documents');
  assert.match(body, /RESULT_SEAL_SUBMISSIONS_UNAVAILABLE/, 'no store means a clear refusal, not a fallback to the body');
});

test('stored inputs: only this participant\'s locked submissions, rubric from the stored competition', () => {
  const out = sealInputsFromStore(competitionDoc, [
    sub('j1', 50, 30), sub('j2', 54, 34),
    sub('j3', 10, 10, { locked: false }),            // مسوّدة لم تُقفل
    sub('j4', 60, 40, { participantId: 'p2' }),      // متسابقٌ آخر
  ], 'p1');
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.deepEqual(out.inputs.submissions.map(s => s.judgeId), ['j1', 'j2']);
  assert.deepEqual(out.inputs.criteria, [{ id: 'hifz', maxScore: 60 }, { id: 'tajweed', maxScore: 40 }]);
  assert.equal(out.inputs.mode, 'hybrid', 'the policy\'s fixed judging mode, not a client choice');
  assert.equal(out.inputs.sessionId, 's1');
  // حقولُ المزامنة لا تدخل البصمة.
  assert.equal('updatedAt' in out.inputs.submissions[0], false);
  assert.equal('uploaderUid' in out.inputs.submissions[0], false);
});

test('a submission pinned to an earlier rubric revision is scored with that revision, as the client does', () => {
  const out = sealInputsFromStore(competitionDoc, [sub('j1', 50, 30, { ruleSetId: 'rs', ruleSetVersion: '1' })], 'p1');
  assert.equal(out.ok, true);
  if (out.ok) assert.deepEqual(out.inputs.criteria, [{ id: 'hifz', maxScore: 70 }, { id: 'tajweed', maxScore: 30 }]);
});

test('no stored submissions → explicit refusal code', () => {
  assert.deepEqual(sealInputsFromStore(competitionDoc, [], 'p1'), { ok: false, code: 'SEAL_NO_STORED_SUBMISSIONS' });
  assert.deepEqual(sealInputsFromStore(competitionDoc, [sub('j1', 1, 1, { locked: false })], 'p1'), { ok: false, code: 'SEAL_NO_STORED_SUBMISSIONS' });
  assert.deepEqual(sealInputsFromStore(null, [sub('j1', 1, 1)], 'p1'), { ok: false, code: 'SEAL_COMPETITION_NOT_FOUND' });
});

test('the score is the unchanged panel formula over the stored submissions; sync noise does not change the inputs digest', () => {
  const a = sealInputsFromStore(competitionDoc, [sub('j1', 50, 30), sub('j2', 54, 34)], 'p1');
  const b = sealInputsFromStore(competitionDoc, [sub('j2', 54, 34, { updatedAt: 'later' }), sub('j1', 50, 30, { updatedAt: 'later' })], 'p1');
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  const seal = (i: typeof a.inputs) => sealResult({ competitionId: 'c1', participantId: 'p1', sealedBy: 'uid-head', ...i });
  const sa = seal(a.inputs), sb = seal(b.inputs);
  assert.ok('sealed' in sa && 'sealed' in sb);
  if (!('sealed' in sa) || !('sealed' in sb)) return;
  // hybrid: مجموع متوسط كل معيار = 52 + 32
  assert.equal(sa.sealed.finalScore, 84);
  assert.equal(sa.sealed.inputsSha256, sb.sealed.inputsSha256, 'a re-sync is still the same inputs, so a retry stays idempotent');
});
