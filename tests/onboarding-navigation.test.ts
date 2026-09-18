/*
 * P28 — تنقّلُ معالج الإقلاع.
 *
 * المعالجُ خلف دخولٍ حقيقيّ، فلا يُفتح في بيئة فحصٍ بلا Firebase — ومنطقُه ليس تافهًا،
 * وكلُّ كسرةٍ فيه تمرّ بلا صوت:
 *
 *   · سهمٌ معكوس: القارئُ العربيّ يضغط «التالي» فيرجع.
 *   · تقدّمٌ لا يقف: الشريحةُ تمضي تحت عينه وهو في منتصف الجملة.
 *   · خطوةٌ بلا حدّ: ضغطتان زائدتان تُخرجان من الشرائح إلى فراغ.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  ONBOARDING_AUTO_ADVANCE_MS,
  ONBOARDING_SWIPE_THRESHOLD_PX,
  clampStep,
  onboardingAutoAdvances,
  onboardingKeyIntent,
  onboardingSwipeIntent,
} from '../src/lib/onboarding-navigation';

const rtl = (step: number) => ({ step, slideCount: 5, rtl: true });
const ltr = (step: number) => ({ step, slideCount: 5, rtl: false });

/* ── الاتجاه ────────────────────────────────────────────────────────────────── */

test('in Arabic the forward arrow is the left one — the opposite sends the reader backwards', () => {
  assert.deepEqual(onboardingKeyIntent('ArrowLeft', rtl(1)), { kind: 'GO', step: 2 });
  assert.deepEqual(onboardingKeyIntent('ArrowRight', rtl(1)), { kind: 'GO', step: 0 });
});

test('in English it is the other way round', () => {
  assert.deepEqual(onboardingKeyIntent('ArrowRight', ltr(1)), { kind: 'GO', step: 2 });
  assert.deepEqual(onboardingKeyIntent('ArrowLeft', ltr(1)), { kind: 'GO', step: 0 });
});

test('a swipe follows the same reading direction as the arrows', () => {
  // في العربية تأتي الشريحةُ التالية من اليسار، فالسحبُ نحو اليمين تقدّم.
  assert.deepEqual(onboardingSwipeIntent(90, rtl(1)), { kind: 'GO', step: 2 });
  assert.deepEqual(onboardingSwipeIntent(-90, rtl(1)), { kind: 'GO', step: 0 });
  assert.deepEqual(onboardingSwipeIntent(-90, ltr(1)), { kind: 'GO', step: 2 });
  assert.deepEqual(onboardingSwipeIntent(90, ltr(1)), { kind: 'GO', step: 0 });
});

/* ── الحدود ────────────────────────────────────────────────────────────────── */

test('the last slide finishes instead of stepping into nothing', () => {
  assert.deepEqual(onboardingKeyIntent('ArrowLeft', rtl(4)), { kind: 'FINISH' });
  assert.deepEqual(onboardingKeyIntent('Enter', rtl(4)), { kind: 'FINISH' });
  assert.deepEqual(onboardingSwipeIntent(90, rtl(4)), { kind: 'FINISH' });
});

test('going back from the first slide does nothing, rather than stepping to -1', () => {
  assert.deepEqual(onboardingKeyIntent('ArrowRight', rtl(0)), { kind: 'IGNORE' });
  assert.deepEqual(onboardingSwipeIntent(-90, rtl(0)), { kind: 'IGNORE' });
});

test('a step is always clamped inside the slides, whatever it is handed', () => {
  assert.equal(clampStep(-5, 5), 0);
  assert.equal(clampStep(99, 5), 4);
  assert.equal(clampStep(2.7, 5), 2);
  assert.equal(clampStep(Number.NaN, 5), 0);
  // ولا شرائح أصلًا: لا خطوةَ تُحسب على فراغ.
  assert.equal(clampStep(3, 0), 0);
});

/* ── الخروج ────────────────────────────────────────────────────────────────── */

test('Escape always leaves, from any slide', () => {
  for (const step of [0, 2, 4]) assert.deepEqual(onboardingKeyIntent('Escape', rtl(step)), { kind: 'FINISH' });
});

test('Enter moves forward, and only finishes on the last slide', () => {
  assert.deepEqual(onboardingKeyIntent('Enter', rtl(0)), { kind: 'GO', step: 1 });
  assert.deepEqual(onboardingKeyIntent('Enter', rtl(4)), { kind: 'FINISH' });
});

test('keys that mean nothing here are ignored, not swallowed as navigation', () => {
  for (const key of ['Tab', 'a', ' ', 'ArrowUp', 'ArrowDown', 'Shift']) {
    assert.deepEqual(onboardingKeyIntent(key, rtl(1)), { kind: 'IGNORE' }, key);
  }
});

/* ── السحب دون العتبة ──────────────────────────────────────────────────────── */

test('a small drag is not a swipe — a finger tremor must not skip a slide', () => {
  for (const dx of [0, 12, -12, 47, -47]) {
    assert.deepEqual(onboardingSwipeIntent(dx, rtl(1)), { kind: 'IGNORE' }, String(dx));
  }
  assert.deepEqual(onboardingSwipeIntent(ONBOARDING_SWIPE_THRESHOLD_PX, rtl(1)), { kind: 'GO', step: 2 });
  assert.deepEqual(onboardingSwipeIntent(Number.NaN, rtl(1)), { kind: 'IGNORE' });
});

/* ── التقدّم التلقائي ──────────────────────────────────────────────────────── */

test('moving content that starts on its own must be pausable — WCAG 2.2.2', () => {
  /*
   * وقوفُ المؤشّر أو التركيز يعني أن أحدًا يقرأ. والشريحةُ التي تمضي تحت عينه تُفقده
   * الجملة، ولا سبيل له إلى إرجاعها إلا بالبحث عنها.
   */
  assert.equal(onboardingAutoAdvances({ step: 1, slideCount: 5, held: true, reducedMotion: false }), false);
  assert.equal(onboardingAutoAdvances({ step: 1, slideCount: 5, held: false, reducedMotion: false }), true);
});

test('reduced motion switches the automatic advance off entirely', () => {
  // من طلب تقليلَ الحركة لا يُحرَّك له شيءٌ بلا يده، ولو كان واقفًا لا يقرأ.
  assert.equal(onboardingAutoAdvances({ step: 0, slideCount: 5, held: false, reducedMotion: true }), false);
  assert.equal(onboardingAutoAdvances({ step: 2, slideCount: 5, held: true, reducedMotion: true }), false);
});

test('the last slide never advances on its own', () => {
  assert.equal(onboardingAutoAdvances({ step: 4, slideCount: 5, held: false, reducedMotion: false }), false);
});

test('the advance interval is long enough to read a slide', () => {
  // رقمٌ أقلُّ من هذا يجعل الشريحةَ تمضي قبل أن تُقرأ، فيصير الشريطُ زينةً لا مؤقّتًا.
  assert.ok(ONBOARDING_AUTO_ADVANCE_MS >= 5000, `${ONBOARDING_AUTO_ADVANCE_MS}ms is too short to read`);
});

/* ── لا نسخةَ ثانية من القاعدة ─────────────────────────────────────────────── */

test('the component reads this logic instead of keeping its own copy', () => {
  const component = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'public', 'OnboardingExperience.tsx'), 'utf8');
  assert.ok(component.includes("from '../../lib/onboarding-navigation'"), 'the component must read the shared logic');
  assert.ok(component.includes('onboardingKeyIntent('), 'keyboard handling goes through it');
  assert.ok(component.includes('onboardingSwipeIntent('), 'swipe handling goes through it');
  assert.ok(component.includes('onboardingAutoAdvances('), 'the auto-advance gate goes through it');
  // ولا عتبةٌ ولا مؤقّتٌ مكتوبان مرّةً ثانية هنا، فيفترقان عن المُختبَر.
  assert.equal(/Math\.abs\(dx\) < 48/.test(component), false, 'no second copy of the swipe threshold');
  assert.equal(/= 7000;/.test(component), false, 'no second copy of the advance interval');
});
