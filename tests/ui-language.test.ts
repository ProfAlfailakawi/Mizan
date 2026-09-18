import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {capabilityLabel,federationClaimLabel,featureLabel,signatureAssuranceLabel,uiToken} from '../src/lib/ui-language';

test('Arabic presentation layer hides raw operational codes',()=>{
 assert.equal(uiToken('CERTIFIED',true),'معتمد علميًا');
 assert.equal(uiToken('production_server_escrow',true),'حجز خادمي آمن للسؤال');
 assert.equal(uiToken('not_required',true),'غير مطلوب');
 assert.equal(federationClaimLabel('identity_verified',true),'الهوية موثقة');
 assert.equal(featureLabel('shadow_mode',true),'التحقق الصامت');
 assert.equal(capabilityLabel('madd_duration',true),'مدة المد');
 assert.match(signatureAssuranceLabel('development://abc',true),/تطويري/);
});

/*
 * كل رمزٍ يُعرض في شاشةٍ عربية له عربيّته — والسحب من المصدر لا من الذاكرة.
 *
 * ظهر `appeals` خامًا في تبويب «إعادة المحاكاة» لأن `uiToken` تُرجع المفتاح كما هو حين لا
 * تعرف له ترجمة. وهو تصرّفٌ صحيح (ألّا يُخفى ما لا يُعرف)، لكنه يعني أنّ كل رمزٍ جديد
 * يُضاف إلى المخزن يتسرّب إنجليزيًّا إلى الشاشة بصمت. فالحارس يقرأ رموز المخزن نفسها
 * لا قائمةً مكتوبة هنا: تيّارٌ جديد في `store.ts` بلا عربيّة يُسقط هذا الاختبار يوم يُكتب.
 */
test('every flight-recorder stream has an Arabic label, read from the store itself', () => {
  const store = fs.readFileSync('src/lib/store.ts', 'utf8');
  const streams = [...new Set([...store.matchAll(/stream:'([a-z_]+)'/g)].map(m => m[1]))];

  assert.ok(streams.length >= 5, 'the sweep actually found the streams');
  for (const stream of streams) {
    const label = uiToken(stream, true);
    assert.notEqual(label, stream, `the stream "${stream}" is shown raw in an Arabic screen`);
    assert.doesNotMatch(label, /[A-Za-z]/, `the label for "${stream}" must carry no Latin letters`);
  }
});
