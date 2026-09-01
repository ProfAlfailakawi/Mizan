import { AIObservation, AICapabilityValidationRecord } from '../types';

export type IntegrityCapability='audio_quality'|'word_alignment'|'memorization_watch'|'tajweed_phoneme';
export interface IntegritySignal {timestampSeconds:number;type:AIObservation['type'];confidence:number;expectedLocation:string;hypothesis:string;provider:string;modelVersion:string;}
export interface IntegrityProvider {id:string;capabilities:IntegrityCapability[];analyze(input:{sessionId:string;audioRef:string;expectedQuestionIds:string[];riwaya:string}):Promise<IntegritySignal[]>;}

export function certifiedFor(validations:AICapabilityValidationRecord[],riwaya:string,capability:IntegrityCapability){
 return validations.some(v=>v.riwaya===riwaya&&v.capability===capability&&v.status==='certified'&&v.approvedBy.length>=2&&v.datasetSize>=100&&v.falsePositiveRate!==undefined&&v.falseNegativeRate!==undefined&&!!v.evidenceRef);
}

export function reconcileProviderSignals(sessionId:string,signals:IntegritySignal[],windowSec=2,competitionId="unscoped"):AIObservation[]{
 const used=new Set<number>(); const out:AIObservation[]=[];
 for(let i=0;i<signals.length;i++){
  if(used.has(i))continue; const a=signals[i]; const group=[a]; used.add(i);
  for(let j=i+1;j<signals.length;j++){if(used.has(j))continue;const b=signals[j];if(a.type===b.type&&Math.abs(a.timestampSeconds-b.timestampSeconds)<=windowSec&&a.provider!==b.provider){group.push(b);used.add(j)}}
  const independentProviders=new Set(group.map(x=>x.provider)).size;
  const raw=group.reduce((sum,x)=>sum+x.confidence,0)/group.length;
  const confidence:AIObservation['confidence']=independentProviders>=2&&raw>=.8?'high':raw>=.65?'medium':'low';
  out.push({id:`ai-${sessionId}-${i}`,competitionId,sessionId,timestampSeconds:Math.round(group.reduce((s,x)=>s+x.timestampSeconds,0)/group.length),type:a.type,confidence,expectedLocation:a.expectedLocation,detectedHypothesis:group.map(x=>x.hypothesis).join(' | '),modelIdentifier:group.map(x=>`${x.provider}:${x.modelVersion}`).join('+'),reviewClipStartSec:Math.max(0,a.timestampSeconds-4),reviewClipEndSec:a.timestampSeconds+4,flaggedForReview:confidence==='high'});
 }
 return out;
}

/** Architectural invariant: AI output can only create review observations. */
export function canAIChangeScore(){return false as const;}
