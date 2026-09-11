import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/*
 * الأساس البصري ملفٌّ يُقرأ في المراجعة لا صورةٌ تُقارن بالبكسل.
 *
 * وهذه الاختبارات تحرسه من الطريقة الوحيدة التي يموت بها أساسٌ كهذا: أن يُفرَّغ أو يُنسى
 * تحديثه عند إضافة تبويب، فيبقى موجودًا لا يحرس شيئًا.
 */

const BASELINE = 'tests/fixtures/scope-visual-baseline.json';
const VIEWPORTS = ['desktop', 'tablet', 'mobile'];
const TABS = ['scope', 'selection', 'distribution', 'policy', 'demand', 'simulation', 'models', 'readiness'];

test('the visual baseline covers every engine tab at every viewport', () => {
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')) as Record<string, Record<string, number>>;
  for (const viewport of VIEWPORTS) {
    for (const tab of TABS) {
      assert.ok(baseline[`${viewport}/${tab}`], `missing baseline for ${viewport}/${tab}`);
    }
  }
  assert.equal(Object.keys(baseline).length, VIEWPORTS.length * TABS.length);
});

test('every baseline entry carries a real structural fingerprint, never an empty screen', () => {
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')) as Record<string, Record<string, number>>;
  for (const [key, shape] of Object.entries(baseline)) {
    for (const field of ['buttons', 'headings', 'inputs', 'tables', 'lists', 'tabs', 'height']) {
      assert.equal(typeof shape[field], 'number', `${key}.${field} is not a number`);
    }
    assert.ok(shape.buttons > 0, `${key} records a screen with no button — an empty screen is not a baseline`);
    assert.ok(shape.headings > 0, `${key} records a screen with no heading`);
    assert.ok(shape.height > 0, `${key} records a screen with no height`);
    /* دون الـlg يظهر شريط تنقّل الصفحة أيضًا بدور tablist، فالعدد يزيد على تبويبات المحرك. */
    assert.ok(shape.tabs >= TABS.length, `${key} must see all ${TABS.length} engine tabs`);
    if (key.startsWith('desktop/')) assert.equal(shape.tabs, TABS.length, `${key} should show the engine tab strip alone`);
  }
});

test('the models-and-fairness tab is part of the guarded surface, not an afterthought', () => {
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')) as Record<string, Record<string, number>>;
  for (const viewport of VIEWPORTS) {
    const shape = baseline[`${viewport}/models`];
    assert.ok(shape.buttons >= 5, `${viewport}/models should carry its batch, reserve, quarantine and report controls`);
    assert.ok(shape.inputs >= 2, `${viewport}/models should carry the quarantine loci and reason fields`);
  }
});

test('the baseline comparison script exists and refuses to pass without a baseline file', () => {
  const script = fs.readFileSync('scripts/scope-visual-baseline.mjs', 'utf8');
  assert.match(script, /--update/, 'an intentional change must be updatable');
  assert.match(script, /لا أساس بصري بعد/, 'a missing baseline fails loudly instead of passing quietly');
  assert.match(script, /تمدّد أفقي/, 'horizontal overflow is part of the guarded surface');
  assert.doesNotMatch(script, /toMatchSnapshot|pixelmatch/, 'this is a structural baseline, not a pixel diff');
});
