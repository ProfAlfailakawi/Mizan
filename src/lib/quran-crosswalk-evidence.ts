/*
 * صفوف جسر المواضع المعتمدة — الملف الذي يُملأ من الأثر، لا يُخمَّن.
 *
 * ستّ روايات نصُّها حاضرٌ ومُتحقَّقُ البصمة، لكن عدّ آياتها يخالف العدّ القانوني في سورٍ
 * معلومة بالاسم. والانتقال بين العدَّين لا يُشتقّ من محاذاة النصّ: المحاذاة الحرفية تعطي
 * **اقتراحًا** لا يقينًا، واقتراحٌ يُسأل عليه متسابقٌ في مسابقةٍ رسمية ليس مقبولًا.
 *
 * فمصدر الصفوف هنا أثرٌ مثبَّتٌ لحدود الآي على مستوى الكلمة، مجمَّدٌ داخل المستودع نفسه
 * (`quran-sources/crosswalk/quran-ws/`) ببصمته، ومُولَّدٌ منه آليًّا إلى
 * `quran-crosswalk-boundary-evidence.generated.ts`. ولا يدخل نظامُ عدٍّ ذلك الملفَّ إلا بعد
 * مطابقة أعداد سوره الـ١١٤ كلِّها لأعداد حزمة ميزان المثبَّتة — ومخالفةُ سورةٍ واحدة تمنع
 * النظامَ كلَّه وكلَّ راوٍ يخدمه. فلا تفعيل على تطابقٍ جزئي.
 *
 * وما لم يُفعَّل يبقى `UNRESOLVED`، ويمنع فحصُ ما قبل الانطلاق فئةً عليه، ويُسمّى بسببه.
 *
 * وحدة طرفية نقيّة: بيانات فقط، تُقرأ في المتصفّح والخادم معًا، بلا شبكة.
 */

import { ayahCountOf } from './quran-canon';
import type { CrosswalkRelation, QuranLocusCrosswalk } from './quran-locus-crosswalk';
import {
  BOUNDARY_EVIDENCE_BUILD,
  GENERATED_BOUNDARY_SYSTEMS,
  type GeneratedBoundaryEvent,
} from './quran-crosswalk-boundary-evidence.generated';

/** إصدار جدول الجسر — يُسجَّل في الجلسة لإعادة تفسير النتيجة تاريخيًا. */
export const COMMITTEE_CROSSWALK_VERSION =
  `mizan-crosswalk-quranws-${BOUNDARY_EVIDENCE_BUILD.upstreamCommit.slice(0, 12)}-${BOUNDARY_EVIDENCE_BUILD.generatedArtifactSha256.slice(0, 12)}`;

/** مرجع المصدر المشترك لكل صفّ — يربط الصفَّ بالأثر المحدّد لا بدعوى اعتمادٍ عامة. */
const SOURCE_REFERENCE = `${BOUNDARY_EVIDENCE_BUILD.upstreamRepository}@${BOUNDARY_EVIDENCE_BUILD.upstreamCommit}:${BOUNDARY_EVIDENCE_BUILD.upstreamPath}`;
const SOURCE_DIGEST_REFERENCE = `sha256:${BOUNDARY_EVIDENCE_BUILD.sourceSha256}`;
const ARTIFACT_DIGEST_REFERENCE = `generatedArtifactSha256:${BOUNDARY_EVIDENCE_BUILD.generatedArtifactSha256}`;

function relationOf(splits: number, merges: boolean, canonicalAyah: number, nativeAyah: number): CrosswalkRelation {
  if (splits > 0) return merges ? 'SPLIT_AND_MERGE' : 'SPLIT';
  if (merges) return 'MERGED';
  // ترقيمٌ واحدٌ بواحد لكنّ رقمه أزيح بسبب حدٍّ سابق في السورة — تُسمّى إزاحةً لا تطابقًا.
  return canonicalAyah === nativeAyah ? 'EXACT' : 'BOUNDARY_SHIFT';
}

/**
 * يفرد صفوف الجسر من أحداث الحدود المولَّدة.
 *
 * يُصدر صفًّا لكل موضعٍ قانوني في كل سورةٍ مختلِفة العدّ — لا للأحداث وحدها — لأن جاهزية
 * الرواية ذرّية: موضعٌ واحد بلا صفٍّ يُبقي الرواية كلَّها خارج «جاهزة للسؤال».
 *
 * وهويّة الراوي لا تُدمج: راويان يتشاركان نظام عدٍّ يأخذ كلٌّ منهما صفوفه بـ`rawiId` الخاصّ.
 */
function expandGeneratedRows(): QuranLocusCrosswalk[] {
  const rows: QuranLocusCrosswalk[] = [];
  for (const system of GENERATED_BOUNDARY_SYSTEMS) {
    for (const surah of system.divergentSurahs) {
      const canonicalCount = ayahCountOf(surah);
      const byAyah = new Map<number, GeneratedBoundaryEvent>();
      for (const event of system.events[surah] ?? []) byAyah.set(event.a, event);

      let nativeAyah = 1;
      for (let canonicalAyah = 1; canonicalAyah <= canonicalCount; canonicalAyah += 1) {
        const event = byAyah.get(canonicalAyah);
        const splits = event?.s ?? 0;
        const merges = event?.m === 1;
        const relation = relationOf(splits, merges, canonicalAyah, nativeAyah);
        const native = splits > 0
          ? { surah, ayahStart: nativeAyah, ayahEnd: nativeAyah + splits }
          : { surah, ayah: nativeAyah };
        const targetLabel = splits > 0 ? `${nativeAyah}-${nativeAyah + splits}` : `${nativeAyah}`;
        const evidence = [
          SOURCE_REFERENCE,
          SOURCE_DIGEST_REFERENCE,
          ARTIFACT_DIGEST_REFERENCE,
          `system:${system.sourceSystem}->${system.nativeSystem}`,
          `kufi:${surah}:${canonicalAyah}->${system.sourceSystem}:${targetLabel}`,
          ...(event?.w ?? []),
        ];
        for (const rawiId of system.rawis) {
          rows.push({
            rawiId,
            canonical: { surah, ayah: canonicalAyah },
            native: { ...native },
            relation,
            mergesWithNext: merges,
            evidence,
          });
        }
        nativeAyah += splits + (merges ? 0 : 1);
      }
    }
  }
  return rows;
}

/**
 * صفوف الجسر الفعّالة. كلُّ صفٍّ يحمل مرجعَ أثرٍ محدَّدًا (المستودع، الـcommit، المسار،
 * بصمتا المصدر والمولَّد، نظام العدّ، وكلمة الحدّ) — لا «معتمدٌ من اللجنة» وحدها.
 */
export const COMMITTEE_CROSSWALK_ROWS: readonly QuranLocusCrosswalk[] = expandGeneratedRows();

/** الروايات التي فُعّل جسرُها من هذا الأثر — للتقارير ولفحص ما قبل الانطلاق. */
export const CROSSWALK_ACTIVATED_RAWIS: readonly string[] =
  GENERATED_BOUNDARY_SYSTEMS.flatMap(system => [...system.rawis]);

export { BOUNDARY_EVIDENCE_BUILD };
