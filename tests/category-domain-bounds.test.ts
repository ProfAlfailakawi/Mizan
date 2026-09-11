import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/*
 * المصحف ثلاثون جزءًا، ودرجة السؤال من واحدٍ إلى خمسة (types/index.ts)، والدرجة من مئة،
 * والخادم يرفض تسجيلًا خارج 3..100 سنة. كانت هذه الحقول مفتوحةً بلا حدّ، فتُكتب فئةٌ
 * بخمسين جزءًا فتصل إلى FairDraw بوصفها maxJuz ويُطلب منه سؤالٌ من جزءٍ لا وجود له.
 */
const store = fs.readFileSync('src/lib/store.ts', 'utf8');
const overview = fs.readFileSync('src/components/admin/CompetitionOverview.tsx', 'utf8');

test('the store clamps a category juz count to the Quran, whatever screen writes it', () => {
  assert.match(store, /const QURAN_JUZ_TOTAL = 30;/, 'the bound is a named constant, not a literal in one screen');
  assert.match(store, /const clampCategory = \(patch: Partial<Category>\)/, 'a single clamp guards every category write');
  assert.match(store, /Math\.min\(QURAN_JUZ_TOTAL/, 'the clamp actually caps at the Quran total');
  assert.match(store, /\.\.\.clampCategory\(initial \|\| \{\}\)/, 'addCategory goes through the clamp');
  assert.match(store, /const safe = clampCategory\(patch\);/, 'updateCategory goes through the clamp');
});

/*
 * تغيّر العقد بقصد: عدد الأجزاء لم يعد حقلًا يُكتب باليد في محرر الفئة.
 *
 * السبب هو سبب الاختبار الأصلي نفسه بل أعمق منه: «عشرة أجزاء» لا تقول أيّ عشرة، فحتى
 * الرقم المحدود بثلاثين كان يصل إلى السحب بوصفه حدًّا أعلى للجزء، فيُسأل المتسابق من جزءٍ
 * لم يحفظه ما دام رقمه أقلّ من الحدّ. المحرر الآن يعرض النطاق الحقيقي ويحيل إلى الشاشة
 * التي ترسمه بالأجزاء أو السور أو حدود الآيات، ويبقى حدّ المخزن قائمًا لأي مسار آخر
 * يكتب الفئة (استيراد، نسخ مسابقة، بيانات قديمة).
 */
test('the category editor no longer takes a free juz number; it shows the real range instead', () => {
  assert.equal((overview.match(/<(?:NumberControl|DraftNumber) label=\{ar\?'الأجزاء'[^/]*\/>/g) || []).length, 0,
    'a hand-typed juz count is not a range and must not be offered as one');
  assert.equal((overview.match(/<ScopeHandoff /g) || []).length, 2,
    'both the draft and the saved-category editors show the resolved range and open the scope screen');
  assert.match(overview, /describeScope\(scope!,ar\)/, 'the editor shows what the range actually is');
  assert.match(overview, /mizan:open-scope-engine/, 'and offers a way to change it');
});

test('difficulty, passing score and age stay inside their real domains', () => {
  const bounded = (label: string, expected: RegExp) => {
    const control = new RegExp(`<(?:NumberControl|DraftNumber) label=\\{ar\\?'${label}'[^/]*/>`, 'g');
    const hits = overview.match(control) || [];
    assert.ok(hits.length, `no control found for ${label}`);
    for (const hit of hits) assert.match(hit, expected, `${label} is unbounded: ${hit}`);
  };
  bounded('الصعوبة المستهدفة', /min=\{1\} max=\{5\}/);
  bounded('هامش الصعوبة', /min=\{0\} max=\{4\}/);
  bounded('الحد الأدنى للنجاح', /min=\{0\} max=\{100\}/);
  bounded('العمر الأدنى', /max=\{100\}/);
  bounded('العمر الأعلى', /max=\{100\}/);
});
