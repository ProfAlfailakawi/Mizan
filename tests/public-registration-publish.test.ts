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
  assert.match(store, /const publicRef=doc\(db,'public_competitions',publishedCompetition\.id\)/);
  assert.match(store, /await setDoc\(publicRef,/);
  assert.match(store, /const published=await publishPublicCompetitionRecord\(\)/);
  // النشر لم يعد أثرًا جانبيًا مؤجَّلًا يسبق التحقق، ولا تُنشأ بعد نجاحه مراجعة أحدث
  // تجعل الإسقاط الذي تحققنا منه يبدو قديمًا فورًا.
  const success = store.slice(store.indexOf('/* النشر حفظ إعداد المسابقة'), store.indexOf('notify(); return {ok:true'));
  assert.doesNotMatch(success, /markCompetitionConfigChanged\(\)/);
  assert.match(success, /globalState\.competitionConfigUpdatedAt=globalState\.competition\.updatedAt/);
});

test('a failed publish never leaves the competition open on the admin device alone', () => {
  assert.match(store, /globalState\.competition=\{\.\.\.globalState\.competition,status:previousStatus\}/);
  assert.match(store, /return \{ok:false,issues:\[published\.reason\]/);
});

test('every publication blocker is surfaced and success is verified after the authoritative write', () => {
  const publisher = store.slice(store.indexOf('const publishPublicCompetitionRecord'), store.indexOf('const publishCompetition'));
  for (const guard of ['materializePendingCompetitionForPublish', 'launchPlaceholderActive', 'isOffline', 'auth.currentUser', 'currentUser.role']) {
    assert.ok(publisher.includes(guard), guard);
  }
  assert.match(publisher, /verification=await getDoc\(publicRef\)/, 'النشر لا يعلن النجاح قبل قراءة السجل العام بعد الكتابة');
  assert.match(publisher, /verified\.competition\?\.id!==publishedCompetition\.id/);
  assert.match(publisher, /return \{ok:false,reason:/, 'كل فشل يملك رسالة للمستخدم');
  // والواجهة تنتظر النتيجة بدل أن تمضي متفائلة.
  assert.match(overview, /const publish=async\(\)=>\{[\s\S]*?await store\.publishCompetition\(\)/);
});
