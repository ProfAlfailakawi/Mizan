import React, { useState } from 'react';
import {
  CalendarDays, MapPin, ShieldCheck, Sparkles, ArrowLeft, ArrowRight,
  Share2, Check, BookOpen, UserRound, UsersRound, BadgeCheck
} from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { MizanLogo, MizanMark } from '../design-system/MizanLogo';
import { Button } from '../design-system/Button';

export const CompetitionLanding: React.FC = () => {
  const { competition, language } = useAppStore();
  const ar = language === 'ar';
  const Arrow = ar ? ArrowLeft : ArrowRight;
  const [copied, setCopied] = useState(false);
  const closed = competition.status === 'completed' || competition.status === 'archived';
  const registrationOpen = competition.status === 'registration_open';

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/#competition?comp=${competition.id}`
    : `https://mizan.dr-alfailakawi.com/#competition?comp=${competition.id}`;

  const compTitle = ar ? competition.nameArabic : competition.name;
  const shareText = ar
    ? `ندعوكم للاطلاع والتسجيل في ${compTitle} — عبر منظومة ميزان للمسابقات القرآنية:\n${shareUrl}`
    : `Invitation to ${compTitle} via MIZAN Quran Competition Platform:\n${shareUrl}`;

  const handleShareWhatsApp = () => {
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2400);
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F2] text-[#171B18] antialiased selection:bg-[#123f35] selection:text-[#FAF8F2]">
      {/* Header Bar */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[#FAF8F2]/90 border-b border-[#e5dfd0]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <MizanLogo language={language} compact />
          <div className="flex items-center gap-3">
            <button
              onClick={handleShareWhatsApp}
              aria-label={ar ? 'مشاركة عبر واتساب' : 'Share via WhatsApp'}
              className="min-h-11 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-[#123f35] bg-[#e6ede9] hover:bg-[#d8e4dd] transition-colors"
            >
              <Share2 className="w-4 h-4" />
              <span>{ar ? 'مشاركة' : 'Share'}</span>
            </button>
            <a
              href="#"
              className="min-h-11 inline-flex items-center px-3 py-2 rounded-xl text-xs font-bold text-[#3E4A43] hover:text-[#171B18] transition-colors"
            >
              {ar ? 'دخول الإدارة' : 'Staff Sign In'}
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-24">
        {/* Prestige Hero Card with Islamic Architectural Geometry */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#123f35] via-[#0d2f27] to-[#081f1a] text-white p-7 sm:p-12 shadow-2xl border border-[#23584b]">
          {/* Background Ambient Glow & Islamic Girih Tessellation */}
          <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(#d4af37_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-[#d4af37]/15 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-[#2a6d5c]/25 blur-3xl pointer-events-none" />

          <div className="relative z-10 grid lg:grid-cols-[1.2fr_0.8fr] gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/15 text-[#e8cb93] text-xs font-bold tracking-wide">
                <Sparkles className="w-3.5 h-3.5" />
                {competition.edition && <><span>{competition.edition}</span><span className="opacity-40">•</span></>}
                <span>{ar ? 'منظومة ميزان الرسمية' : 'Official MIZAN Platform'}</span>
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black leading-[1.1] mt-5 tracking-tight text-[#fffef9]">
                {compTitle}
              </h1>

              <div className="flex flex-wrap items-center gap-y-3 gap-x-6 mt-6 text-sm text-[#ccdcd4]">
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-[#e8cb93]" />
                  <span dir="ltr" className="font-semibold">{competition.startDate} — {competition.endDate}</span>
                </span>
                <span className="inline-flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#e8cb93]" />
                  <span className="font-semibold">{competition.venueName}</span>
                </span>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                {registrationOpen ? <Button
                  onClick={() => { window.location.hash = `register?comp=${competition.id}`; }}
                  icon={<Arrow className="w-4 h-4" />}
                  className="!min-h-11 !px-7 !bg-[#e8cb93] !text-[#0f342c] hover:!bg-[#f5e3ba] !font-black !shadow-lg"
                >
                  {ar ? 'سجل الآن في المسابقة' : 'Register Now'}
                </Button> : <div className="min-h-11 px-6 rounded-2xl bg-white/10 border border-white/15 inline-flex items-center text-sm font-black text-[#e8cb93]">{ar ? 'انتهت المسابقة' : 'Competition ended'}</div>}

                <button
                  onClick={handleShareWhatsApp}
                  aria-label={ar ? 'إرسال الرابط عبر واتساب' : 'Share on WhatsApp'}
                  className="min-h-11 px-5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 text-white text-xs sm:text-sm font-black inline-flex items-center gap-2.5 transition-all"
                >
                  <Share2 className="w-4 h-4 text-[#e8cb93]" />
                  <span>{ar ? 'إرسال الرابط عبر واتساب' : 'Share on WhatsApp'}</span>
                </button>

                <button
                  onClick={handleCopyLink}
                  aria-label={ar ? 'نسخ رابط المسابقة' : 'Copy competition link'}
                  className="min-h-11 px-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-xs font-bold inline-flex items-center gap-2 transition-all"
                >
                  {copied ? <Check className="w-4 h-4 text-[#48d597]" /> : <Share2 className="w-4 h-4" />}
                  <span>{copied ? (ar ? 'تم النسخ!' : 'Copied!') : (ar ? 'نسخ الرابط' : 'Copy Link')}</span>
                </button>
              </div>
            </div>

            {/* Visual Emblem Badge Frame */}
            <div className="hidden lg:flex justify-center items-center">
              <div className="relative p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm text-center max-w-xs w-full shadow-inner">
                <div className="w-24 h-24 mx-auto grid place-items-center rounded-2xl bg-[#09221b] border border-[#d4af37]/30 shadow-lg">
                  <MizanMark className="w-16 h-16" decorative />
                </div>
                <div className="mt-4 font-display font-black text-lg text-[#fffef9]">
                  {ar ? 'معتمدة وموثقة' : 'Verified Competition'}
                </div>
                <div className="mt-1 text-xs text-[#a4c2b7] leading-relaxed">
                  {ar ? 'بنزاهة رقمية وأختام مشفرة وسجل نتائج غير قابل للتعديل' : 'Governed by cryptographic integrity and immutable records'}
                </div>
                <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-center gap-2 text-[11px] font-bold text-[#e8cb93]">
                  <ShieldCheck className="w-4 h-4" />
                  <span>{ar ? 'سجل المسابقة محمي وموثّق داخل ميزان' : 'Competition record protected in MIZAN'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* البوابة العامة: كل مستخدم يجد مدخله الطبيعي هنا، بلا حسابات وصلاحيات مزعجة. */}
        <section className="mt-8 grid sm:grid-cols-3 gap-4">
          {!closed && <button onClick={()=>{window.location.hash=`journey?comp=${competition.id}`}} className="text-start p-5 rounded-2xl bg-white border border-[#e6e0d4] hover:border-[#2f6555]/50 hover:shadow-md transition-all min-h-28">
            <UserRound className="w-6 h-6 text-[#214C40]"/><div className="font-black mt-3">{ar?'المتسابق':'Participant'}</div><div className="text-xs text-[#636864] mt-1 leading-6">{ar?'افتح رحلتك واعرف دورك ومرحلتك التالية والنتيجة عند اعتمادها.':'Open your journey, queue and published result.'}</div>
          </button>}
          {!closed && <button onClick={()=>{window.location.hash=`guardian?comp=${competition.id}`}} className="text-start p-5 rounded-2xl bg-white border border-[#e6e0d4] hover:border-[#2f6555]/50 hover:shadow-md transition-all min-h-28">
            <UsersRound className="w-6 h-6 text-[#214C40]"/><div className="font-black mt-3">{ar?'ولي الأمر':'Guardian'}</div><div className="text-xs text-[#636864] mt-1 leading-6">{ar?'متابعة آمنة للمتسابق عبر رابط أو رمز خاص، دون إنشاء حساب.':'Secure follow-up without creating an account.'}</div>
          </button>}
          <button onClick={()=>{window.location.hash='#verify'}} className="text-start p-5 rounded-2xl bg-white border border-[#e6e0d4] hover:border-[#2f6555]/50 hover:shadow-md transition-all min-h-28">
            <BadgeCheck className="w-6 h-6 text-[#214C40]"/><div className="font-black mt-3">{ar?'التحقق من شهادة':'Verify a certificate'}</div><div className="text-xs text-[#636864] mt-1 leading-6">{ar?'خدمة عامة للجميع ولا تتطلب تسجيل دخول.':'Public verification — no sign-in required.'}</div>
          </button>
        </section>

        {/* Categories Section */}
        <section className="mt-16">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-[#3E4A43]">
                {ar ? 'المسارات والفروع' : 'Tracks & Categories'}
              </div>
              <h2 className="text-2xl sm:text-3xl font-black mt-1 text-[#123f35]">
                {ar ? 'فروع المسابقة المتاحة' : 'Available Competition Branches'}
              </h2>
            </div>
            <div className="text-xs font-bold text-[#3E4A43]">
              {competition.categories.length} {ar ? 'فروع معتمدة' : 'Certified Categories'}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
            {competition.categories.map(c => (
              <div
                key={c.id}
                className="group relative p-6 rounded-2xl bg-white border border-[#e8e4d8] hover:border-[#2f6555]/40 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="w-10 h-10 rounded-xl bg-[#edf4f0] text-[#123f35] grid place-items-center">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <h3 className="font-extrabold text-base text-[#171B18] mt-4 group-hover:text-[#123f35] transition-colors">
                    {ar ? c.nameArabic : c.name}
                  </h3>
                  <div className="mt-2 text-xs text-[#3E4A43] leading-relaxed">
                    {c.riwaya} · {c.memorizationScope}
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-[#f0ede4] flex items-center justify-between text-xs font-bold">
                  <span className="text-[#214C40]">
                    {c.genderConstraint === 'male'
                      ? (ar ? 'بنين فقط' : 'Male Only')
                      : c.genderConstraint === 'female'
                      ? (ar ? 'بنات فقط' : 'Female Only')
                      : (ar ? 'للجميع' : 'Open for All')}
                  </span>
                  {registrationOpen && <button
                    onClick={() => { window.location.hash = `register?comp=${competition.id}&cat=${c.id}`; }}
                    aria-label={ar ? `اختيار فرع ${c.nameArabic}` : `Select branch ${c.name}`}
                    className="min-h-11 inline-flex items-center gap-1 text-[#123f35] hover:underline"
                  >
                    <span>{ar ? 'اختر هذا الفرع' : 'Select Branch'}</span>
                    <Arrow className="w-3 h-3" />
                  </button>}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Operational Flow & Verification Banner */}
        <section className="mt-14 rounded-3xl bg-gradient-to-r from-[#173e34] to-[#214c40] text-white p-7 sm:p-9 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-md border border-[#2f6555]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/10 grid place-items-center shrink-0">
              <ShieldCheck className="w-7 h-7 text-[#e8cb93]" />
            </div>
            <div>
              <div className="font-extrabold text-base">
                {ar ? 'المسابقة تعمل داخل مسار رقمي موحد' : 'One Competition. One Verified Flow.'}
              </div>
              <div className="text-xs text-white/80 mt-1 max-w-xl leading-relaxed">
                {ar
                  ? 'التسجيل والاستقبال والتحكيم الفوري والفرز والشهادات الرقمية تعمل جميعها داخل منصة ميزان بنزاهة متكاملة.'
                  : 'Registration, reception, synchronized live judging, grading, and digital certificates in MIZAN.'}
              </div>
            </div>
          </div>

          <button
            onClick={() => { window.location.hash = registrationOpen ? `register?comp=${competition.id}` : '#verify'; }}
            aria-label={ar ? (registrationOpen?'بدء التسجيل في المسابقة':'التحقق من شهادة') : (registrationOpen?'Start competition registration':'Verify certificate')}
            className="shrink-0 min-h-11 px-6 rounded-xl bg-white text-[#123f35] text-xs font-black hover:bg-[#FAF8F2] transition-colors"
          >
            {ar ? (registrationOpen?'ابدأ التسجيل':'التحقق من شهادة') : (registrationOpen?'Get Started':'Verify Certificate')}
          </button>
        </section>
      </main>
    </div>
  );
};
