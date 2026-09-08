import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_POLICY, getCompetitionPolicy } from '../src/lib/competition-config';
import { SEED_COMPETITION } from '../src/lib/seed-data';

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
