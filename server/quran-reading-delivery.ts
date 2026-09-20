/*
 * واجهة تسليم النص لكل رواية — العشرون خلف بابٍ واحد، بلا خلط إسناد.
 *
 * كانت كل طبقات النص تنادي `KfgqpcDeliveryRepository` مباشرةً. وهذا يعمل ما دامت الروايات
 * ثمانيًا مصدرُها واحد، لكنه ينكسر إسناديًّا بمجرّد دخول حزمٍ من ناشرٍ آخر: تمرّ بيانات
 * Islamweb من صنفٍ اسمه KFGQPC ويخرج الرد بترويسة `X-MIZAN-Source-Authority: KFGQPC`.
 * فيصير الكذب في الإسناد أثرًا جانبيًّا للبنية لا قرارًا من أحد.
 *
 * هذه الواجهة تفصل السؤالين: «من أين يأتي نصّ هذه الرواية؟» و«ما إسناده؟». توجّه النداء
 * إلى مصدره الصحيح، وتعيد معه بيان إسنادٍ مشتقًّا من الرواية نفسها لا ثابتًا.
 *
 * وثلاثة قيود لا تُخرق:
 *   - لا رجوع بين الروايات بحال. رواية بلا حزمة تعيد `null`، ولا تعيد نصّ غيرها.
 *   - المواضع المُعادة هنا بترقيم الرواية الأصلي. الانتقال من إحداثي ميزان القانوني يمرّ
 *     من `quran-locus-crosswalk` وحده.
 *   - المرساة لا تُدّعى: رواية بلا صفحاتٍ في حزمتها لا تُعرض عليها مرساة «بداية صفحة».
 */

import { QURAN_FULL_TEXT_CANDIDATES, candidateSourceForRawi } from '../src/lib/quran-candidate-sources';
import { MIZAN_IDENTITY_CROSSWALK, crosswalkCoverage, surahCountAssurance } from '../src/lib/quran-locus-crosswalk';
import { ayahCountOf, juzOfLocus, surahNameArabic, surahNameEnglish } from '../src/lib/quran-canon';
import { KfgqpcDeliveryRepository, type KfgqpcDeliveryPassage } from './kfgqpc-delivery';
import { islamwebPackageStatus, loadIslamwebReadingPackage } from './islamweb-reading-packages';
import { packageCarriesPageLoci } from './quran-candidate-source-vault';
import { verifyServedPackageNumbering } from '../src/lib/quran-delivery-count-guard';
import { KFGQPC_DELIVERY_READING_BY_RAWI } from '../src/lib/delivered-readings';

/**
 * أيُّ هجاءٍ يصل ← الراوي، للروايات التي قِيس ترقيمُ حزمتها.
 * يُقبل معرّفُ الراوي ومفتاحُ التسليم معًا، فلا يفلت الحارسُ من باب الهجاء الآخر.
 */
const MIRROR_RAWI_BY_DELIVERY_KEY = new Map<string, string>(
  Object.entries(KFGQPC_DELIVERY_READING_BY_RAWI).flatMap(([rawiId, key]) => [
    [key, rawiId] as [string, string],
    [rawiId, rawiId] as [string, string],
  ]),
);

export type ReadingDeliveryAnchor = 'SURAH_START' | 'JUZ_START' | 'PAGE_START' | 'AYAH_START';

export interface ReadingDeliveryProvenance {
  /** المفتاح كما ناداه الطالب. */
  readingId: string;
  /** الرواية القانونية إن أمكن حلّها. */
  rawiId?: string;
  /** سلسلة الإسناد كما هي، لا كما يريح. */
  authority: string;
  publisherAuthority: string;
  mode: 'OFFICIAL_DELIVERY' | 'PINNED_LOCAL_ARTIFACT';
  note: string;
  packageId?: string;
  sourceSha256?: string;
  /** هل تحمل الحزمة أرقام صفحات وأسطر المصحف المطبوع؟ */
  supportsPageLoci: boolean;
  /** المراسي التي تملك الحزمة بياناتها فعلًا. */
  supportedAnchors: ReadingDeliveryAnchor[];
  caveat?: string;
}

export interface ReadingDeliveryRow {
  sora: number;
  aya_no: number;
  aya_text: string;
  page?: number;
  line_start?: number;
  line_end?: number;
  jozz?: number;
  sora_name_ar?: string;
  sora_name_en?: string;
}

export interface ReadingPassage extends Omit<KfgqpcDeliveryPassage, 'provenance' | 'ayat' | 'loci'> {
  /** الترقيم المستعمل في هذا الرد — الأصلي للرواية دائمًا. */
  numbering: 'NATIVE';
  ayat: { surah: number; ayah: number; text: string; page?: number; lineStart?: number; lineEnd?: number; juz?: number; surahNameArabic?: string; surahNameEnglish?: string }[];
  loci: { page: number; lineStart: number; lineEnd: number }[];
  provenance: ReadingDeliveryProvenance;
}

/** كل مفاتيح الاثنتي عشرة التي يُقبل النداء بها (معرّف الراوي أو مفتاح التسليم). */
const CANDIDATE_KEYS = new Map<string, string>();
for (const source of QURAN_FULL_TEXT_CANDIDATES) {
  CANDIDATE_KEYS.set(source.rawiId, source.rawiId);
  CANDIDATE_KEYS.set(source.deliveryKey, source.rawiId);
}

/** هل هذا المفتاح لإحدى الاثنتي عشرة؟ لا تخمين: مطابقةٌ صريحة أو لا شيء. */
export function candidateRawiForDeliveryKey(readingId: string): string | undefined {
  return CANDIDATE_KEYS.get(String(readingId || '').trim());
}

export class MizanQuranDelivery {
  private readonly rowCache = new Map<string, ReadingDeliveryRow[]>();

  constructor(private readonly kfgqpc: KfgqpcDeliveryRepository, private readonly env: NodeJS.ProcessEnv = process.env) {}

  /*
   * هل تحمل حزمةُ هذه الرواية مواضعَ صفحاتٍ فعلًا؟ — يُقاس من بايتاتها، لا من وسم سلسلتها.
   *
   * وسمُ السلسلة (`KFGQPC_MIRROR_DERIVED`) قائمةٌ ثانية تفترق عن البيانات أوّلَ ما تتغيّر:
   * حزمةٌ تُضاف بلا مواضع، أو مصدرٌ يبدأ بنشرها، فيكذب الوسمُ على الحزمة. فتُقرأ القدرةُ
   * من الحزمة نفسِها وتُحفظ — وحزمةٌ لا تُحمّل تُقرأ «لا مواضع»، فالفشلُ مغلق.
   */
  private readonly pageCapability = new Map<string, boolean>();
  private carriesPageLoci(rawiId: string): boolean {
    const cached = this.pageCapability.get(rawiId);
    if (cached !== undefined) return cached;
    let capable = false;
    try { capable = packageCarriesPageLoci(loadIslamwebReadingPackage(rawiId, this.env).verses); } catch { capable = false; }
    this.pageCapability.set(rawiId, capable);
    return capable;
  }

  /** بيان الإسناد لرواية — يُقرأ قبل الرد حتى تُختم الترويسة بالحقيقة لا بثابت. */
  provenanceFor(readingId: string): ReadingDeliveryProvenance {
    const rawiId = candidateRawiForDeliveryKey(readingId);
    if (rawiId) {
      const source = candidateSourceForRawi(rawiId)!;
      const coverage = crosswalkCoverage(rawiId);
      /*
       * الجزء يُشتقّ من الحدود القانونية فقط حين يكون ترقيم الرواية مطابقًا للقانوني في
       * السور كلّها (وهذا متحقَّقٌ من بايتات الحزمة لا مفترض). وإلا فلا جزء ولا مرساة جزء:
       * موضعٌ لا نعرف مقابله لا يُقال فيه «هذا الجزء الخامس».
       */
      const anchors: ReadingDeliveryAnchor[] = coverage.questionSafe
        ? ['AYAH_START', 'SURAH_START', 'JUZ_START']
        : ['AYAH_START', 'SURAH_START'];
      /*
       * ومرساةُ الصفحة تتبع ما يُسلَّم فعلًا.
       *
       * كان `supportsPageLoci: false` ثابتًا لكلّ حزمةٍ مثبَّتة، وكان صادقًا يوم لم تحمل
       * حزمةٌ موضعًا. ولمّا عادت المواضعُ صار البيانُ ينفي ما يُرسله الردُّ نفسُه في
       * `loci` — ومن يحترم العقدَ يُخفي صفحةَ المصحف وفي يده هندستُها. فيُشتقّ.
       */
      const pageCapable = this.carriesPageLoci(rawiId);
      if (pageCapable) anchors.push('PAGE_START');
      return {
        readingId,
        rawiId,
        authority: source.authority,
        publisherAuthority: source.publisherAuthority,
        mode: 'PINNED_LOCAL_ARTIFACT',
        /*
         * الملاحظةُ والمعرّفُ يُشتقّان من سلسلة الإسناد، ولا يُكتبان حرفًا ثابتًا.
         * كانا مكتوبين «مشتقٌّ من مصاحف إسلام ويب… ليس من مجمع الملك فهد» دائمًا،
         * فلمّا أُضيفت حزمُ المجمّع من مرآته صارت تُعرض بنفيٍ كاذبٍ لناشرها.
         */
        note: source.authority === 'KFGQPC_MIRROR_DERIVED'
          ? 'نصٌّ من مرآةٍ عامّة مثبَّتة، بصمتُه محفوظةٌ وقرارُ اللجنة مربوطٌ بها. ليس حزمةَ المجمّع الرسميّة المضغوطة ولم تُطابَق بصمتُه الرسميّة.'
          : 'نصٌّ مشتقٌّ من مصاحف إسلام ويب، مثبَّتٌ ببصمة وقرار لجنةٍ مربوطٍ بها. ليس من مجمع الملك فهد.',
        packageId: `${source.authority.toLowerCase().replace(/_/g, '-')}-${source.deliveryKey}-${source.upstreamCommit.slice(0, 12)}`,
        sourceSha256: source.expectedCompressedSha256,
        supportsPageLoci: pageCapable,
        supportedAnchors: anchors,
        ...(source.caveat ? { caveat: source.caveat } : {}),
      };
    }
    return {
      readingId,
      authority: 'KFGQPC',
      publisherAuthority: 'KFGQPC',
      mode: 'OFFICIAL_DELIVERY',
      note: 'نص المصحف الشريف باعتماد مجمع الملك فهد لطباعة المصحف الشريف.',
      supportsPageLoci: true,
      supportedAnchors: ['AYAH_START', 'SURAH_START', 'JUZ_START', 'PAGE_START'],
    };
  }

  /** سببُ رفض آخر حزمةِ مرآةٍ لاختلاف ترقيمها — للتشخيص وفحص ما قبل الانطلاق. */
  private readonly numberingRejections = new Map<string, string>();

  /** أسبابُ الرفض الترقيمي القائمة، بأسماء رواتها. */
  numberingRejectionReasons(): Record<string, string> {
    return Object.fromEntries(this.numberingRejections);
  }

  /**
   * صفوف نصّ الرواية. تعود `null` — لا صفوف روايةٍ أخرى — متى تعذّرت الحزمة.
   */
  async quranData(readingId: string): Promise<ReadingDeliveryRow[] | null> {
    const rawiId = candidateRawiForDeliveryKey(readingId);
    if (!rawiId) {
      const rows = (await this.kfgqpc.quranData(readingId)) as ReadingDeliveryRow[] | null;
      if (!rows) return null;
      /*
       * حزمةُ المرآة تُقاس قبل أن تُخدَم.
       *
       * ترقيمُ هذه الروايات مُثبتٌ من بايتاتٍ مثبَّتة، وجسرُ مواضعها مبنيٌّ عليه. فلو خُدمت
       * حزمةٌ ترقيمُها غير ذلك — نسخةٌ أحدث في R2، أو مفتاحٌ كُتب فوقه — لصار السؤال يُسحب
       * بجسرٍ لا يصف النصَّ المعروض. فيُرفض النصّ ولا يُخدَم بترقيمٍ مجهول، ولا يُستعاض
       * عنه بحزمة روايةٍ أخرى.
       */
      const mirrorRawi = MIRROR_RAWI_BY_DELIVERY_KEY.get(readingId);
      if (mirrorRawi) {
        const verdict = verifyServedPackageNumbering(mirrorRawi, rows as unknown as Record<string, unknown>[]);
        if (!verdict.matches) {
          this.numberingRejections.set(mirrorRawi, verdict.code || 'DELIVERY_PACKAGE_NUMBERING_MISMATCH');
          return null;
        }
        this.numberingRejections.delete(mirrorRawi);
      }
      return rows;
    }

    const cached = this.rowCache.get(rawiId);
    if (cached) return cached;
    let pkg;
    try { pkg = loadIslamwebReadingPackage(rawiId, this.env); } catch { return null; }

    /*
     * الجزء يُحسب على الإحداثي القانوني وحده.
     *
     * جدول الأجزاء كوفيٌّ، وترقيمُ هذه الصفوف أصليٌّ للرواية. وحقنُ الرقم الأصلي في الجدول
     * القانوني خطأٌ مرّتين: يعطي جزءًا خاطئًا في السور المختلِفة عدًّا، ويرمي أصلًا حين
     * يتجاوز الرقمُ الأصلي حدَّ السورة القانوني (٤:١٧٧ في الدمشقي مقابل ١٧٦ كوفيًّا).
     *
     * فالانتقال من الأصلي إلى القانوني يمرّ من صفوف الدليل صراحةً — ولا يُفترض دورانٌ
     * عكسيٌّ متطابق، لأن العكس ناقصٌ عند التقسيم. وما لا يُحلّ لا يحمل جزءًا: حقلٌ غائب
     * أصدق من جزءٍ مخترَع.
     */
    const juzForNative = (surah: number, nativeAyah: number): number | undefined => {
      const canonical = nativeAyah <= ayahCountOf(surah) && surahCountAssurance(rawiId, surah) === 'VERIFIED_COUNT_IDENTITY'
        ? { surah, ayah: nativeAyah }
        : MIZAN_IDENTITY_CROSSWALK.toCanonicalFromEvidence(rawiId, { surah, ayah: nativeAyah });
      if (!canonical) return undefined;
      try { return juzOfLocus(canonical); } catch { return undefined; }
    };

    const rows: ReadingDeliveryRow[] = pkg.verses.map(v => {
      const jozz = juzForNative(v.sura_no, v.aya_no);
      return {
        sora: v.sura_no,
        aya_no: v.aya_no,
        aya_text: v.aya_text,
        // أسماء السور بيانٌ وصفيّ مشترك لا نصٌّ قرآني، فتؤخذ من المرجع القانوني.
        sora_name_ar: surahNameArabic(v.sura_no),
        sora_name_en: surahNameEnglish(v.sura_no),
        ...(jozz !== undefined ? { jozz } : {}),
        /*
         * موضعُ المصحف يمرّ من الحزمة إلى المقطع — ولا يُستعار.
         *
         * `passage` تحته يبني `loci` من هذه الحقول، فإن غابت عاد فارغًا وسقط العرض إلى
         * نصٍّ متّصل. وحزمُ المرآة تحملها، وحزمُ إسلام ويب لا تحملها — فيبقى الفارقُ
         * ظاهرًا صادقًا: من لا صفحةَ في حزمتها لا تُعرض لها صفحة، ولا تُعار صفحةُ سواها.
         */
        ...(v.page !== undefined ? { page: v.page } : {}),
        ...(v.line_start !== undefined ? { line_start: v.line_start } : {}),
        ...(v.line_end !== undefined ? { line_end: v.line_end } : {}),
      };
    });
    this.rowCache.set(rawiId, rows);
    return rows;
  }

  /**
   * مقطعٌ بترقيم الرواية الأصلي. الصفحة والسطر يظهران حين تحملهما الحزمة فقط — ولا
   * تُستعار صفحةُ مصحفٍ لروايةٍ لا صفحات في حزمتها.
   */
  async passage(readingId: string, surah: number, startAyah: number, endAyah: number): Promise<ReadingPassage | null> {
    const provenance = this.provenanceFor(readingId);
    const rows = await this.quranData(readingId);
    if (!rows) return null;
    const selected = rows
      .filter(r => Number(r.sora) === surah && Number(r.aya_no) >= startAyah && Number(r.aya_no) <= endAyah)
      .sort((a, b) => Number(a.aya_no) - Number(b.aya_no));
    if (!selected.length) return null;

    const ayat = selected.map(r => ({
      surah: Number(r.sora),
      ayah: Number(r.aya_no),
      text: String(r.aya_text || ''),
      ...(Number.isFinite(Number(r.page)) && Number(r.page) > 0 ? { page: Number(r.page) } : {}),
      ...(Number.isFinite(Number(r.line_start)) ? { lineStart: Number(r.line_start) } : {}),
      ...(Number.isFinite(Number(r.line_end)) ? { lineEnd: Number(r.line_end) } : {}),
      ...(Number.isFinite(Number(r.jozz)) && Number(r.jozz) > 0 ? { juz: Number(r.jozz) } : {}),
      ...(r.sora_name_ar ? { surahNameArabic: String(r.sora_name_ar) } : {}),
      ...(r.sora_name_en ? { surahNameEnglish: String(r.sora_name_en) } : {}),
    }));

    const byPage = new Map<number, { page: number; lineStart: number; lineEnd: number }>();
    for (const a of ayat) {
      if (a.page === undefined || a.lineStart === undefined || a.lineEnd === undefined) continue;
      const cur = byPage.get(a.page);
      if (!cur) byPage.set(a.page, { page: a.page, lineStart: a.lineStart, lineEnd: a.lineEnd });
      else { cur.lineStart = Math.min(cur.lineStart, a.lineStart); cur.lineEnd = Math.max(cur.lineEnd, a.lineEnd); }
    }

    return {
      reading: readingId,
      numbering: 'NATIVE',
      surah,
      startAyah: ayat[0].ayah,
      endAyah: ayat[ayat.length - 1].ayah,
      ayat,
      text: ayat.map(a => a.text).join(' '),
      loci: [...byPage.values()].sort((a, b) => a.page - b.page),
      surahNameArabic: ayat[0].surahNameArabic,
      surahNameEnglish: ayat[0].surahNameEnglish,
      juz: ayat[0].juz,
      provenance,
    };
  }

  /** حالة تسليم العشرين — تُقرأ في نقطة الصحّة وتقرير الجاهزية. */
  status() {
    return {
      protocol: 'MIZAN-READING-DELIVERY-1',
      pinnedArtifacts: islamwebPackageStatus(this.env),
    };
  }
}
