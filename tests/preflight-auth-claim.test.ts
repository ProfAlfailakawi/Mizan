import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/*
 * تفسيرُ المانع يجب أن يطابق ما تفعله الشيفرة.
 *
 * كان فحصُ ما قبل الإطلاق يقول إن `VITE_REQUIRE_AUTH` «يفرض المصادقة»، وأن غيابه يجعل
 * المصادقة غير مفروضة. وهذا لم يبقَ صحيحًا: التطبيق يفرضها بلا شرط (`requireAuth=true`)،
 * فشاشة الدخول تظهر بالمتغيّر وبلا المتغيّر — وقد تُحقّق ذلك في متصفّحٍ حقيقي.
 *
 * وتفسيرٌ مضلّل في بوابة إطلاق أسوأ من غيابه: يُرسل الناشر يبحث عن ثغرةِ دخولٍ ليست
 * موجودة، ويغفل عن الخطر الحقيقي — بياناتُ عرضٍ تُزرع في نشرٍ حقيقي.
 *
 * فهذا الاختبار يربط الاثنين: إن صارت المصادقة مشروطةً بالبيئة يومًا، يسقط هنا لتُحدَّث
 * جملةُ المانع معها، بدل أن تبقى تصف نظامًا لم يعد قائمًا.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

test('the app enforces authentication unconditionally', () => {
  const app = read('src/App.tsx');
  assert.match(app, /const\s+requireAuth\s*=\s*true\b/,
    'App.tsx must enforce auth unconditionally; if this changes, the preflight blocker text must change too');
});

test('the preflight blocker does not claim the flag enforces authentication', () => {
  const preflight = read('scripts/go-live-preflight.mjs');
  const authFlagSection = preflight.slice(
    Math.max(0, preflight.indexOf("value('VITE_REQUIRE_AUTH') !== 'true'") - 800),
    preflight.indexOf("value('VITE_REQUIRE_AUTH') !== 'true'") + 800,
  );
  assert.ok(authFlagSection.length > 0, 'the flag check is present');
  // لا يُقال «المصادقة غير مفروضة» بوصفها أثرًا لغياب المتغيّر.
  assert.doesNotMatch(authFlagSection, /المصادقة غير مفروضة/,
    'auth is enforced regardless of the flag; the blocker must not say otherwise');
  // ويُقال الخطرُ الحقيقي: بيانات العرض.
  assert.match(authFlagSection, /بيانات العرض/, 'the blocker must name the real risk: seeded demo data');
});

test('the flag still gates the real-deployment distinction it is used for', () => {
  // المتغيّر يبقى ذا معنى: عليه يُفرَّغ العرض، وبه يُشترط مفتاح Firebase.
  assert.match(read('src/lib/launch-state.ts'), /VITE_REQUIRE_AUTH\s*===\s*'true'/,
    'isLaunchDeployment still reads the flag');
  assert.match(read('scripts/go-live-preflight.mjs'), /VITE_REQUIRE_AUTH'\) === 'true' && !has\('VITE_FIREBASE_API_KEY'\)/,
    'the Firebase key requirement is still tied to the flag');
});
