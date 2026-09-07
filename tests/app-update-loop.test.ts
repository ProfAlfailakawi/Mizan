/*
 * حلقة إعادة التحميل التي ظهرت في الإنتاج، مسمَّرة هنا حتى لا تعود.
 *
 * الزناد كان سكربتًا يحقنه الوسيط وتحجبه سياسة الأمان: يفشل عند كل إقلاع، فتعدّه
 * آلية التعافي غلافًا قديمًا وتعيد التحميل، والعلمُ الحارس يُمسح عند كل إقلاع ناجح —
 * فلا يوقف شيئًا. هذه الاختبارات تقرأ المصدر وتثبت الخصائص التي تقفل الحلقة.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const appUpdate = fs.readFileSync('src/lib/app-update.ts', 'utf8');
const shellRecovery = fs.readFileSync('src/lib/stale-shell-recovery.ts', 'utf8');

test('a failing script tag triggers recovery only for our own hashed assets', () => {
  for (const source of [appUpdate, shellRecovery]) {
    const listener = source.slice(source.indexOf("addEventListener('error'"));
    const guarded = /isOwnAsset\(/.test(listener) || /origin === window\.location\.origin/.test(listener);
    // كلا المعالجَين يفحص الأصل قبل أي تعافٍ — سكربت محقون من وسيط لا يعيد تحميل شيئًا.
    assert.equal(guarded, true);
  }
  // والفاحص نفسه يشترط نطاقنا ومسار الحزم المبصومة.
  assert.match(appUpdate, /origin === window\.location\.origin && parsed\.pathname\.startsWith\('\/assets\/'\)/);
  assert.match(shellRecovery, /origin === window\.location\.origin && parsed\.pathname\.startsWith\('\/assets\/'\)/);
});

test('a build the hard refresh failed to reach is not retried before its cooldown', () => {
  // بدون هذا السجل كانت المنارة تفحص بعد الإقلاع مباشرة فتجد البصمة نفسها وتعيد الدورة.
  assert.match(appUpdate, /GAVE_UP_KEY/);
  const beacon = appUpdate.slice(appUpdate.indexOf('async function checkForUpdate'));
  assert.match(beacon, /GAVE_UP_KEY/);
  assert.match(beacon, /GAVE_UP_COOLDOWN_MS/);
});

test('reaching the target build clears the gave-up record so future updates flow', () => {
  const reconcile = appUpdate.slice(appUpdate.indexOf('function reconcileAfterReload'));
  const success = reconcile.slice(0, reconcile.indexOf('if (readLocal(HARD_KEY))'));
  assert.match(success, /dropLocal\(GAVE_UP_KEY\)/);
});

test('the CSP allows the proxy-injected analytics script so it never errors at all', () => {
  const server = fs.readFileSync('server.ts', 'utf8');
  const csp = server.slice(server.indexOf('Content-Security-Policy'));
  assert.match(csp, /static\.cloudflareinsights\.com/);
});
