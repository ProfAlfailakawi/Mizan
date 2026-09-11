import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/*
 * ارتفاع أسطح القاعة.
 *
 * أسطح القاعة كلّها حاوياتُ تمريرٍ من صنف `mizan-venue*`، وهذه الأصناف تحمل حشوًا سفليًا
 * محجوزًا لزرّ قفل الجهاز الطافي. فطفلٌ يطلب `min-h-screen` — أي ارتفاع الشاشة كاملًا —
 * يصير المجموع `100vh + الحشو`، فتُمرَّر الشاشة بقدر الحشو ويسقط تذييلها تحت الحافة.
 *
 * وهذا عطبٌ صامت: لا يُسقط اختبارًا ولا يُظهر خطأً، ويبدو على شاشة المطوّر سليمًا لأنه
 * يمرّرها بإصبعه دون أن ينتبه. ولا أحد يمرّر تلفازًا معلّقًا في ممرّ.
 *
 * وقُيس الفرق فعلًا: `npm run qa:venue-legibility` يفتح الحالتين في متصفّح ويقيسهما —
 * `min-h-screen` تفيض ٨٠ بكسل، و`min-h-full` تفيض صفرًا. فهذا الاختبار يحرس قاعدةً
 * مُقاسة، لا رأيًا.
 */

const VENUE_SURFACES = [
  'src/components/public/WaitingBoard.tsx',
  'src/components/public/CommitteeDisplay.tsx',
  'src/components/public/HallRecitationMap.tsx',
  'src/components/public/CeremonyView.tsx',
  'src/components/gate/KioskMode.tsx',
];

const read = (p: string) => fs.readFileSync(p, 'utf8');

/*
 * الشرح يذكر القاعدة بنصّها — ومنه اسم الصنف الممنوع. فالفحص يجري على الشيفرة وحدها،
 * وإلّا لأسقط التعليقُ الذي يشرح الإصلاحَ الاختبارَ الذي يحرسه.
 */
const codeOnly = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('the reserved lock-button padding still exists — the rule depends on it', () => {
  const css = read('src/index.css');
  assert.match(css, /\.mizan-venue, \.mizan-venue-2, \.mizan-venue-deep \{ padding-bottom:/,
    'if this reservation is ever removed, the min-h-full rule below should be revisited');
});

test('no venue surface asks a child for the full screen height inside a padded scroller', () => {
  /*
   * الفحص بنيويّ لأن الأثر بصريّ: لو سقط هذا لصار التذييل تحت الحافة على كل شاشة قاعة،
   * ولا شيء في الاختبارات يصرخ.
   */
  const offenders: string[] = [];
  for (const file of VENUE_SURFACES) {
    const src = codeOnly(read(file));
    if (!/min-h-screen/.test(src)) continue;
    /* السطح المُمرَّر وحده هو المعنيّ: `overflow-hidden` يقصّ ولا يُمرِّر. */
    if (/fixed inset-0[^"']*overflow-auto/.test(src)) offenders.push(file);
  }
  assert.deepEqual(offenders, [],
    'a scrolling venue surface must size its child with min-h-full, not min-h-screen');
});

test('the two boards state the rule where the next reader will look for it', () => {
  for (const file of ['src/components/public/WaitingBoard.tsx', 'src/components/public/CommitteeDisplay.tsx']) {
    assert.match(read(file), /min-h-full/, `${file} must use min-h-full`);
  }
  assert.match(codeOnly(read('src/components/public/HallRecitationMap.tsx')), /min-h-full/);
  assert.match(read('src/components/public/HallRecitationMap.tsx'), /حشوًا سفليًا لزرّ قفل الجهاز/,
    'the reason must travel with the code, or the next edit reverts it');
});

test('the measurement that proves the rule is wired into the repository', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.scripts['qa:venue-legibility'], 'the audit must be runnable by name');
  const audit = read('scripts/venue-legibility-audit.mjs');
  assert.match(audit, /min-h-screen/, 'the audit must measure the failing case');
  assert.match(audit, /min-h-full/, 'against the passing one');
  assert.match(audit, /ruleHolds/, 'and fail if the rule ever stops holding');
});
