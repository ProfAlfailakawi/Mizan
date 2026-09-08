/*
 * المالك جذر الثقة: دعوته للأدوار الحسّاسة لا تنتظر شخصًا ثانيًا.
 *
 * المالك (super_admin) وحده، فلو طُلبت منه موافقةٌ ثانية على دعوة محكّم لتعذّر عليه إطلاق
 * أول جهة. هذا الاختبار يثبّت أن الاستثناء مقصورٌ على المالك، وأن مديري الجهات يبقون تحت
 * فصل المهام (موافقة شخصٍ ثانٍ).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

test('the owner is exempted from second-person approval, org admins are not', () => {
  const server = fs.readFileSync('server/identity-governance.ts', 'utf8');
  // الحساسية تسقط عن المالك وحده عند إنشاء الدعوة.
  assert.match(server, /SENSITIVE\.has\(input\.requestedRole\)&&actor\.role!=='super_admin'/);
  // ويبقى منع موافقة المُنشئ نفسه قائمًا (فصل المهام لغير المالك).
  assert.match(server, /SECOND_PERSON_REQUIRED/);

  const store = fs.readFileSync('src/lib/store.ts', 'utf8');
  assert.match(store, /roleGrantRequiresDualApproval\(input\.requestedRole\)&&globalState\.currentUser\.role!=='super_admin'/);
});
