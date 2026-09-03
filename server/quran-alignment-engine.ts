import type {AlignmentPosition,AlignmentRecoveryState,AlignmentState,QuranAcousticObservation,QuranAlignmentOutput,QuranReadingId} from './quran-intelligence-types';

export interface QuranAlignmentPolicy{
  lockThreshold:number;
  probableThreshold:number;
  uncertainThreshold:number;
  reacquireThreshold:number;
  lockConfirmations:number;
  reacquireConfirmations:number;
  silenceLostMs:number;
  maxNormalForwardWords:number;
  highConfidenceJumpThreshold:number;
  emaAlpha:number;
}

export const DEFAULT_ALIGNMENT_POLICY:QuranAlignmentPolicy={lockThreshold:.88,probableThreshold:.72,uncertainThreshold:.5,reacquireThreshold:.84,lockConfirmations:2,reacquireConfirmations:2,silenceLostMs:1800,maxNormalForwardWords:3,highConfidenceJumpThreshold:.94,emaAlpha:.38};

const same=(a?:AlignmentPosition,b?:AlignmentPosition)=>!!a&&!!b&&a.surah===b.surah&&a.ayah===b.ayah&&a.wordIndex===b.wordIndex;
const key=(p?:AlignmentPosition)=>p?`${p.surah}:${p.ayah}:${p.wordIndex}`:'';
function relativeDelta(a:AlignmentPosition,b:AlignmentPosition){
  if(a.surah===b.surah&&a.ayah===b.ayah)return b.wordIndex-a.wordIndex;
  if(a.surah===b.surah&&b.ayah===a.ayah+1&&b.wordIndex<=3)return 1;
  if(a.surah===b.surah&&b.ayah>a.ayah+1)return 100+(b.ayah-a.ayah);
  if(a.surah===b.surah&&b.ayah<a.ayah)return -100-(a.ayah-b.ayah);
  return b.surah>a.surah?1000:-1000;
}

export class QuranStreamingAlignmentEngine{
  private state:AlignmentState='UNCERTAIN';
  private stable?:AlignmentPosition;
  private pending?:AlignmentPosition;
  private pendingCount=0;
  private smoothed=0;
  private lastTimestamp=0;
  private recovery:AlignmentRecoveryState='NONE';
  constructor(readonly reading:QuranReadingId,private policy:QuranAlignmentPolicy=DEFAULT_ALIGNMENT_POLICY){}

  snapshot():QuranAlignmentOutput{return this.output(new Date().toISOString(),0,[],false)}
  reset(){this.state='UNCERTAIN';this.stable=undefined;this.pending=undefined;this.pendingCount=0;this.smoothed=0;this.lastTimestamp=0;this.recovery='NONE'}

  step(obs:QuranAcousticObservation):QuranAlignmentOutput{
    if(obs.reading!==this.reading)throw new Error('QURAN_ALIGNMENT_CROSS_RIWAYAH_REJECTED');
    if(!Number.isFinite(obs.confidence)||obs.confidence<0||obs.confidence>1)throw new Error('QURAN_ALIGNMENT_CONFIDENCE_INVALID');
    const ts=Date.parse(obs.timestamp);if(Number.isNaN(ts))throw new Error('QURAN_ALIGNMENT_TIMESTAMP_INVALID');if(this.lastTimestamp&&ts<this.lastTimestamp)throw new Error('QURAN_ALIGNMENT_TIMESTAMP_OUT_OF_ORDER');this.lastTimestamp=ts;
    this.smoothed=this.smoothed===0?obs.confidence:this.policy.emaAlpha*obs.confidence+(1-this.policy.emaAlpha)*this.smoothed;
    const alternatives=Array.isArray(obs.alternatives)?obs.alternatives.slice(0,5):[];
    const silence=(obs.silenceMs||0)>=this.policy.silenceLostMs;
    if(silence){this.state='LOST';this.pending=undefined;this.pendingCount=0;this.recovery='SILENCE';return this.output(obs.timestamp,obs.confidence,alternatives,false)}
    if(!obs.candidate||this.smoothed<this.policy.uncertainThreshold){
      if(this.state==='LOST'||this.state==='REACQUIRING')this.state='LOST';else this.state='UNCERTAIN';
      this.pending=undefined;this.pendingCount=0;return this.output(obs.timestamp,obs.confidence,alternatives,false);
    }

    const candidate=obs.candidate;
    const wasLost=this.state==='LOST'||this.state==='REACQUIRING';
    if(wasLost){
      if(this.smoothed<this.policy.reacquireThreshold){this.state='REACQUIRING';this.trackPending(candidate);return this.output(obs.timestamp,obs.confidence,alternatives,false)}
      this.trackPending(candidate);this.state='REACQUIRING';
      if(this.pendingCount>=this.policy.reacquireConfirmations){const old=this.stable;this.stable={...candidate};this.state='REACQUIRED';this.recovery=this.classifyRecovery(old,candidate,old?'RESTART':'MID_PASSAGE_START');this.clearPending();return this.output(obs.timestamp,obs.confidence,alternatives,true)}
      return this.output(obs.timestamp,obs.confidence,alternatives,false);
    }

    if(this.stable&&same(candidate,this.stable)){
      this.state=this.smoothed>=this.policy.lockThreshold?'LOCKED':'PROBABLE';this.recovery='REPEAT';this.clearPending();return this.output(obs.timestamp,obs.confidence,alternatives,false);
    }

    const jump=this.stable?relativeDelta(this.stable,candidate):0;
    const suspiciousForward=this.stable&&jump>this.policy.maxNormalForwardWords&&obs.confidence<this.policy.highConfidenceJumpThreshold;
    if(suspiciousForward){this.state='UNCERTAIN';this.trackPending(candidate);this.recovery='SKIP';return this.output(obs.timestamp,obs.confidence,alternatives,false)}

    this.trackPending(candidate);
    const needed=this.smoothed>=this.policy.lockThreshold?this.policy.lockConfirmations:Math.max(this.policy.lockConfirmations,3);
    if(this.smoothed>=this.policy.probableThreshold&&this.pendingCount>=needed){const old=this.stable;this.stable={...candidate};this.state=this.smoothed>=this.policy.lockThreshold?'LOCKED':'PROBABLE';this.recovery=this.classifyRecovery(old,candidate,old?'NONE':'MID_PASSAGE_START');this.clearPending();return this.output(obs.timestamp,obs.confidence,alternatives,true)}
    this.state=this.smoothed>=this.policy.probableThreshold?'PROBABLE':'UNCERTAIN';return this.output(obs.timestamp,obs.confidence,alternatives,false);
  }

  private trackPending(candidate:AlignmentPosition){if(same(this.pending,candidate))this.pendingCount++;else{this.pending={...candidate};this.pendingCount=1}}
  private clearPending(){this.pending=undefined;this.pendingCount=0}
  private classifyRecovery(old:AlignmentPosition|undefined,next:AlignmentPosition,fallback:AlignmentRecoveryState):AlignmentRecoveryState{if(!old)return fallback;const delta=relativeDelta(old,next);if(delta===0)return 'REPEAT';if(delta<0)return Math.abs(delta)<=2?'REPEAT':'BACKTRACK';if(delta>this.policy.maxNormalForwardWords)return 'SKIP';return fallback}
  private output(timestamp:string,confidence:number,alternatives:QuranAlignmentOutput['alternatives'],pointerMoved:boolean):QuranAlignmentOutput{return {timestamp,reading:this.reading,surah:this.stable?.surah,ayah:this.stable?.ayah,wordIndex:this.stable?.wordIndex,phonemeIndex:this.stable?.phonemeIndex,confidence,smoothedConfidence:Number(this.smoothed.toFixed(6)),alignmentState:this.state,alternatives,recoveryState:this.recovery,pointerMoved,scoreAuthority:'HUMAN_ONLY',scoreDelta:0,shadowMode:true}}
}

export function alignmentPositionKey(p?:AlignmentPosition){return key(p)}
