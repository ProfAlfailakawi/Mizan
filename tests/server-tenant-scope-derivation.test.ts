import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/*
 * القاعدةُ التي تحمي العزلَ في مساري SaaS والجهة: معرّفُ الجهة يُشتقّ من الهويةِ
 * المتحقَّقة، لا من الطلب. والاستثناءُ الوحيد مالكُ المنصة (`super_admin`)، فله أن
 * يطلب جهةً باسمها.
 *
 * وهي مطبَّقةٌ اليوم في عشر نقاط بصيغةٍ واحدة:
 *   organizationId = actor.role==='super_admin' && req.body?.organizationId ? … : actor.organizationId
 *
 * وسطرٌ واحد يسقط منه شرطُ الدور يصير ثغرةَ عزلٍ كاملة: يكفي أن يُرسل مديرُ جهةٍ
 * معرّفَ جهةٍ أخرى في الجسم. وحاجزُ `orgScope` في الطبقة الأدنى يمسك أكثرها —
 * لكنه لا يمسك ما يمرّ بدالةٍ لا تستدعيه، ولا يُعتمد عليه وحده في عزلٍ إلزامي.
 *
 * فيُقرأ المصدرُ نفسه: كلُّ اشتقاقٍ لمعرّف الجهة من الطلب يجب أن يكون إما مشروطًا
 * بـ`super_admin`، أو مذكورًا هنا باسمِ حاجزِه البديل. فلا يُضاف اشتقاقٌ ثالث بلا
 * حاجز، ولا يُنزَع حاجزٌ قائم، بلا سقوط.
 */

const server = fs.readFileSync('server.ts', 'utf8');

/*
 * الاشتقاقاتُ التي لا تُشترط فيها صفةُ المالك، ولكلٍّ حاجزُه المسمّى. ويُتحقَّق أن
 * الحاجزَ ما زال في المصدر، فلا يكفي أن يُذكر هنا.
 */
const justified: { derivation: RegExp; why: string; guard: RegExp }[] = [
  {
    // شعارُ الجهة: المعرّف من المسار، والكتابة تُفحَص على الفاعل.
    derivation: /organizationId=String\(req\.params\.organizationId\|\|''/,
    why: 'brand asset scope is checked against the actor by brandWriteAllowed',
    guard: /if\(!brandWriteAllowed\(actor,organizationId,competitionId\)\)return res\.status\(403\)/,
  },
  {
    // دعوةُ هوية: الجهة هي هدفُ الدعوة، ويُمنع تجاوزُ المشغّل صراحةً.
    derivation: /organizationId=req\.body\?\.organizationId\?String\(req\.body\.organizationId/,
    why: 'the invited organization is the target, and cross-operator issuance is refused explicitly',
    guard: /organizationBelongsToOperator\(organizationId,actor\.operatorId\)\)\)throw new Error\('CROSS_OPERATOR_ORGANIZATION_BLOCKED'\)/,
  },
  {
    // مرحّلُ الحافة: مفتاحُ المنصة لا مفتاحُ جهة، فسلطتُه سلطةُ المنصة بحكم التصميم.
    derivation: /organizationId=String\(req\.headers\['x-mizan-org-id'\]\|\|''/,
    why: 'the enterprise edge relay authenticates with the platform key, not a tenant credential',
    guard: /app\.(?:get|post)\('\/api\/enterprise\/edge\/mesh\/:competitionId\/events',requireEnterpriseKey/,
  },
];

const requestDerivations = (server.match(/organizationId=[^;,)]{0,160}/g) || [])
  .filter(x => /req\.(body|query|params|headers)/.test(x));

test('every request-derived organization id is owner-gated or has a named alternative guard', () => {
  assert.ok(requestDerivations.length >= 14, `expected the known derivations, found ${requestDerivations.length}`);
  for (const derivation of requestDerivations) {
    if (derivation.includes("super_admin")) continue;
    const excuse = justified.find(j => j.derivation.test(derivation));
    assert.ok(excuse,
      `an organization id is taken from the request without an owner check and without a listed guard: ${derivation}`);
    assert.match(server, excuse!.guard,
      `the guard that justifies this derivation is gone (${excuse!.why}): ${derivation}`);
  }
});

test('the SaaS and tenant routes derive the organization from the identity', () => {
  /*
   * عشرُ نقاطٍ بالصيغة المشروطة. والعددُ مقيسٌ لا محفور: لو هبط، فإما نُزع شرطُ
   * الدور من إحداها أو صار الاشتقاق بصيغةٍ أخرى — وكلاهما يستحقّ النظر.
   */
  const ownerGated = requestDerivations.filter(x => x.includes("super_admin"));
  assert.ok(ownerGated.length >= 10,
    `expected at least ten owner-gated derivations, found ${ownerGated.length}`);
  for (const derivation of ownerGated) {
    assert.match(derivation, /actor\.role==='super_admin'/,
      `the owner check must be on the actor's verified role, not on request data: ${derivation}`);
  }
});

test('the fallback is the actor own organization, never an empty scope', () => {
  /*
   * الصيغةُ المشروطة تنتهي إلى `actor.organizationId` في مسارات القراءة والتعديل.
   * ولو صارت تنتهي إلى `''` لجهةٍ عادية لصار النطاقُ فارغًا بدل أن يكون نطاقَها.
   */
  const brandRead = /const orgId=isSuper&&req\.query\?\.orgId\?String\(req\.query\.orgId\):actor\?\.organizationId/;
  assert.match(server, brandRead, 'the tenant brand read falls back to the actor organization');
  assert.match(server, /const orgId = isSuper && req\.body\?\.orgId \? String\(req\.body\.orgId\) : actor\?\.organizationId/,
    'the tenant brand write falls back to the actor organization');
  /* ولا تضبط الجهةُ نطاقَها بنفسها: حقولُ النطاق تُحذف لغير المالك. */
  assert.match(server, /if \(!isSuper\) \{ delete \(patch as any\)\.subdomain; delete \(patch as any\)\.customDomains; \}/,
    'domain fields stay owner-only on the tenant brand patch');
});
