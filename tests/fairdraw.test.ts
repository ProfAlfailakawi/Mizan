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

test('FairDraw public proof reproduces selection and rejects altered commitment',async()=>{
 const policy=getCompetitionPolicy(SEED_COMPETITION);const participant=SEED_PARTICIPANTS[0];
 const draw=await generateFairDraw({pool:DEVELOPMENT_QUESTION_BANK,participant,policy,seed:'00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'});
 const { verifyFairDrawPublicProof }=await import('../src/lib/fairdraw');
 const proof={id:'proof-1',competitionId:participant.competitionId,questionSetId:draw.questionSetId,algorithmVersion:draw.algorithmVersion!,ruleVersion:draw.ruleVersion!,poolVersion:draw.poolVersion!,poolSnapshotHash:draw.poolSnapshotHash!,constraintHash:draw.constraintHash!,seedCommitmentHash:draw.seedCommitmentHash,publicCommitmentHash:draw.publicCommitmentHash!,secretSeed:draw.seedReveal,selectionIds:draw.questions.map(q=>q.id),status:'REVEALED' as const,createdAt:draw.generatedAt,participantReading:participant.riwaya,constraints:{questionsPerParticipant:policy.questions.questionsPerParticipant,targetDifficulty:policy.questions.targetDifficulty,difficultyTolerance:policy.questions.difficultyTolerance,diversity:policy.questions.diversity,excludedIds:[]},eligiblePoolSnapshot:DEVELOPMENT_QUESTION_BANK.map(q=>({id:q.id,riwaya:q.riwaya,surahNumber:q.surahNumber,startAyah:q.startAyah,endAyah:q.endAyah,juzNumber:q.juzNumber,difficultyRating:q.difficultyRating,mutashabihatDensity:q.mutashabihatDensity,tajweedComplexity:q.tajweedComplexity}))};
 assert.equal((await verifyFairDrawPublicProof(proof)).valid,true);
 assert.equal((await verifyFairDrawPublicProof({...proof,publicCommitmentHash:'tampered'})).valid,false);
 const tamperedPool={...proof,eligiblePoolSnapshot:proof.eligiblePoolSnapshot.map((q,i)=>i===0?{...q,difficultyRating:q.difficultyRating+0.25}:q)};
 assert.equal((await verifyFairDrawPublicProof(tamperedPool)).valid,false);
});
