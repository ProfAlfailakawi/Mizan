import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type StartLocusClass='SURAH_OPENING'|'PAGE_OPENING'|'MID_PAGE'|'LATE_PAGE'|'UNKNOWN';
export type StartLocusAssurance='SCIENTIFICALLY_APPROVED'|'CURATED_QUESTION_POOL'|'QURAN_AYAH_BOUNDARY';
export interface DiversityQuestionCandidate{
  id:string;surahNumber:number;startAyah:number;endAyah:number;juzNumber:number;difficultyRating:number;
  startClass?:StartLocusClass;startAssurance?:StartLocusAssurance;pageNumber?:number;lineStart?:number;
}
export interface DiversityAllocationRecord{
  sessionId:string;participantId:string;competitionId:string;poolId:string;readingKey:string;allocatedAt:string;
  questionIds:string[];locusKeys:string[];setSignature:string;
}
interface LedgerFile{version:1;allocations:DiversityAllocationRecord[]}
const safe=(v:string)=>v.replace(/[^A-Za-z0-9._-]/g,'_').slice(0,160);
const hash=(v:string)=>crypto.createHash('sha256').update(v).digest('hex');
const locusKey=(q:DiversityQuestionCandidate)=>`${q.surahNumber}:${q.startAyah}`;
const classOf=(q:DiversityQuestionCandidate):StartLocusClass=>q.startClass||((q.startAyah===1)?'SURAH_OPENING':(q.lineStart!==undefined?(q.lineStart<=2?'PAGE_OPENING':q.lineStart>=11?'LATE_PAGE':'MID_PAGE'):'UNKNOWN'));

export class QuestionDiversityLedger{
 constructor(private root:string){fs.mkdirSync(root,{recursive:true,mode:0o700})}
 private file(competitionId:string,poolId:string,readingKey:string){return path.join(this.root,`diversity-${safe(competitionId)}-${safe(poolId)}-${safe(readingKey)}.json`)}
 private lockFile(competitionId:string,poolId:string,readingKey:string){return `${this.file(competitionId,poolId,readingKey)}.lock`}
 private read(file:string):LedgerFile{if(!fs.existsSync(file))return {version:1,allocations:[]};return JSON.parse(fs.readFileSync(file,'utf8')) as LedgerFile}
 private write(file:string,data:LedgerFile){const tmp=`${file}.${process.pid}.${Date.now()}.tmp`;fs.writeFileSync(tmp,JSON.stringify(data,null,2),{encoding:'utf8',mode:0o600});fs.renameSync(tmp,file)}
 allocate(input:{competitionId:string;poolId:string;readingKey:string;sessionId:string;participantId:string;candidates:DiversityQuestionCandidate[];count:number;targetDifficulty?:number;acrossSurah?:boolean;acrossJuz?:boolean;expectedParticipantCount?:number}){
  if(input.count<1)throw new Error('QUESTION_DIVERSITY_INVALID_COUNT');
  const uniqueByLocus=new Map<string,DiversityQuestionCandidate>();for(const q of input.candidates){const k=locusKey(q);if(!uniqueByLocus.has(k))uniqueByLocus.set(k,q)}
  const candidates=[...uniqueByLocus.values()];if(candidates.length<input.count)throw new Error('QUESTION_DIVERSITY_INSUFFICIENT_START_LOCI');
  const file=this.file(input.competitionId,input.poolId,input.readingKey),lock=this.lockFile(input.competitionId,input.poolId,input.readingKey);
  try{fs.mkdirSync(lock,{mode:0o700})}catch{throw new Error('QUESTION_DIVERSITY_LEDGER_BUSY')}
  try{
   const ledger=this.read(file);const previous=ledger.allocations.filter(a=>a.sessionId!==input.sessionId);const locusUses=new Map<string,number>(),classUses=new Map<StartLocusClass,number>(),setSignatures=new Set<string>();
   for(const a of previous){for(const k of a.locusKeys)locusUses.set(k,(locusUses.get(k)||0)+1);setSignatures.add(a.setSignature)}
   for(const a of previous)for(const id of a.questionIds){const q=candidates.find(x=>x.id===id);if(q){const c=classOf(q);classUses.set(c,(classUses.get(c)||0)+1)}}
   const selected:DiversityQuestionCandidate[]=[];const remaining=[...candidates];
   for(let i=0;i<input.count;i++){
    const scored=remaining.filter(q=>!(input.acrossSurah&&selected.some(s=>s.surahNumber===q.surahNumber))&&!(input.acrossJuz&&selected.some(s=>s.juzNumber===q.juzNumber))).map(q=>{
      const use=locusUses.get(locusKey(q))||0,cls=classOf(q),classUse=classUses.get(cls)||0,diff=Math.abs(q.difficultyRating-(input.targetDifficulty??q.difficultyRating));
      const nonOpeningBias=(cls==='MID_PAGE'||cls==='LATE_PAGE')?0:cls==='PAGE_OPENING'?0.35:cls==='SURAH_OPENING'?0.55:0.2;
      const tie=parseInt(hash(`${input.participantId}|${input.sessionId}|${q.id}`).slice(0,10),16)/0xffffffffff;
      return {q,use,classUse,diff,nonOpeningBias,tie};
    }).sort((a,b)=>a.use-b.use||a.classUse-b.classUse||a.diff-b.diff||a.nonOpeningBias-b.nonOpeningBias||a.tie-b.tie);
    let choice=scored[0]?.q;
    if(!choice){const fallback=remaining.map(q=>({q,use:locusUses.get(locusKey(q))||0,tie:parseInt(hash(`${input.participantId}|fallback|${q.id}`).slice(0,10),16)})).sort((a,b)=>a.use-b.use||a.tie-b.tie);choice=fallback[0]?.q}
    if(!choice)throw new Error('QUESTION_DIVERSITY_SELECTION_FAILED');selected.push(choice);classUses.set(classOf(choice),(classUses.get(classOf(choice))||0)+1);remaining.splice(remaining.findIndex(x=>x.id===choice!.id),1);
   }
   // Avoid an identical question-set signature where the pool permits a one-item swap.
   let signature=selected.map(q=>q.id).sort().join('|');
   if(setSignatures.has(signature)&&remaining.length){for(let idx=selected.length-1;idx>=0;idx--){const replacement=remaining.find(q=>!selected.some(s=>s.id===q.id)&&(!input.acrossSurah||!selected.some((s,j)=>j!==idx&&s.surahNumber===q.surahNumber))&&(!input.acrossJuz||!selected.some((s,j)=>j!==idx&&s.juzNumber===q.juzNumber)));if(replacement){selected[idx]=replacement;signature=selected.map(q=>q.id).sort().join('|');if(!setSignatures.has(signature))break}}}
   const record:DiversityAllocationRecord={sessionId:input.sessionId,participantId:input.participantId,competitionId:input.competitionId,poolId:input.poolId,readingKey:input.readingKey,allocatedAt:new Date().toISOString(),questionIds:selected.map(q=>q.id),locusKeys:selected.map(locusKey),setSignature:signature};
   ledger.allocations=[...previous,record];this.write(file,ledger);
   const totalRequired=(input.expectedParticipantCount||0)*input.count;const uniqueLoci=candidates.length;const globalUniqueCoverageGuaranteed=!!input.expectedParticipantCount&&uniqueLoci>=totalRequired;
   return {selected,record,metrics:{eligibleUniqueStartLoci:uniqueLoci,previousParticipants:new Set(previous.map(x=>x.participantId)).size,reusedLoci:selected.filter(q=>(locusUses.get(locusKey(q))||0)>0).length,pageOpeningCount:selected.filter(q=>['PAGE_OPENING','SURAH_OPENING'].includes(classOf(q))).length,midPageCount:selected.filter(q=>['MID_PAGE','LATE_PAGE'].includes(classOf(q))).length,globalUniqueCoverageGuaranteed,requiredUniqueLociForFullField:totalRequired||undefined}};
  } finally {fs.rmSync(lock,{recursive:true,force:true})}
 }
 snapshot(competitionId:string,poolId:string,readingKey:string){const file=this.file(competitionId,poolId,readingKey),ledger=this.read(file);return {version:ledger.version,allocations:ledger.allocations,allocationCount:ledger.allocations.length,uniqueLoci:new Set(ledger.allocations.flatMap(a=>a.locusKeys)).size,uniqueSets:new Set(ledger.allocations.map(a=>a.setSignature)).size}}
}

export function classifyStartLocus(input:{startAyah:number;lineStart?:number}):StartLocusClass{return classOf({id:'x',surahNumber:1,startAyah:input.startAyah,endAyah:input.startAyah,juzNumber:1,difficultyRating:1,lineStart:input.lineStart})}
