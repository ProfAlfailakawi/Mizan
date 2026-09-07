import React, { useEffect, useRef, useState } from 'react';
import {
  ShieldCheck, Scale, Mic, WifiOff, QrCode, BadgeCheck, Users, Building2,
  Fingerprint, FileCheck2, Radio, Accessibility, Trophy, BookOpen, Layers,
  Clock, Globe, Mail, Check, Gauge,
} from 'lucide-react';
import { MizanMark } from '../design-system/MizanLogo';

/*
 * الواجهة العامة لميزان — mizan.<domain>.
 *
 * هذه صفحة بيع، لا تطبيق: لا دخول ولا حساب ولا حالة. كل جهة تدخل من نطاقها،
 * والمالك من admin.<domain>؛ فما يبقى هنا هو أن يفهم الزائر في دقيقة ما نبيع.
 *
 * قاعدة التحرير: الصورة تسبق الجملة. كل قسم فكرة واحدة، ورقم أو رسم يحملها،
 * وسطر واحد يشرحها. لا فقرات — من أراد التفصيل طلب العرض.
 */

const CONTACT = 'mailto:info@dr-alfailakawi.com?subject=%D8%B7%D9%84%D8%A8%20%D8%B9%D8%B1%D8%B6%20%D9%85%D9%86%D8%B5%D8%A9%20%D9%85%D9%8A%D8%B2%D8%A7%D9%86';

/* ظهورٌ عند التمرير — حركة واحدة مشتركة بدل مكتبة، وتُلغى لمن طلب تقليل الحركة. */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setShown(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { rootMargin: '-8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, style: { opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateY(14px)', transition: 'opacity .7s var(--ease-brand), transform .7s var(--ease-brand)' } as React.CSSProperties };
}

const Section: React.FC<{ children: React.ReactNode; className?: string; id?: string }> = ({ children, className = '', id }) => {
  const r = useReveal<HTMLElement>();
  return <section id={id} ref={r.ref} style={r.style} className={`mizan-page ${className}`}>{children}</section>;
};

const Kicker: React.FC<{ children: React.ReactNode; tone?: 'light' | 'dark' }> = ({ children, tone = 'light' }) => (
  <div className="text-[11px] font-black tracking-[.18em]" style={{ color: tone === 'dark' ? '#a9b6ae' : '#8a9089' }}>{children}</div>
);

/* ── الرقم الكبير: البرهان قبل الكلام ─────────────────────────────── */
const Stat: React.FC<{ value: string; label: string; tone?: 'dark' | 'light' }> = ({ value, label, tone = 'light' }) => (
  <div className="text-center px-2">
    <div className="font-display text-[clamp(30px,6vw,52px)] leading-none font-black" style={{ color: tone === 'dark' ? '#f4f1e8' : '#214c40' }}>{value}</div>
    <div className="mt-2 text-[11px] font-bold" style={{ color: tone === 'dark' ? '#a9b6ae' : '#696f6b' }}>{label}</div>
  </div>
);

/* ── بطاقة قدرة: أيقونة + سطر واحد ────────────────────────────────── */
const Capability: React.FC<{ icon: React.ElementType; title: string; line: string; tone: string }> = ({ icon: Icon, title, line, tone }) => (
  <div className="mizan-panel p-5 mizan-surface-hover">
    <div className={`mizan-pictogram ${tone} w-12 h-12 rounded-[15px]`}>
      <span className="mizan-pictogram-dot" /><span className="mizan-pictogram-plane" />
      <Icon size={20} strokeWidth={2.1} />
    </div>
    <div className="mt-4 text-[15px] font-black mizan-title">{title}</div>
    <div className="mt-1.5 text-[12.5px] leading-6 mizan-muted">{line}</div>
  </div>
);

const CAPABILITIES: Array<{ icon: React.ElementType; title: string; line: string; tone: string }> = [
  { icon: Scale, title: 'تحكيمٌ موزون', tone: 'mizan-pictogram-emerald', line: 'معايير معلنة، ودرجةٌ لكل خطأ، ونتيجةٌ تُشرح لا تُملى.' },
  { icon: Mic, title: 'بوابة الصوت', tone: 'mizan-pictogram-rose', line: 'لا يُكشف السؤال قبل أن يثبت الميكروفون أنه يسمع.' },
  { icon: FileCheck2, title: 'سلسلة نزاهة', tone: 'mizan-pictogram-ink', line: 'كل قرار مختوم ومتسلسل؛ التعديل الخفي مستحيل.' },
  { icon: WifiOff, title: 'تعمل بلا شبكة', tone: 'mizan-pictogram-amber', line: 'انقطاع القاعة لا يوقف جلسة، والمزامنة تلحق وحدها.' },
  { icon: QrCode, title: 'أجهزة عامة', tone: 'mizan-pictogram-blue', line: 'دخولٌ برمز مصوَّر، وخروجٌ تلقائي عند الخمول.' },
  { icon: BadgeCheck, title: 'شهادة تُتحقَّق', tone: 'mizan-pictogram-emerald', line: 'رابطٌ عام يثبت الشهادة والدرجة لمن يسأل عنها.' },
  { icon: Radio, title: 'شاشات القاعة', tone: 'mizan-pictogram-ink', line: 'انتظار، وخريطة، وبث، وحفل ختامي — جاهزة.' },
  { icon: Accessibility, title: 'وصولٌ للجميع', tone: 'mizan-pictogram-neutral', line: 'حجم النص واللمس والتباين والحركة بيد المستخدم.' },
];

/* ── الرحلة: إنفوجرافيك من خمس محطات ──────────────────────────────── */
const JOURNEY: Array<{ icon: React.ElementType; step: string; title: string; line: string }> = [
  { icon: Building2, step: '٠١', title: 'الجهة', line: 'نطاقٌ خاص وهويةٌ خاصة في اليوم نفسه.' },
  { icon: Users, step: '٠٢', title: 'التسجيل', line: 'رابطٌ واحد يفتح استمارة المسابقة وحدها.' },
  { icon: BookOpen, step: '٠٣', title: 'الإعداد', line: 'مقررٌ ونصٌّ معتمد وأسئلةٌ موزونة.' },
  { icon: Scale, step: '٠٤', title: 'التحكيم', line: 'لجانٌ متزامنة ودرجةٌ لحظية مختومة.' },
  { icon: Trophy, step: '٠٥', title: 'النتائج', line: 'ترتيبٌ وشهاداتٌ وحفلٌ على الشاشة الكبيرة.' },
];

/* ── طبقات العزل: كل جهة عالمٌ مغلق ───────────────────────────────── */
const ISOLATION = [
  { label: 'نطاق الجهة', value: 'jiha.dr-alfailakawi.com', icon: Globe },
  { label: 'بياناتها', value: 'معزولة تمامًا عن غيرها', icon: Layers },
  { label: 'صلاحياتها', value: 'يمنحها مديرها داخل جهته', icon: Fingerprint },
  { label: 'الاعتماد العلمي', value: 'سلطة المالك وحده', icon: ShieldCheck },
];

export const MarketingSite: React.FC = () => {
  useEffect(() => {
    document.title = 'ميزان — منصّة مسابقات القرآن الكريم';
    const el = document.documentElement;
    el.lang = 'ar'; el.dir = 'rtl';
  }, []);

  return (
    <div className="min-h-screen font-arabic" style={{ background: 'var(--canvas)', color: 'var(--ink)' }}>

      {/* ══ شريط علوي: العلامة وحدها. لا دخول — كل جهة تدخل من نطاقها ══ */}
      <header className="sticky top-0 z-40 backdrop-blur" style={{ background: 'rgba(247,245,239,.86)', borderBottom: '1px solid var(--line)' }}>
        <div className="mizan-page !py-0">
          <div className="h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <MizanMark className="w-9 h-9" decorative />
              <div>
                <div className="font-display text-[17px] font-black leading-none">ميزان</div>
                <div className="text-[10px] font-bold mizan-muted mt-1">منصّة مسابقات القرآن</div>
              </div>
            </div>
            <a href={CONTACT} className="rounded-xl px-4 h-10 grid place-items-center text-[12px] font-black text-white" style={{ background: 'var(--emerald)' }}>اطلب عرضًا</a>
          </div>
        </div>
      </header>

      {/* ══ ١) البطل: جملةٌ واحدة، وصورة المنتج الحقيقية ══ */}
      <Section className="!pt-10 sm:!pt-16">
        <div className="grid lg:grid-cols-[1.05fr_1fr] gap-8 lg:gap-12 items-center">
          <div>
            <Kicker>ميزان · MIZAN</Kicker>
            <h1 className="font-display font-black mt-4 leading-[1.12] text-[clamp(32px,6.4vw,58px)] mizan-title">
              مسابقات القرآن،
              <br />
              <span style={{ color: 'var(--emerald)' }}>موزونةً كما ينبغي.</span>
            </h1>
            <p className="mt-5 text-[15px] leading-8 mizan-muted max-w-[46ch]">
              منصّةٌ واحدة تُدير المسابقة من التسجيل إلى الحفل — بتحكيمٍ عادل، وسجلٍّ لا يُغيَّر، ونطاقٍ خاص لكل جهة.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a href={CONTACT} className="rounded-2xl px-6 h-12 grid place-items-center text-[13px] font-black text-white" style={{ background: 'var(--emerald)', boxShadow: 'var(--shadow-3)' }}>اطلب عرضًا تجريبيًّا</a>
              <a href="#kayf" className="rounded-2xl px-6 h-12 grid place-items-center text-[13px] font-black" style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}>كيف تعمل؟</a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[11.5px] font-bold mizan-muted">
              <span className="inline-flex items-center gap-1.5"><Check size={14} style={{ color: 'var(--emerald)' }} /> عربيةٌ أولًا</span>
              <span className="inline-flex items-center gap-1.5"><Check size={14} style={{ color: 'var(--emerald)' }} /> تعمل بلا إنترنت</span>
              <span className="inline-flex items-center gap-1.5"><Check size={14} style={{ color: 'var(--emerald)' }} /> نطاقٌ لكل جهة</span>
            </div>
          </div>

          {/* صورة المنتج الحقيقية، لا رسمٌ تخيّلي */}
          <div className="relative">
            <div className="absolute -inset-6 -z-10 rounded-[40px]" style={{ background: 'radial-gradient(60% 60% at 70% 30%, rgba(185,139,78,.16), transparent 70%)' }} />
            {/* لقطةٌ حقيقية من شاشة التحكيم — لا رسمٌ تخيّلي ولا وعدٌ مصوَّر. */}
            <img src="/marketing/shot-judging.png" alt="شاشة التحكيم في ميزان: المصحف المعتمد ودرجة الخطأ" loading="eager" width={1600} height={1000}
              className="w-full rounded-[26px]" style={{ border: '1px solid var(--line)', boxShadow: 'var(--shadow-4)' }} />
          </div>
        </div>
      </Section>

      {/* ══ ٢) الأرقام: البرهان في سطر ══ */}
      <Section>
        <div className="mizan-hero grid grid-cols-2 md:grid-cols-4 gap-y-8 py-8">
          <Stat value="١٤" label="دورًا بصلاحياتٍ مفصولة" />
          <Stat value="٦" label="شاشات قاعة جاهزة" />
          <Stat value="٪١٠٠" label="قرارٍ مختوم في سجلٍّ متسلسل" />
          <Stat value="صفر" label="أوامر تكتبها لإطلاق جهة" />
        </div>
      </Section>

      {/* ══ ٣) الرحلة: إنفوجرافيك خمس محطات ══ */}
      <Section id="kayf">
        <Kicker>الرحلة</Kicker>
        <h2 className="font-display text-[clamp(24px,3.6vw,36px)] font-black mt-3 mizan-title">من فكرة المسابقة إلى صورة الفائز</h2>
        <div className="mt-8 relative">
          {/* الخيط الواصل بين المحطات */}
          <div className="hidden lg:block absolute top-[26px] inset-x-6 h-px" style={{ background: 'linear-gradient(to left, transparent, var(--line) 12%, var(--line) 88%, transparent)' }} />
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {JOURNEY.map(s => (
              <li key={s.step} className="relative">
                <div className="w-[52px] h-[52px] rounded-2xl grid place-items-center relative z-10" style={{ background: 'var(--emerald)', color: '#fff', boxShadow: 'var(--shadow-3)' }}>
                  <s.icon size={22} strokeWidth={2} />
                </div>
                <div className="mt-4 font-display text-[12px] font-black" style={{ color: 'var(--gold)' }}>{s.step}</div>
                <div className="mt-1 text-[15px] font-black mizan-title">{s.title}</div>
                <div className="mt-1.5 text-[12.5px] leading-6 mizan-muted">{s.line}</div>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      {/* ══ ٤) القدرات: شبكة أيقونات ══ */}
      <Section>
        <Kicker>ما تحصل عليه</Kicker>
        <h2 className="font-display text-[clamp(24px,3.6vw,36px)] font-black mt-3 mizan-title">ثمانُ قدراتٍ تفصل ميزان عمّا سواه</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map(c => <Capability key={c.title} {...c} />)}
        </div>
      </Section>

      {/* ══ ٤٫٥) شاشات حقيقية من داخل المنصّة ══ */}
      <Section>
        <Kicker>من داخل المنصّة</Kicker>
        <h2 className="font-display text-[clamp(24px,3.6vw,36px)] font-black mt-3 mizan-title">شاشاتٌ تعمل اليوم — لا وعود</h2>
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {[
            { src: '/marketing/shot-hall-map.png', t: 'خريطة تلاوة القاعة', s: 'ما تُلي اليوم من المصحف، صفحةً صفحة، على الشاشة الكبيرة.' },
            { src: '/marketing/shot-delegation.png', t: 'بوابة الوفد', s: 'ترشيحٌ ووصولٌ وإثباتات — دون كشف بيانات التحكيم.' },
          ].map(g => (
            <figure key={g.src} className="mizan-panel overflow-hidden">
              <img src={g.src} alt={g.t} loading="lazy" width={1600} height={1000} className="w-full block" />
              <figcaption className="p-5" style={{ borderTop: '1px solid var(--line)' }}>
                <div className="text-[14.5px] font-black mizan-title">{g.t}</div>
                <div className="text-[12.5px] leading-6 mizan-muted mt-1">{g.s}</div>
              </figcaption>
            </figure>
          ))}
        </div>
      </Section>

      {/* ══ ٥) النزاهة: القسم الداكن — قلب البيع ══ */}
      <section className="mt-4" style={{ background: 'var(--venue)', color: 'var(--venue-ink)' }}>
        <Section className="!py-16">
          <div className="grid lg:grid-cols-[1fr_1.1fr] gap-10 items-center">
            <div>
              <Kicker tone="dark">النزاهة</Kicker>
              <h2 className="font-display text-[clamp(24px,3.6vw,38px)] font-black mt-3 leading-[1.25]">
                نتيجةٌ لا يستطيع أحد
                <br />أن يغيّرها بصمت.
              </h2>
              <p className="mt-5 text-[14px] leading-8" style={{ color: 'var(--venue-muted)' }}>
                كل درجة، وكل اعتراض، وكل استثناء — يُختم ويُربط بما قبله. كسرُ حلقةٍ واحدة يُظهر نفسه فورًا.
              </p>
            </div>
            {/* سلسلة الختم — رسمٌ حيّ */}
            <div className="grid gap-3">
              {[
                { icon: Mic, t: 'تلاوة', s: 'الصوت مُثبَت قبل السؤال' },
                { icon: Scale, t: 'تحكيم', s: 'درجةٌ بمعيارٍ معلن' },
                { icon: Fingerprint, t: 'ختم', s: 'بصمةٌ مرتبطة بما قبلها' },
                { icon: BadgeCheck, t: 'شهادة', s: 'يتحقّق منها أي أحد' },
              ].map((n, i, all) => (
                <div key={n.t} className="relative flex items-center gap-4 rounded-2xl p-4" style={{ background: 'var(--venue-surface)', border: '1px solid var(--venue-line)' }}>
                  <div className="w-11 h-11 rounded-xl grid place-items-center shrink-0" style={{ background: 'rgba(185,139,78,.16)', color: 'var(--gold-light)' }}>
                    <n.icon size={19} strokeWidth={2} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[14px] font-black">{n.t}</div>
                    <div className="text-[12px] mt-0.5" style={{ color: 'var(--venue-muted)' }}>{n.s}</div>
                  </div>
                  {i < all.length - 1 && <div className="absolute -bottom-3 start-[34px] w-px h-3" style={{ background: 'var(--venue-line)' }} />}
                </div>
              ))}
            </div>
          </div>
        </Section>
      </section>

      {/* ══ ٦) العزل بين الجهات: مخطط ══ */}
      <Section>
        <Kicker>لكل جهةٍ عالمها</Kicker>
        <h2 className="font-display text-[clamp(24px,3.6vw,36px)] font-black mt-3 mizan-title">جهةٌ لا ترى جهةً أخرى — أبدًا</h2>
        <div className="mt-8 grid lg:grid-cols-[1fr_1fr] gap-6 items-stretch">
          <div className="mizan-hero flex flex-col justify-center gap-4">
            {ISOLATION.map(r => (
              <div key={r.label} className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}>
                  <r.icon size={18} strokeWidth={2.1} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10.5px] font-black mizan-muted">{r.label}</div>
                  <div className="text-[13.5px] font-black mizan-title mt-0.5 truncate">{r.value}</div>
                </div>
              </div>
            ))}
          </div>
          {/* ثلاث جهات، ثلاثة نطاقات، منصّةٌ واحدة */}
          <div className="mizan-hero">
            <div className="text-[11px] font-black mizan-muted">منصّةٌ واحدة · نطاقاتٌ منفصلة</div>
            <div className="mt-5 grid gap-2.5">
              {['jiha-1', 'jiha-2', 'jiha-3'].map((t, i) => (
                <div key={t} className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3" style={{ background: i === 0 ? 'var(--emerald-soft)' : 'var(--surface-soft)', border: '1px solid var(--line)' }}>
                  <span className="mizan-proof-code font-black">{t}.dr-alfailakawi.com</span>
                  <span className="mizan-status-orb" />
                </div>
              ))}
            </div>
            <div className="mt-5 pt-4 flex items-center gap-2.5 text-[12px] font-bold mizan-muted" style={{ borderTop: '1px solid var(--line)' }}>
              <Clock size={15} /> النطاق يُفعَّل في دقائق — وتوقيف الاشتراك يُغلقه فورًا.
            </div>
          </div>
        </div>
      </Section>

      {/* ══ ٧) من نحن ══ */}
      <Section>
        <div className="mizan-hero grid md:grid-cols-[auto_1fr] gap-7 items-center !py-9">
          <div className="mizan-trust-mark !w-20 !h-20 !rounded-[24px]"><MizanMark className="w-11 h-11" tone="inverse" decorative /></div>
          <div>
            <Kicker>من نحن</Kicker>
            <h2 className="font-display text-[clamp(20px,2.8vw,28px)] font-black mt-2.5 mizan-title">إدارةٌ علمية تبني أداتها بنفسها</h2>
            <p className="mt-3 text-[13.5px] leading-8 mizan-muted max-w-[62ch]">
              ميزان ليست منتج شركةٍ عامة أُسقط على القرآن؛ بُنيت من داخل ميدان المسابقات القرآنية،
              بمرجعيةٍ علمية واحدة تعتمد النصّ والمقرر قبل أن تُفتح أي مسابقة.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {['مرجعية علمية معتمدة', 'خصوصيةٌ ببيانات معزولة', 'دعمٌ عربي مباشر'].map(b => (
                <span key={b} className="rounded-full px-3.5 py-1.5 text-[11.5px] font-black" style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', color: 'var(--ink)' }}>{b}</span>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ══ ٨) الدعوة الأخيرة ══ */}
      <Section className="!pb-6">
        <div className="rounded-[28px] p-9 sm:p-12 text-center" style={{ background: 'linear-gradient(160deg, var(--ink-deep), var(--venue) 70%)', color: 'var(--venue-ink)', boxShadow: 'var(--shadow-4)' }}>
          <div className="grid place-items-center"><MizanMark className="w-12 h-12" tone="inverse" decorative /></div>
          <h2 className="font-display text-[clamp(24px,4vw,40px)] font-black mt-6 leading-[1.25]">جاهزون لمسابقتك القادمة</h2>
          <p className="mt-4 text-[14px] leading-8 mx-auto max-w-[44ch]" style={{ color: 'var(--venue-muted)' }}>
            أرسل اسم جهتك وموعد مسابقتك — ونُسلّمك نطاقك ولوحتك جاهزين.
          </p>
          <a href={CONTACT} className="mt-8 inline-flex items-center gap-2.5 rounded-2xl px-8 py-4 text-[14px] font-black" style={{ background: 'var(--gold-light)', color: 'var(--ink-deep)' }}>
            <Mail size={17} /> اطلب عرضًا الآن
          </a>
          <div className="mt-8 flex flex-wrap justify-center gap-x-7 gap-y-3 text-[11.5px] font-bold" style={{ color: 'var(--venue-faint)' }}>
            <span className="inline-flex items-center gap-1.5"><Gauge size={14} /> إطلاقٌ في اليوم نفسه</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} /> بياناتك ملكك</span>
            <span className="inline-flex items-center gap-1.5"><Users size={14} /> بلا حدٍّ للمتسابقين</span>
          </div>
        </div>
      </Section>

      <footer className="mizan-page !pt-2 !pb-10">
        <div className="flex flex-wrap items-center justify-between gap-4 pt-6 text-[11.5px] font-bold mizan-muted" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="flex items-center gap-2.5"><MizanMark className="w-6 h-6" decorative /> ميزان — جميع الحقوق محفوظة</div>
          <a href={CONTACT} className="font-black" style={{ color: 'var(--emerald)' }}>info@dr-alfailakawi.com</a>
        </div>
      </footer>
    </div>
  );
};

export default MarketingSite;
