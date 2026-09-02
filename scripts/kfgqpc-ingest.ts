#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {R2PrivateClient,r2ConfigFromEnv} from '../server/r2-private';
import {assertOfficialKfgqpcUrl,assertUploadFitsBudget,buildPackageManifest,hashDirectory,listFilesRecursive,storageReport,validateMushafDeliveryPages,verifyFileChecksums,type KfgqpcChecksumExpectation,type KfgqpcIngestStatus} from '../server/kfgqpc-ingest-core';

const OFFICIAL_DEV='https://qurancomplex.gov.sa/en/techquran/dev/';
const OFFICIAL_AUDIO='https://qurancomplex.gov.sa/category/kfgqpc-quran-audio/recite/';

type DatasetSpec={id:string;r2Prefix:string;sourceUrl:string;packageVersion?:string;reading?:string;rawi?:string;reciter?:string;officialChecksum?:KfgqpcChecksumExpectation;kind:'DATA'|'MUSHAF'|'AUDIO'|'FONT'|'HEALTH';blocked?:boolean;blockedStatus?:KfgqpcIngestStatus;note?:string};
const DATASETS:Record<string,DatasetSpec>={
  health:{id:'health',r2Prefix:'delivery/quran-data',sourceUrl:OFFICIAL_DEV,kind:'HEALTH'},
  hafs:{id:'hafs',r2Prefix:'delivery/quran-data/hafs/v13',sourceUrl:OFFICIAL_DEV,packageVersion:'13.0',reading:'حفص عن عاصم',officialChecksum:{md5:'CF6841AEA5B1D1FD70D032B43FF08278',sha1:'36EA5AB0D7EA1702F17FF43F9B50924CCCD77EBF'},kind:'DATA'},
  warsh:{id:'warsh',r2Prefix:'delivery/quran-data/warsh/v6',sourceUrl:OFFICIAL_DEV,packageVersion:'6.0',reading:'ورش عن نافع',officialChecksum:{md5:'4701E8BBF053098220CF2CF4CDA206A1',sha1:'44ECEA8FEB23817FDC01A8EE2162A6A0CF08CAE7'},kind:'DATA'},
  shubah:{id:'shubah',r2Prefix:'delivery/quran-data/shubah/v4',sourceUrl:OFFICIAL_DEV,packageVersion:'4.0',reading:'شعبة عن عاصم',officialChecksum:{md5:'5CDA29121BF0D7234E039002E1FBF600',sha1:'8D66BDF0CAB96DC7D1032792C19F77980CA6682A'},kind:'DATA'},
  qalun:{id:'qalun',r2Prefix:'delivery/quran-data/qalun/v5',sourceUrl:OFFICIAL_DEV,packageVersion:'5.0',reading:'قالون عن نافع',officialChecksum:{md5:'964208FF04C8AADD3DDC1BE262D8CFD3',sha1:'81733666BE17742E13C9FA4C7D26D42B1ADC67C8'},kind:'DATA'},
  'duri-data':{id:'duri-data',r2Prefix:'delivery/quran-data/duri-abi-amr/v3',sourceUrl:OFFICIAL_DEV,packageVersion:'3.0',reading:'الدوري عن أبي عمرو',officialChecksum:{md5:'A60BDD18397B3E27E4617478968A35C8',sha1:'8049482F04B4FF1053A7859F96B2B113B9771EFB'},kind:'DATA'},
  'susi-data':{id:'susi-data',r2Prefix:'delivery/quran-data/susi-abi-amr/v3',sourceUrl:OFFICIAL_DEV,packageVersion:'3.0',reading:'السوسي عن أبي عمرو',officialChecksum:{md5:'1BF6023E29B7622A52B6171232C17096',sha1:'E52DBC6D8B43797A8FAA0FD1EC1D8E5000265674'},kind:'DATA'},
  tafsir:{id:'tafsir',r2Prefix:'delivery/quran-data/tafsir-muyassar/v1',sourceUrl:OFFICIAL_DEV,reading:'حفص عن عاصم',officialChecksum:{md5:'5601682965E32F4DD6992C7600FDCCC3',sha1:'5F533113C2F54F32EDED734BB49E6A5837965722'},kind:'DATA'},
  ghareeb:{id:'ghareeb',r2Prefix:'delivery/quran-data/ghareeb-muyassar/v1',sourceUrl:OFFICIAL_DEV,reading:'حفص عن عاصم',officialChecksum:{md5:'7E22381EEDB152EE7ED6488F2395C6CD',sha1:'055A908C6EC7F06912C33BD00920406C665CC5F9'},kind:'DATA'},
  tajweed:{id:'tajweed',r2Prefix:'delivery/quran-data/tajweed-muyassar/v1',sourceUrl:OFFICIAL_DEV,officialChecksum:{md5:'B4A265A810C0CE4A722019791910B67E',sha1:'D2496382FC5E843CCB693B94DD19407EAA174BEA'},kind:'DATA'},
  'mushaf-pages':{id:'mushaf-pages',r2Prefix:'delivery/mushaf-pages/madinah/v1',sourceUrl:OFFICIAL_DEV,reading:'حفص عن عاصم',kind:'MUSHAF'},
  'audio-hafs':{id:'audio-hafs',r2Prefix:'delivery/audio/hafs/maher-al-muaiqly/v1',sourceUrl:OFFICIAL_AUDIO,reading:'حفص عن عاصم',rawi:'حفص',reciter:'الشيخ ماهر المعيقلي',kind:'AUDIO'},
  'audio-shubah':{id:'audio-shubah',r2Prefix:'delivery/audio/shubah/ali-al-hudhaifi/v1',sourceUrl:OFFICIAL_AUDIO,reading:'شعبة عن عاصم',rawi:'شعبة',reciter:'الشيخ علي الحذيفي',kind:'AUDIO'},
  'audio-qalun':{id:'audio-qalun',r2Prefix:'delivery/audio/qalun/ali-al-hudhaifi/v1',sourceUrl:OFFICIAL_AUDIO,reading:'قالون عن نافع',rawi:'قالون',reciter:'الشيخ علي الحذيفي',kind:'AUDIO'},
  'audio-susi':{id:'audio-susi',r2Prefix:'delivery/audio/susi/uthman-al-siddiqi/v1',sourceUrl:OFFICIAL_AUDIO,reading:'السوسي عن أبي عمرو',rawi:'السوسي',reciter:'د. عثمان الصديقي',kind:'AUDIO'},
  'audio-duri':{id:'audio-duri',r2Prefix:'delivery/audio/duri-abi-amr/abdullah-al-juhany/v1',sourceUrl:OFFICIAL_AUDIO,reading:'الدوري عن أبي عمرو',rawi:'الدوري',reciter:'د. عبدالله بن عواد الجهني',kind:'AUDIO',blocked:true,blockedStatus:'UNVERIFIED',note:'Official ayah-package listing is inconsistent; MIZAN blocks ingestion until the actual official package is independently validated.'},
  'audio-warsh':{id:'audio-warsh',r2Prefix:'delivery/audio/warsh/ibrahim-al-dawsari/v1',sourceUrl:OFFICIAL_AUDIO,reading:'ورش عن نافع',rawi:'ورش',reciter:'د. إبراهيم بن سعيد الدوسري',kind:'AUDIO',blocked:true,blockedStatus:'OFFICIAL_AUDIO_UNAVAILABLE',note:'KFGQPC confirms a Warsh recording historically, but the current downloadable audio catalog inspected by MIZAN does not expose a verified ayah package/mapping.'}
};

const args=process.argv.slice(2);const has=(x:string)=>args.includes(x);const value=(x:string)=>{const i=args.indexOf(x);return i>=0?args[i+1]:undefined};
const root=path.resolve(value('--root')||'.mizan-ingest');const only=value('--only');const doUpload=has('--upload'),doVerify=has('--verify')||doUpload,doReport=has('--report'),resume=has('--resume'),dryRun=has('--dry-run')||(!doUpload&&!doReport&&!doVerify);
const reportDir=path.join(root,'reports');fs.mkdirSync(reportDir,{recursive:true});
const selected=only?[DATASETS[only]].filter(Boolean):Object.values(DATASETS).filter(x=>!x.blocked&&x.kind!=='HEALTH');if(only&&!DATASETS[only])throw new Error(`UNKNOWN_DATASET:${only}`);

const mediaType=(file:string)=>file.endsWith('.webp')?'image/webp':file.endsWith('.avif')?'image/avif':file.endsWith('.png')?'image/png':file.endsWith('.mp3')?'audio/mpeg':file.endsWith('.m4a')?'audio/mp4':file.endsWith('.woff2')?'font/woff2':file.endsWith('.woff')?'font/woff':file.endsWith('.ttf')?'font/ttf':file.endsWith('.json')?'application/json':file.endsWith('.txt')?'text/plain; charset=utf-8':'application/octet-stream';
const fileSha=(file:string)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const normalizeRel=(file:string,base:string)=>path.relative(base,file).split(path.sep).join('/');

function readSourceMeta(dir:string,spec:DatasetSpec){
  const file=path.join(dir,'source.json');const meta=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
  const sourceUrl=assertOfficialKfgqpcUrl(String(meta.sourceUrl||spec.sourceUrl));
  return {...meta,sourceUrl};
}
function verifyDataset(spec:DatasetSpec){
  if(spec.kind==='HEALTH')return {spec,status:'VERIFIED' as KfgqpcIngestStatus,health:true};
  if(spec.blocked)return {spec,status:spec.blockedStatus||'UNVERIFIED' as KfgqpcIngestStatus,reason:spec.note};
  const dir=path.join(root,spec.id),payload=path.join(dir,'payload');if(!fs.existsSync(payload))return {spec,status:'UNVERIFIED' as KfgqpcIngestStatus,reason:'PAYLOAD_MISSING'};
  const meta=readSourceMeta(dir,spec);let computed:any=undefined,status:KfgqpcIngestStatus='VERIFIED';const notes:string[]=[];
  if(spec.officialChecksum){const sourceArchive=meta.sourceArchive?path.resolve(dir,String(meta.sourceArchive)):'';if(!sourceArchive||!fs.existsSync(sourceArchive)){status='UNVERIFIED';notes.push('Official-checksum source archive is missing.')}else{computed=verifyFileChecksums(sourceArchive,spec.officialChecksum);if(computed.status==='QUARANTINED'){status='QUARANTINED';notes.push(`Checksum mismatch: ${computed.mismatches.join(', ')}`)}}}
  if(spec.kind==='MUSHAF'){const pages=validateMushafDeliveryPages(payload);if(!pages.valid){status='QUARANTINED';notes.push(`Mushaf delivery must contain exactly pages 001..604; missing=${pages.missing.join(',')}`)}}
  if(spec.kind==='AUDIO'){
    const files=listFilesRecursive(payload);const invalid=files.filter(f=>!/\/(?:\d{3})\/(?:\d{3})\.(?:mp3|m4a)$/i.test(f.replace(/\\/g,'/')));if(!files.length||invalid.length){status='QUARANTINED';notes.push(`Audio payload path contract invalid for ${invalid.length||'all'} file(s). Expected NNN/NNN.mp3|m4a.`)}
    if(!meta.directOfficialDownloadVerified){status='UNVERIFIED';notes.push('Audio without a published official checksum requires source.json directOfficialDownloadVerified=true after direct KFGQPC acquisition verification.')}
  }
  const d=hashDirectory(payload);const manifest=buildPackageManifest({sourceUrl:meta.sourceUrl,downloadedAt:meta.downloadedAt,packageName:String(meta.packageName||spec.id),packageVersion:String(meta.packageVersion||spec.packageVersion||''),reading:spec.reading,rawi:spec.rawi,reciter:spec.reciter,fileCount:d.fileCount,totalBytes:d.totalBytes,officialChecksum:spec.officialChecksum,computedChecksum:computed,sha256:d.sha256,r2Prefix:spec.r2Prefix,status,notes});
  fs.writeFileSync(path.join(reportDir,`${spec.id}.manifest.json`),JSON.stringify(manifest,null,2)+'\n');return {spec,status,manifest,payload,files:d.files,notes};
}

async function uploadHealth(r2:R2PrivateClient){const body='MIZAN R2 OK\n',sha=crypto.createHash('sha256').update(body).digest('hex'),key='delivery/quran-data/health.txt';const head=await r2.headObject(key);if(head?.sha256===sha)return {key,status:'SKIPPED'};if(head&&!resume)throw new Error('R2_IMMUTABLE_KEY_CONFLICT:health.txt');if(!dryRun)await r2.putObject(key,body,'text/plain; charset=utf-8',{sha256:sha});return {key,status:dryRun?'DRY_RUN':'UPLOADED'};}
async function uploadVerified(r2:R2PrivateClient,result:ReturnType<typeof verifyDataset>){
  if(!('manifest'in result)||result.status!=='VERIFIED')throw new Error(`DATASET_NOT_VERIFIED:${result.spec.id}:${result.status}`);
  let objects=await r2.listAllObjects('delivery/');const uploaded:any[]=[];
  for(const file of result.files){const rel=normalizeRel(file,result.payload),key=`${result.spec.r2Prefix}/${rel}`,sha=fileSha(file),bytes=fs.statSync(file).size;const head=await r2.headObject(key);
    if(head){if(head.sha256===sha){uploaded.push({key,status:'SKIPPED_VERIFIED'});continue}throw new Error(`R2_IMMUTABLE_KEY_CONFLICT:${key}`)}
    assertUploadFitsBudget(objects,bytes);if(!dryRun)await r2.putObject(key,fs.readFileSync(file),mediaType(file),{sha256:sha});uploaded.push({key,status:dryRun?'DRY_RUN':'UPLOADED',bytes,sha256:sha});objects.push({key,size:bytes});
  }
  const manifestBody=JSON.stringify(result.manifest,null,2)+'\n',manifestKey=`${result.spec.r2Prefix}/manifest.json`,manifestSha=crypto.createHash('sha256').update(manifestBody).digest('hex'),existing=await r2.headObject(manifestKey);
  if(existing&&existing.sha256!==manifestSha)throw new Error(`R2_IMMUTABLE_KEY_CONFLICT:${manifestKey}`);if(!existing&&!dryRun)await r2.putObject(manifestKey,manifestBody,'application/json',{sha256:manifestSha});
  return uploaded;
}

async function main(){
  const results=selected.map(verifyDataset);for(const r of results)console.log(JSON.stringify({dataset:r.spec.id,status:r.status,notes:'notes'in r?r.notes:[r.reason].filter(Boolean)}));
  if(dryRun&&!doReport){console.log(JSON.stringify({mode:'DRY_RUN',root,selected:selected.map(x=>x.id)}));return}
  const cfg=r2ConfigFromEnv();if((doUpload||doReport)&&!cfg)throw new Error('R2_PRIVATE_ENV_NOT_CONFIGURED');const r2=cfg?new R2PrivateClient(cfg):null;
  if(doUpload&&r2){await uploadHealth(r2);for(const r of results)if(r.spec.kind!=='HEALTH')await uploadVerified(r2,r)}
  if(doReport&&r2){const objects=await r2.listAllObjects('delivery/'),report=storageReport(objects);fs.writeFileSync(path.join(reportDir,'r2-storage-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({storageReport:report}))}
}
main().catch(err=>{console.error(err instanceof Error?err.message:'INGEST_FAILED');process.exitCode=1});
