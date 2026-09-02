import test from 'node:test';
import assert from 'node:assert/strict';
import {extractNearbyOfficialCandidates,hasZipMagic,isOfficialKfgqpcUrl,matchesExpected} from '../server/kfgqpc-acquisition-policy';

test('acquisition accepts only official KFGQPC https hosts',()=>{
  assert.equal(isOfficialKfgqpcUrl('https://qurancomplex.gov.sa/a.zip'),true);
  assert.equal(isOfficialKfgqpcUrl('https://cdn.qurancomplex.gov.sa/a.zip'),true);
  assert.equal(isOfficialKfgqpcUrl('http://qurancomplex.gov.sa/a.zip'),false);
  assert.equal(isOfficialKfgqpcUrl('https://qurancomplex.gov.sa.evil.example/a.zip'),false);
});

test('candidate discovery stays near checksum and filters foreign links',()=>{
  const md5='CF6841AEA5B1D1FD70D032B43FF08278';
  const html=`<section><a href="https://evil.example/a.zip">Download</a><a href="/wp-content/uploads/hafs.zip">Download 10MB</a><p>MD5 ${md5}</p></section>`;
  assert.deepEqual(extractNearbyOfficialCandidates(html,md5),['https://qurancomplex.gov.sa/wp-content/uploads/hafs.zip']);
});

test('zip magic and checksum verification are fail closed',()=>{
  const zip=Buffer.from([0x50,0x4b,0x03,0x04,1,2,3]);assert.equal(hasZipMagic(zip),true);assert.equal(hasZipMagic(Buffer.from('html')),false);
  assert.equal(matchesExpected(Buffer.from('abc'),{md5:'900150983CD24FB0D6963F7D28E17F72',sha1:'A9993E364706816ABA3E25717850C26C9CD0D89D'}),true);
  assert.equal(matchesExpected(Buffer.from('abcd'),{md5:'900150983CD24FB0D6963F7D28E17F72',sha1:'A9993E364706816ABA3E25717850C26C9CD0D89D'}),false);
});
