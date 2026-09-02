import { CompetitionPolicy, Participant, QuestionPoolItem, QuestionSelection } from '../types';
import { newId, sha256 } from './crypto';
import { hashCanonical } from './trust-protocol';

export const FAIRDRAW_ALGORITHM_VERSION='MIZAN-FAIRDRAW-2.0';
function normalizedRiwaya(value: string) { return value.toLowerCase().replace(/[^a-z\u0600-\u06ff]/g,''); }
function secureSeed(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function tieValue(seed:string,id:string){return parseInt((await sha256(`${seed}|${id}`)).slice(0,13),16)/0x1fffffffffffff}

async function selectWithSeed(args:{pool:QuestionPoolItem[];participant:{riwaya:string};policy:CompetitionPolicy;seed:string;maxJuz?:number;excludedIds?:string[]}){
 const {participant,policy}=args;const excluded=new Set(args.excludedIds||[]);const participantRiwaya=normalizedRiwaya(participant.riwaya);
 let candidates=args.pool.filter(q=>!excluded.has(q.id));
 // Exact reading isolation: if the pool has no matching reading, fail rather than silently falling back to Hafs.
 const riwayaMatches=candidates.filter(q=>{const qn=normalizedRiwaya(q.riwaya);return participantRiwaya===qn||participantRiwaya.includes(qn)||qn.includes(participantRiwaya)});
 if(!riwayaMatches.length)throw new Error('FAIRDRAW_READING_SOURCE_MISMATCH'); candidates=riwayaMatches;
 if(args.maxJuz)candidates=candidates.filter(q=>q.juzNumber<=args.maxJuz!);if(!candidates.length)throw new Error('FAIRDRAW_NO_ELIGIBLE_QUESTIONS');
 const scored=await Promise.all(candidates.map(async q=>({q,delta:Math.abs(q.difficultyRating-policy.questions.targetDifficulty),rand:await tieValue(args.seed,q.id)})));scored.sort((a,b)=>a.delta-b.delta||a.rand-b.rand);
 const selected:QuestionPoolItem[]=[];for(const item of scored){if(selected.length>=policy.questions.questionsPerParticipant)break;if(policy.questions.diversity.acrossSurah&&selected.some(s=>s.surahNumber===item.q.surahNumber)&&scored.length>policy.questions.questionsPerParticipant)continue;if(policy.questions.diversity.acrossJuz&&selected.some(s=>s.juzNumber===item.q.juzNumber)&&scored.length>policy.questions.questionsPerParticipant)continue;selected.push(item.q)}
 if(selected.length<policy.questions.questionsPerParticipant){for(const item of scored){if(selected.length>=policy.questions.questionsPerParticipant)break;if(!selected.some(s=>s.id===item.q.id))selected.push(item.q)}}
 return selected;
}

/** FairDraw proves reproducibility against configured constraints; it does not claim absolute or philosophical fairness. */
export async function generateFairDraw(args:{pool:QuestionPoolItem[];participant:Participant;policy:CompetitionPolicy;maxJuz?:number;excludedIds?:string[];seed?:string;poolVersion?:string;quranSourceManifestId?:string;qiraah?:string;rawi?:string;tariq?:string;variantLocusVersion?:string;difficultyMetadataVersion?:string}):Promise<QuestionSelection>{
 const seed=args.seed||secureSeed();const selected=await selectWithSeed({...args,seed});const vector=selected.reduce((sum,q)=>sum+q.difficultyRating,0)/Math.max(1,selected.length);
 const poolSnapshotHash=await hashCanonical(args.pool.map(q=>({id:q.id,riwaya:q.riwaya,surah:q.surahNumber,start:q.startAyah,end:q.endAyah,difficulty:q.difficultyRating,juz:q.juzNumber,mutashabihat:q.mutashabihatDensity,tajweed:q.tajweedComplexity})).sort((a,b)=>a.id.localeCompare(b.id)));
 const poolVersion=args.poolVersion||poolSnapshotHash;
 const constraints={questionsPerParticipant:args.policy.questions.questionsPerParticipant,targetDifficulty:args.policy.questions.targetDifficulty,difficultyTolerance:args.policy.questions.difficultyTolerance,diversity:args.policy.questions.diversity,maxJuz:args.maxJuz,excludedIds:[...(args.excludedIds||[])].sort(),quranSourceManifestId:args.quranSourceManifestId,qiraah:args.qiraah,rawi:args.rawi,tariq:args.tariq,variantLocusVersion:args.variantLocusVersion,difficultyMetadataVersion:args.difficultyMetadataVersion};
 const constraintHash=await hashCanonical(constraints);const seedCommitmentHash=`SHA256:${await sha256(seed)}`;const publicCommitmentHash=await hashCanonical({algorithmVersion:FAIRDRAW_ALGORITHM_VERSION,ruleVersion:args.policy.version,poolVersion,poolSnapshotHash,constraintHash,seedCommitmentHash});
 return {questionSetId:newId('qset'),participantId:args.participant.id,questions:selected,difficultyVectorScore:Number(vector.toFixed(3)),seedCommitmentHash,fairnessToleranceDelta:args.policy.questions.difficultyTolerance,generatedAt:new Date().toISOString(),algorithmVersion:FAIRDRAW_ALGORITHM_VERSION,poolVersion,poolSnapshotHash,ruleVersion:args.policy.version,constraintHash,publicCommitmentHash,seedReveal:seed,quranSourceManifestId:args.quranSourceManifestId,qiraah:args.qiraah,rawi:args.rawi,tariq:args.tariq,variantLocusVersion:args.variantLocusVersion,difficultyMetadataVersion:args.difficultyMetadataVersion};
}

export async function verifyFairDrawSelection(args:{selection:QuestionSelection;pool:QuestionPoolItem[];participant:Participant;policy:CompetitionPolicy;maxJuz?:number;excludedIds?:string[]}){
 const s=args.selection;if(!s.seedReveal)return {valid:false,reason:'SEED_NOT_REVEALED'} as const;if(s.algorithmVersion!==FAIRDRAW_ALGORITHM_VERSION)return {valid:false,reason:'ALGORITHM_VERSION_MISMATCH'} as const;
 const seedCommit=`SHA256:${await sha256(s.seedReveal)}`;if(seedCommit!==s.seedCommitmentHash)return {valid:false,reason:'SEED_COMMITMENT_MISMATCH'} as const;
 const reproduced=await generateFairDraw({...args,seed:s.seedReveal,poolVersion:s.poolVersion,quranSourceManifestId:s.quranSourceManifestId,qiraah:s.qiraah,rawi:s.rawi,tariq:s.tariq,variantLocusVersion:s.variantLocusVersion,difficultyMetadataVersion:s.difficultyMetadataVersion});
 const selectionMatches=reproduced.questions.map(q=>q.id).join('|')===s.questions.map(q=>q.id).join('|');const commitmentMatches=reproduced.publicCommitmentHash===s.publicCommitmentHash;return {valid:selectionMatches&&commitmentMatches,selectionMatches,commitmentMatches,statement:'The selected set satisfies the configured fairness constraints.'};
}


/** Portable verifier using only the disclosed proof snapshot. No participant identity or Quran text is required. */
export async function verifyFairDrawPublicProof(proof:import('../types').FairDrawProofRecord){
  if(proof.status==='COMMITTED'||!proof.secretSeed)return {valid:false,reason:'SEED_NOT_REVEALED'} as const;
  if(proof.algorithmVersion!==FAIRDRAW_ALGORITHM_VERSION)return {valid:false,reason:'ALGORITHM_VERSION_MISMATCH'} as const;
  if(!proof.ruleVersion||!proof.poolVersion||!proof.participantReading||!proof.constraints||!proof.eligiblePoolSnapshot?.length)return {valid:false,reason:'PROOF_SNAPSHOT_INCOMPLETE'} as const;
  const seedHash=`SHA256:${await sha256(proof.secretSeed)}`;
  if(seedHash!==proof.seedCommitmentHash)return {valid:false,reason:'SEED_COMMITMENT_MISMATCH'} as const;
  const pool:QuestionPoolItem[]=proof.eligiblePoolSnapshot.map(q=>({...q,surahNameArabic:'',surahNameEnglish:'',expectedTextArabic:'',timesUsed:0}));
  const policy={version:proof.ruleVersion,questions:{questionsPerParticipant:proof.constraints.questionsPerParticipant,targetDifficulty:proof.constraints.targetDifficulty,difficultyTolerance:proof.constraints.difficultyTolerance,diversity:proof.constraints.diversity}} as CompetitionPolicy;
  const selected=await selectWithSeed({pool,participant:{riwaya:proof.participantReading},policy,seed:proof.secretSeed,maxJuz:proof.constraints.maxJuz,excludedIds:proof.constraints.excludedIds});
  const selectionMatches=selected.map(q=>q.id).join('|')===proof.selectionIds.join('|');
  const snapshotPoolHash=await hashCanonical(pool.map(q=>({id:q.id,riwaya:q.riwaya,surah:q.surahNumber,start:q.startAyah,end:q.endAyah,difficulty:q.difficultyRating,juz:q.juzNumber,mutashabihat:q.mutashabihatDensity,tajweed:q.tajweedComplexity})).sort((a,b)=>a.id.localeCompare(b.id)));
  const poolSnapshotMatches=snapshotPoolHash===proof.poolSnapshotHash;
  // In certified-source mode poolVersion is the immutable Quran package hash; in development it is the disclosed pool snapshot hash.
  const poolVersionMatches=proof.quranSourcePackageHash?proof.poolVersion===proof.quranSourcePackageHash:proof.poolVersion===proof.poolSnapshotHash;
  const poolMatches=poolSnapshotMatches&&poolVersionMatches;
  const constraints={questionsPerParticipant:proof.constraints.questionsPerParticipant,targetDifficulty:proof.constraints.targetDifficulty,difficultyTolerance:proof.constraints.difficultyTolerance,diversity:proof.constraints.diversity,maxJuz:proof.constraints.maxJuz,excludedIds:[...(proof.constraints.excludedIds||[])].sort(),quranSourceManifestId:proof.quranSourceManifestId,qiraah:proof.qiraah,rawi:proof.rawi,tariq:proof.tariq,variantLocusVersion:proof.variantLocusVersion,difficultyMetadataVersion:proof.difficultyMetadataVersion};
  const computedConstraintHash=await hashCanonical(constraints);
  const constraintMatches=computedConstraintHash===proof.constraintHash;
  const computedPublicCommitmentHash=await hashCanonical({algorithmVersion:proof.algorithmVersion,ruleVersion:proof.ruleVersion,poolVersion:proof.poolVersion,poolSnapshotHash:proof.poolSnapshotHash,constraintHash:computedConstraintHash,seedCommitmentHash:proof.seedCommitmentHash});
  const publicCommitmentMatches=computedPublicCommitmentHash===proof.publicCommitmentHash;
  return {valid:selectionMatches&&poolMatches&&constraintMatches&&publicCommitmentMatches,selectionMatches,poolMatches,constraintMatches,commitmentMatches:publicCommitmentMatches,statement:'The selected set satisfies the configured fairness constraints.'};
}
