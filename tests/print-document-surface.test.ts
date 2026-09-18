/*
 * P30 — تصديرُ وثيقةٍ عربية.
 *
 * **ولا مكتبةَ PDF عمدًا.** مكتباتُ JavaScript تكسر وصلَ الحروف العربية وترتيبَها الثنائي،
 * فيخرج الاسمُ بحروفٍ منفصلة أو مقلوبة. وشهادةٌ باسمٍ مكسور أسوأ من لا شهادة: تُطبع
 * وتُسلَّم وتُعلَّق، ولا يراجعها أحد. وطباعةُ المتصفّح تستعمل محرّكَ النصّ نفسَه الذي رسم
 * الشاشة، فيخرج الاسمُ كما قرأه صاحبُه.
 *
 * والعطلُ الذي كان: `window.print()` يطبع الصفحةَ كلَّها. والشهادةُ نافذةٌ فوق لوحةٍ
 * كاملة، فتخرج الورقةُ وفيها القوائمُ والأزرارُ وما خلفها.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const CSS = read('src/index.css');
const PARTICIPANT = read('src/components/participant/ParticipantDashboard.tsx');
const VERIFICATION = read('src/components/public/CertificateVerification.tsx');
const OVERVIEW = read('src/components/admin/CompetitionOverview.tsx');

test('no PDF library is introduced — Arabic shaping stays with the browser', () => {
  const pkg = JSON.parse(read('package.json')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const all = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const banned of ['jspdf', 'pdfmake', 'pdf-lib', 'html2pdf.js', 'puppeteer']) {
    assert.equal(banned in all, false, `${banned} would render Arabic itself — the browser must keep doing it`);
  }
});

test('printing is scoped to the declared document, not the whole page', () => {
  const block = CSS.slice(CSS.indexOf('@media print'));
  assert.ok(block.includes('body:has([data-mizan-print]) * { visibility: hidden; }'),
    'everything outside the document must be hidden while a document is on screen');
  assert.ok(/body:has\(\[data-mizan-print\]\) \[data-mizan-print\],\s*\n\s*body:has\(\[data-mizan-print\]\) \[data-mizan-print\] \* \{ visibility: visible; \}/.test(block),
    'the document and its contents must stay visible');
  // `visibility` لا `display`: الإخفاء بـ`display` ينهار به تخطيطُ الآباء فيزيح الوثيقة.
  assert.equal(/body:has\(\[data-mizan-print\]\) \* \{ display: none/.test(block), false,
    'hiding by display would collapse the ancestors the document sits in');
});

test('the page is A4 with real margins, so the document is not cropped', () => {
  assert.ok(/@page \{ size: A4; margin: 18mm; \}/.test(CSS), 'an explicit page box is required');
});

test('nothing that only makes sense on screen is printed', () => {
  const block = CSS.slice(CSS.indexOf('@media print'));
  assert.ok(block.includes('.no-print { display: none !important; }'));
  assert.ok(block.includes('backdrop-filter: none !important'), 'the modal backdrop must not print');
  assert.ok(block.includes('box-shadow: none !important'), 'shadows cost ink and add nothing on paper');
});

test('a row or a heading is never split across two pages', () => {
  const block = CSS.slice(CSS.indexOf('@media print'));
  assert.ok(block.includes('break-inside: avoid'), 'a result row must stay whole');
  assert.ok(block.includes('break-after: avoid'), 'a heading must not end a page alone');
});

test('every print trigger has a document to print, and hides its own button', () => {
  /*
   * زرُّ طباعةٍ بلا وثيقةٍ مُعلَنة يطبع الصفحة كلَّها — وهو العطلُ نفسُه بصيغةٍ أخرى.
   * فكلُّ شاشةٍ فيها `window.print()` يجب أن تُعلن ما يُطبع، وأن يختفي زرُّها من الورق.
   */
  for (const [name, source] of [
    ['ParticipantDashboard', PARTICIPANT],
    ['CertificateVerification', VERIFICATION],
    ['CompetitionOverview', OVERVIEW],
  ] as const) {
    assert.ok(source.includes('window.print()'), `${name} must offer printing`);
    assert.ok(source.includes('data-mizan-print'), `${name} must declare what gets printed`);
    assert.ok(/no-print/.test(source), `${name} must keep its own controls off the page`);
  }
});

test('the certificate dialog prints the certificate, not the dialog chrome', () => {
  const at = PARTICIPANT.indexOf('data-mizan-print');
  assert.ok(at > 0);
  // المُعلَن هو بطاقةُ الشهادة نفسها، لا الغلافُ المعتم الذي حولها.
  const before = PARTICIPANT.slice(Math.max(0, at - 260), at);
  assert.equal(/backdrop-blur[^>]*$/.test(before), false, 'the dimmed backdrop must not be the print root');
  assert.ok(PARTICIPANT.includes('justify-center gap-2 no-print'), 'the close/print buttons must not print');
});

test('the results sheet can be printed only when there are results', () => {
  // زرٌّ يطبع ورقةً فارغة يُخرج وثيقةً بلا مضمون ويبدو أنها نتيجة.
  assert.ok(/disabled=\{!results\.length\} onClick=\{\(\)=>window\.print\(\)\}/.test(OVERVIEW),
    'printing an empty sheet must not be offered');
});
