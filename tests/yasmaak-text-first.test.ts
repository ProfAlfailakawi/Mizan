/*
 * «يسمعك» يفتح على الخطّ من أوّل لحظة.
 *
 * كان الطالبُ يضغط «يسمعك» فيرى صورةَ المصحف المدنيّ، ثمّ تتبدّل إلى النصّ بخطّ المصحف حين
 * تتعذّر طبقةُ القلم على الصورة — وقبل ذلك قد يرى النصَّ بخطٍّ احتياطيٍّ لحظةً حتى يصل
 * «أميري قرآن». وقرارُ صاحب المنصّة: الخطُّ أجملُ وأنفعُ للطالب، فيظهر وحده من البداية.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { MushafFaceSurface, type FaceWord } from '../src/components/participant/MushafFaceSurface';
import { QURAN_FONT_FAMILY, QURAN_FONT_TIMEOUT_MS, quranFontReady, warmQuranFont } from '../src/lib/quran-font';

const words: FaceWord[] = ['مَرَجَ', 'ٱلْبَحْرَيْنِ', 'يَلْتَقِيَانِ'].map((text, index) => ({
  index, text, surah: 55, ayah: 19, endsAyah: index === 2, ayahWordIndex: index + 1,
}));

test('the face opens as text in the Quran font — no printed page first', () => {
  const html = renderToStaticMarkup(React.createElement(MushafFaceSurface, { ar: true, page: 532, deliveryReading: 'hafs', words }));
  assert.doesNotMatch(html, /data-official-mushaf-page/, 'the printed page must not stand in for the text');
  assert.match(html, /data-face-words="3"/);
  assert.match(html, /class="font-quran/);
});

test('the printed page is fetched only when a caller asks for it', () => {
  const surface = fs.readFileSync('src/components/participant/MushafFaceSurface.tsx', 'utf8');
  const listens = fs.readFileSync('src/components/participant/MushafListens.tsx', 'utf8');
  assert.match(surface, /const packageId = pageImage \? officialMushafPackageForReading\(deliveryReading\) : undefined;/);
  assert.match(surface, /pageImage = false/);
  assert.doesNotMatch(listens, /pageImage/, '«يسمعك» asks for the text, never the photo');
});

test('the words wait for the Quran font instead of flashing a fallback, but never for long', () => {
  const surface = fs.readFileSync('src/components/participant/MushafFaceSurface.tsx', 'utf8');
  const listens = fs.readFileSync('src/components/participant/MushafListens.tsx', 'utf8');
  assert.match(surface, /!fontReady \? \{ visibility: 'hidden' as const \}/, 'hidden, so the layout keeps its place');
  assert.match(listens, /useEffect\(\(\) => \{ void warmQuranFont\(\); \}, \[\]\);/, 'the font is requested when «يسمعك» opens');
  assert.ok(QURAN_FONT_TIMEOUT_MS <= 3000, 'a fallback face beats an empty page');
  assert.equal(QURAN_FONT_FAMILY, 'Amiri Quran');
  const css = fs.readFileSync('src/index.css', 'utf8');
  assert.match(css, /--font-quran: "Amiri Quran"/, 'the family the screen waits for is the one it draws with');
});

test('outside a browser nothing waits', async () => {
  assert.equal(quranFontReady(), true);
  await warmQuranFont();
});
