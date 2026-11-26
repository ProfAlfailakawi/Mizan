import React, { useEffect, useRef, useState } from 'react';
import type { CommitteeBoardSlice } from '../../lib/display-board';

/*
 * «النداء» — حين تنادي لجنةٌ كودًا جديدًا، يكبر الكود ملء الشاشة ثلاث ثوانٍ ثم ينكمش نحو
 * خانة لجنته في الشبكة.
 *
 * لا يقرأ إلا ما تعرضه الشاشة أصلًا: كود النداء ورمز اللجنة — لا اسم ولا سؤال ولا درجة.
 * والنداء الأول عند فتح الشاشة لا يُعاد عرضه؛ فقط ما يتغيّر بعدها. والنغمة الهادئة لا تُعزف
 * إلا بعد أن يلمس أحدٌ الشاشة (سياسة المتصفح للصوت)، فالشاشة التي لم تُلمس تبقى صامتة كما
 * كانت. تقليل الحركة: يظهر الكود ثابتًا ثم يختفي بلا انتقال.
 */

const SHOW_MS = 3000;
const LEAVE_MS = 650;

type Call = { key: string; code: string; committee: string };

function useHallTone() {
  const ctxRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    const unlock = () => {
      if (ctxRef.current) return;
      const Ctx: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      try { ctxRef.current = new Ctx(); void ctxRef.current.resume?.(); } catch { ctxRef.current = null; }
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      void ctxRef.current?.close?.().catch(() => {});
      ctxRef.current = null;
    };
  }, []);
  return () => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime;
    /* نغمتان ناعمتان (خامسةٌ هابطة) بغلافٍ بطيء: تنبيهٌ لا جرس. */
    [[659.25, 0], [493.88, 0.32]].forEach(([freq, at]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t0 + at);
      gain.gain.linearRampToValueAtTime(0.08, t0 + at + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 1.1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 1.2);
    });
  };
}

export const HallCallSpotlight: React.FC<{ committees: CommitteeBoardSlice[]; ar: boolean }> = ({ committees, ar }) => {
  const seen = useRef<Map<string, string> | null>(null);
  const [queue, setQueue] = useState<Call[]>([]);
  const [phase, setPhase] = useState<'show' | 'leave'>('show');
  const tone = useHallTone();

  useEffect(() => {
    const now = new Map<string, string>(committees.map(c => [c.committeeId, c.nowCalling?.code || ''] as [string, string]));
    const before = seen.current;
    seen.current = now;
    if (!before) return;
    const fresh: Call[] = committees.flatMap(c => {
      const code = c.nowCalling?.code;
      return code && before.get(c.committeeId) !== code ? [{ key: `${c.committeeId}:${code}`, code, committee: c.code }] : [];
    });
    if (fresh.length) setQueue(q => [...q, ...fresh.filter(f => !q.some(x => x.key === f.key))]);
  }, [committees]);

  const current = queue[0];
  useEffect(() => {
    if (!current) return;
    setPhase('show');
    tone();
    const a = setTimeout(() => setPhase('leave'), SHOW_MS);
    const b = setTimeout(() => setQueue(q => q.slice(1)), SHOW_MS + LEAVE_MS);
    return () => { clearTimeout(a); clearTimeout(b); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.key]);

  if (!current) return null;
  return (
    <div className="mz-vw-call" data-phase={phase} aria-hidden="true">
      <div className="mz-vw-call__card" key={current.key}>
        <div className="text-base font-black tracking-[.2em] mizan-venue-muted">{ar ? 'النداء' : 'NOW CALLING'}</div>
        <div className="mz-vw-call__code mizan-venue-code" dir="ltr">{current.code}</div>
        <div className="mt-4 inline-flex items-center gap-3 text-xl font-black text-[#e8cb93]">
          <span>{ar ? 'إلى اللجنة' : 'to panel'}</span>
          <span className="grid h-12 min-w-12 place-items-center rounded-2xl bg-[#dbe7df] px-2 text-[#16372d] tabular-nums">{current.committee}</span>
        </div>
      </div>
    </div>
  );
};
