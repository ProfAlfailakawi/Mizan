import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onlinePaymentOffered } from '../src/lib/onlinePaymentOffered';
import { isAppleNativeShell } from '../src/lib/appleNativeShell';

const src = fs.readFileSync('src/components/public/JourneyAccess.tsx', 'utf8');
const panel = src.slice(src.indexOf('const RegistrationFeePanel'), src.indexOf('const RegistrationEditPanel'));

const withCapacitor = (platform: string | null, fn: () => void) => {
  const g = globalThis as any; const had = 'window' in g; const prev = g.window;
  g.window = platform ? { Capacitor: { isNativePlatform: () => true, getPlatform: () => platform } } : {};
  try { fn(); } finally { if (had) g.window = prev; else delete g.window; }
};

test('registration fee: iOS app never offers the gateway; browser keeps it', () => {
  withCapacitor('ios', () => assert.equal(onlinePaymentOffered(true, isAppleNativeShell()), false));
  withCapacitor(null, () => assert.equal(onlinePaymentOffered(true, isAppleNativeShell()), true));
  withCapacitor('android', () => assert.equal(onlinePaymentOffered(true, isAppleNativeShell()), true));
});

test('RegistrationFeePanel gates button + handler on onlineOk and shows a neutral notice in iOS', () => {
  assert.match(panel, /const native = isAppleNativeShell\(\);/);
  assert.match(panel, /const onlineOk = onlinePaymentOffered\(payment\.online\.available, native\);/);
  assert.match(panel, /const pay = async \(\) => \{\n\s+if \(!onlineOk\) return;/);
  assert.match(panel, /payment\.status === 'pending' && native && <p[^>]*>\{NATIVE_FEE_NOTICE\}/);
  assert.match(panel, /payment\.status === 'pending' && !native && \(onlineOk/);
  assert.match(panel, /!native && returned === 'failed'/);
  // browser path unchanged: still redirects to the gateway page
  assert.match(panel, /window\.location\.assign\(body\.paymentUrl\)/);
});

test('native notice is neutral: no steering to pay elsewhere', () => {
  const m = /export const NATIVE_FEE_NOTICE = '([^']+)'/.exec(src);
  assert.ok(m);
  assert.equal(m![1], 'رسوم التسجيل تُرتَّب مع الجهة المنظِّمة للمسابقة.');
  assert.doesNotMatch(m![1], /ادفع|الموقع|رابط|متصفح|خارج|بوابة|https?:/);
});
