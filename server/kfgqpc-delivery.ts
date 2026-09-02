import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {R2PrivateClient,r2ConfigFromEnv,type R2ObjectInfo} from './r2-private';

export type KfgqpcDeliveryKind='mushaf-page'|'audio-ayah'|'font';
export type KfgqpcDeliverySource='LOCAL'|'R2'|'NONE';
export type KfgqpcR2Readiness='NOT_CONFIGURED'|'CHECKING'|'READY'|'UNAVAILABLE';

export interface KfgqpcStorageBudgetItem{key:string;labelArabic:string;bytes:number;note:string}
export interface KfgqpcStorageBudget{freeTierBytes:number;safetyLimitBytes:number;plannedBytes:number;remainingBytes:number;safetyRemainingBytes:number;utilization:number;safetyUtilization:number;items:KfgqpcStorageBudgetItem[];assumptions:string[]}
export interface KfgqpcActualStorageReport{totalBytes:number;audioBytes:number;mushafPagesBytes:number;quranDataBytes:number;fontsBytes:number;otherBytes:number;remainingFromFreeTierBytes:number;remainingFromSafetyLimitBytes:number;percentageUsed:number;safetyPercentageUsed:number;objectCount:number;withinFreeTier:boolean;withinSafetyLimit:boolean}

const MB=1024*1024,GB=1024*1024*1024;
export const KFGQPC_R2_FREE_TIER_BYTES=10*GB;
export const KFGQPC_R2_DEFAULT_SAFETY_LIMIT_BYTES=9*GB;

export function configuredR2SafetyLimit(env:NodeJS.ProcessEnv=process.env){
  const raw=Number(env.MIZAN_R2_SAFETY_LIMIT_BYTES||KFGQPC_R2_DEFAULT_SAFETY_LIMIT_BYTES);
  return Number.isFinite(raw)&&raw>0?Math.min(KFGQPC_R2_FREE_TIER_BYTES,Math.floor(raw)):KFGQPC_R2_DEFAULT_SAFETY_LIMIT_BYTES;
}

// Conservative planning only. Actual usage is always measured from R2 before/after ingestion.
export function kfgqpcFreeTierBudget(env:NodeJS.ProcessEnv=process.env):KfgqpcStorageBudget{
  const items:KfgqpcStorageBudgetItem[]=[
    {key:'audio-hafs-muaiqly',labelArabic:'حفص · ماهر المعيقلي',bytes:724.25*MB,note:'official ayah audio package; planning figure until measured ingestion'},
    {key:'audio-shubah-hudhaifi',labelArabic:'شعبة · علي الحذيفي',bytes:722*MB,note:'official ayah audio package; planning figure until measured ingestion'},
    {key:'audio-qalun-hudhaifi',labelArabic:'قالون · علي الحذيفي',bytes:760.66*MB,note:'official ayah audio package; planning figure until measured ingestion'},
    {key:'audio-susi-siddiqi',labelArabic:'السوسي · عثمان الصديقي',bytes:3.25*GB,note:'official ayah audio package; planning figure until measured ingestion'},
    {key:'quran-developer-data',labelArabic:'حزم النص والعلوم القرآنية',bytes:83*MB,note:'developer packages + tafsir/ghareeb/tajweed engineering allowance'},
    {key:'mushaf-delivery-hafs',labelArabic:'صفحات مصحف المدينة · نسخة ويب محسنة',bytes:180*MB,note:'604-page delivery allowance; not a claim about official master size'}
  ];
  const freeTierBytes=KFGQPC_R2_FREE_TIER_BYTES,safetyLimitBytes=configuredR2SafetyLimit(env),plannedBytes=Math.round(items.reduce((n,x)=>n+x.bytes,0));
  return {freeTierBytes,safetyLimitBytes,plannedBytes,remainingBytes:Math.max(0,freeTierBytes-plannedBytes),safetyRemainingBytes:Math.max(0,safetyLimitBytes-plannedBytes),utilization:plannedBytes/freeTierBytes,safetyUtilization:plannedBytes/safetyLimitBytes,items,assumptions:[
    'R2 Standard delivery storage only; source/vector masters remain offline and are not counted.',
    'One selected official reciter per supported narration; duplicate Hafs reciters are not stored.',
    'The 180 MB Mushaf figure is a delivery engineering allowance, not an official package-size claim.',
    'Al-Duri audio is excluded until its inconsistent official ayah-package listing is independently validated.',
    'Warsh audio is excluded from delivery until a current KFGQPC downloadable ayah package and mapping are verified.'
  ]};
}

export function kfgqpcActualStorageReport(objects:R2ObjectInfo[],env:NodeJS.ProcessEnv=process.env):KfgqpcActualStorageReport{
  const sum=(prefix:string)=>objects.filter(x=>x.key.startsWith(prefix)).reduce((n,x)=>n+x.size,0);
  const audioBytes=sum('delivery/audio/'),mushafPagesBytes=sum('delivery/mushaf-pages/'),quranDataBytes=sum('delivery/quran-data/'),fontsBytes=sum('delivery/fonts/');
  const totalBytes=objects.reduce((n,x)=>n+x.size,0),known=audioBytes+mushafPagesBytes+quranDataBytes+fontsBytes,otherBytes=Math.max(0,totalBytes-known),safety=configuredR2SafetyLimit(env);
  return {totalBytes,audioBytes,mushafPagesBytes,quranDataBytes,fontsBytes,otherBytes,remainingFromFreeTierBytes:Math.max(0,KFGQPC_R2_FREE_TIER_BYTES-totalBytes),remainingFromSafetyLimitBytes:Math.max(0,safety-totalBytes),percentageUsed:totalBytes/KFGQPC_R2_FREE_TIER_BYTES,safetyPercentageUsed:totalBytes/safety,objectCount:objects.length,withinFreeTier:totalBytes<KFGQPC_R2_FREE_TIER_BYTES,withinSafetyLimit:totalBytes<safety};
}

const safe=(v:string)=>/^[a-zA-Z0-9._-]{1,120}$/.test(v);
const cleanBase=(v:string)=>v.replace(/\/+$/,'');
const contentType=(file:string)=>file.endsWith('.webp')?'image/webp':file.endsWith('.avif')?'image/avif':file.endsWith('.png')?'image/png':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.mp3')?'audio/mpeg':file.endsWith('.m4a')?'audio/mp4':file.endsWith('.woff2')?'font/woff2':file.endsWith('.woff')?'font/woff':file.endsWith('.ttf')?'font/ttf':file.endsWith('.json')?'application/json':file.endsWith('.txt')?'text/plain; charset=utf-8':'application/octet-stream';
const pad3=(n:number)=>String(n).padStart(3,'0');

const MUSHAF_PAGE_PREFIX:Record<string,string>={
  'kfgqpc-hafs-uthmanic-v13':'delivery/mushaf-pages/madinah/v1'
};
const AUDIO_PREFIX:Record<string,string>={
  'kfgqpc-audio-hafs-muaiqly':'delivery/audio/hafs/maher-al-muaiqly/v1',
  'hafs-muaiqly':'delivery/audio/hafs/maher-al-muaiqly/v1',
  'kfgqpc-audio-shubah-hudhaifi':'delivery/audio/shubah/ali-al-hudhaifi/v1',
  'shubah-hudhaifi':'delivery/audio/shubah/ali-al-hudhaifi/v1',
  'kfgqpc-audio-qalun-hudhaifi':'delivery/audio/qalun/ali-al-hudhaifi/v1',
  'qalun-hudhaifi':'delivery/audio/qalun/ali-al-hudhaifi/v1',
  'kfgqpc-audio-susi-siddiqi':'delivery/audio/susi/uthman-al-siddiqi/v1',
  'susi-siddiqi':'delivery/audio/susi/uthman-al-siddiqi/v1',
  'kfgqpc-audio-duri-juhani':'delivery/audio/duri-abi-amr/abdullah-al-juhany/v1',
  'duri-juhani':'delivery/audio/duri-abi-amr/abdullah-al-juhany/v1',
  'kfgqpc-audio-warsh-dawsari':'delivery/audio/warsh/ibrahim-al-dawsari/v1',
  'warsh-dawsari':'delivery/audio/warsh/ibrahim-al-dawsari/v1'
};
const FONT_PREFIX:Record<string,string>={
  'kfgqpc-hafs-uthmanic-v13':'delivery/fonts/hafs/v13/primary',
  'kfgqpc-warsh-uthmanic-v6':'delivery/fonts/warsh/v6/primary',
  'kfgqpc-shubah-uthmanic-v4':'delivery/fonts/shubah/v4/primary',
  'kfgqpc-qaloun-uthmanic-v5':'delivery/fonts/qalun/v5/primary',
  'kfgqpc-douri-abu-amr-uthmanic-v3':'delivery/fonts/duri-abi-amr/v3/primary',
  'kfgqpc-sousi-abu-amr-uthmanic-v3':'delivery/fonts/susi-abi-amr/v3/primary'
};

export function kfgqpcMushafPageKeys(packageId:string,page:number){
  if(!safe(packageId)||!Number.isInteger(page)||page<1||page>604)return [] as string[];
  const prefix=MUSHAF_PAGE_PREFIX[packageId];if(!prefix)return [] as string[];
  return ['avif','webp','png'].map(ext=>`${prefix}/${pad3(page)}.${ext}`);
}
export function kfgqpcAudioKeys(readingId:string,surah:number,ayah:number){
  if(!safe(readingId)||!Number.isInteger(surah)||surah<1||surah>114||!Number.isInteger(ayah)||ayah<1||ayah>400)return [] as string[];
  const prefix=AUDIO_PREFIX[readingId];if(!prefix)return [] as string[];
  return [`${prefix}/${pad3(surah)}/${pad3(ayah)}.mp3`,`${prefix}/${pad3(surah)}/${pad3(ayah)}.m4a`];
}
export function kfgqpcFontKeys(packageId:string){
  if(!safe(packageId))return [] as string[];const prefix=FONT_PREFIX[packageId];if(!prefix)return [] as string[];
  return ['woff2','woff','ttf'].map(ext=>`${prefix}.${ext}`);
}

export class KfgqpcDeliveryRepository{
  private readonly options:{pageRoot?:string;fontRoot?:string;audioRoot?:string;r2BaseUrl?:string;r2BearerToken?:string;r2Client?:R2PrivateClient;cacheRoot?:string};
  private readonly r2:R2PrivateClient|null;
  private r2Readiness:KfgqpcR2Readiness='NOT_CONFIGURED';
  private r2ReadinessReason='';
  private readonly cacheRoot:string;

  constructor(options:{pageRoot?:string;fontRoot?:string;audioRoot?:string;r2BaseUrl?:string;r2BearerToken?:string;r2Client?:R2PrivateClient;cacheRoot?:string}){
    this.options=options;const envConfig=r2ConfigFromEnv();this.r2=options.r2Client||(envConfig?new R2PrivateClient(envConfig):null);this.cacheRoot=options.cacheRoot||path.join(os.tmpdir(),'mizan-kfgqpc-r2-cache');
    if(this.r2){this.r2Readiness='CHECKING';void this.refreshR2Readiness()}
  }

  status(){const budget=kfgqpcFreeTierBudget();const r2Configured=!!this.r2||!!this.options.r2BaseUrl;return {protocol:'MIZAN-KFGQPC-DELIVERY-2',deliverySource:r2Configured?'R2':(this.options.pageRoot||this.options.audioRoot||this.options.fontRoot)?'LOCAL':'NONE',r2Configured,r2Mode:this.r2?'PRIVATE_S3':this.options.r2BaseUrl?'PROTECTED_GATEWAY':'NONE',r2Readiness:this.r2?this.r2Readiness:(this.options.r2BaseUrl?'UNAVAILABLE':'NOT_CONFIGURED'),r2ReadinessReason:this.r2Readiness==='UNAVAILABLE'?this.r2ReadinessReason:undefined,privateOriginExposedToBrowser:false,localFirst:true,localPageRootConfigured:!!this.options.pageRoot,localAudioRootConfigured:!!this.options.audioRoot,localFontRootConfigured:!!this.options.fontRoot,budget}}

  async refreshR2Readiness(){if(!this.r2){this.r2Readiness='NOT_CONFIGURED';this.r2ReadinessReason='';return this.r2Readiness}this.r2Readiness='CHECKING';const result=await this.r2.health();this.r2Readiness=result.state;this.r2ReadinessReason=result.state==='READY'?'':result.reason;return this.r2Readiness}
  async actualStorageReport(){if(!this.r2)throw new Error('R2_PRIVATE_NOT_CONFIGURED');return kfgqpcActualStorageReport(await this.r2.listAllObjects('delivery/'))}

  private localFile(root:string|undefined,segments:string[],exts:string[]){if(!root)return null;if(segments.some(x=>!safe(x)))return null;const base=path.resolve(root),stem=path.resolve(root,...segments);if(!stem.startsWith(base+path.sep)&&stem!==base)return null;for(const ext of exts){const file=`${stem}.${ext}`;if(fs.existsSync(file)&&fs.statSync(file).isFile())return {file,type:contentType(file)}}return null}

  private cacheFileForKey(key:string){const ext=path.extname(key).slice(1).replace(/[^a-zA-Z0-9]/g,'')||'bin';const hash=crypto.createHash('sha256').update(key).digest('hex');return path.join(this.cacheRoot,`${hash}.${ext}`)}
  private async remotePrivate(keys:string[]){if(!this.r2)return null;for(const key of keys){const cached=this.cacheFileForKey(key);if(fs.existsSync(cached)&&fs.statSync(cached).isFile())return {file:cached,type:contentType(key),source:'R2' as const};let r:Response|null;try{r=await this.r2.getObject(key)}catch{continue}if(!r)continue;const bytes=Buffer.from(await r.arrayBuffer());fs.mkdirSync(this.cacheRoot,{recursive:true,mode:0o700});const tmp=`${cached}.${process.pid}.${crypto.randomUUID()}.tmp`;fs.writeFileSync(tmp,bytes,{mode:0o600});fs.renameSync(tmp,cached);return {file:cached,type:r.headers.get('content-type')||contentType(key),source:'R2' as const}}return null}

  private async remoteLegacy(relativeCandidates:string[]){const base=this.options.r2BaseUrl;if(!base)return null;for(const relative of relativeCandidates){if(relative.split('/').some(x=>!safe(x)))continue;const url=`${cleanBase(base)}/${relative}`;const headers:Record<string,string>={};if(this.options.r2BearerToken)headers.Authorization=`Bearer ${this.options.r2BearerToken}`;let r:Response;try{r=await fetch(url,{headers,redirect:'error'})}catch{continue}if(r.ok&&r.body)return {response:r,type:r.headers.get('content-type')||contentType(relative),source:'R2' as const};if(r.status!==404)continue}return null}

  private async remote(privateKeys:string[],legacyKeys:string[]){return (await this.remotePrivate(privateKeys))||(await this.remoteLegacy(legacyKeys))}

  async page(packageId:string,page:number){if(!safe(packageId)||!Number.isInteger(page)||page<1||page>604)return null;const local=this.localFile(this.options.pageRoot,[packageId,String(page)],['avif','webp','png','svg']);if(local)return {source:'LOCAL' as const,...local};const privateKeys=kfgqpcMushafPageKeys(packageId,page);if(!privateKeys.length)return null;return this.remote(privateKeys,[`mushaf/${packageId}/pages/${page}.avif`,`mushaf/${packageId}/pages/${page}.webp`,`mushaf/${packageId}/pages/${page}.png`])}

  async ayahAudio(readingId:string,surah:number,ayah:number){if(!safe(readingId)||!Number.isInteger(surah)||surah<1||surah>114||!Number.isInteger(ayah)||ayah<1||ayah>400)return null;const privateKeys=kfgqpcAudioKeys(readingId,surah,ayah);if(!privateKeys.length)return null;const local=this.localFile(this.options.audioRoot,[readingId,String(surah),String(ayah)],['mp3','m4a']);if(local)return {source:'LOCAL' as const,...local};return this.remote(privateKeys,[`audio/${readingId}/ayah/${surah}/${ayah}.mp3`,`audio/${readingId}/ayah/${surah}/${ayah}.m4a`])}

  async font(packageId:string){if(!safe(packageId))return null;const privateKeys=kfgqpcFontKeys(packageId);if(!privateKeys.length)return null;const local=this.localFile(this.options.fontRoot,[packageId],['woff2','woff','ttf']);if(local)return {source:'LOCAL' as const,...local};return this.remote(privateKeys,[`fonts/${packageId}.woff2`,`fonts/${packageId}.woff`,`fonts/${packageId}.ttf`])}
}
