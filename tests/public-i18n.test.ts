import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { PUBLIC_DICTIONARY } from '../src/lib/public-i18n-dict';
import { PUBLIC_LOCALES, PUBLIC_LOCALE_META, PUBLIC_LOCALE_REVIEW_STATUS, pl, plf, setPublicLocale, organizerText } from '../src/lib/public-i18n';

/*
 * لغةٌ لا تُعرض إلا مكتملة: كل نصٍّ في صفحات المتسابق له ترجمة في كل لغة، ولا يبقى نصٌّ
 * ثنائي مكتوب بالشرط القديم ar ? '…' : '…' فيفلت من القاموس ويظهر بالإنجليزية للأردي مثلًا.
 */
const FILES = ['src/components/public/RegistrationFlow.tsx', 'src/components/public/JourneyAccess.tsx', 'src/components/public/PassportView.tsx'];
const STEP_LABELS = ['Profile', 'Entry', 'Review', 'Application received', 'Approved', 'Check-in', 'Waiting', 'Judging', 'Judging complete', 'Appeal', 'Result / certificate'];
const englishTexts = () => {
  const out: string[] = [...STEP_LABELS];
  for (const f of FILES) {
    const s = fs.readFileSync(f, 'utf8');
    for (const m of s.matchAll(/plf?\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'/g)) out.push(m[2]);
    for (const m of s.matchAll(/\[\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*(?:,[^\]]*)?\]/g)) if (/[؀-ۿ]/.test(m[1]) && !/[؀-ۿ]/.test(m[2])) out.push(m[2]);
  }
  return [...new Set(out)];
};

test('the scan finds the participant texts — an empty scan proves nothing', () => {
  assert.ok(englishTexts().length > 150);
});

test('every participant-facing text is translated in every additional language, with the same placeholders', () => {
  for (const locale of ['ur', 'id', 'fr', 'tr'] as const) {
    const dict = PUBLIC_DICTIONARY[locale];
    const missing = englishTexts().filter(t => !dict[t]?.trim());
    assert.deepEqual(missing, [], `${locale} is missing translations`);
    for (const [en, tr] of Object.entries(dict)) {
      const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort();
      assert.deepEqual(vars(tr), vars(en), `${locale}: placeholders differ for "${en}"`);
    }
  }
});

test('no participant text bypasses the dictionary through the old two-language condition', () => {
  for (const f of FILES) {
    const s = fs.readFileSync(f, 'utf8');
    const offenders = [...s.matchAll(/\bar\s*\?\s*['`]/g)].map(m => s.slice(m.index!, m.index! + 60));
    assert.deepEqual(offenders, [], f);
  }
});

test('locale metadata, review status and runtime lookup', () => {
  assert.equal(PUBLIC_LOCALE_META.ar.dir, 'rtl');
  assert.equal(PUBLIC_LOCALE_META.ur.dir, 'rtl');
  for (const l of ['en', 'id', 'fr', 'tr'] as const) assert.equal(PUBLIC_LOCALE_META[l].dir, 'ltr');
  assert.equal(PUBLIC_LOCALES.length, 6);
  for (const l of ['ur', 'id', 'fr', 'tr'] as const) assert.equal(PUBLIC_LOCALE_REVIEW_STATUS[l], 'pending_native_review');
  setPublicLocale('fr');
  assert.equal(pl('رجوع', 'Back'), 'Retour');
  assert.equal(plf('انتظر', 'Wait ({{n}}s)', { n: 5 }), 'Patientez (5 s)');
  assert.equal(organizerText('فئة', 'Category A'), 'Category A');
  setPublicLocale('ur');
  assert.equal(organizerText('فئة', 'Category A'), 'فئة', 'Urdu readers see the organizer’s Arabic label');
  setPublicLocale('ar');
  assert.equal(pl('رجوع', 'Back'), 'رجوع');
});
