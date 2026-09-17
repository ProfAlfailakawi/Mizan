/*
 * ما تستطيعه كلُّ روايةٍ من العشرين — طبقةً طبقة، لا رايةً واحدة.
 *
 * كان السؤال يُطرح بـ«هل هذه الرواية مدعومة؟»، وهو سؤالٌ لا جواب صادق له: ورشٌ نصُّه
 * حاضر وجسرُ مواضعه مكتمل، ولا يوجد له علمُ وقفٍ صادرٌ من المجمع. فالجواب بـ«نعم» يَعِد
 * بما لا نملك، والجواب بـ«لا» يمنع ما نملكه. وكلاهما كذب.
 *
 * فالقدرةُ هنا مفصولةٌ إلى طبقات، ولكلِّ طبقةٍ حالةٌ تُشتقّ من الحالة الحقيقية للشجرة لا
 * من جدولٍ مكتوب:
 *   · متاحة، ومعها مصدرُها المحدَّد.
 *   · تحتاج طبقةَ التسليم وقت التشغيل — وهذا ليس عجزًا، هو شرطُ بيئة.
 *   · غير متاحة، **بسببٍ مسمًّى** يُعرض ويُسجَّل: `UNAVAILABLE_NO_WAQF_DATA` لا «غير مدعوم».
 *
 * وثلاثة قيود لا تُخرق هنا:
 *   1. لا رجوعَ بين الروايات. طبقةٌ غائبةٌ تعود بسببها ولا تُسدّ بحزمة روايةٍ أخرى.
 *   2. لا غسلَ إسناد. رواية نصُّها مشتقٌّ من إسلام ويب لا تُنسب قدرتُها إلى المجمع.
 *   3. الصوتُ حفصٌ عالميًّا — وهذه سياسةٌ معلنة تخصّ الصوت وحده، ولا تُقرأ دعمًا للنصّ.
 */

import { CANONICAL_RAWI_IDS, CANONICAL_READING_BY_RAWI } from './canonical-readings';
import { KFGQPC_DELIVERED_RAWI_IDS, PINNED_DELIVERED_RAWI_IDS } from './delivered-readings';
import { candidateSourceForRawi } from './quran-candidate-sources';
import { crosswalkCoverage } from './quran-locus-crosswalk';
import { countSystemForReading } from './reading-count-systems';
import { audioProfileForReading } from './global-hafs-audio';

/** الطبقات التي تُسأل عنها الرواية. إضافةُ طبقةٍ هنا تُلزم كلَّ رواية بجوابٍ عنها. */
export const QURAN_CAPABILITY_LAYERS = [
  'FULL_TEXT',
  'CANONICAL_NATIVE_ALIGNMENT',
  'BASIC_TEXT_COMPARISON',
  'QIRAAT_VARIANT_KNOWLEDGE',
  'WAQF',
  'TAJWEED',
  'VISUAL_REFERENCE',
  'MUTASHABIHAT',
  'ADVANCED_INTELLIGENCE',
  'AUDIO_ACTION',
] as const;
export type QuranCapabilityLayer = (typeof QURAN_CAPABILITY_LAYERS)[number];

export type CapabilityState = 'AVAILABLE' | 'REQUIRES_DELIVERY_LAYER' | 'UNAVAILABLE';

export interface CapabilityVerdict {
  layer: QuranCapabilityLayer;
  state: CapabilityState;
  /** من أين تأتي هذه القدرة فعلًا — لا تُنسب قدرةٌ إلى ناشرٍ لم يصدرها. */
  source?: string;
  /** سببٌ مسمًّى حين لا تكون متاحة. يُعرض ويُسجَّل، ولا يُستبدل بصمت. */
  reason?: string;
}

export interface ReadingCapabilityProfile {
  rawiId: string;
  qiraahId: string;
  labelArabic: string;
  layers: Record<QuranCapabilityLayer, CapabilityVerdict>;
}

/*
 * الستُّ التي أصدر لها مجمعُ الملك فهد بياناتِ الوقف والتجويد والمرجعِ البصري. وهذا حدٌّ
 * صحيح لا نقص: لا يُصنع علمُ وقفٍ لروايةٍ لم يصدر لها. والخطرُ في إخفائه لا في ذكره.
 */
const KFGQPC_INTELLIGENCE_RAWIS = new Set(['hafs', 'warsh', 'shubah', 'qalun', 'al-duri-abu-amr', 'al-susi']);

/** التشابه اللفظي يُبنى على فهرسِ نصٍّ حاضر، فيتبع توفّر النصّ لا بيانات المجمع. */
const available = (source: string): Omit<CapabilityVerdict, 'layer'> => ({ state: 'AVAILABLE', source });
const unavailable = (reason: string): Omit<CapabilityVerdict, 'layer'> => ({ state: 'UNAVAILABLE', reason });

function textLayer(rawiId: string): Omit<CapabilityVerdict, 'layer'> {
  const candidate = candidateSourceForRawi(rawiId);
  if (candidate) {
    return available(`ISLAMWEB_DERIVED@${candidate.upstreamRepository}@${candidate.upstreamCommit.slice(0, 12)}`);
  }
  if (KFGQPC_DELIVERED_RAWI_IDS.includes(rawiId)) {
    return { state: 'REQUIRES_DELIVERY_LAYER', source: 'KFGQPC_DELIVERY', reason: 'REQUIRES_DELIVERY_LAYER_AT_RUNTIME' };
  }
  return unavailable('UNAVAILABLE_NO_TEXT_SOURCE');
}

function alignmentLayer(rawiId: string): Omit<CapabilityVerdict, 'layer'> {
  const coverage = crosswalkCoverage(rawiId);
  if (coverage.questionSafe) {
    const system = countSystemForReading(rawiId);
    return available(`${system?.system || 'UNKNOWN'}·${system?.assurance || 'UNVERIFIED'}`);
  }
  return unavailable(`UNAVAILABLE_CROSSWALK_UNRESOLVED:${coverage.surahsRequiringEvidence.length}`);
}

function kfgqpcLayer(rawiId: string, reason: string): Omit<CapabilityVerdict, 'layer'> {
  if (!KFGQPC_INTELLIGENCE_RAWIS.has(rawiId)) return unavailable(reason);
  // النسبة إلى المجمع مقصورةٌ على من أصدر لها المجمع بياناتٍ فعلًا — لا غسلَ إسناد.
  if (PINNED_DELIVERED_RAWI_IDS.includes(rawiId)) return unavailable(reason);
  return { state: 'REQUIRES_DELIVERY_LAYER', source: 'KFGQPC_OFFICIAL_METADATA', reason: 'REQUIRES_DELIVERY_LAYER_AT_RUNTIME' };
}

/**
 * المقارنة النصّية الأساسية.
 *
 * تُعمَّم حيث يوجد نصٌّ **و** جسرُ مواضعَ محلول، لأنها بلا الجسر تقارن موضعين مختلفين
 * وتسمّيهما واحدًا. وهي مقارنةُ نصٍّ لا علمَ قراءاتٍ: لا تُقدَّم بديلًا عن
 * `QIRAAT_VARIANT_KNOWLEDGE` ولا تُسمَّى باسمه.
 */
function comparisonLayer(text: Omit<CapabilityVerdict, 'layer'>, alignment: Omit<CapabilityVerdict, 'layer'>): Omit<CapabilityVerdict, 'layer'> {
  if (text.state === 'UNAVAILABLE') return unavailable('UNAVAILABLE_NO_TEXT_SOURCE');
  if (alignment.state !== 'AVAILABLE') return unavailable(String(alignment.reason || 'UNAVAILABLE_CROSSWALK_UNRESOLVED'));
  if (text.state === 'REQUIRES_DELIVERY_LAYER') return { state: 'REQUIRES_DELIVERY_LAYER', source: text.source, reason: 'REQUIRES_DELIVERY_LAYER_AT_RUNTIME' };
  return available(`SOURCE_AWARE_TEXT_COMPARISON·${text.source}`);
}

export function readingCapabilityProfile(rawiId: string): ReadingCapabilityProfile {
  const reading = CANONICAL_READING_BY_RAWI.get(rawiId);
  if (!reading) throw new Error(`QURAN_CAPABILITY_UNKNOWN_RAWI:${rawiId}`);

  const text = textLayer(rawiId);
  const alignment = alignmentLayer(rawiId);
  const audio = audioProfileForReading(rawiId);

  const raw: Record<QuranCapabilityLayer, Omit<CapabilityVerdict, 'layer'>> = {
    FULL_TEXT: text,
    CANONICAL_NATIVE_ALIGNMENT: alignment,
    BASIC_TEXT_COMPARISON: comparisonLayer(text, alignment),
    QIRAAT_VARIANT_KNOWLEDGE: kfgqpcLayer(rawiId, 'UNAVAILABLE_NO_VARIANT_KNOWLEDGE_DATA'),
    WAQF: kfgqpcLayer(rawiId, 'UNAVAILABLE_NO_WAQF_DATA'),
    TAJWEED: kfgqpcLayer(rawiId, 'UNAVAILABLE_NO_TAJWEED_DATA'),
    VISUAL_REFERENCE: kfgqpcLayer(rawiId, 'UNAVAILABLE_NO_OFFICIAL_PAGE_DATA'),
    MUTASHABIHAT: text.state === 'UNAVAILABLE'
      ? unavailable('UNAVAILABLE_NO_TEXT_SOURCE')
      : text.state === 'REQUIRES_DELIVERY_LAYER'
        ? { state: 'REQUIRES_DELIVERY_LAYER', source: text.source, reason: 'REQUIRES_DELIVERY_LAYER_AT_RUNTIME' }
        : available(`WORD_INDEX·${text.source}`),
    ADVANCED_INTELLIGENCE: kfgqpcLayer(rawiId, 'UNAVAILABLE_NO_ADVANCED_INTELLIGENCE_DATA'),
    // الصوتُ حفصٌ للعشرين بسياسةٍ معلنة. مصدرُه يقول ذلك صراحةً فلا يُقرأ دعمًا لنصّها.
    AUDIO_ACTION: audio
      ? available(`GLOBAL_HAFS_AUDIO·${audio.reading}`)
      : unavailable('UNAVAILABLE_NO_AUDIO_PROFILE'),
  };

  const layers = Object.fromEntries(
    QURAN_CAPABILITY_LAYERS.map(layer => [layer, { layer, ...raw[layer] }]),
  ) as Record<QuranCapabilityLayer, CapabilityVerdict>;

  return { rawiId, qiraahId: reading.qiraahId, labelArabic: reading.labelArabic, layers };
}

/** العشرون جميعًا — مصدرُ لوحة الجاهزية والتقرير، يُحسب ولا يُكتب. */
export function readingCapabilityProfiles(): ReadingCapabilityProfile[] {
  return CANONICAL_RAWI_IDS.map(readingCapabilityProfile);
}

/**
 * جوابٌ واحدٌ صريح عن طبقةٍ بعينها. يُنادى قبل تشغيل أيِّ ميزة: ما لم يكن `AVAILABLE`
 * يُعرض سببُه ولا تُشغَّل الميزة بنصِّ روايةٍ أخرى ولا تُسقط الشاشة.
 */
export function capabilityFor(rawiId: string, layer: QuranCapabilityLayer): CapabilityVerdict {
  return readingCapabilityProfile(rawiId).layers[layer];
}
