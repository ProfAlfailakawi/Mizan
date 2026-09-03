#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {R2PrivateClient,r2ConfigFromEnv} from '../server/r2-private';
import {assertUploadFitsBudget} from '../server/kfgqpc-ingest-core';
import {assertOfficialKfgqpcUrl} from '../server/kfgqpc-authority';

const args=process.argv.slice(2);const has=(x:string)=>args.includes(x);const value=(x:string)=>{const i=args.indexOf(x);return i>=0?args[i+1]:undefined};
const root=path.resolve(value('--root')||'.mizan-ingest');const upload=has('--upload');
const map=[
 ['font-hafs','delivery/fonts/hafs/v13'],['font-warsh','delivery/fonts/warsh/v6'],['font-shubah','delivery/fonts/shubah/v4'],['font-qalun','delivery/fonts/qalun/v5'],['font-duri','delivery/fonts/duri-abi-amr/v3'],['font-susi','delivery/fonts/susi-abi-amr/v3']
] as const;
const walk=(d:string):string[]=>fs.existsSync(d)?fs.readdirSync(d).flatMap(n=>{const p=path.join(d,n),s=fs.statSync(p);return s.isDirectory()?walk(p):s.isFile()?[p]:[]}):[];
const sha=(b:Buffer|string)=>crypto.createHash('sha256').update(b).digest('hex');
const type=(f:string)=>f.endsWith('.woff2')?'font/woff2':f.endsWith('.woff')?'font/woff':f.endsWith('.ttf')?'font/ttf':f.endsWith('.otf')?'font/otf':'application/octet-stream';
const readingToken:Record<string,RegExp>={
 'font-hafs':/hafs|حفص/i,'font-warsh':/warsh|ورش/i,'font-shubah':/shub|shu.?bah|شعب/i,'font-qalun':/qal(?:u|o)n|قالون/i,'font-duri':/douri|duri|دوري/i,'font-susi':/sousi|susi|سوسي/i
};
function choosePrimary(id:string,files:string[]){if(files.length===1)return files[0];const token=readingToken[id];const ranked=files.map(file=>{const name=path.basename(file);let score=token?.test(name)?10:0;if(/quran|uthman|عثمان|kfgqpc|madani/i.test(name))score+=3;if(/bold|italic|display|ui|text/i.test(name))score-=1;return {file,score}}).sort((a,b)=>b.score-a.score||a.file.localeCompare(b.file));if(!ranked[0]||ranked[0].score<=0||ranked[1]?.score===ranked[0].score)throw new Error(`FONT_PRIMARY_AMBIGUOUS:${id}`);return ranked[0].file}

async function main(){
 const cfg=r2ConfigFromEnv();if(upload&&!cfg)throw new Error('R2_PRIVATE_ENV_NOT_CONFIGURED');const r2=cfg?new R2PrivateClient(cfg):null;let objects=r2?await r2.listAllObjects('delivery/'):[];
 const results=[];
 for(const [id,prefix] of map){const dir=path.join(root,id),payload=path.join(dir,'payload'),metaFile=path.join(dir,'source.json');if(!fs.existsSync(metaFile)){results.push({id,status:'UNVERIFIED',reason:'SOURCE_META_MISSING'});continue}const meta=JSON.parse(fs.readFileSync(metaFile,'utf8'));assertOfficialKfgqpcUrl(String(meta.directUrl||meta.sourceUrl||''));if(!meta.directOfficialDownloadVerified){results.push({id,status:'UNVERIFIED',reason:'DIRECT_OFFICIAL_DOWNLOAD_NOT_VERIFIED'});continue}
   const files=walk(payload).filter(f=>/\.(?:ttf|otf|woff2?)$/i.test(f));if(!files.length){results.push({id,status:'UNVERIFIED',reason:'FONT_PAYLOAD_EMPTY'});continue}
   let primary:string;try{primary=choosePrimary(id,files)}catch(e){results.push({id,status:'UNVERIFIED',reason:e instanceof Error?e.message:'FONT_PRIMARY_AMBIGUOUS'});continue}
   const uploadOne=async(file:string,key:string)=>{const body=fs.readFileSync(file),digest=sha(body);if(r2){const head=await r2.headObject(key);if(head){if(head.sha256!==digest)throw new Error(`R2_IMMUTABLE_KEY_CONFLICT:${key}`);return {key,status:'SKIPPED_VERIFIED',bytes:body.length,sha256:digest}}assertUploadFitsBudget(objects,body.length);if(upload)await r2.putObject(key,body,type(file),{sha256:digest});objects.push({key,size:body.length})}return {key,status:upload?'UPLOADED':'DRY_RUN',bytes:body.length,sha256:digest}};
   const primaryKey=`${prefix}/primary${path.extname(primary).toLowerCase()}`;const uploaded=[await uploadOne(primary,primaryKey)];for(const file of files){const base=path.basename(file).replace(/[^a-zA-Z0-9._-]/g,'_'),key=`${prefix}/source/${base}`;uploaded.push(await uploadOne(file,key))}
   const manifest={schemaVersion:'MIZAN-KFGQPC-FONT-MANIFEST-1',authority:'King Fahd Glorious Quran Printing Complex',id,sourceUrl:meta.directUrl||meta.sourceUrl,r2Prefix:prefix,primaryKey,fileCount:files.length,files:uploaded,generatedAt:new Date().toISOString()};const body=JSON.stringify(manifest,null,2)+'\n';if(r2&&upload)await r2.putObject(`${prefix}/manifest.json`,body,'application/json',{sha256:sha(body)});results.push({id,status:'VERIFIED',r2Prefix:prefix,fileCount:files.length})}
 const report={protocol:'MIZAN-KFGQPC-FONT-SYNC-1',mode:upload?'UPLOAD':'DRY_RUN',results};fs.mkdirSync(path.join(root,'reports'),{recursive:true});fs.writeFileSync(path.join(root,'reports','font-sync.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'FONT_SYNC_FAILED');process.exitCode=1});
