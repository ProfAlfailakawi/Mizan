import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getHusaryAudioUrl, getQuranAudioUrl, isValidAyahRef, quranAudioFileId } from '../src/lib/quran-audio';

const BASE = 'https://everyayah.com/data/Husary_128kbps/';

test('Husary Murattal URLs are SSSAAA.mp3 under Husary_128kbps', () => {
  const cases: [number, number, string][] = [
    [1, 1, '001001'],   // الفاتحة ١
    [2, 255, '002255'], // البقرة ٢٥٥
    [18, 10, '018010'], // الكهف ١٠
    [36, 1, '036001'],  // يس ١
    [112, 1, '112001'], // الإخلاص ١
    [113, 1, '113001'], // الفلق ١
    [114, 6, '114006'], // الناس ٦
    [2, 5, '002005'],
  ];
  for (const [s, a, id] of cases) {
    assert.equal(quranAudioFileId(s, a), id);
    assert.equal(getHusaryAudioUrl(s, a), `${BASE}${id}.mp3`);
    assert.equal(getQuranAudioUrl(s, a), `/api/public/quran-audio/${id}.mp3`);
  }
});

test('invalid ayah references are rejected before any request', () => {
  assert.equal(isValidAyahRef(1, 7), true);
  assert.equal(isValidAyahRef(1, 8), false);
  assert.equal(isValidAyahRef(0, 1), false);
  assert.equal(isValidAyahRef(115, 1), false);
  assert.equal(isValidAyahRef(2, 1.5), false);
  assert.throws(() => getHusaryAudioUrl(114, 7), RangeError);
});

test('no other reciter or recitation style is referenced by the audio module', () => {
  const src = fs.readFileSync('src/lib/quran-audio.ts', 'utf8');
  assert.doesNotMatch(src, /Mujawwad|Muallim|Muaiqly|Alafasy/i);
});
