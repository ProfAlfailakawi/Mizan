import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QURAN_SOURCE_AUTHORITIES,
  resolveSourceAuthority,
  authorityHasRole,
  canServeAsReadingText,
  sourceProvenanceStatement,
  type QuranSourceAuthority,
} from '../src/lib/quran-source-authority';
import { isReadingDelivered, isKfgqpcSourceAuthority } from '../src/lib/scientific-core';

test('the authority model is general, not KFGQPC-only', () => {
  const ids = Object.keys(QURAN_SOURCE_AUTHORITIES) as QuranSourceAuthority[];
  for (const expected of ['KFGQPC', 'ALWAHY', 'QURANPEDIA', 'TANZIL', 'ALQURAN_CLOUD', 'OTHER_APPROVED']) {
    assert.ok(ids.includes(expected as QuranSourceAuthority), `${expected} present`);
  }
  // every entry is self-consistent
  for (const id of ids) {
    const info = QURAN_SOURCE_AUTHORITIES[id];
    assert.equal(info.id, id);
    assert.ok(info.nameArabic.trim().length > 0);
    assert.ok(info.roles.length > 0, `${id} declares at least one role`);
  }
});

test('roles distinguish a full-text source from verification-only', () => {
  assert.ok(authorityHasRole('KFGQPC', 'FULL_TEXT_AUTHORITY'));
  assert.ok(authorityHasRole('QURANPEDIA', 'QIRAAT_KNOWLEDGE_AUTHORITY'));
  // Quranpedia/Tanzil are not primary text sources — they cannot become the reading text
  assert.ok(!canServeAsReadingText('QURANPEDIA'));
  assert.ok(!canServeAsReadingText('TANZIL'));
  assert.ok(!canServeAsReadingText('ALQURAN_CLOUD'));
  // KFGQPC and ALWAHY can
  assert.ok(canServeAsReadingText('KFGQPC'));
  assert.ok(canServeAsReadingText('ALWAHY'));
});

test('authority resolution never guesses', () => {
  assert.equal(resolveSourceAuthority('kfgqpc'), 'KFGQPC');
  assert.equal(resolveSourceAuthority('alquran cloud'), 'ALQURAN_CLOUD');
  assert.equal(resolveSourceAuthority('  Quranpedia '), 'QURANPEDIA');
  assert.equal(resolveSourceAuthority('some-unknown-site'), undefined);
  assert.equal(resolveSourceAuthority(''), undefined);
  assert.equal(resolveSourceAuthority(undefined), undefined);
});

test('a provenance statement never claims the publisher certified Mizan', () => {
  const stmt = sourceProvenanceStatement('QURANPEDIA');
  assert.equal(stmt.publisherCertifiedMizan, false);
  assert.equal(stmt.committeeScopeApproved, true, 'Mizan committee scope decision');
  assert.equal(stmt.usableAsReadingText, false, 'knowledge source is not a reading text');
  assert.equal(stmt.authorityNameArabic, 'قرآنبيديا');
  // the committee scope flag is independent and can be false
  assert.equal(sourceProvenanceStatement('OTHER_APPROVED', false).committeeScopeApproved, false);
});

test('delivery and KFGQPC authority are now separate questions', () => {
  // Hafs text is delivered — that says nothing about who published it.
  assert.equal(isReadingDelivered({ riwaya: 'حفص عن عاصم' }), true);
  // authority is answered from the source record, not the delivery table
  assert.equal(isKfgqpcSourceAuthority({ sourceAuthority: 'KFGQPC' }), true);
  assert.equal(isKfgqpcSourceAuthority({ sourceAuthority: 'QURANPEDIA' }), false);
  assert.equal(isKfgqpcSourceAuthority({ sourceAuthority: '' }), false);
  assert.equal(isKfgqpcSourceAuthority(undefined), false);
  // هشام صار له نصٌّ مُسلَّم من أثرٍ مثبَّت — وهذا لا يجعل ناشره مجمع الملك فهد.
  assert.equal(isReadingDelivered({ riwaya: 'هشام عن ابن عامر' }), true);
  assert.equal(isKfgqpcSourceAuthority({ sourceAuthority: 'ISLAMWEB' }), false);
  // وما لا تُحلّ هويته لا يُقال إنه مُسلَّم — لا تخمين لـ«الدوري» المجرّدة.
  assert.equal(isReadingDelivered({ riwaya: 'الدوري' }), false);
  assert.equal(isReadingDelivered({ riwaya: 'رواية لا وجود لها' }), false);
});
