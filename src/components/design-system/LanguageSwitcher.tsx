import React from 'react';
import { Globe } from 'lucide-react';
import { useAppStore } from '../../lib/store';

export const LanguageSwitcher: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { language, setLanguage } = useAppStore();

  return (
    <div className="inline-flex items-center gap-1 bg-[#F5F2EB] p-1 rounded-xl border border-[#EAE4DC]">
      <button
        onClick={() => setLanguage('ar')}
        className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
          language === 'ar'
            ? 'bg-white text-[#4A4238] shadow-2xs font-bold border border-[#EAE4DC]'
            : 'text-[#7D7569] hover:text-[#4A4238]'
        }`}
      >
        العربية
      </button>
      <button
        onClick={() => setLanguage('en')}
        className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
          language === 'en'
            ? 'bg-white text-[#4A4238] shadow-2xs font-bold border border-[#EAE4DC]'
            : 'text-[#7D7569] hover:text-[#4A4238]'
        }`}
      >
        English
      </button>
      {!compact && <Globe className="w-3.5 h-3.5 text-[#A09689] mx-1" />}
    </div>
  );
};
