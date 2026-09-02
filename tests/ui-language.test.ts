import test from 'node:test';
import assert from 'node:assert/strict';
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
