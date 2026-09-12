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

test('the gate carries the competition name, never the platform’s', () => {
  const kiosk = read('src/components/gate/KioskMode.tsx');
  /*
   * كان العنوان «بوابة ميزان» ثابتًا والتذييل «ميزان · تشغيل هادئ». والمتسابق لا يعرف
   * ميزان: هو في مسابقةٍ باسمها، تنظّمها جهةٌ اشترت أن تظهر باسمها هي. فاسم المنصّة لا
   * يقف في شاشةٍ يراها الجمهور، ولا يعود بابًا خلفيًّا لنصٍّ ثابت.
   */
  assert.match(kiosk, /const gateTitle=bilingualName\(competition,ar\)/, 'the gate header is the competition’s own name');
  assert.doesNotMatch(kiosk, /'بوابة ميزان'|'MIZAN Gate'|'ميزان · تشغيل هادئ'/, 'no hard-coded platform wordmark on a public screen');
  assert.match(kiosk, /brand\.logoUrl/, 'the organizer’s logo takes the mark when one is set');
});

test('the venue boards read their clock without a shaped period marker', () => {
  /*
   * كانت الساعة تُبنى بـ`toLocaleTimeString('ar-KW')`، فيخرج رمز «ص/م» من تشكيلٍ عربيٍّ
   * في خطّ الشاشة الداكنة ملتصقًا مشوّهًا، ويتنقّل موضعه في سياقٍ ثنائي الاتجاه. ومن يقرأ
   * من آخر الممرّ يراه عطبًا لا رمزًا.
   */
  for (const file of ['src/components/public/WaitingBoard.tsx', 'src/components/public/CommitteeDisplay.tsx']) {
    const source = read(file);
    assert.match(source, /venueClock\(now\)/, `${file} must use the shared venue clock`);
    assert.doesNotMatch(source, /toLocaleTimeString/, `${file} must not hand-roll a localized clock`);
  }
});
