import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {AlignmentRecoveryState,AlignmentState,QuranReadingId} from './quran-intelligence-types';

export type QuranTimelineKind='ALIGNMENT'|'RECOVERY'|'HUMAN_MARKER'|'SESSION_RESET';
export interface QuranTimelineEvent{
  id:string;sessionId:string;actorId:string;timestamp:string;offsetMs:number;kind:QuranTimelineKind;reading?:QuranReadingId;surah?:number;ayah?:number;wordIndex?:number;alignmentState?:AlignmentState;recoveryState?:AlignmentRecoveryState;confidence?:number;acousticQuality?:number;humanEventType?:string;source:'MIZAN_SHADOW_ALIGNMENT'|'JUDGE_INPUT'|'SYSTEM';scoreAuthority:'HUMAN_ONLY';
}
export interface QuranSessionEvidence{
  protocol:'MIZAN-QURAN-SESSION-EVIDENCE-1';sessionId:string;actorId:string;startedAt:string;updatedAt:string;events:QuranTimelineEvent[];summary:{alignmentEvents:number;recoveryEvents:number;humanMarkers:number;lostEvents:number;reacquiredEvents:number};integrity:{sha256:string};
}

type Stored=Omit<QuranSessionEvidence,'integrity'>;
const safe=(v:string)=>v.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,160);
const digest=(x:Stored)=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');

export class QuranSessionEvidenceStore{
  constructor(private root:string){fs.mkdirSync(root,{recursive:true,mode:0o700})}
  private file(actorId:string,sessionId:string){return path.join(this.root,`${safe(actorId)}--${safe(sessionId)}.json`)}
  private loadRaw(actorId:string,sessionId:string):Stored|null{const f=this.file(actorId,sessionId);if(!fs.existsSync(f))return null;const x=JSON.parse(fs.readFileSync(f,'utf8')) as Stored;if(x.actorId!==actorId||x.sessionId!==sessionId||x.protocol!=='MIZAN-QURAN-SESSION-EVIDENCE-1')throw new Error('QURAN_SESSION_EVIDENCE_INVALID');return x}
  private persist(x:Stored){const f=this.file(x.actorId,x.sessionId),tmp=`${f}.${process.pid}.tmp`;fs.writeFileSync(tmp,JSON.stringify(x,null,2),{encoding:'utf8',mode:0o600});fs.renameSync(tmp,f)}
  private ensure(actorId:string,sessionId:string,timestamp=new Date().toISOString()){return this.loadRaw(actorId,sessionId)||{protocol:'MIZAN-QURAN-SESSION-EVIDENCE-1' as const,sessionId,actorId,startedAt:timestamp,updatedAt:timestamp,events:[],summary:{alignmentEvents:0,recoveryEvents:0,humanMarkers:0,lostEvents:0,reacquiredEvents:0}}}
  appendAlignment(input:{actorId:string;sessionId:string;timestamp:string;reading:QuranReadingId;surah?:number;ayah?:number;wordIndex?:number;alignmentState:AlignmentState;recoveryState:AlignmentRecoveryState;confidence:number;acousticQuality?:number}){
    const x=this.ensure(input.actorId,input.sessionId,input.timestamp),offsetMs=Math.max(0,new Date(input.timestamp).getTime()-new Date(x.startedAt).getTime());
    const last=x.events.at(-1);const materiallyChanged=!last||last.kind!=='ALIGNMENT'||last.ayah!==input.ayah||last.wordIndex!==input.wordIndex||last.alignmentState!==input.alignmentState||last.recoveryState!==input.recoveryState||Math.abs((last.confidence||0)-input.confidence)>=.08;
    if(!materiallyChanged)return this.public(x);
    const kind:QuranTimelineKind=input.recoveryState!=='NONE'||['LOST','REACQUIRING','REACQUIRED'].includes(input.alignmentState)?'RECOVERY':'ALIGNMENT';
    x.events.push({id:crypto.randomUUID(),sessionId:input.sessionId,actorId:input.actorId,timestamp:input.timestamp,offsetMs,kind,reading:input.reading,surah:input.surah,ayah:input.ayah,wordIndex:input.wordIndex,alignmentState:input.alignmentState,recoveryState:input.recoveryState,confidence:input.confidence,acousticQuality:input.acousticQuality,source:'MIZAN_SHADOW_ALIGNMENT',scoreAuthority:'HUMAN_ONLY'});
    if(x.events.length>1200)x.events=x.events.slice(-1200);x.updatedAt=input.timestamp;this.recount(x);this.persist(x);return this.public(x)
  }
  appendHumanMarker(input:{actorId:string;sessionId:string;eventType:string;timestamp?:string}){const timestamp=input.timestamp||new Date().toISOString(),x=this.ensure(input.actorId,input.sessionId,timestamp),offsetMs=Math.max(0,new Date(timestamp).getTime()-new Date(x.startedAt).getTime());x.events.push({id:crypto.randomUUID(),sessionId:input.sessionId,actorId:input.actorId,timestamp,offsetMs,kind:'HUMAN_MARKER',humanEventType:input.eventType.slice(0,120),source:'JUDGE_INPUT',scoreAuthority:'HUMAN_ONLY'});x.updatedAt=timestamp;this.recount(x);this.persist(x);return this.public(x)}
  reset(actorId:string,sessionId:string){const x=this.loadRaw(actorId,sessionId);if(!x)return;const timestamp=new Date().toISOString();x.events.push({id:crypto.randomUUID(),sessionId,actorId,timestamp,offsetMs:Math.max(0,new Date(timestamp).getTime()-new Date(x.startedAt).getTime()),kind:'SESSION_RESET',source:'SYSTEM',scoreAuthority:'HUMAN_ONLY'});x.updatedAt=timestamp;this.recount(x);this.persist(x)}
  get(actorId:string,sessionId:string){const x=this.loadRaw(actorId,sessionId);return x?this.public(x):null}
  private recount(x:Stored){x.summary={alignmentEvents:x.events.filter(e=>e.kind==='ALIGNMENT').length,recoveryEvents:x.events.filter(e=>e.kind==='RECOVERY').length,humanMarkers:x.events.filter(e=>e.kind==='HUMAN_MARKER').length,lostEvents:x.events.filter(e=>e.alignmentState==='LOST').length,reacquiredEvents:x.events.filter(e=>e.alignmentState==='REACQUIRED').length}}
  private public(x:Stored):QuranSessionEvidence{return {...x,integrity:{sha256:digest(x)}}}
}
