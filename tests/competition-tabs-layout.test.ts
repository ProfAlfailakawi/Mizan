import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const view = fs.readFileSync('src/components/admin/CompetitionOverview.tsx', 'utf8');
const operations = /const OperationsView=[\s\S]*?\n\};/.exec(view)?.[0] || '';

test('the judging tab is a judging screen, not the operations screen again', () => {
  /*
   * كان `mode` يُكتب في سمة على الغلاف ولا يُرشّح شيئًا: يفتح المستخدم تبويب «التحكيم»
   * فيرى بوابة الحضور ولوحة الانتظار وخريطة القاعة ووضع الحفل — الشاشة نفسها التي تركها
   * في تبويب «التشغيل»، حرفًا بحرف.
   */
  assert.ok(operations, 'the operations view must still exist');
  assert.match(operations, /\{mode==='operations'&&<section><div[^>]*>\{ar\?'الاستقبال والقاعة'/,
    'reception and hall belong to operations only');
  assert.match(operations, /\{mode==='operations'&&<section><div[^>]*>\{ar\?'الحفل والنتائج'/,
    'ceremony and results belong to operations only');
  /*
   * كان بين التبويبين قسمٌ مشترك اسمه «التحكيم والبث» ببطاقتين. لم يبقَ منه شيء: إشارات
   * ذكاء التحكيم انتقلت إلى مواضع قرارها (القرعة، رئيس التحكيم، المدقق)، وشاشة البث
   * وُزّعت مزاياها على أسطحها ثم حُذفت. فلا يعود لأيّ من البابين أثرٌ هنا.
   */
  // البطاقة نفسها هي ما يُمنع، لا ذِكر الاسم: التعليق الذي يشرح أين ذهبت الميزة يبقى مسموحًا.
  assert.doesNotMatch(operations, /<ToolCard[^>]*title=\{ar\?'(مختبر ذكاء التحكيم|البث والتغطية)'/,
    'neither retired entry may come back as a tool card');
  /*
   * وشاشة التحكيم تعرض اللجان فعلًا.
   *
   * كان ما يظهر في كل وضع يُرشَّح بمُحدِّدٍ في ملف الأنماط يعدّ الأقسام بترتيبها؛ ثم انتقلت
   * الأقسام غير المشتركة إلى شرطٍ في الشيفرة فتبدّل الترتيب، فصار المُحدِّد يخفي قسم اللجان
   * نفسه: تبويب التحكيم عنوانٌ وفراغ، بلا لجنة ولا زرّ إنشاء. فالحارس على الأثر لا على النص.
   */
  assert.doesNotMatch(fs.readFileSync('src/index.css', 'utf8'), /\[data-operation-mode="judging"\][^{]*\{\s*display:none/,
    'no stylesheet may hide a judging section by its position in the tree');
  assert.match(operations, /mode==='operations'\s*\n?\s*\?[\s\S]{0,400}'إدارة يوم المسابقة'/,
    'the event-day heading belongs to operations only');
  assert.match(operations, /:\s*<div className="flex justify-end"><Button[^>]*onClick=\{\(\)=>store\.addCommittee\(\)\}/,
    'judging keeps the create-panel action — it is where panels are built');
  assert.match(operations, /mode==='operations'&&store\.committees\.length>0&&<div className="grid xl:grid-cols/,
    'the capacity simulation belongs to operations only');
  // وقسم اللجان نفسه غير مشروط: هو جوهر شاشة التحكيم، ويظهر في الوضعين.
  assert.match(operations, /<PanelCard key=\{c\.id\}/, 'the panel cards must render');
  assert.doesNotMatch(operations, /mode==='operations'&&<section className="mizan-surface p-5 sm:p-6"><div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">/,
    'the panels section is never gated to a single mode');
});

test('the judging policy toggles are grouped by what they actually change', () => {
  /* تسعة مفاتيح متتابعة بلا فاصل ولا عنوان: لا يُعرف أيّها يمسّ نزاهة النتيجة وأيّها يغيّر
     شكل شاشة المحكّم. */
  const judging = /const JudgingSection=[\s\S]*?\n(?=const )/.exec(view)?.[0] || '';
  assert.ok(judging, 'the judging section must still exist');
  for (const heading of ['نزاهة التحكيم', 'أدوات المحكم أثناء الجلسة', 'المساندة والاحتياط']) {
    assert.ok(judging.includes(heading), `missing group heading: ${heading}`);
  }
  // ولا يضيع مفتاح في التجميع: التسعة كلها ما زالت معروضة.
  const toggles = judging.split('<Toggle ').length - 1;
  assert.equal(toggles, 9, 'every judging toggle must survive the regrouping');
  // ولا يبقى شريط واحد يبتلعها كلها.
  const strips = judging.split('mizan-surface-soft px-4').length - 1;
  assert.equal(strips, 3, 'the nine toggles must sit in three labelled clusters');
});
