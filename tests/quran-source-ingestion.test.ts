import test from 'node:test';
import assert from 'node:assert/strict';
import { compareQuranRows, inspectCandidateFile, invalidateApprovalsOnPackageChange, parseQuranVerseFile, validateVerseStructure } from '../src/lib/quran-source-ingestion';
import type { QuranSourceManifestRecord } from '../src/types';

test('source file hash is computed from original bytes and expected checksum is verified',async()=>{
 const bytes=new TextEncoder().encode('1|1|alpha\n');const first=await inspectCandidateFile({name:'source.txt',format:'txt',bytes});
 const second=await inspectCandidateFile({name:'source.txt',format:'txt',bytes,expectedSha256:first.sha256});
 assert.equal(second.checksumMatch,true);assert.equal(first.sha256.length,64);
});

test('scientific source parser rejects invalid UTF-8 rather than replacing characters',()=>{
 assert.throws(()=>parseQuranVerseFile({name:'bad.txt',format:'txt',bytes:Uint8Array.from([0xff,0xfe,0xfd])}),/INVALID_UTF8_SOURCE_ENCODING/);
});

test('structure validator catches duplicates and expected ayah counts',()=>{
 const out=validateVerseStructure([{surah:1,ayah:1,text:'a'},{surah:1,ayah:1,text:'b'}],{surahCount:1,ayahCountBySurah:{1:2}});
 assert.equal(out.valid,false);assert.ok(out.errors.some(x=>x.startsWith('DUPLICATE_AYAH')));
});

test('cross-check preserves scientifically meaningful character and diacritic differences',()=>{
 const diacritic=compareQuranRows([{surah:1,ayah:1,text:'بَ'}],[{surah:1,ayah:1,text:'بُ'}]);
 assert.equal(diacritic.state,'DIFFERENCE');assert.equal(diacritic.differences[0].level,'DIACRITIC');
 const character=compareQuranRows([{surah:1,ayah:1,text:'ب'}],[{surah:1,ayah:1,text:'ت'}]);
 assert.equal(character.differences[0].level,'CHARACTER');
 const missing=compareQuranRows([{surah:1,ayah:1,text:'a'}],[{surah:1,ayah:1,text:'a'},{surah:1,ayah:2,text:'b'}]);
 assert.equal(missing.differences[0].level,'UNVERIFIED');
});

test('scientific approvals are invalidated when package hash changes',()=>{
 const source={packageHash:'hash-a',scientificReviews:[{reviewerId:'a',reviewerName:'A',decision:'approve' as const,packageHash:'hash-a',reviewedAt:'2026-01-01'}]} as QuranSourceManifestRecord;
 assert.equal(invalidateApprovalsOnPackageChange(source,'hash-a').length,1);
 assert.equal(invalidateApprovalsOnPackageChange(source,'hash-b').length,0);
});
