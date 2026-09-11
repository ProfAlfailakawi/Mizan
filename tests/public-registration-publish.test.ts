/*
 * فتحُ التسجيل وعدٌ للعموم، لا حالةٌ على جهاز الإدارة.
 *
 * كانت النسخة العامة — وهي وحدها ما يقرؤه الخادم عند التسجيل — تُكتب كأثرٍ جانبيّ لمزامنةٍ
 * مؤجَّلة تُلغى صامتةً دون إنترنت أو بلا جلسة أو بدورٍ غير مخوَّل. فيرى المدير مسابقته
 * «مفتوحة»، وتظهر صفحتها العامة من نسخته المحلية، ثم يُكمل المتسابق خطواته الثلاث فيردّ
 * الخادم «لم نعثر على المسابقة».
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const store = fs.readFileSync('src/lib/store.ts', 'utf8');
const overview = fs.readFileSync('src/components/admin/CompetitionOverview.tsx', 'utf8');

test('opening registration publishes the public record explicitly and awaits it', () => {
  assert.match(store, /const publishPublicCompetitionRecord=async\(\)/);
  assert.match(store, /setDoc\(doc\(db,'public_competitions',globalState\.competition\.id\)/);
  assert.match(store, /const published=await publishPublicCompetitionRecord\(\)/);
  // النشر لم يعد أثرًا جانبيًا مؤجَّلًا يسبق التحقق.
  assert.ok(store.indexOf('const published=await publishPublicCompetitionRecord()') < store.indexOf('markCompetitionConfigChanged();\n    globalState.auditLogs'));
});

test('a failed publish never leaves the competition open on the admin device alone', () => {
  assert.match(store, /globalState\.competition=\{\.\.\.globalState\.competition,status:previousStatus\}/);
  assert.match(store, /return \{ok:false,issues:\[published\.reason\]/);
});

test('every reason a publish can be skipped is reported to the person who published', () => {
  const publisher = store.slice(store.indexOf('const publishPublicCompetitionRecord'), store.indexOf('const publishCompetition'));
  for (const guard of ['launchPlaceholderActive', 'isOffline', 'auth.currentUser', 'currentUser.role']) {
    assert.ok(publisher.includes(guard) && publisher.includes('return {ok:false,reason:'), guard);
  }
  assert.equal((publisher.match(/return \{ok:false,reason:/g) || []).length, 5, 'كل مانعٍ يقول سببه');
  // والواجهة تنتظر النتيجة بدل أن تمضي متفائلة.
  assert.match(overview, /const publish=async\(\)=>\{[\s\S]*?await store\.publishCompetition\(\)/);
});
