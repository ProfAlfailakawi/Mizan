import React from 'react';
import { Globe } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { LANGUAGE_META, SupportedLanguage } from '../../lib/i18n';

export const LanguageSwitcher: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { language, setLanguage } = useAppStore();
  return <label className={`${compact?'w-11 h-11 p-0':'px-2.5 py-1.5'} relative inline-grid place-items-center bg-[#F5F2EB] rounded-xl border border-[#EAE4DC] text-[#625f59] hover:bg-[#efede7] transition cursor-pointer`} title={language==='ar'?'تغيير اللغة':'Change language'}>
    <Globe className="w-4 h-4 text-[#6f6b65]" aria-hidden="true"/>
    <span className="sr-only">{language==='ar'?'اللغة':'Language'}</span>
    <select value={language} onChange={e=>setLanguage(e.target.value as SupportedLanguage)} className={`${compact?'absolute inset-0 h-full w-full opacity-0 cursor-pointer':'ms-2 bg-transparent outline-none text-xs font-bold max-w-36'}`} aria-label={language==='ar'?'اللغة':'Language'}>
      {(Object.keys(LANGUAGE_META) as SupportedLanguage[]).map(code=><option key={code} value={code}>{LANGUAGE_META[code].label}</option>)}
    </select>
  </label>;
};
