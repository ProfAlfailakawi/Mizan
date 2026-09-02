#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {KFGQPC_DEV_PAGE,LIGHT_PACKAGES,extractNearbyOfficialCandidates,hasZipMagic,isOfficialKfgqpcUrl,matchesExpected} from '../server/kfgqpc-acquisition-policy';

const args=process.argv.slice(2);const value=(k:string)=>{const i=args.indexOf(k);return i>=0?args[i+1]:undefined};
const root=path.resolve(value('--root')||'.mizan-ingest');const reportDir=path.join(root,'reports');fs.mkdirSync(reportDir,{recursive:true});
const UA='MIZAN-KFGQPC-Acquisition/1.0';

async function get(url:string,maxBytes:number){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),90000);try{
    const r=await fetch(url,{redirect:'follow',signal:c.signal,headers:{'user-agent':UA,'accept':'application/zip,application/octet-stream,text/html;q=0.8,*/*;q=0.5'}});
    if(!r.ok)throw new Error(`HTTP_${r.status}`);if(!isOfficialKfgqpcUrl(r.url))throw new Error('FINAL_URL_NOT_KFGQPC');
    const declared=Number(r.headers.get('content-length')||0);if(declared>maxBytes)throw new Error(`DECLARED_SIZE_EXCEEDS_LIMIT:${declared}`);
    const reader=r.body?.getReader();if(!reader)throw new Error('BODY_MISSING');const chunks:Buffer[]=[];let total=0;
    while(true){const x=await reader.read();if(x.done)break;const b=Buffer.from(x.value);total+=b.length;if(total>maxBytes){await reader.cancel();throw new Error(`STREAM_SIZE_EXCEEDS_LIMIT:${total}`)}chunks.push(b)}
    return {data:Buffer.concat(chunks),finalUrl:r.url,contentType:r.headers.get('content-type')||''};
  }finally{clearTimeout(t)}
}
async function text(url:string){const r=await get(url,8*1024*1024);return r.data.toString('utf8')}
function safeExtract(zip:string,payload:string){
  const list=spawnSync('unzip',['-Z1',zip],{encoding:'utf8'});if(list.status!==0)throw new Error(`ZIP_LIST_FAILED:${list.stderr||list.stdout}`);
  const entries=String(list.stdout||'').split(/\r?\n/).filter(Boolean);if(!entries.length)throw new Error('ZIP_EMPTY');
  for(const name of entries){const n=name.replace(/\\/g,'/');if(n.startsWith('/')||n.split('/').includes('..'))throw new Error(`ZIP_UNSAFE_PATH:${name}`)}
  fs.rmSync(payload,{recursive:true,force:true});fs.mkdirSync(payload,{recursive:true});
  const ex=spawnSync('unzip',['-q',zip,'-d',payload],{encoding:'utf8'});if(ex.status!==0)throw new Error(`ZIP_EXTRACT_FAILED:${ex.stderr||ex.stdout}`);
}
function updateSource(id:string,patch:Record<string,unknown>){const file=path.join(root,id,'source.json');const before=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};fs.writeFileSync(file,JSON.stringify({...before,...patch},null,2)+'\n')}

async function acquireOne(spec:(typeof LIGHT_PACKAGES)[number],html:string){
  const dir=path.join(root,spec.id),payload=path.join(dir,'payload'),archive=path.join(dir,'source.zip');fs.mkdirSync(dir,{recursive:true});
  const candidates=extractNearbyOfficialCandidates(html,spec.md5);const attempts:any[]=[];
  for(const url of candidates){try{
    const got=await get(url,spec.maxBytes);if(!hasZipMagic(got.data)){attempts.push({url,finalUrl:got.finalUrl,status:'NOT_ZIP'});continue}
    if(!matchesExpected(got.data,spec)){attempts.push({url,finalUrl:got.finalUrl,status:'CHECKSUM_MISMATCH',bytes:got.data.length});continue}
    fs.writeFileSync(archive,got.data);safeExtract(archive,payload);const downloadedAt=new Date().toISOString();
    updateSource(spec.id,{sourceUrl:KFGQPC_DEV_PAGE,sourceArchive:'source.zip',directUrl:got.finalUrl,downloadedAt,officialChecksumVerified:true});
    return {id:spec.id,status:'ACQUIRED_VERIFIED',directUrl:got.finalUrl,bytes:got.data.length,attempts};
  }catch(e){attempts.push({url,status:'FAILED',reason:e instanceof Error?e.message:'UNKNOWN'})}}
  return {id:spec.id,status:'NOT_ACQUIRED',reason:candidates.length?'NO_CANDIDATE_MATCHED_OFFICIAL_CHECKSUM':'CHECKSUM_SECTION_OR_DOWNLOAD_LINK_NOT_FOUND',attempts};
}

async function main(){
  const startedAt=new Date().toISOString();let html='';try{html=await text(KFGQPC_DEV_PAGE)}catch(e){const report={protocol:'MIZAN-KFGQPC-ACQUIRE-1',startedAt,finishedAt:new Date().toISOString(),source:KFGQPC_DEV_PAGE,status:'SOURCE_PAGE_UNREACHABLE',reason:e instanceof Error?e.message:'UNKNOWN',results:[]};fs.writeFileSync(path.join(reportDir,'official-acquisition.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));return}
  const results=[];for(const spec of LIGHT_PACKAGES){const r=await acquireOne(spec,html);results.push(r);console.log(JSON.stringify(r))}
  results.push({id:'mushaf-pages',status:'DEFERRED',reason:'NO_CURRENT_OFFICIAL_604_PAGE_DELIVERY_ARCHIVE_IS_AUTO_SELECTED; MIZAN_WILL_NOT_RECONSTRUCT_OR_CROP_QURAN_PAGES'});
  for(const id of ['audio-hafs','audio-shubah','audio-qalun','audio-susi','audio-duri','audio-warsh'])results.push({id,status:'DEFERRED_HEAVY',reason:'HEAVY_AUDIO_DOWNLOAD_IS_NOT_RUN_IN_AUDIT_BUILD_AND_NOT_UPLOADED_TO_R2'});
  const report={protocol:'MIZAN-KFGQPC-ACQUIRE-1',startedAt,finishedAt:new Date().toISOString(),source:KFGQPC_DEV_PAGE,status:'COMPLETE',results};
  fs.writeFileSync(path.join(reportDir,'official-acquisition.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({mode:'ACQUISITION_AUDIT',report:path.join(reportDir,'official-acquisition.json')}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'ACQUISITION_FAILED');process.exitCode=1});
