import React, { useEffect, useRef, useState } from 'react';
import {
  ShieldCheck, Scale, Mic, WifiOff, QrCode, BadgeCheck, Users, Building2,
  Fingerprint, FileCheck2, Radio, Accessibility, Trophy, BookOpen, Layers,
  Clock, Globe, Mail, Check, Gauge, Sparkles, Activity,
} from 'lucide-react';
import { MizanMark } from '../design-system/MizanLogo';
import { HERO_BAND, MOMENTS } from './photos';
import { toWesternDigits } from '../../lib/input-normalize';
import {
  LiveJudgingSimulator,
  InteractiveEvolutionFlow,
  SecurityAndArchitectureInfographic,
} from './MarketingInfographics';

/*
 * الواجهة العامة لميزان — mizan.<domain>.
 *
 * هذه صفحة بيع، لا تطبيق: لا دخول ولا حساب ولا حالة. كل جهة تدخل من نطاقها،
 * والمالك من admin.<domain>؛ فما يبقى هنا هو أن يفهم الزائر في دقيقة ما نبيع.
 *
 * قاعدة التحرير: الصورة تسبق الجملة. كل قسم فكرة واحدة، ورقم أو رسم يحملها،
 * وسطر واحد يشرحها. لا فقرات — من أراد التفصيل طلب العرض.
 */

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
    <div className="mt-1.5 text-[13px] leading-6 mizan-muted">{line}</div>
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
  { icon: Building2, step: '01', title: 'الجهة', line: 'نطاقٌ خاص وهويةٌ خاصة في اليوم نفسه.' },
  { icon: Users, step: '02', title: 'التسجيل', line: 'رابطٌ واحد يفتح استمارة المسابقة وحدها.' },
  { icon: BookOpen, step: '03', title: 'الإعداد', line: 'مقررٌ ونصٌّ معتمد وأسئلةٌ موزونة.' },
  { icon: Scale, step: '04', title: 'التحكيم', line: 'لجانٌ متزامنة ودرجةٌ لحظية مختومة.' },
  { icon: Trophy, step: '05', title: 'النتائج', line: 'ترتيبٌ وشهاداتٌ وحفلٌ على الشاشة الكبيرة.' },
];

/* ── طبقات العزل: كل جهة عالمٌ مغلق ───────────────────────────────── */
const ISOLATION = [
  { label: 'نطاق الجهة', value: 'jiha.dr-alfailakawi.com', icon: Globe },
  { label: 'بياناتها', value: 'معزولة تمامًا عن غيرها', icon: Layers },
  { label: 'صلاحياتها', value: 'يمنحها مديرها داخل جهته', icon: Fingerprint },
  { label: 'الاعتماد العلمي', value: 'سلطة المالك وحده', icon: ShieldCheck },
];

/* ── صور البشر ──────────────────────────────────────────────────────
 * تُعرَض فقط حين توجد صورٌ فعلًا (photos.ts). لا مربّعات فارغة ولا صورةٌ مكسورة:
 * قسمٌ بلا محتوى يُخفى بالكامل بدل أن يَعِد بما ليس عندنا.
 */
const HeroBand: React.FC = () => {
  const r = useReveal<HTMLElement>();
  if (!HERO_BAND) return null;
  return (
    <section ref={r.ref} style={r.style} className="mt-4">
      <div className="relative">
        <img src={HERO_BAND.src} alt={HERO_BAND.alt} loading="lazy" className="w-full h-[clamp(280px,42vw,520px)] object-cover block" />
        {HERO_BAND.caption && (
          <div className="absolute inset-0 flex items-end" style={{ background: 'linear-gradient(to top, rgba(16,26,22,.78), rgba(16,26,22,.05) 55%)' }}>
            <div className="mizan-page w-full !pb-8">
              <div className="font-display text-[clamp(18px,3vw,30px)] font-black" style={{ color: 'var(--venue-ink)' }}>{HERO_BAND.caption}</div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

const Moments: React.FC = () => {
  if (!MOMENTS.length) return null;
  return (
    <Section>
      <Kicker>لحظات</Kicker>
      <h2 className="font-display text-[clamp(24px,3.6vw,36px)] font-black mt-3 mizan-title">القاعة، لا الشاشة</h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MOMENTS.map(m => (
          <figure key={m.src} className="relative overflow-hidden rounded-[22px]" style={{ border: '1px solid var(--line)', boxShadow: 'var(--shadow-2)' }}>
            <img src={m.src} alt={m.alt} loading="lazy" className="w-full aspect-[4/5] object-cover block" />
            {m.caption && (
              <figcaption className="absolute inset-x-0 bottom-0 p-4 text-[13px] font-black" style={{ color: 'var(--venue-ink)', background: 'linear-gradient(to top, rgba(16,26,22,.8), transparent)' }}>{m.caption}</figcaption>
            )}
          </figure>
        ))}
      </div>
    </Section>
  );
};

/* ── تواصل ──────────────────────────────────────────────────────────
 * نموذجٌ يفتح رسالةً جاهزة في بريد الزائر بدل أن يُرسل إلى خادمٍ لا يستقبل.
 * زرٌّ يَعِد بإرسالٍ لا يقع أسوأ من غياب الزر: هنا يرى المرسِل رسالته بعينه،
 * ويصل الطلب إلى بريدنا فعلًا — بلا خادمٍ يُبنى ولا بريدٍ يضيع.
 */
const CONTACT_TO = 'info@dr-alfailakawi.com';

const ContactForm: React.FC = () => {
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const ready = name.trim().length > 1 && org.trim().length > 1;

  const send = () => {
    const subject = `طلب عرض منصّة ميزان — ${org.trim()}`;
    const body = [
      `الاسم: ${name.trim()}`,
      `الجهة: ${org.trim()}`,
      phone.trim() ? `الهاتف: ${phone.trim()}` : '',
      '',
      note.trim() || 'أرغب في عرضٍ تجريبي لمنصّة ميزان.',
    ].filter(Boolean).join('\n');
    window.location.href = `mailto:${CONTACT_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const field = 'w-full rounded-xl px-3.5 py-3 text-[13px] outline-none';
  const fieldStyle = { background: 'rgba(255,255,255,.06)', border: '1px solid var(--venue-line)', color: 'var(--venue-ink)' } as React.CSSProperties;

  return (
    <div className="grid gap-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <input className={field} style={fieldStyle} value={name} onChange={e => setName(e.target.value)} placeholder="اسمك" aria-label="اسمك" />
        <input className={field} style={fieldStyle} value={org} onChange={e => setOrg(e.target.value)} placeholder="اسم الجهة" aria-label="اسم الجهة" />
      </div>
      <input className={field} style={fieldStyle} value={phone} onChange={e => setPhone(toWesternDigits(e.target.value))} placeholder="رقم التواصل — اختياري" aria-label="رقم التواصل" inputMode="tel" />
      <textarea className={field} style={{ ...fieldStyle, minHeight: 96, resize: 'vertical' }} value={note} onChange={e => setNote(e.target.value)} placeholder="موعد مسابقتك، أو سؤالك" aria-label="رسالتك" />
      <button onClick={send} disabled={!ready}
        className="mt-1 inline-flex items-center justify-center gap-2.5 rounded-2xl py-4 text-[14px] font-black transition"
        style={{ background: ready ? 'var(--gold-light)' : 'rgba(255,255,255,.10)', color: ready ? 'var(--ink-deep)' : 'var(--venue-faint)', cursor: ready ? 'pointer' : 'not-allowed' }}>
        <Mail size={17} /> أرسل الطلب
      </button>
      <div className="text-[11px] text-center" style={{ color: 'var(--venue-faint)' }}>
        أو راسلنا مباشرةً على <a href={`mailto:${CONTACT_TO}`} className="font-black" style={{ color: 'var(--gold-light)' }}>{CONTACT_TO}</a>
      </div>
    </div>
  );
};

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
            <a href="#tawasul" className="rounded-xl px-4 h-10 grid place-items-center text-[12px] font-black text-white" style={{ background: 'var(--emerald)' }}>تواصل معنا</a>
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
              <a href="#tawasul" className="rounded-2xl px-6 h-12 grid place-items-center text-[13px] font-black text-white" style={{ background: 'var(--emerald)', boxShadow: 'var(--shadow-3)' }}>اطلب عرضًا تجريبيًّا</a>
              <a href="#kayf" className="rounded-2xl px-6 h-12 grid place-items-center text-[13px] font-black" style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}>كيف تعمل؟</a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[12px] font-bold mizan-muted">
              <span className="inline-flex items-center gap-1.5"><Check size={14} style={{ color: 'var(--emerald)' }} /> عربيةٌ أولًا</span>
              <span className="inline-flex items-center gap-1.5"><Check size={14} style={{ color: 'var(--emerald)' }} /> تعمل بلا إنترنت</span>
              <span className="inline-flex items-center gap-1.5"><Check size={14} style={{ color: 'var(--emerald)' }} /> نطاقٌ لكل جهة</span>
            </div>
          </div>

          {/* صورة المنتج الحقيقية، لا رسمٌ تخيّلي */}
          <div className="relative">
            <div className="absolute -inset-6 -z-10 rounded-[40px]" style={{ background: 'radial-gradient(60% 60% at 70% 30%, rgba(185,139,78,.16), transparent 70%)' }} />
            {/* لقطةٌ حقيقية من شاشة التحكيم — لا رسمٌ تخيّلي ولا وعدٌ مصوَّر. */}
            <img src="/marketing/hero-mushaf.png" alt="المصحف الرسمي في شاشة التحكيم: البقرة ١٤٢–١٤٤ بنص مجمع الملك فهد" loading="eager" width={945} height={1180}
              className="w-full rounded-[26px]" style={{ border: '1px solid var(--line)', boxShadow: 'var(--shadow-4)' }} />
          </div>
        </div>
      </Section>

      {/* ══ ٢) الأرقام: البرهان في سطر ══ */}
      <Section>
        <div className="mizan-hero grid grid-cols-2 md:grid-cols-4 gap-y-8 py-8">
          <Stat value="14" label="دورًا بصلاحياتٍ مفصولة" />
          <Stat value="8" label="قدرات ذكاءٍ محكومة" />
          <Stat value="100%" label="قرارٍ مختوم في سجلٍّ متسلسل" />
          <Stat value="0" label="أوامر تكتبها لإطلاق جهة" />
        </div>

        {/* إنفوجرافيك تفاعلي متحرك يحاكي التحكيم المباشر ونبض القاعة */}
        <div className="mt-8">
          <LiveJudgingSimulator />
        </div>
      </Section>

      <HeroBand/>

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
                <div className="mt-1.5 text-[13px] leading-6 mizan-muted">{s.line}</div>
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
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {[
            { src: '/marketing/mushaf-tajweed.png', t: 'المصحف بأحكام التجويد', s: 'النص العثماني بنص مجمع الملك فهد، وطبقة تجويدٍ تُظهَر عند الحاجة.' },
            { src: '/marketing/shot-hall-map.png', t: 'خريطة تلاوة القاعة', s: 'ما تُلي اليوم من المصحف، صفحةً صفحة، على الشاشة الكبيرة.' },
            { src: '/marketing/shot-ceremony.png', t: 'لحظة التتويج', s: 'إعلان النتائج على الشاشة الكبيرة — كشفٌ معتمد بالنصاب.' },
            { src: '/marketing/shot-delegation.png', t: 'بوابة الوفد', s: 'ترشيحٌ ووصولٌ وإثباتات — دون كشف بيانات التحكيم.' },
          ].map(g => (
            <figure key={g.src} className="mizan-panel overflow-hidden flex flex-col">
              {/* إطارٌ موحّد الارتفاع: الصور تختلف نسبها (المصحف طولي والشاشات عرضية)،
                  فتُحتوى داخل إطارٍ واحد بخلفية هادئة بلا قصٍّ — فيتساوى ارتفاع البطاقات. */}
              <div className="h-56 sm:h-60 overflow-hidden flex items-center justify-center p-3" style={{ background: 'var(--surface-soft)', borderBottom: '1px solid var(--line)' }}>
                <img src={g.src} alt={g.t} loading="lazy" className="h-full w-full object-contain rounded-md" />
              </div>
              <figcaption className="p-5 flex-1">
                <div className="text-[15px] font-black mizan-title">{g.t}</div>
                <div className="text-[13px] leading-6 mizan-muted mt-1">{g.s}</div>
              </figcaption>
            </figure>
          ))}
        </div>
      </Section>

      <Moments/>

      {/* ══ ٤٫٦) ما الذي يختفي من مسابقتك — إنفوجرافيك مقارنة تفاعلي ══ */}
      <Section>
        <Kicker>ما الذي يختفي</Kicker>
        <h2 className="font-display text-[clamp(24px,3.6vw,36px)] font-black mt-3 mizan-title">الورق، والطوابير، وليلة الفرز</h2>
        <p className="mt-4 text-[14px] leading-7 mizan-muted max-w-[56ch]">
          ليست ثلاث محطات — بل المسابقة كلها. انقر فوق أي مرحلة لاستكشاف الفرق المباشر بالإنفوجرافيك.
        </p>

        {/* إنفوجرافيك المحطات التفاعلي */}
        <div className="mt-7">
          <InteractiveEvolutionFlow />
        </div>

        {/* البرهان: الشاشات الحقيقية */}
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {[
            { src: '/marketing/no-staff-gate.png', t: 'الاستقبال', s: 'حضورٌ ذاتي على جهاز القاعة.' },
            { src: '/marketing/no-staff-register.png', t: 'التسجيل', s: 'استمارةُ هذه المسابقة وحدها.' },
            { src: '/marketing/no-staff-certificate.png', t: 'الشهادة', s: 'إثباتٌ عام برقمٍ واحد.' },
          ].map(c => (
            <figure key={c.src} className="mizan-panel overflow-hidden mizan-surface-hover">
              <img src={c.src} alt={c.t} loading="lazy" width={1400} height={800} className="w-full block" style={{ borderBottom: '1px solid var(--line)' }} />
              <figcaption className="p-4">
                <div className="text-[14px] font-black mizan-title">{c.t}</div>
                <div className="mt-1 text-[12px] leading-5 mizan-muted">{c.s}</div>
              </figcaption>
            </figure>
          ))}
        </div>

        {/* الخلاصة التي يفهمها المشتري: الفريق */}
        <div className="mt-6 rounded-[24px] p-7 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-center" style={{ background: 'var(--emerald-soft)', border: '1px solid #cddbd3' }}>
          <div className="font-display text-[clamp(26px,4vw,44px)] font-black" style={{ color: '#9a938c', textDecoration: 'line-through', textDecorationColor: 'rgba(163,77,67,.5)' }}>24</div>
          <div className="text-[13px] font-black mizan-muted">فريق تشغيل اليوم الواحد</div>
          <div className="font-display text-[clamp(26px,4vw,44px)] font-black" style={{ color: 'var(--emerald)' }}>6</div>
        </div>
      </Section>

      {/* ══ ٤٫٧) الذكاء الاصطناعي: قدراتٌ محكومة، لا وعودٌ عامة ══ */}
      <section className="mt-4" style={{ background: 'var(--venue-2)', color: 'var(--venue-ink)' }}>
        <Section className="!py-16">
          <div className="max-w-[62ch]">
            <Kicker tone="dark">الذكاء الاصطناعي</Kicker>
            <h2 className="font-display text-[clamp(24px,3.8vw,40px)] font-black mt-3 leading-[1.22]">
              ذكاءٌ يُشير،
              <br />ولا يحكم.
            </h2>
            <p className="mt-5 text-[14px] leading-8" style={{ color: 'var(--venue-muted)' }}>
              الدرجة بيد المحكّم وحده. والقدرة لا يُسمع لها قولٌ أصلًا قبل أن تُعتمد لتلك الرواية بعينها —
              فلا اعتماد شامل، ولا حدّ قبولٍ يُخترع في الشيفرة.
            </p>
          </div>

          {/* لقطاتٌ حقيقية، كلٌّ منها في موضعه من المنصّة لا في مختبرٍ منفصل:
              لا يُعرض هنا إلا ما له مكانٌ يعمل فيه فعلًا. */}
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            {[
              { src: '/marketing/ai-radar.png', t: 'رادار المتشابهات', s: 'عند التردّد، يُظهر المواضع التي تجذب الذاكرة — من خريطةٍ معتمدةٍ سلفًا، في حالة المراجعة أمام رئيس التحكيم وحده.' },
              { src: '/marketing/ai-parity.png', t: 'تكافؤ القرعة', s: 'هل حمل المتسابقان العبء نفسه؟ يقيس مجموع الصعوبة والمتشابهات والتجويد بجانب إعدادات السحب، ويُنبّه عند الفارق.' },
            ].map(c => (
              <figure key={c.src} className="rounded-[20px] overflow-hidden" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--venue-line)' }}>
                <img src={c.src} alt={c.t} loading="lazy" width={1500} height={700} className="w-full block" />
                <figcaption className="p-5" style={{ borderTop: '1px solid var(--venue-line)' }}>
                  <div className="text-[14px] font-black">{c.t}</div>
                  <div className="text-[13px] leading-6 mt-1.5" style={{ color: 'var(--venue-muted)' }}>{c.s}</div>
                </figcaption>
              </figure>
            ))}
          </div>

          {/* القدرات، كلٌّ تُعتمد وحدها */}
          <div className="mt-10 flex flex-wrap gap-2.5">
            {['محاذاة النص بالصوت', 'جودة الصوت', 'مراقبة الحفظ', 'تجويدٌ صوتي', 'نزاهة اللجنة', 'صعوبة الأسئلة', 'تنوّع بنك الأسئلة', 'صوت الانتقال'].map(c => (
              <span key={c} className="rounded-full px-4 py-2 text-[12px] font-black" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--venue-line)', color: 'var(--venue-ink)' }}>{c}</span>
            ))}
          </div>

          {/* الحارس: ما لا يفعله ميزان — وهو ما يبيعه */}
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {[
              { icon: ShieldCheck, t: 'لا يمسّ درجة', s: 'كل إشارةٍ استشارية. القرار للإنسان.' },
              { icon: BadgeCheck, t: 'اعتمادٌ لكل رواية', s: 'قدرةٌ معتمدة في روايةٍ لا تنطق في غيرها.' },
              { icon: Mic, t: 'لا تلاوة مصطنعة', s: 'ميزان لا يُولّد صوت القرآن — أبدًا.' },
            ].map(g => (
              <div key={g.t} className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--venue-line)' }}>
                <div className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: 'rgba(185,139,78,.16)', color: 'var(--gold-light)' }}>
                  <g.icon size={18} strokeWidth={2.1} />
                </div>
                <div className="mt-3.5 text-[14px] font-black">{g.t}</div>
                <div className="text-[13px] leading-6 mt-1" style={{ color: 'var(--venue-muted)' }}>{g.s}</div>
              </div>
            ))}
          </div>
        </Section>
      </section>

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

      {/* ══ ٦) العزل بين الجهات: إنفوجرافيك المعمارية ══ */}
      <Section>
        <Kicker>لكل جهةٍ عالمها</Kicker>
        <h2 className="font-display text-[clamp(24px,3.6vw,36px)] font-black mt-3 mizan-title">بيانات معزولة وسلسلة نزاهة مشفّرة</h2>
        <div className="mt-8">
          <SecurityAndArchitectureInfographic />
        </div>
      </Section>

      {/* ══ ٧) من نحن ══ */}
      <Section>
        <div className="mizan-hero grid md:grid-cols-[auto_1fr] gap-7 items-center !py-9">
          <div className="mizan-trust-mark !w-20 !h-20 !rounded-[24px]"><MizanMark className="w-11 h-11" tone="inverse" decorative /></div>
          <div>
            <Kicker>من نحن</Kicker>
            <h2 className="font-display text-[clamp(20px,2.8vw,28px)] font-black mt-2.5 mizan-title">إدارةٌ علمية تبني أداتها بنفسها</h2>
            <p className="mt-3 text-[14px] leading-8 mizan-muted max-w-[62ch]">
              ميزان ليست منتج شركةٍ عامة أُسقط على القرآن؛ بُنيت من داخل ميدان المسابقات القرآنية،
              بمرجعيةٍ علمية واحدة تعتمد النصّ والمقرر قبل أن تُفتح أي مسابقة.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {['مرجعية علمية معتمدة', 'خصوصيةٌ ببيانات معزولة', 'دعمٌ عربي مباشر'].map(b => (
                <span key={b} className="rounded-full px-3.5 py-1.5 text-[12px] font-black" style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', color: 'var(--ink)' }}>{b}</span>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ══ ٨) تواصل معنا ══ */}
      <Section id="tawasul" className="!pb-6">
        <div className="rounded-[28px] p-8 sm:p-12" style={{ background: 'linear-gradient(160deg, var(--ink-deep), var(--venue) 70%)', color: 'var(--venue-ink)', boxShadow: 'var(--shadow-4)' }}>
          <div className="grid lg:grid-cols-[1fr_1fr] gap-10 items-center">
            <div>
              <div className="grid place-items-start"><MizanMark className="w-12 h-12" tone="inverse" decorative /></div>
              <h2 className="font-display text-[clamp(24px,4vw,40px)] font-black mt-6 leading-[1.25]">جاهزون لمسابقتك القادمة</h2>
              <p className="mt-4 text-[14px] leading-8 max-w-[42ch]" style={{ color: 'var(--venue-muted)' }}>
                اسم جهتك وموعد مسابقتك يكفيان — ونُسلّمك نطاقك ولوحتك جاهزين.
              </p>
              <div className="mt-7 grid gap-3 text-[13px] font-bold" style={{ color: 'var(--venue-faint)' }}>
                <span className="inline-flex items-center gap-2"><Gauge size={15} /> إطلاقٌ في اليوم نفسه</span>
                <span className="inline-flex items-center gap-2"><ShieldCheck size={15} /> بياناتك ملكك، معزولةً عن غيرك</span>
                <span className="inline-flex items-center gap-2"><Users size={15} /> بلا حدٍّ لعدد المتسابقين</span>
              </div>
            </div>
            <div>
              <div className="text-[11px] font-black tracking-[.18em] mb-4" style={{ color: 'var(--venue-faint)' }}>تواصل معنا</div>
              <ContactForm />
            </div>
          </div>
        </div>
      </Section>

      <footer className="mizan-page !pt-2 !pb-10">
        <div className="flex flex-wrap items-center justify-between gap-4 pt-6 text-[12px] font-bold mizan-muted" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="flex items-center gap-2.5"><MizanMark className="w-6 h-6" decorative /> ميزان — جميع الحقوق محفوظة</div>
          <a href="#tawasul" className="font-black" style={{ color: 'var(--emerald)' }}>تواصل معنا</a>
        </div>
      </footer>
    </div>
  );
};

export default MarketingSite;
