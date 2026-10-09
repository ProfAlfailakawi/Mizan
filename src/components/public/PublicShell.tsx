import React from 'react';
import { MizanLogo } from '../design-system/MizanLogo';
import { useAppStore } from '../../lib/store';
import { pl, usePublicLocale } from '../../lib/public-i18n';

/*
 * إطار الصفحات العامة المستقلة (#verify · #passport · #trust-verify).
 *
 * كانت كلٌّ منها بطاقةً وحيدة تطفو على قماشٍ فارغ بلا هويةٍ ولا مخرج. الإطار ترويسةٌ خفيفة
 * بالشعار ورابط العودة، وزخرفةٌ هندسية باهتة خلف المحتوى، وتذييلٌ هادئ. عرضٌ فقط: لا يقرأ
 * بياناتٍ ولا يغيّر سلوكَ ما بداخله، ويختفي كله عند الطباعة فلا تدخل الورقةَ إلا الوثيقة.
 */
const Frame: React.FC<{ children: React.ReactNode; rtl: boolean; language: string; t: (ar: string, en: string) => string }> = ({ children, rtl, language, t }) => {
  return (
    <div className="relative flex min-h-screen flex-col" style={{ background: 'var(--canvas)' }} dir={rtl ? 'rtl' : 'ltr'}>
      <div aria-hidden="true" className="mz-arabesque no-print pointer-events-none absolute inset-x-0 top-0 h-[28rem]" style={{ opacity: .07, backgroundColor: 'var(--emerald)', WebkitMaskSize: '100% 100%, 88px 88px', maskSize: '100% 100%, 88px 88px' }} />
      <header className="no-print relative z-10 border-b border-[var(--line)] bg-[var(--canvas)]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#" className="inline-flex min-h-11 items-center rounded-xl" aria-label={t('ميزان — الصفحة الرئيسية', 'MIZAN — home')}><MizanLogo language={language} compact /></a>
          <span className="mizan-kicker hidden sm:inline">{t('صفحة عامة — لا تحتاج دخولًا', 'Public page — no sign-in needed')}</span>
        </div>
      </header>
      <div className="relative z-10 flex-1">{children}</div>
      <footer className="no-print relative z-10 border-t border-[var(--line)] px-4 py-6 text-center text-[11px] text-[var(--muted)]">
        {t('ميزان — منظومة المسابقات القرآنية', 'MIZAN — Quran competition platform')}
      </footer>
    </div>
  );
};

/* #verify و#trust-verify: لغتهما لغة التطبيق، فالإطار يتبعها. */
export const PublicShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { language } = useAppStore();
  const ar = language === 'ar';
  return <Frame rtl={ar} language={language} t={(a, e) => (ar ? a : e)}>{children}</Frame>;
};

/* #passport: لغته من منتقي اللغات العام (usePublicLocale) الذي يضبط اتجاه المستند — فالإطار يتبعه لا لغة التطبيق. */
export const LocalizedPublicShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { language } = useAppStore();
  const { rtl } = usePublicLocale(language);
  return <Frame rtl={rtl} language={language} t={pl}>{children}</Frame>;
};
