import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ArrowLeft, ArrowRight, BadgeCheck, Building2, Check, Gavel, Headphones,
  Link2, Lock, RadioTower, ShieldCheck, UserRound, UsersRound,
} from 'lucide-react';
import {useAppStore} from '../../lib/store';
import {MizanLogo, MizanMark} from '../design-system/MizanLogo';

/*
 * Onboarding.
 *
 * Was: three static slides with lucide glyphs floating inside an empty white circle —
 * no motion, no keyboard, no story, and a visual language unrelated to the brand.
 *
 * Now: four beats that each *show* the promise instead of captioning it. Every scene is
 * built from the brand's own geometry and colour, advances on its own, and is fully
 * keyboard- and swipe-driven. Direction is derived from the document direction so the
 * arrows and the progress rail read correctly in both Arabic and English.
 */

const STORAGE_KEY = 'mizan_onboarding_quiet_v2';
export const onboardingWasSeen = () => { try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; } };
export const markOnboardingSeen = () => { try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* private mode */ } };

type SceneKind = 'welcome' | 'custody' | 'roles' | 'proof';

interface Slide {
  kind: SceneKind;
  eyebrow: string;
  title: string;
  lede: string;
}

const SLIDES_AR: Slide[] = [
  {kind: 'welcome', eyebrow: 'بداية هادئة', title: 'أهلًا بك في ميزان',
   lede: 'منصة واحدة تدير المسابقة من المصدر القرآني المعتمد إلى الشهادة الموثقة، ويبقى التعقيد كله في الخلفية.'},
  {kind: 'custody', eyebrow: 'نزاهة السؤال', title: 'السؤال مختوم حتى اللحظة الصحيحة',
   lede: 'لا يُكشف موضع الاختبار إلا بعد حضور المتسابق واكتمال نصاب اللجنة، ولا يرى فريق التشغيل نص السؤال في أي مرحلة.'},
  {kind: 'roles', eyebrow: 'وضوح الدور', title: 'دور واحد. مهمة واحدة. شاشة واحدة',
   lede: 'يرى كل مستخدم ما يخصه فقط في لحظته. لا قوائم مزدحمة، ولا قرارات خارج الصلاحية.'},
  {kind: 'proof', eyebrow: 'إثبات لا رواية', title: 'كل نتيجة تحمل دليلها معها',
   lede: 'التحكيم والاعتراض والاعتماد تُقيَّد في سلسلة غير قابلة للتعديل، ويستطيع أي طرف التحقق من الشهادة بنفسه.'},
];

const SLIDES_EN: Slide[] = [
  {kind: 'welcome', eyebrow: 'Quiet start', title: 'Welcome to MIZAN',
   lede: 'One platform from the approved Quran source to the verified certificate, with the complexity kept beneath the surface.'},
  {kind: 'custody', eyebrow: 'Question integrity', title: 'The question stays sealed until the right moment',
   lede: 'The passage is revealed only after participant presence and panel quorum — and operations never see the question text.'},
  {kind: 'roles', eyebrow: 'Role clarity', title: 'One role. One job. One screen',
   lede: 'Everyone sees only what their moment requires. No crowded menus, no decisions outside authority.'},
  {kind: 'proof', eyebrow: 'Proof, not narrative', title: 'Every result carries its own evidence',
   lede: 'Scoring, appeals and approval are written to an immutable chain, and any party can verify a certificate independently.'},
];

const AUTO_ADVANCE_MS = 7000;

export const OnboardingExperience: React.FC<{onDone: () => void}> = ({onDone}) => {
  const {language} = useAppStore();
  const ar = language === 'ar';
  const [step, setStep] = useState(0);
  // WCAG 2.2.2: moving content that starts automatically must be pausable. Hovering or
  // focusing anywhere in the flow holds the step, so nobody loses a sentence mid-read.
  const [held, setHeld] = useState(false);
  const slides = useMemo(() => (ar ? SLIDES_AR : SLIDES_EN), [ar]);
  const last = step === slides.length - 1;

  const finish = useCallback(() => { markOnboardingSeen(); onDone(); }, [onDone]);
  const go = useCallback((n: number) => setStep(Math.max(0, Math.min(slides.length - 1, n))), [slides.length]);
  const next = useCallback(() => (last ? finish() : go(step + 1)), [last, finish, go, step]);

  // Auto-advance keeps the rail honest: the animated bar is the actual timer, not decor.
  useEffect(() => {
    if (last || held) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    const t = window.setTimeout(() => setStep(s => s + 1), AUTO_ADVANCE_MS);
    return () => window.clearTimeout(t);
  }, [step, last, held]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return finish();
      if (e.key === 'Enter') return next();
      // In RTL the "forward" arrow points left.
      const forward = ar ? 'ArrowLeft' : 'ArrowRight';
      const back = ar ? 'ArrowRight' : 'ArrowLeft';
      if (e.key === forward) { e.preventDefault(); next(); }
      if (e.key === back) { e.preventDefault(); go(step - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ar, next, go, step, finish]);

  const touch = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touch.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touch.current === null) return;
    const dx = e.changedTouches[0].clientX - touch.current;
    touch.current = null;
    if (Math.abs(dx) < 48) return;
    const forward = ar ? dx > 0 : dx < 0;
    forward ? next() : go(step - 1);
  };

  const s = slides[step];
  const Next = ar ? ArrowLeft : ArrowRight;
  const Back = ar ? ArrowRight : ArrowLeft;

  return (
    <div
      className="mzo-root font-arabic"
      dir={ar ? 'rtl' : 'ltr'}
      data-held={held || undefined}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
    >
      <div className="mzo-shell">
        <header className="flex items-center justify-between gap-4">
          <MizanLogo language={language} compact />
          <button onClick={finish} className="mzo-ghost text-[13px]">{ar ? 'تخطي' : 'Skip'}</button>
        </header>

        <main className="mzo-body">
          {/* key forces the copy column to replay its entrance on every step */}
          <div className="mzo-copy" key={step}>
            <div className="mzo-eyebrow">{s.eyebrow}</div>
            <h1 className="mzo-title">{s.title}</h1>
            <p className="mzo-lede">{s.lede}</p>
            <div className="mzo-detail"><SlideDetail kind={s.kind} ar={ar} /></div>
            <div className="mt-9 flex items-center gap-2 flex-wrap">
              <button onClick={next} className="mzo-cta">
                {last ? (ar ? 'ابدأ الإعداد' : 'Start setup') : (ar ? 'التالي' : 'Next')}
                <Next className="w-4 h-4" />
              </button>
              {step > 0 && (
                <button onClick={() => go(step - 1)} className="mzo-ghost">
                  <Back className="w-4 h-4" />{ar ? 'السابق' : 'Back'}
                </button>
              )}
            </div>
          </div>

          <div className="order-first lg:order-none">
            <Scene kind={s.kind} ar={ar} seed={step} />
          </div>
        </main>

        <footer className="mzo-foot">
          <div className="mzo-rail" role="tablist" aria-label={ar ? 'خطوات التعريف' : 'Onboarding steps'}>
            {slides.map((sl, i) => (
              <button
                key={sl.kind}
                role="tab"
                aria-selected={i === step}
                aria-label={ar ? `الخطوة ${i + 1}: ${sl.title}` : `Step ${i + 1}: ${sl.title}`}
                data-state={i === step ? 'active' : i < step ? 'done' : 'next'}
                onClick={() => go(i)}
              />
            ))}
          </div>
          <div className="text-[11px] text-[#6a706a]">
            {ar ? `الخطوة ${step + 1} من ${slides.length}` : `Step ${step + 1} of ${slides.length}`}
          </div>
        </footer>
      </div>
    </div>
  );
};

/* ── Supporting copy under the lede ───────────────────────────────────────── */

const SlideDetail: React.FC<{kind: SceneKind; ar: boolean}> = ({kind, ar}) => {
  if (kind === 'welcome') {
    return (
      <div className="flex flex-wrap gap-2">
        <span className="mzo-chip"><Building2 className="w-3.5 h-3.5" />{ar ? 'إعداد مرة واحدة' : 'One-time setup'}</span>
        <span className="mzo-chip"><UsersRound className="w-3.5 h-3.5" />{ar ? 'يتكيّف مع الدور' : 'Role aware'}</span>
        <span className="mzo-chip"><ShieldCheck className="w-3.5 h-3.5" />{ar ? 'يعمل دون إنترنت' : 'Works offline'}</span>
      </div>
    );
  }
  if (kind === 'custody') {
    const steps = ar
      ? ['حضور المتسابق', 'اكتمال نصاب اللجنة', 'كشف موثّق ومسجّل']
      : ['Participant present', 'Panel quorum met', 'Audited reveal'];
    return (
      <div className="grid sm:grid-cols-3 gap-2">
        {steps.map((t, i) => (
          <div className="mzo-step" key={t}>
            <span className="mzo-step-n">{String(i + 1).padStart(2, '0')}</span>
            <span className="mzo-step-t">{t}</span>
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'roles') {
    return (
      <div className="flex flex-wrap gap-2">
        <span className="mzo-chip"><UserRound className="w-3.5 h-3.5" />{ar ? 'المتسابق' : 'Participant'}</span>
        <span className="mzo-chip"><Headphones className="w-3.5 h-3.5" />{ar ? 'المحكّم' : 'Judge'}</span>
        <span className="mzo-chip"><Gavel className="w-3.5 h-3.5" />{ar ? 'رئيس التحكيم' : 'Head judge'}</span>
        <span className="mzo-chip"><RadioTower className="w-3.5 h-3.5" />{ar ? 'غرفة العمليات' : 'Operations'}</span>
      </div>
    );
  }
  return (
    <div className="mzo-step">
      <span className="mzo-step-n">✓</span>
      <span className="mzo-step-t">
        {ar
          ? 'تُراجَع الشهادة برمز تحقق عام دون الحاجة إلى حساب داخل ميزان.'
          : 'Certificates verify through a public proof code — no MIZAN account required.'}
      </span>
    </div>
  );
};

/* ── Scenes ───────────────────────────────────────────────────────────────── */

const Scene: React.FC<{kind: SceneKind; ar: boolean; seed: number}> = ({kind, ar, seed}) => (
  <div className="mzo-scene" key={seed} aria-hidden="true">
    <div className="mzo-stage">
      <span className="mzo-ring mzo-ring-1" />
      <span className="mzo-ring mzo-ring-2" />
      <span className="mzo-ring mzo-ring-3" />
      {kind === 'welcome' && <WelcomeScene ar={ar} />}
      {kind === 'custody' && <CustodyScene ar={ar} />}
      {kind === 'roles' && <RolesScene />}
      {kind === 'proof' && <ProofScene ar={ar} />}
    </div>
  </div>
);

/* Chips sit outside the mark's 66% envelope so nothing crosses the logo. */
const WelcomeScene: React.FC<{ar: boolean}> = ({ar}) => (
  <div className="mzo-disc">
    <MizanMark className="mizan-mark is-animated w-[66%] h-auto" decorative />
    <span className="mzo-float absolute top-[1%] end-[-13%]">
      <span className="mzo-chip"><Building2 className="w-3.5 h-3.5" />{ar ? 'المؤسسة' : 'Organization'}</span>
    </span>
    <span className="mzo-float absolute top-[46%] start-[-23%]">
      <span className="mzo-chip"><Gavel className="w-3.5 h-3.5" />{ar ? 'المسابقة' : 'Competition'}</span>
    </span>
    <span className="mzo-float absolute bottom-[-1%] end-[4%]">
      <span className="mzo-chip"><UsersRound className="w-3.5 h-3.5" />{ar ? 'اللجان' : 'Panels'}</span>
    </span>
  </div>
);

const CustodyScene: React.FC<{ar: boolean}> = ({ar}) => (
  <div className="mzo-disc">
    <div className="mzo-seal">
      <div className="mzo-seal-lines" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="mzo-seal-wax"><Lock className="w-7 h-7" /></div>
    </div>
    <span className="mzo-float absolute top-[2%] end-[-12%]">
      <span className="mzo-chip"><Check className="w-3.5 h-3.5" />{ar ? 'حاضر' : 'Present'}</span>
    </span>
    <span className="mzo-float absolute bottom-[4%] start-[-16%]">
      <span className="mzo-chip"><UsersRound className="w-3.5 h-3.5" />{ar ? 'النصاب' : 'Quorum'}</span>
    </span>
  </div>
);

const ROLE_TILES = [Building2, UserRound, Headphones, Gavel, RadioTower, ShieldCheck, UsersRound, BadgeCheck, Link2];

/* The lit tile walks the grid — the "one role at a time" idea made visible. */
const RolesScene: React.FC = () => {
  const [on, setOn] = useState(4);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const order = [4, 1, 5, 7, 3, 0, 8, 2, 6];
    let i = 0;
    const t = window.setInterval(() => { i = (i + 1) % order.length; setOn(order[i]); }, 900);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="mzo-grid">
      {ROLE_TILES.map((Icon, i) => (
        <div className="mzo-tile" data-on={i === on} key={i}><Icon className="w-5 h-5" /></div>
      ))}
    </div>
  );
};

const ProofScene: React.FC<{ar: boolean}> = ({ar}) => (
  <div className="mzo-proof">
    {[
      ar ? 'درجة اللجنة' : 'Panel score',
      ar ? 'مراجعة رئيس التحكيم' : 'Head judge review',
      ar ? 'اعتماد النتيجة' : 'Result approval',
    ].map((label, i) => (
      <div className="mzo-proof-row" key={label}>
        <span className="mzo-proof-tick"><Check className="w-3 h-3" /></span>
        <span className="text-[12px] font-semibold text-[#4b5750] flex-1">{label}</span>
        <span className="mzo-proof-hash">{['a41f…9c2', 'b70e…4d8', 'c19a…6f1'][i]}</span>
      </div>
    ))}
    <div className="mzo-proof-seal"><BadgeCheck className="w-4 h-4" />{ar ? 'شهادة قابلة للتحقق' : 'Verifiable certificate'}</div>
  </div>
);
