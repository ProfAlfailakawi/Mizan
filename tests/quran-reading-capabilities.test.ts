/*
 * P7 — القدرة تُقال طبقةً طبقة، بصدق.
 *
 * الخطرُ الذي تحرسه هذه الاختبارات ليس نقصَ البيانات — نقصُ البيانات حقيقةٌ مشروعة. الخطر
 * أن يُقال «مدعوم» فتظهر للمتسابق ميزةٌ مبنيّة على بيانات روايةٍ أخرى، أو أن يُقال «غير
 * مدعوم» فتُمنع ميزةٌ نملك بياناتها. ولذلك يُفحص هنا جوابُ كل طبقةٍ لكل روايةٍ من العشرين.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { CANONICAL_RAWI_IDS, CANONICAL_READINGS } from '../src/lib/canonical-readings';
import { PINNED_DELIVERED_RAWI_IDS } from '../src/lib/delivered-readings';
import { crosswalkCoverage } from '../src/lib/quran-locus-crosswalk';
import {
  QURAN_CAPABILITY_LAYERS,
  capabilityFor,
  readingCapabilityProfile,
  readingCapabilityProfiles,
  type QuranCapabilityLayer,
} from '../src/lib/quran-reading-capabilities';

const PROFILES = readingCapabilityProfiles();

test('all twenty readings are known to the capability model, and each answers every layer', () => {
  assert.equal(PROFILES.length, 20);
  assert.deepEqual(PROFILES.map(p => p.rawiId).sort(), [...CANONICAL_RAWI_IDS].sort());
  for (const profile of PROFILES) {
    for (const layer of QURAN_CAPABILITY_LAYERS) {
      const verdict = profile.layers[layer];
      assert.ok(verdict, `${profile.rawiId} has no answer for ${layer}`);
      assert.equal(verdict.layer, layer);
      assert.ok(['AVAILABLE', 'REQUIRES_DELIVERY_LAYER', 'UNAVAILABLE'].includes(verdict.state), `${profile.rawiId}/${layer}`);
    }
  }
});

test('an unavailable layer always names its reason — never a bare "unsupported"', () => {
  for (const profile of PROFILES) {
    for (const layer of QURAN_CAPABILITY_LAYERS) {
      const verdict = profile.layers[layer];
      if (verdict.state === 'AVAILABLE') {
        assert.ok(verdict.source, `${profile.rawiId}/${layer} claims availability without naming its source`);
        continue;
      }
      assert.ok(verdict.reason, `${profile.rawiId}/${layer} is unavailable without a reason`);
      assert.match(verdict.reason!, /^(UNAVAILABLE_[A-Z_]+|REQUIRES_DELIVERY_LAYER_AT_RUNTIME)(:\d+)?$/,
        `${profile.rawiId}/${layer} reason must be a machine-readable code, got "${verdict.reason}"`);
    }
  }
});

test('advanced KFGQPC layers are claimed only where KFGQPC actually published data', () => {
  const advanced: QuranCapabilityLayer[] = ['QIRAAT_VARIANT_KNOWLEDGE', 'WAQF', 'TAJWEED', 'VISUAL_REFERENCE', 'ADVANCED_INTELLIGENCE'];
  const claiming = PROFILES.filter(p => advanced.every(layer => p.layers[layer].state !== 'UNAVAILABLE')).map(p => p.rawiId);
  assert.deepEqual(claiming.sort(), ['al-duri-abu-amr', 'al-susi', 'hafs', 'qalun', 'shubah', 'warsh'].sort(),
    'exactly the six readings KFGQPC published for');

  // والأربعَ عشرةَ الباقية تقول سببها، ولا تقترب من اسم المجمع.
  for (const profile of PROFILES) {
    if (claiming.includes(profile.rawiId)) continue;
    for (const layer of advanced) {
      const verdict = profile.layers[layer];
      assert.equal(verdict.state, 'UNAVAILABLE', `${profile.rawiId}/${layer}`);
      assert.equal(verdict.source, undefined, `${profile.rawiId}/${layer} must not name a source it does not have`);
    }
  }
});

test('no pinned Islamweb-derived reading is ever attributed to KFGQPC — no laundering', () => {
  for (const rawiId of PINNED_DELIVERED_RAWI_IDS) {
    const profile = readingCapabilityProfile(rawiId);
    for (const layer of QURAN_CAPABILITY_LAYERS) {
      const source = profile.layers[layer].source || '';
      assert.equal(source.includes('KFGQPC'), false, `${rawiId}/${layer} attributes "${source}" to KFGQPC`);
    }
    assert.match(profile.layers.FULL_TEXT.source!, /^ISLAMWEB_DERIVED@/, `${rawiId} must state its real provenance`);
  }
});

test('basic text comparison generalises wherever text and a resolved crosswalk both exist', () => {
  for (const profile of PROFILES) {
    const comparison = profile.layers.BASIC_TEXT_COMPARISON;
    const text = profile.layers.FULL_TEXT;
    const alignment = profile.layers.CANONICAL_NATIVE_ALIGNMENT;

    if (alignment.state !== 'AVAILABLE') {
      // بلا جسرٍ محلول تقارن المقارنةُ موضعين مختلفين وتسمّيهما واحدًا، فتُمنع بسببها.
      assert.equal(comparison.state, 'UNAVAILABLE', profile.rawiId);
      assert.equal(comparison.reason, alignment.reason, `${profile.rawiId} must inherit the alignment reason verbatim`);
      continue;
    }
    if (text.state === 'AVAILABLE') {
      assert.equal(comparison.state, 'AVAILABLE', profile.rawiId);
      assert.ok(comparison.source!.startsWith('SOURCE_AWARE_TEXT_COMPARISON·'), profile.rawiId);
      // ولا تُقدَّم بديلًا عن علم القراءات.
      assert.equal(comparison.source!.includes('VARIANT'), false);
    } else {
      assert.equal(comparison.state, 'REQUIRES_DELIVERY_LAYER', profile.rawiId);
    }
  }
});

test('a reading blocked at the crosswalk is blocked for comparison too, by the same named reason', () => {
  const blocked = CANONICAL_RAWI_IDS.filter(rawiId => !crosswalkCoverage(rawiId).questionSafe);
  assert.ok(blocked.length > 0, 'this guard is only meaningful while something is still blocked');
  for (const rawiId of blocked) {
    const verdict = capabilityFor(rawiId, 'BASIC_TEXT_COMPARISON');
    assert.equal(verdict.state, 'UNAVAILABLE', rawiId);
    assert.match(String(verdict.reason), /^UNAVAILABLE_CROSSWALK_UNRESOLVED:\d+$/, rawiId);
  }
});

test('the audio layer is the one global Hafs policy, and says so in its own source', () => {
  for (const profile of PROFILES) {
    const audio = profile.layers.AUDIO_ACTION;
    assert.equal(audio.state, 'AVAILABLE', profile.rawiId);
    assert.equal(audio.source, 'GLOBAL_HAFS_AUDIO·hafs', `${profile.rawiId} audio must declare that it is Hafs`);
    // ولا يُقرأ ذلك دعمًا لنصّ الرواية: طبقة النصّ مستقلّة تمامًا.
    assert.notEqual(profile.layers.FULL_TEXT.source, audio.source);
  }
});

test('the Duri and Khalaf identities never collapse into one another', () => {
  const duriAbuAmr = readingCapabilityProfile('al-duri-abu-amr');
  const duriKisai = readingCapabilityProfile('al-duri-kisai');
  assert.notEqual(duriAbuAmr.qiraahId, duriKisai.qiraahId);
  assert.notEqual(duriAbuAmr.layers.FULL_TEXT.source, duriKisai.layers.FULL_TEXT.source);
  // الدوري عن أبي عمرو له بيانات مجمع؛ الدوري عن الكسائي لا — ولا يرث أحدهما الآخر.
  assert.notEqual(duriAbuAmr.layers.WAQF.state, duriKisai.layers.WAQF.state);

  const khalafHamzah = readingCapabilityProfile('khalaf-hamzah');
  const khalafAshir = CANONICAL_READINGS.find(r => r.rawiId !== 'khalaf-hamzah' && r.labelArabic.includes('خلف'));
  assert.ok(khalafAshir, 'both Khalaf identities must exist in the registry');
  assert.notEqual(khalafHamzah.rawiId, khalafAshir!.rawiId);
  assert.notEqual(khalafHamzah.qiraahId, khalafAshir!.qiraahId);
});

test('an unknown reading is refused, never resolved to the nearest match', () => {
  for (const bogus of ['al-duri', 'خلف', 'duri', 'not-a-rawi', '']) {
    assert.throws(() => readingCapabilityProfile(bogus), /QURAN_CAPABILITY_UNKNOWN_RAWI/, bogus);
  }
});
