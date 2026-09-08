/*
 * سلسلة الثقة المعتمدة في ميزان:
 * مالك المنصة يعتمد مدير الجهة مرة واحدة، ثم يدير مدير الجهة فريقه ضمن حدود جهته.
 * الموافقة المستقلة الثانية محفوظة للقرارات الحرجة داخل المسابقة، لا لإنشاء حساب موظف.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

test('owner delegates the tenant once and tenant admins provision scoped staff directly', () => {
  const server = fs.readFileSync('server/identity-governance.ts', 'utf8');

  // إنشاء دعوة الموظف أصبح READY مباشرة من صاحب الصلاحية، ولا يعتمد على SENSITIVE/second-person.
  assert.match(server, /status:'READY'/);
  assert.doesNotMatch(server, /SECOND_PERSON_REQUIRED/);
  assert.doesNotMatch(server, /SENSITIVE\.has\(input\.requestedRole\)/);

  // تبقى سلسلة التفويض محددة صراحة: المالك -> مدير جهة، ومدير الجهة -> فريق الجهة.
  assert.match(server, /super_admin:\['org_admin','support_agent'\]/);
  assert.match(server, /org_admin:\['comp_admin','head_judge','judge','ops_manager'/);
  assert.match(server, /CROSS_TENANT_GRANT_BLOCKED/);

  // المسار المحلي/التجريبي يطابق سياسة الخادم: لا موافقة ثانية على منح الحسابات الروتينية.
  const integrity = fs.readFileSync('src/lib/operational-integrity.ts', 'utf8');
  assert.match(integrity, /roleGrantRequiresDualApproval\(_role:Role\)\{return false\}/);
});
