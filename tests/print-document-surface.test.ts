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

const DOCUMENTS = read('src/components/admin/ResultsDocuments.tsx');

test('every print trigger has a document to print, and hides its own button', () => {
  /*
   * زرُّ طباعةٍ بلا وثيقةٍ مُعلَنة يطبع الصفحة كلَّها — وهو العطلُ نفسُه بصيغةٍ أخرى.
   * صفحة التحقق تُعلن وثيقتها داخل الصفحة؛ والشهادة وكشوف النتائج تُطبع وثيقةً مستقلة في
   * إطارٍ خفيّ (`printDocument`)، فلا يصل الورقَ شيءٌ من واجهة التطبيق أصلًا.
   */
  assert.ok(VERIFICATION.includes('window.print()'), 'CertificateVerification must offer printing');
  assert.ok(VERIFICATION.includes('data-mizan-print'), 'CertificateVerification must declare what gets printed');
  assert.ok(/no-print/.test(VERIFICATION), 'CertificateVerification must keep its own controls off the page');
  assert.ok(/export function printDocument/.test(DOCUMENTS), 'an isolated print document must exist');
  assert.ok(/createElement\('iframe'\)/.test(DOCUMENTS), 'printed in a frame of its own, not the app page');
  assert.ok(PARTICIPANT.includes('CertificateModal'), 'the participant prints the certificate document');
  assert.ok(OVERVIEW.includes('ResultsSheetModal') && OVERVIEW.includes('CertificateModal'), 'the results view prints documents, not the page');
});

test('the certificate dialog prints the certificate, not the dialog chrome', () => {
  // ما يُطبع هو عملُ الشهادة وحده مُصيَّرًا إلى وثيقة، لا النافذة التي تعرضه.
  assert.ok(/renderToStaticMarkup\(<CertificateArtwork/.test(DOCUMENTS), 'the print source is the certificate artwork alone');
  assert.ok(/size:A4 \$\{landscape/.test(DOCUMENTS), 'the certificate has its own A4 page box');
});

test('the results sheet can be printed only when there are results', () => {
  // زرٌّ يطبع ورقةً فارغة يُخرج وثيقةً بلا مضمون ويبدو أنها نتيجة.
  assert.ok(/disabled=\{!results\.length\} onClick=\{\(\)=>setSheet\('official'\)\}/.test(OVERVIEW),
    'printing an empty sheet must not be offered');
  assert.ok(/REPORTABLE_RESULT_STATUSES/.test(DOCUMENTS), 'only approved, sealed or published results reach the printed sheet');
});
