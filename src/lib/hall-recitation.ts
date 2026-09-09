// Hall recitation aggregate built only from loci that MIZAN can prove are active/recorded.
// No synthetic roster projection, historical fixture usage, or "representative day" is allowed.
import { locusToPage, pageToJuz, MUSHAF_TOTAL_PAGES } from './mushaf-map';
import type { AppStoreState } from './store-state';

export interface HallRecitationAggregate {
  pages:number[]; totalRecitations:number; coveredPages:number; coveragePct:number;
  khatmatCompleted:number; partialKhatmahPct:number; hottestPage:{page:number;count:number};
  byJuz:{juz:number;count:number;coveredPages:number}[];
  liveLoci:{surah:number;ayah:number;page:number;label:string}[];
  seededFromLedger:boolean; projectedFullDay:boolean; projectedReciters:number;
}

function markPassage(pages:number[],surah:number,startAyah:number,endAyah:number,weight=1){
  const from=locusToPage(surah,startAyah); const to=Math.max(from,locusToPage(surah,Math.max(startAyah,endAyah)));
  for(let p=from;p<=to;p++)pages[p-1]+=weight;
}

export function buildHallRecitation(store:Pick<AppStoreState,'activeSession'|'competition'>):HallRecitationAggregate{
  const pages=new Array<number>(MUSHAF_TOTAL_PAGES).fill(0); const liveLoci:HallRecitationAggregate['liveLoci']=[];
  // The client currently has authoritative loci only for the active revealed/session question set.
  // Historical coverage must come from a real recitation ledger; until that ledger is present we show
  // an honest partial/empty aggregate instead of inferring where anyone recited.
  const active=store.activeSession.sessionId&&store.activeSession.questionSelection?.questions||[];
  if(store.activeSession.participant&&store.activeSession.committee){
    active.forEach(q=>{markPassage(pages,q.surahNumber,q.startAyah,q.endAyah,1);liveLoci.push({surah:q.surahNumber,ayah:q.startAyah,page:locusToPage(q.surahNumber,q.startAyah),label:`${q.surahNameArabic} ${q.startAyah}`})});
  }
  const totalRecitations=pages.reduce((a,b)=>a+b,0); const coveredPages=pages.filter(c=>c>0).length;
  const khatmatCompleted=totalRecitations?Math.min(...pages):0; const nextTarget=khatmatCompleted+1;
  const partialKhatmahPct=pages.filter(c=>c>=nextTarget).length/MUSHAF_TOTAL_PAGES;
  let hottest={page:0,count:0}; pages.forEach((c,i)=>{if(c>hottest.count)hottest={page:i+1,count:c}});
  const byJuz=Array.from({length:30},(_,j)=>({juz:j+1,count:0,coveredPages:0}));
  pages.forEach((c,i)=>{const j=pageToJuz(i+1)-1;byJuz[j].count+=c;if(c>0)byJuz[j].coveredPages+=1});
  return {pages,totalRecitations,coveredPages,coveragePct:coveredPages/MUSHAF_TOTAL_PAGES,khatmatCompleted,partialKhatmahPct,hottestPage:hottest,byJuz,liveLoci,seededFromLedger:false,projectedFullDay:false,projectedReciters:0};
}
