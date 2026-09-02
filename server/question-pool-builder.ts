import crypto from 'crypto';
import type {ServerQuestionBlueprint} from './secure-question-runtime';
import {ServerQuranSourceRepository} from './quran-source-repository';

export interface GeneratedQuestionPoolReport{
  items:ServerQuestionBlueprint[];
  sourcePackageId:string;sourcePackageHash:string;allowedJuz:number[];passageAyahCount:number;
  uniqueStartLoci:number;scientificallyApprovedStarts:number;neutralDifficultyStarts:number;
  classes:Record<'SURAH_OPENING'|'PAGE_OPENING'|'MID_PAGE'|'LATE_PAGE'|'UNKNOWN',number>;
  requiredUniqueLoci?:number;fullFieldUniqueCoverage:boolean;
}
const idFor=(packageId:string,surah:number,ayah:number,len:number)=>`src-${crypto.createHash('sha256').update(`${packageId}|${surah}|${ayah}|${len}`).digest('hex').slice(0,18)}`;

export function buildQuestionPoolFromCertifiedSource(input:{
  quran:ServerQuranSourceRepository;packageId:string;poolId:string;allowedJuz:number[];passageAyahCount:number;
  expectedParticipantCount?:number;questionsPerParticipant?:number;
  difficultyByLocus?:Record<string,number>;scientificallyApprovedStartLoci?:string[];
}){
  const manifest=input.quran.manifest(input.packageId);if(manifest.scientificApproval.state!=='CERTIFIED')throw new Error('QUESTION_POOL_SOURCE_NOT_CERTIFIED');
  const allowed=new Set(input.allowedJuz.filter(x=>Number.isInteger(x)&&x>=1&&x<=30));if(!allowed.size)throw new Error('QUESTION_POOL_ALLOWED_JUZ_REQUIRED');
  const len=Math.max(1,Math.min(20,Math.floor(input.passageAyahCount||1))),rows=input.quran.verses(input.packageId),bySurah=new Map<number,typeof rows>();
  for(const row of rows){const list=bySurah.get(row.sura_no)||[];list.push(row);bySurah.set(row.sura_no,list)}
  const approved=new Set(input.scientificallyApprovedStartLoci||[]),items:ServerQuestionBlueprint[]=[];
  for(const [surah,verses] of bySurah){const map=new Map(verses.map(x=>[x.aya_no,x]));for(const start of verses){if(!allowed.has(Number(start.jozz||0)))continue;const segment=Array.from({length:len},(_,i)=>map.get(start.aya_no+i));if(segment.some(x=>!x)||segment.some(x=>!allowed.has(Number(x!.jozz||0))))continue;const key=`${surah}:${start.aya_no}`,line=Number(start.line_start||0)||undefined;const startClass=start.aya_no===1?'SURAH_OPENING':line!==undefined?(line<=2?'PAGE_OPENING':line>=11?'LATE_PAGE':'MID_PAGE'):'UNKNOWN';const rated=input.difficultyByLocus?.[key];items.push({id:idFor(input.packageId,surah,start.aya_no,len),poolId:input.poolId,qiraah:manifest.qiraah,rawi:manifest.rawi,tariq:manifest.tariq,surahNumber:surah,startAyah:start.aya_no,endAyah:start.aya_no+len-1,juzNumber:Number(start.jozz||0),difficultyRating:Number.isFinite(rated)?Math.max(1,Math.min(5,Number(rated))):3,difficultyProvenance:Number.isFinite(rated)?'EXPERT_APPROVED':'UNRATED_NEUTRAL',startLocusAssurance:approved.has(key)?'SCIENTIFICALLY_APPROVED':'QURAN_AYAH_BOUNDARY',startClass,pageNumber:Number(start.page||0)||undefined,lineStart:line,enabled:true})}}
  if(!items.length)throw new Error('QUESTION_POOL_NO_VALID_START_LOCI');
  const classes={SURAH_OPENING:0,PAGE_OPENING:0,MID_PAGE:0,LATE_PAGE:0,UNKNOWN:0};for(const x of items)classes[x.startClass||'UNKNOWN']++;
  const required=(input.expectedParticipantCount||0)*(input.questionsPerParticipant||0);
  return {items,sourcePackageId:input.packageId,sourcePackageHash:manifest.packageHash,allowedJuz:[...allowed].sort((a,b)=>a-b),passageAyahCount:len,uniqueStartLoci:items.length,scientificallyApprovedStarts:items.filter(x=>x.startLocusAssurance==='SCIENTIFICALLY_APPROVED').length,neutralDifficultyStarts:items.filter(x=>x.difficultyProvenance==='UNRATED_NEUTRAL').length,classes,requiredUniqueLoci:required||undefined,fullFieldUniqueCoverage:!!required&&items.length>=required} satisfies GeneratedQuestionPoolReport;
}
