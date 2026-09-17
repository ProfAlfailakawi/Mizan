import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { GOVERNED_ROLES } from '../src/lib/permissions';

/*
 * أرقامُ صفحة البيع تُشتقّ من الشيفرة، ولا تُكتب باليد.
 *
 * كان الموقع يعلن «١٤ دورًا بصلاحياتٍ مفصولة» رقمًا محفورًا، وصارت الأدوار ثمانية عشر
 * فبقي الرقم يقول ما لم يبقَ صحيحًا. ورقمٌ في صفحةٍ تجارية لا يحرسه شيء يهرم وحده: لا
 * يُسقط اختبارًا، ولا يظهر في مراجعة، ويُقرأ سنتين وهو خطأ.
 *
 * والأدقُّ من تصحيحه أن يُنزَع من اليد: يُشتقّ من ROLE_PERMISSIONS فيتبع الشيفرة وحده.
 * وهذا الاختبار يحرس الاشتقاق لا القيمة — فلا يحتاج تحديثًا عند إضافة دور.
 */

const marketing = fs.readFileSync(path.join(process.cwd(), 'src/components/marketing/MarketingSite.tsx'), 'utf8');

test('the role count on the sales page is derived from the code, not hardcoded', () => {
  // مشتقٌّ: يُقرأ من GOVERNED_ROLES.
  assert.match(marketing, /value=\{String\(GOVERNED_ROLES\.length\)\}/,
    'the roles stat must derive from GOVERNED_ROLES');
  // ولا يبقى رقمٌ محفور لهذا الوسم.
  assert.doesNotMatch(marketing, /value="\d+"\s+label="دورًا بصلاحياتٍ مفصولة"/,
    'no hardcoded number may return for the roles stat');
});

test('the governed-role list is real and non-trivial', () => {
  assert.ok(GOVERNED_ROLES.length >= 10, `expected a substantial role set, got ${GOVERNED_ROLES.length}`);
  assert.equal(new Set(GOVERNED_ROLES).size, GOVERNED_ROLES.length, 'no duplicate roles');
  for (const role of ['super_admin', 'judge', 'head_judge', 'auditor']) {
    assert.ok(GOVERNED_ROLES.includes(role as (typeof GOVERNED_ROLES)[number]), `${role} is governed`);
  }
});

/*
 * حدُّ الادّعاء: الموقع يقول إسنادَ المصدر ولا يقول إن جهةً خارجية «اعتمدت ميزان».
 * وهذان أمران يُخلط بينهما فيصير الإدراجُ شهادةً لم يمنحها أحد.
 */
test('the sales page claims no third-party endorsement of Mizan', () => {
  // «معتمد من <جهة>» ممنوع: الاعتماد سلطةُ لجنة ميزان، والإسنادُ يذكر الناشر فقط.
  assert.doesNotMatch(marketing, /معتمد(ة)?\s+من\s+(مجمع|موقع|جهة)/,
    'no page may claim an external body approved Mizan');
  assert.doesNotMatch(marketing, /(certified|endorsed|approved)\s+by\s+(King Fahd|KFGQPC)/i);
});

test('the sales page makes no unprovable superlative or compliance claim', () => {
  const forbidden: [RegExp, string][] = [
    [/أول\s+نظام/, 'world-first claim'],
    [/الأول\s+عالميًا/, 'world-first claim'],
    [/الأكثر\s+دقّ?ة/, 'most-accurate claim'],
    [/\bSOC\s?2\b/i, 'SOC 2 compliance claim'],
    [/\bISO\s?\d{4,}/i, 'ISO certification claim'],
    [/\bGDPR\s+(compliant|certified)\b/i, 'GDPR compliance claim'],
    [/\bHIPAA\b/i, 'HIPAA claim'],
  ];
  for (const [pattern, why] of forbidden) {
    assert.doesNotMatch(marketing, pattern, `sales page must not make a ${why}`);
  }
});
