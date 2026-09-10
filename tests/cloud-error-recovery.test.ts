import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { redactStateForLocalSnapshot } from '../src/lib/local-snapshot-privacy';

/*
 * تعافي أعطال المزامنة السحابية.
 *
 * ثلاث علل ظهرت معًا في الإنتاج:
 *  1) الأحفورة: شريط العطل كان يُخزَّن في اللقطة المحلية ويُبعث بعد كل تحميل — فيبقى ظاهرًا
 *     إلى الأبد بعد زوال سببه، ولا شيء يمسحه في صفحةٍ لا تكتب للسحابة.
 *  2) الرجفة: علمُ عطلٍ واحد يمسحه أي نجاح ويعيده أي فشل، فيرتجف الشريط مع كل حفظة.
 *  3) الرمز البائت: بعد مزامنة المطالبات يبقى رمز الجلسة القائمة قديمًا حتى ساعة، فتُرفض
 *     الكتابة رغم صحة الصلاحية على الخادم.
 */

const store = fs.readFileSync('src/lib/store.ts', 'utf8');
const indexHtml = fs.readFileSync('index.html', 'utf8');
const mainTsx = fs.readFileSync('src/main.tsx', 'utf8');

test('persistenceError is stripped from local snapshots (behavior, not grep)', () => {
  const state = { participants: [], activeSession: null, persistenceError: { code: 'CLOUD_PERMISSION_DENIED', message: 'x', at: 'now' } } as never;
  const redacted = redactStateForLocalSnapshot(state) as { persistenceError: unknown };
  assert.equal(redacted.persistenceError, null);
});

test('hydration never resurrects a stored banner', () => {
  const i = store.indexOf('function hydrateSavedState');
  assert.ok(i > -1);
  assert.match(store.slice(i, i + 800), /parsed\.persistenceError\s*=\s*null/);
});

test('cloud failures are tracked per scope and only a resolved scope clears', () => {
  // النجاح يحلّ نطاقه هو، لا يمسح كل شيء.
  assert.match(store, /resolveCloudScope\(collectionName\)/);
  // ولا يُمسح الشريط إلا حين يخلو سجل النطاقات الفاشلة كله.
  const i = store.indexOf('function resolveCloudScope');
  const body = store.slice(i, store.indexOf('function clearCloudError'));
  assert.match(body, /failingCloudScopes\.delete/);
  assert.match(body, /if\(!remaining\)\{globalState\.persistenceError=null/);
  // النجاح العام (clearCloudError) بقي لكنه لم يعد يُنادى من مسار نجاح كتابةٍ واحدة.
  const successClears = store.match(/startsWith\('CLOUD_'\)\)clearCloudError\(\)/g) || [];
  assert.equal(successClears.length, 0);
});

test('a permission denial refreshes the auth token once and retries the write', () => {
  const i = store.indexOf('async function persistScopedDocument');
  const body = store.slice(i, i + 2500);
  assert.match(body, /CLOUD_PERMISSION_DENIED.*refreshAuthTokenOnce/s);
  assert.match(body, /getIdToken\(true\)/);
  // الحارس الزمني يمنع حلقة تجديد.
  assert.match(store, /lastAuthTokenRefreshAt<120_000\)return false/);
});

test('permission-denied banner names the exact document for diagnosis', () => {
  assert.match(store, /لا تسمح برفع \$\{label\} إلى السحابة\. \(\$\{scope\}\)/);
});

test('index.html carries an inline boot watchdog that survives a dead bundle', () => {
  // داخل الغلاف لا داخل الحزمة: يعمل حتى حين لا تعمل الحزمة.
  assert.match(indexHtml, /window\.__MIZAN_BOOTED/);
  assert.match(indexHtml, /sessionStorage\.getItem\(K\)/); // مرة واحدة، لا حلقة إعادة تحميل
  assert.match(indexHtml, /getRegistrations/);
  assert.match(mainTsx, /__MIZAN_BOOTED = true/);
});
