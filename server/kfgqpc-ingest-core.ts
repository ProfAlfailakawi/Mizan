import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {KFGQPC_R2_FREE_TIER_BYTES,configuredR2SafetyLimit,kfgqpcActualStorageReport,type KfgqpcActualStorageReport} from './kfgqpc-delivery';
import type {R2ObjectInfo} from './r2-private';

export type KfgqpcIngestStatus='VERIFIED'|'QUARANTINED'|'UNVERIFIED'|'OFFICIAL_AUDIO_UNAVAILABLE';
export interface KfgqpcChecksumExpectation{md5?:string;sha1?:string;sha256?:string}
export interface KfgqpcChecksumResult{md5:string;sha1:string;sha256:string;status:'VERIFIED'|'QUARANTINED';mismatches:string[]}
export interface KfgqpcPackageManifest{
  schemaVersion:'MIZAN-KFGQPC-MANIFEST-1';
  sourceAuthority:'King Fahd Glorious Quran Printing Complex';
  sourceUrl:string;
  downloadedAt?:string;
  packageName:string;
  packageVersion?:string;
  reading?:string;
  rawi?:string;
  tariq?:string;
  reciter?:string;
  fileCount:number;
  totalBytes:number;
  officialChecksum?:KfgqpcChecksumExpectation;
  computedChecksum?:KfgqpcChecksumResult;
  sha256:string;
  ingestedAt:string;
  r2Prefix:string;
  status:KfgqpcIngestStatus;
  notes?:string[];
}

export const KFGQPC_AUTHORITY_HOSTS=new Set(['qurancomplex.gov.sa','www.qurancomplex.gov.sa','qc-dev.qurancomplex.gov.sa']);
export function assertOfficialKfgqpcUrl(value:string){const u=new URL(value);if(u.protocol!=='https:'||!KFGQPC_AUTHORITY_HOSTS.has(u.hostname))throw new Error('KFGQPC_SOURCE_URL_NOT_OFFICIAL');return u.toString()}
const norm=(v?:string)=>String(v||'').trim().toLowerCase();

export function hashFile(file:string){
  const data=fs.readFileSync(file);return {md5:crypto.createHash('md5').update(data).digest('hex'),sha1:crypto.createHash('sha1').update(data).digest('hex'),sha256:crypto.createHash('sha256').update(data).digest('hex')};
}
export function verifyFileChecksums(file:string,expected:KfgqpcChecksumExpectation={}):KfgqpcChecksumResult{
  const computed=hashFile(file),mismatches:string[]=[];
  for(const alg of ['md5','sha1','sha256'] as const){if(expected[alg]&&norm(expected[alg])!==norm(computed[alg]))mismatches.push(alg.toUpperCase())}
  return {...computed,status:mismatches.length?'QUARANTINED':'VERIFIED',mismatches};
}
export function listFilesRecursive(root:string){
  const out:string[]=[];const walk=(dir:string)=>{for(const name of fs.readdirSync(dir)){const file=path.join(dir,name),st=fs.statSync(file);if(st.isDirectory())walk(file);else if(st.isFile())out.push(file)}};walk(root);return out.sort();
}
export function hashDirectory(root:string){
  const files=listFilesRecursive(root);const h=crypto.createHash('sha256');let totalBytes=0;
  for(const file of files){const rel=path.relative(root,file).split(path.sep).join('/'),data=fs.readFileSync(file);totalBytes+=data.length;h.update(rel);h.update('\0');h.update(crypto.createHash('sha256').update(data).digest());h.update('\0')}
  return {sha256:h.digest('hex'),fileCount:files.length,totalBytes,files};
}
export function validateMushafDeliveryPages(root:string){
  const missing:number[]=[];const found:string[]=[];
  for(let page=1;page<=604;page++){const stem=String(page).padStart(3,'0');const candidates=['avif','webp','png'].map(ext=>path.join(root,`${stem}.${ext}`));const file=candidates.find(x=>fs.existsSync(x)&&fs.statSync(x).isFile());if(file)found.push(file);else missing.push(page)}
  const extras=listFilesRecursive(root).filter(x=>/\.(?:avif|webp|png)$/i.test(x)&&!found.includes(x));
  return {valid:missing.length===0&&found.length===604,foundCount:found.length,missing,extras};
}
export function assertUploadFitsBudget(existing:R2ObjectInfo[],newBytes:number,env:NodeJS.ProcessEnv=process.env){
  const current=kfgqpcActualStorageReport(existing,env),safety=configuredR2SafetyLimit(env),projected=current.totalBytes+Math.max(0,newBytes);
  if(projected>=KFGQPC_R2_FREE_TIER_BYTES)throw new Error('R2_FREE_TIER_BUDGET_EXCEEDED');
  if(projected>=safety)throw new Error('R2_SAFETY_LIMIT_EXCEEDED');
  return {current,projectedBytes:projected,safetyLimitBytes:safety,freeTierBytes:KFGQPC_R2_FREE_TIER_BYTES};
}
export function storageReport(objects:R2ObjectInfo[],env:NodeJS.ProcessEnv=process.env):KfgqpcActualStorageReport{return kfgqpcActualStorageReport(objects,env)}
export function buildPackageManifest(input:Omit<KfgqpcPackageManifest,'schemaVersion'|'sourceAuthority'|'ingestedAt'>):KfgqpcPackageManifest{
  assertOfficialKfgqpcUrl(input.sourceUrl);
  return {schemaVersion:'MIZAN-KFGQPC-MANIFEST-1',sourceAuthority:'King Fahd Glorious Quran Printing Complex',ingestedAt:new Date().toISOString(),...input};
}
