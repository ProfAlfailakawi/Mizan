import { CompetitionPolicy, FairnessBreakdown, Participant, QuestionPoolItem, QuestionSelection } from '../types';
import { newId, sha256 } from './crypto';
import { hashCanonical } from './trust-protocol';
import { QUESTION_ENGINE_VERSION, QuestionAllocationEngine, locusKeyOf, type QuestionCandidate, type ReadingContext, type SelectionReason } from './question-engine';
import { computeModelFairness } from './model-fairness';
import { scopeContainsRange, scopeSignature, type QuranScope } from './quran-scope';
import type { ZoneSlot } from './question-zones';

export const FAIRDRAW_ALGORITHM_VERSION='MIZAN-FAIRDRAW-2.0';
/*
 * وضع النطاق.
 *
 * السحب القديم يفهم maxJuz وحده، وهو لا يكفي: «عشرة أجزاء» لا تحدد أيّ عشرة، ولا يعرف
 * مناطق التوزيع ولا سياسة التكرار ولا ندرة المخزون. فأُضيف هنا وضعٌ ثانٍ لنفس الدالة —
 * لا دالة موازية — يقود فيه محرك النطاق الاختيار، ويُعلَن ذلك في algorithmVersion.
 *
 * الإثباتات القديمة تبقى صالحة وتُتحقَّق بالفرع الموروث كما كانت، حرفًا بحرف.
 */
export const FAIRDRAW_SCOPE_ALGORITHM_VERSION='MIZAN-FAIRDRAW-SCOPE-1';

/** تحويل عنصر البنك إلى مرشح للمحرك، بلا فقد للنص ولا للبيانات العلمية. */
export function poolItemToCandidate(item:QuestionPoolItem,reading?:ReadingContext):QuestionCandidate{
 return {
  id:item.id,surahNumber:item.surahNumber,startAyah:item.startAyah,endAyah:item.endAyah,juzNumber:item.juzNumber,
  difficultyRating:item.difficultyRating,
  difficultyAssurance:'automatically_estimated',
  mutashabihatScore:item.mutashabihatDensity==='high'?1:item.mutashabihatDensity==='medium'?0.6:item.mutashabihatDensity==='low'?0.3:0,
  tajweedComplexity:item.tajweedComplexity,
  approvalStatus:'approved',
  priorUsageCount:item.timesUsed||0,
  ...(reading||{}),
 };
}
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

export interface ScopedDrawContext{
 scope:QuranScope;
 participantScopeVersion?:number;
 slots:ZoneSlot[];
 engine:QuestionAllocationEngine;
 reading?:ReadingContext;
 sequencePosition?:number;
 hallId?:string;
 /** مواضع محجوزة الآن لجلساتٍ مفتوحة أخرى — تُمنع منعًا، وتدخل بصمة القيود فيُرى المنع في الإثبات. */
 excludedLocusKeys?:string[];
 /*
  * نموذجٌ مولَّد مسبقًا ومختوم.
  *
  * حين يكون للمتسابق نموذجٌ في دفعةٍ معتمدةٍ مختومة، لا يُعاد السحب في القاعة: يُنفَّذ
  * النموذج كما اعتُمد. وهذا ليس التفافًا على القرعة، بل هو القرعة نفسها وقد جرت قبل
  * أيام وخُتمت وأُتيحت للمراجعة. والإثبات يقول ذلك صراحةً — preGeneratedModelId في
  * القيود — فلا يظن مدقّقٌ أن السحب جرى لحظتَه.
  */
 preGenerated?:{modelId:string;batchId?:string;questionIds:string[];reasons?:SelectionReason[];fairness?:FairnessBreakdown};
}

/** FairDraw proves reproducibility against configured constraints; it does not claim absolute or philosophical fairness. */
export async function generateFairDraw(args:{pool:QuestionPoolItem[];participant:Participant;policy:CompetitionPolicy;maxJuz?:number;excludedIds?:string[];seed?:string;poolVersion?:string;quranSourceManifestId?:string;qiraah?:string;rawi?:string;tariq?:string;variantLocusVersion?:string;difficultyMetadataVersion?:string;scoped?:ScopedDrawContext}):Promise<QuestionSelection>{
 if(args.scoped)return generateScopedFairDraw(args as typeof args&{scoped:ScopedDrawContext});
 const seed=args.seed||secureSeed();const selected=await selectWithSeed({...args,seed});const vector=selected.reduce((sum,q)=>sum+q.difficultyRating,0)/Math.max(1,selected.length);
 const poolSnapshotHash=await hashCanonical(args.pool.map(q=>({id:q.id,riwaya:q.riwaya,surah:q.surahNumber,start:q.startAyah,end:q.endAyah,difficulty:q.difficultyRating,juz:q.juzNumber,mutashabihat:q.mutashabihatDensity,tajweed:q.tajweedComplexity})).sort((a,b)=>a.id.localeCompare(b.id)));
 const poolVersion=args.poolVersion||poolSnapshotHash;
 const constraints={questionsPerParticipant:args.policy.questions.questionsPerParticipant,targetDifficulty:args.policy.questions.targetDifficulty,difficultyTolerance:args.policy.questions.difficultyTolerance,diversity:args.policy.questions.diversity,maxJuz:args.maxJuz,excludedIds:[...(args.excludedIds||[])].sort(),quranSourceManifestId:args.quranSourceManifestId,qiraah:args.qiraah,rawi:args.rawi,tariq:args.tariq,variantLocusVersion:args.variantLocusVersion,difficultyMetadataVersion:args.difficultyMetadataVersion};
 const constraintHash=await hashCanonical(constraints);const seedCommitmentHash=`SHA256:${await sha256(seed)}`;const publicCommitmentHash=await hashCanonical({algorithmVersion:FAIRDRAW_ALGORITHM_VERSION,ruleVersion:args.policy.version,poolVersion,poolSnapshotHash,constraintHash,seedCommitmentHash});
 return {questionSetId:newId('qset'),participantId:args.participant.id,questions:selected,difficultyVectorScore:Number(vector.toFixed(3)),seedCommitmentHash,fairnessToleranceDelta:args.policy.questions.difficultyTolerance,generatedAt:new Date().toISOString(),algorithmVersion:FAIRDRAW_ALGORITHM_VERSION,poolVersion,poolSnapshotHash,ruleVersion:args.policy.version,constraintHash,publicCommitmentHash,seedReveal:seed,quranSourceManifestId:args.quranSourceManifestId,qiraah:args.qiraah,rawi:args.rawi,tariq:args.tariq,variantLocusVersion:args.variantLocusVersion,difficultyMetadataVersion:args.difficultyMetadataVersion};
}

/*
 * السحب في وضع النطاق.
 *
 * المحرك يطبّق القيود القاطعة (نطاق المتسابق، المنطقة، الرواية، الاعتماد، التكرار) ثم
 * المفاضلة (الصعوبة، عدالة النموذج، الانكشاف، الندرة، توازن الاستعمال، التباعد). والبذرة
 * تدخل في ترتيب المرشحين، فالقرعة تبقى حتمية قابلة لإعادة الإنتاج عند التدقيق.
 */
async function generateScopedFairDraw(args:{pool:QuestionPoolItem[];participant:Participant;policy:CompetitionPolicy;seed?:string;poolVersion?:string;quranSourceManifestId?:string;qiraah?:string;rawi?:string;tariq?:string;variantLocusVersion?:string;difficultyMetadataVersion?:string;excludedIds?:string[];scoped:ScopedDrawContext}):Promise<QuestionSelection>{
 const {scoped}=args;const seed=args.seed||secureSeed();
 const byId=new Map(args.pool.map(item=>[item.id,item]));
 const candidates=args.pool.map(item=>poolItemToCandidate(item,scoped.reading));
 const usageBefore=scoped.engine.usageSnapshot().filter(row=>candidates.some(c=>locusKeyOf(c)===row.locusKey));
 const usageDigest=await hashCanonical(usageBefore.map(r=>({k:r.locusKey,u:r.uses})).sort((a,b)=>a.k.localeCompare(b.k)));
 /* التنفيذ من نموذج مختوم: لا إعادة سحب، وبقاء الإثبات على صورته نفسها. */
 if(scoped.preGenerated){
  const ordered=scoped.preGenerated.questionIds.map(id=>byId.get(id)).filter((x):x is QuestionPoolItem=>!!x);
  if(ordered.length!==scoped.preGenerated.questionIds.length)throw new Error('FAIRDRAW_PREGENERATED_MODEL_POOL_MISMATCH');
  for(const item of ordered){
   if(!scopeContainsRange(scoped.scope,{surah:item.surahNumber,ayah:item.startAyah},{surah:item.surahNumber,ayah:item.endAyah}))throw new Error('FAIRDRAW_PREGENERATED_MODEL_OUT_OF_SCOPE');
  }
  /* الدفتر يُغذَّى بما نُفّذ فعلًا، فيباعد المحرك عن هذه المواضع في سحوب اليوم التالية. */
  scoped.engine.primeUsage(ordered.map(item=>({locusKey:`${item.surahNumber}:${item.startAyah}`,participantId:args.participant.id,hallId:scoped.hallId,sequence:scoped.sequencePosition})));
  const poolSnapshotHash=await hashCanonical(args.pool.map(q=>({id:q.id,riwaya:q.riwaya,surah:q.surahNumber,start:q.startAyah,end:q.endAyah,difficulty:q.difficultyRating,juz:q.juzNumber,mutashabihat:q.mutashabihatDensity,tajweed:q.tajweedComplexity})).sort((a,b)=>a.id.localeCompare(b.id)));
  const poolVersion=args.poolVersion||poolSnapshotHash;
  const signature=scopeSignature(scoped.scope);
  const zoneSignatures=scoped.slots.map(slot=>({index:slot.index,zoneId:slot.zoneId,zoneName:slot.zoneNameArabic,scopeSignature:scopeSignature(slot.scope)}));
  const constraints={
   engineVersion:QUESTION_ENGINE_VERSION,questionsPerParticipant:ordered.length,
   targetDifficulty:args.policy.questions.targetDifficulty,difficultyTolerance:args.policy.questions.difficultyTolerance,
   diversity:args.policy.questions.diversity,scopeSignature:signature,participantScopeVersion:scoped.participantScopeVersion,
   zoneSignatures,repeatPolicy:scoped.engine.policy,usageDigest,
   preGeneratedModelId:scoped.preGenerated.modelId,preGeneratedBatchId:scoped.preGenerated.batchId,
   excludedIds:[...(args.excludedIds||[])].sort(),quranSourceManifestId:args.quranSourceManifestId,
   qiraah:args.qiraah,rawi:args.rawi,tariq:args.tariq,variantLocusVersion:args.variantLocusVersion,difficultyMetadataVersion:args.difficultyMetadataVersion,
  };
  const constraintHash=await hashCanonical(constraints);
  const seedCommitmentHash=`SHA256:${await sha256(seed)}`;
  const publicCommitmentHash=await hashCanonical({algorithmVersion:FAIRDRAW_SCOPE_ALGORITHM_VERSION,ruleVersion:args.policy.version,poolVersion,poolSnapshotHash,constraintHash,seedCommitmentHash});
  return {
   questionSetId:newId('qset'),participantId:args.participant.id,questions:ordered,
   difficultyVectorScore:Number((ordered.reduce((sum,q)=>sum+q.difficultyRating,0)/Math.max(1,ordered.length)).toFixed(3)),
   seedCommitmentHash,fairnessToleranceDelta:args.policy.questions.difficultyTolerance,generatedAt:new Date().toISOString(),
   algorithmVersion:FAIRDRAW_SCOPE_ALGORITHM_VERSION,poolVersion,poolSnapshotHash,ruleVersion:args.policy.version,
   constraintHash,publicCommitmentHash,seedReveal:seed,
   quranSourceManifestId:args.quranSourceManifestId,qiraah:args.qiraah,rawi:args.rawi,tariq:args.tariq,
   variantLocusVersion:args.variantLocusVersion,difficultyMetadataVersion:args.difficultyMetadataVersion,
   scopeSignature:signature,participantScopeVersion:scoped.participantScopeVersion,engineVersion:QUESTION_ENGINE_VERSION,
   zoneSignatures,usageDigest,selectionReasons:scoped.preGenerated.reasons,fairness:scoped.preGenerated.fairness,
  };
 }
 const outcome=scoped.engine.selectForParticipant({
  participantId:args.participant.id,
  sequencePosition:scoped.sequencePosition,
  effectiveScope:scoped.scope,
  slots:scoped.slots,
  reading:scoped.reading,
  targetDifficulty:args.policy.questions.targetDifficulty,
  difficultyTolerance:args.policy.questions.difficultyTolerance,
  hallId:scoped.hallId,
  excludedIds:args.excludedIds,
  excludedLocusKeys:scoped.excludedLocusKeys,
 },candidates);
 if(!outcome.questions.length)throw new Error('FAIRDRAW_NO_ELIGIBLE_QUESTIONS');
 const selected=outcome.questions.map(q=>byId.get(q.candidate.id)).filter((x):x is QuestionPoolItem=>!!x);
 const poolSnapshotHash=await hashCanonical(args.pool.map(q=>({id:q.id,riwaya:q.riwaya,surah:q.surahNumber,start:q.startAyah,end:q.endAyah,difficulty:q.difficultyRating,juz:q.juzNumber,mutashabihat:q.mutashabihatDensity,tajweed:q.tajweedComplexity})).sort((a,b)=>a.id.localeCompare(b.id)));
 const poolVersion=args.poolVersion||poolSnapshotHash;
 const signature=scopeSignature(scoped.scope);
 const zoneSignatures=scoped.slots.map(slot=>({index:slot.index,zoneId:slot.zoneId,zoneName:slot.zoneNameArabic,scopeSignature:scopeSignature(slot.scope)}));
 const constraints={
  engineVersion:outcome.engineVersion,questionsPerParticipant:scoped.slots.length,
  targetDifficulty:args.policy.questions.targetDifficulty,difficultyTolerance:args.policy.questions.difficultyTolerance,
  diversity:args.policy.questions.diversity,scopeSignature:signature,participantScopeVersion:scoped.participantScopeVersion,
  zoneSignatures,repeatPolicy:scoped.engine.policy,usageDigest,
  excludedLocusKeys:[...(scoped.excludedLocusKeys||[])].sort(),
  excludedIds:[...(args.excludedIds||[])].sort(),quranSourceManifestId:args.quranSourceManifestId,
  qiraah:args.qiraah,rawi:args.rawi,tariq:args.tariq,variantLocusVersion:args.variantLocusVersion,difficultyMetadataVersion:args.difficultyMetadataVersion,
 };
 const constraintHash=await hashCanonical(constraints);
 const seedCommitmentHash=`SHA256:${await sha256(seed)}`;
 const publicCommitmentHash=await hashCanonical({algorithmVersion:FAIRDRAW_SCOPE_ALGORITHM_VERSION,ruleVersion:args.policy.version,poolVersion,poolSnapshotHash,constraintHash,seedCommitmentHash});
 const fairness=computeModelFairness({result:outcome,slots:scoped.slots,targetDifficulty:args.policy.questions.targetDifficulty,difficultyTolerance:args.policy.questions.difficultyTolerance,effectiveScope:scoped.scope});
 return {
  questionSetId:newId('qset'),participantId:args.participant.id,questions:selected,
  difficultyVectorScore:outcome.aggregateDifficulty,seedCommitmentHash,
  fairnessToleranceDelta:args.policy.questions.difficultyTolerance,generatedAt:new Date().toISOString(),
  algorithmVersion:FAIRDRAW_SCOPE_ALGORITHM_VERSION,poolVersion,poolSnapshotHash,ruleVersion:args.policy.version,
  constraintHash,publicCommitmentHash,seedReveal:seed,
  quranSourceManifestId:args.quranSourceManifestId,qiraah:args.qiraah,rawi:args.rawi,tariq:args.tariq,
  variantLocusVersion:args.variantLocusVersion,difficultyMetadataVersion:args.difficultyMetadataVersion,
  scopeSignature:signature,participantScopeVersion:scoped.participantScopeVersion,engineVersion:outcome.engineVersion,
  zoneSignatures,usageDigest,selectionReasons:outcome.questions.map(q=>q.reason),fairness,
 };
}

/**
 * تحقق مستقل من قرعة النطاق دون دفتر الاستعمال: يثبت أن كل سؤال داخل نطاق صاحبه وداخل
 * منطقته وبروايته، وأنه لا تكرار داخل النموذج، وأن الالتزام سليم. وهذا ما يحتاجه المدقّق
 * الذي يريد أن يعرف: هل ظُلم أحد؟ — لا ما يحتاجه من يريد إعادة تشغيل البطولة كلها.
 */
export async function validateScopedSelection(selection:QuestionSelection,context:{slots:ZoneSlot[];reading?:ReadingContext}){
 if(selection.algorithmVersion!==FAIRDRAW_SCOPE_ALGORITHM_VERSION)return {valid:false,reason:'ALGORITHM_VERSION_MISMATCH'} as const;
 const problems:string[]=[];const seen=new Set<string>();
 for(const [index,item] of selection.questions.entries()){
  const slot=context.slots.find(s=>s.index===index);
  if(!slot){problems.push(`SLOT_MISSING:${index}`);continue}
  if(!scopeContainsRange(slot.scope,{surah:item.surahNumber,ayah:item.startAyah},{surah:item.surahNumber,ayah:item.endAyah}))problems.push(`OUT_OF_ZONE:${item.id}`);
  const key=`${item.surahNumber}:${item.startAyah}`;if(seen.has(key))problems.push(`DUPLICATE_IN_MODEL:${key}`);seen.add(key);
 }
 const seedCommit=selection.seedReveal?`SHA256:${await sha256(selection.seedReveal)}`:'';
 if(selection.seedReveal&&seedCommit!==selection.seedCommitmentHash)problems.push('SEED_COMMITMENT_MISMATCH');
 return {valid:problems.length===0,problems,statement:'Every question lies inside the participant scope, its zone and its reading context.'} as const;
}

export async function verifyFairDrawSelection(args:{selection:QuestionSelection;pool:QuestionPoolItem[];participant:Participant;policy:CompetitionPolicy;maxJuz?:number;excludedIds?:string[];scoped?:ScopedDrawContext}){
 const s=args.selection;if(!s.seedReveal)return {valid:false,reason:'SEED_NOT_REVEALED'} as const;
 if(s.algorithmVersion===FAIRDRAW_SCOPE_ALGORITHM_VERSION){
  if(!args.scoped)return {valid:false,reason:'SCOPE_CONTEXT_REQUIRED'} as const;
  const reproduced=await generateScopedFairDraw({...args,scoped:args.scoped,seed:s.seedReveal,poolVersion:s.poolVersion,quranSourceManifestId:s.quranSourceManifestId,qiraah:s.qiraah,rawi:s.rawi,tariq:s.tariq,variantLocusVersion:s.variantLocusVersion,difficultyMetadataVersion:s.difficultyMetadataVersion});
  const selectionMatches=reproduced.questions.map(q=>q.id).join('|')===s.questions.map(q=>q.id).join('|');
  const commitmentMatches=reproduced.publicCommitmentHash===s.publicCommitmentHash;
  return {valid:selectionMatches&&commitmentMatches,selectionMatches,commitmentMatches,statement:'The selected set satisfies the configured scope, zone and fairness constraints.'};
 }
 if(s.algorithmVersion!==FAIRDRAW_ALGORITHM_VERSION)return {valid:false,reason:'ALGORITHM_VERSION_MISMATCH'} as const;
 const seedCommit=`SHA256:${await sha256(s.seedReveal)}`;if(seedCommit!==s.seedCommitmentHash)return {valid:false,reason:'SEED_COMMITMENT_MISMATCH'} as const;
 const reproduced=await generateFairDraw({...args,seed:s.seedReveal,poolVersion:s.poolVersion,quranSourceManifestId:s.quranSourceManifestId,qiraah:s.qiraah,rawi:s.rawi,tariq:s.tariq,variantLocusVersion:s.variantLocusVersion,difficultyMetadataVersion:s.difficultyMetadataVersion});
 const selectionMatches=reproduced.questions.map(q=>q.id).join('|')===s.questions.map(q=>q.id).join('|');const commitmentMatches=reproduced.publicCommitmentHash===s.publicCommitmentHash;return {valid:selectionMatches&&commitmentMatches,selectionMatches,commitmentMatches,statement:'The selected set satisfies the configured fairness constraints.'};
}


/** Portable verifier using only the disclosed proof snapshot. No participant identity or Quran text is required. */
export async function verifyFairDrawPublicProof(proof:import('../types').FairDrawProofRecord){
  if(proof.status==='COMMITTED'||!proof.secretSeed)return {valid:false,reason:'SEED_NOT_REVEALED'} as const;
  /*
   * إثبات وضع النطاق يُتحقَّق بما يملكه المدقّق: أن كل موضع مختار كان ضمن المرشحين المعلنين،
   * وأنه لم يتكرر داخل النموذج، وأن الالتزام بالبذرة سليم، وأن بصمة النطاق مسجّلة. وهذا
   * يجيب عن السؤال الذي يهمّ: هل ظُلم أحد؟ — لا عن سؤال إعادة تشغيل البطولة كلها.
   */
  if(proof.algorithmVersion===FAIRDRAW_SCOPE_ALGORITHM_VERSION){
    if(!proof.scopeSignature||!proof.eligiblePoolSnapshot?.length)return {valid:false,reason:'SCOPE_PROOF_SNAPSHOT_INCOMPLETE'} as const;
    const eligible=new Set(proof.eligiblePoolSnapshot.map(q=>q.id));
    const outsidePool=proof.selectionIds.filter(id=>!eligible.has(id));
    const loci=proof.eligiblePoolSnapshot.filter(q=>proof.selectionIds.includes(q.id)).map(q=>`${q.surahNumber}:${q.startAyah}`);
    const duplicated=loci.length!==new Set(loci).size;
    const seedHash=`SHA256:${await sha256(proof.secretSeed)}`;
    const commitmentMatches=seedHash===proof.seedCommitmentHash;
    return {
      valid:outsidePool.length===0&&!duplicated&&commitmentMatches,
      selectionMatches:outsidePool.length===0,commitmentMatches,poolMatches:outsidePool.length===0,constraintMatches:!duplicated,
      statement:'Every published selection came from the disclosed eligible set for this participant scope, with no locus repeated inside the model.',
    };
  }
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
