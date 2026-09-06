import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {KfgqpcDeliveryRepository} from '../server/kfgqpc-delivery';

/*
 * Runtime open-content delivery is a SAFETY NET only: local root and the private R2 bucket remain
 * the primary sources. These tests exercise the net directly (no local root, no R2 configured) and
 * prove it serves the King Fahd Complex Mushaf/recitation/text, caches the bytes, and can be
 * disabled. Reading isolation is preserved: an unmapped narration yields nothing, never another
 * riwayah.
 */

function withStubbedFetch(routes:Record<string,()=>Response>,run:()=>Promise<void>){
  const original=globalThis.fetch;
  (globalThis as any).fetch=async(input:any)=>{const url=String(input);const key=Object.keys(routes).find(k=>url.startsWith(k));if(!key)return new Response(null,{status:404});return routes[key]()};
  return run().finally(()=>{(globalThis as any).fetch=original});
}

const freshRepo=()=>new KfgqpcDeliveryRepository({cacheRoot:fs.mkdtempSync(path.join(os.tmpdir(),'mizan-open-'))});

test('open delivery serves the Hafs Mushaf page when neither local nor R2 resolve it',async()=>{
  const repo=freshRepo();let calls=0;
  await withStubbedFetch({'https://files.quran.app/hafs/madani/width_1024/page002.png':()=>{calls++;return new Response(Buffer.from('PNGBYTES'),{status:200,headers:{'content-type':'image/png'}})}},async()=>{
    const asset=await repo.page('kfgqpc-hafs-uthmanic-v13',2);
    assert.ok(asset&&'file'in asset,'page asset resolved to a file');
    assert.equal(asset.source,'OFFICIAL');
    assert.equal(fs.readFileSync(asset.file,'utf8'),'PNGBYTES');
    // Second call is served from the on-disk cache without another network fetch.
    const again=await repo.page('kfgqpc-hafs-uthmanic-v13',2);
    assert.ok(again&&'file'in again);
    assert.equal(again.file,asset.file);
    assert.equal(calls,1,'cached, fetched once');
  });
});

test('open delivery serves Hafs (Muaiqly) ayah audio and stays reading-isolated',async()=>{
  const repo=freshRepo();
  await withStubbedFetch({'https://everyayah.com/data/Maher_AlMuaiqly_64kbps/001001.mp3':()=>new Response(Buffer.from('MP3'),{status:200,headers:{'content-type':'audio/mpeg'}})},async()=>{
    const hafs=await repo.ayahAudio('hafs-muaiqly',1,1);
    assert.ok(hafs,'hafs audio resolved');
    assert.equal(hafs!.type,'audio/mpeg');
    // A narration with no open recitation mapping resolves to nothing — never a substitute reciter.
    const warsh=await repo.ayahAudio('warsh-dawsari',1,1);
    assert.equal(warsh,null);
  });
});

test('open delivery resolves a passage with official page/line loci from the mirror text',async()=>{
  const repo=freshRepo();
  const rows=[{sora:1,aya_no:1,aya_text:'بِسْمِ اللَّهِ',page:1,line_start:2,line_end:2,jozz:1,sora_name_ar:'الفاتحة',sora_name_en:'Al-Fatihah'},
    {sora:1,aya_no:2,aya_text:'الْحَمْدُ لِلَّهِ',page:1,line_start:3,line_end:3,jozz:1}];
  await withStubbedFetch({
    'https://api.github.com/repos/thetruetruth/quran-data-kfgqpc/contents/hafs/data':()=>new Response(JSON.stringify([{name:'data.json',download_url:'https://raw.example/hafs.json'}]),{status:200,headers:{'content-type':'application/json'}}),
    'https://raw.example/hafs.json':()=>new Response(JSON.stringify(rows),{status:200,headers:{'content-type':'application/json'}}),
  },async()=>{
    const passage=await repo.passage('hafs',1,1,2);
    assert.ok(passage,'passage resolved');
    assert.equal(passage!.provenance.authority,'KFGQPC');
    assert.equal(passage!.ayat.length,2);
    assert.equal(passage!.ayat[0].page,1);
    assert.deepEqual(passage!.loci,[{page:1,lineStart:2,lineEnd:3}]);
    assert.doesNotMatch(passage!.provenance.note,/مرآة|mirror/i);
  });
});

test('open delivery can be disabled, leaving primary sources as the only path',async()=>{
  const repo=freshRepo();const prev=process.env.MIZAN_DISABLE_RUNTIME_MIRROR;process.env.MIZAN_DISABLE_RUNTIME_MIRROR='true';
  try{await withStubbedFetch({'https://files.quran.app/':()=>new Response(Buffer.from('X'),{status:200})},async()=>{
    assert.equal(await repo.page('kfgqpc-hafs-uthmanic-v13',2),null);
    assert.equal(await repo.ayahAudio('hafs-muaiqly',1,1),null);
  })}finally{if(prev===undefined)delete process.env.MIZAN_DISABLE_RUNTIME_MIRROR;else process.env.MIZAN_DISABLE_RUNTIME_MIRROR=prev}
});
