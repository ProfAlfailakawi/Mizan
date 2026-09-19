/*
 * وثيقةٌ تُلبَس اسمَ غير ناشرها كذبٌ في الأثر.
 *
 * ميزان يُباع على ثلاث طبقات: المنصّة، ومشغّلٌ يسوّق لجهاته، وجهةٌ تنظّم المسابقة.
 * وقد قرّر المالك في 19 سبتمبر 2026 أن تنزل الوثيقةُ في السلسلة حين لا تنشر الطبقةُ
 * الأدنى وثيقتَها — **بشرط أن يُعرض الناشرُ الحقيقيّ ويُكتب في الأثر**.
 *
 * وهذه الحرّاس تثبّت الشرط لا الرخصة: `publisher` و`level` يأتيان من الحلقة التي
 * فازت لا التي طُلبت، و`inherited` تقول صراحةً إن الوثيقة ليست وثيقةَ مَن سجّل عنده
 * المتسابق. وأخطرُ ما يُمنع هنا: خلطُ حقول طبقتين — رابطٌ من هذه ونسخةٌ من تلك —
 * فينتج وثيقةٌ لم تُنشر قطّ ولا يملك أحدٌ نصَّها.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isResolved,
  resolveLegalDocument,
  unresolvedConsentDocuments,
  type LegalChainLink,
} from '../src/lib/legal-documents';

const published = (entityName: string, version: string) => ({
  entityName,
  documents: {
    terms: { version, effectiveDate: '2026-10-01', url: `https://example.invalid/${encodeURIComponent(entityName)}/terms` },
    privacy: { version, effectiveDate: '2026-10-01', url: `https://example.invalid/${encodeURIComponent(entityName)}/privacy` },
  },
});

const chainOf = (organization?: object, operator?: object, platform?: object): LegalChainLink[] => [
  { level: 'organization', config: organization || {} },
  { level: 'operator', config: operator || {} },
  { level: 'platform', config: platform || {} },
];

test('the organization own document wins, and is not marked inherited', () => {
  const resolved = resolveLegalDocument(chainOf(published('جمعية أ', '2.0'), published('مشغّل', '1.0'), published('ميزان', '1.0')), 'terms');
  assert.ok(isResolved(resolved));
  assert.equal(resolved.publisher, 'جمعية أ');
  assert.equal(resolved.level, 'organization');
  assert.equal(resolved.inherited, false);
  assert.equal(resolved.version, '2.0');
});

test('an unpublished organization falls to the operator — under the operator own name', () => {
  const resolved = resolveLegalDocument(chainOf(undefined, published('مشغّل', '1.0'), published('ميزان', '9.9')), 'terms');
  assert.ok(isResolved(resolved));
  assert.equal(resolved.publisher, 'مشغّل', 'the participant must read whose document this really is');
  assert.equal(resolved.level, 'operator');
  assert.equal(resolved.inherited, true, 'and the record must say it is not the organization own');
});

/*
 * سببُ وجود هذا الاختبار: الحرّاسُ فوقه تبني السلسلةَ بثلاث حلقاتٍ دائمًا، الفارغةُ
 * منها `{}`. و`legalChainFor` في الإنتاج **لا يفعل ذلك**: مَن لم ينشر تُسقَط حلقتُه
 * أصلًا. فكانت `inherited` تُقاس إلى أوّل حلقةٍ حاضرة، فتخرج وثيقةُ المشغّل — حين لا
 * تنشر الجهةُ شيئًا — موسومةً `inherited: false`، أي «هذه وثيقةُ مَن سجّلتَ عنده».
 *
 * والاسمُ المعروض كان صحيحًا، لكنّ الأثر كان يكذب في الوصف. فتُقاس الآن إلى الطبقة
 * التي سجّل عندها المتسابق، ويُثبّت هنا النموذجُ الذي يُنتجه الإنتاج لا نموذجُ الاختبار.
 */
test('a chain with the organization link absent — what legalChainFor really returns — still marks the document inherited', () => {
  for (const kind of ['terms', 'privacy'] as const) {
    const absent = resolveLegalDocument([{ level: 'operator', config: published('مشغّل', '1.0') }], kind);
    assert.ok(isResolved(absent));
    assert.equal(absent.publisher, 'مشغّل');
    assert.equal(absent.level, 'operator');
    assert.equal(absent.inherited, true,
      'an absent organization link must read the same as an empty one — never as the participant own layer');

    const empty = resolveLegalDocument(chainOf(undefined, published('مشغّل', '1.0')), kind);
    assert.ok(isResolved(empty));
    assert.equal(empty.inherited, absent.inherited, 'absent and empty must never disagree');
  }

  const platformOnly = resolveLegalDocument([{ level: 'platform', config: published('ميزان', '1.0') }], 'terms');
  assert.ok(isResolved(platformOnly));
  assert.equal(platformOnly.inherited, true, 'the platform document is never the organization own');
});

test('with neither below it, the platform document stands — under the platform own name', () => {
  const resolved = resolveLegalDocument(chainOf(undefined, undefined, published('ميزان', '1.0')), 'privacy');
  assert.ok(isResolved(resolved));
  assert.equal(resolved.publisher, 'ميزان');
  assert.equal(resolved.level, 'platform');
  assert.equal(resolved.inherited, true);
});

test('a half-configured level is not a publication, and its fields never leak into the next one', () => {
  const halfOrganization = {
    entityName: 'جمعية ناقصة',
    documents: { terms: { url: 'https://example.invalid/half/terms' } }, // بلا نسخة ولا تاريخ سريان
  };
  const resolved = resolveLegalDocument(chainOf(halfOrganization, published('مشغّل', '3.0')), 'terms');
  assert.ok(isResolved(resolved));
  assert.equal(resolved.publisher, 'مشغّل');
  assert.equal(resolved.version, '3.0');
  assert.equal(resolved.url, 'https://example.invalid/%D9%85%D8%B4%D8%BA%D9%91%D9%84/terms',
    'the winning link supplies every field — never a url from one level and a version from another');
});

test('nothing published anywhere fails closed and names the levels it tried', () => {
  const resolved = resolveLegalDocument(chainOf(), 'terms');
  assert.equal(isResolved(resolved), false);
  if (isResolved(resolved)) return;
  assert.equal(resolved.code, 'LEGAL_DOCUMENT_NOT_PUBLISHED');
  assert.deepEqual(resolved.levelsTried, ['organization', 'operator', 'platform']);
  assert.ok(resolved.missing.length, 'and says what the lowest level still needs');
});

test('the order is the chain order regardless of how the caller listed it', () => {
  const shuffled: LegalChainLink[] = [
    { level: 'platform', config: published('ميزان', '1.0') },
    { level: 'organization', config: published('جمعية أ', '2.0') },
    { level: 'operator', config: published('مشغّل', '1.0') },
  ];
  const resolved = resolveLegalDocument(shuffled, 'terms');
  assert.ok(isResolved(resolved));
  assert.equal(resolved.level, 'organization', 'a caller cannot reorder the chain into the wrong publisher');
});

test('both consent documents must resolve, or registration has nothing to record', () => {
  const partial = { entityName: 'جهة', documents: { terms: { version: '1.0', effectiveDate: '2026-10-01', url: 'https://example.invalid/t' } } };
  const missing = unresolvedConsentDocuments(chainOf(partial));
  assert.equal(missing.length, 1);
  assert.equal(missing[0].kind, 'privacy');
  assert.equal(unresolvedConsentDocuments(chainOf(published('جهة', '1.0'))).length, 0);
});
