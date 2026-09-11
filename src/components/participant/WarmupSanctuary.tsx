import React, { useEffect, useRef, useState } from 'react';
import { Wind } from 'lucide-react';

/*
 * محراب الإحماء — للمتسابق وحده، وقبل دوره وحده.
 *
 * أكثر ما يُفقد الحفظ في القاعة ليس نقص المراجعة بل ضيق النفَس: نبضٌ متسارع يقصّر الزفير
 * فيتقطّع المدّ ويُربك الوقف. تنفّس حجابي متوازن قبل الصعود يعالج هذا، وهو كل ما يقدّمه
 * هذا القسم: لا قياس، ولا درجة، ولا شيء يصل اللجنة.
 *
 * ولماذا مطويّ افتراضيًّا: من ينتظر دوره قلقًا لا يُعان بشاشةٍ مزدحمة. سطرٌ واحد هادئ
 * يُفتح بالنقر عند الحاجة، ويختفي القسم كلّه لحظة دخول المتسابق اللجنة — فما بعد الدخول
 * ليس وقت إحماء.
 *
 * حُذف مقياس «ثبات الصوت» الذي كان هنا: كان يسمّي نفسه ثبات طبقة الصوت بينما يقيس تذبذب
 * شدّته، فيعطي المتسابق رقمًا يثق به عن شيء لم يُقَس. رقم بلا سند أسوأ من لا رقم.
 */

type Phase = 'in' | 'hold' | 'out';
/** شهيق ٤ · حبس ٤ · زفير ٦ — زفير أطول من الشهيق هو ما يُهدّئ النبض فعلًا. */
const SEQUENCE: Array<[Phase, number]> = [['in', 4000], ['hold', 4000], ['out', 6000]];
const PHASE_TEXT = {
  ar: { in: 'شهيق…', hold: 'احبس…', out: 'زفير…' },
  en: { in: 'Inhale…', hold: 'Hold…', out: 'Exhale…' },
} as const;

export const WarmupSanctuary: React.FC<{ ar: boolean }> = ({ ar }) => {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('in');
  const timer = useRef<number | null>(null);

  /* الدورة لا تعمل إلا والقسم مفتوح: مؤقّتٌ يدور خلف قسمٍ مطويّ يستهلك البطارية بلا أن يراه أحد. */
  useEffect(() => {
    if (!open) { setPhase('in'); return; }
    let i = 0;
    const step = () => {
      setPhase(SEQUENCE[i][0]);
      timer.current = window.setTimeout(() => { i = (i + 1) % SEQUENCE.length; step(); }, SEQUENCE[i][1]);
    };
    step();
    return () => { if (timer.current) window.clearTimeout(timer.current); timer.current = null; };
  }, [open]);

  const scale = phase === 'out' ? 0.55 : 1;
  const seconds = phase === 'in' ? 4 : phase === 'hold' ? 0 : 6;

  return (
    <details
      className="mizan-collapse rounded-2xl border border-[#e5e3dc] bg-[#fbfaf6]"
      onToggle={e => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 px-4 py-3 text-[11px] font-black text-[#59615c]">
        <span className="flex items-center gap-2"><Wind className="h-3.5 w-3.5 text-[#2F6555]"/>{ar ? 'توتّر قبل دورك؟ تنفّس دقيقة' : 'Tense before your turn? Breathe for a minute'}</span>
        <span className="text-[9px] font-bold text-[#656b66]">{ar ? 'اختياري' : 'optional'}</span>
      </summary>
      <div className="px-4 pb-5">
        {/*
          * حلقتان: ثابتة تحدّد مدى الشهيق الكامل، ومتحرّكة تتنفّس داخلها. الحلقة الثابتة هي
          * ما يجعل الحركة مقروءة — دائرة تكبر وتصغر بلا مرجع لا يُعرف أين تنتهي، فيلاحقها
          * النفَس بدل أن تقوده.
          *
          * ويحترم الكل تفضيل تقليل الحركة: من طلب سكون الواجهة لا يُفرض عليه نبضٌ دائم،
          * وتبقى الكلمة وحدها تقول الطور.
          */}
        <div className="grid place-items-center py-2" aria-hidden="true">
          <div className="relative grid h-[196px] w-[196px] place-items-center">
            <span className="absolute rounded-full border border-[#d7e2db]" style={{ width: 188, height: 188 }}/>
            <span
              className="absolute rounded-full motion-reduce:!transform-none motion-reduce:!transition-none"
              style={{
                width: 172, height: 172,
                background: 'radial-gradient(circle at 50% 45%, rgba(47,101,85,.20), rgba(47,101,85,.07) 58%, transparent 74%)',
                boxShadow: '0 0 0 1px rgba(47,101,85,.18), 0 10px 34px -12px rgba(33,76,64,.45)',
                transform: `scale(${scale})`, transition: `transform ${seconds}s ease-in-out`,
              }}
            />
            <span className="relative text-[21px] font-black tracking-tight text-[#214C40]">{PHASE_TEXT[ar ? 'ar' : 'en'][phase]}</span>
          </div>
        </div>
        {/* الحالة تُقال لقارئ الشاشة نصًّا، فالدائرة وحدها لا تصل إليه. */}
        <p role="status" aria-live="polite" className="sr-only">{PHASE_TEXT[ar ? 'ar' : 'en'][phase]}</p>
        <p className="text-center text-[10px] leading-5 text-[#656b66]">
          {ar
            ? 'تنفّس حجابي متوازن: شهيق أربع، حبس أربع، زفير ست. لا يُسجَّل شيء ولا يصل اللجنة منه شيء.'
            : 'Balanced diaphragmatic breathing: in for four, hold for four, out for six. Nothing is recorded and nothing reaches the panel.'}
        </p>
      </div>
    </details>
  );
};

export default WarmupSanctuary;
