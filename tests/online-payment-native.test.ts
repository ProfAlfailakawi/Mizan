import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onlinePaymentOffered } from '../src/lib/onlinePaymentOffered';

test('native iOS never offers online payment; browser follows gateway config as before', () => {
  assert.equal(onlinePaymentOffered(true, true), false);
  assert.equal(onlinePaymentOffered(false, true), false);
  assert.equal(onlinePaymentOffered(true, false), true);
  assert.equal(onlinePaymentOffered(false, false), false);
});

test('SaaSWorkspace gates the button and handler; manual payment and browser checkout code stay', () => {
  const src = fs.readFileSync('src/components/admin/SaaSWorkspace.tsx', 'utf8');
  assert.match(src, /const onlineOk=onlinePaymentOffered\(!!gateway\?\.configured,isAppleNativeShell\(\)\)/);
  assert.match(src, /\{onlineOk&&<Button size="sm"/);
  assert.match(src, /checkout`;if\(!onlineOk\)return;/);
  assert.match(src, /window\.open\('','_blank','noopener'\)/);
  assert.match(src, /method:'manual'/);
  assert.doesNotMatch(src, /\{gateway\?\.configured&&<Button/);
});
