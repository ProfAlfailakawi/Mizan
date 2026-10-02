import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, CircleHelp, Info, Lock } from 'lucide-react';
import { DnaRing } from '../dna/DnaKit';
import { Ratio } from '../design-system/Ratio';

/*
 * أدوات بصرية لمساحة المنظّم: ثلاث قطع صغيرة تُقرأ بلا شرح.
 *
 *  • Hint        — علامة استفهام تفتح جملةً واحدة. المصطلح الصعب يبقى كما هو، وتُشرح كلمته
 *                  عند من يطلب الشرح فقط، فلا يزدحم السطر لمن يعرفها.
 *  • SetupPath   — مسار الإعداد كإنفوجرافيك: خطواتٌ مرقّمة بأيقونات، المنجز أخضر، والتالي
 *                  مضيء بزرّ، وما بعده رمادي. كل خطوة تُحسب من بيانات المسابقة الفعلية وتنقل
 *                  إلى مكانها.
 *  • ToolTile    — بطاقة أداة تقول ما هي دائمًا، وتقول لماذا هي مقفلة حين تُقفل.
 *  • StatStrip   — شريط أرقام بأيقونات للقطة سريعة فوق القوائم.
 */

type Icon = React.ComponentType<{ className?: string }>;

/* ───────────────────────── تلميح ───────────────────────── */

export const Hint: React.FC<{ ar: boolean; text: string; className?: string }> = ({ ar, text, className = '' }) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement | null>(null);
  const note = useRef<HTMLSpanElement | null>(null);
  const [shift, setShift] = useState(0);
  /* على الشاشة الضيقة تخرج النافذة عن الحافة فتُزيح الصفحة أفقيًا: تُقاس وتنزاح لتبقى كلها داخل الشاشة. */
  useLayoutEffect(() => {
    if (!open || !note.current) { setShift(0); return; }
    const r = note.current.getBoundingClientRect();
    const base = r.left - shift;
    const vw = document.documentElement.clientWidth;
    const right = base + r.width;
    setShift(base < 8 ? 8 - base : right > vw - 8 ? vw - 8 - right : 0);
  }, [open]);
  /* نافذةٌ عائمة لا تدفع ما حولها: تُغلق بالنقر خارجها أو بـ Esc. */
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <span ref={root} className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={ar ? 'ما معنى هذا؟' : 'What does this mean?'}
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(v => !v); }}
        className="-m-3 grid h-11 w-11 place-items-center rounded-full"
      >
        <span className={`grid h-5 w-5 place-items-center rounded-full transition ${open ? 'bg-[#214C40] text-white' : 'bg-[#EAF0EC] text-[#2F6555] hover:bg-[#dce8e1]'}`}>
          <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </button>
      {open && (
        <span ref={note} style={{ transform: shift ? `translateX(${shift}px)` : undefined }} role="note" className="absolute start-0 top-full z-40 mt-2 w-64 max-w-[78vw] rounded-xl border border-[#cfe0d6] bg-white px-3.5 py-2.5 text-start text-xs font-bold leading-6 text-[#214C40] shadow-[0_14px_36px_rgba(23,53,45,.16)]">
          {text}
        </span>
      )}
    </span>
  );
};

/* ───────────────────────── شريط أرقام ───────────────────────── */

export const StatStrip: React.FC<{ items: { icon: Icon; value: React.ReactNode; label: string; tone?: 'green' | 'amber' | 'blue' | 'grey' }[]; className?: string }> = ({ items, className = '' }) => {
  const tones = {
    green: 'bg-[#E7EEE9] text-[#214C40]',
    amber: 'bg-[#F5EDE2] text-[#7a5a2f]',
    blue: 'bg-[#E6EEF3] text-[#2C4F66]',
    grey: 'bg-[#EFEDE7] text-[#4f5752]',
  } as const;
  return (
    <div className={`grid grid-cols-2 gap-2.5 sm:grid-cols-4 ${className}`}>
      {items.map((it, i) => (
        <div key={i} className="flex min-w-0 items-center gap-3 rounded-2xl border border-[#e7e5de] bg-white px-3.5 py-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tones[it.tone || 'green']}`}><it.icon className="h-5 w-5" /></span>
          <span className="min-w-0">
            <span className="block text-2xl font-black leading-none tabular-nums text-[#17352D]">{it.value}</span>
            <span className="mt-1 block truncate text-xs font-bold text-[#666c68]">{it.label}</span>
          </span>
        </div>
      ))}
    </div>
  );
};

/* ───────────────────────── بطاقة أداة ───────────────────────── */

export const ToolTile: React.FC<{ icon: Icon; title: string; hint: string; reason?: string; disabled?: boolean; onClick: () => void; ar: boolean }> = ({ icon: I, title, hint, reason, disabled, onClick, ar }) => {
  const Arrow = ar ? ArrowLeft : ArrowRight;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`group flex min-h-[88px] items-center gap-4 rounded-2xl border p-4 text-start transition ${disabled ? 'cursor-not-allowed border-[#e7e5de] bg-[#faf9f5]' : 'border-[#d9e4de] bg-white hover:border-[#9ab0a8] hover:shadow-[0_10px_28px_rgba(33,76,64,.08)]'}`}
    >
      <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${disabled ? 'bg-[#efede7] text-[#9aa19c]' : 'bg-[#E7EEE9] text-[#214C40]'}`}><I className="h-8 w-8" /></span>
      <span className="min-w-0 flex-1">
        <span className={`block text-base font-black ${disabled ? 'text-[#6c716e]' : 'text-[#17352D]'}`}>{title}</span>
        <span className="mt-0.5 block text-[13px] leading-5 text-[#666c68]">{hint}</span>
        {disabled && reason && (
          <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[#F5EDE2] px-2.5 py-1 text-xs font-black text-[#7a5a2f]"><Lock className="h-3 w-3" aria-hidden="true" />{reason}</span>
        )}
      </span>
      {!disabled && <Arrow className="h-5 w-5 shrink-0 text-[#9aa39d] transition group-hover:text-[#214C40]" aria-hidden="true" />}
    </button>
  );
};

/* ───────────────────────── مسار الإعداد ───────────────────────── */

export interface SetupStep { id: string; icon: Icon; title: string; note: string; done: boolean; onGo: () => void; cta?: string; busy?: boolean }

export const SetupPath: React.FC<{ ar: boolean; steps: SetupStep[] }> = ({ ar, steps }) => {
  const doneCount = steps.filter(s => s.done).length;
  const allDone = doneCount === steps.length;
  const nextIndex = steps.findIndex(s => !s.done);
  const [expanded, setExpanded] = useState(false);
  const show = !allDone || expanded;
  const Arrow = ar ? ArrowLeft : ArrowRight;
  return (
    <section aria-label={ar ? 'خطوات إعداد المسابقة' : 'Competition setup steps'} className="mizan-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-4">
        <DnaRing value={doneCount} max={steps.length} size={64} stroke={6} tone="accent" label={allDone ? <Check className="h-6 w-6" /> : <span className="text-base font-black tabular-nums"><Ratio value={doneCount} of={steps.length} /></span>} ariaLabel={ar ? `${doneCount} من ${steps.length} خطوات` : `${doneCount} of ${steps.length} steps`} />
        <div className="min-w-0 flex-1">
          <div className="mizan-kicker">{ar ? 'ابدأ من هنا' : 'START HERE'}</div>
          <h2 className="mt-0.5 text-lg font-black">{allDone ? (ar ? 'الإعداد مكتمل' : 'Setup complete') : (ar ? 'خطوات إعداد مسابقتك' : 'Set up your competition')}</h2>
        </div>
        {allDone && (
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded(v => !v)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#d9e4de] px-3 text-xs font-black text-[#214C40] hover:bg-[#f1f6f3]">
            {expanded ? (ar ? 'إخفاء' : 'Hide') : (ar ? 'عرض الخطوات' : 'Show steps')}
            <ChevronDown className={`h-4 w-4 transition ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {show && (
        <ol className="relative mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-6">
          {steps.map((s, i) => {
            const next = i === nextIndex;
            return (
              <li key={s.id} className="min-w-0">
                <button
                  type="button"
                  onClick={s.onGo}
                  aria-current={next ? 'step' : undefined}
                  className={`flex h-full w-full flex-row items-center gap-3 rounded-2xl border p-3.5 text-start transition xl:flex-col xl:items-start xl:gap-2.5 ${s.done ? 'border-[#d3e2d9] bg-[#F4F8F5] hover:bg-[#ecf3ef]' : next ? 'border-[#214C40] bg-white shadow-[0_10px_28px_rgba(33,76,64,.12)] ring-2 ring-[#214C40]/10' : 'border-[#e7e5de] bg-[#fbfaf7] hover:bg-white'}`}
                >
                  <span className="flex shrink-0 items-center">
                    <span className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${s.done ? 'bg-[#214C40] text-white' : next ? 'bg-[#E7EEE9] text-[#214C40]' : 'bg-[#efede7] text-[#666c68]'}`}>
                      {s.done ? <Check className="h-6 w-6" /> : <s.icon className="h-6 w-6" />}
                      <span aria-hidden="true" className={`absolute -top-1.5 -end-1.5 grid h-5 w-5 place-items-center rounded-full border-2 border-white text-[10px] font-black tabular-nums ${s.done ? 'bg-[#2E7D5B] text-white' : next ? 'bg-[#C08A2E] text-white' : 'bg-[#d8d6ce] text-[#59615c]'}`}>{i + 1}</span>
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 xl:flex-none">
                    <span className={`block text-sm font-black ${s.done ? 'text-[#214C40]' : next ? 'text-[#17352D]' : 'text-[#5a615c]'}`}>{s.title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-[#6a706c]">{s.note}</span>
                    {next && (
                      <span className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-[#214C40] px-3 text-xs font-black text-white">
                        {s.busy ? (ar ? 'لحظة…' : 'One moment…') : (s.cta || (ar ? 'ابدأ' : 'Start'))}<Arrow className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {!allDone && (
        <p className="mt-4 flex items-center gap-2 text-xs font-bold text-[#6a706c]"><Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{ar ? 'الخطوات تتحدّث وحدها حين تُكمل كل واحدة.' : 'Steps update automatically as you finish each one.'}</p>
      )}
    </section>
  );
};
