import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {KfgqpcDeliveryRepository,kfgqpcFreeTierBudget} from '../server/kfgqpc-delivery';

test('R2 delivery budget stays inside the 10 GB-month Standard free-tier target',()=>{
  const b=kfgqpcFreeTierBudget();
  assert.equal(b.freeTierBytes,10*1024*1024*1024);
  assert.ok(b.plannedBytes<b.freeTierBytes);
  assert.ok(b.remainingBytes>3*1024*1024*1024);
  assert.ok(b.items.some(x=>x.key==='mushaf-delivery-hafs'&&x.bytes===180*1024*1024));
  assert.ok(b.assumptions.some(x=>x.includes('source/vector masters')));
});

test('delivery repository resolves local optimized Mushaf page before cloud',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-kfgqpc-'));
  try{
    const dir=path.join(root,'kfgqpc-hafs-uthmanic-v13');fs.mkdirSync(dir,{recursive:true});
    const file=path.join(dir,'604.webp');fs.writeFileSync(file,Buffer.from([1,2,3]));
    const repo=new KfgqpcDeliveryRepository({pageRoot:root,r2BaseUrl:'https://invalid.example'});
    const asset=await repo.page('kfgqpc-hafs-uthmanic-v13',604);
    assert.equal(asset?.source,'LOCAL');
    assert.equal((asset as any)?.file,file);
    assert.equal((asset as any)?.type,'image/webp');
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('delivery repository rejects unsafe asset coordinates',async()=>{
  const repo=new KfgqpcDeliveryRepository({});
  assert.equal(await repo.page('../escape',1),null);
  assert.equal(await repo.page('safe',0),null);
  assert.equal(await repo.ayahAudio('../bad',1,1),null);
  assert.equal(await repo.ayahAudio('hafs',115,1),null);
});
