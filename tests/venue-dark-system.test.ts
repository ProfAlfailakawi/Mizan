import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/*
 * أسطح القاعة لم يكن لها من نظام التصميم شيء.
 *
 * الحقلُ والشريطُ والملاحظةُ الاستشارية كلّها معرَّفة على الفاتح، فكلّ شاشةٍ داكنة — بوابة
 * الحضور، لوحة الانتظار، قفل الجهاز، منصّة البثّ، صفحة الحفل — كانت تكتب هندستها ولونها
 * بيدها: ‎bg-white/[.06]‎ هنا و‎bg-white/10‎ هناك و‎rgba(244,241,232,.05)‎ في ثالثة، وارتفاعٌ
 * لا يتبع ‎--mizan-control-h‎ فينكسر كلّه في وضع اللمس الكبير.
 *
 * المقابل الداكن يربطها برموز القاعة نفسها، فتتبع تغييرها بدل أن تتجمّد على قيمةٍ مكتوبة.
 */
const css = fs.readFileSync(path.join(process.cwd(), 'src/index.css'), 'utf8');
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

test('the dark control shares the light control’s height and radius tokens', () => {
  assert.match(css, /\.mizan-input-dark \{ min-height:var\(--mizan-control-h\)/,
    'a dark field must follow the same height variable, or touch-XL mode breaks it');
  assert.match(css, /\.mizan-input-dark, \.mizan-textarea-dark \{[^}]*border-radius:13px/,
    'the same radius as the light field');
  assert.match(css, /\.mizan-input-dark, \.mizan-textarea-dark \{[^}]*background:var\(--venue-surface\)/,
    'colour comes from the venue tokens, not a hand-written rgba');
  assert.match(css, /\.mizan-textarea-dark \{ min-height:calc\(var\(--mizan-control-h\) \* 2\.2\)/,
    'the dark textarea follows the same ramp as the light one');
});

test('the dark tab strip and advisory note exist and bind to venue tokens', () => {
  assert.match(css, /\.mizan-tabs-dark \{[^}]*border-color:var\(--venue-line\)/, 'dark tabs use the venue line colour');
  assert.match(css, /\.mizan-tabs-dark \.mizan-tab\.is-active \{/, 'the active pill has a dark treatment');
  assert.match(css, /\.mizan-advisory-dark \{/, 'the guarantee has a voice that reads on dark');
});

test('AdvisoryNote can speak on a dark surface', () => {
  const note = read('src/components/design-system/AdvisoryNote.tsx');
  assert.match(note, /tone\?: 'light' \| 'dark'/, 'the note takes a tone');
  assert.match(note, /mizan-advisory mizan-advisory-dark/, 'and the dark tone reaches the class');
});

test('the venue surfaces use the system instead of hand-rolling it', () => {
  const kiosk = read('src/components/gate/KioskMode.tsx');
  assert.match(kiosk, /className="mizan-input-dark mizan-input-icon-start text-sm"/,
    'the kiosk code field is the shared dark control');
  assert.ok(!/bg-white\/\[\.06\] ps-10/.test(kiosk), 'and its hand-rolled predecessor is gone');

  const infographics = read('src/components/marketing/MarketingInfographics.tsx');
  assert.match(infographics, /className="mizan-tabs mizan-tabs-dark" role="tablist"/, 'the dark strip is a real tab strip');
  assert.ok(!/bg-\[#2F6555\] text-white shadow/.test(infographics), 'its hand-painted active pill is gone');
});

test('the kiosk header is Arabic on an Arabic screen', () => {
  const kiosk = read('src/components/gate/KioskMode.tsx');
  /* كان مكتوبًا «MIZAN Gate» ثابتًا، والحارس يترجم MIZAN وحدها فيبقى «ميزان Gate». */
  assert.match(kiosk, /\{ar\?'بوابة ميزان':'MIZAN Gate'\}/, 'the gate header follows the chosen language');
});
