#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {classifyDuriCandidate,classifyWarshCatalog,extractOfficialLinks,looksLikeDownload,type OfficialAudioProbe} from '../server/kfgqpc-audio-source-policy';

const CATALOG='https://qc-dev.qurancomplex.gov.sa/quran-audios/';
const DURI_DETAIL='https://qurancomplex.gov.sa/sounds-douri-juhani/';
const HISTORICAL='https://qurancomplex.gov.sa/en/kfgqpc/kfq-structure/';
const args=process.argv.slice(2);const val=(k:string)=>{const i=args.indexOf(k);return i>=0?args[i+1]:undefined};
const root=path.resolve(val('--root')||'.mizan-ingest');const reportDir=path.join(root,'reports');fs.mkdirSync(reportDir,{recursive:true});

async function getText(url:string){const c=new AbortController();const t=setTimeout(()=>c.abort(),25000);try{const r=await fetch(url,{redirect:'follow',signal:c.signal,headers:{'user-agent':'MIZAN-KFGQPC-Source-Audit/1.0'}});if(!r.ok)throw new Error(`HTTP_${r.status}`);return await r.text()}finally{clearTimeout(t)}}
async function headSize(url:string){try{const c=new AbortController();const t=setTimeout(()=>c.abort(),20000);try{const r=await fetch(url,{method:'HEAD',redirect:'follow',signal:c.signal,headers:{'user-agent':'MIZAN-KFGQPC-Source-Audit/1.0'}});const n=Number(r.headers.get('content-length')||0);return Number.isFinite(n)&&n>0?n:undefined}finally{clearTimeout(t)}}catch{return undefined}}

async function main(){
 const checkedAt=new Date().toISOString();
 let catalogHtml='';try{catalogHtml=await getText(CATALOG)}catch{}
 const warshClass=classifyWarshCatalog(catalogHtml);
 const warsh:OfficialAudioProbe={id:'audio-warsh',state:warshClass.state,catalogUrl:CATALOG,reason:warshClass.reason,checkedAt};
 // Historical evidence is provenance only; it never upgrades availability.
 try{const historical=await getText(HISTORICAL);if(!(/إبراهيم بن سعيد/.test(historical)||/Ibrahim bin Saeed/i.test(historical)))warsh.reason+='; HISTORICAL_RECORDER_EVIDENCE_NOT_FOUND'}catch{warsh.reason+='; HISTORICAL_PAGE_UNREACHABLE'}

 let duri:OfficialAudioProbe={id:'audio-duri',state:'UNVERIFIED',catalogUrl:CATALOG,detailUrl:DURI_DETAIL,reason:'DIRECT_AYAH_PACKAGE_NOT_VALIDATED',checkedAt};
 try{
   const html=await getText(DURI_DETAIL);const links=extractOfficialLinks(html,DURI_DETAIL).filter(x=>looksLikeDownload(x.url,x.text));
   for(const link of links){const contentLength=await headSize(link.url);const c=classifyDuriCandidate({url:link.url,text:link.text,contentLength});if(c.ok){duri={...duri,state:'UNVERIFIED',directUrl:link.url,contentLength,reason:'OFFICIAL_DIRECT_AYAH_CANDIDATE_FOUND_REQUIRES_ARCHIVE_CONTENT_VALIDATION'};break}}
   if(!duri.directUrl)duri.reason='OFFICIAL_PAGE_FOUND_BUT_NO_PLAUSIBLE_AYAH_PACKAGE_LINK; LISTED_1.54MB_VALUE_REMAINS_REJECTED';
 }catch(e){duri.reason=`DURI_DETAIL_DISCOVERY_FAILED:${e instanceof Error?e.message:'UNKNOWN'}`}

 const report={protocol:'MIZAN-KFGQPC-AUDIO-DISCOVERY-1',checkedAt,sources:{catalog:CATALOG,duriDetail:DURI_DETAIL,warshHistorical:HISTORICAL},results:[warsh,duri]};
 fs.writeFileSync(path.join(reportDir,'official-audio-discovery.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'DISCOVERY_FAILED');process.exitCode=1});
