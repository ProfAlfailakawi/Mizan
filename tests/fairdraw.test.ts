import test from 'node:test';
import assert from 'node:assert/strict';
import { generateFairDraw } from '../src/lib/fairdraw';
import { DEVELOPMENT_QUESTION_BANK } from '../src/lib/quran-vault';
import { getCompetitionPolicy } from '../src/lib/competition-config';
import { SEED_COMPETITION, SEED_PARTICIPANTS } from '../src/lib/seed-data';

test('FairDraw respects configured question count and writes commitment',async()=>{
 const policy=getCompetitionPolicy(SEED_COMPETITION); const participant=SEED_PARTICIPANTS[0];
 const draw=await generateFairDraw({pool:DEVELOPMENT_QUESTION_BANK,participant,policy});
 assert.equal(draw.questions.length,policy.questions.questionsPerParticipant);
 assert.match(draw.seedCommitmentHash,/^SHA256:/);
});
