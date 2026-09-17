import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  inspectProductionConfig,
  assertProductionConfig,
  formatConfigReport,
  isWeakSecret,
  ProductionConfigError,
} from '../server/production-config-guard';

/*
 * السرُّ القويّ يُولَّد وقت التشغيل ولا يُكتب حرفيًّا في المصدر.
 *
 * كان مكتوبًا حرفيًّا فأمسكه فاحصُ الأسرار (Generic High Entropy Secret) — ومحقٌّ في ذلك:
 * سلسلةٌ عالية العشوائية في المصدر لا يُفرّق فاحصٌ بينها وبين اعتمادٍ حقيقي، ولا ينبغي أن
 * يُفرّق. والتوليد هنا يُبقي الاختبار يقيس المسار القويّ نفسه بلا سلسلةٍ تشبه السرّ.
 */
const strongSecret = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
const prodBase = {
  NODE_ENV: 'production',
  FIREBASE_PROJECT_ID: 'mizan-prod',
  MIZAN_PASS_SIGNING_SECRET: strongSecret,
  MIZAN_CERT_SIGNING_SECRET: strongSecret,
  MIZAN_WEBHOOK_SIGNING_SECRET: strongSecret,
  /*
   * إعدادٌ «كامل» صار يشمل سجلَّ التدقيق الخادمي على مسارٍ دائم. وهو تنبيهٌ لا منع —
   * جهةٌ قد تشغّل بلا سجلٍّ خادمي عن قصد — لكنّ الفحص لا يمرّ صامتًا عليه: الظنُّ أن
   * السجلّ موجود وهو غائبٌ أسوأ من غيابه المعلوم.
   */
  MIZAN_AUDIT_LEDGER_DIR: '/mnt/mizan/audit',
};

test('a complete production config may start with no findings', () => {
  const r = inspectProductionConfig(prodBase);
  assert.equal(r.production, true);
  assert.deepEqual(r.findings, []);
  assert.equal(r.mayStart, true);
  assert.match(formatConfigReport(r), /الإعداد سليم/);
});

test('a client-exposed secret blocks in any environment', () => {
  for (const NODE_ENV of ['production', 'development']) {
    const r = inspectProductionConfig({ ...prodBase, NODE_ENV, VITE_R2_SECRET_ACCESS_KEY: 'abc123' });
    const hit = r.blockers.find(f => f.code === 'CLIENT_EXPOSED_SECRET');
    assert.ok(hit, `blocks in ${NODE_ENV}`);
    assert.equal(hit!.variable, 'VITE_R2_SECRET_ACCESS_KEY');
  }
  // the genuinely public Firebase client key is not a finding
  const ok = inspectProductionConfig({ ...prodBase, VITE_FIREBASE_API_KEY: 'AIzaPublicByDesign' });
  assert.equal(ok.blockers.length, 0);
  // an empty VITE_ secret is not a finding either
  assert.equal(inspectProductionConfig({ ...prodBase, VITE_SOME_SECRET: '' }).blockers.length, 0);
});

test('demo seed data is blocked in production only', () => {
  const prod = inspectProductionConfig({ ...prodBase, MIZAN_ENABLE_DEMO_SEED: 'true' });
  assert.ok(prod.blockers.some(f => f.code === 'DEMO_SEED_ENABLED_IN_PRODUCTION'));
  assert.equal(prod.mayStart, false);
  // in development the demo is legitimate
  const dev = inspectProductionConfig({ NODE_ENV: 'development', MIZAN_ENABLE_DEMO_SEED: 'true' });
  assert.equal(dev.blockers.length, 0);
  assert.equal(dev.mayStart, true);
});

test('production without server-side identity verification is blocked', () => {
  const { FIREBASE_PROJECT_ID: _omit, ...withoutProject } = prodBase;
  const r = inspectProductionConfig(withoutProject);
  assert.ok(r.blockers.some(f => f.code === 'IDENTITY_VERIFICATION_UNCONFIGURED'));
  assert.equal(r.mayStart, false);
});

test('a weak signing secret blocks, while an absent one only warns', () => {
  const weak = inspectProductionConfig({ ...prodBase, MIZAN_CERT_SIGNING_SECRET: 'changeme' });
  assert.ok(weak.blockers.some(f => f.code === 'WEAK_SIGNING_SECRET' && f.variable === 'MIZAN_CERT_SIGNING_SECRET'));

  const { MIZAN_CERT_SIGNING_SECRET: _gone, ...absent } = prodBase;
  const r = inspectProductionConfig(absent);
  assert.equal(r.blockers.length, 0, 'absence is not a blocker — the feature may be unused');
  assert.ok(r.warnings.some(f => f.code === 'SIGNING_SECRET_ABSENT'));
  assert.equal(r.mayStart, true);
});

test('weak-secret detection covers placeholders, short values and repeats', () => {
  for (const bad of ['changeme', 'CHANGEME', 'secret', 'placeholder', 'short', 'aaaaaaaaaaaaaaaaaaaa'.slice(0, 15), 'aaaaaaaaaaaaaaaaaaaaaa']) {
    assert.equal(isWeakSecret(bad), true, `${bad} is weak`);
  }
  assert.equal(isWeakSecret(strongSecret), false);
  assert.equal(isWeakSecret(''), false, 'absence handled separately, not as weakness');
});

test('assertProductionConfig fails fast in production and never in development', () => {
  assert.throws(() => assertProductionConfig({ ...prodBase, MIZAN_ENABLE_DEMO_SEED: '1' }),
    (e: unknown) => e instanceof ProductionConfigError && e.code === 'PRODUCTION_CONFIG_INVALID');
  assert.doesNotThrow(() => assertProductionConfig(prodBase));
  assert.doesNotThrow(() => assertProductionConfig({ NODE_ENV: 'development', MIZAN_ENABLE_DEMO_SEED: '1' }));
});

test('the operator report never prints secret values', () => {
  const r = inspectProductionConfig({ ...prodBase, MIZAN_CERT_SIGNING_SECRET: 'changeme', VITE_R2_SECRET_ACCESS_KEY: 'super-secret-value' });
  const report = formatConfigReport(r);
  assert.doesNotMatch(report, /super-secret-value/);
  assert.doesNotMatch(report, /changeme/);
  assert.match(report, /الإقلاع ممنوع/);
});

/*
 * جملةٌ واحدة لا نسختان: نصُّ الملاحظة يُقرأ من فهرس الأعطال ولا يُكتب في الحارس.
 * كان مكتوبًا في الموضعين، وهما يفترقان عند أول تعديل.
 */
test('finding sentences come from the catalog, not a second copy in the guard', async () => {
  const { configFindingMessage } = await import('../server/production-config-guard');
  const { errorMessageArabic } = await import('../src/lib/error-catalog');

  const finding = { severity: 'BLOCKER' as const, code: 'CLIENT_EXPOSED_SECRET', variable: 'VITE_R2_SECRET_ACCESS_KEY' };
  // الجملة هي جملةُ الفهرس بعينها، ومعها اسمُ المتغيّر لأنه ما يبحث عنه المشغّل أولًا.
  assert.ok(configFindingMessage(finding).startsWith(errorMessageArabic('CLIENT_EXPOSED_SECRET')));
  assert.ok(configFindingMessage(finding).includes('VITE_R2_SECRET_ACCESS_KEY'));
  // وبلا متغيّرٍ تبقى جملةَ الفهرس وحدها.
  assert.equal(configFindingMessage({ severity: 'BLOCKER', code: 'PRODUCTION_CONFIG_INVALID' }), errorMessageArabic('PRODUCTION_CONFIG_INVALID'));

  // والحارس لا يحمل نصًّا عربيًّا مكتوبًا للملاحظات (الفهرس هو المصدر).
  const fs = await import('node:fs');
  const path = await import('node:path');
  const guard = fs.readFileSync(path.join(process.cwd(), 'server/production-config-guard.ts'), 'utf8');
  assert.doesNotMatch(guard, /messageArabic\s*:/, 'no inline finding message survives in the guard');
});
