import { CompetitionPolicy, Participant, QuestionPoolItem, QuestionSelection } from '../types';
import { newId, sha256 } from './crypto';

function random01() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 0xffffffff;
  }
  return Math.random();
}

function normalizedRiwaya(value: string) { return value.toLowerCase().replace(/[^a-z\u0600-\u06ff]/g,''); }

/**
 * FairDraw is not a claim of absolute fairness. It validates a draw against the
 * configured competition constraints and records a commitment for later audit.
 */
export async function generateFairDraw(args: {
  pool: QuestionPoolItem[];
  participant: Participant;
  policy: CompetitionPolicy;
  maxJuz?: number;
  excludedIds?: string[];
}): Promise<QuestionSelection> {
  const {participant,policy}=args;
  const excluded=new Set(args.excludedIds||[]);
  const participantRiwaya=normalizedRiwaya(participant.riwaya);
  let candidates=args.pool.filter(q=>!excluded.has(q.id));
  const riwayaMatches=candidates.filter(q=>participantRiwaya.includes(normalizedRiwaya(q.riwaya)) || normalizedRiwaya(q.riwaya).includes('hafs') && participantRiwaya.includes('حفص'));
  if(riwayaMatches.length) candidates=riwayaMatches;
  if(args.maxJuz) candidates=candidates.filter(q=>q.juzNumber<=args.maxJuz!);
  if(!candidates.length) throw new Error('FAIRDRAW_NO_ELIGIBLE_QUESTIONS');

  // Score closeness to target plus a secure random tie-break. Diversity is enforced greedily.
  const scored=candidates.map(q=>({q,delta:Math.abs(q.difficultyRating-policy.questions.targetDifficulty),rand:random01()}))
    .sort((a,b)=>a.delta-b.delta || a.rand-b.rand);

  const selected: QuestionPoolItem[]=[];
  for(const item of scored){
    if(selected.length>=policy.questions.questionsPerParticipant) break;
    if(policy.questions.diversity.acrossSurah && selected.some(s=>s.surahNumber===item.q.surahNumber) && scored.length>policy.questions.questionsPerParticipant) continue;
    if(policy.questions.diversity.acrossJuz && selected.some(s=>s.juzNumber===item.q.juzNumber) && scored.length>policy.questions.questionsPerParticipant) continue;
    selected.push(item.q);
  }
  if(selected.length<policy.questions.questionsPerParticipant){
    for(const item of scored){ if(selected.length>=policy.questions.questionsPerParticipant) break; if(!selected.some(s=>s.id===item.q.id)) selected.push(item.q); }
  }

  const vector=selected.reduce((sum,q)=>sum+q.difficultyRating,0)/Math.max(1,selected.length);
  const seedBytes=new Uint8Array(24); if(typeof crypto!=='undefined'&&crypto.getRandomValues) crypto.getRandomValues(seedBytes); else seedBytes.forEach((_,i)=>seedBytes[i]=Math.floor(random01()*256));
  const seed=Array.from(seedBytes).map(b=>b.toString(16).padStart(2,'0')).join('');
  const commitment=await sha256(`${seed}|${participant.id}|${selected.map(q=>q.id).join(',')}|${policy.version}`);
  return {
    questionSetId:newId('qset'), participantId:participant.id, questions:selected,
    difficultyVectorScore:Number(vector.toFixed(3)), seedCommitmentHash:`SHA256:${commitment}`,
    fairnessToleranceDelta:policy.questions.difficultyTolerance, generatedAt:new Date().toISOString()
  };
}
