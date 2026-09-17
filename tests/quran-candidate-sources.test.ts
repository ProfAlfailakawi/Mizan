import assert from 'node:assert/strict';
import test from 'node:test';
import { DELIVERED_RAWI_IDS, KFGQPC_DELIVERED_RAWI_IDS, PINNED_DELIVERY_READING_BY_RAWI } from '../src/lib/delivered-readings';
import { TEN_QIRAAT_GRAPH } from '../src/lib/scientific-core';
import { QURAN_SOURCE_AUTHORITIES, canServeAsReadingText } from '../src/lib/quran-source-authority';
import {
  AL_ISLAM_IOS_QIRAAT_COMMIT,
  QURAN_FULL_TEXT_CANDIDATES,
  candidateRawUrl,
  candidateSourceForRawi,
  resolveCandidateReviewState,
} from '../src/lib/quran-candidate-sources';

test('the candidate source register is exactly the twelve rawis outside the KFGQPC mirror', () => {
  const fromMirror = new Set(KFGQPC_DELIVERED_RAWI_IDS);
  const rest = TEN_QIRAAT_GRAPH.map(x => x.rawiId).filter(id => !fromMirror.has(id)).sort();
  const candidates = QURAN_FULL_TEXT_CANDIDATES.map(x => x.rawiId).sort();

  assert.equal(TEN_QIRAAT_GRAPH.length, 20);
  assert.equal(KFGQPC_DELIVERED_RAWI_IDS.length, 8);
  assert.equal(QURAN_FULL_TEXT_CANDIDATES.length, 12);
  assert.deepEqual(candidates, rest);
  assert.equal(new Set(candidates).size, 12);
  // العشرون كلّها لها مسار تسليم الآن، بمصدرَين لا بمصدرٍ واحد.
  assert.equal(DELIVERED_RAWI_IDS.length, 20);
});

/*
 * جدول التسليم وحدةٌ طرفية لا تستورد السجلّ (لئلّا تنشأ حلقة استيراد)، فيحرس هذا الاختبار
 * تطابقَهما: أي رواية تُضاف في أحدهما وتُنسى في الآخر تسقط هنا لا في الإنتاج.
 */
test('the pinned delivery table and the candidate register never drift apart', () => {
  const registerKeys = Object.fromEntries(QURAN_FULL_TEXT_CANDIDATES.map(c => [c.rawiId, c.deliveryKey]));
  assert.deepEqual(PINNED_DELIVERY_READING_BY_RAWI, registerKeys);
  assert.equal(new Set(Object.values(PINNED_DELIVERY_READING_BY_RAWI)).size, 12, 'delivery keys must stay unique');
});

test('candidate Quran bytes are pinned by commit and digest, and never re-badged as KFGQPC', () => {
  assert.match(AL_ISLAM_IOS_QIRAAT_COMMIT, /^[0-9a-f]{40}$/);
  for (const source of QURAN_FULL_TEXT_CANDIDATES) {
    assert.equal(source.upstreamCommit, AL_ISLAM_IOS_QIRAAT_COMMIT);
    assert.equal(source.authority, 'ISLAMWEB_DERIVED');
    assert.equal(source.publisherAuthority, 'ISLAMWEB');
    assert.notEqual(source.publisherAuthority as string, 'KFGQPC');
    assert.equal(source.role, 'FULL_TEXT_CANDIDATE');
    assert.equal(source.permissionState, 'OWNER_REPORTED_PERMISSION');
    assert.match(source.upstreamPath, /^Resources\/Data\/Quran\/Qiraah.+\.json\.deflate$/);
    assert.match(source.expectedCompressedSha256, /^[0-9a-f]{64}$/);
    assert.ok(!KFGQPC_DELIVERED_RAWI_IDS.includes(source.rawiId));
    assert.equal(candidateRawUrl(source), `https://raw.githubusercontent.com/${source.upstreamRepository}/${AL_ISLAM_IOS_QIRAAT_COMMIT}/${source.upstreamPath}`);
  }
  // الناشر مسجَّل في فهرس السلطات العام وصالحٌ ليكون نصَّ رواية — بلا ادّعاء KFGQPC.
  assert.ok(QURAN_SOURCE_AUTHORITIES.ISLAMWEB);
  assert.equal(canServeAsReadingText('ISLAMWEB'), true);
});

/*
 * جوهر البروتوكول: لا يوجد حقلٌ ثابت اسمه «معتمد». القرار مكتوبٌ مربوطًا ببايتاتٍ بعينها،
 * والحالة تُشتقّ من مقابلته بما يدخل فعلًا. فملفٌ جديد لا يرث اعتماد ملفٍ قديم.
 */
test('committee approval is bound to the exact artifact and never a standing flag', () => {
  for (const source of QURAN_FULL_TEXT_CANDIDATES) {
    assert.ok(!('reviewState' in source), `${source.rawiId} must not carry an unconditional reviewState flag`);
    assert.equal(source.committeeDecision.authority, 'MIZAN_SCIENTIFIC_COMMITTEE');
    assert.equal(source.committeeDecision.state, 'APPROVED');
    assert.equal(source.committeeDecision.boundUpstreamCommit, source.upstreamCommit);
    assert.equal(source.committeeDecision.boundCompressedSha256, source.expectedCompressedSha256);
    assert.ok(source.committeeDecision.reference.trim().length > 0);

    const matched = resolveCandidateReviewState(source.rawiId, {
      upstreamCommit: source.upstreamCommit,
      compressedSha256: source.expectedCompressedSha256,
    });
    assert.deepEqual(matched.blockers, []);
    assert.equal(matched.state, 'APPROVED');
  }
});

test('any byte or commit drift drops the reading back to pending with a named reason', () => {
  const source = candidateSourceForRawi('hisham');
  assert.ok(source);

  const tamperedBytes = resolveCandidateReviewState('hisham', {
    upstreamCommit: source.upstreamCommit,
    compressedSha256: 'f'.repeat(64),
  });
  assert.equal(tamperedBytes.state, 'PENDING_SCHOLAR_REVIEW');
  assert.deepEqual(tamperedBytes.blockers, ['ARTIFACT_DIGEST_MISMATCH']);
  assert.equal(tamperedBytes.declaredDecisionState, 'APPROVED');

  const movedPin = resolveCandidateReviewState('hisham', {
    upstreamCommit: '0'.repeat(40),
    compressedSha256: source.expectedCompressedSha256,
  });
  assert.equal(movedPin.state, 'PENDING_SCHOLAR_REVIEW');
  assert.deepEqual(movedPin.blockers, ['UPSTREAM_COMMIT_MISMATCH']);

  const unknown = resolveCandidateReviewState('hafs', { upstreamCommit: source.upstreamCommit, compressedSha256: source.expectedCompressedSha256 });
  assert.equal(unknown.state, 'PENDING_SCHOLAR_REVIEW');
  assert.deepEqual(unknown.blockers, ['UNKNOWN_CANDIDATE_RAWI']);
});

test('Ishaq and Idris carry the upstream-identical-body review caveat explicitly', () => {
  for (const rawiId of ['ishaq', 'idris']) {
    const source = QURAN_FULL_TEXT_CANDIDATES.find(x => x.rawiId === rawiId);
    assert.ok(source?.caveat);
    assert.match(source.caveat, /إسحاق|إدريس/);
  }
});

/*
 * تطابقُ البصمة بين إسحاق وإدريس حقيقةُ مصدرٍ لا عطل: البايتات المنشورة واحدة. المطلوب
 * ألّا يمحو هذا التطابقُ هويةَ إحداهما — لا أن يُختلق فرقٌ ليس في المصدر.
 */
test('identical upstream bodies do not collapse Ishaq and Idris into one identity', () => {
  const ishaq = candidateSourceForRawi('ishaq');
  const idris = candidateSourceForRawi('idris');
  assert.ok(ishaq && idris);
  assert.equal(ishaq.expectedCompressedSha256, idris.expectedCompressedSha256);
  assert.notEqual(ishaq.rawiId, idris.rawiId);
  assert.notEqual(ishaq.deliveryKey, idris.deliveryKey);
  assert.notEqual(ishaq.upstreamPath, idris.upstreamPath);
  assert.equal(resolveCandidateReviewState('ishaq', { upstreamCommit: ishaq.upstreamCommit, compressedSha256: ishaq.expectedCompressedSha256 }).rawiId, 'ishaq');
  assert.equal(resolveCandidateReviewState('idris', { upstreamCommit: idris.upstreamCommit, compressedSha256: idris.expectedCompressedSha256 }).rawiId, 'idris');
});

/* الدوريّان لا يلتقيان: أحدهما مُسلَّم عن أبي عمرو، والآخر مرشّح عن الكسائي. */
test('the two Duri identities can never resolve to one candidate package', () => {
  assert.ok(KFGQPC_DELIVERED_RAWI_IDS.includes('al-duri-abu-amr'));
  assert.equal(candidateSourceForRawi('al-duri-abu-amr'), undefined);
  const kisai = candidateSourceForRawi('al-duri-kisai');
  assert.ok(kisai);
  assert.equal(kisai.deliveryKey, 'duri-al-kisai');
  assert.match(kisai.upstreamPath, /QiraahDuriKisai\.json\.deflate$/);
});
