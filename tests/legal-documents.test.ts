/*
 * P38 — موافقةٌ مسجَّلة على وثيقةٍ غير منشورة.
 *
 * صفحةُ التسجيل تعرض مربّعًا نصُّه: «أوافق على شروط المشاركة وسياسة الخصوصية»، ويُسجَّل
 * قبولُه في الأثر بنوعَي `terms` و`privacy`.
 *
 * ولا وجودَ لهاتين الوثيقتين في المنتج: لا صفحة ولا رابط ولا نصّ. وما كان يُكتب نسخةً
 * للموافقة هو `policy.version` — **نسخةُ لائحة المسابقة**. فالأثرُ يقول إن فلانًا وافق
 * على «الشروط نسخة ٧»، وسبعةٌ رقمُ اللائحة، ولا شروطَ أصلًا.
 *
 * ولا يُصلَح باختراع نصّ: الكيانُ الناشر ومضمونُ الوثيقة قرارُ مالكٍ ومسؤوليتُه.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  CONSENT_BACKED_DOCUMENTS,
  UNPUBLISHED_CONSENT_VERSION,
  consentVersionFor,
  isPublished,
  legalConfigFromEnv,
  legalDocumentState,
  unpublishedConsentDocuments,
} from '../src/lib/legal-documents';

const complete = {
  entityName: 'الجهة المالكة كما أعلنتها',
  documents: {
    terms: { version: '2.1', effectiveDate: '2026-01-15', url: 'https://example.invalid/terms' },
    privacy: { version: '1.4', effectiveDate: '2026-01-15', url: 'https://example.invalid/privacy' },
  },
};

test('an unconfigured deployment says so by name, and lists exactly what is missing', () => {
  const state = legalDocumentState({}, 'terms');
  assert.ok(!isPublished(state));
  assert.equal(state.code, 'LEGAL_DOCUMENT_NOT_PUBLISHED');
  assert.deepEqual(state.missing, ['url', 'version', 'effectiveDate', 'entityName']);
});

test('a partly configured document is not published — a link with no version proves nothing', () => {
  /*
   * رابطٌ بلا نسخة لا يُعرف على أيِّ نصٍّ وقَّع الموقِّع، والنصُّ يتغيّر. ونسخةٌ بلا
   * تاريخ سريان لا يُعرف متى صارت سارية. فالنقصُ الجزئيّ ليس نشرًا.
   */
  const noVersion = legalDocumentState({ entityName: 'جهة', documents: { terms: { url: 'https://example.invalid/t', effectiveDate: '2026-01-15' } } }, 'terms');
  assert.ok(!isPublished(noVersion));
  assert.deepEqual(noVersion.missing, ['version']);

  const noPublisher = legalDocumentState({ documents: { terms: complete.documents.terms } }, 'terms');
  assert.ok(!isPublished(noPublisher));
  assert.deepEqual(noPublisher.missing, ['entityName']);
});

test('a malformed effective date is not an effective date', () => {
  for (const effectiveDate of ['soon', '15/01/2026', '2026-1-5', '']) {
    const state = legalDocumentState({ entityName: 'جهة', documents: { terms: { ...complete.documents.terms, effectiveDate } } }, 'terms');
    assert.ok(!isPublished(state), effectiveDate);
    assert.deepEqual(state.missing, ['effectiveDate'], effectiveDate);
  }
});

test('a fully published document carries its own version, date and publisher', () => {
  const state = legalDocumentState(complete, 'terms');
  assert.ok(isPublished(state));
  assert.equal(state.version, '2.1');
  assert.equal(state.effectiveDate, '2026-01-15');
  assert.equal(state.publisher, 'الجهة المالكة كما أعلنتها');
});

test('the consent version is the document version — never the competition policy version', () => {
  /*
   * هذا هو العطلُ بعينه. ونسخةُ اللائحة رقمٌ حقيقيّ، فكتابتُها هنا تُقرأ نسخةَ وثيقةٍ
   * ولا تُكتشف أبدًا.
   */
  assert.equal(consentVersionFor(complete, 'terms'), 'terms:2.1');
  assert.equal(consentVersionFor(complete, 'privacy'), 'privacy:1.4');
});

test('with nothing published the consent records that plainly, not a borrowed number', () => {
  for (const kind of CONSENT_BACKED_DOCUMENTS) {
    assert.equal(consentVersionFor({}, kind), UNPUBLISHED_CONSENT_VERSION, kind);
  }
  assert.match(UNPUBLISHED_CONSENT_VERSION, /NOT_PUBLISHED/, 'it must be unreadable as a real version');
});

test('both consent-backed documents are reported when unpublished, not just the first', () => {
  assert.deepEqual(unpublishedConsentDocuments({}).map(d => d.kind), ['terms', 'privacy']);
  assert.deepEqual(unpublishedConsentDocuments(complete), []);
});

test('the environment reader invents no default — an unset entity stays unset', () => {
  const state = legalDocumentState(legalConfigFromEnv({}), 'privacy');
  assert.ok(!isPublished(state));
  assert.ok(state.missing.includes('entityName'));

  const configured = legalConfigFromEnv({
    MIZAN_LEGAL_ENTITY_NAME: 'جهة معلنة', MIZAN_LEGAL_PRIVACY_URL: 'https://example.invalid/p',
    MIZAN_LEGAL_PRIVACY_VERSION: '3', MIZAN_LEGAL_PRIVACY_EFFECTIVE: '2026-02-01',
  });
  assert.ok(isPublished(legalDocumentState(configured, 'privacy')));
});

test('registration writes the document version and its publisher, never the policy version', () => {
  /*
   * تغيّر الإملاء في 19 سبتمبر 2026 حين صارت الوثائقُ على ثلاث طبقات: `consentVersionFor`
   * تأخذ إعدادًا واحدًا، والتسجيلُ صار يمرّ بسلسلةٍ فيُخرج ناشرًا مع النسخة. والقصدُ
   * نفسُه لم يتغيّر، وزاد عليه أن الناشرَ يُكتب — فالنسخةُ وحدها لا تميّز جهتين.
   */
  const registration = fs.readFileSync(path.join(process.cwd(), 'server', 'public-registration.ts'), 'utf8');
  assert.ok(registration.includes('consentProvenance(kind)'), 'consent must carry the document provenance');
  assert.equal(/kind,version:policy\.version/.test(registration), false,
    'the competition policy version must never be written as a consent version again');
  assert.ok(registration.includes('consentVersionOf('), 'and the version format must come from the shared registry');
  for (const field of ['publisher:resolved.publisher', 'publisherLevel:resolved.level', 'documentUrl:resolved.url']) {
    assert.ok(registration.includes(field), `the record must carry ${field} — a version alone cannot tell two publishers apart`);
  }
});

test('go-live refuses to launch a deployment that collects consent for nothing', () => {
  const preflight = fs.readFileSync(path.join(process.cwd(), 'scripts', 'go-live-preflight.mjs'), 'utf8');
  assert.ok(preflight.includes('MIZAN_LEGAL_'), 'preflight must check the legal documents');
  assert.ok(/blockers\.push\(\[\s*`\$\{label\} غير منشورة/.test(preflight), 'and treat it as a blocker, not a warning');
});

test('the example carries the variables but never a value we made up', () => {
  // الكيانُ الناشر ومضمونُ الوثيقة قرارُ مالك: يُترك فارغًا ليُملأ، لا يُخمَّن.
  const example = fs.readFileSync(path.join(process.cwd(), '.env.example'), 'utf8');
  for (const name of ['MIZAN_LEGAL_ENTITY_NAME', 'MIZAN_LEGAL_TERMS_URL', 'MIZAN_LEGAL_TERMS_VERSION',
    'MIZAN_LEGAL_TERMS_EFFECTIVE', 'MIZAN_LEGAL_PRIVACY_URL', 'MIZAN_LEGAL_PRIVACY_VERSION', 'MIZAN_LEGAL_PRIVACY_EFFECTIVE']) {
    assert.ok(new RegExp(`^${name}=""$`, 'm').test(example), `${name} must be present and empty`);
  }
});
