import test from 'node:test';
import assert from 'node:assert/strict';

import { CANONICAL_READINGS, CANONICAL_RAWI_IDS, readingCapability, readingProductionReady } from '../src/lib/canonical-readings';
import { readingContextForRawi, freezeReadingContext, assertContextMatchesFrozen, sameReadingContext, ReadingContextError } from '../src/lib/reading-context';
import { audioProfileForReading, requiresAyahLevelSyncOnly } from '../src/lib/global-hafs-audio';
import { MIZAN_IDENTITY_CROSSWALK } from '../src/lib/quran-locus-crosswalk';
import { resolveReading } from '../src/lib/scientific-core';
import { quranPackageKey } from '../server/r2-object-layout';

/*
 * الاختبار مُعمَّمٌ على العشرين جميعًا لا على حفصٍ وورشٍ وحدهما.
 * كل رواية تمرّ بالسلسلة: هوية ← سياق ← تجميد ← صوت عالمي ← جسر مواضع ← مفتاح حزمة،
 * ويُتحقَّق في كل خطوة أنه لا سقوطَ إلى روايةٍ أخرى ولا تخمين.
 */

test('the parameterized matrix covers exactly twenty readings', () => {
  assert.equal(CANONICAL_RAWI_IDS.length, 20);
  assert.equal(new Set(CANONICAL_RAWI_IDS).size, 20);
});

for (const reading of CANONICAL_READINGS) {
  const { rawiId, qiraahId, labelArabic } = reading;

  test(`[${rawiId}] flows through the chain with its own identity intact`, () => {
    // 1) canonical identity
    const cap = readingCapability(rawiId)!;
    assert.equal(cap.qiraahId, qiraahId);
    assert.ok(cap.canonicalIdentity && cap.committeeScopeApproved);

    // 2) reading context is built from the registry, carrying this rawi only
    const ctx = readingContextForRawi(rawiId, { sourcePackageId: `pkg-${rawiId}`, packageVersion: 'v1' });
    assert.equal(ctx.rawiId, rawiId);
    assert.equal(ctx.qiraahId, qiraahId);

    // 3) the display label resolves back to this same canonical transmission
    assert.equal(resolveReading({ rawi: labelArabic })?.rawiId, rawiId, `label "${labelArabic}" resolves to ${rawiId}`);

    // 4) freezing preserves identity and rejects substitution by any other reading
    const frozen = freezeReadingContext(ctx);
    assert.doesNotThrow(() => assertContextMatchesFrozen(frozen, ctx));
    for (const other of CANONICAL_RAWI_IDS) {
      if (other === rawiId) continue;
      assert.throws(() => assertContextMatchesFrozen(frozen, readingContextForRawi(other)),
        (e: unknown) => e instanceof ReadingContextError && e.code === 'READING_CONTEXT_FROZEN_MISMATCH',
        `${rawiId} session refuses ${other}`);
    }

    // 5) audio is the one global Hafs profile, and it never changes the text identity
    const audio = audioProfileForReading(rawiId)!;
    assert.equal(audio.id, 'global-hafs');
    assert.equal(audio.reading, 'hafs');
    assert.equal(ctx.rawiId, rawiId, 'text identity unchanged by audio');
    assert.equal(requiresAyahLevelSyncOnly(rawiId), rawiId !== 'hafs');

    // 6) locus crosswalk stays within this reading and announces assumption honestly
    const res = MIZAN_IDENTITY_CROSSWALK.toNative(rawiId, { surah: 2, ayah: 20 });
    assert.equal(res.rawiId, rawiId);
    assert.equal(res.assumed, true);

    // 7) the storage key is scoped to this reading and version-immutable
    assert.equal(quranPackageKey(rawiId, 'v1'), `quran/packages/${rawiId}/v1/manifest.json`);
    assert.notEqual(quranPackageKey(rawiId, 'v1'), quranPackageKey(rawiId, 'v2'));
  });

  test(`[${rawiId}] is never production-ready without runtime evidence`, () => {
    const noEvidence = readingProductionReady(rawiId, { deliveryAvailableAtRuntime: false });
    assert.equal(noEvidence.productionReady, false, `${rawiId} must not claim readiness without runtime availability`);
    assert.ok(noEvidence.blockers.length > 0);
    // and an explicitly uncertified source blocks even when bytes are available
    const uncertified = readingProductionReady(rawiId, { deliveryAvailableAtRuntime: true, sourceCertified: false });
    assert.equal(uncertified.productionReady, false);
    assert.ok(uncertified.blockers.includes('SOURCE_NOT_CERTIFIED'));
  });
}

test('no two readings share an identity — cross-reading substitution is structurally impossible', () => {
  for (const a of CANONICAL_READINGS) {
    for (const b of CANONICAL_READINGS) {
      const same = sameReadingContext(readingContextForRawi(a.rawiId), readingContextForRawi(b.rawiId));
      assert.equal(same, a.rawiId === b.rawiId, `${a.rawiId} vs ${b.rawiId}`);
    }
  }
});

test('the two Duris never collide anywhere in the chain', () => {
  const abuAmr = readingContextForRawi('al-duri-abu-amr');
  const kisai = readingContextForRawi('al-duri-kisai');
  assert.ok(!sameReadingContext(abuAmr, kisai));
  assert.notEqual(quranPackageKey('al-duri-abu-amr', 'v1'), quranPackageKey('al-duri-kisai', 'v1'));
  assert.throws(() => assertContextMatchesFrozen(freezeReadingContext(abuAmr), kisai),
    (e: unknown) => e instanceof ReadingContextError && e.code === 'READING_CONTEXT_FROZEN_MISMATCH');
});
