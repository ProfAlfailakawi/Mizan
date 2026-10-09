import React from 'react';
import { Eye, Lock, UserCheck, Users } from 'lucide-react';

/*
 * «كيف يُكشف كل سؤال؟» — شرحٌ متحرّك لما يسجّله الإيصال نفسه فقط: بوابة الكشف لكل سؤال
 * (بصمة مسجّلة، حضور المتسابق، موافقة المحكّمين، ثم الكشف). لا يصف سحب الأسئلة ولا يدّعي
 * إثباته، فبيانات الإيصال لا تحمل دليل FairDraw. الرسم توضيحيّ ولا يعرض أسئلتك ولا بصماتها.
 */
type Gate = { presenceVerified: boolean; judgeApprovals: number; requiredJudgeApprovals: number; revealed: boolean };

const STEPS: Array<{ ar: [string, string]; en: [string, string]; Icon: React.ComponentType<{ className?: string }> }> = [
  { ar: ['السؤال مختوم', 'لكل سؤال بصمة مسجّلة في بوابة الكشف قبل أن يُرى.'], en: ['The question is sealed', 'Each question has a fingerprint recorded at its reveal gate before it is seen.'], Icon: Lock },
  { ar: ['حضورك أولاً', 'لا يُفتح السؤال إلا بعد التحقق من حضورك.'], en: ['You come first', 'A question opens only after your presence is verified.'], Icon: UserCheck },
  { ar: ['موافقة المحكّمين', 'يوافق المحكّمون على الكشف وفق سياسة المسابقة.'], en: ['Judges approve', 'The judges approve the reveal under the competition policy.'], Icon: Users },
  { ar: ['ثم يُكشف', 'يظهر السؤال، ويُسجَّل وقت كشفه.'], en: ['Then it is revealed', 'The question appears, and the time of the reveal is recorded.'], Icon: Eye },
];

export const RevealGateExplainer: React.FC<{ ar: boolean; gates: Gate[] }> = ({ ar, gates }) => {
  const [step, setStep] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const reduce = React.useMemo(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, []);

  React.useEffect(() => {
    if (reduce || paused) return;
    const t = setInterval(() => setStep(s => (s + 1) % STEPS.length), 2600);
    return () => clearInterval(t);
  }, [reduce, paused]);

  const shown = gates.slice(0, 5);
  /* How far each gate really got (0 sealed, 1 presence, 2 approvals, 3 revealed), from the receipt itself. */
  const reached = (g: Gate) => (g.revealed && g.presenceVerified ? 3 : g.judgeApprovals > 0 && g.presenceVerified ? 2 : g.presenceVerified ? 1 : 0);

  return <section className="mizan-receipt-explain mt-4 rounded-2xl bg-[#F3F6F3] p-4" aria-label={ar ? 'كيف يُكشف كل سؤال؟' : 'How each question is revealed'}
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
    <h4 className="text-base font-black text-[#214C40]">{ar ? 'كيف يُكشف كل سؤال؟' : 'How is each question revealed?'}</h4>
    <div className="mt-3 flex flex-wrap items-center justify-center gap-3" aria-hidden="true">
      {shown.map((g, i) => {
        const r = Math.min(reached(g), step);
        const Icon = r === 0 ? Lock : r === 1 ? UserCheck : r === 2 ? Users : Eye;
        const done = step === 3 && reached(g) === 3;
        return <span key={i} className="grid h-14 w-14 place-items-center rounded-2xl border-2 transition-all duration-700"
          style={{
            background: done ? '#E7EEE9' : '#FFFEFB',
            borderColor: done ? '#214C40' : r === 0 ? '#cfd8d2' : '#B98B4E',
            transform: `translateY(${done ? -4 : 0}px)`,
            transitionDelay: `${i * 90}ms`,
          }}><Icon className="h-6 w-6 text-[#214C40]" /></span>;
      })}
    </div>
    <ol className="mt-4 grid gap-2">
      {STEPS.map((s, i) => {
        const [title, text] = ar ? s.ar : s.en;
        const on = i === step;
        return <li key={i}>
          <button type="button" onClick={() => { setStep(i); setPaused(true); }} aria-current={on ? 'step' : undefined}
            className={`w-full rounded-xl border px-3 py-2 text-start transition-all duration-500 ${on ? 'border-[#214C40] bg-white shadow-sm' : 'border-transparent opacity-60'}`}>
            <span className="text-base font-black text-[#17352D]">{title}</span>
            <span className="block text-sm leading-6 text-[#4f5752]">{text}</span>
          </button>
        </li>;
      })}
    </ol>
    <p className="mt-2 text-xs leading-6 text-[#646965]">{ar ? 'هذا ما تسجّله بوابة الكشف في إيصالك. كل بطاقة تعكس مرحلة سؤالٍ فعلاً، وإن لم يكتمل سؤال فتقف بطاقته عند مرحلته.' : 'This is what the reveal gate records in your receipt. Each card reflects how far a real question got; an unfinished question stops at its stage.'}</p>
  </section>;
};
