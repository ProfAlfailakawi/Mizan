#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {spawnSync} from 'node:child_process';
import {
  KFGQPC_OFFICIAL_ENTRYPOINTS,assertOfficialKfgqpcUrl,isOfficialKfgqpcUrl,
  resolveOfficialKfgqpcUrl,safeArchiveEntry,isCanonicalAyah,canonicalAyahKey,SURAH_AYAH_COUNTS
} from '../server/kfgqpc-authority';

const args=process.argv.slice(2);
const value=(k:string)=>{const i=args.indexOf(k);return i>=0?args[i+1]:undefined};
const has=(k:string)=>args.includes(k);
const root=path.resolve(value('--root')||'.mizan-ingest');
const full=has('--full');
const only=value('--only');
const reportDir=path.join(root,'reports');fs.mkdirSync(reportDir,{recursive:true});
const UA='MIZAN-KFGQPC-Official-Cloud/2.0';

interface Target {
  id:string;kind:'MUSHAF'|'AUDIO'|'FONT';sourcePages:string[];tokens:RegExp[];maxBytes:number;overrideEnv:string;optional?:boolean;
}
const GB=1024*1024*1024,MB=1024*1024;
const targets:Target[]=[
  {id:'mushaf-pages',kind:'MUSHAF',sourcePages:[KFGQPC_OFFICIAL_ENTRYPOINTS.main,KFGQPC_OFFICIAL_ENTRYPOINTS.digitalMushaf],tokens:[/مصحف المدينة|madinah mushaf|حفص|hafs/i,/page|صفحات|صور|image/i],maxBytes:2*GB,overrideEnv:'KFGQPC_MUSHAF_PAGES_URL'},
  {id:'font-hafs',kind:'FONT',sourcePages:[KFGQPC_OFFICIAL_ENTRYPOINTS.fonts],tokens:[/حفص|hafs/i,/عثماني|uthmanic|quran/i],maxBytes:256*MB,overrideEnv:'KFGQPC_FONT_HAFS_URL'},
  {id:'font-warsh',kind:'FONT',sourcePages:[KFGQPC_OFFICIAL_ENTRYPOINTS.fonts],tokens:[/ورش|warsh/i,/عثماني|uthmanic|quran/i],maxBytes:256*MB,overrideEnv:'KFGQPC_FONT_WARSH_URL'},
  {id:'font-shubah',kind:'FONT',sourcePages:[KFGQPC_OFFICIAL_ENTRYPOINTS.fonts],tokens:[/شعبة|shu.?bah/i,/عثماني|uthmanic|quran/i],maxBytes:256*MB,overrideEnv:'KFGQPC_FONT_SHUBAH_URL'},
  {id:'font-qalun',kind:'FONT',sourcePages:[KFGQPC_OFFICIAL_ENTRYPOINTS.fonts],tokens:[/قالون|qal(?:u|o)n/i,/عثماني|uthmanic|quran/i],maxBytes:256*MB,overrideEnv:'KFGQPC_FONT_QALUN_URL'},
  {id:'font-duri',kind:'FONT',sourcePages:[KFGQPC_OFFICIAL_ENTRYPOINTS.fonts],tokens:[/الدوري|douri|duri/i,/أبي عمرو|abu amr|uthmanic|quran/i],maxBytes:256*MB,overrideEnv:'KFGQPC_FONT_DURI_URL'},
  {id:'font-susi',kind:'FONT',sourcePages:[KFGQPC_OFFICIAL_ENTRYPOINTS.fonts],tokens:[/السوسي|sousi|susi/i,/أبي عمرو|abu amr|uthmanic|quran/i],maxBytes:256*MB,overrideEnv:'KFGQPC_FONT_SUSI_URL'},
  {id:'audio-hafs',kind:'AUDIO',sourcePages:[KFGQPC_OFFICIAL_ENTRYPOINTS.audioCatalog],tokens:[/حفص|hafs/i,/ماهر|muaiqly|المعيقلي/i],maxBytes:2*GB,overrideEnv:'KFGQPC_AUDIO_HAFS_URL'},
  {id:'audio-shubah',kind:'AUDIO',sourcePages:[KFGQPC_OFFICIAL_ENTRYPOINTS.audioCatalog],tokens:[/شعبة|shu.?bah/i,/الحذيفي|hudhai/i],maxBytes:2*GB,overrideEnv:'KFGQPC_AUDIO_SHUBAH_URL'},
  {id:'audio-qalun',kind:'AUDIO',sourcePages:[KFGQPC_OFFICIAL_ENTRYPOINTS.audioCatalog],tokens:[/قالون|qal(?:u|o)n/i,/الحذيفي|hudhai/i],maxBytes:2*GB,overrideEnv:'KFGQPC_AUDIO_QALUN_URL'},
  {id:'audio-susi',kind:'AUDIO',sourcePages:[KFGQPC_OFFICIAL_ENTRYPOINTS.audioCatalog],tokens:[/السوسي|sousi|susi/i,/عثمان|siddiq/i],maxBytes:5*GB,overrideEnv:'KFGQPC_AUDIO_SUSI_URL'},
  {id:'audio-duri',kind:'AUDIO',sourcePages:['https://qurancomplex.gov.sa/sounds-douri-juhani/',KFGQPC_OFFICIAL_ENTRYPOINTS.audioCatalog],tokens:[/الدوري|douri|duri/i,/الجهني|juhani/i],maxBytes:3*GB,overrideEnv:'KFGQPC_AUDIO_DURI_URL',optional:true},
  {id:'audio-warsh',kind:'AUDIO',sourcePages:[KFGQPC_OFFICIAL_ENTRYPOINTS.audioCatalog],tokens:[/ورش|warsh/i,/الدوسري|dawsari|dosari/i],maxBytes:3*GB,overrideEnv:'KFGQPC_AUDIO_WARSH_URL',optional:true}
];

const selected=only?targets.filter(x=>x.id===only):targets;if(only&&!selected.length)throw new Error(`UNKNOWN_HEAVY_DATASET:${only}`);
const timeout=(ms:number)=>{const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);return {signal:c.signal,done:()=>clearTimeout(t)}};

async function getText(url:string){
  assertOfficialKfgqpcUrl(url);const x=timeout(45000);try{const r=await fetch(url,{redirect:'follow',signal:x.signal,headers:{'user-agent':UA}});if(!r.ok)throw new Error(`HTTP_${r.status}`);assertOfficialKfgqpcUrl(r.url);const text=await r.text();if(text.length>12*MB)throw new Error('HTML_TOO_LARGE');return {text,url:r.url}}finally{x.done()}
}
function stripHtml(v:string){return v.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/\s+/g,' ').trim()}
function links(html:string,base:string){
  const out:{url:string;text:string;context:string}[]=[];const re=/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m:RegExpExecArray|null;
  while((m=re.exec(html))){let url:string;try{url=resolveOfficialKfgqpcUrl(m[1],base)}catch{continue};const text=stripHtml(m[2]);const context=stripHtml(html.slice(Math.max(0,m.index-700),Math.min(html.length,re.lastIndex+700)));out.push({url,text,context})}
  return out;
}
function isDownloadLike(url:string,text:string){const s=`${url} ${text}`.toLowerCase();return /\.(?:zip|rar|7z)(?:$|\?)/i.test(url)||/download|تحميل|package|حزمة|آيات|ayat|pages|صفحات|font|خط/.test(s)}
function scoreCandidate(t:Target,c:{url:string;text:string;context:string}){
  const hay=`${c.text} ${c.context}`;const matched=t.tokens.filter(token=>token.test(hay)).length;if(matched!==t.tokens.length)return 0;
  let score=isDownloadLike(c.url,c.text)?8:0;score+=matched*10;if(/\.(?:zip)(?:$|\?)/i.test(c.url))score+=5;if(/download\.qurancomplex|fonts\.qurancomplex|qc-dev\.qurancomplex/i.test(c.url))score+=2;return score;
}
async function discover(t:Target){
  const override=process.env[t.overrideEnv];if(override){assertOfficialKfgqpcUrl(override);return [{url:new URL(override).toString(),score:999,via:'ENV_OFFICIAL_OVERRIDE'}]}
  const queue=t.sourcePages.map(url=>({url,depth:0}));const seen=new Set<string>(),found=new Map<string,{url:string;score:number;via:string}>();
  while(queue.length&&seen.size<30){const {url,depth}=queue.shift()!;if(seen.has(url))continue;seen.add(url);let page;try{page=await getText(url)}catch{continue}
    for(const c of links(page.text,page.url)){const score=scoreCandidate(t,c);if(score>=16&&isDownloadLike(c.url,c.text))found.set(c.url,{url:c.url,score,via:page.url});
      if(depth<1&&score>=10&&!/\.(?:zip|rar|7z|mp3|m4a|ttf|otf|woff2?)(?:$|\?)/i.test(c.url)&&!seen.has(c.url))queue.push({url:c.url,depth:depth+1});
    }
  }
  const ranked=[...found.values()].sort((a,b)=>b.score-a.score).slice(0,8);
  if(ranked.length>1&&ranked[0].score===ranked[1].score&&ranked[0].url!==ranked[1].url)throw new Error(`AMBIGUOUS_OFFICIAL_CANDIDATES:${t.id}`);
  return ranked;
}

async function download(url:string,file:string,maxBytes:number){
  assertOfficialKfgqpcUrl(url);const x=timeout(2*60*60*1000);try{
    const r=await fetch(url,{redirect:'follow',signal:x.signal,headers:{'user-agent':UA,'accept':'application/zip,application/octet-stream,audio/*,font/*,*/*;q=0.5'}});if(!r.ok)throw new Error(`HTTP_${r.status}`);assertOfficialKfgqpcUrl(r.url);
    const declared=Number(r.headers.get('content-length')||0);if(declared&&declared>maxBytes)throw new Error(`DECLARED_SIZE_EXCEEDS_LIMIT:${declared}`);if(!r.body)throw new Error('BODY_MISSING');
    fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.part`;let total=0;const monitor=new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){total+=chunk.byteLength;if(total>maxBytes)throw new Error(`STREAM_SIZE_EXCEEDS_LIMIT:${total}`);controller.enqueue(chunk)}});
    await pipeline(Readable.fromWeb(r.body.pipeThrough(monitor) as any),fs.createWriteStream(tmp,{mode:0o600}));fs.renameSync(tmp,file);return {finalUrl:r.url,bytes:total,contentType:r.headers.get('content-type')||''};
  }finally{x.done()}
}
function archiveList(file:string){const r=spawnSync('unzip',['-Z1',file],{encoding:'utf8',maxBuffer:64*MB});if(r.status!==0)throw new Error('ARCHIVE_NOT_SUPPORTED_ZIP');const entries=String(r.stdout||'').split(/\r?\n/).filter(Boolean);if(!entries.length)throw new Error('ZIP_EMPTY');for(const e of entries)if(!safeArchiveEntry(e))throw new Error(`ZIP_UNSAFE_PATH:${e}`);return entries}
function extract(file:string,dir:string){archiveList(file);fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});const r=spawnSync('unzip',['-q',file,'-d',dir],{encoding:'utf8',maxBuffer:8*MB});if(r.status!==0)throw new Error(`ZIP_EXTRACT_FAILED:${String(r.stderr||'').slice(0,500)}`)}
function walk(dir:string):string[]{if(!fs.existsSync(dir))return [];return fs.readdirSync(dir).flatMap(n=>{const p=path.join(dir,n),s=fs.statSync(p);return s.isDirectory()?walk(p):s.isFile()?[p]:[]})}
function atomicCopy(src:string,dst:string){fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,`${dst}.tmp`);fs.renameSync(`${dst}.tmp`,dst)}

function pageNumber(file:string){const base=path.basename(file,path.extname(file));const hits=[...base.matchAll(/(?:^|\D)(\d{1,3})(?:\D|$)/g)].map(x=>Number(x[1])).filter(x=>x>=1&&x<=604);return hits.length===1?hits[0]:null}
function validateMushaf(raw:string,payload:string){
  const files=walk(raw).filter(f=>/\.(?:png|webp|avif)$/i.test(f));const map=new Map<number,string>();for(const f of files){const n=pageNumber(f);if(n===null)continue;if(map.has(n))throw new Error(`MUSHAF_DUPLICATE_PAGE:${n}`);map.set(n,f)}
  const missing=[];for(let i=1;i<=604;i++)if(!map.has(i))missing.push(i);if(missing.length)throw new Error(`MUSHAF_604_VALIDATION_FAILED:MISSING_${missing.slice(0,20).join('_')}${missing.length>20?'_ETC':''}`);
  fs.rmSync(payload,{recursive:true,force:true});fs.mkdirSync(payload,{recursive:true});for(let i=1;i<=604;i++){const src=map.get(i)!;atomicCopy(src,path.join(payload,`${String(i).padStart(3,'0')}${path.extname(src).toLowerCase()}`))}return {fileCount:604};
}
function parseAyah(file:string){
  const rel=file.replace(/\\/g,'/');const base=path.basename(rel,path.extname(rel));const parent=path.basename(path.dirname(rel));let s=0,a=0;
  if(/^\d{1,3}$/.test(parent)&&/^\d{1,3}$/.test(base)){s=Number(parent);a=Number(base)}
  else{const m=base.match(/(?:^|\D)(\d{3})[ _.-]?(\d{3})(?:\D|$)/);if(m){s=Number(m[1]);a=Number(m[2])}}
  return isCanonicalAyah(s,a)?{surah:s,ayah:a}:null;
}
function validateAudio(raw:string,payload:string){
  const files=walk(raw).filter(f=>/\.(?:mp3|m4a)$/i.test(f));const map=new Map<string,string>();for(const f of files){const p=parseAyah(f);if(!p)continue;const k=canonicalAyahKey(p.surah,p.ayah);if(map.has(k))throw new Error(`AUDIO_DUPLICATE_AYAH:${k}`);map.set(k,f)}
  const missing:string[]=[];for(let s=1;s<=114;s++)for(let a=1;a<=SURAH_AYAH_COUNTS[s-1];a++){const k=canonicalAyahKey(s,a);if(!map.has(k))missing.push(k)}if(missing.length)throw new Error(`AUDIO_CANONICAL_COVERAGE_FAILED:MISSING_${missing.slice(0,20).join('_')}${missing.length>20?'_ETC':''}`);
  fs.rmSync(payload,{recursive:true,force:true});for(const [k,src] of map){atomicCopy(src,path.join(payload,`${k}${path.extname(src).toLowerCase()}`))}return {fileCount:map.size};
}
function validateFonts(raw:string,payload:string){const files=walk(raw).filter(f=>/\.(?:ttf|otf|woff2?|ttc)$/i.test(f));if(!files.length)throw new Error('OFFICIAL_FONT_FILES_NOT_FOUND');fs.rmSync(payload,{recursive:true,force:true});fs.mkdirSync(payload,{recursive:true});for(const f of files)atomicCopy(f,path.join(payload,path.basename(f)));return {fileCount:files.length}}
function updateSource(t:Target,patch:Record<string,unknown>){const dir=path.join(root,t.id);fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'source.json'),before=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};fs.writeFileSync(file,JSON.stringify({...before,...patch},null,2)+'\n')}

async function acquire(t:Target){
  const candidates=await discover(t);if(!full)return {id:t.id,kind:t.kind,status:candidates.length?'OFFICIAL_CANDIDATES_FOUND':'NO_OFFICIAL_CANDIDATE',candidates};
  const attempts:any[]=[];for(const c of candidates){const dir=path.join(root,t.id),archive=path.join(dir,'source.zip'),raw=path.join(dir,'.raw'),payload=path.join(dir,'payload');try{
      const got=await download(c.url,archive,t.maxBytes);extract(archive,raw);const validation=t.kind==='MUSHAF'?validateMushaf(raw,payload):t.kind==='AUDIO'?validateAudio(raw,payload):validateFonts(raw,payload);fs.rmSync(raw,{recursive:true,force:true});
      updateSource(t,{sourceUrl:c.via==='ENV_OFFICIAL_OVERRIDE'?got.finalUrl:c.via,directUrl:got.finalUrl,downloadedAt:new Date().toISOString(),sourceArchive:'source.zip',directOfficialDownloadVerified:true,currentOfficialAyahPackageVerified:t.kind==='AUDIO'?true:undefined,officialAuthorityDomain:true,identityTokens:t.tokens.map(x=>x.source),discoveryPage:c.via,validation});
      return {id:t.id,kind:t.kind,status:'ACQUIRED_VERIFIED_STRUCTURE',directUrl:got.finalUrl,bytes:got.bytes,validation,attempts};
    }catch(e){attempts.push({url:c.url,reason:e instanceof Error?e.message:'UNKNOWN'});fs.rmSync(path.join(root,t.id,'.raw'),{recursive:true,force:true})}}
  return {id:t.id,kind:t.kind,status:t.optional?'OPTIONAL_NOT_VERIFIED':'REQUIRED_NOT_ACQUIRED',attempts,candidates};
}

async function main(){const startedAt=new Date().toISOString();const results=[];for(const t of selected){const r=await acquire(t);results.push(r);console.log(JSON.stringify(r))}const requiredFailures=results.filter((r:any)=>r.status==='REQUIRED_NOT_ACQUIRED');const report={protocol:'MIZAN-KFGQPC-HEAVY-ACQUISITION-2',mode:full?'FULL_ACQUIRE':'DISCOVERY_ONLY',startedAt,finishedAt:new Date().toISOString(),authorityRule:'HTTPS *.qurancomplex.gov.sa ONLY',results};fs.writeFileSync(path.join(reportDir,'official-heavy-acquisition.json'),JSON.stringify(report,null,2)+'\n');if(full&&requiredFailures.length){console.error(`REQUIRED_OFFICIAL_ASSETS_NOT_ACQUIRED:${requiredFailures.map((x:any)=>x.id).join(',')}`);process.exitCode=2}}
main().catch(e=>{console.error(e instanceof Error?e.message:'KFGQPC_HEAVY_ACQUISITION_FAILED');process.exitCode=1});
