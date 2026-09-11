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
  // والعنوان يقول أي تبويب هو.
  assert.match(operations, /mode==='judging'\?\(ar\?'التحكيم'/, 'the heading must name the tab the user is on');
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
