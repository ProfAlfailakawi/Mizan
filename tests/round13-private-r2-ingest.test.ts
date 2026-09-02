import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {KfgqpcDeliveryRepository,KFGQPC_R2_DEFAULT_SAFETY_LIMIT_BYTES,KFGQPC_R2_FREE_TIER_BYTES,kfgqpcActualStorageReport,kfgqpcAudioKeys,kfgqpcFreeTierBudget,kfgqpcMushafPageKeys} from '../server/kfgqpc-delivery';
import {assertUploadFitsBudget,validateMushafDeliveryPages,verifyFileChecksums} from '../server/kfgqpc-ingest-core';
import {R2PrivateClient,r2ConfigFromEnv} from '../server/r2-private';

test('private R2 key builder uses versioned delivery paths and validates pages 1..604',()=>{
  assert.deepEqual(kfgqpcMushafPageKeys('kfgqpc-hafs-uthmanic-v13',1),[
    'delivery/mushaf-pages/madinah/v1/001.avif','delivery/mushaf-pages/madinah/v1/001.webp','delivery/mushaf-pages/madinah/v1/001.png'
  ]);
  assert.ok(kfgqpcMushafPageKeys('kfgqpc-hafs-uthmanic-v13',604)[0].endsWith('/604.avif'));
  assert.deepEqual(kfgqpcMushafPageKeys('kfgqpc-hafs-uthmanic-v13',0),[]);
  assert.deepEqual(kfgqpcMushafPageKeys('kfgqpc-hafs-uthmanic-v13',605),[]);
  assert.deepEqual(kfgqpcMushafPageKeys('kfgqpc-warsh-uthmanic-v6',1),[],'Hafs Madinah delivery page must not be reused for Warsh');
});

test('audio mapping is exact and has no cross-riwayah fallback',()=>{
  assert.equal(kfgqpcAudioKeys('kfgqpc-audio-hafs-muaiqly',2,255)[0],'delivery/audio/hafs/maher-al-muaiqly/v1/002/255.mp3');
  assert.equal(kfgqpcAudioKeys('kfgqpc-audio-shubah-hudhaifi',1,1)[0],'delivery/audio/shubah/ali-al-hudhaifi/v1/001/001.mp3');
  assert.equal(kfgqpcAudioKeys('kfgqpc-audio-qalun-hudhaifi',1,1)[0],'delivery/audio/qalun/ali-al-hudhaifi/v1/001/001.mp3');
  assert.equal(kfgqpcAudioKeys('kfgqpc-audio-susi-siddiqi',1,1)[0],'delivery/audio/susi/uthman-al-siddiqi/v1/001/001.mp3');
  assert.deepEqual(kfgqpcAudioKeys('warsh',1,1),[]);
  assert.deepEqual(kfgqpcAudioKeys('kfgqpc-audio-duri-abi-amr-juhani',1,1),[],'Al-Duri remains blocked pending package validation');
  assert.deepEqual(kfgqpcAudioKeys('hafs',1,1),[],'generic Hafs alias is deliberately unsupported');
});

test('planned storage stays under the configured safety ceiling, not merely under 10 GiB',()=>{
  const b=kfgqpcFreeTierBudget({} as NodeJS.ProcessEnv);
  assert.equal(b.freeTierBytes,KFGQPC_R2_FREE_TIER_BYTES);
  assert.equal(b.safetyLimitBytes,KFGQPC_R2_DEFAULT_SAFETY_LIMIT_BYTES);
  assert.ok(b.plannedBytes<b.safetyLimitBytes);
  assert.ok(b.safetyRemainingBytes>0);
});

test('actual storage report separates delivery classes and rejects projected safety overflow',()=>{
  const objects=[
    {key:'delivery/audio/hafs/a.mp3',size:100},
    {key:'delivery/mushaf-pages/madinah/v1/001.webp',size:200},
    {key:'delivery/quran-data/health.txt',size:12},
    {key:'delivery/fonts/hafs/v13/primary.ttf',size:50}
  ];
  const r=kfgqpcActualStorageReport(objects,{} as NodeJS.ProcessEnv);assert.equal(r.totalBytes,362);assert.equal(r.audioBytes,100);assert.equal(r.mushafPagesBytes,200);assert.equal(r.quranDataBytes,12);assert.equal(r.fontsBytes,50);
  assert.throws(()=>assertUploadFitsBudget([{key:'delivery/audio/x',size:KFGQPC_R2_DEFAULT_SAFETY_LIMIT_BYTES-10}],20,{} as NodeJS.ProcessEnv),/R2_SAFETY_LIMIT_EXCEEDED/);
});

test('checksum mismatch is quarantined before upload',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-checksum-'));const file=path.join(dir,'bundle.zip');fs.writeFileSync(file,'official bytes');
  try{const ok=verifyFileChecksums(file,{sha256:verifyFileChecksums(file).sha256});assert.equal(ok.status,'VERIFIED');const bad=verifyFileChecksums(file,{md5:'00000000000000000000000000000000'});assert.equal(bad.status,'QUARANTINED');assert.deepEqual(bad.mismatches,['MD5'])}finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('Mushaf delivery validation rejects any missing page',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-pages-'));try{for(let i=1;i<=604;i++)fs.writeFileSync(path.join(dir,`${String(i).padStart(3,'0')}.webp`),'x');assert.equal(validateMushafDeliveryPages(dir).valid,true);fs.rmSync(path.join(dir,'317.webp'));const result=validateMushafDeliveryPages(dir);assert.equal(result.valid,false);assert.deepEqual(result.missing,[317])}finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('R2 env contract is server-side only and delivery status exposes no private origin',()=>{
  assert.equal(r2ConfigFromEnv({R2_ENDPOINT:'https://example.r2.cloudflarestorage.com',R2_BUCKET:'private-bucket',R2_ACCESS_KEY_ID:'id',R2_SECRET_ACCESS_KEY:'secret'} as NodeJS.ProcessEnv)?.bucket,'private-bucket');
  assert.equal(r2ConfigFromEnv({VITE_R2_SECRET_ACCESS_KEY:'forbidden'} as NodeJS.ProcessEnv),null);
  const fake={health:async()=>({state:'READY' as const}),listAllObjects:async()=>[]} as unknown as R2PrivateClient;
  const repo=new KfgqpcDeliveryRepository({r2Client:fake});const status=repo.status() as any;assert.equal(status.r2Configured,true);assert.equal(status.r2Mode,'PRIVATE_S3');assert.equal(status.privateOriginExposedToBrowser,false);assert.equal('endpoint' in status,false);assert.equal('accessKeyId' in status,false);assert.equal('secretAccessKey' in status,false);
});

test('private R2 client signs S3 requests without placing credentials in the URL',async()=>{
  const original=globalThis.fetch;let seenUrl='',seenAuth='';globalThis.fetch=async(input:any,init:any)=>{seenUrl=String(input);seenAuth=String(init?.headers?.Authorization||'');return new Response('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>',{status:200,headers:{'content-type':'application/xml'}})};
  try{const client=new R2PrivateClient({endpoint:'https://acct.r2.cloudflarestorage.com',bucket:'mizan-quran-assets',accessKeyId:'ACCESS123',secretAccessKey:'SECRET456'});await client.listObjects('delivery/',undefined,1);assert.match(seenUrl,/\/mizan-quran-assets\?/);assert.match(seenUrl,/prefix=delivery%2F/);assert.ok(!seenUrl.includes('ACCESS123'));assert.ok(!seenUrl.includes('SECRET456'));assert.match(seenAuth,/Credential=ACCESS123\//)}finally{globalThis.fetch=original}
});

test('frontend source contains no R2 credential contract or private R2 hostname',()=>{
  const root=path.resolve(process.cwd(),'src');if(!fs.existsSync(root))return;
  const files=(function walk(dir:string):string[]{return fs.readdirSync(dir).flatMap(name=>{const p=path.join(dir,name),s=fs.statSync(p);return s.isDirectory()?walk(p):/\.(?:ts|tsx|js|jsx)$/.test(name)?[p]:[]})})(root);
  for(const file of files){const text=fs.readFileSync(file,'utf8');assert.equal(text.includes('R2_SECRET_ACCESS_KEY'),false,`${file} leaks server R2 secret contract`);assert.equal(text.includes('.r2.cloudflarestorage.com'),false,`${file} leaks private R2 origin`);assert.equal(text.includes('VITE_R2_'),false,`${file} defines forbidden frontend R2 variables`)}
});
