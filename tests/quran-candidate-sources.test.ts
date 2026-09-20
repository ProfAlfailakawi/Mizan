import assert from 'node:assert/strict';
import test from 'node:test';
import { DELIVERED_RAWI_IDS, KFGQPC_DELIVERED_RAWI_IDS,
  KFGQPC_DELIVERY_READING_BY_RAWI, PINNED_DELIVERY_READING_BY_RAWI } from '../src/lib/delivered-readings';
import { TEN_QIRAAT_GRAPH } from '../src/lib/scientific-core';
import { QURAN_SOURCE_AUTHORITIES, canServeAsReadingText } from '../src/lib/quran-source-authority';
import {
  AL_ISLAM_IOS_QIRAAT_COMMIT,
  QURAN_FULL_TEXT_CANDIDATES,
  candidateRawUrl,
  candidateSourceForRawi,
  resolveCandidateReviewState,
} from '../src/lib/quran-candidate-sources';

test('the candidate source register is exactly the twenty rawis, split by chain with no overlap', () => {
  /*
   * كان السجلُّ اثنتي عشرة، والثمانيةُ الباقيات تُجلب من الشبكة. فصرن كلُّهنّ فيه.
   * والمحروسُ لم يتغيّر: **العشرون مغطّاةٌ مرّةً واحدة** — لا رواية تُنسى ولا تُكرَّر
   * في سلسلتَي إسناد.
   */
  const mirror = QURAN_FULL_TEXT_CANDIDATES.filter(c => c.authority === 'KFGQPC_MIRROR_DERIVED').map(c => c.rawiId).sort();
  const islamweb = QURAN_FULL_TEXT_CANDIDATES.filter(c => c.authority === 'ISLAMWEB_DERIVED').map(c => c.rawiId).sort();
  const candidates = QURAN_FULL_TEXT_CANDIDATES.map(x => x.rawiId).sort();

  assert.equal(TEN_QIRAAT_GRAPH.length, 20);
  assert.equal(KFGQPC_DELIVERED_RAWI_IDS.length, 8);
  assert.equal(QURAN_FULL_TEXT_CANDIDATES.length, 20);
  assert.equal(new Set(candidates).size, 20, 'no rawi may appear in two chains');
  assert.deepEqual(candidates, TEN_QIRAAT_GRAPH.map(x => x.rawiId).sort());

  assert.deepEqual(mirror, [...KFGQPC_DELIVERED_RAWI_IDS].sort(),
    'the mirror chain must cover exactly the eight KFGQPC-delivered readings');
  assert.deepEqual(islamweb, TEN_QIRAAT_GRAPH.map(x => x.rawiId).filter(id => !KFGQPC_DELIVERED_RAWI_IDS.includes(id)).sort());
  assert.equal(DELIVERED_RAWI_IDS.length, 20);
});

/*
 * جدول التسليم وحدةٌ طرفية لا تستورد السجلّ (لئلّا تنشأ حلقة استيراد)، فيحرس هذا الاختبار
 * تطابقَهما: أي رواية تُضاف في أحدهما وتُنسى في الآخر تسقط هنا لا في الإنتاج.
 */
test('the pinned delivery table and the candidate register never drift apart', () => {
  /*
   * ويُحرَس الجدولان معًا الآن. فحين أُضيفت حزمُ المرآة إلى السجلّ كُتب مفتاحُ تسليم
   * البزّي `al-bazzi` بينما جدولُ التسليم يقول `bazzi` — مفتاحان لروايةٍ واحدة. وهذا
   * الحارسُ هو الذي أمسكها.
   */
  const keysOf = (authority: string) => Object.fromEntries(
    QURAN_FULL_TEXT_CANDIDATES.filter(c => c.authority === authority).map(c => [c.rawiId, c.deliveryKey]));

  assert.deepEqual(PINNED_DELIVERY_READING_BY_RAWI, keysOf('ISLAMWEB_DERIVED'));
  assert.deepEqual(KFGQPC_DELIVERY_READING_BY_RAWI, keysOf('KFGQPC_MIRROR_DERIVED'));

  const allKeys = QURAN_FULL_TEXT_CANDIDATES.map(c => c.deliveryKey);
  assert.equal(new Set(allKeys).size, 20, 'delivery keys must stay unique across both chains');
});

test('candidate Quran bytes are pinned by commit and digest, and never re-badged as KFGQPC', () => {
  /*
   * الخطيئةُ التي يحرسها هذا الاختبار: أن يُنسب نصٌّ إلى ناشرٍ لم ينشره — «فتُدخَل
   * بيانات Quranpedia ثم تُسمّى KFGQPC».
   *
   * وكان يُثبتها بأن **كلّ** مرشَّحٍ من إسلام ويب. ثمّ دخلت حزمُ المجمّع من مرآته،
   * والمجمّعُ ناشرُها حقًّا — فذلك البرهانُ سقط، لا الخطيئةُ المحروسُ منها. فصار
   * الحارسُ يفحص القاعدةَ نفسَها على السلسلتين:
   *
   *   · نصُّ إسلام ويب لا يُسمّى KFGQPC أبدًا — كما كان.
   *   · ولا يُدّعى إثباتٌ رسميّ إلّا بمطابقة بصمة الناشر. وما وصل من مرآةٍ يبقى
   *     `MIRROR_REPORTED` مهما كان ناشرُه، فلا يذوب الفرقُ بين «مُثبَتٍ ببصمةٍ
   *     رسميّة» و«منقولٍ عن مضيف».
   */
  assert.match(AL_ISLAM_IOS_QIRAAT_COMMIT, /^[0-9a-f]{40}$/);
  assert.equal(QURAN_FULL_TEXT_CANDIDATES.length, 20);

  for (const source of QURAN_FULL_TEXT_CANDIDATES) {
    assert.equal(source.role, 'FULL_TEXT_CANDIDATE');
    assert.equal(source.permissionState, 'OWNER_REPORTED_PERMISSION');
    assert.match(source.expectedCompressedSha256, /^[0-9a-f]{64}$/);
    assert.match(source.upstreamCommit, /^[0-9a-f]{40}$/);

    // لا إثباتَ رسميّ يُدّعى بلا مطابقةِ بصمة — ولم تُطابَق بصمةُ حزمةٍ رسميّةٍ بعد.
    assert.equal(source.publisherAttribution, 'MIRROR_REPORTED',
      `${source.rawiId}: no candidate may claim an official-digest-proven publisher yet`);

    if (source.authority === 'ISLAMWEB_DERIVED') {
      assert.equal(source.upstreamCommit, AL_ISLAM_IOS_QIRAAT_COMMIT);
      assert.equal(source.publisherAuthority, 'ISLAMWEB');
      assert.notEqual(source.publisherAuthority as string, 'KFGQPC',
        'Islamweb text must never be re-badged as KFGQPC');
      assert.match(source.upstreamPath, /^Resources\/Data\/Quran\/Qiraah.+\.json\.deflate$/);
      assert.ok(!KFGQPC_DELIVERED_RAWI_IDS.includes(source.rawiId));
      assert.equal(candidateRawUrl(source), `https://raw.githubusercontent.com/${source.upstreamRepository}/${AL_ISLAM_IOS_QIRAAT_COMMIT}/${source.upstreamPath}`);
    } else {
      assert.equal(source.authority, 'KFGQPC_MIRROR_DERIVED');
      assert.equal(source.publisherAuthority, 'KFGQPC');
      // سلسلةُ الوصول مفصولةٌ عن الناشر: مضيفٌ عامّ، لا موقعُ المجمّع.
      assert.equal(source.upstreamRepository, 'thetruetruth/quran-data-kfgqpc');
      assert.match(String(source.upstreamSourceSha256), /^[0-9a-f]{64}$/,
        `${source.rawiId}: a derived artifact must pin the upstream bytes it came from`);
      assert.ok(KFGQPC_DELIVERED_RAWI_IDS.includes(source.rawiId));
    }
  }

  // الناشران مسجَّلان في فهرس السلطات العام وكلاهما صالحٌ ليكون نصَّ رواية.
  assert.ok(QURAN_SOURCE_AUTHORITIES.ISLAMWEB);
  assert.ok(QURAN_SOURCE_AUTHORITIES.KFGQPC);
  assert.equal(canServeAsReadingText('ISLAMWEB'), true);
  assert.equal(canServeAsReadingText('KFGQPC'), true);
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

  /*
   * كان المثالُ هنا «حفص» لأنه لم يكن مرشّحًا. وقد صار له أثرٌ مجمَّدٌ من مرآة المجمّع،
   * فلم يعد يصلح مثالًا لرواية مجهولة — والحارسُ يفحص المجهول، لا حفصًا بعينه.
   */
  const unknown = resolveCandidateReviewState('rawi-that-does-not-exist', { upstreamCommit: source.upstreamCommit, compressedSha256: source.expectedCompressedSha256 });
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

/*
 * الدوريّان لا يلتقيان: أحدهما عن أبي عمرو والآخر عن الكسائي، واسمُهما واحد. وخلطُهما
 * يعني خدمةَ نصّ روايةٍ باسم أخرى — وهو أسوأُ ما يمكن أن يقع في هذا النظام.
 *
 * وكان الحارسُ يُثبت ذلك بأن الدوريَّ عن أبي عمرو **بلا مرشّح أصلًا**. وقد صار له أثرٌ
 * مجمَّدٌ من مرآة المجمّع، فذلك البرهانُ سقط — لا الثابتُ نفسُه. فيُثبَت الآن مباشرةً:
 * لكلٍّ منهما سلسلةُ إسنادٍ وأثرٌ وبصمةٌ ونظامُ عدٍّ ونصٌّ مختلف.
 */
test('the two Duri identities can never resolve to one candidate package', () => {
  assert.ok(KFGQPC_DELIVERED_RAWI_IDS.includes('al-duri-abu-amr'));
  const abuAmr = candidateSourceForRawi('al-duri-abu-amr');
  const kisai = candidateSourceForRawi('al-duri-kisai');
  assert.ok(abuAmr);
  assert.ok(kisai);

  assert.equal(abuAmr.deliveryKey, 'duri-abi-amr');
  assert.equal(kisai.deliveryKey, 'duri-al-kisai');
  assert.match(kisai.upstreamPath, /QiraahDuriKisai\.json\.deflate$/);

  assert.notEqual(abuAmr.authority, kisai.authority);
  assert.notEqual(abuAmr.expectedCompressedSha256, kisai.expectedCompressedSha256);
  assert.notEqual(abuAmr.nativeCountSystem, kisai.nativeCountSystem);
  assert.notEqual(
    abuAmr.artifactFileName || abuAmr.upstreamPath,
    kisai.artifactFileName || kisai.upstreamPath,
    'the two Duri readings must never read the same artifact off disk');
});
