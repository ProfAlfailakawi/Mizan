/*
 * اشتراكُ الجهة هو مدّةُ سريان وثائقها.
 *
 * قرارُ المالك في 19 سبتمبر 2026، بلفظه: «المشغّل أو الجهة مدّتُه سنة إلا إذا احنا
 * جدّدنا له، ومتى يوقف — لمّا احنا نوقف الاشتراك عليه». فكان `legalChainFor` يقرأ
 * `organization.legal` من غير أن ينظر إلى الترخيص أصلًا: جهةٌ انتهى اشتراكُها منذ
 * سنة تبقى وثيقتُها تُعرض على المتسابقين ويُسجَّل في الأثر أنهم وافقوا عليها.
 *
 * وهذه الحرّاس تثبّت الطرفين معًا — لا الإسقاط وحده:
 *
 * ١) وثيقةُ جهةٍ خرج ترخيصُها عن السريان لا تدخل السلسلة.
 * ٢) وإسقاطُها **لا يُلبس أحدًا ثوبَ أحد**: السلسلة تنزل إلى المشغّل، ويُعرض اسمُ
 *    المشغّل هو، و`inherited` تقول صراحةً إنها ليست وثيقةَ الجهة. وهذا أخطرُ ما
 *    يُحرَس هنا — فإسقاطٌ صامتٌ يُبقي اسمَ الجهة على وثيقةِ غيرها أسوأُ من لا شيء.
 * ٣) والمهلة سريان، وانقضاءُ التاريخ يُسقط السريان ولو بقيت الحالةُ مكتوبةً `active`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {SaaSPlatformRepository,licenseInForce,type LicenseRecord} from '../server/saas-platform';
import {resolveLegalDocument,isResolved} from '../src/lib/legal-documents';

const commercialOwner={uid:'platform-owner',role:'super_admin' as const,organizationId:'__platform__'};

const legalFor=(entityName:string)=>({
  entityName,
  documents:{
    terms:{version:'1.0',effectiveDate:'2026-10-01',url:`https://example.invalid/${encodeURIComponent(entityName)}/terms`},
    privacy:{version:'1.0',effectiveDate:'2026-10-01',url:`https://example.invalid/${encodeURIComponent(entityName)}/privacy`},
  },
});

function harness(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-legal-term-'));
  const saas=new SaaSPlatformRepository(path.join(dir,'saas','state.json'));
  const plan=saas.seedInitialPlan(commercialOwner);
  const operator=saas.createOperator(commercialOwner,{name:'المشغّل'});
  saas.adjustCredits(commercialOwner,operator.id,5,'bootstrap');
  const org=saas.createOrganization(commercialOwner,{
    officialName:'الجهة المنظِّمة',shortName:'ORG',organizationType:'charity',country:'KW',
    operatorId:operator.id,planId:plan.id,startsAt:'2026-01-01',expiresAt:'2027-01-01',
  }).organization;
  saas.setOperatorLegal(commercialOwner,operator.id,legalFor('المشغّل'));
  saas.setOrganizationLegal(commercialOwner,org.id,legalFor('الجهة المنظِّمة'));
  return {saas,org,operator,plan,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}

const inForceLicense=(over:Partial<LicenseRecord>={}):LicenseRecord=>({
  id:'L',organizationId:'O',planId:'P',startsAt:'2026-01-01T00:00:00.000Z',expiresAt:'2027-01-01T00:00:00.000Z',
  status:'active',whiteLabelEnabled:false,brandingLevel:'mizan',customDomainEnabled:false,
  createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',...over,
});

const MID_TERM=Date.parse('2026-06-01T00:00:00.000Z');
const AFTER_TERM=Date.parse('2027-06-01T00:00:00.000Z');

test('a live subscription keeps the organization its own publisher',()=>{
  const h=harness();
  try{
    const chain=h.saas.legalChainFor(h.org.id,MID_TERM);
    assert.deepEqual(chain.map(l=>l.level),['organization','operator']);
    const resolved=resolveLegalDocument(chain,'terms');
    assert.ok(isResolved(resolved));
    assert.equal(resolved.publisher,'الجهة المنظِّمة');
    assert.equal(resolved.level,'organization');
    assert.equal(resolved.inherited,false);
  }finally{h.cleanup()}
});

test('an expired subscription drops the organization document — and the operator is named, not impersonated',()=>{
  const h=harness();
  try{
    const chain=h.saas.legalChainFor(h.org.id,AFTER_TERM);
    assert.deepEqual(chain.map(l=>l.level),['operator'],
      'the lapsed organization must not publish a document a participant consents to');
    const resolved=resolveLegalDocument(chain,'terms');
    assert.ok(isResolved(resolved));
    assert.equal(resolved.publisher,'المشغّل',
      'the participant must read the true publisher, never the lapsed organization');
    assert.equal(resolved.level,'operator');
    assert.equal(resolved.inherited,true,'and the trail must say this is not the organization own document');
  }finally{h.cleanup()}
});

test('stopping the subscription stops the document, on the owner own switch',()=>{
  const h=harness();
  try{
    h.saas.updateOrganization(commercialOwner,h.org.id,{licenseStatus:'suspended'});
    assert.deepEqual(h.saas.legalChainFor(h.org.id,MID_TERM).map(l=>l.level),['operator']);
    h.saas.updateOrganization(commercialOwner,h.org.id,{licenseStatus:'active'});
    assert.deepEqual(h.saas.legalChainFor(h.org.id,MID_TERM).map(l=>l.level),['organization','operator'],
      'renewing must restore the organization own document');
  }finally{h.cleanup()}
});

test('a suspended operator publishes nothing either',()=>{
  const h=harness();
  try{
    h.saas.updateOperator(commercialOwner,h.operator.id,{status:'suspended'});
    assert.deepEqual(h.saas.legalChainFor(h.org.id,AFTER_TERM).map(l=>l.level),[],
      'neither level is in force, so the chain is empty and the caller falls to the platform by name');
  }finally{h.cleanup()}
});

test('licenseInForce reads the dates, not only the written status',()=>{
  assert.equal(licenseInForce(undefined,MID_TERM),false,'no license is not a licence');
  assert.equal(licenseInForce(inForceLicense(),MID_TERM),true);
  assert.equal(licenseInForce(inForceLicense(),AFTER_TERM),false,
    'an elapsed expiry ends the term even while the status field still reads active');
  assert.equal(licenseInForce(inForceLicense(),Date.parse('2025-06-01T00:00:00.000Z')),false,
    'a term that has not started has not started');
  for(const status of ['suspended','expired','archived'] as const){
    assert.equal(licenseInForce(inForceLicense({status}),MID_TERM),false,`${status} is not in force`);
  }
  assert.equal(licenseInForce(inForceLicense({status:'grace_period',graceUntil:'2027-02-01T00:00:00.000Z'}),MID_TERM),true,
    'grace is still service, so it is still the organization own document');
  assert.equal(
    licenseInForce(inForceLicense({status:'grace_period',graceUntil:'2027-02-01T00:00:00.000Z'}),Date.parse('2027-01-15T00:00:00.000Z')),
    true,'past expiry but inside grace remains in force');
  assert.equal(
    licenseInForce(inForceLicense({status:'grace_period',graceUntil:'2027-02-01T00:00:00.000Z'}),Date.parse('2027-03-01T00:00:00.000Z')),
    false,'past grace is not');
  assert.equal(licenseInForce(inForceLicense({status:'grace_period'}),AFTER_TERM),false,
    'grace with no graceUntil is not an open-ended grace');
  assert.equal(licenseInForce(inForceLicense({expiresAt:'not-a-date'}),MID_TERM),false,
    'an unparseable term fails closed rather than counting as forever');
});
