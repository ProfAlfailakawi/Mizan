import React from 'react';
import { Globe } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { LANGUAGE_META, SupportedLanguage } from '../../lib/i18n';

export const LanguageSwitcher: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { language, setLanguage } = useAppStore();
  return <label className="inline-flex items-center gap-2 bg-[#F5F2EB] px-2.5 py-1.5 rounded-xl border border-[#EAE4DC] text-[#625f59]">
    <Globe className="w-3.5 h-3.5 text-[#6f6b65]" aria-hidden="true"/>
    <span className="sr-only">{language==='ar'?'اللغة':'Language'}</span>
    <select value={language} onChange={e=>setLanguage(e.target.value as SupportedLanguage)} className={`bg-transparent outline-none text-xs font-bold ${compact?'max-w-20':'max-w-36'}`} aria-label={language==='ar'?'اللغة':'Language'}>
      {(Object.keys(LANGUAGE_META) as SupportedLanguage[]).map(code=><option key={code} value={code}>{LANGUAGE_META[code].label}</option>)}
    </select>
  </label>;
};
