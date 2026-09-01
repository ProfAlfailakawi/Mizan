import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_POLICY, applyTemplate, getCompetitionPolicy } from '../src/lib/competition-config';
import { SEED_COMPETITION } from '../src/lib/seed-data';

test('competition policy belongs to the competition instance', () => {
  const a=applyTemplate({...SEED_COMPETITION,id:'a'},'international-hifz');
  const b=applyTemplate({...SEED_COMPETITION,id:'b'},'youth-local');
  assert.notEqual(getCompetitionPolicy(a).questions.questionsPerParticipant,getCompetitionPolicy(b).questions.questionsPerParticipant);
  assert.equal(BASE_POLICY.judging.aiCanAffectScore,false);
});

test('AI can never affect score through CompetitionPolicy',()=>{
 const p=getCompetitionPolicy(SEED_COMPETITION);
 assert.equal(p.judging.aiCanAffectScore,false);
});
