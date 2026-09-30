import React from 'react';
import { Globe } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { PUBLIC_LOCALES, PUBLIC_LOCALE_META, setPublicLocale, usePublicLocale, type PublicLocale } from '../../lib/public-i18n';

/* لغات صفحات المتسابق. كل خيار باسمه في لغته، ولا يُعرض إلا ما اكتمل قاموسه (يحرسه اختبار). */
export const PublicLanguageSwitcher: React.FC = () => {
  const { language } = useAppStore();
  const { locale } = usePublicLocale(language);
  return <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#EAE4DC] bg-[#F5F2EB] px-3 text-xs font-bold text-[#625f59]">
    <Globe className="h-4 w-4" aria-hidden="true" />
    <select aria-label="Language / اللغة" value={locale} onChange={e => setPublicLocale(e.target.value as PublicLocale)} className="bg-transparent outline-none">
      {PUBLIC_LOCALES.map(code => <option key={code} value={code} lang={PUBLIC_LOCALE_META[code].bcp47}>{PUBLIC_LOCALE_META[code].label}</option>)}
    </select>
  </label>;
};
