/*
 * P17 — قوائم الأدوار الثلاث لا تُزامَن بالتزام المطوّر.
 *
 * الدور الواحد مكتوبٌ في ثلاثة أمكنة: اتّحادُ `Role` في الأنواع، وجدولُ الصلاحيات في
 * `permissions.ts`، وقائمةُ `ALL_GOVERNANCE_ROLES` في الخادم — وقواعدُ Firestore تذكره
 * رابعًا. وقد وقع هذا فعلًا: مسارُ النبضة عدَّد أدواره يدويًا فسقطت منه خمسة أدوارٍ لها
 * شاشات، فكانت جلساتها تُرفض 403 كلَّ دقيقة ولا تظهر في لوحة المالك أبدًا.
 *
 * فالحارسُ هنا آليّ: إضافةُ دورٍ في مكانٍ ونسيانُه في آخر تُسقط هذا الملف باسم الدور
 * الناقص وبالمكان الذي نسيه — لا «اختبارٌ أحمر» بلا عنوان.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { GOVERNED_ROLES, permissionsFor } from '../src/lib/permissions';
import { ALL_GOVERNANCE_ROLES } from '../server/identity-governance';

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

/** اتّحاد `Role` كما هو منصوصٌ في الأنواع — المصدر الذي يُقاس عليه البقية. */
function roleUnion(): string[] {
  const source = read('src/types/index.ts');
  const block = /export type Role =([\s\S]*?);/.exec(source)?.[1];
  assert.ok(block, 'the Role union must be declared in src/types/index.ts');
  return [...block!.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
}

/** كل اسم دورٍ تذكره قواعد Firestore داخل `roleIs([...])`. */
function rolesNamedInFirestoreRules(): Set<string> {
  const rules = read('firestore.rules');
  const named = new Set<string>();
  for (const match of rules.matchAll(/roleIs\(\[([^\]]*)\]\)/g)) {
    for (const role of match[1].matchAll(/'([a-z_]+)'/g)) named.add(role[1]);
  }
  for (const match of rules.matchAll(/request\.auth\.token\.role == '([a-z_]+)'/g)) named.add(match[1]);
  return named;
}

const UNION = roleUnion();

test('the Role union is the single source and carries no duplicates', () => {
  assert.ok(UNION.length >= 10, `expected a substantial role set, got ${UNION.length}`);
  assert.equal(new Set(UNION).size, UNION.length, 'the Role union repeats a role');
});

test('every role in the union has an explicit permission set — none is silently unprivileged', () => {
  const missing = UNION.filter(role => !GOVERNED_ROLES.includes(role as never));
  assert.deepEqual(missing, [], `these roles exist in the union but have no entry in ROLE_PERMISSIONS: ${missing.join(', ')}`);
  const extra = GOVERNED_ROLES.filter(role => !UNION.includes(role));
  assert.deepEqual(extra, [], `these roles have permissions but are not in the Role union: ${extra.join(', ')}`);
  // «بلا صلاحية» قرارٌ يُكتب، لا سهوٌ: المتسابق مثلًا مصفوفةٌ فارغة منصوصة.
  for (const role of UNION) assert.ok(Array.isArray(permissionsFor(role as never)), role);
});

test('the server governance list is exactly the Role union', () => {
  const server = [...ALL_GOVERNANCE_ROLES] as string[];
  const missing = UNION.filter(role => !server.includes(role));
  const extra = server.filter(role => !UNION.includes(role));
  assert.deepEqual(missing, [], `ALL_GOVERNANCE_ROLES is missing: ${missing.join(', ')} — their sessions would be refused 403 forever`);
  assert.deepEqual(extra, [], `ALL_GOVERNANCE_ROLES names roles that do not exist: ${extra.join(', ')}`);
  assert.equal(new Set(server).size, server.length, 'ALL_GOVERNANCE_ROLES repeats a role');
});

test('firestore.rules never grants a role that does not exist', () => {
  const named = rolesNamedInFirestoreRules();
  assert.ok(named.size > 0, 'the rules must name roles — otherwise this guard proves nothing');
  const unknown = [...named].filter(role => !UNION.includes(role));
  assert.deepEqual(unknown, [],
    `firestore.rules grants roles that are not in the Role union: ${unknown.join(', ')} — a typo here is a permanent silent denial, or worse, a grant nobody can revoke`);
});

test('a new role added to one place and forgotten in another is caught by name', () => {
  /*
   * الحارسُ نفسه يُختبر: لو أُضيف دورٌ إلى الاتّحاد ونُسي في الخادم، وجب أن يسقط الفحص
   * **باسمه**. فيُحاكى النسيان هنا على نسخةٍ من القوائم، لا على الملفات.
   */
  const pretendUnion = [...UNION, 'venue_marshal'];
  const missing = pretendUnion.filter(role => !(ALL_GOVERNANCE_ROLES as string[]).includes(role));
  assert.deepEqual(missing, ['venue_marshal'], 'the drift check must name the forgotten role');

  const pretendServer = [...ALL_GOVERNANCE_ROLES as string[], 'venue_marshal'];
  const extra = pretendServer.filter(role => !UNION.includes(role));
  assert.deepEqual(extra, ['venue_marshal'], 'the drift check must name a role that exists only on the server');
});
