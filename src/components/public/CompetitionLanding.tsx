import React from 'react';
import { bilingualName } from '../../lib/ui-language';
import { useMemo } from 'react';
import {
  CalendarDays, MapPin, ShieldCheck, ArrowLeft, ArrowRight,
  BookOpen, UserRound, UsersRound, Users, Clock3, Trophy,
  FileText, Gavel, Award, Check, KeyRound, Hourglass, DoorOpen, Lock, Radio, Sparkles, BadgeCheck, Building2, Star, Moon, Feather, Gem
} from 'lucide-react';
import { buildWinnersArchive } from '../../lib/winners-archive';
import { useAppStore } from '../../lib/store';
import { MizanLogo } from '../design-system/MizanLogo';

/*
 * الصفحة العامة للمسابقة — أول ما يراه من لا يعرف ميزان، وآخر ما يقرؤه قبل أن يقرّر
 * التسجيل. كانت غلافًا فارغ الوجه (تاريخٌ ومكانٌ شرطتان) فوق ثلاث بطاقاتٍ متساوية
 * الوزن لا تقول أيّها يخصّه، وبطاقةِ فرعٍ خاليةٍ من روايتها ونطاق حفظها.
 *
 * أُعيدت على مبدأ واحد: لا يُعرض إلا ما له قيمة. كل حقيقةٍ ناقصة تختفي بدل أن تظهر
 * شرطةً، والصفحة تتقلّص حولها فلا يبقى فراغٌ يشي بنقص. والزائر يُسأل سؤالًا واحدًا —
 * «من أنت؟» — لا يُعرض عليه ثلاثة أبوابٍ متساوية.
 */

/*
 * التاريخ المجرّد (2026-10-02) يُقرأ يومًا تقويميًا محليًا لا لحظةً بتوقيت UTC: وإلا بدا في
 * المتصفحات غرب UTC قبل يومه بيوم، فيظهر «آخر يوم» يوم الأمس وتختفي نافذة التسجيل مبكرًا.
 */
const calendarDay = (iso: string): Date => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
};

const dateText = (iso: string | undefined, ar: boolean) => {
  if (!iso) return '';
  const d = calendarDay(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(ar ? 'ar-KW-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
};

const periodText = (start?: string, end?: string, ar = true) => {
  const a = dateText(start, ar), b = dateText(end, ar);
  if (a && b && a !== b) return `${a} — ${b}`;
  return a || b || '';
};

/* أيام صحيحة بين اليوم وتاريخٍ حقيقي؛ لا تُحسب إن كان التاريخ غير صالح. */
const daysUntil = (iso?: string): number | null => {
  if (!iso) return null;
  const d = calendarDay(iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
};

/* أسماء الجهة تُهمل إن كانت معرّفًا نظاميًا أو نائبًا: لا يُعرض إلا ما هو اسمٌ فعلًا. */
const PLACEHOLDER = /^(mizan|ميزان|org-pending-setup|comp-pending-setup)$/i;
const realName = (v?: string) => {
  const t = (v || '').trim();
  return !t || PLACEHOLDER.test(t) || /^MZ-(ORG|TEN|LIC)-\d+$/i.test(t) ? '' : t;
};
const safeLogo = (u?: string) => (u && !u.startsWith('data:') ? u : undefined);

type IconC = React.ComponentType<{ className?: string }>;

/* لكل فرعٍ علامته ولونه الهادئ: بطاقاتٌ متطابقة الأيقونة لا تُفرَّق بالنظر. تدور على الترتيب فلا تتغيّر معنىً. */
const BRANCH_GLYPHS: { icon: IconC; fg: string; bg: string }[] = [
  { icon: BookOpen, fg: 'var(--emerald-2)', bg: 'var(--emerald-soft)' },
  { icon: Moon, fg: 'var(--amber)', bg: 'var(--amber-soft)' },
  { icon: Star, fg: 'var(--blue)', bg: 'var(--blue-soft)' },
  { icon: Feather, fg: 'var(--danger)', bg: 'var(--danger-soft)' },
  { icon: Gem, fg: 'var(--emerald)', bg: 'var(--surface-soft)' },
];
/* ميدالية المركز: ذهبٌ ففضّةٌ فنحاس، وما بعدها محايد. */
const PLACE_TINT = ['#c9a227', '#8d99a3', '#b0703a'];
/* نصٌّ لاتينيّ خالص داخل بطاقة عربية: يُقرأ يسارًا بخطه لا مشوّشًا بين الاتجاهين. */
const latinOnly = (t?: string) => !!t && !/[\u0600-\u06FF]/.test(t) && /[A-Za-z]/.test(t);
const mixedDir = (t?: string): { dir: 'auto'; lang?: string; className?: string } => latinOnly(t) ? { dir: 'auto', lang: 'en', className: 'font-sans-en text-start' } : { dir: 'auto' };

export const CompetitionLanding: React.FC = () => {
  const store = useAppStore();
  const { competition, language } = store;
  const ar = language === 'ar';
  const Arrow = ar ? ArrowLeft : ArrowRight;
  const registrationOpen = competition.status === 'registration_open';
  const compTitle = bilingualName(competition, ar);
  const period = periodText(competition.startDate, competition.endDate, ar);
  const venue = (competition.venueName || '').trim();
  const categories = competition.categories || [];
  const status = competition.status;

  /* هوية الجهة: ما وُجد فعلًا فقط. شعار المسابقة يتقدّم على شعار الجهة. */
  const brand = store.organization?.brand;
  /* المتجر قد يحمل جهةً حُمّلت قبل هذه المسابقة (موظفٌ فتح رابط مسابقة جهة أخرى): لا تُنسب هويتها
     إلى هذه المسابقة إلا إذا كانت هي جهتها فعلًا. */
  const pendingOrg = store.organization?.id === 'org-pending-setup' || !store.organization || store.organization.id !== competition.organizationId;
  const compLogo = safeLogo(competition.logoUrl);
  const orgLogo = pendingOrg ? undefined : safeLogo(brand?.logoUrl);
  const orgName = pendingOrg ? '' : (ar
    ? (realName(brand?.displayNameArabic) || realName(brand?.nameArabic) || realName(store.organization?.nameArabic) || realName(brand?.name))
    : (realName(brand?.displayName) || realName(brand?.name) || realName(store.organization?.name) || realName(brand?.nameArabic)));
  const logo = compLogo || orgLogo;
  const [logoFailed, setLogoFailed] = React.useState(false);
  const showLogo = !!logo && !logoFailed;

  /* حالة المسابقة الحقيقية: أيقونة وعبارةٌ لكل حالة، ولا تواريخ مخترعة. */
  const statusMeta: { icon: IconC; label: string; tone: 'gold' | 'calm' } = ({
    draft: { icon: Hourglass, label: ar ? 'قريبًا' : 'Opening soon', tone: 'calm' },
    configured: { icon: Hourglass, label: ar ? 'قريبًا' : 'Opening soon', tone: 'calm' },
    registration_open: { icon: DoorOpen, label: ar ? 'التسجيل مفتوح' : 'Registration open', tone: 'gold' },
    registration_closed: { icon: Lock, label: ar ? 'أُغلق التسجيل' : 'Registration closed', tone: 'calm' },
    live: { icon: Radio, label: ar ? 'المسابقة جارية' : 'Live now', tone: 'gold' },
    paused: { icon: Hourglass, label: ar ? 'متوقفة مؤقتًا' : 'Paused', tone: 'calm' },
    judging_complete: { icon: Gavel, label: ar ? 'اكتمل التحكيم' : 'Judging complete', tone: 'calm' },
    results_sealed: { icon: Gavel, label: ar ? 'اكتمل التحكيم' : 'Judging complete', tone: 'calm' },
    results_published: { icon: Sparkles, label: ar ? 'النتائج معلنة' : 'Results announced', tone: 'gold' },
    completed: { icon: BadgeCheck, label: ar ? 'انتهت' : 'Ended', tone: 'calm' },
    archived: { icon: BadgeCheck, label: ar ? 'انتهت' : 'Ended', tone: 'calm' },
  } as Record<string, { icon: IconC; label: string; tone: 'gold' | 'calm' }>)[status] || { icon: Hourglass, label: ar ? 'قريبًا' : 'Opening soon', tone: 'calm' };

  /* نافذة التسجيل من تواريخ المسابقة نفسها، وتُهمل إن لم تكن صالحة. */
  const regStart = dateText(competition.registrationStartDate, ar);
  const regEnd = dateText(competition.registrationEndDate, ar);
  const toStart = daysUntil(competition.registrationStartDate);
  const toEnd = daysUntil(competition.registrationEndDate);
  const dayWord = (n: number) => ar ? (n === 1 ? 'يوم' : n === 2 ? 'يومين' : n <= 10 ? 'أيام' : 'يومًا') : (n === 1 ? 'day' : 'days');
  const regNote: { icon: IconC; text: string; hint?: string } | null =
    registrationOpen && regEnd && toEnd !== null && toEnd >= 0
      ? { icon: CalendarDays, text: ar ? `يُغلق التسجيل ${regEnd}` : `Registration closes ${regEnd}`, hint: toEnd !== null && toEnd >= 0 ? (toEnd === 0 ? (ar ? 'اليوم آخر يوم' : 'Last day today') : (ar ? `بعد ${toEnd === 1 || toEnd === 2 ? dayWord(toEnd) : `${toEnd} ${dayWord(toEnd)}`}` : `in ${toEnd} ${dayWord(toEnd)}`)) : undefined }
      : (status === 'draft' || status === 'configured') && regStart && toStart !== null && toStart >= 0
        ? { icon: CalendarDays, text: ar ? `يفتح التسجيل ${regStart}` : `Registration opens ${regStart}`, hint: toStart === 0 ? (ar ? 'اليوم' : 'Today') : (ar ? `بعد ${toStart === 1 || toStart === 2 ? dayWord(toStart) : `${toStart} ${dayWord(toStart)}`}` : `in ${toStart} ${dayWord(toStart)}`) }
        : null;

  /* رحلة المشاركة: الخطوة الجارية تتبع حالة المسابقة. بعد النهاية كلها مكتملة. */
  const stepNow = ({ draft: 0, configured: 0, registration_open: 0, registration_closed: 1, live: 2, paused: 2, judging_complete: 2, results_sealed: 3, results_published: 3 } as Record<string, number>)[status] ?? 4;
  const steps: { icon: IconC; label: string; hint: string }[] = [
    { icon: FileText, label: ar ? 'التسجيل' : 'Register', hint: ar ? 'املأ الطلب' : 'Fill the form' },
    { icon: BadgeCheck, label: ar ? 'الاعتماد' : 'Approval', hint: ar ? 'يصلك رابطك الخاص' : 'Get your private link' },
    { icon: Gavel, label: ar ? 'التحكيم' : 'Judging', hint: ar ? 'يوم تلاوتك' : 'Your recitation day' },
    { icon: Award, label: ar ? 'الشهادة' : 'Certificate', hint: ar ? 'نتيجتك وشهادتك' : 'Result and certificate' },
  ];

  /* حقائق الغلاف: ما وُجد منها فقط. الشرطة ليست معلومة. */
  const facts = [
    period && { icon: CalendarDays, text: period },
    venue && { icon: MapPin, text: venue },
    categories.length > 0 && { icon: BookOpen, text: ar ? `${categories.length} ${categories.length === 1 ? 'فرع' : 'فروع'}` : `${categories.length} ${categories.length === 1 ? 'branch' : 'branches'}` },
  ].filter(Boolean) as { icon: React.ComponentType<{ className?: string }>; text: string }[];

  const doors: { key: string; icon: IconC; href: string; title: string; need: string; needIcon: IconC }[] = [
    { key: 'participant', icon: UserRound, href: '#journey', title: ar ? 'أنا متسابق' : 'I am a participant', need: ar ? 'الرابط الخاص الذي وصلك بعد قبول طلبك' : 'The private link sent after your application is accepted', needIcon: KeyRound },
    { key: 'guardian', icon: UsersRound, href: '#guardian', title: ar ? 'أنا ولي أمر' : 'I am a guardian', need: ar ? 'الرابط الخاص الذي وصلك بعد قبول طلب ابنك' : 'The private link sent after your child is accepted', needIcon: KeyRound },
    { key: 'verify', icon: BadgeCheck, href: '#verify', title: ar ? 'أتحقق من شهادة' : 'Verify a certificate', need: ar ? 'رقم الشهادة يكفي — دون دخول' : 'Just the certificate number — no sign-in', needIcon: Award },
  ];

  /*
   * سجل الفائزين.
   *
   * يُبنى من النتائج المختومة وحدها، ومن الدورات السابقة دون الجارية: نتيجةٌ لم تُختم
   * ليست تاريخًا بعد، والدورةُ الجارية لها شاشتها. والمركز المحجوب يُذكر محجوبًا بسببه،
   * لأن حذفه من السجل يجعل «الأول» يبدو ممنوحًا في كل دورة وهو ليس كذلك.
   */
  const archive = useMemo(() => buildWinnersArchive({
    competitions: (store.competitions || []).map(c => ({
      id: c.id, name: c.name, nameArabic: c.nameArabic, edition: c.edition,
      startDate: c.startDate, endDate: c.endDate, status: c.status,
      categories: (c.categories || []).map(x => ({ id: x.id, name: x.name, nameArabic: x.nameArabic })),
      awards: c.policy?.results?.awards,
      tieBreakRules: c.ruleSet?.tieBreakRules,
    })),
    results: store.results.map(r => ({
      competitionId: r.competitionId, categoryId: r.categoryId, participantId: r.participantId,
      participantCode: r.participantCode, participantName: r.participantName,
      participantNameArabic: r.participantNameArabic, finalScore: r.finalScore, status: r.status,
      criterionScores: r.criterionScores, penaltyCount: r.penaltyCount,
    })),
    excludeCompetitionId: competition.id,
  }), [store.competitions, store.results, competition.id]);

  return (
    <div className="min-h-screen bg-[var(--canvas-warm)] text-[#171B18] antialiased" dir={ar ? 'rtl' : 'ltr'}>
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[var(--canvas-warm)]/88 border-b border-[#e7e2d6]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {(showLogo || orgName) ? (
            <div className="flex items-center gap-3 min-w-0">
              {showLogo && <img src={logo} alt={compLogo ? (ar ? 'شعار المسابقة' : 'Competition logo') : (ar ? 'شعار الجهة' : 'Organizer logo')} onError={() => setLogoFailed(true)} className="w-10 h-10 rounded-xl object-contain bg-white border border-[#e7e2d6] shrink-0" />}
              <div className="min-w-0 leading-tight">
                {orgName && <div className="text-sm font-black truncate">{orgName}</div>}
                <div className="text-[10px] font-bold text-[#5f5b52] tracking-wide">{ar ? 'بمنظومة ميزان' : 'Powered by MIZAN'}</div>
              </div>
            </div>
          ) : (
            <MizanLogo language={language} compact />
          )}
          <a href="#" className="min-h-11 inline-flex items-center px-2 rounded-xl text-[11px] font-semibold text-[#6f6a5c] hover:text-[#3E4A43] hover:bg-[#efece3] transition">
            {ar ? 'دخول الإدارة' : 'Staff sign in'}
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
        {/* ── الغلاف ─────────────────────────────────────────────────────────
            اسم المسابقة هو البطل، ومقاسه يتبع طوله فلا ينكسر ولا يتضاءل.
            الحقائق تحته سطرٌ واحد يفصله خطّ، والدعوة زرٌّ مصمت لا شبح زرّ. */}
        <section className="relative overflow-hidden rounded-[28px] mt-8 bg-[var(--ink-night)] text-[#F6F3EA] px-6 sm:px-12 py-12 sm:py-16">
          <div aria-hidden="true" className="absolute inset-0 opacity-[.07] bg-[radial-gradient(var(--gold-light)_1px,transparent_1px)] [background-size:22px_22px]" />
          <div aria-hidden="true" className="mz-orb-glow absolute -top-24 -end-24 w-80 h-80 rounded-full bg-[#1b5346] blur-3xl" />
          <div aria-hidden="true" className="mz-arabesque absolute -bottom-20 -start-16 w-[26rem] h-[26rem]" />
          <div className="relative max-w-3xl">
            {(showLogo || orgName) && (
              <div className="mb-6 flex items-center gap-4">
                {showLogo && <img src={logo} alt="" onError={() => setLogoFailed(true)} className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-white p-2.5 object-contain shadow-[0_12px_32px_rgba(0,0,0,.25)]" />}
                {orgName && (
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-1.5 text-[11px] font-black tracking-wide text-[var(--gold-light)]"><Building2 className="w-3.5 h-3.5" />{ar ? 'تنظّمها' : 'Organized by'}</div>
                    <div className="mt-1 text-base sm:text-lg font-black text-[#F6F3EA] leading-snug">{orgName}</div>
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--gold-light)]/30 bg-[var(--gold-light)]/10 px-3 py-1.5 text-[11px] font-black tracking-wide text-[var(--gold-light)]">
                <ShieldCheck className="w-3.5 h-3.5" />
                {competition.edition ? competition.edition : (ar ? 'منظومة ميزان الرسمية' : 'Official MIZAN platform')}
              </span>
              <span role="status" className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-black ${statusMeta.tone === 'gold' ? 'bg-[var(--gold-light)] text-[#11241f]' : 'bg-[#F6F3EA]/10 text-[#F6F3EA]/90 border border-[#F6F3EA]/15'}`}>
                <statusMeta.icon className="w-3.5 h-3.5" />{statusMeta.label}
              </span>
            </div>

            <h1 className="mt-5 font-display font-black leading-[1.12] tracking-tight text-[clamp(2.1rem,5.4vw,4rem)]">{compTitle}</h1>

            {facts.length > 0 && (
              <div className="mt-7 pt-6 border-t border-[#F6F3EA]/15 flex flex-wrap items-center gap-x-7 gap-y-3">
                {facts.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-2.5 text-[15px] font-bold text-[#F6F3EA]/85">
                    <f.icon className="w-[18px] h-[18px] text-[var(--gold-light)]" />{f.text}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-9 flex flex-wrap items-center gap-3">
              {registrationOpen ? (
                <a href={`#register?comp=${competition.id}`} className="min-h-14 inline-flex items-center gap-2.5 rounded-2xl bg-[var(--gold-light)] px-7 text-[#11241f] text-base font-black shadow-[0_10px_30px_rgba(232,203,147,.22)] hover:bg-[#f0d8a9] transition">
                  {ar ? 'سجّل الآن في المسابقة' : 'Register now'}<Arrow className="w-5 h-5" />
                </a>
              ) : (
                <span className="min-h-14 inline-flex items-center gap-2.5 rounded-2xl border border-[#F6F3EA]/20 px-6 text-sm font-black text-[#F6F3EA]/85">
                  <statusMeta.icon className="w-[18px] h-[18px] text-[var(--gold-light)]" />{statusMeta.label}
                </span>
              )}
              <a href="#verify" className="min-h-14 inline-flex items-center gap-2 rounded-2xl border border-[#F6F3EA]/20 px-6 text-sm font-black text-[#F6F3EA]/90 hover:bg-[#F6F3EA]/[.06] transition">
                <BadgeCheck className="w-[18px] h-[18px]" />{ar ? 'تحقق من شهادة' : 'Verify a certificate'}
              </a>
            </div>
            {regNote && (
              <p className="mt-4 inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-bold text-[#F6F3EA]/80">
                <regNote.icon className="w-4 h-4 text-[var(--gold-light)]" />{regNote.text}
                {regNote.hint && <span className="rounded-full bg-[var(--gold-light)]/15 px-2 py-0.5 text-[11px] font-black text-[var(--gold-light)]">{regNote.hint}</span>}
              </p>
            )}
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
              {categories.map((cat, ci) => {
                const glyph = BRANCH_GLYPHS[ci % BRANCH_GLYPHS.length];
                const rows = [
                  cat.riwaya && { icon: BookOpen, label: ar ? 'الرواية' : 'Riwaya', value: cat.riwaya },
                  cat.memorizationScope && { icon: ShieldCheck, label: ar ? 'نطاق الحفظ' : 'Scope', value: cat.memorizationScope },
                ].filter(Boolean) as { icon: IconC; label: string; value: string }[];

                const ageText = (cat.minAge || cat.maxAge)
                  ? (cat.minAge && cat.maxAge ? (ar ? `${cat.minAge} – ${cat.maxAge} سنة` : `${cat.minAge}–${cat.maxAge} yrs`) : cat.minAge ? (ar ? `${cat.minAge} فأكثر` : `${cat.minAge}+`) : (ar ? `حتى ${cat.maxAge}` : `up to ${cat.maxAge}`))
                  : '';

                const gender = cat.genderConstraint && cat.genderConstraint !== 'all'
                  ? (cat.genderConstraint === 'male' ? (ar ? 'للرجال' : 'Men') : (ar ? 'للنساء' : 'Women'))
                  : (ar ? 'للجميع' : 'Open to all');

                const chips: { icon: IconC; text: string; label: string }[] = [
                  { icon: UserRound, text: gender, label: ar ? 'الفئة' : 'Open to' },
                  ageText && { icon: Users, text: ageText, label: ar ? 'العمر' : 'Age' },
                  cat.targetDurationMinutes ? { icon: Clock3, text: ar ? `${cat.targetDurationMinutes} دقيقة` : `${cat.targetDurationMinutes} min`, label: ar ? 'زمن الجلسة' : 'Session' } : null,
                ].filter(Boolean) as { icon: IconC; text: string; label: string }[];

                return (
                  <article key={cat.id} style={{ ["--i" as string]: ci }} className="mz-enter group h-full flex flex-col rounded-3xl border border-[#e7e2d6] bg-white p-6 transition hover:border-[#c9bfa6] hover:shadow-[0_18px_44px_rgba(23,45,38,.07)]">
                    <div className="flex items-start justify-between gap-3">
                      <span style={{ background: glyph.bg, color: glyph.fg }} className="w-11 h-11 rounded-2xl grid place-items-center shrink-0"><glyph.icon className="w-5 h-5" /></span>
                    </div>
                    <h3 className="mt-4 text-lg font-black leading-snug">{bilingualName(cat, ar)}</h3>
                    {cat.description && <p {...mixedDir(cat.description)} className={`mt-1.5 text-[13px] leading-6 text-[#6b675d] ${mixedDir(cat.description).className || ''}`}>{cat.description}</p>}
                    <ul className="mt-4 flex flex-wrap gap-2">
                      {chips.map((c, i) => (
                        <li key={i} aria-label={`${c.label}: ${c.text}`} className="inline-flex items-center gap-1.5 rounded-full bg-[#F5F1E6] px-3 py-1.5 text-[12px] font-black text-[#6b5d3d]">
                          <c.icon className="w-3.5 h-3.5" />{c.text}
                        </li>
                      ))}
                    </ul>

                    {rows.length > 0 && (
                      <dl className="mt-4 space-y-2.5 flex-1">
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
                      <a href={`#register?comp=${competition.id}&category=${cat.id}`} className="mt-6 min-h-12 w-full shrink-0 inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--ink-deep)] px-4 text-sm font-black text-[#F6F3EA] shadow-[0_8px_20px_rgba(18,63,53,.22)] hover:bg-[#0d322a] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-light)]">
                        {ar ? 'سجّل في هذا الفرع' : 'Register for this branch'}<Arrow className="w-4 h-4" />
                      </a>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}


        {/* ── سجل الفائزين ──────────────────────────────────────────────────
            الدورات السابقة بفائزيها ونِسَبهم. لا يُعرض القسم إن لم يكن خلفه تاريخ. */}
        {archive.length > 0 && (
          <section className="mt-16">
            <div className="text-[11px] font-black tracking-[.16em] text-[#6f6a5c]">{ar ? 'الدورات السابقة' : 'PAST EDITIONS'}</div>
            <h2 className="text-2xl sm:text-3xl font-black mt-1.5">{ar ? 'سجل الفائزين' : 'Roll of honour'}</h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#6b675d]">
              {ar
                ? 'من نتائج مختومة، بنِسَبها كما تحققت. والمركز الذي لم يبلغ أحدٌ نسبته يُذكر محجوبًا — لأن حذفه يجعل المركز يبدو ممنوحًا في كل دورة.'
                : 'Built from sealed results, with the percentages as they were achieved. A place nobody reached is listed as withheld rather than quietly dropped.'}
            </p>

            <div className="mt-6 space-y-4">
              {archive.map(edition => (
                <article key={edition.competitionId} className="rounded-3xl border border-[#e7e2d6] bg-white p-6">
                  <header className="flex flex-wrap items-baseline justify-between gap-3">
                    <h3 className="text-lg font-black">{ar ? edition.titleArabic : edition.title}</h3>
                    <span className="text-[12px] font-bold text-[#7c6f52]">{[edition.edition, edition.year].filter(Boolean).join(' · ')}</span>
                  </header>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {edition.categories.map(category => (
                      <div key={category.categoryId} className="rounded-2xl bg-[#FBF9F3] p-4">
                        <div className="text-[12px] font-black text-[#3E4A43]">{ar ? category.categoryNameArabic : category.categoryName}</div>
                        <ul className="mt-2.5 space-y-2">
                          {category.winners.map(winner => (
                            <li key={`${winner.rank}-${winner.participantCode}`} className="flex items-center gap-2.5 text-[13px]">
                              <Trophy style={{ color: PLACE_TINT[winner.rank - 1] || 'var(--muted)' }} className="h-4 w-4 shrink-0" />
                              <span className="min-w-0 flex-1 break-words sm:truncate font-bold">{ar ? winner.participantNameArabic : winner.participantName}</span>
                              <span className="shrink-0 text-[11px] font-black text-[#67635a]">{ar ? winner.placeTitleArabic : winner.placeTitleEnglish}</span>
                              <span className="shrink-0 text-[11px] font-black tabular-nums text-[#1b5346]">{winner.percentage}%</span>
                            </li>
                          ))}
                          {category.withheld.map(entry => (
                            <li key={`withheld-${entry.rank}`} className="text-[11px] font-bold leading-5 text-[#8a6536]">
                              {ar ? entry.reasonArabic : entry.reasonEnglish}
                            </li>
                          ))}
                          {category.contested.map(entry => (
                            <li key={`contested-${entry.rank}`} className={`text-[11px] font-bold leading-5 ${entry.decided ? 'text-[#1b5346]' : 'text-[#8a4b36]'}`}>
                              {ar ? entry.noteArabic : entry.noteEnglish}
                            </li>
                          ))}
                          {!category.winners.length && !category.withheld.length && !category.contested.length && (
                            <li className="text-[11px] text-[#6b675d]">{ar ? 'لا سجل معتمد لهذا الفرع.' : 'No sealed record for this branch.'}</li>
                          )}
                        </ul>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* ── أبواب الزائر ──────────────────────────────────────────────────
            ثلاثة أبواب لا يدخلها الزائر نفسه: فتُعرض صفًّا هادئًا لا بطاقاتٍ متنافسة. */}
        <section className="mt-16">
          <div className="text-[11px] font-black tracking-[.16em] text-[#6f6a5c]">{ar ? 'أنت هنا لأنك' : 'YOU ARE HERE AS'}</div>
          <div className="mt-4 grid sm:grid-cols-3 gap-px rounded-3xl overflow-hidden border border-[#e7e2d6] bg-[#e7e2d6]">
            {doors.map((d, di) => (
              <div key={d.key} style={{ ["--i" as string]: di }} className="mz-enter bg-[#FDFCF8] p-6 flex flex-col">
                <a href={d.href} className="group block min-h-11 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ink-deep)]">
                  <span className="w-10 h-10 rounded-xl bg-[#F2EFE6] text-[#3E4A43] grid place-items-center"><d.icon className="w-5 h-5" /></span>
                  <div className="mt-4 flex items-center gap-2">
                    <h3 className="text-[15px] font-black">{d.title}</h3>
                    <Arrow className="w-4 h-4 text-[#5f6761] transition rtl:group-hover:-translate-x-1 ltr:group-hover:translate-x-1" />
                  </div>
                </a>
                <p className="mt-2.5 flex items-start gap-2 text-[13px] leading-6 text-[#5d594f]">
                  <d.needIcon className="w-4 h-4 mt-1 shrink-0 text-[#9B7542]" />{d.need}
                </p>
                {d.key === 'participant' && registrationOpen && (
                  <a href={`#register?comp=${competition.id}`} className="mt-auto pt-4 inline-flex">
                    <span className="min-h-11 inline-flex items-center gap-1.5 rounded-xl bg-[var(--ink-deep)]/[.07] px-3.5 text-[13px] font-black text-[var(--ink-deep)] hover:bg-[var(--ink-deep)]/[.12] transition">
                      {ar ? 'لم تسجّل بعد؟ سجّل' : 'Not registered yet? Register'}<Arrow className="w-4 h-4" />
                    </span>
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── الختام: رحلة مشاركتك في هذه المسابقة تحديدًا ───────────────── */}
        <section className="mt-16 rounded-3xl bg-[var(--ink-deep)] text-[#F6F3EA] px-6 sm:px-10 py-9 sm:py-11">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <span className="w-12 h-12 rounded-2xl bg-[#F6F3EA]/10 grid place-items-center shrink-0"><ShieldCheck className="w-6 h-6 text-[var(--gold-light)]" /></span>
            <div className="flex-1 min-w-0">
              <h3 className="text-xl sm:text-2xl font-black leading-snug">{ar ? 'كيف تسير مشاركتك' : 'How your participation unfolds'}</h3>
              <p className="mt-1.5 text-[13px] leading-6 text-[#F6F3EA]/75">
                {ar ? `من التسجيل في «${compTitle}» حتى شهادتك، وكل خطوة محفوظة الأثر.` : `From signing up for “${compTitle}” to your certificate — every step on record.`}
              </p>
            </div>
            {registrationOpen && (
              <a href={`#register?comp=${competition.id}`} className="shrink-0 min-h-12 inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--gold-light)] px-6 text-sm font-black text-[#11241f] hover:bg-[#f0d8a9] transition">
                {ar ? 'ابدأ التسجيل' : 'Start registration'}<Arrow className="w-4 h-4" />
              </a>
            )}
          </div>

          <ol className="mt-9 flex flex-col sm:flex-row gap-7 sm:gap-0" aria-label={ar ? 'مراحل المشاركة' : 'Participation steps'}>
            {steps.map((st, i) => {
              const done = i < stepNow, current = i === stepNow;
              return (
                <li key={i} aria-current={current ? 'step' : undefined} style={{ ["--i" as string]: i }} className="mz-enter relative flex-1 flex sm:flex-col items-center sm:text-center gap-4 sm:gap-0">
                  {i < steps.length - 1 && (
                    <span aria-hidden="true" className={`absolute z-0 start-6 top-12 -bottom-7 w-0.5 sm:start-1/2 sm:top-6 sm:bottom-auto sm:h-0.5 sm:w-full ${done ? 'bg-[var(--gold-light)]' : 'bg-[#F6F3EA]/20'}`} />
                  )}
                  <span className={`relative z-10 w-12 h-12 rounded-full grid place-items-center shrink-0 transition ${current ? 'bg-[var(--gold-light)] text-[#11241f] ring-4 ring-[var(--gold-light)]/25' : done ? 'bg-[var(--gold-light)]/90 text-[#11241f]' : 'bg-[var(--ink-night)] text-[#F6F3EA]/70 border border-[#F6F3EA]/25'}`}>
                    {done ? <Check className="w-5 h-5" /> : <st.icon className="w-5 h-5" />}
                  </span>
                  <div className="sm:mt-3 min-w-0">
                    <div className={`text-[15px] font-black ${current || done ? 'text-[#F6F3EA]' : 'text-[#F6F3EA]/75'}`}>
                      {st.label}
                      {current && <span className="ms-2 align-middle rounded-full bg-[var(--gold-light)] px-2 py-0.5 text-[10px] font-black text-[#11241f]">{ar ? 'الآن' : 'Now'}</span>}
                    </div>
                    <div className="mt-0.5 text-[12px] leading-5 text-[#F6F3EA]/65">{st.hint}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </main>
    </div>
  );
};
