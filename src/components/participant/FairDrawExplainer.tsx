import React from 'react';
import { Lock } from 'lucide-react';

/*
 * «كيف اختيرت أسئلتك؟» — شرحٌ متحرّك لما يصفه FAIRDRAW.md، بلا ادّعاءٍ فوقه:
 * الأسئلة المعتمدة فقط ← تضييقٌ حسب الرواية والنطاق ← اختيارٌ عشوائي ضمن شروط المسابقة
 * ← بصمة SHA-256 تثبّت المجموعة المختارة. الرسم توضيحيّ لا يعرض أسئلتك ولا بصمتها.
 */
const STEPS: Array<{ ar: [string, string]; en: [string, string] }> = [
  { ar: ['الأسئلة المعتمدة', 'تبدأ من أسئلةٍ اعتمدتها اللجنة فقط.'], en: ['Approved questions', 'It starts from questions the committee approved.'] },
  { ar: ['حسب مقرّرك', 'تبقى الأسئلة المناسبة لروايتك ونطاقك.'], en: ['Your scope', 'Only questions that fit your riwaya and scope remain.'] },
  { ar: ['اختيارٌ عشوائي بشروط', 'يُسحب العدد المطلوب بصعوبةٍ متقاربة وتنويعٍ بين السور، حسب سياسة المسابقة.'], en: ['A random draw, with rules', 'The required number is drawn with similar difficulty and variety, per the competition policy.'] },
  { ar: ['بصمةٌ تثبّتها', 'تُحفظ بصمة رقمية لمجموعتك، فلا تتغيّر بعد الاختيار.'], en: ['Fingerprinted', 'A digital fingerprint is stored for your set, so it cannot change after the draw.'] },
];

const DOTS = 15;
const isScoped = (i: number) => i % 3 !== 2;

export const FairDrawExplainer: React.FC<{ ar: boolean; count: number }> = ({ ar, count }) => {
  const [step, setStep] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const reduce = React.useMemo(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, []);

  React.useEffect(() => {
    if (reduce || paused) return;
    const t = setInterval(() => setStep(s => (s + 1) % STEPS.length), 2600);
    return () => clearInterval(t);
  }, [reduce, paused]);

  const scoped = Array.from({ length: DOTS }, (_, i) => i).filter(isScoped);
  const picked = new Set(scoped.filter((_, k) => k % 3 === 1).slice(0, Math.min(Math.max(count, 1), 4)));

  return <section className="mizan-receipt-explain mt-4 rounded-2xl bg-[#F3F6F3] p-4" aria-label={ar ? 'كيف اختيرت أسئلتك؟' : 'How your questions were chosen'}
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
    <h4 className="text-base font-black text-[#214C40]">{ar ? 'كيف اختيرت أسئلتك؟' : 'How were your questions chosen?'}</h4>
    <div className="relative mx-auto mt-3 grid max-w-[280px] grid-cols-5 gap-3" aria-hidden="true">
      {Array.from({ length: DOTS }, (_, i) => {
        const inScope = isScoped(i);
        const gone = step >= 1 && !inScope;
        const chosen = step >= 2 && picked.has(i);
        const dim = step >= 2 && inScope && !chosen;
        return <span key={i} className="mx-auto h-8 w-8 rounded-full border-2 transition-all duration-700"
          style={{
            background: chosen ? '#B98B4E' : '#FFFEFB',
            borderColor: chosen ? (step === 3 ? '#214C40' : '#B98B4E') : '#cfd8d2',
            opacity: gone ? 0.15 : dim ? 0.45 : 1,
            transform: gone ? 'scale(.6)' : chosen ? 'scale(1.18)' : 'scale(1)',
          }} />;
      })}
      <span className="pointer-events-none absolute -bottom-3 start-1/2 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full bg-[#214C40] text-white shadow transition-all duration-700"
        style={{ opacity: step === 3 ? 1 : 0, transform: `translate(-50%, ${step === 3 ? '0' : '8px'})` }}><Lock className="h-4 w-4" /></span>
    </div>
    <ol className="mt-6 grid gap-2">
      {STEPS.map((s, i) => {
        const [title, text] = ar ? s.ar : s.en;
        const on = i === step;
        return <li key={i}>
          <button type="button" onClick={() => { setStep(i); setPaused(true); }} aria-current={on ? 'step' : undefined}
            className={`w-full rounded-xl border px-3 py-2 text-start transition-all duration-500 ${on ? 'border-[#214C40] bg-white shadow-sm' : 'border-transparent opacity-60'}`}>
            <span className="text-base font-black text-[#17352D]">{title}</span>
            <span className="block text-sm leading-6 text-[#4f5752]">{i === 2 && count > 0 ? (ar ? `يُسحب لك ${count} من الأسئلة بصعوبةٍ متقاربة وتنويعٍ بين السور، حسب سياسة المسابقة.` : `${count} question(s) are drawn with similar difficulty and variety, per the competition policy.`) : text}</span>
          </button>
        </li>;
      })}
    </ol>
    <p className="mt-2 text-xs leading-6 text-[#646965]">{ar ? 'الرسم توضيحيّ ولا يعرض أسئلتك. الإثبات هنا أن السحب التزم بشروط المسابقة المعلنة.' : 'The picture is illustrative and does not show your questions. What it proves is that the draw met the competition\'s stated rules.'}</p>
  </section>;
};
