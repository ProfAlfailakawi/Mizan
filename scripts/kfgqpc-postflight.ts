#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {R2PrivateClient,r2ConfigFromEnv} from '../server/r2-private';
import {storageReport} from '../server/kfgqpc-ingest-core';

const args=process.argv.slice(2);const value=(k:string)=>{const i=args.indexOf(k);return i>=0?args[i+1]:undefined};
const root=path.resolve(value('--root')||'.mizan-ingest');const reportDir=path.join(root,'reports');fs.mkdirSync(reportDir,{recursive:true});
const cfg=r2ConfigFromEnv();if(!cfg)throw new Error('R2_PRIVATE_ENV_NOT_CONFIGURED');const r2=new R2PrivateClient(cfg);

const requiredData=[
  'delivery/quran-data/hafs/v13/','delivery/quran-data/warsh/v6/','delivery/quran-data/shubah/v4/','delivery/quran-data/qalun/v5/',
  'delivery/quran-data/duri-abi-amr/v3/','delivery/quran-data/susi-abi-amr/v3/','delivery/quran-data/tafsir-muyassar/v1/',
  'delivery/quran-data/ghareeb-muyassar/v1/','delivery/quran-data/tajweed-muyassar/v1/'
];
const requiredAudio=[
  'delivery/audio/hafs/maher-al-muaiqly/v1/','delivery/audio/shubah/ali-al-hudhaifi/v1/',
  'delivery/audio/qalun/ali-al-hudhaifi/v1/','delivery/audio/susi/uthman-al-siddiqi/v1/'
];
const requiredFonts=[
  'delivery/fonts/hafs/v13/','delivery/fonts/warsh/v6/','delivery/fonts/shubah/v4/','delivery/fonts/qalun/v5/',
  'delivery/fonts/duri-abi-amr/v3/','delivery/fonts/susi-abi-amr/v3/'
];
const image=/\/(\d{3})\.(?:avif|webp|png)$/i;const audio=/\/(\d{3})\/(\d{3})\.(?:mp3|m4a)$/i;

async function main(){
  const health=await r2.health();if(health.state!=='READY')throw new Error(`R2_POSTFLIGHT_CATALOG_NOT_READY:${health.reason||'UNKNOWN'}`);
  const failures:string[]=[];const checks:any[]=[];
  for(const prefix of requiredData){const objects=await r2.listAllObjects(prefix);const payload=objects.filter(x=>!x.key.endsWith('/manifest.json')&&!x.key.endsWith('manifest.json'));const ok=objects.some(x=>x.key.endsWith('manifest.json'))&&payload.length>0;checks.push({kind:'DATA',prefix,objects:objects.length,ok});if(!ok)failures.push(`DATA:${prefix}`)}
  const pages=await r2.listAllObjects('delivery/mushaf-pages/madinah/v1/');const pageNums=new Set(pages.map(x=>x.key.match(image)?.[1]).filter(Boolean));const pagesOk=pageNums.size===604;checks.push({kind:'MUSHAF',prefix:'delivery/mushaf-pages/madinah/v1/',pages:pageNums.size,ok:pagesOk});if(!pagesOk)failures.push(`MUSHAF_PAGES:${pageNums.size}/604`);
  for(const prefix of requiredAudio){const objects=await r2.listAllObjects(prefix);const ayat=new Set(objects.map(x=>{const m=x.key.match(audio);return m?`${m[1]}/${m[2]}`:null}).filter(Boolean));const ok=ayat.size===6236;checks.push({kind:'AUDIO',prefix,ayat:ayat.size,ok});if(!ok)failures.push(`AUDIO:${prefix}:${ayat.size}/6236`)}
  for(const prefix of requiredFonts){const objects=await r2.listAllObjects(prefix);const primary=objects.filter(x=>/\/primary\.(?:woff2?|ttf|otf)$/i.test(x.key));const manifest=objects.some(x=>x.key.endsWith('/manifest.json'));const ok=primary.length===1&&manifest;checks.push({kind:'FONT',prefix,primary:primary.map(x=>x.key),manifest,ok});if(!ok)failures.push(`FONT:${prefix}`)}
  const all=await r2.listAllObjects('delivery/');const storage=storageReport(all);if(!storage.withinSafetyLimit||!storage.withinFreeTier)failures.push('R2_STORAGE_LIMIT');
  const report={protocol:'MIZAN-KFGQPC-POSTFLIGHT-1',checkedAt:new Date().toISOString(),catalog:health.state,storage,checks,status:failures.length?'FAILED':'READY',failures};
  fs.writeFileSync(path.join(reportDir,'r2-postflight.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(failures.length)throw new Error(`R2_POSTFLIGHT_FAILED:${failures.join(',')}`);
}
main().catch(e=>{console.error(e instanceof Error?e.message:'R2_POSTFLIGHT_FAILED');process.exitCode=1});
