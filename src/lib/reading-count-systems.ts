/*
 * نظام العدّ لكل رواية من العشرين — ومستوى التوثيق لكلٍّ منها بلا تجميل.
 *
 * السؤال الذي يحسم جاهزية الرواية للسؤال ليس «هل عندنا نصّها؟» بل «هل نعرف كيف ننتقل من
 * إحداثي ميزان القانوني إلى ترقيمها الأصلي؟». وهذا ملفٌ يفصل بين ثلاث حالاتٍ لا يجوز
 * خلطها:
 *
 *   CANONICAL_BY_DEFINITION      — ميزان يعرّف إحداثيه القانوني بهذا العدّ نفسه (حفص).
 *   VERIFIED_FROM_PINNED_ARTIFACT — عُدَّت آيات كل سورة من بايتات الحزمة المثبَّتة فعلًا.
 *   UNVERIFIED                    — الحزمة تُجلب وقت التشغيل ولم يُتحقَّق من ترقيمها هنا.
 *
 * والحالة الثالثة ليست اتهامًا للحزمة: هي إقرارٌ بأن ترقيمها لم يُفحص داخل هذه الشجرة،
 * فلا يُبنى عليه ادّعاء «جسرٌ مكتمل». يُرفَع التوثيق بتشغيل `npm run quran:crosswalk-report`
 * على بيئةٍ تصل إلى طبقة التسليم، فيقرأ الأعداد الحقيقية ويثبتها.
 */

import { CANONICAL_RAWI_IDS } from './canonical-readings';
import { QURAN_FULL_TEXT_CANDIDATES } from './quran-candidate-sources';
import type { QuranNativeCountSystemId } from './quran-native-count-systems';

export type CountSystemAssurance =
  | 'CANONICAL_BY_DEFINITION'
  | 'VERIFIED_FROM_PINNED_ARTIFACT'
  | 'UNVERIFIED';

export interface ReadingCountSystem {
  rawiId: string;
  /** نظام العدّ المعروف أو المتوقَّع. `undefined` يعني لا دعوى أصلًا. */
  system?: QuranNativeCountSystemId;
  assurance: CountSystemAssurance;
  /** لماذا هذا المستوى؟ نصٌّ قابلٌ للعرض في لوحة الإدارة والتقارير. */
  note: string;
}

/*
 * حفصٌ وحده `CANONICAL_BY_DEFINITION`: جدول `quran-canon` هو العدّ الكوفي الذي يقرأ به حفص،
 * وهو إحداثي ميزان القانوني. فالمطابقة هنا تعريفٌ لا اكتشاف.
 *
 * وبقية السبعة المُسلَّمة تُجلب حزمُها من طبقة التسليم وقت التشغيل، ولم تُقرأ بايتاتها في
 * هذه الشجرة، فتبقى `UNVERIFIED` — ولو كان المتوقَّع علميًّا معروفًا. توقُّعٌ ليس تحقّقًا.
 */
const DELIVERED_UNVERIFIED_NOTE =
  'حزمة التسليم تُجلب وقت التشغيل؛ لم يُقرأ ترقيمها داخل هذه الشجرة. شغّل quran:crosswalk-report على بيئة التسليم لإثباته.';

const BASE: Record<string, ReadingCountSystem> = {
  hafs: {
    rawiId: 'hafs',
    system: 'KUFIC',
    assurance: 'CANONICAL_BY_DEFINITION',
    note: 'إحداثي ميزان القانوني هو العدّ الكوفي نفسه الذي يقرأ به حفص، فالمطابقة تعريفية.',
  },
};

export const READING_COUNT_SYSTEMS: ReadonlyMap<string, ReadingCountSystem> = (() => {
  const map = new Map<string, ReadingCountSystem>();
  for (const rawiId of CANONICAL_RAWI_IDS) {
    const base = BASE[rawiId];
    if (base) { map.set(rawiId, base); continue; }
    const candidate = QURAN_FULL_TEXT_CANDIDATES.find(c => c.rawiId === rawiId);
    if (candidate) {
      map.set(rawiId, {
        rawiId,
        system: candidate.nativeCountSystem,
        assurance: 'VERIFIED_FROM_PINNED_ARTIFACT',
        note: `عُدَّت آيات كل سورة من بايتات ${candidate.upstreamPath} عند الـcommit المثبَّت (${candidate.expectedVerseCount} آية).`,
      });
      continue;
    }
    map.set(rawiId, { rawiId, assurance: 'UNVERIFIED', note: DELIVERED_UNVERIFIED_NOTE });
  }
  return map;
})();

export function countSystemForReading(rawiId: string): ReadingCountSystem | undefined {
  return READING_COUNT_SYSTEMS.get(rawiId);
}
