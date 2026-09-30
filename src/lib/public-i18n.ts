/*
 * لغات صفحات المتسابق العامة (التسجيل والرحلة وجواز ميزان).
 *
 * العربية والإنجليزية نصّان أصليان في المكوّنات نفسها: pl('نص عربي', 'English text').
 * وبقية اللغات قاموسٌ مفتاحه النص الإنجليزي، في public-i18n-dict.ts. اختبارٌ يمسح المكوّنات
 * ويشترط لكل نص إنجليزي ترجمةً في كل لغة، فلا تُعرض لغة ناقصة.
 *
 * تنبيه صادق: ترجمات الأردية والإندونيسية والفرنسية والتركية أُعدّت بمساعدة آلية ولم يراجعها
 * بعدُ متحدثٌ أصلي؛ حالتها مسجّلة في PUBLIC_LOCALE_REVIEW_STATUS.
 *
 * ما يكتبه المنظّم (أسماء الفئات والحقول) متاح بالعربية والإنجليزية فقط: يُعرض العربي للأردية
 * (الخط نفسه وأقرب للقارئ)، والإنجليزي لغيرها.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { PUBLIC_DICTIONARY } from './public-i18n-dict';

export type PublicLocale = 'ar' | 'en' | 'ur' | 'id' | 'fr' | 'tr';
export const PUBLIC_LOCALES: PublicLocale[] = ['ar', 'en', 'ur', 'id', 'fr', 'tr'];
export const PUBLIC_LOCALE_META: Record<PublicLocale, { label: string; dir: 'rtl' | 'ltr'; bcp47: string }> = {
  ar: { label: 'العربية', dir: 'rtl', bcp47: 'ar-KW' },
  en: { label: 'English', dir: 'ltr', bcp47: 'en' },
  ur: { label: 'اردو', dir: 'rtl', bcp47: 'ur-PK' },
  id: { label: 'Bahasa Indonesia', dir: 'ltr', bcp47: 'id-ID' },
  fr: { label: 'Français', dir: 'ltr', bcp47: 'fr-FR' },
  tr: { label: 'Türkçe', dir: 'ltr', bcp47: 'tr-TR' },
};
export const PUBLIC_LOCALE_REVIEW_STATUS: Record<PublicLocale, 'reviewed' | 'pending_native_review'> = {
  ar: 'reviewed', en: 'reviewed', ur: 'pending_native_review', id: 'pending_native_review', fr: 'pending_native_review', tr: 'pending_native_review',
};

const STORAGE_KEY = 'mizan.publicLocale';
const isLocale = (v: unknown): v is PublicLocale => typeof v === 'string' && (PUBLIC_LOCALES as string[]).includes(v);
const stored = (): PublicLocale | null => { try { const v = window.localStorage.getItem(STORAGE_KEY); return isLocale(v) ? v : null; } catch { return null; } };

let current: PublicLocale | null = null;
let fallback: PublicLocale = 'ar';
const listeners = new Set<() => void>();
const active = (): PublicLocale => current ?? fallback;

export function setPublicLocale(locale: PublicLocale) {
  current = locale;
  try { window.localStorage.setItem(STORAGE_KEY, locale); } catch { /* الاختيار يبقى للجلسة */ }
  listeners.forEach(l => l());
}

/** لغة الصفحة الآن، لمن يحتاجها خارج المكوّنات (لغة رسالة البريد مثلًا). */
export const publicLocale = (): PublicLocale => active();

/** النص بلغة الصفحة الحالية. */
export function pl(arabic: string, english: string): string {
  const l = active();
  if (l === 'ar') return arabic;
  if (l === 'en') return english;
  return PUBLIC_DICTIONARY[l][english] ?? english;
}

/** نصٌّ بمتغيّرات {{name}} — تُملأ بعد الترجمة كي يبقى القاموس ثابتًا. */
export function plf(arabic: string, english: string, vars: Record<string, string | number>): string {
  return pl(arabic, english).replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));
}

/** ما كتبه المنظّم بالعربية والإنجليزية فقط. */
export function organizerText(arabic: string | undefined, english: string | undefined): string {
  const l = active();
  return (l === 'ar' || l === 'ur' ? arabic || english : english || arabic) || '';
}

/**
 * لغة الصفحة العامة. افتراضها لغة التطبيق (عربي/إنجليزي)، ويبدّلها المتسابق بقائمة اللغات.
 * `rtl` يحدد اتجاه التخطيط والأسهم، ويُضبط اتجاه المستند ما دامت الصفحة معروضة.
 */
export function usePublicLocale(appLanguage: string) {
  fallback = appLanguage === 'en' ? 'en' : 'ar';
  if (current === null && typeof window !== 'undefined') current = stored();
  const locale = useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, active, active);
  const meta = PUBLIC_LOCALE_META[locale];
  useEffect(() => {
    const root = document.documentElement, prev = { dir: root.dir, lang: root.lang };
    root.dir = meta.dir; root.lang = meta.bcp47;
    return () => { root.dir = prev.dir; root.lang = prev.lang; };
  }, [meta.dir, meta.bcp47]);
  return { locale, rtl: meta.dir === 'rtl', arabicData: locale === 'ar' || locale === 'ur', bcp47: meta.bcp47 };
}
