/*
 * P6 — البحث في العشرين، كلُّ روايةٍ في نصّها.
 *
 * البحثُ أسهلُ ما يُسدّ بالرجوع الاحتياطي: من يبحث في نصّ ورشٍ ولا تكون حزمتُه حاضرة،
 * فأقربُ شيءٍ أن يُعاد له نصُّ حفص — فيبدو البحثُ عاملًا وهو يعرض نصًّا ليس نصَّه، ولا
 * شيء في الشاشة يقول ذلك. فهذه الاختبارات تتعمّد كلَّ صورةٍ من صور التسرّب وتتوقّع الرفض.
 *
 * والاثنتا عشرةَ المثبَّتة تُفحص بنصِّها الحقيقيّ من بايتاتها. والثماني المخدومة من مرآة
 * المجمع تحتاج الشبكة، فيُفحص فيها ما يمكن فحصه هنا بصدق: أنها تفشل **باسمها** ولا تُعيد
 * نصَّ روايةٍ أخرى. وهذا ما يُقال عنها في التقرير — لا «عشرون من عشرين» على إطلاقه.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { CANONICAL_RAWI_IDS } from '../src/lib/canonical-readings';
import { PINNED_DELIVERED_RAWI_IDS, KFGQPC_DELIVERED_RAWI_IDS } from '../src/lib/delivered-readings';
import { crosswalkCoverage } from '../src/lib/quran-locus-crosswalk';
import { islamwebArtifactPresent, loadIslamwebReadingPackage } from '../server/islamweb-reading-packages';
import { KfgqpcDeliveryRepository } from '../server/kfgqpc-delivery';
import { MizanQuranDelivery } from '../server/quran-reading-delivery';
import { QuranReadingSearch, QuranSearchError, type SearchRowSource } from '../server/quran-reading-search';

/*
 * طبقةُ تسليمٍ بلا شبكة — **مضبوطةً لا مفترَضة**.
 *
 * `KfgqpcDeliveryRepository` يسقط إلى مرآةٍ مفتوحة على الشبكة حين لا يكون R2 مهيّأً. فما
 * لم يُطفأ ذلك صراحةً، صار الاختبارُ يقيس بيئتَه لا شيفرتَه: يمرّ حيث لا شبكة ويسقط حيث
 * توجد (أو العكس)، وهو أسوأ من اختبارٍ لا يوجد — لأنه يبدو حارسًا.
 *
 * فيُطفأ هنا، ويصير المُختبَر منصوصًا: **حين تتعذّر طبقة التسليم**، تفشل الرواية باسمها
 * ولا يُسدّ مكانُها بنصِّ روايةٍ أخرى.
 */
process.env.MIZAN_DISABLE_RUNTIME_MIRROR = 'true';
const offlineDelivery = () => new MizanQuranDelivery(new KfgqpcDeliveryRepository({}));
const searchOver = (max = 2) => new QuranReadingSearch(offlineDelivery() as unknown as SearchRowSource, max);

const PINNED_WITH_BYTES = PINNED_DELIVERED_RAWI_IDS.filter(rawiId => islamwebArtifactPresent(rawiId));

/** مقطعٌ حقيقيّ من حزمة الرواية نفسها — لا نصَّ مخترعًا ولا منقولًا من روايةٍ أخرى. */
function phraseFromOwnPackage(rawiId: string, surah: number, ayah: number, words: number) {
  const pkg = loadIslamwebReadingPackage(rawiId);
  const verse = pkg.verses.find(v => v.sura_no === surah && v.aya_no === ayah);
  assert.ok(verse, `${rawiId} must carry ${surah}:${ayah} in its own package`);
  return { text: String(verse!.aya_text), phrase: String(verse!.aya_text).split(/\s+/).filter(Boolean).slice(0, words).join(' ') };
}

test('every pinned reading is searchable in its own bytes, and answers with its own identity', async () => {
  assert.ok(PINNED_WITH_BYTES.length >= 12, `expected the twelve pinned artifacts, found ${PINNED_WITH_BYTES.length}`);
  for (const rawiId of PINNED_WITH_BYTES) {
    const search = searchOver(1);
    const { phrase } = phraseFromOwnPackage(rawiId, 2, 2, 3);
    const hits = await search.search(rawiId, phrase, { limit: 10 });

    assert.ok(hits.length > 0, `${rawiId} finds a phrase taken from its own package`);
    for (const hit of hits) {
      assert.equal(hit.readingId, rawiId, 'a result may never carry another reading id');
      assert.equal(hit.sourcePackage.authority, 'ISLAMWEB_DERIVED', `${rawiId} must report its real provenance`);
      assert.equal(hit.sourcePackage.mode, 'PINNED_LOCAL_ARTIFACT');
      assert.match(String(hit.sourcePackage.sourceSha256), /^[0-9a-f]{64}$/, 'the exact bytes searched are identified');

      // الموضع الأصلي داخل حدود السورة في ترقيم الرواية نفسه.
      assert.ok(hit.native.surah >= 1 && hit.native.surah <= 114, rawiId);
      assert.ok(hit.native.ayah >= 1, rawiId);

      // والقانوني: إمّا معلومٌ بدليلٍ أو بعدٍّ متحقّق، وإمّا غير موجودٍ أصلًا — لا مُختلق.
      if (hit.canonicalAssurance === 'UNRESOLVED') assert.equal(hit.canonical, undefined, rawiId);
      else {
        assert.ok(hit.canonical, `${rawiId} claims ${hit.canonicalAssurance} without a locus`);
        assert.ok(hit.canonical!.surah >= 1 && hit.canonical!.surah <= 114);
      }

      // نصُّ العرض هو نصُّ الحزمة، لا صورةً مطبّعة.
      assert.ok(hit.displayText.length > 0, rawiId);
      assert.ok(hit.displayText.includes(hit.matchedPhrase), `${rawiId} display text must contain the matched phrase verbatim`);
    }
  }
});

test('a search result navigates back to the same verse in the same package', async () => {
  for (const rawiId of PINNED_WITH_BYTES.slice(0, 4)) {
    const search = searchOver(1);
    const { text, phrase } = phraseFromOwnPackage(rawiId, 2, 5, 3);
    const [hit] = await search.search(rawiId, phrase, { limit: 1, nativeSurah: 2 });
    assert.ok(hit, rawiId);
    const pkg = loadIslamwebReadingPackage(rawiId);
    const verse = pkg.verses.find(v => v.sura_no === hit.native.surah && v.aya_no === hit.native.ayah);
    assert.ok(verse, `${rawiId} result points at a verse that exists in its own package`);
    assert.equal(hit.displayText, String(verse!.aya_text), `${rawiId} display text is the package text, byte for byte`);
    assert.equal(text.includes(phrase), true);
  }
});

test('display text is never normalised — normalisation belongs to matching only', async () => {
  const rawiId = PINNED_WITH_BYTES[0];
  const search = searchOver(1);
  const { text } = phraseFromOwnPackage(rawiId, 2, 2, 3);
  // يُبحث بصيغةٍ مجرّدة من الضبط عمدًا، ويجب أن يعود النصُّ مضبوطًا كما في الحزمة.
  const bare = text.split(/\s+/).slice(0, 3).join(' ').replace(/[ؖ-ًؚ-ٰٟۖ-ۭ]/g, '');
  const [hit] = await search.search(rawiId, bare, { limit: 1 });
  assert.ok(hit, 'a query stripped of diacritics still matches');
  assert.equal(hit.displayText, text, 'but what comes back is the package text untouched');
});

test('a reading whose package is unavailable fails by name — never with another reading text', async () => {
  assert.equal(process.env.MIZAN_DISABLE_RUNTIME_MIRROR, 'true', 'this test is only meaningful with the mirror off');
  const search = searchOver(2);
  for (const rawiId of KFGQPC_DELIVERED_RAWI_IDS) {
    if (islamwebArtifactPresent(rawiId)) continue; // لا يُدَّعى نقصٌ حيث توجد بايتات
    await assert.rejects(
      () => search.search(rawiId, 'الحمد لله'),
      (error: QuranSearchError) => {
        assert.equal(error.code, `QURAN_SEARCH_READING_UNAVAILABLE:${rawiId}`);
        return true;
      },
      `${rawiId} must fail explicitly instead of returning something`,
    );
  }
});

test('a Warsh query never silently returns a Hafs record', async () => {
  const search = searchOver(2);
  // ورشٌ يُخدَم من المرآة، فحزمته غير متاحة هنا. والمطلوب فشلٌ لا نتائج حفص.
  await assert.rejects(() => search.search('warsh', 'الحمد لله رب'), (e: QuranSearchError) => e.code.startsWith('QURAN_SEARCH_READING_UNAVAILABLE'));
  // وحفصٌ نفسه لا يُستدعى ضمنًا: لم يُحمَّل فهرسُه أصلًا.
  assert.equal(search.cachedReadings().includes('hafs'), false, 'no Hafs index was loaded to answer a Warsh query');
});

test('requesting Hisham without a Hisham package is an explicit unavailability, not a substitution', async () => {
  const emptySource: SearchRowSource = {
    quranData: async () => null,
    provenanceFor: () => ({ readingId: 'hisham', authority: 'X', publisherAuthority: 'X', mode: 'PINNED_LOCAL_ARTIFACT', note: '', supportsPageLoci: false, supportedAnchors: [] }),
  };
  const search = new QuranReadingSearch(emptySource, 2);
  await assert.rejects(() => search.search('hisham', 'ذلك الكتاب'), (e: QuranSearchError) => e.code === 'QURAN_SEARCH_READING_UNAVAILABLE:hisham');
  assert.deepEqual(search.cachedReadings(), [], 'a failed load caches nothing');
});

test('the two Duris and the two Khalafs can never leak into one another', async () => {
  const search = searchOver(2);
  const duriKisai = await search.search('al-duri-kisai', phraseFromOwnPackage('al-duri-kisai', 2, 3, 3).phrase, { limit: 5 });
  for (const hit of duriKisai) assert.equal(hit.readingId, 'al-duri-kisai');
  // والدوري عن أبي عمرو يُخدَم من المرآة، فيفشل باسمه ولا يُخدم من حزمة الكسائي.
  await assert.rejects(() => search.search('al-duri-abu-amr', 'الحمد'), (e: QuranSearchError) => e.code === 'QURAN_SEARCH_READING_UNAVAILABLE:al-duri-abu-amr');

  const khalafHamzah = await search.search('khalaf-hamzah', phraseFromOwnPackage('khalaf-hamzah', 2, 3, 3).phrase, { limit: 5 });
  for (const hit of khalafHamzah) assert.equal(hit.readingId, 'khalaf-hamzah');
});

test('an ambiguous or unknown reading name is refused, never resolved to the nearest match', async () => {
  const search = searchOver(2);
  for (const bogus of ['الدوري', 'duri', 'خلف', 'not-a-rawi', '']) {
    await assert.rejects(() => search.search(bogus, 'الحمد'), (e: QuranSearchError) => e.code.startsWith('QURAN_SEARCH_READING_UNKNOWN'), bogus);
  }
});

test('an empty query is refused rather than answered with everything', async () => {
  const search = searchOver(1);
  for (const query of ['', '   ', '،،،', '١٢٣']) {
    await assert.rejects(() => search.search(PINNED_WITH_BYTES[0], query), (e: QuranSearchError) => e.code === 'QURAN_SEARCH_QUERY_EMPTY', JSON.stringify(query));
  }
});

test('every one of the twenty readings has a defined search behaviour — found or named', async () => {
  // بالمرآة مُطفأة: اثنتا عشرة تُبحث ببايتاتها، وثمانٍ تفشل باسمها. لا حالةَ ثالثة.
  const search = searchOver(2);
  const outcome: Record<string, 'SEARCHABLE' | 'UNAVAILABLE_BY_NAME'> = {};
  for (const rawiId of CANONICAL_RAWI_IDS) {
    /*
     * الاستعلامُ من حزمة الرواية نفسها حين تكون بايتاتُها حاضرة. وحين لا تكون، يُستعلم
     * بمقطعٍ قرآنيٍّ مشترك — والمقصود ليس إيجادَه بل إثباتُ أن الجواب فشلٌ مسمًّى بالرواية
     * لا نتائجُ روايةٍ أخرى. ولا يُختلق نصٌّ في الحالين.
     */
    const query = islamwebArtifactPresent(rawiId)
      ? phraseFromOwnPackage(rawiId, 2, 2, 3).phrase
      : 'ذلك الكتاب لا ريب';
    try {
      const hits = await search.search(rawiId, query, { limit: 1 });
      assert.ok(hits.length > 0 && hits[0].readingId === rawiId, rawiId);
      outcome[rawiId] = 'SEARCHABLE';
    } catch (error) {
      const code = (error as QuranSearchError).code || String(error);
      // فشلٌ مسمًّى بالرواية نفسها — لا صمتَ ولا نتائج غيرها.
      assert.ok(code.includes(rawiId), `${rawiId} failed without naming itself: ${code}`);
      assert.ok(code.startsWith('QURAN_SEARCH_READING_UNAVAILABLE:'), `${rawiId}: ${code}`);
      outcome[rawiId] = 'UNAVAILABLE_BY_NAME';
    }
  }
  assert.equal(Object.keys(outcome).length, 20, 'all twenty are accounted for');
  assert.equal(Object.values(outcome).filter(v => v === 'SEARCHABLE').length, PINNED_WITH_BYTES.length);
  // ولا رواية بلا سلوكٍ معلوم.
  assert.equal(Object.values(outcome).filter(v => !v).length, 0);
});

test('indexes are loaded lazily and bounded, so twenty mushafs never sit in memory at once', async () => {
  const search = searchOver(2);
  assert.deepEqual(search.cachedReadings(), [], 'nothing is loaded before the first search');

  const loaded: string[] = [];
  for (const rawiId of PINNED_WITH_BYTES.slice(0, 5)) {
    await search.search(rawiId, phraseFromOwnPackage(rawiId, 2, 2, 3).phrase, { limit: 1 });
    loaded.push(rawiId);
    assert.ok(search.cachedReadings().length <= 2, `cache grew past its bound after ${rawiId}`);
  }
  // آخر روايتين فقط تبقيان — تبديلُ المتسابق يُسقط ما قبلهما.
  assert.deepEqual(search.cachedReadings().sort(), loaded.slice(-2).sort());

  search.releaseReading(loaded.at(-1)!);
  assert.equal(search.cachedReadings().includes(loaded.at(-1)!), false);
  search.releaseAll();
  assert.deepEqual(search.cachedReadings(), []);
});

test('a repeated search on the same reading reuses its index instead of rebuilding it', async () => {
  const rawiId = PINNED_WITH_BYTES[0];
  let loads = 0;
  const delivery = offlineDelivery();
  const counting: SearchRowSource = {
    quranData: async (id: string) => { loads += 1; return delivery.quranData(id); },
    provenanceFor: (id: string) => delivery.provenanceFor(id),
  };
  const search = new QuranReadingSearch(counting, 2);
  const phrase = phraseFromOwnPackage(rawiId, 2, 2, 3).phrase;
  for (let i = 0; i < 4; i += 1) await search.search(rawiId, phrase, { limit: 1 });
  assert.equal(loads, 1, 'the package is read once, not once per search');
});

test('search results agree with the crosswalk about what is resolvable', async () => {
  for (const rawiId of PINNED_WITH_BYTES) {
    const search = searchOver(1);
    const hits = await search.search(rawiId, phraseFromOwnPackage(rawiId, 2, 2, 3).phrase, { limit: 3 });
    const questionSafe = crosswalkCoverage(rawiId).questionSafe;
    for (const hit of hits) {
      if (!questionSafe && hit.canonicalAssurance !== 'UNRESOLVED') {
        // رواية غير مكتملة الجسر قد يكون لها سورٌ متحقّقة العدّ — لكن ليس موضعًا مخترعًا.
        assert.ok(hit.canonical, `${rawiId} asserted ${hit.canonicalAssurance} without a locus`);
      }
      if (hit.canonicalAssurance === 'UNRESOLVED') assert.equal(hit.canonical, undefined, rawiId);
    }
  }
});

test('a single-word search never builds phrase indexes it does not need', async () => {
  /*
   * فهارسُ المقاطع أثقلُ ما في الطبقة: خريطةٌ بعشرات الآلاف من المفاتيح النصّية لكلِّ
   * طول. وأكثرُ البحث كلمةٌ واحدة لا تحتاج منها شيئًا.
   *
   * ويُسأل الفهرسُ عن نفسه بدل قياس ذاكرةٍ يختلف من آلةٍ إلى آلة: بعد بحثٍ بكلمةٍ واحدة
   * لا يكون قد بُني أيُّ فهرس مقاطع. حقيقةٌ حتمية لا رقمٌ يتأرجح.
   */
  const rawiId = PINNED_WITH_BYTES[0];
  const search = searchOver(1);
  await search.search(rawiId, 'الكتاب', { limit: 1 });
  assert.deepEqual(search.builtPhraseIndexSizes(rawiId), [], 'a one-word query builds no phrase index at all');

  // ومقطعٌ من ثلاث كلمات يبني فهرس الثلاثة وحده — لا الأربعة ولا الخمسة.
  const { phrase } = phraseFromOwnPackage(rawiId, 2, 2, 3);
  await search.search(rawiId, phrase, { limit: 1 });
  assert.deepEqual(search.builtPhraseIndexSizes(rawiId), [3], 'only the length actually asked for is indexed');

  // ومقطعٌ من كلمتين يضيف فهرسَه ويبقي ما بُني.
  const { phrase: two } = phraseFromOwnPackage(rawiId, 2, 2, 2);
  await search.search(rawiId, two, { limit: 1 });
  assert.deepEqual(search.builtPhraseIndexSizes(rawiId), [2, 3]);

  // وتبديلُ الرواية يُسقط فهارسَها كلَّها، فلا تتراكم مصاحفُ من لا يُسأل عنه.
  const other = PINNED_WITH_BYTES[1];
  await search.search(other, phraseFromOwnPackage(other, 2, 2, 3).phrase, { limit: 1 });
  assert.deepEqual(search.cachedReadings(), [other]);
  assert.deepEqual(search.builtPhraseIndexSizes(rawiId), [], 'a released reading keeps nothing behind');
});
