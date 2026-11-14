import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file: string) => fs.readFileSync(file, 'utf8');

/*
 * عنصرٌ واحد أعرض من شاشة الهاتف يجرّ الوثيقة كلَّها جانبًا.
 *
 * رُئي على الهاتف: الترويسة مزاحة، والتبويبات مقصوصة، والعنوان خارج الإطار — وكأن العطب
 * في كل مكان. والسبب واحد: أربعة أزرارٍ في صفحة النتائج داخل صفٍّ لا يلتفّ ولا ينكمش.
 *
 * وهذا الملف حارسٌ ساكن يقرأ الشيفرة. والحارس الذي يقيس فعلًا هو
 * `scripts/phone-overflow-audit.mjs`: يفتح المنتَج على ٣٩٠px ويسأل المتصفّح عن أعرض ما
 * مرّره. جُرّب بإرجاع العطب فصار أحمر ١٣٤px، ثم بإصلاحه فصار أخضر.
 */

test('the results toolbar stacks on a phone instead of dragging the page sideways', () => {
  const overview = read('src/components/admin/CompetitionOverview.tsx');
  const toolbar = overview.slice(overview.indexOf('كشف المتسابقين') - 900, overview.indexOf('كشف الفئات') + 200);

  assert.match(toolbar, /grid w-full grid-cols-2 gap-2 sm:flex/, 'four buttons wrap into a grid on a narrow screen');
  assert.doesNotMatch(toolbar, /className="flex gap-2"><Button variant="outline" disabled=\{sealBusy\}/, 'and no longer sit in a row that cannot wrap');
});

test('the phone-width overflow audit exists, is registered, and fails closed', () => {
  const script = read('scripts/phone-overflow-audit.mjs');
  const pkg = JSON.parse(read('package.json'));

  assert.equal(pkg.scripts['qa:phone-overflow'], 'node scripts/phone-overflow-audit.mjs', 'it is runnable by name');

  /* قياسٌ حقيقي في متصفّح، لا قراءةُ أصناف. */
  assert.match(script, /scrollWidth/, 'it measures what the browser actually scrolled');
  assert.match(script, /width: WIDTH, height: 844/, 'at a phone viewport');

  /*
   * وصمتُه ليس نجاحًا: فحصٌ لم يدخل، أو لم يجد تبويبًا، أو لم يقِس شاشةً واحدة — يفشل.
   * وإلّا مرّ أخضرَ وهو لم ينظر إلى شيء، وهو أسوأ من ألّا يوجد.
   */
  assert.match(script, /لم تُقَس شاشةٌ واحدة/, 'measuring nothing is a failure, not a pass');
  assert.match(script, /مدخل البيئة التجريبية غير موجود/, 'and so is failing to get in');
  assert.match(script, /process\.exitCode = problems\.length \? 1 : 0/, 'and problems set a non-zero exit');
});

/*
 * ٣٢٠–٣٨٢px (الشاشة الخارجية الصغيرة للهاتف المطويّ): أربعة عيوب قِيست وأُصلحت.
 */
test('narrow-phone fixes: setup card text, stat labels, code chip, brand-test row, results KPI grid, stepper labels', () => {
  const kit = read('src/components/admin/OrganizerKit.tsx');
  assert.match(kit, /min-w-\[min\(100%,9rem\)\] flex-1">\s*<div className="mizan-kicker">\{ar \? 'ابدأ من هنا'/, '«ابدأ من هنا» wraps the button instead of crushing the text to one word per line');
  assert.match(kit, /leading-4 text-\[color:var\(--muted\)\] sm:truncate/, 'stat labels wrap on a phone and only ellipsize from sm');

  const overview = read('src/components/admin/CompetitionOverview.tsx');
  assert.match(overview, /font-black text-xs whitespace-nowrap tabular-nums" dir="ltr">\{p\.code\.replace/, 'participant code chip never breaks at the hyphen');

  const brand = read('src/components/admin/TenantBrandStudio.tsx');
  assert.match(brand, /flex flex-wrap items-center justify-between gap-2 mb-2">\s*<span[^>]*>\{ar \? 'فحص الشفافية/, 'the transparency-test label and its four chips wrap');

  const docs = read('src/components/admin/ResultsDocuments.tsx');
  assert.doesNotMatch(docs, /gridTemplateColumns: 'repeat\(5,1fr\)'/, 'results KPI tiles must not force five 1fr columns');
  assert.match(docs, /repeat\(auto-fit,minmax\(76px,1fr\)\)/);

  const dna = read('src/components/dna/dna.css');
  assert.match(dna, /@media \(max-width: 359px\)\s*\{\s*\.dna-steps:not\(\[data-size='xs'\]\) \.dna-lbl \{ font-size: 11px/, 'six-station steppers fit 320px without breaking words');
});
