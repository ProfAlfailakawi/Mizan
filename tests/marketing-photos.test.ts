/*
 * أقسام الصور تُخفى ما لم توجد صورٌ فعلًا.
 *
 * الخطر أن يُنشَر الموقع بمربّعاتٍ فارغة أو بصورةٍ مكسورة حيث يُتوقَّع وجه — وهو أسوأ
 * من غياب القسم أصلًا. هذا الاختبار يثبّت أن العرض مشروطٌ بوجود الصورة لا بأمنيةٍ بها.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const site = fs.readFileSync('src/components/marketing/MarketingSite.tsx', 'utf8');
const photos = fs.readFileSync('src/components/marketing/photos.ts', 'utf8');

test('an absent hero band renders nothing at all', () => {
  const band = site.slice(site.indexOf('const HeroBand'), site.indexOf('const Moments'));
  assert.match(band, /if \(!HERO_BAND\) return null;/);
});

test('an empty moments list renders nothing at all', () => {
  const moments = site.slice(site.indexOf('const Moments'), site.indexOf('export const MarketingSite'));
  assert.match(moments, /if \(!MOMENTS\.length\) return null;/);
});

test('every declared photo carries alternative text', () => {
  // نمنع صورةً بلا وصف قبل أن تُنشَر: الحقل مطلوب في الواجهة، والقائمة تُقرأ هنا.
  assert.match(photos, /alt: string;/);
  for (const m of photos.matchAll(/\{\s*src:\s*'[^']+'/g)) {
    const tail = photos.slice(photos.indexOf(m[0]), photos.indexOf(m[0]) + 400);
    assert.match(tail, /alt:\s*'[^']+'/);
  }
});
