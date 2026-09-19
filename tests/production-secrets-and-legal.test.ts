/*
 * إعدادات الإنتاج التي لا يجوز أن تختفي بصمت.
 *
 * سجلُّ الشهادات مسارٌ دائم وقد ضُبط في النشر. أمّا سرّا التوقيع فلا يجوز ربطهما في
 * cloudbuild قبل أن يُنشئهما المالك في Secret Manager، لأن gcloud سيفشل النشر كله.
 * وفي المقابل لا يجوز اعتبار غيابهما مجرد warning عند الحكم على الجاهزية التجارية:
 *
 *   · `MIZAN_PASS_SIGNING_SECRET` ⇒ بطاقات الدخول وQuestion Escrow غير متاحين.
 *   · `MIZAN_CERT_SIGNING_SECRET` ⇒ التحقّق الموقّع من الشهادة غير متاح.
 *
 * لذلك تبقى الخدمة قادرةً على الإقلاع، لكن preflight يرفض وصفها جاهزة للإطلاق حتى
 * يصبح السرّان موجودين ومربوطين.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CLOUDBUILD = read('cloudbuild.yaml');

const releaseEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  VITE_REQUIRE_AUTH: 'true',
  VITE_FIREBASE_API_KEY: 'public-firebase-web-key-for-test',
  VITE_FIREBASE_PROJECT_ID: 'mizan-test',
  MIZAN_LEGAL_ENTITY_NAME: 'Test Legal Entity',
  MIZAN_LEGAL_TERMS_URL: 'https://example.invalid/terms',
  MIZAN_LEGAL_TERMS_VERSION: '1.0',
  MIZAN_LEGAL_TERMS_EFFECTIVE: '2026-10-01',
  MIZAN_LEGAL_PRIVACY_URL: 'https://example.invalid/privacy',
  MIZAN_LEGAL_PRIVACY_VERSION: '1.0',
  MIZAN_LEGAL_PRIVACY_EFFECTIVE: '2026-10-01',
  MIZAN_CERTIFICATE_REGISTRY_DIR: '/tmp/mizan-certificates-test',
  MIZAN_SAAS_DATA_DIR: '/tmp/mizan-saas-test',
});

test('the certificate registry has a durable directory in production', () => {
  assert.match(CLOUDBUILD, /MIZAN_CERTIFICATE_REGISTRY_DIR=\/mnt\/authority\/certificates/,
    'without it certificateRegistryFromEnv() returns null and publishing a certificate is refused');
  assert.match(CLOUDBUILD, /MIZAN_INTEGRITY_AUTHORITY_DIR=\/mnt\/authority/,
    'it must sit on the mounted authority volume, not on ephemeral container disk');
});

test('the two signing secrets are not wired before they exist', () => {
  /*
   * هذا الحارس يسقط عمدًا يوم ربط السرّين. عندها يكون المطلوب: تأكيد وجودهما في Secret
   * Manager ثم حذف هذا الاختبار بالاسم، لا الالتفاف عليه. حتى ذلك الحين يمنع commit
   * يبدو مكتملاً لكنه يجعل كل deploy يفشل على secret غير موجود.
   */
  const secretsLine = CLOUDBUILD.split('\n').find(l => l.includes('R2_ACCESS_KEY_ID=')) || '';
  assert.ok(secretsLine, 'the --update-secrets line must exist');
  const wired = ['MIZAN_PASS_SIGNING_SECRET', 'MIZAN_CERT_SIGNING_SECRET'].filter(n => secretsLine.includes(n));
  assert.deepEqual(wired, [],
    'these are wired — so they must now exist in Secret Manager; confirm, then delete this guard by name');
});

test('commercial preflight fails closed when either signing secret is absent', () => {
  const env = releaseEnv();
  delete env.MIZAN_PASS_SIGNING_SECRET;
  delete env.MIZAN_CERT_SIGNING_SECRET;
  const result = spawnSync(process.execPath, ['scripts/go-live-preflight.mjs'], { cwd: ROOT, env, encoding: 'utf8' });
  assert.notEqual(result.status, 0, 'commercial preflight must refuse launch without signing secrets');
  assert.match(result.stdout, /MIZAN_PASS_SIGNING_SECRET غير مضبوط/);
  assert.match(result.stdout, /MIZAN_CERT_SIGNING_SECRET غير مضبوط/);
  assert.match(result.stdout, /Question Escrow/);
});

test('commercial preflight accepts signing configuration when both secrets are present', () => {
  const env = releaseEnv();
  env.MIZAN_PASS_SIGNING_SECRET = 'test-only-pass-signing-secret-32-bytes-minimum';
  env.MIZAN_CERT_SIGNING_SECRET = 'test-only-cert-signing-secret-32-bytes-minimum';
  const result = spawnSync(process.execPath, ['scripts/go-live-preflight.mjs'], { cwd: ROOT, env, encoding: 'utf8' });
  assert.equal(result.status, 0, `preflight should pass this fully supplied test environment:\n${result.stdout}\n${result.stderr}`);
});

test('the runbook says which order, and why the order matters', () => {
  const book = read('docs/SIGNING-SECRETS.md');
  assert.match(book, /gcloud secrets create MIZAN_PASS_SIGNING_SECRET/, 'it must give the exact command');
  assert.match(book, /secretmanager\.secretAccessor/, 'and the IAM grant the runtime needs');
  assert.match(book, /ولا يُدفع هذا السطر قبل وجود السرّين/, 'and state the ordering constraint plainly');
  assert.equal(/=\s*['"][A-Za-z0-9+\/]{24,}={0,2}['"]/.test(book), false,
    'no literal secret-shaped value may appear in a committed file');
});

test('both legal drafts exist, and neither pretends to be final', () => {
  for (const file of ['docs/legal/TERMS-AR.md', 'docs/legal/PRIVACY-AR.md']) {
    const text = read(file);
    assert.match(text, /مسوّدة — لا تُنشر قبل مراجعة محامٍ/, `${file} must not read as a published document`);
    assert.ok(text.includes('⟦'), `${file} must keep the owner's blanks visible rather than inventing them`);
  }
  const privacy = read('docs/legal/PRIVACY-AR.md');
  const config = read('src/lib/competition-config.ts');
  assert.match(config, /audioRetentionDays:\s*90/, 'the measured default');
  assert.match(config, /documentRetentionDays:\s*365/, 'and the other one');
  assert.ok(privacy.includes('٩٠') && privacy.includes('٣٦٥'),
    'the policy must carry the same numbers the product actually applies');
});

/*
 * سببُ وجود هذا الاختبار: الوثيقتان كانتا تحملان «شركة سكاي جيت» — اسمًا مختصرًا لا
 * يطابق ما في شهادة السجلّ التجاريّ. ووثيقةٌ يُحتجّ بها باسمٍ مختصر، أو وثيقتان
 * باسمين مختلفين، تُفسدان أثرَ الموافقة: المتسابق وقّع على وثيقة ناشرُها غيرُ محدَّد
 * بدقّة. فيُشترط أن تحملا الاسمَ نفسَه ورقمَ السجلّ نفسَه وبريدَ تواصلٍ حقيقيًّا —
 * وأن يكون الاسمُ الذي يُضبط في `MIZAN_LEGAL_ENTITY_NAME` هو ذاتَه لا مختصرَه.
 */
test('both drafts and the publishing guide name one identical legal entity', () => {
  const ENTITY = 'شركة سكاي جيت للإستشارات التربوية';
  const REGISTRATION = '544482';
  const EMAIL = 'info@skygateeducation.com';
  for (const file of ['docs/legal/TERMS-AR.md', 'docs/legal/PRIVACY-AR.md']) {
    const text = read(file);
    assert.ok(text.includes(ENTITY), `${file} must carry the full registered name, not a short form`);
    assert.ok(text.includes(REGISTRATION), `${file} must carry the commercial registration number`);
    assert.ok(text.includes(EMAIL), `${file} must give a contact channel the reader can actually use`);
    assert.equal(/⟦[^⟧]*(بريد|هاتف|الاسم القانون)[^⟧]*⟧/.test(text), false,
      `${file} must not still show a blank for a detail the owner has supplied`);
  }
  assert.ok(read('docs/legal/README.md').includes(`MIZAN_LEGAL_ENTITY_NAME="${ENTITY}"`),
    'the value the owner is told to set must be the same name the documents carry');
});

test('the publishing guide names all seven variables preflight blocks on', () => {
  const guide = read('docs/legal/README.md');
  for (const name of [
    'MIZAN_LEGAL_ENTITY_NAME',
    'MIZAN_LEGAL_TERMS_URL', 'MIZAN_LEGAL_TERMS_VERSION', 'MIZAN_LEGAL_TERMS_EFFECTIVE',
    'MIZAN_LEGAL_PRIVACY_URL', 'MIZAN_LEGAL_PRIVACY_VERSION', 'MIZAN_LEGAL_PRIVACY_EFFECTIVE',
  ]) {
    assert.ok(guide.includes(name), `${name} is required for publication and must be documented`);
  }
  assert.match(guide, /النقصُ الجزئيّ ليس نشرًا/, 'partial configuration must be called out');
});
