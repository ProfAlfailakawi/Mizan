import test from 'node:test';
import assert from 'node:assert/strict';
import { isDemoIsolatedPublicRead } from '../src/lib/demo-transport';
import { isDemoPassthrough } from '../server/demo-sandbox';

/*
 * العميلُ التجريبيّ يجيب محليًّا بـ403 عن قراءاتٍ عامةٍ يرفضها جدارُ الخادم على الصندوق.
 * والشرط: لا يُحجب محليًّا ما كان الخادمُ سيمرّره — وإلا صار العميلُ أشدَّ من الخادم بصمت.
 */
const SHELL_READS = ['/api/public/brand', '/api/public/tenant', '/api/public/competitions/comp-dubai-2027', '/api/public/competitions/latest'];

test('the demo client answers the shell public reads locally', () => {
  for (const p of SHELL_READS) assert.equal(isDemoIsolatedPublicRead('GET', p), true, p);
});

test('every locally-answered read is one the server gate rejects', () => {
  for (const p of SHELL_READS) assert.equal(isDemoPassthrough('GET', p), false, p);
});

test('writes, nested routes and passthrough assets still reach the server', () => {
  assert.equal(isDemoIsolatedPublicRead('POST', '/api/public/competitions/x/register'), false);
  assert.equal(isDemoIsolatedPublicRead('GET', '/api/public/competitions/x/registration'), false);
  assert.equal(isDemoIsolatedPublicRead('GET', '/api/public/kfgqpc/manifest.json'), false);
  assert.equal(isDemoIsolatedPublicRead('GET', '/api/health'), false);
});
