import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, X, Radio } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { useDialogBehavior } from '../../lib/useDialogBehavior';

/*
 * Mizan · Spatial Broadcast Engine (venue mode).
 *
 * Turns the on-air name-and-score bar into a living Qur'anic academy: live sub-word
 * tracking on the Muṣḥaf, plain-language waqf explanation, a Riwayah Guard, and an
 * alignment-confidence meter.
 *
 * NON-NEGOTIABLE (consistent with AI_INTEGRITY.md and quran-intelligence.ts): the audio
 * alignment shown here is SHADOW-only and never changes a score — the human judge decides.
 * The passage text and waqf marks are illustrative for this showcase; in official operation
 * they load from a certified KFGQPC source package, never from a model. Sūrat al-Fātiḥah is
 * used as universally-verified illustrative content, not as an in-system source of truth.
 */

type WaqfKind = 'tam' | 'kafi' | 'hasan' | 'lazim';
interface Token { w: string; ms: number; ayahEnd?: number; waqf?: { kind: WaqfKind }; reading?: { ar: string; en: string } }

const PASSAGE: Token[] = [
  { w: 'بِسْمِ', ms: 620 }, { w: 'اللَّهِ', ms: 600 }, { w: 'الرَّحْمَٰنِ', ms: 820 },
  { w: 'الرَّحِيمِ', ms: 900, ayahEnd: 1, waqf: { kind: 'kafi' } },
  { w: 'الْحَمْدُ', ms: 640 }, { w: 'لِلَّهِ', ms: 560 }, { w: 'رَبِّ', ms: 520 },
  { w: 'الْعَالَمِينَ', ms: 980, ayahEnd: 2, waqf: { kind: 'tam' } },
  { w: 'الرَّحْمَٰنِ', ms: 760 }, { w: 'الرَّحِيمِ', ms: 880, ayahEnd: 3, waqf: { kind: 'tam' } },
  { w: 'مَٰلِكِ', ms: 640, reading: { ar: 'حفص: «مَٰلِكِ» بإثبات الألف', en: 'Ḥafṣ: “Mālik” with an alif' } },
  { w: 'يَوْمِ', ms: 540 }, { w: 'الدِّينِ', ms: 900, ayahEnd: 4, waqf: { kind: 'tam' } },
  { w: 'إِيَّاكَ', ms: 640 }, { w: 'نَعْبُدُ', ms: 640 }, { w: 'وَإِيَّاكَ', ms: 640 },
  { w: 'نَسْتَعِينُ', ms: 980, ayahEnd: 5, waqf: { kind: 'tam' } },
  { w: 'اهْدِنَا', ms: 640 }, { w: 'الصِّرَٰطَ', ms: 680 },
  { w: 'الْمُسْتَقِيمَ', ms: 980, ayahEnd: 6, waqf: { kind: 'tam' } },
  { w: 'صِرَٰطَ', ms: 620 }, { w: 'الَّذِينَ', ms: 600 }, { w: 'أَنْعَمْتَ', ms: 640 },
  { w: 'عَلَيْهِمْ', ms: 720 }, { w: 'غَيْرِ', ms: 520 }, { w: 'الْمَغْضُوبِ', ms: 820 },
  { w: 'عَلَيْهِمْ', ms: 720 }, { w: 'وَلَا', ms: 440 },
  { w: 'الضَّآلِّينَ', ms: 1200, ayahEnd: 7, waqf: { kind: 'lazim' } },
];
const TOTAL = PASSAGE.reduce((s, t) => s + t.ms, 0);
const WAQF_GLYPH: Record<WaqfKind, string> = { tam: 'ۘ', kafi: 'ۖ', hasan: 'ۖ', lazim: 'ۘ' };
const WAQF = {
  ar: {
    tam: { kind: 'وقف تام', desc: 'تمّ المعنى ولا تعلّق لِما بعده بما قبله.' },
    kafi: { kind: 'وقف كافٍ', desc: 'يحسُن الوقف والابتداء بما بعده مع بقاء التعلّق اللفظي.' },
    hasan: { kind: 'وقف حسن', desc: 'يحسُن الوقف، وما بعده متعلّق بما قبله.' },
    lazim: { kind: 'وقف لازم', desc: 'يلزم الوقف هنا؛ وصله قد يوهم معنى غير مراد.' },
  },
  en: {
    tam: { kind: 'Complete stop (tām)', desc: 'The meaning is complete; what follows does not depend on it.' },
    kafi: { kind: 'Sufficient stop (kāfī)', desc: 'A sound place to stop and resume; meaning complete, wording still linked.' },
    hasan: { kind: 'Good stop (ḥasan)', desc: 'A good place to stop, though what follows is connected.' },
    lazim: { kind: 'Obligatory stop (lāzim)', desc: 'A stop is required here; continuing could imply an unintended meaning.' },
  },
} as const;

const toArabicDigits = (n: number) => String(n).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[+d]);

function locate(ms: number) {
  let acc = 0;
  for (let i = 0; i < PASSAGE.length; i++) { if (ms < acc + PASSAGE[i].ms) return { idx: i, within: (ms - acc) / PASSAGE[i].ms }; acc += PASSAGE[i].ms; }
  return { idx: PASSAGE.length - 1, within: 1 };
}
/** Synthetic shadow-mode confidence: dips at word seams and around the repeated "الرحمن الرحيم". */
function confidenceAt(idx: number, within: number) {
  const seam = Math.min(within, 1 - within);
  let c = 0.72 + 0.26 * Math.min(1, seam * 4);
  if (idx === 8 || idx === 9) c -= 0.16;
  return Math.max(0.28, Math.min(0.99, c));
}

export const BroadcastStage: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const { language } = useAppStore();
  const ar = language === 'ar';
  const venueRef = useRef<HTMLDivElement | null>(null);
  useDialogBehavior(!!onClose, onClose || (() => {}), venueRef, { autoFocus: false });

  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [lost, setLost] = useState(false);
  const raf = useRef<number | null>(null);
  const last = useRef<number>(0);

  useEffect(() => {
    const tick = (now: number) => {
      if (playing) {
        const dt = now - last.current; last.current = now;
        setElapsed(e => { const n = e + dt; return n >= TOTAL ? TOTAL : n; });
      } else { last.current = now; }
      raf.current = requestAnimationFrame(tick);
    };
    last.current = performance.now();
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [playing]);

  useEffect(() => { if (elapsed >= TOTAL && playing) setPlaying(false); }, [elapsed, playing]);

  const { idx, within } = locate(elapsed);
  let conf = confidenceAt(idx, within);
  let state: 'LOCKED' | 'PROBABLE' | 'LOST' = conf > 0.6 ? 'LOCKED' : 'PROBABLE';
  if (lost) { conf = 0.18; state = 'LOST'; }
  const cur = PASSAGE[idx];
  const showWaqf = !!cur.waqf && within > 0.45 && !lost;
  const showReading = !!cur.reading && within > 0.3 && within < 0.9 && !lost;
  const stateLabel = ar ? { LOCKED: 'مُقفَلة', PROBABLE: 'مُرجَّحة', LOST: 'مفقودة' }[state] : state[0] + state.slice(1).toLowerCase();

  const restart = useCallback(() => { setElapsed(0); setPlaying(true); last.current = performance.now(); }, []);
  const gold = '#E8CB93', goldDeep = '#B98B4E', danger = '#C56A5F';

  let ayahShown = 0;

  return (
    <div ref={venueRef} role="dialog" aria-modal="true" aria-label={ar ? 'محرك البثّ الحجمي' : 'Spatial Broadcast Engine'}
      className="fixed inset-0 z-50 flex flex-col items-center gap-3 overflow-y-auto p-3 sm:p-5"
      style={{ background: 'radial-gradient(120% 90% at 50% -10%, #1d3128 0%, #16241f 42%, #0c1713 100%)', color: '#f4f1e8' }} dir={ar ? 'rtl' : 'ltr'}>

      {/* control rail */}
      <div className="w-full max-w-[1180px] flex flex-wrap items-center gap-2.5 rounded-[18px] border px-3.5 py-2.5"
        style={{ background: 'rgba(12,23,19,.55)', borderColor: 'rgba(232,203,147,.16)', backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-2.5 me-auto">
          <span className="grid h-8 w-8 place-items-center rounded-[9px]" style={{ background: 'rgba(232,203,147,.10)', border: '1px solid rgba(232,203,147,.16)' }}><Radio className="h-4 w-4" style={{ color: gold }} /></span>
          <div className="flex flex-col leading-tight">
            <span className="font-black text-[15px]">{ar ? 'محرك البثّ الحجمي' : 'Spatial Broadcast Engine'}</span>
            <span className="text-[10.5px]" style={{ color: gold }}>SHADOW · {ar ? 'لا يمسّ الدرجة' : 'never scores'}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setPlaying(p => !p)} aria-label={playing ? 'pause' : 'play'} className="grid h-9 min-w-9 place-items-center rounded-[11px] px-3" style={{ background: `linear-gradient(180deg, ${gold}, ${goldDeep})`, color: '#2a1e0c' }}>{playing ? <Pause className="h-[18px] w-[18px]" /> : <Play className="h-[18px] w-[18px]" />}</button>
          <button onClick={restart} aria-label="restart" className="grid h-9 min-w-9 place-items-center rounded-[11px] px-3" style={{ background: 'rgba(244,241,232,.05)', border: '1px solid rgba(232,203,147,.16)' }}><RotateCcw className="h-[18px] w-[18px]" /></button>
          <button onClick={() => setLost(v => !v)} className="h-9 rounded-[11px] px-3 text-[12.5px] font-bold" style={{ background: 'rgba(244,241,232,.05)', border: '1px solid rgba(232,203,147,.16)' }}>{lost ? (ar ? 'استعادة المحاذاة' : 'Reacquire') : (ar ? 'محاكاة فقد المحاذاة' : 'Simulate loss')}</button>
          {onClose && <button onClick={onClose} aria-label={ar ? 'إغلاق' : 'close'} className="grid h-9 min-w-9 place-items-center rounded-[11px] px-3" style={{ background: 'rgba(244,241,232,.05)', border: '1px solid rgba(232,203,147,.16)' }}><X className="h-[18px] w-[18px]" /></button>}
          <input type="range" min={0} max={1000} value={Math.round((elapsed / TOTAL) * 1000)} onChange={e => setElapsed((+e.target.value / 1000) * TOTAL)} aria-label="timeline" className="order-5 h-[5px] flex-1 basis-full cursor-pointer appearance-none rounded-full" style={{ background: `linear-gradient(90deg, ${goldDeep} ${(elapsed / TOTAL) * 100}%, rgba(244,241,232,.14) ${(elapsed / TOTAL) * 100}%)` }} />
        </div>
      </div>

      {/* stage */}
      <div className="relative w-full max-w-[1180px] flex flex-1 flex-col gap-3.5 overflow-hidden rounded-[24px] border p-4 sm:p-8"
        style={{ background: 'radial-gradient(90% 120% at 50% 120%, rgba(47,101,85,.35), transparent 60%), linear-gradient(180deg,#12211c,#0d1a15)', borderColor: 'rgba(232,203,147,.16)', boxShadow: '0 30px 70px rgba(0,0,0,.5)' }}>

        {/* HUD */}
        <div className="flex flex-wrap items-stretch gap-2.5">
          <div className="flex flex-1 items-center gap-2.5 rounded-[14px] border px-3 py-2" style={{ minWidth: 150, background: 'rgba(12,23,19,.6)', borderColor: 'rgba(232,203,147,.16)' }}>
            <span className="h-[9px] w-[9px] flex-none rounded-full" style={{ background: '#2f6555', boxShadow: '0 0 0 4px rgba(47,101,85,.25)' }} />
            <div className="flex flex-col leading-tight">
              <span className="text-[10px]" style={{ color: '#8b9a92' }}>{ar ? 'الرواية' : 'Reading'}</span>
              <strong className="text-[13.5px] font-semibold" style={{ color: gold }}>{ar ? 'حفص عن عاصم' : 'Ḥafṣ ʿan ʿĀṣim'}</strong>
            </div>
            {showReading && cur.reading && (
              <div className="ms-1 flex flex-col border-s ps-2.5 leading-tight" style={{ borderColor: 'rgba(232,203,147,.16)' }}>
                <span className="text-[9.5px]" style={{ color: '#8b9a92' }}>{ar ? 'خصوصية الرواية' : 'Reading feature'}</span>
                <strong className="text-[12.5px]" style={{ color: gold }}>{ar ? cur.reading.ar : cur.reading.en}</strong>
              </div>
            )}
          </div>
          <div className="flex-1 rounded-[14px] border px-3 py-2.5" style={{ minWidth: 150, background: 'rgba(12,23,19,.6)', borderColor: 'rgba(232,203,147,.16)' }}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[13px] font-bold" style={{ color: lost ? danger : gold }}>{stateLabel}</span>
              <span className="rounded-full border px-1.5 py-0.5 text-[9.5px]" style={{ color: '#8b9a92', borderColor: 'rgba(232,203,147,.16)' }}>{ar ? 'القرار للمحكم' : 'Judge decides'}</span>
            </div>
            <div className="h-[5px] overflow-hidden rounded-full" style={{ background: 'rgba(244,241,232,.12)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(conf * 100)}%`, background: lost ? danger : `linear-gradient(90deg,#2f6555,${gold})` }} />
            </div>
          </div>
        </div>

        {/* passage header */}
        <div className="text-center">
          <div className="font-black" style={{ fontSize: 'clamp(17px,2.4vw,26px)' }}>{ar ? 'سورة الفاتحة' : 'Sūrat al-Fātiḥah'}</div>
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2 text-[clamp(10.5px,1.3vw,13px)]" style={{ color: '#a9b6ae' }}>
            <span>{ar ? 'الآيات ١ – ٧' : 'Ayat 1 – 7'}</span><span className="h-[3px] w-[3px] rounded-full" style={{ background: '#8b9a92' }} /><span>{ar ? 'مصحف المدينة · صفحة ١' : 'Madinah Muṣḥaf · p.1'}</span>
          </div>
        </div>

        {/* living mushaf */}
        <div className="font-quran self-center text-center" dir="rtl" style={{ fontSize: 'clamp(19px,5.4vw,38px)', lineHeight: 1.95, overflowWrap: 'anywhere', maxWidth: '100%', textShadow: '0 1px 0 rgba(0,0,0,.3)' }}>
          {PASSAGE.map((t, i) => {
            const active = i === idx, spoken = i < idx;
            const color = active ? (lost ? 'rgba(244,241,232,.72)' : '#fff') : spoken ? '#f4f1e8' : 'rgba(244,241,232,.6)';
            const el = (
              <span key={i} style={{ position: 'relative', color, padding: '0 .05em', transition: 'color .3s ease', textShadow: active && !lost ? '0 0 20px rgba(232,203,147,.45)' : undefined }}>
                {t.w}
                {active && (
                  <span aria-hidden style={{ position: 'absolute', insetInline: '-.04em', bottom: '-.14em', height: '.1em', borderRadius: 999, background: lost ? danger : `linear-gradient(90deg,${goldDeep},${gold})`, boxShadow: lost ? 'none' : '0 0 14px 2px rgba(232,203,147,.55)', opacity: lost ? 0.5 : 1 }} />
                )}
              </span>
            );
            if (t.ayahEnd) { ayahShown = t.ayahEnd; return (<React.Fragment key={i}>{el}{' '}<span className="font-quran" style={{ fontSize: '.62em', color: gold, opacity: .85, margin: '0 .08em', verticalAlign: '.12em' }}>{'﴿' + toArabicDigits(ayahShown) + '﴾'}</span>{' '}</React.Fragment>); }
            return <React.Fragment key={i}>{el}{' '}</React.Fragment>;
          })}
        </div>

        {/* waqf ribbon */}
        {showWaqf && cur.waqf && (() => {
          const w = WAQF[ar ? 'ar' : 'en'][cur.waqf.kind]; const isLazim = cur.waqf.kind === 'lazim';
          return (
            <div className="mx-auto flex max-w-[680px] items-center gap-3 rounded-[16px] border px-4 py-2.5" style={{ background: isLazim ? 'linear-gradient(180deg,rgba(197,106,95,.22),rgba(197,106,95,.08))' : 'linear-gradient(180deg,rgba(185,139,78,.22),rgba(185,139,78,.10))', borderColor: isLazim ? 'rgba(197,106,95,.5)' : 'rgba(232,203,147,.35)' }}>
              <div className="font-quran flex-none text-[28px] leading-none" style={{ color: isLazim ? '#eaa79c' : gold }}>{WAQF_GLYPH[cur.waqf.kind]}</div>
              <div className="flex flex-1 flex-col text-start leading-snug">
                <span className="text-[14.5px] font-bold" style={{ color: isLazim ? '#eaa79c' : gold }}>{w.kind}</span>
                <span className="text-[12px]" style={{ color: '#f4f1e8', opacity: .9 }}>{w.desc}</span>
              </div>
              <div className="whitespace-nowrap text-[9.5px]" style={{ color: '#8b9a92' }}>{ar ? 'علامات الوقف · مصدر رسمي' : 'Waqf marks · official source'}</div>
            </div>
          );
        })()}

        {/* lower third */}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3.5">
          <div>
            <div className="font-bold" style={{ fontSize: 'clamp(14px,1.9vw,20px)' }}>{ar ? 'المتسابق · رمز ٠٤٢' : 'Reciter · Code 042'}</div>
            <div className="mt-0.5 text-[clamp(11px,1.4vw,13px)]" style={{ color: '#a9b6ae' }}>{ar ? 'الفئة الأولى · الحفظ الكامل' : 'Tier 1 · Full memorization'}</div>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-bold" style={{ color: danger }}><span className="h-2 w-2 rounded-full" style={{ background: danger }} />{ar ? 'بثّ مباشر' : 'LIVE'}</span>
            <span className="font-black" style={{ fontSize: 'clamp(15px,2vw,22px)', color: gold }}>{ar ? 'ميزان' : 'MIZAN'}</span>
          </div>
        </div>
      </div>

      <p className="w-full max-w-[1180px] border-t pt-3.5 text-[11.5px] leading-relaxed" style={{ color: '#8b9a92', borderColor: 'rgba(232,203,147,.16)' }}>
        {ar
          ? 'عرض توضيحي بيانياً. في التشغيل الرسمي يُحمَّل نصّ المصحف وعلامات الوقف من حزمة مصدر معتمدة (KFGQPC)، والمحاذاة الصوتية تعمل في وضع الظل ولا تغيّر أي درجة إطلاقاً.'
          : 'Illustrative visualization. In production the Muṣḥaf text and waqf marks load from a certified KFGQPC source package, and audio alignment runs in shadow mode — it never changes any score.'}
      </p>
    </div>
  );
};

export default BroadcastStage;
