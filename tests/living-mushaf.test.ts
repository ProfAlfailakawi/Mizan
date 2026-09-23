import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { MushafFaceSurface, type FaceWord } from '../src/components/participant/MushafFaceSurface';
import { SimilarSlipCard } from '../src/components/participant/SimilarSlipCard';
import { pageLineSlots } from '../src/lib/mushaf-word-boxes';

/*
 * «المصحفُ الحيّ» — القلمُ والأثرُ والحجاب، وبطاقةُ المفترق.
 * يُقاس بالتصيير حيث أمكن، وبالشيفرة حيث يلزم متصفّح (قراءةُ بكسلات الصفحة).
 */

const words: FaceWord[] = [
  { index: 0, text: 'أَلَمۡ', surah: 71, ayah: 15, endsAyah: false, ayahWordIndex: 1 },
  { index: 1, text: 'تَرَوۡاْ', surah: 71, ayah: 15, endsAyah: false, ayahWordIndex: 2 },
  { index: 2, text: 'كَيۡفَ', surah: 71, ayah: 15, endsAyah: false, ayahWordIndex: 3 },
  { index: 3, text: 'خَلَقَ', surah: 71, ayah: 15, endsAyah: true, ayahWordIndex: 4 },
];
const render = (live?: { cursor: number | null; reached: number; veiled: boolean; hint: number | null }) =>
  renderToStaticMarkup(React.createElement(MushafFaceSurface, { ar: true, page: 571, surahName: 'نوح', words, live }));

test('the pen sits on the word being recited, and what was recited keeps a trail', () => {
  const html = render({ cursor: 1, reached: 2, veiled: false, hint: null });
  assert.match(html, /data-word="1"[^>]*data-live="pen"/);
  assert.match(html, /data-word="0"[^>]*data-live="done"/);
  assert.doesNotMatch(html, /data-word="2"[^>]*data-live=/, 'a word not yet reached carries no trail');
});

test('the veil hides only what has not been recited — and the hint lifts one word', () => {
  const html = render({ cursor: 1, reached: 2, veiled: true, hint: 3 });
  assert.doesNotMatch(html, /data-word="0"[^>]*data-veiled/);
  assert.match(html, /data-word="2"[^>]*data-veiled="true"/);
  assert.doesNotMatch(html, /data-word="3"[^>]*data-veiled/, 'the hinted word is revealed');
  // الحجابُ يُخفي الرسمَ ولا يمحوه: النصُّ القرآنيّ كما هو في الصفحة.
  for (const w of words) assert.ok(html.includes(w.text));
});

test('before recitation the face is untouched by the live layer', () => {
  const html = render();
  assert.doesNotMatch(html, /data-live=|data-veiled=/);
});

test('the fork card names the twin ayah and shows both roads, without the word "mistake"', () => {
  const html = renderToStaticMarkup(React.createElement(SimilarSlipCard, { ar: true, slip: {
    wordIndex: 4, shared: 'أَلَمۡ تَرَوۡاْ كَيۡفَ خَلَقَ', expected: 'ٱللَّهُ', heard: 'ٱلسَّمَٰوَٰتِ', surah: 67, ayah: 3, surahName: 'الملك',
  } }));
  assert.match(html, /سورة الملك/);
  assert.match(html, /الآية ٣/);
  assert.ok(html.includes('ٱللَّهُ') && html.includes('ٱلسَّمَٰوَٰتِ'));
  assert.doesNotMatch(html, /أخطأت/);
});

test('line slots follow the ink periodicity, not the first and last inked rows', () => {
  // ثلاثة أسطر، كلُّ سطرٍ 20 صفًّا: حبرٌ كثيف في قلبه. وحركةٌ شاردة فوق الصفحة تزيح أوّل حبر.
  const ink: number[] = new Array(80).fill(0);
  ink[2] = 3; // شَرْدة
  for (const start of [10, 30, 50]) for (let y = start + 5; y < start + 15; y += 1) ink[y] = 10;
  const slots = pageLineSlots(ink, 3);
  assert.equal(slots.length, 3);
  for (const [i, start] of [10, 30, 50].entries()) {
    const center = (slots[i].top + slots[i].height / 2) * 80;
    assert.ok(Math.abs(center - (start + 10)) <= 3, `line ${i + 1} centered at ${center}, expected ≈${start + 10}`);
  }
});

test('the live page is wired: measured on the image, word-level where confident, line-level otherwise', () => {
  const page = fs.readFileSync('src/components/participant/LiveMushafPage.tsx', 'utf8');
  const surface = fs.readFileSync('src/components/participant/MushafFaceSurface.tsx', 'utf8');
  const listens = fs.readFileSync('src/components/participant/MushafListens.tsx', 'utf8');
  assert.match(page, /readPagePixels\(image/);
  assert.match(page, /wordBoxesFromLines\(measured, grouped\.order\)/);
  assert.match(page, /place\(index\) \?\? lineBox\(index\)|place\(w\.index\) \?\? lineBox\(w\.index\)/);
  // الصورةُ الصامتة لا تُعرض حين يلزم الكلام ولم تقم الطبقة.
  assert.match(surface, /const showImage = !!officialPage && \(!needsVoice \|\| \(overlayPossible && overlay !== 'none'\)\);/);
  // وما دام القياسُ جاريًا لا يُعلن تعذّرُه.
  assert.match(page, /const state: OverlayState = !enabled \|\| geometry === null \? 'none' : geometry \? 'ready' : 'pending';/);
  // الأثرُ لا يرجع، والقلمُ ينساب إلى هدفه كلمةً كلمة، ويقفز في الرجوع وحده.
  assert.match(listens, /setReached\(r => Math\.max\(r, penTarget \+ 1\)\)/);
  assert.match(listens, /if \(pen === null \|\| penTarget < pen \|\| penTarget - pen > 24\)/);
  assert.match(listens, /setPen\(p => \(p === null \? penTarget : p \+ 1\)\)/);
  assert.match(listens, /if \(judged\.frontier > 0\) advance\(judged\.frontier - 1\);/);
  assert.match(listens, /noticeSlips\(settledHere\)/);
});

test('layout words are zero-based on the server and one-based everywhere else — converted at the seam', async () => {
  const { layoutTokenWords } = await import('../src/lib/mushaf-word-boxes');
  const words = layoutTokenWords({ words: [
    { surah: 71, ayah: 11, wordIndex: 1, line: 2 }, { surah: 71, ayah: 11, wordIndex: 0, line: 2 },
    { surah: 71, ayah: 12, wordIndex: 0, line: 2 },
  ] }, (s, a, k) => `${s}:${a}:${k}`);
  assert.deepEqual(words.map(w => [w.ayah, w.ayahWordIndex, w.endsAyah, w.text]), [
    [11, 1, false, '71:11:1'], [11, 2, true, '71:11:2'], [12, 1, true, '71:12:1'],
  ]);
  const page = fs.readFileSync('src/components/participant/LiveMushafPage.tsx', 'utf8');
  assert.match(page, /findLayoutWord\(layout, w\.surah, w\.ayah, w\.ayahWordIndex - 1\)/);
  const judge = fs.readFileSync('src/components/judge/OfficialMushafSurface.tsx', 'utf8');
  assert.match(judge, /findLayoutWord\(layout,a\.surah,a\.ayah,tracking\.wordIndex-1\)/);
});

test('the judge page places the pen on the word, and keeps the line lens where it cannot', () => {
  const judge = fs.readFileSync('src/components/judge/OfficialMushafSurface.tsx', 'utf8');
  assert.match(judge, /const penFor=usePageWordPen\(url,locus\.page,layout,!!wordLevel,imageEl\);/);
  assert.match(judge, /\{audioPen\|\|trackPen\s*\? <span aria-hidden className=\{`mizan-live-pen/);
  assert.match(judge, /layout=\{layouts\[locus\.page\]\} wordLevel=\{readingKey==='hafs'\}/);
  assert.match(judge, /pageLineSlots\(ink,expectedLines,bandsFromInkProfile\(ink,\{expectedLines\}\)\)/);
});
