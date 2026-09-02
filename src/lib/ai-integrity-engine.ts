import { AIObservation, AICapability, AICapabilityValidationRecord } from '../types';
import { aiCapabilityState } from './scientific-core';

export type IntegrityCapability='audio_quality'|'word_alignment'|'memorization_watch'|'tajweed_phoneme';
export interface IntegritySignal {
  timestampSeconds:number;
  type:AIObservation['type'];
  confidence:number;
  confidenceBand?:AIObservation['confidence'];
  expectedLocation:string;
  hypothesis:string;
  provider:string;
  modelVersion:string;
  modelHash?:string;
  capability?:AICapability;
  qiraah?:string;
  rawi?:string;
  tariq?:string;
  certificationVersion?:string;
  benchmarkReference?:string;
}
export interface IntegrityProvider {id:string;capabilities:IntegrityCapability[];analyze(input:{sessionId:string;audioRef:string;expectedQuestionIds:string[];riwaya:string}):Promise<IntegritySignal[]>;}

/** Exact capability/reading certification only. No hard-coded sample-size or accuracy threshold is allowed here. */
export function certifiedFor(validations:AICapabilityValidationRecord[],riwaya:string,capability:IntegrityCapability){
 return validations.some(v=>
  v.riwaya===riwaya&&
  v.capability===capability&&
  aiCapabilityState(v)==='CERTIFIED'&&
  !!v.approvalVersion&&
  !!(v.benchmarkVersion||v.benchmarkReference||v.evidenceRef)
 );
}

/**
 * Preserve every provider observation independently. Cross-model agreement is only a derived review-priority signal;
 * incompatible model probabilities are never averaged into artificial confidence.
 */
export function reconcileProviderSignals(sessionId:string,signals:IntegritySignal[],windowSec=2,competitionId="unscoped"):AIObservation[]{
 return signals.map((signal,index)=>{
  const corroborating=signals.filter((other,j)=>
    j!==index&&other.provider!==signal.provider&&other.type===signal.type&&
    Math.abs(other.timestampSeconds-signal.timestampSeconds)<=windowSec&&
    other.expectedLocation===signal.expectedLocation
  );
  const independentProviders=new Set([signal.provider,...corroborating.map(x=>x.provider)]).size;
  const modelIdentifier=`${signal.provider}:${signal.modelVersion}`;
  return {
    id:`ai-${sessionId}-${index}`,
    competitionId,
    sessionId,
    timestampSeconds:Math.round(signal.timestampSeconds),
    type:signal.type,
    capability:signal.capability,
    model:modelIdentifier,
    modelVersion:signal.modelVersion,
    modelHash:signal.modelHash,
    qiraah:signal.qiraah,
    rawi:signal.rawi,
    tariq:signal.tariq,
    confidence:signal.confidenceBand||'low',
    expectedLocation:signal.expectedLocation,
    expectedQuranPosition:signal.expectedLocation,
    observedEvidence:{hypothesis:signal.hypothesis,rawModelConfidence:signal.confidence,independentCorroboration:independentProviders,corroboratingProviders:corroborating.map(x=>x.provider)},
    detectedHypothesis:independentProviders>=2?`${signal.hypothesis} · corroborated by ${independentProviders} independent providers`:signal.hypothesis,
    modelIdentifier,
    capabilityCertificationVersion:signal.certificationVersion,
    benchmarkReference:signal.benchmarkReference,
    modelEvidence:{provider:signal.provider,modelVersion:signal.modelVersion,rawConfidence:signal.confidence},
    reviewClipStartSec:Math.max(0,signal.timestampSeconds-4),
    reviewClipEndSec:signal.timestampSeconds+4,
    flaggedForReview:independentProviders>=2,
    humanReviewState:'pending'
  };
 });
}

/** Architectural invariant: AI output can only create review observations. */
export function canAIChangeScore(){return false as const;}
