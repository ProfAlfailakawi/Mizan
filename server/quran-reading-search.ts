/*
 * البحث في نصّ الرواية — رواية بروايتها، بلا رجوعٍ إلى غيرها.
 *
 * البحثُ أخطرُ ما يُسدّ بالرجوع الاحتياطي: من يبحث في نصّ ورشٍ ولا تكون حزمةُ ورشٍ حاضرة،
 * فأسهلُ شيءٍ أن يُعاد له نصُّ حفص — فيبدو البحثُ عاملًا وهو يعرض نصًّا ليس نصَّه. ولذلك
 * تفشل هذه الطبقة صراحةً باسمها ولا تعيد صفَّ روايةٍ أخرى بحال.
 *
 * وثلاثةُ فروقٍ تُحفظ هنا ولا تُخلط:
 *   · نصُّ العرض هو بايتات الحزمة كما هي — لا يُطبَّع ولا يُجرَّد ليظهر للمستعمل.
 *   · نصُّ البحث مُطبَّعٌ للمطابقة وحدها، ولا يُعرض قطّ.
 *   · الموضعُ الأصلي هو ترقيم الرواية، والقانونيُّ يُشتقّ من جسر المواضع صراحةً — ولا
 *     يُفترض دورانٌ عكسيٌّ متطابق، فالعكسُ ناقصٌ عند التقسيم فيُعلَن `UNRESOLVED`.
 *
 * والفهارس لا تُحمَّل جميعًا: عشرون مصحفًا في الذاكرة دفعةً واحدة كلفةٌ لا يحتملها لوحٌ في
 * قاعة. فيُبنى فهرسُ الرواية عند أول بحثٍ فيها، ويُحتفظ بعددٍ محدودٍ منها، ويُسقَط الأقدم.
 */

import { CANONICAL_READING_BY_RAWI } from '../src/lib/canonical-readings';
import { MIZAN_IDENTITY_CROSSWALK, surahCountAssurance } from '../src/lib/quran-locus-crosswalk';
import { ayahCountOf, type QuranLocus } from '../src/lib/quran-canon';
import { buildPhraseIndex, buildWordIndex, normalizeQuranWord, type IndexedWord } from './quran-mutashabihat';
import { candidateRawiForDeliveryKey, type ReadingDeliveryProvenance, type ReadingDeliveryRow } from './quran-reading-delivery';

export class QuranSearchError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'QuranSearchError'; this.code = code; }
}

/** كيف عُرف الموضع القانوني لهذه النتيجة — يُعلَن ولا يُخمَّن. */
export type SearchCanonicalAssurance = 'EVIDENCED_ROW' | 'VERIFIED_COUNT_IDENTITY' | 'UNRESOLVED';

export interface QuranSearchResult {
  /** الراوي بعينه. لا يُعاد صفٌّ بمعرّف روايةٍ غير التي طُلبت. */
  readingId: string;
  /** الحزمة التي قُرئ منها هذا الصفّ، ببصمتها حين تكون معروفة. */
  sourcePackage: { authority: string; packageId?: string; sourceSha256?: string; mode: string };
  /** الموضع بترقيم الرواية الأصلي — وهو ترقيم الحزمة نفسها. */
  native: { surah: number; ayah: number };
  /** الموضع القانوني، أو `undefined` حين لا يُعرف. لا يُختلق. */
  canonical?: QuranLocus;
  canonicalAssurance: SearchCanonicalAssurance;
  /** نصُّ الآية كما في الحزمة — بلا تطبيع ولا تجريد. */
  displayText: string;
  /** المقطع المطابق كما يظهر في نصّ العرض، لا بصورته المُطبَّعة. */
  matchedPhrase: string;
  /** ترتيب الكلمة الأولى من المطابقة داخل الآية. */
  wordIndex: number;
}

export interface QuranSearchOptions {
  /** أقصى عدد نتائج. الافتراضي ٥٠، والحدّ الأعلى ٥٠٠ حتى لا يُستنزف الخادم بطلبٍ واحد. */
  limit?: number;
  /** حصرُ البحث في سورةٍ بترقيم الرواية الأصلي. */
  nativeSurah?: number;
}

interface ReadingIndex {
  readingId: string;
  words: IndexedWord[];
  textByLocus: Map<string, string>;
  /** يُملأ بحسب الحاجة: طولُ مقطعٍ لم يُسأل عنه لا يُفهرَس. */
  phraseIndexes: Map<number, Map<string, number[]>>;
  provenance: ReadingDeliveryProvenance;
}

/** الطبقة التي تُسأل عن صفوف الرواية. تُحقن ليُختبر البحث بلا خادمٍ كامل. */
export interface SearchRowSource {
  quranData(readingId: string): Promise<ReadingDeliveryRow[] | null>;
  provenanceFor(readingId: string): ReadingDeliveryProvenance;
}

/** أطولُ مقطعٍ يُفهرَس. ما زاد يُمسح من مواضع أوّل كلمتين، وهي قلّةٌ فلا يُكلّف. */
const MAX_INDEXED_PHRASE = 5;
const MIN_INDEXED_PHRASE = 2;
const locusKey = (surah: number, ayah: number) => `${surah}:${ayah}`;

function phraseIndexOf(index: ReadingIndex, size: number): Map<string, number[]> {
  const existing = index.phraseIndexes.get(size);
  if (existing) return existing;
  const built = buildPhraseIndex(index.words, size);
  index.phraseIndexes.set(size, built);
  return built;
}

export class QuranReadingSearch {
  private readonly cache = new Map<string, ReadingIndex>();

  constructor(
    private readonly source: SearchRowSource,
    /** كم فهرسًا يبقى في الذاكرة معًا. اثنان يكفيان لتبديل متسابقٍ بين روايتين. */
    private readonly maxCachedReadings = 2,
  ) {}

  /** الفهارس المحمَّلة الآن — تُقرأ في اختبارات الذاكرة ولوحة التشخيص. */
  cachedReadings(): string[] { return [...this.cache.keys()]; }

  /**
   * أطوالُ المقاطع التي بُني فهرسُها لهذه الرواية.
   *
   * تُقرأ لإثبات أن فهرسًا لم يُسأل عنه لم يُبنَ — وهي حقيقةٌ حتمية، بخلاف قياس ذاكرةٍ
   * يختلف من آلةٍ إلى آلة ومن حِملٍ إلى حِمل.
   */
  builtPhraseIndexSizes(rawiId: string): number[] {
    return [...(this.cache.get(rawiId)?.phraseIndexes.keys() ?? [])].sort((a, b) => a - b);
  }

  /** يُسقط فهرس روايةٍ عند تبديل المتسابق، فلا تتراكم مصاحفُ من لا يُسأل عنه. */
  releaseReading(rawiId: string): boolean { return this.cache.delete(rawiId); }
  releaseAll(): void { this.cache.clear(); }

  /**
   * يحلّ معرّف الرواية تحليلًا قاطعًا. لا مطابقةَ تقريبية: «الدوري» وحدها ليست معرّفًا،
   * والدوري عن أبي عمرو ليس الدوري عن الكسائي.
   */
  private resolveRawi(readingId: string): string {
    const raw = String(readingId || '').trim();
    if (CANONICAL_READING_BY_RAWI.has(raw)) return raw;
    const viaDeliveryKey = candidateRawiForDeliveryKey(raw);
    if (viaDeliveryKey) return viaDeliveryKey;
    throw new QuranSearchError(`QURAN_SEARCH_READING_UNKNOWN:${raw}`);
  }

  private async indexFor(rawiId: string): Promise<ReadingIndex> {
    const cached = this.cache.get(rawiId);
    if (cached) return cached;

    const rows = await this.source.quranData(rawiId);
    /*
     * غيابُ الحزمة فشلٌ صريح. هنا بالضبط كان يُغرى بالرجوع إلى حفص، وهنا بالضبط يُمنع:
     * «لا نتائج لروايتك لأن حزمتها غير متاحة» جوابٌ صادق، و«ها هي نتائج حفص» كذب.
     */
    if (!rows || !rows.length) throw new QuranSearchError(`QURAN_SEARCH_READING_UNAVAILABLE:${rawiId}`);

    const words = buildWordIndex(rows as unknown as Record<string, unknown>[]);
    const textByLocus = new Map<string, string>();
    for (const row of rows) textByLocus.set(locusKey(Number(row.sora), Number(row.aya_no)), String(row.aya_text || ''));

    /*
     * فهارسُ المقاطع تُبنى بحسب الحاجة لا دفعةً واحدة.
     *
     * بناءُ أربعة فهارس لكل روايةٍ يعني أربع خرائطَ بعشرات الآلاف من المفاتيح النصّية —
     * وأكثرُ البحث كلمةٌ واحدة لا تحتاج منها شيئًا. فيُبنى فهرسُ الطول المطلوب عند أول
     * استعلامٍ بذلك الطول، ويُحفظ لما بعده.
     */
    const phraseIndexes = new Map<number, Map<string, number[]>>();

    const index: ReadingIndex = { readingId: rawiId, words, textByLocus, phraseIndexes, provenance: this.source.provenanceFor(rawiId) };

    // إسقاطُ الأقدم قبل الإضافة، فلا يتجاوز المقيمُ في الذاكرة الحدَّ لحظةً واحدة.
    while (this.cache.size >= Math.max(1, this.maxCachedReadings)) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
    this.cache.set(rawiId, index);
    return index;
  }

  /**
   * الموضع القانوني لموضعٍ أصليّ. يمرّ من صفوف الدليل صراحةً؛ وحين لا يوجد صفٌّ يُقبل
   * التطابق فقط إن كان عدُّ السورة مُتحقَّقًا مطابقًا — وإلا `UNRESOLVED` بلا موضع.
   */
  private canonicalOf(rawiId: string, surah: number, ayah: number): { canonical?: QuranLocus; assurance: SearchCanonicalAssurance } {
    const evidenced = MIZAN_IDENTITY_CROSSWALK.toCanonicalFromEvidence(rawiId, { surah, ayah });
    if (evidenced) return { canonical: evidenced, assurance: 'EVIDENCED_ROW' };
    if (surahCountAssurance(rawiId, surah) === 'VERIFIED_COUNT_IDENTITY' && ayah >= 1 && ayah <= ayahCountOf(surah)) {
      return { canonical: { surah, ayah }, assurance: 'VERIFIED_COUNT_IDENTITY' };
    }
    return { assurance: 'UNRESOLVED' };
  }

  /**
   * يبحث في رواية واحدة. يعود بنتائج تلك الرواية وحدها، أو يرمي باسم السبب.
   */
  async search(readingId: string, query: string, options: QuranSearchOptions = {}): Promise<QuranSearchResult[]> {
    const rawiId = this.resolveRawi(readingId);
    const terms = String(query || '').split(/\s+/).map(normalizeQuranWord).filter(Boolean);
    if (!terms.length) throw new QuranSearchError('QURAN_SEARCH_QUERY_EMPTY');

    const index = await this.indexFor(rawiId);
    const limit = Math.min(Math.max(1, options.limit ?? 50), 500);
    const results: QuranSearchResult[] = [];
    const seen = new Set<string>();

    const emit = (start: number, length: number) => {
      const head = index.words[start];
      if (options.nativeSurah !== undefined && head.surah !== options.nativeSurah) return;
      const key = `${head.surah}:${head.ayah}:${head.wordIndex}`;
      if (seen.has(key)) return;
      seen.add(key);
      const { canonical, assurance } = this.canonicalOf(rawiId, head.surah, head.ayah);
      results.push({
        readingId: rawiId,
        sourcePackage: {
          authority: index.provenance.authority,
          packageId: index.provenance.packageId,
          sourceSha256: index.provenance.sourceSha256,
          mode: index.provenance.mode,
        },
        native: { surah: head.surah, ayah: head.ayah },
        canonical,
        canonicalAssurance: assurance,
        displayText: index.textByLocus.get(locusKey(head.surah, head.ayah)) || '',
        matchedPhrase: index.words.slice(start, start + length).map(w => w.raw).join(' '),
        wordIndex: head.wordIndex,
      });
    };

    if (terms.length === 1) {
      for (let i = 0; i < index.words.length && results.length < limit; i++) {
        if (index.words[i].norm === terms[0]) emit(i, 1);
      }
      return results;
    }

    if (terms.length <= MAX_INDEXED_PHRASE) {
      const phraseIndex = phraseIndexOf(index, terms.length);
      for (const start of phraseIndex.get(terms.join(' ')) || []) {
        if (results.length >= limit) break;
        emit(start, terms.length);
      }
      return results;
    }

    // مقطعٌ أطول من أطول فهرس: يُمسح من مواضع كلمتيه الأوليين، ولا يُقصّ الطلب.
    const first = phraseIndexOf(index, MIN_INDEXED_PHRASE);
    for (const start of first.get(terms.slice(0, MIN_INDEXED_PHRASE).join(' ')) || []) {
      if (results.length >= limit) break;
      let ok = start + terms.length <= index.words.length;
      for (let k = 0; ok && k < terms.length; k++) {
        if (index.words[start + k].norm !== terms[k] || index.words[start + k].surah !== index.words[start].surah) ok = false;
      }
      if (ok) emit(start, terms.length);
    }
    return results;
  }
}
