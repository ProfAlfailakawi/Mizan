/*
 * أوجهٌ داخل نظام عدٍّ واحد، لا يحملها quran-ws نظامًا مستقلًّا.
 *
 * quran-ws يحمل البصريَّ على قول أيوب بن المتوكل (6204). والبصريُّ على قول عاصم الجحدري
 * (6205) يزيد عليه موضعًا واحدًا: «قال فالحق والحق أقول» في ص. وهو العدُّ الذي اعتمده
 * مصحف التيسير ليعقوب، فيلزم روحًا. فيُبنى هنا وجهًا مسمّى فوق البايتات المجمَّدة كما هي،
 * بنصّ دليله، ولا يُمسّ الأصل.
 */

import type { BoundaryPrimitiveDocument } from './quran-count-boundary-mapping';

export interface NamedCountVariant {
  id: string;
  base: string;
  /** المواضع التي يزيد بها الوجهُ على أصله: { سورة، آية كوفية، نوع، الكلمة للتحقّق }. */
  adds: ReadonlyArray<{ surah: number; kufiAyah: number; kind: 'end'; word: string }>;
  evidence: string;
}

export const BASRI_JAHDARI: NamedCountVariant = {
  id: 'basri-jahdari',
  base: 'basri',
  adds: [{ surah: 38, kufiAyah: 84, kind: 'end', word: 'أقول' }],
  evidence:
    'الداني، البيان (ط. غانم قدوري الحمد) ص79–80: «وأما عدد عاصم الجحدري فهو ستة آلاف ومئتان وخمس آيات، وذلك على قول من قال إن عاصمًا كان يعد في ص: والحق أقول»، '
    + 'وفي باب الاشتراك: «وفي ص بخلاف عن البصري: والحق أقول». ومصحف التيسير ليعقوب ص643: «وعدد آي القرآن في قول البصريين ٦٢٠٥ أو ٦٢٠٤… والأول هو ما تم اعتماده».',
};

export const NAMED_COUNT_VARIANTS: readonly NamedCountVariant[] = [BASRI_JAHDARI];

/** يعيد نسخةً من الوثيقة فيها الأوجهُ المسمّاة أنظمةً — ويفشل إن لم يجد موضعًا بكلمته. */
export function withNamedVariants(document: BoundaryPrimitiveDocument): BoundaryPrimitiveDocument {
  const doc: BoundaryPrimitiveDocument = JSON.parse(JSON.stringify(document));
  for (const variant of NAMED_COUNT_VARIANTS) {
    doc._counting_system_order = [...(doc._counting_system_order ?? []), variant.id];
    for (const ayahs of Object.values(doc.surahs)) {
      for (const primitive of Object.values(ayahs)) {
        for (const point of [...(primitive.internal ?? []), ...(primitive.end ? [primitive.end] : [])]) {
          if (point.counted_by.includes(variant.base)) point.counted_by.push(variant.id);
        }
      }
    }
    for (const add of variant.adds) {
      const end = doc.surahs[String(add.surah)]?.[String(add.kufiAyah)]?.end;
      if (!end || !(end.word ?? '').endsWith(add.word)) {
        throw new Error(`NAMED_VARIANT_POINT_MISSING:${variant.id}:${add.surah}:${add.kufiAyah}:${add.word}`);
      }
      if (!end.counted_by.includes(variant.id)) end.counted_by.push(variant.id);
    }
  }
  return doc;
}
