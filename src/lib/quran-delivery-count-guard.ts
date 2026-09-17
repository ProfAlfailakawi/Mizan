/*
 * حارسُ ترقيم الحزمة المُسلَّمة — يمنع أن تُخدَم حزمةٌ ترقيمُها غير الذي قِيس وأُثبت.
 *
 * الأدلّة في `quran-delivery-count-evidence.generated` مقيسةٌ من بايتات مرآة التسليم
 * المثبَّتة. لكنّ الإنتاج قد يُخدَم من R2 بحزمةٍ خاصّة، وقد تُحدَّث تلك الحزمة يومًا.
 * فالادّعاء «عدُّ ورشٍ مدنيٌّ أخير» صحيحٌ عن الأثر المقيس، ولا يصحّ تلقائيًّا عن كل حزمةٍ
 * تحمل الاسم نفسه.
 *
 * ولهذا لا يُكتفى بالدليل المخزون: يُقاس ترقيمُ الحزمة المخدومة فعلًا ويُقابَل به. وأيُّ
 * فرقٍ يفشل مغلقًا باسمه وسورته — لا يُخدَم نصٌّ بترقيمٍ يخالف الجسر الذي تُسحب به أسئلته،
 * ولا يُستعاض عنه بحزمة روايةٍ أخرى.
 */

import { DELIVERY_COUNT_SYSTEMS } from './quran-delivery-count-evidence.generated';
import { QURAN_SURAH_TOTAL } from './quran-canon';

export interface DeliveryCountExpectation {
  rawiId: string;
  system: string;
  perSurahAyahCounts: readonly number[];
  sha256: string;
  upstreamPath: string;
}

const BY_RAWI: ReadonlyMap<string, DeliveryCountExpectation> = (() => {
  const map = new Map<string, DeliveryCountExpectation>();
  for (const entry of DELIVERY_COUNT_SYSTEMS) {
    for (const pkg of entry.packages) {
      map.set(pkg.rawiId, {
        rawiId: pkg.rawiId,
        system: entry.system,
        perSurahAyahCounts: entry.perSurahAyahCounts,
        sha256: pkg.sha256,
        upstreamPath: pkg.upstreamPath,
      });
    }
  }
  return map;
})();

/** التوقُّع المقيس لرواية، أو `undefined` إن لم تكن من المُسلَّمات التي قِيس ترقيمها. */
export function deliveryCountExpectation(rawiId: string): DeliveryCountExpectation | undefined {
  return BY_RAWI.get(rawiId);
}

export interface DeliveryCountVerdict {
  rawiId: string;
  /** `true` فقط عند مطابقة السور الـ١١٤ كلِّها. */
  matches: boolean;
  /** سببٌ قابلٌ للعرض والتسجيل، مسمًّى بسورته. */
  code?: string;
  mismatchedSurahs: Array<{ surah: number; served: number; expected: number }>;
}

/** يعدّ آيات كل سورة من صفوف الحزمة المخدومة نفسها. */
export function countServedRows(rows: ReadonlyArray<Record<string, unknown>>): number[] {
  const highest = new Array<number>(QURAN_SURAH_TOTAL).fill(0);
  for (const row of rows) {
    const surah = Number(row.sura_no ?? row.sora);
    const ayah = Number(row.aya_no ?? row.aya);
    if (!Number.isInteger(surah) || surah < 1 || surah > QURAN_SURAH_TOTAL) continue;
    if (!Number.isInteger(ayah) || ayah < 1) continue;
    if (ayah > highest[surah - 1]) highest[surah - 1] = ayah;
  }
  return highest;
}

/**
 * يقابل الحزمة المخدومة بالتوقُّع المقيس. يفشل مغلقًا: رواية بلا توقُّعٍ مقيس لا تُمرَّر
 * بحجّة عدم وجود مرجع — تُسمّى `DELIVERY_COUNT_EXPECTATION_MISSING` ويُترك القرار لمنادِيه.
 */
export function verifyServedPackageNumbering(
  rawiId: string,
  rows: ReadonlyArray<Record<string, unknown>>,
): DeliveryCountVerdict {
  const expectation = BY_RAWI.get(rawiId);
  if (!expectation) {
    return { rawiId, matches: false, code: `DELIVERY_COUNT_EXPECTATION_MISSING:${rawiId}`, mismatchedSurahs: [] };
  }
  const served = countServedRows(rows);
  const mismatchedSurahs: DeliveryCountVerdict['mismatchedSurahs'] = [];
  for (let surah = 1; surah <= QURAN_SURAH_TOTAL; surah += 1) {
    const expected = expectation.perSurahAyahCounts[surah - 1];
    if (served[surah - 1] !== expected) {
      mismatchedSurahs.push({ surah, served: served[surah - 1], expected });
    }
  }
  if (mismatchedSurahs.length === 0) return { rawiId, matches: true, mismatchedSurahs };
  const head = mismatchedSurahs.slice(0, 3).map(m => `${m.surah}:${m.served}!=${m.expected}`).join('،');
  return {
    rawiId,
    matches: false,
    code: `DELIVERY_PACKAGE_NUMBERING_MISMATCH:${expectation.system}:${mismatchedSurahs.length}:${head}`,
    mismatchedSurahs,
  };
}
