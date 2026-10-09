import React from 'react';
import { MizanLogo } from '../design-system/MizanLogo';
import { useAppStore } from '../../lib/store';

/*
 * إطار الصفحات العامة المستقلة (#verify · #passport · #trust-verify).
 *
 * كانت كلٌّ منها بطاقةً وحيدة تطفو على قماشٍ فارغ بلا هويةٍ ولا مخرج. الإطار ترويسةٌ خفيفة
 * بالشعار ورابط العودة، وزخرفةٌ هندسية باهتة خلف المحتوى، وتذييلٌ هادئ. عرضٌ فقط: لا يقرأ
 * بياناتٍ ولا يغيّر سلوكَ ما بداخله، ويختفي كله عند الطباعة فلا تدخل الورقةَ إلا الوثيقة.
 */
export const PublicShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { language } = useAppStore();
  const ar = language === 'ar';
  return (
    <div className="relative flex min-h-screen flex-col" style={{ background: 'var(--canvas)' }} dir={ar ? 'rtl' : 'ltr'}>
      <div aria-hidden="true" className="mz-arabesque no-print pointer-events-none absolute inset-x-0 top-0 h-[28rem]" style={{ opacity: .07, backgroundColor: 'var(--emerald)', WebkitMaskSize: '100% 100%, 88px 88px', maskSize: '100% 100%, 88px 88px' }} />
      <header className="no-print relative z-10 border-b border-[var(--line)] bg-[var(--canvas)]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#" className="inline-flex min-h-11 items-center rounded-xl" aria-label={ar ? 'ميزان — الصفحة الرئيسية' : 'MIZAN — home'}><MizanLogo language={language} compact /></a>
          <span className="mizan-kicker hidden sm:inline">{ar ? 'صفحة عامة — لا تحتاج دخولًا' : 'Public page — no sign-in needed'}</span>
        </div>
      </header>
      <div className="relative z-10 flex-1">{children}</div>
      <footer className="no-print relative z-10 border-t border-[var(--line)] px-4 py-6 text-center text-[11px] text-[var(--muted)]">
        {ar ? 'ميزان — منظومة المسابقات القرآنية' : 'MIZAN — Quran competition platform'}
      </footer>
    </div>
  );
};
