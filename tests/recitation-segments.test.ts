import assert from 'node:assert/strict';
import test from 'node:test';
import { alignHeardToFace, buildAyahSegments, type SegmentWord } from '../src/lib/recitation-segments';

/* وجهٌ من آيتين: ٧١:١٥ (٨ كلمات) و٧١:١٦ (٧ كلمات)، بفهارس تبدأ من ٢٠. */
const A15 = 'أَلَمۡ تَرَوۡاْ كَيۡفَ خَلَقَ ٱللَّهُ سَبۡعَ سَمَٰوَٰتٖ طِبَاقٗا'.split(' ');
const A16 = 'وَجَعَلَ ٱلۡقَمَرَ فِيهِنَّ نُورٗا وَجَعَلَ ٱلشَّمۡسَ سِرَاجٗا'.split(' ');
const face: SegmentWord[] = [
  ...A15.map((text, i) => ({ index: 20 + i, text, surah: 71, ayah: 15 })),
  ...A16.map((text, i) => ({ index: 28 + i, text, surah: 71, ayah: 16 })),
];
/* ما سمعه المحرّكُ بلا تشكيل، كلمةٌ كلَّ ٤٠٠ مللي ثانية — وهكذا يعود Whisper. */
const heardOf = (words: string[], from = 0) => words.map((text, i) => ({ text, startMs: from + i * 400, endMs: from + i * 400 + 350 }));
const plain = (w: string) => w.replace(/[ً-ٰٟۖ-ۭ]/g, '');

test('each ayah becomes one segment spanning what was heard of it', () => {
  const heard = heardOf([...A15, ...A16].map(plain));
  const segs = buildAyahSegments(face, heard);
  assert.deepEqual(segs.map(s => [s.id, s.from, s.to]), [['71:15', 0, 7], ['71:16', 0, 6]]);
  assert.equal(segs[0].startMs, 0);
  assert.equal(segs[1].wordIndices[0], 28);
  assert.ok(segs[0].endMs <= segs[1].startMs, 'segments never overlap');
});

test('an ayah mostly unheard is not sent — its place in the audio is unknown', () => {
  const heard = heardOf([...A15.map(plain), plain(A16[0]), plain(A16[1])]);
  assert.deepEqual(buildAyahSegments(face, heard).map(s => s.id), ['71:15']);
});

test('unheard edge words are trimmed from the segment, not guessed', () => {
  const heard = heardOf(A16.slice(1).map(plain), 5000);
  const [seg] = buildAyahSegments(face, heard);
  assert.equal(seg.id, '71:16');
  assert.equal(seg.from, 1, 'the first word was not heard, so the segment starts at the second');
  assert.equal(seg.startMs, 5000 - 150);
});

test('a long ayah is cut at word boundaries into pieces of at most 14 seconds', () => {
  const long = Array.from({ length: 40 }, (_, i) => ({ index: i, text: `كلمة${'ب'.repeat(i % 5 + 1)}`, surah: 2, ayah: 282 }));
  const heard = long.map((w, i) => ({ text: w.text, startMs: i * 800, endMs: i * 800 + 700 }));
  const segs = buildAyahSegments(long, heard);
  assert.ok(segs.length >= 3);
  for (const s of segs) assert.ok(s.endMs - s.startMs <= 14_000 + 400, `${s.id} is ${s.endMs - s.startMs}ms`);
  assert.deepEqual(segs.map(s => s.id).slice(0, 2), ['2:282', `2:282:${segs[1].from}`]);
  assert.equal(segs[1].from, segs[0].to + 1, 'pieces are contiguous');
});

test('the hizb symbol is carried in the ayah words but never counted as recited', () => {
  const withHizb: SegmentWord[] = [{ index: 5, text: '۞', surah: 71, ayah: 15 }, ...face.slice(0, 8)];
  const [seg] = buildAyahSegments(withHizb, heardOf(A15.map(plain)));
  assert.equal(seg.ayahWords[0], '۞');
  assert.equal(seg.from, 1);
});

test('alignment follows order: a repeated word is matched to its own place', () => {
  const heard = heardOf(A16.map(plain));
  const t = alignHeardToFace(face.slice(8), heard);
  assert.equal(t.get(28)!.startMs, 0);
  assert.equal(t.get(32)!.startMs, 4 * 400, 'the second «وجعل» maps to the second heard «وجعل»');
});
