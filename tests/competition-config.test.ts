import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_POLICY, getCompetitionPolicy } from '../src/lib/competition-config';
import { SEED_COMPETITION } from '../src/data/seed-data';

test('competition policy belongs to the competition instance', () => {
  const a={...SEED_COMPETITION,id:'a',policy:getCompetitionPolicy(SEED_COMPETITION)};
  const aPolicy=getCompetitionPolicy(a);
  const b={...SEED_COMPETITION,id:'b',policy:{...aPolicy,questions:{...aPolicy.questions,questionsPerParticipant:aPolicy.questions.questionsPerParticipant+2}}};
  assert.equal(getCompetitionPolicy(a).questions.questionsPerParticipant,aPolicy.questions.questionsPerParticipant);
  assert.equal(getCompetitionPolicy(b).questions.questionsPerParticipant,aPolicy.questions.questionsPerParticipant+2);
  assert.equal(BASE_POLICY.judging.aiCanAffectScore,false);
});

test('AI can never affect score through CompetitionPolicy',()=>{
 const p=getCompetitionPolicy(SEED_COMPETITION);
 assert.equal(p.judging.aiCanAffectScore,false);
});

test('readiness flags dates in the wrong order and an unknown timezone, and stays silent for good data', async () => {
  const { getReadinessIssues, isValidTimeZone } = await import('../src/lib/competition-config');
  const { SEED_COMPETITION } = await import('../src/data/seed-data');
  const ids = (c: typeof SEED_COMPETITION) => getReadinessIssues(c).map(i => i.id);
  assert.ok(!ids({ ...SEED_COMPETITION, startDate: '2027-02-10', endDate: '2027-02-15' }).includes('dates'));
  assert.ok(ids({ ...SEED_COMPETITION, startDate: '2027-03-10', endDate: '2027-03-05' }).includes('dates'));
  assert.ok(ids({ ...SEED_COMPETITION, registrationStartDate: '2027-01-10', registrationEndDate: '2027-01-01' }).includes('registration-dates'));
  assert.ok(ids({ ...SEED_COMPETITION, timezone: 'Mars/Olympus' }).includes('timezone'));
  assert.ok(!ids({ ...SEED_COMPETITION, timezone: 'Asia/Kuwait' }).includes('timezone'));
  assert.ok(!ids({ ...SEED_COMPETITION, startDate: '', endDate: '', timezone: '' }).some(i => ['dates', 'timezone'].includes(i)), 'empty is "not set yet", not "wrong"');
  assert.equal(isValidTimeZone('Europe/Istanbul'), true);
  assert.equal(isValidTimeZone('not a zone'), false);
});

test('a category whose minimum age exceeds its maximum is a readiness blocker (it would reject every registrant)', async () => {
  const { getReadinessIssues } = await import('../src/lib/competition-config');
  const bad = { ...SEED_COMPETITION, categories: [{ ...SEED_COMPETITION.categories[0], minAge: 20, maxAge: 10 }] };
  assert.ok(getReadinessIssues(bad).some(i => i.id.startsWith('age-range:')));
  const ok = { ...SEED_COMPETITION, categories: [{ ...SEED_COMPETITION.categories[0], minAge: 10, maxAge: 20 }] };
  assert.ok(!getReadinessIssues(ok).some(i => i.id.startsWith('age-range:')));
});
