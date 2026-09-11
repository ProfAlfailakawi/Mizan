/*
 * ترحيل البيانات القديمة إلى محرك النطاق.
 *
 * القاعدة الحاكمة: **لا يُخترع نطاق**. «عشرة أجزاء» لا تقول أيّ عشرة — أوّلها؟ آخرها؟
 * متفرقة؟ — فلا يجوز أن يفترض النظام ويبني عليه سحبًا. تُعلَّم الفئة needs_scope_confirmation،
 * ويُعرض على المنظم اقتراحٌ **موصوفٌ بأنه اقتراح** لا يُطبَّق حتى يعتمده.
 *
 * وما كان معناه قاطعًا — «كامل القرآن ٣٠ جزءًا»، «جزء عمّ»، «من الجزء ٥ إلى ٢٠» — يُشتق
 * ويُعلَّم derived_from_legacy مع ذكر ما بُني عليه.
 */

import { QURAN_JUZ_TOTAL } from './quran-canon';
import { describeScope, fullQuranScope, scopeFromJuz, scopeFromJuzRange, type QuranScope } from './quran-scope';

export type ScopeMigrationStatus = 'derived_from_legacy' | 'needs_scope_confirmation' | 'already_defined';

export interface ScopeMigrationOutcome {
  status: ScopeMigrationStatus;
  scope: QuranScope | null;
  /** اقتراح يُعرض ولا يُطبَّق. موجود فقط حين يكون status = needs_scope_confirmation. */
  suggestion: QuranScope | null;
  basisArabic: string;
  basisEnglish: string;
  confidence: 'exact' | 'high' | 'none';
}

const ARABIC_DIGITS: Record<string, string> = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
const toAscii = (value: string) => value.replace(/[٠-٩]/g, d => ARABIC_DIGITS[d] || d);
const normalize = (value: string) => toAscii(String(value || '')).replace(/[ً-ْ]/g, '').replace(/[إأآ]/g, 'ا').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim().toLowerCase();

const WORD_JUZ: Record<string, number> = {
  'الاول': 1, 'الثاني': 2, 'الثالث': 3, 'الرابع': 4, 'الخامس': 5, 'السادس': 6, 'السابع': 7, 'الثامن': 8,
  'التاسع': 9, 'العاشر': 10, 'العشرون': 20, 'الثلاثون': 30, 'الثلاثين': 30,
};

/** يقرأ الحقل القديم بحذر: يستخرج ما كان قاطعًا فقط، ويصمت عمّا سواه. */
export function migrateLegacyScope(input: { memorizationScope?: string; juzCount?: number; existingScope?: QuranScope | null }): ScopeMigrationOutcome {
  if (input.existingScope && input.existingScope.segments?.length) {
    return { status: 'already_defined', scope: input.existingScope, suggestion: null, basisArabic: 'النطاق محدد مسبقًا.', basisEnglish: 'Scope already defined.', confidence: 'exact' };
  }
  const text = normalize(input.memorizationScope || '');
  const juzCount = Math.round(Number(input.juzCount) || 0);

  const full = /كامل|كل القران|القران كامل|complete|full|30 ?جزء|ثلاثين جزء|الثلاثين جزء/.test(text) || juzCount >= QURAN_JUZ_TOTAL;
  if (full) {
    return { status: 'derived_from_legacy', scope: fullQuranScope(), suggestion: null, confidence: 'exact', basisArabic: 'النص أو عدد الأجزاء يدل على المصحف كاملًا دلالةً قاطعة.', basisEnglish: 'Text or juz count unambiguously means the complete Quran.' };
  }

  // مدى صريح: «من ٥ إلى ٢٠» أو «5-20» أو «juz 5 to 20».
  const range = text.match(/(?:من\s*)?(?:الجزء\s*)?(\d{1,2})\s*(?:-|–|—|إلى|الى|to|\.\.)\s*(?:الجزء\s*)?(\d{1,2})/);
  if (range) {
    const from = Number(range[1]), to = Number(range[2]);
    if (from >= 1 && to >= 1 && from <= QURAN_JUZ_TOTAL && to <= QURAN_JUZ_TOTAL) {
      const scope = scopeFromJuzRange(from, to);
      return { status: 'derived_from_legacy', scope, suggestion: null, confidence: 'exact', basisArabic: `النص يذكر مدىً صريحًا من الجزء ${from} إلى ${to}.`, basisEnglish: `Text states an explicit range from juz ${from} to ${to}.` };
    }
  }

  if (/جزء عم|جزء عمّ|عم$|^عم\b|امma|amma/.test(text)) {
    return { status: 'derived_from_legacy', scope: scopeFromJuz([30]), suggestion: null, confidence: 'exact', basisArabic: 'جزء عمّ هو الجزء الثلاثون.', basisEnglish: 'Juz Amma is the thirtieth juz.' };
  }

  // جزء واحد مسمّى: «الجزء الثلاثون» أو «الجزء 7».
  const namedWord = text.match(/الجزء\s+(\S+)/);
  if (namedWord && WORD_JUZ[namedWord[1]]) {
    const juz = WORD_JUZ[namedWord[1]];
    return { status: 'derived_from_legacy', scope: scopeFromJuz([juz]), suggestion: null, confidence: 'exact', basisArabic: `النص يسمّي الجزء ${juz} بعينه.`, basisEnglish: `Text names juz ${juz} explicitly.` };
  }
  const namedNumber = text.match(/(?:^|\s)الجزء\s*(\d{1,2})(?:\s|$)/);
  if (namedNumber) {
    const juz = Number(namedNumber[1]);
    if (juz >= 1 && juz <= QURAN_JUZ_TOTAL) return { status: 'derived_from_legacy', scope: scopeFromJuz([juz]), suggestion: null, confidence: 'exact', basisArabic: `النص يسمّي الجزء ${juz} بعينه.`, basisEnglish: `Text names juz ${juz} explicitly.` };
  }

  // قائمة أجزاء صريحة: «الأجزاء 1، 3، 7».
  const listMatch = text.match(/الاجزاء\s*([\d\s,،\-]+)/);
  if (listMatch) {
    const numbers = listMatch[1].split(/[\s,،]+/).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= QURAN_JUZ_TOTAL);
    if (numbers.length >= 2) {
      return { status: 'derived_from_legacy', scope: scopeFromJuz(numbers), suggestion: null, confidence: 'exact', basisArabic: `النص يعدّد الأجزاء ${numbers.join('، ')}.`, basisEnglish: `Text enumerates juz ${numbers.join(', ')}.` };
    }
  }

  if (juzCount >= 1 && juzCount < QURAN_JUZ_TOTAL) {
    const suggestion = scopeFromJuzRange(1, juzCount);
    return {
      status: 'needs_scope_confirmation', scope: null, suggestion, confidence: 'none',
      basisArabic: `«${juzCount} ${juzCount === 2 ? 'جزءان' : juzCount <= 10 ? 'أجزاء' : 'جزءًا'}» لا تحدد أيّ أجزاء. الاقتراح المعروض (${describeScope(suggestion, true)}) هو الأشيع، ولا يُطبَّق حتى تعتمده.`,
      basisEnglish: `"${juzCount} juz" does not say which juz. The shown suggestion (${describeScope(suggestion, false)}) is the most common convention and is not applied until you confirm it.`,
    };
  }

  return { status: 'needs_scope_confirmation', scope: null, suggestion: null, confidence: 'none', basisArabic: 'لا توجد بيانات كافية لاشتقاق النطاق. حدّده يدويًا.', basisEnglish: 'Not enough data to derive a scope. Define it manually.' };
}

export interface CategoryLike { id: string; name: string; nameArabic: string; memorizationScope?: string; juzCount?: number; scope?: QuranScope; scopeMigration?: string }

/** خطة ترحيل قابلة للعرض قبل التطبيق: ماذا سيتغير، وماذا سيبقى منتظرًا قرار المنظم. */
export function planCategoryMigration(categories: CategoryLike[]) {
  return categories.map(category => ({
    categoryId: category.id,
    name: category.nameArabic || category.name,
    legacy: { memorizationScope: category.memorizationScope || '', juzCount: category.juzCount || 0 },
    outcome: migrateLegacyScope({ memorizationScope: category.memorizationScope, juzCount: category.juzCount, existingScope: category.scope || null }),
  }));
}
