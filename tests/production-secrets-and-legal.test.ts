/*
 * ما يُقلع ناقصًا ولا يشكو.
 *
 * ثلاثةُ إعداداتٍ غائبةٌ عن كلّ نشرة، وكلُّها تُصنَّف تنبيهًا لا مانعًا — فتُقلع الخدمةُ
 * وتعمل، ثم تردّ `503` عند أوّل استعمال:
 *
 *   · `MIZAN_PASS_SIGNING_SECRET` ⇒ البطاقات، و**حفظُ الأسئلة** مُطفأ.
 *   · `MIZAN_CERT_SIGNING_SECRET` ⇒ التحقّق من الشهادة.
 *   · `MIZAN_CERTIFICATE_REGISTRY_DIR` ⇒ سجلُّ الشهادات `null`.
 *
 * والثالثُ مسارٌ لا سرّ، فضُبط. والأوّلان سرّان يُنشئهما المالك — ولا يُربطان قبل
 * وجودهما، فالنشرُ كلُّه يفشل على سرٍّ غير موجود.
 *
 * وهذه الحرّاس تُثبّت ثلاثة أشياء: أن المسار مضبوط، وأن السرّين **لم** يُربطا بعد،
 * وأن الوثيقتين القانونيتين موجودتان بمواضع الملء فيهما ظاهرة.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CLOUDBUILD = read('cloudbuild.yaml');

test('the certificate registry has a durable directory in production', () => {
  assert.match(CLOUDBUILD, /MIZAN_CERTIFICATE_REGISTRY_DIR=\/mnt\/authority\/certificates/,
    'without it certificateRegistryFromEnv() returns null and publishing a certificate is refused');
  // وعلى الوحدة الدائمة نفسها التي تحمل سلطة النزاهة — لا على قرصٍ يزول مع النسخة.
  assert.match(CLOUDBUILD, /MIZAN_INTEGRITY_AUTHORITY_DIR=\/mnt\/authority/,
    'it must sit on the mounted authority volume, not on ephemeral container disk');
});

test('the two signing secrets are not wired before they exist', () => {
  /*
   * حارسٌ يمنع خطأً محدَّدًا: ربطُ سرٍّ لم يُنشأ بعد يُفشل `gcloud run deploy` كلَّه،
   * فيسقط النشر — بما لا علاقة له بالشهادات. فالترتيب: إنشاءٌ ثم ربط.
   *
   * ويسقط هذا الحارسُ عمدًا حين يُربطان. وإسقاطُه حينها **هو المطلوب**: يُقرأ فيُحذف
   * مع الخطوة التي أتمّتها، لا يُلتفّ عليه.
   */
  const secretsLine = CLOUDBUILD.split('\n').find(l => l.includes('R2_ACCESS_KEY_ID=')) || '';
  assert.ok(secretsLine, 'the --update-secrets line must exist');
  const wired = ['MIZAN_PASS_SIGNING_SECRET', 'MIZAN_CERT_SIGNING_SECRET'].filter(n => secretsLine.includes(n));
  assert.deepEqual(wired, [],
    'these are wired — so they must now exist in Secret Manager; confirm, then delete this guard by name');
});

test('the runbook says which order, and why the order matters', () => {
  const book = read('docs/SIGNING-SECRETS.md');
  assert.match(book, /gcloud secrets create MIZAN_PASS_SIGNING_SECRET/, 'it must give the exact command');
  assert.match(book, /secretmanager\.secretAccessor/, 'and the IAM grant the runtime needs');
  assert.match(book, /ولا يُدفع هذا السطر قبل وجود السرّين/, 'and state the ordering constraint plainly');
  // ولا يُكتب سرٌّ في المستودع — ولا مثالٌ يُشبه سرًّا فيُنسخ كما هو.
  assert.equal(/=\s*['"][A-Za-z0-9+\/]{24,}={0,2}['"]/.test(book), false,
    'no literal secret-shaped value may appear in a committed file');
});

test('both legal drafts exist, and neither pretends to be final', () => {
  for (const file of ['docs/legal/TERMS-AR.md', 'docs/legal/PRIVACY-AR.md']) {
    const text = read(file);
    assert.match(text, /مسوّدة — لا تُنشر قبل مراجعة محامٍ/, `${file} must not read as a published document`);
    assert.ok(text.includes('⟦'), `${file} must keep the owner's blanks visible rather than inventing them`);
  }
  // والخصوصيةُ تذكر المُدَد التي تقرؤها الشيفرة فعلًا، لا مدّةً مستعارة.
  const privacy = read('docs/legal/PRIVACY-AR.md');
  const config = read('src/lib/competition-config.ts');
  assert.match(config, /audioRetentionDays:\s*90/, 'the measured default');
  assert.match(config, /documentRetentionDays:\s*365/, 'and the other one');
  assert.ok(privacy.includes('٩٠') && privacy.includes('٣٦٥'),
    'the policy must carry the same numbers the product actually applies');
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
  // والنقصُ الجزئيّ ليس نشرًا — تُقال القاعدةُ كي لا يُضبط نصفُها ويُظنّ الأمرُ تمّ.
  assert.match(guide, /النقصُ الجزئيّ ليس نشرًا/, 'partial configuration must be called out');
});
