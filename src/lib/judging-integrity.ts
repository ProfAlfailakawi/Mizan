import type { Committee, Participant, QuranReferenceAudioRecord } from '../types';
import { hashCanonical } from './trust-protocol';

export type QuestionRevealApproval = { judgeId:string; judgeName:string; approvedAt:string };

export function questionRevealReady(input:{
  participantPresent:boolean;
  requiredJudgeIds:string[];
  approvals:QuestionRevealApproval[];
  minimumApprovals?:number;
  mode?:'all_assigned'|'minimum';
}){
  if(!input.participantPresent)return {ready:false,reason:'PARTICIPANT_NOT_PRESENT' as const,approved:0,required:input.mode==='minimum'?Math.max(1,input.minimumApprovals||1):input.requiredJudgeIds.length};
  const requiredIds=[...new Set(input.requiredJudgeIds.filter(Boolean))];
  const approvedIds=new Set(input.approvals.map(a=>a.judgeId));
  const approved=requiredIds.filter(id=>approvedIds.has(id)).length;
  const required=input.mode==='minimum'?Math.min(requiredIds.length,Math.max(1,input.minimumApprovals||1)):requiredIds.length;
  if(requiredIds.length===0)return {ready:false,reason:'NO_ELIGIBLE_JUDGES' as const,approved:0,required:0};
  return approved>=required?{ready:true,reason:'READY' as const,approved,required}:{ready:false,reason:'JUDGE_APPROVALS_REQUIRED' as const,approved,required};
}

const normalized=(v?:string)=>String(v||'').trim().toLowerCase().replace(/[’'`]/g,'').replace(/\s+/g,' ');

export function selectApprovedOpeningAudio(input:{
  references:QuranReferenceAudioRecord[];
  qiraah?:string;
  rawi?:string;
  tariq?:string;
  preferredReciter?:string;
  surah:number;
  ayah:number;
}){
  const q=normalized(input.qiraah),r=normalized(input.rawi),t=normalized(input.tariq),preferred=normalized(input.preferredReciter);
  const eligible=input.references.filter(a=>{
    if(a.approvalState!=='APPROVED_REFERENCE'||!a.audioUrl)return false;
    if(!a.usageScope.some(x=>['opening_prompt','judge_prompt','competition_prompt'].includes(normalized(x).replace(/ /g,'_'))))return false;
    if(normalized(a.qiraah)!==q||normalized(a.rawi)!==r)return false;
    if(t&&normalized(a.tariq)!==t)return false;
    if(a.surah!==input.surah||input.ayah<a.ayahStart||input.ayah>a.ayahEnd)return false;
    if(a.ayahStart!==a.ayahEnd&&!a.ayahTimings?.some(x=>x.ayah===input.ayah))return false;
    return true;
  });
  return (preferred?eligible.find(a=>normalized(a.reciter)===preferred):undefined)||eligible[0];
}

export function openingAudioWindow(reference:QuranReferenceAudioRecord,ayah:number){
  const segment=reference.ayahTimings?.find(x=>x.ayah===ayah);
  if(segment)return {startMs:segment.startMs,endMs:segment.endMs};
  if(reference.ayahStart===ayah&&reference.ayahEnd===ayah)return {startMs:0,endMs:undefined};
  return null;
}

export const queueOrderValue=(p:Participant)=>p.queueOrderKey??p.queueNumber??Number.MAX_SAFE_INTEGER;

export function eligibleQueueTransferTargets(input:{participant:Participant;committees:Committee[];hasHardConflict?:(committee:Committee,participant:Participant)=>boolean}){
  return input.committees.filter(c=>c.competitionId===input.participant.competitionId&&c.status!=='offline'&&c.assignedCategories.includes(input.participant.categoryId)&&!(input.hasHardConflict?.(c,input.participant)??false));
}

export function planQueueTransfer(input:{
  participants:Participant[];
  sourceCommitteeId:string;
  targetCommitteeId:string;
  participantIds?:string[];
  mode:'PRESERVE_ORIGINAL_TURN'|'MOVE_TO_END';
}){
  if(input.sourceCommitteeId===input.targetCommitteeId)return {ok:false as const,reason:'SAME_COMMITTEE'};
  const source=input.participants.filter(p=>p.status==='in_queue'&&p.assignedCommitteeId===input.sourceCommitteeId).sort((a,b)=>queueOrderValue(a)-queueOrderValue(b));
  const selected=input.participantIds?.length?source.filter(p=>input.participantIds!.includes(p.id)):source;
  if(!selected.length)return {ok:false as const,reason:'NO_WAITING_PARTICIPANTS'};
  const target=input.participants.filter(p=>p.status==='in_queue'&&p.assignedCommitteeId===input.targetCommitteeId).sort((a,b)=>queueOrderValue(a)-queueOrderValue(b));
  const maxOrder=Math.max(0,...input.participants.filter(p=>p.status==='in_queue').map(queueOrderValue).filter(Number.isFinite));
  const changes=selected.map((p,index)=>({
    participantId:p.id,
    fromCommitteeId:input.sourceCommitteeId,
    toCommitteeId:input.targetCommitteeId,
    previousOrderKey:queueOrderValue(p),
    nextOrderKey:input.mode==='PRESERVE_ORIGINAL_TURN'?(p.originalQueueNumber??p.queueNumber??queueOrderValue(p)):maxOrder+index+1,
    originalQueueNumber:p.originalQueueNumber??p.queueNumber,
  }));
  const simulated=[...target.map(p=>({id:p.id,key:queueOrderValue(p),moved:false})),...changes.map(c=>({id:c.participantId,key:c.nextOrderKey,moved:true}))].sort((a,b)=>a.key-b.key||Number(a.moved)-Number(b.moved));
  return {ok:true as const,changes,selectedIds:selected.map(p=>p.id),targetOrder:simulated.map(x=>x.id)};
}

export type QueueTransferImpactResult =
  | { ok:false; reason:string }
  | {
      ok:true;
      changes:{participantId:string;fromCommitteeId:string;toCommitteeId:string;previousOrderKey:number;nextOrderKey:number;originalQueueNumber?:number}[];
      selectedIds:string[];
      targetOrder:string[];
      priorityInversions:number;
      selectedLostPriorityPositions:{participantId:string;positions:number}[];
      totalLostPriorityPositions:number;
      priorityPreserved:boolean;
    };

export function queueTransferImpact(input:{
  participants:Participant[];
  sourceCommitteeId:string;
  targetCommitteeId:string;
  participantIds?:string[];
  mode:'PRESERVE_ORIGINAL_TURN'|'MOVE_TO_END';
}):QueueTransferImpactResult{
  const plan=planQueueTransfer(input);
  if(plan.ok!==true)return {ok:false,reason:plan.reason};
  const ids=new Set(plan.targetOrder);
  const targetRows=input.participants.filter(p=>ids.has(p.id));
  const original=new Map(targetRows.map(p=>[p.id,p.originalQueueNumber??p.queueNumber??queueOrderValue(p)]));
  let inversions=0;
  for(let i=0;i<plan.targetOrder.length;i++)for(let j=i+1;j<plan.targetOrder.length;j++){const a=original.get(plan.targetOrder[i])??Number.MAX_SAFE_INTEGER,b=original.get(plan.targetOrder[j])??Number.MAX_SAFE_INTEGER;if(a>b)inversions++;}
  const selected=new Set(plan.selectedIds);
  const lostPriority=plan.selectedIds.map(id=>{const own=original.get(id)??Number.MAX_SAFE_INTEGER;const pos=plan.targetOrder.indexOf(id);const ahead=plan.targetOrder.slice(0,pos).filter(other=>!selected.has(other)&&(original.get(other)??Number.MAX_SAFE_INTEGER)>own).length;return {participantId:id,positions:ahead};});
  return {ok:true,changes:plan.changes,selectedIds:plan.selectedIds,targetOrder:plan.targetOrder,priorityInversions:inversions,selectedLostPriorityPositions:lostPriority,totalLostPriorityPositions:lostPriority.reduce((a,x)=>a+x.positions,0),priorityPreserved:inversions===0};
}

export function recommendBalancedQueueMove(input:{participants:Participant[];sourceCommittee:Committee;targetCommittee:Committee;maxMove?:number;isCompatible:(participant:Participant,target:Committee)=>boolean}){
  const source=input.participants.filter(p=>p.status==='in_queue'&&p.assignedCommitteeId===input.sourceCommittee.id).sort((a,b)=>queueOrderValue(a)-queueOrderValue(b));
  const target=input.participants.filter(p=>p.status==='in_queue'&&p.assignedCommitteeId===input.targetCommittee.id).sort((a,b)=>queueOrderValue(a)-queueOrderValue(b));
  const candidates=source.filter(p=>input.isCompatible(p,input.targetCommittee)).slice(0,Math.max(1,input.maxMove||5));
  const sourceUnit=Math.max(1,input.sourceCommittee.averageSessionMinutes||1),targetUnit=Math.max(1,input.targetCommittee.averageSessionMinutes||1);
  const before={sourceMinutes:source.length*sourceUnit,targetMinutes:target.length*targetUnit,gapMinutes:Math.abs(source.length*sourceUnit-target.length*targetUnit)};
  if(!candidates.length)return {participantIds:[] as string[],before,after:before,improvementMinutes:0};
  let best={k:0,gap:before.gapMinutes,sourceMinutes:before.sourceMinutes,targetMinutes:before.targetMinutes};
  for(let k=1;k<=candidates.length;k++){const sm=Math.max(0,(source.length-k)*sourceUnit),tm=(target.length+k)*targetUnit,gap=Math.abs(sm-tm);if(gap<best.gap)best={k,gap,sourceMinutes:sm,targetMinutes:tm};}
  return {participantIds:candidates.slice(0,best.k).map(p=>p.id),before,after:{sourceMinutes:best.sourceMinutes,targetMinutes:best.targetMinutes,gapMinutes:best.gap},improvementMinutes:Math.max(0,before.gapMinutes-best.gap)};
}


export async function buildJudgeIndependenceCommitment(input:{
  competitionId:string;
  participantId?:string;
  sessionId:string;
  judgeId:string;
  ruleSetVersion:string;
  policyVersion:string;
  submittedAt:string;
  criterionScores:Record<string,number>;
  totalScore:number;
}){
  const commitmentPayload={
    domain:'MIZAN-JUDGE-INDEPENDENCE-v1',
    competitionId:input.competitionId,
    participantId:input.participantId,
    sessionId:input.sessionId,
    judgeId:input.judgeId,
    ruleSetVersion:input.ruleSetVersion,
    policyVersion:input.policyVersion,
    submittedAt:input.submittedAt,
    criterionScores:input.criterionScores,
    totalScore:input.totalScore,
  };
  return {
    version:'MIZAN-JUDGE-INDEPENDENCE-v1' as const,
    commitmentHash:await hashCanonical(commitmentPayload),
    committedAt:input.submittedAt,
    assurance:'client_sha256_commitment' as const,
  };
}

export function buildParticipantFairnessEvidence(input:{
  participant:Participant;
  policyVersion:string;
  ruleSetVersion:string;
  queueTransfers:{id:string;mode:'PRESERVE_ORIGINAL_TURN'|'MOVE_TO_END';sourceCommitteeId:string;targetCommitteeId:string;requestedAt:string;changes:{participantId:string;previousOrderKey:number;nextOrderKey:number;originalQueueNumber?:number}[]}[];
  revealGates:{questionIndex:number;participantPresence:{verified:boolean};approvals:{judgeId:string}[];requiredJudgeIds:string[];status:string;revealedAt?:string;questionCommitmentHash:string;quranSourcePackageHash?:string;revealAssurance:string}[];
  independentJudgeSubmissions:{locked:boolean;submittedAt:string;independenceCommitmentHash?:string;independenceCommittedAt?:string;independenceCommitmentAssurance?:string}[];
  result?:{status:string;sealMetadata?:{cryptographicChecksum?:string}};
  certificate?:{id:string};
}){
 const transfers=input.queueTransfers.flatMap(t=>{
  const change=t.changes.find(c=>c.participantId===input.participant.id);if(!change)return [];
  return [{transferId:t.id,mode:t.mode,sourceCommitteeId:t.sourceCommitteeId,targetCommitteeId:t.targetCommitteeId,requestedAt:t.requestedAt,originalQueueNumber:change.originalQueueNumber,previousOrderKey:change.previousOrderKey,nextOrderKey:change.nextOrderKey,priorityPreserved:t.mode==='PRESERVE_ORIGINAL_TURN'}];
 });
 const gates=[...input.revealGates].sort((a,b)=>a.questionIndex-b.questionIndex).map(g=>({questionNumber:g.questionIndex+1,presenceVerified:g.participantPresence.verified,judgeApprovals:g.approvals.length,requiredJudgeApprovals:g.requiredJudgeIds.length,revealed:g.status==='REVEALED',revealedAt:g.revealedAt,revealAssurance:g.revealAssurance,questionCommitmentHash:g.questionCommitmentHash,quranSourcePackageHash:g.quranSourcePackageHash}));
 return {
  receiptVersion:2,
  participantCode:input.participant.code,
  competitionId:input.participant.competitionId,
  policyVersion:input.policyVersion,
  ruleSetVersion:input.ruleSetVersion,
  queue:{originalQueueNumber:input.participant.originalQueueNumber??input.participant.queueNumber,transferCount:transfers.length,transfers},
  questionIntegrity:{questions:gates.length,gates,allRevealedAfterPresence:gates.every(g=>g.presenceVerified&&g.revealed)},
  judging:{
    independentLockedSubmissions:input.independentJudgeSubmissions.filter(s=>s.locked).length,
    lockedAt:input.independentJudgeSubmissions.filter(s=>s.locked).map(s=>s.submittedAt).sort(),
    independenceCommitments:input.independentJudgeSubmissions.filter(s=>s.locked&&s.independenceCommitmentHash).map(s=>({commitmentHash:s.independenceCommitmentHash!,committedAt:s.independenceCommittedAt||s.submittedAt,assurance:s.independenceCommitmentAssurance||'client_sha256_commitment'})).sort((a,b)=>a.committedAt.localeCompare(b.committedAt)),
  },
  resultStatus:input.result?.status||'not_calculated',
  resultSealHash:input.result?.sealMetadata?.cryptographicChecksum,
  certificateId:input.certificate?.id,
  generatedAt:new Date().toISOString(),
  privacyNote:'Participant-specific operational evidence only; no other participant scores or judge scores are disclosed.'
 };
}

export function passageTransitionPlan(input:{
  isLastQuestion:boolean;
  ar:boolean;
  cue?:{enabled?:boolean;phraseArabic?:string;phraseEnglish?:string;autoAdvanceDelayMs?:number;audioUrl?:string};
}){
  const cue=input.cue;
  return {
    enabled:cue?.enabled!==false,
    phrase:input.ar?(cue?.phraseArabic||'حسبك، جزاك الله خيرًا'):(cue?.phraseEnglish||'Thank you. Please stop here.'),
    delayMs:Math.max(0,Math.min(10_000,cue?.autoAdvanceDelayMs??700)),
    audioUrl:cue?.audioUrl&&/^https:\/\//i.test(cue.audioUrl)?cue.audioUrl:'',
    autoAdvance:!input.isLastQuestion,
  };
}
