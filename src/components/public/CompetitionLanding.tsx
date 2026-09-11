import React from 'react';
import { bilingualName } from '../../lib/ui-language';
import {
  CalendarDays, MapPin, ShieldCheck, ArrowLeft, ArrowRight,
  BookOpen, UserRound, UsersRound, BadgeCheck, Users, Clock3
} from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { MizanLogo } from '../design-system/MizanLogo';
import { Button } from '../design-system/Button';

/*
 * الصفحة العامة للمسابقة — أول ما يراه من لا يعرف ميزان، وآخر ما يقرؤه قبل أن يقرّر
 * التسجيل. كانت غلافًا فارغ الوجه (تاريخٌ ومكانٌ شرطتان) فوق ثلاث بطاقاتٍ متساوية
 * الوزن لا تقول أيّها يخصّه، وبطاقةِ فرعٍ خاليةٍ من روايتها ونطاق حفظها.
 *
 * أُعيدت على مبدأ واحد: لا يُعرض إلا ما له قيمة. كل حقيقةٍ ناقصة تختفي بدل أن تظهر
 * شرطةً، والصفحة تتقلّص حولها فلا يبقى فراغٌ يشي بنقص. والزائر يُسأل سؤالًا واحدًا —
 * «من أنت؟» — لا يُعرض عليه ثلاثة أبوابٍ متساوية.
 */

const dateText = (iso: string | undefined, ar: boolean) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(ar ? 'ar-KW-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
};

const periodText = (start?: string, end?: string, ar = true) => {
  const a = dateText(start, ar), b = dateText(end, ar);
  if (a && b && a !== b) return `${a} — ${b}`;
  return a || b || '';
};

export const CompetitionLanding: React.FC = () => {
  const { competition, language } = useAppStore();
  const ar = language === 'ar';
  const Arrow = ar ? ArrowLeft : ArrowRight;
  const closed = competition.status === 'completed' || competition.status === 'archived';
  const registrationOpen = competition.status === 'registration_open';
  const compTitle = bilingualName(competition, ar);
  const period = periodText(competition.startDate, competition.endDate, ar);
  const venue = (competition.venueName || '').trim();
  const categories = competition.categories || [];

  /* حقائق الغلاف: ما وُجد منها فقط. الشرطة ليست معلومة. */
  const facts = [
    period && { icon: CalendarDays, text: period },
    venue && { icon: MapPin, text: venue },
    categories.length > 0 && { icon: BookOpen, text: ar ? `${categories.length} ${categories.length === 1 ? 'فرع' : 'فروع'}` : `${categories.length} ${categories.length === 1 ? 'branch' : 'branches'}` },
  ].filter(Boolean) as { icon: React.ComponentType<{ className?: string }>; text: string }[];

  const doors = [
    { key: 'participant', icon: UserRound, href: '#journey', title: ar ? 'أنا متسابق' : 'I am a participant', body: ar ? 'افتح رحلتك: دورك، ومرحلتك التالية، ونتيجتك عند اعتمادها.' : 'Open your journey: your turn, your next stage, your result once approved.' },
    { key: 'guardian', icon: UsersRound, href: '#guardian', title: ar ? 'أنا ولي أمر' : 'I am a guardian', body: ar ? 'تابع متسابقك عبر رابطٍ خاص، دون إنشاء حساب.' : 'Follow your participant through a private link — no account needed.' },
    { key: 'verify', icon: BadgeCheck, href: '#verify', title: ar ? 'أتحقق من شهادة' : 'Verify a certificate', body: ar ? 'رقم الشهادة يكفي. خدمة عامة لا تتطلب دخولًا.' : 'The certificate number is enough. Public, no sign-in.' },
  ];

  return (
    <div className="min-h-screen bg-[#FAF8F2] text-[#171B18] antialiased" dir={ar ? 'rtl' : 'ltr'}>
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[#FAF8F2]/88 border-b border-[#e7e2d6]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <MizanLogo language={language} compact />
          <a href="#" className="min-h-11 inline-flex items-center px-3 rounded-xl text-xs font-bold text-[#3E4A43] hover:bg-[#efece3] transition">
            {ar ? 'دخول الإدارة' : 'Staff sign in'}
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
        {/* ── الغلاف ─────────────────────────────────────────────────────────
            اسم المسابقة هو البطل، ومقاسه يتبع طوله فلا ينكسر ولا يتضاءل.
            الحقائق تحته سطرٌ واحد يفصله خطّ، والدعوة زرٌّ مصمت لا شبح زرّ. */}
        <section className="relative overflow-hidden rounded-[28px] mt-8 bg-[#0f332b] text-[#F6F3EA] px-6 sm:px-12 py-12 sm:py-16">
          <div aria-hidden="true" className="absolute inset-0 opacity-[.07] bg-[radial-gradient(#E8CB93_1px,transparent_1px)] [background-size:22px_22px]" />
          <div aria-hidden="true" className="absolute -top-24 -end-24 w-80 h-80 rounded-full bg-[#1b5346] blur-3xl opacity-50" />
          <div className="relative max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#E8CB93]/30 bg-[#E8CB93]/10 px-3 py-1.5 text-[11px] font-black tracking-wide text-[#E8CB93]">
              <ShieldCheck className="w-3.5 h-3.5" />
              {competition.edition ? (ar ? `${competition.edition}` : competition.edition) : (ar ? 'منظومة ميزان الرسمية' : 'Official MIZAN platform')}
            </span>

            <h1 className="mt-6 font-black leading-[1.12] tracking-tight text-[clamp(2.1rem,5.4vw,4rem)]">{compTitle}</h1>

            {facts.length > 0 && (
              <div className="mt-7 pt-6 border-t border-[#F6F3EA]/15 flex flex-wrap items-center gap-x-7 gap-y-3">
                {facts.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-2.5 text-[15px] font-bold text-[#F6F3EA]/85">
                    <f.icon className="w-[18px] h-[18px] text-[#E8CB93]" />{f.text}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-9 flex flex-wrap items-center gap-3">
              {registrationOpen ? (
                <a href={`#register?comp=${competition.id}`} className="min-h-14 inline-flex items-center gap-2.5 rounded-2xl bg-[#E8CB93] px-7 text-[#11241f] text-base font-black shadow-[0_10px_30px_rgba(232,203,147,.22)] hover:bg-[#f0d8a9] transition">
                  {ar ? 'سجّل الآن في المسابقة' : 'Register now'}<Arrow className="w-5 h-5" />
                </a>
              ) : (
                <span className="min-h-14 inline-flex items-center rounded-2xl border border-[#F6F3EA]/20 px-6 text-sm font-black text-[#F6F3EA]/80">
                  {closed ? (ar ? 'انتهت هذه المسابقة' : 'This competition has ended') : (ar ? 'التسجيل لم يُفتح بعد' : 'Registration is not open yet')}
                </span>
              )}
              <a href="#verify" className="min-h-14 inline-flex items-center gap-2 rounded-2xl border border-[#F6F3EA]/20 px-6 text-sm font-black text-[#F6F3EA]/90 hover:bg-[#F6F3EA]/[.06] transition">
                <BadgeCheck className="w-[18px] h-[18px]" />{ar ? 'تحقق من شهادة' : 'Verify a certificate'}
              </a>
            </div>
          </div>
        </section>

        {/* ── الفروع ─────────────────────────────────────────────────────────
            بطاقةٌ لا تعرض حقلًا فارغًا: الرواية ونطاق الحفظ والعمر تظهر إن وُجدت. */}
        {categories.length > 0 && (
          <section className="mt-16">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-[11px] font-black tracking-[.16em] text-[#6f6a5c]">{ar ? 'المسارات' : 'TRACKS'}</div>
                <h2 className="text-2xl sm:text-3xl font-black mt-1.5">{ar ? 'اختر فرعك' : 'Choose your branch'}</h2>
              </div>
            </div>

            <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map(cat => {
                const rows = [
                  cat.riwaya && { icon: BookOpen, label: ar ? 'الرواية' : 'Riwaya', value: cat.riwaya },
                  cat.memorizationScope && { icon: ShieldCheck, label: ar ? 'نطاق الحفظ' : 'Scope', value: cat.memorizationScope },
                  (cat.minAge || cat.maxAge) && {
                    icon: Users, label: ar ? 'العمر' : 'Age',
                    value: cat.minAge && cat.maxAge ? (ar ? `${cat.minAge} – ${cat.maxAge} سنة` : `${cat.minAge}–${cat.maxAge}`) : cat.minAge ? (ar ? `${cat.minAge} فأكثر` : `${cat.minAge}+`) : (ar ? `حتى ${cat.maxAge}` : `up to ${cat.maxAge}`),
                  },
                  cat.targetDurationMinutes ? { icon: Clock3, label: ar ? 'زمن الجلسة' : 'Session', value: ar ? `${cat.targetDurationMinutes} دقيقة` : `${cat.targetDurationMinutes} min` } : null,
                ].filter(Boolean) as { icon: React.ComponentType<{ className?: string }>; label: string; value: string }[];

                const gender = cat.genderConstraint && cat.genderConstraint !== 'all'
                  ? (cat.genderConstraint === 'male' ? (ar ? 'للرجال' : 'Men') : (ar ? 'للنساء' : 'Women'))
                  : (ar ? 'للجميع' : 'Open to all');

                return (
                  <article key={cat.id} className="group h-full flex flex-col rounded-3xl border border-[#e7e2d6] bg-white p-6 transition hover:border-[#c9bfa6] hover:shadow-[0_18px_44px_rgba(23,45,38,.07)]">
                    <div className="flex items-start justify-between gap-3">
                      <span className="w-11 h-11 rounded-2xl bg-[#EFF4F1] text-[#1b5346] grid place-items-center shrink-0"><BookOpen className="w-5 h-5" /></span>
                      <span className="rounded-full bg-[#F5F1E6] px-2.5 py-1 text-[11px] font-black text-[#7c6f52]">{gender}</span>
                    </div>
                    <h3 className="mt-4 text-lg font-black leading-snug">{bilingualName(cat, ar)}</h3>
                    {cat.description && <p className="mt-1.5 text-[13px] leading-6 text-[#6b675d]">{cat.description}</p>}

                    {rows.length > 0 && (
                      <dl className="mt-5 space-y-2.5 flex-1">
                        {rows.map((r, i) => (
                          <div key={i} className="flex items-center gap-2.5 text-[13px]">
                            <r.icon className="w-4 h-4 text-[#9aa39d] shrink-0" />
                            <dt className="text-[#67635a]">{r.label}</dt>
                            <dd className="ms-auto font-black text-[#2a302b] text-end">{r.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}

                    {registrationOpen && (
                      <a href={`#register?comp=${competition.id}&category=${cat.id}`} className="mt-6 min-h-12 w-full shrink-0 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#123f35] px-4 text-sm font-black text-[#F6F3EA] hover:bg-[#0d322a] transition">
                        {ar ? 'سجّل في هذا الفرع' : 'Register for this branch'}<Arrow className="w-4 h-4" />
                      </a>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* ── أبواب الزائر ──────────────────────────────────────────────────
            ثلاثة أبواب لا يدخلها الزائر نفسه: فتُعرض صفًّا هادئًا لا بطاقاتٍ متنافسة. */}
        <section className="mt-16">
          <div className="text-[11px] font-black tracking-[.16em] text-[#6f6a5c]">{ar ? 'أنت هنا لأنك' : 'YOU ARE HERE AS'}</div>
          <div className="mt-4 grid sm:grid-cols-3 gap-px rounded-3xl overflow-hidden border border-[#e7e2d6] bg-[#e7e2d6]">
            {doors.map(d => (
              <a key={d.key} href={d.href} className="bg-[#FDFCF8] p-6 transition hover:bg-white group">
                <span className="w-10 h-10 rounded-xl bg-[#F2EFE6] text-[#3E4A43] grid place-items-center"><d.icon className="w-5 h-5" /></span>
                <div className="mt-4 flex items-center gap-2">
                  <h3 className="text-[15px] font-black">{d.title}</h3>
                  <Arrow className="w-4 h-4 text-[#9aa39d] transition group-hover:translate-x-0 rtl:group-hover:-translate-x-1 ltr:group-hover:translate-x-1" />
                </div>
                <p className="mt-2 text-[13px] leading-6 text-[#6b675d]">{d.body}</p>
              </a>
            ))}
          </div>
        </section>

        {/* ── الختام ───────────────────────────────────────────────────────── */}
        <section className="mt-16 rounded-3xl bg-[#123f35] text-[#F6F3EA] px-6 sm:px-10 py-9 flex flex-col sm:flex-row sm:items-center gap-6">
          <span className="w-12 h-12 rounded-2xl bg-[#F6F3EA]/10 grid place-items-center shrink-0"><ShieldCheck className="w-6 h-6 text-[#E8CB93]" /></span>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-black">{ar ? 'المسابقة كلها داخل مسارٍ رقمي واحد' : 'One digital track, end to end'}</h3>
            <p className="mt-1.5 text-[13px] leading-6 text-[#F6F3EA]/70">
              {ar ? 'التسجيل والاستقبال والتحكيم والفرز والشهادات — جميعها داخل ميزان، بأثرٍ محفوظ لكل خطوة.' : 'Registration, check-in, judging, ranking and certificates — all inside MIZAN, with an auditable trace at every step.'}
            </p>
          </div>
          {registrationOpen && (
            <Button size="lg" className="shrink-0 bg-[#E8CB93] text-[#11241f] hover:bg-[#f0d8a9]" onClick={() => { window.location.hash = `register?comp=${competition.id}`; }}>
              {ar ? 'ابدأ التسجيل' : 'Start registration'}
            </Button>
          )}
        </section>
      </main>
    </div>
  );
};
