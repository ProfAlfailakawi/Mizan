import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ListChecks, MapPin, RotateCcw, Timer, Wind } from 'lucide-react';

/*
 * التهيئة قبل دورك.
 *
 * كان اسمه «الإحماء»، وهي كلمة ملعبٍ لا كلمة مصحف. والأهمّ أنه لم يكن إلا دائرةً تتنفّس:
 * تهدّئ النفَس ولا تجيب عن السؤال الذي يشغل المنتظر فعلًا — «أين سيسألونني، وكيف تجري
 * اللحظة، وماذا يُحسب عليّ؟».
 *
 * فصار ثلاثة أبوابٍ تُفتح بالترتيب الذي يعيشه المتسابق:
 *   ١) أين أُختبر — مواضع اختباره كما اعتمدتها الجهة، لا وعدًا عامًّا.
 *   ٢) نفَسي — تنفّس حجابي متوازن: شهيق أربع، حبس أربع، زفير ست.
 *   ٣) بروفة — يقرأ على مؤقّتٍ ويرصد زلّاته بنفسه بالأزرار نفسها التي يراها المحكّم،
 *      فيرى أثرها لحظةً بلحظة. وما يرصده هنا تمرينٌ خاصّ به: لا يُسجَّل، ولا يُرسل،
 *      ولا يصل اللجنة منه شيء، ولا يمسّ درجته بحرف.
 *
 * ولماذا مطويّ افتراضيًّا: من ينتظر دوره قلقًا لا يُعان بشاشةٍ مزدحمة. سطرٌ واحد هادئ
 * يُفتح بالنقر عند الحاجة، ويختفي القسم كلّه لحظة دخوله اللجنة.
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

type Door = 'where' | 'breath' | 'rehearsal';

/** زلّات البروفة بأسمائها كما يسمّيها المحكّم، حتى لا يفاجئه المصطلح في القاعة. */
const SLIPS = [
  { id: 'hesitation', ar: 'تردّد أو توقّف', en: 'Hesitation or pause' },
  { id: 'prompt', ar: 'احتجت تلقينًا', en: 'Needed a prompt' },
  { id: 'repeat', ar: 'إعادة كلمة أو آية', en: 'Repeated a word or ayah' },
  { id: 'tajweed', ar: 'خطأ تجويد', en: 'Tajweed slip' },
  { id: 'waqf', ar: 'وقف في غير موضعه', en: 'Stop in the wrong place' },
] as const;

const countAr = (n: number) => (n === 1 ? 'مرة واحدة' : n === 2 ? 'مرتين' : n <= 10 ? `${n} مرات` : `${n} مرة`);
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export interface WarmupSanctuaryProps {
  ar: boolean;
  /** وصف نطاق اختباره كما اعتمدته الجهة. غيابه يعني أنه لم يُعتمد بعد، ويُقال ذلك. */
  scopeText?: string;
  /** مواضع محتملة من نطاقه، للتذكير لا للكشف — لا علاقة لها بأسئلته الفعلية. */
  zoneHints?: string[];
  /** عدد الأسئلة المقرّر لفئته. */
  questionCount?: number;
  /** الدقائق المقرّرة للسؤال الواحد — يُبنى عليها مؤقّت البروفة. */
  minutesPerQuestion?: number;
}

export const WarmupSanctuary: React.FC<WarmupSanctuaryProps> = ({ ar, scopeText, zoneHints, questionCount, minutesPerQuestion }) => {
  const [open, setOpen] = useState(false);
  const [door, setDoor] = useState<Door>('where');
  return (
    <details
      className="mizan-collapse rounded-2xl border border-[#e5e3dc] bg-[#fbfaf6]"
      onToggle={e => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 px-4 py-3 text-[11px] font-black text-[#59615c]">
        <span className="flex items-center gap-2"><Wind className="h-3.5 w-3.5 text-[#2F6555]" />{ar ? 'التهيئة قبل دورك' : 'Settle before your turn'}</span>
        <span className="text-[9px] font-bold text-[#656b66]">{ar ? 'اختياري' : 'optional'}</span>
      </summary>
      <div className="px-4 pb-5">
        <div className="mizan-tabs" role="tablist" aria-label={ar ? 'أبواب التهيئة' : 'Preparation'}>
          {([
            ['where', MapPin, ar ? 'أين أُختبر' : 'Where'],
            ['breath', Wind, ar ? 'نفَسي' : 'Breathe'],
            ['rehearsal', Timer, ar ? 'بروفة' : 'Rehearse'],
          ] as [Door, React.ComponentType<{ className?: string }>, string][]).map(([id, Icon, label]) => (
            <button key={id} type="button" role="tab" aria-selected={door === id} onClick={() => setDoor(id)} className={`mizan-tab ${door === id ? 'is-active' : ''}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>

        {door === 'where' && <WhereDoor ar={ar} scopeText={scopeText} zoneHints={zoneHints} questionCount={questionCount} minutesPerQuestion={minutesPerQuestion} />}
        {door === 'breath' && <BreathDoor ar={ar} active={open} />}
        {door === 'rehearsal' && <RehearsalDoor ar={ar} minutesPerQuestion={minutesPerQuestion} />}
      </div>
    </details>
  );
};

/* ── أين أُختبر ─────────────────────────────────────────────────────────── */

const WhereDoor: React.FC<Pick<WarmupSanctuaryProps, 'ar' | 'scopeText' | 'zoneHints' | 'questionCount' | 'minutesPerQuestion'>> = ({ ar, scopeText, zoneHints, questionCount, minutesPerQuestion }) => (
  <div className="pt-4 space-y-3">
    <div className="rounded-2xl border border-[#cddbd3] bg-[#F7FAF8] p-4">
      <div className="mizan-kicker">{ar ? 'مواضع اختبارك' : 'WHERE YOU ARE TESTED'}</div>
      <h3 className="mt-1 text-sm font-black text-[#214C40]">{scopeText || (ar ? 'لم تُعتمد مواضع اختبارك بعد' : 'Your range is not approved yet')}</h3>
      <p className="mt-1.5 text-[11px] leading-6 text-[#3c4541]">
        {scopeText
          ? (ar ? 'لن يُطرح عليك سؤال خارج هذه الحدود. طمأنينتك هنا ليست ظنًّا: هذا هو المرجع الذي يسحب منه النظام.' : 'No question comes from outside these bounds. This is the same range the engine draws from.')
          : (ar ? 'راجع إدارة المسابقة؛ نطاق الأسئلة يُحدَّد من فئتك.' : 'Contact the organisers; your question range comes from your category.')}
      </p>
    </div>

    {!!zoneHints?.length && (
      <div className="rounded-2xl border border-[#e4e2da] bg-white p-4">
        <div className="inline-flex items-center gap-2 text-xs font-black text-[#39423d]"><ListChecks className="h-4 w-4" />{ar ? 'يُوزَّع سؤالك على هذه المناطق' : 'Your questions spread across these zones'}</div>
        <ul className="mt-2 space-y-1 text-[11px] font-bold leading-6 text-[#5b6460]">
          {zoneHints.slice(0, 8).map(hint => <li key={hint}>• {hint}</li>)}
        </ul>
        <p className="mt-2 text-[10px] leading-5 text-[#696f6b]">
          {ar ? 'هذه حدود المناطق لا أسئلتك. لا أحد — ولا النظام نفسه — يعرف مواضعك قبل وقوفك أمام اللجنة.' : 'These are the zone bounds, not your questions. Nobody, the system included, knows your loci before you stand before the panel.'}
        </p>
      </div>
    )}

    <div className="grid grid-cols-2 gap-2">
      <Fact ar={ar} value={questionCount ? String(questionCount) : '—'} label={ar ? 'عدد أسئلتك' : 'your questions'} />
      <Fact ar={ar} value={minutesPerQuestion ? `${minutesPerQuestion}` : '—'} label={ar ? 'دقيقة للسؤال' : 'minutes per question'} />
    </div>
  </div>
);

const Fact: React.FC<{ ar: boolean; value: string; label: string }> = ({ value, label }) => (
  <div className="rounded-xl bg-[#f1efe9] p-3 text-center">
    <div className="text-lg font-black tabular-nums">{value}</div>
    <div className="mt-0.5 text-[10px] text-[#646965]">{label}</div>
  </div>
);

/* ── نفَسي ──────────────────────────────────────────────────────────────── */

const BreathDoor: React.FC<{ ar: boolean; active: boolean }> = ({ ar, active }) => {
  const [phase, setPhase] = useState<Phase>('in');
  const timer = useRef<number | null>(null);

  /* الدورة لا تعمل إلا والقسم مفتوح: مؤقّتٌ يدور خلف قسمٍ مطويّ يستهلك البطارية بلا أن يراه أحد. */
  useEffect(() => {
    if (!active) { setPhase('in'); return; }
    let i = 0;
    const step = () => {
      setPhase(SEQUENCE[i][0]);
      timer.current = window.setTimeout(() => { i = (i + 1) % SEQUENCE.length; step(); }, SEQUENCE[i][1]);
    };
    step();
    return () => { if (timer.current) window.clearTimeout(timer.current); timer.current = null; };
  }, [active]);

  const scale = phase === 'out' ? 0.55 : 1;
  const seconds = phase === 'in' ? 4 : phase === 'hold' ? 0 : 6;

  return (
    <div className="pt-2">
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
          <span className="absolute rounded-full border border-[#d7e2db]" style={{ width: 188, height: 188 }} />
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
  );
};

/* ── بروفة ──────────────────────────────────────────────────────────────── */

const RehearsalDoor: React.FC<{ ar: boolean; minutesPerQuestion?: number }> = ({ ar, minutesPerQuestion }) => {
  const limit = Math.max(1, Math.round(minutesPerQuestion || 5)) * 60;
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [announce, setAnnounce] = useState('');

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setElapsed(x => Math.min(limit, x + 1)), 1000);
    return () => window.clearInterval(id);
  }, [running, limit]);

  useEffect(() => { if (elapsed >= limit) setRunning(false); }, [elapsed, limit]);

  const total = useMemo(() => Object.values(marks).reduce((a, b) => a + b, 0), [marks]);
  const mark = (id: string, labelAr: string, labelEn: string) => {
    setMarks(prev => {
      const next = { ...prev, [id]: (prev[id] || 0) + 1 };
      setAnnounce(ar ? `${labelAr} — ${countAr(next[id])}` : `${labelEn} — ${next[id]}`);
      return next;
    });
  };
  const reset = () => { setRunning(false); setElapsed(0); setMarks({}); setAnnounce(''); };

  return (
    <div className="pt-4 space-y-3">
      <p className="rounded-xl bg-[#f1efe9] px-3.5 py-3 text-[11px] leading-6 text-[#5b6460]">
        {ar
          ? 'اقرأ مقطعًا من مواضعك على هذا المؤقّت، وارصد زلّاتك بالأزرار نفسها التي يستعملها المحكّم. الغرض أن تعرف الإيقاع والمصطلح قبل القاعة — وهذا تمرينك وحدك: لا يُسجَّل ولا يُرسل ولا يمسّ درجتك.'
          : 'Read a passage from your own range against this clock and mark your slips with the same buttons a judge uses. This is your private drill: nothing is recorded, sent, or counted against your score.'}
      </p>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#e4e2da] bg-white p-4">
        <div>
          <div className="text-3xl font-black tabular-nums leading-none">{clock(elapsed)}</div>
          <div className="mt-1 text-[10px] font-bold text-[#666a67]">{ar ? `من ${clock(limit)}` : `of ${clock(limit)}`}</div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setRunning(x => !x)}
            className="min-h-11 rounded-2xl bg-[#214C40] px-4 text-xs font-black text-white">
            {running ? (ar ? 'إيقاف' : 'Pause') : elapsed ? (ar ? 'متابعة' : 'Resume') : (ar ? 'ابدأ البروفة' : 'Start')}
          </button>
          <button type="button" onClick={reset} aria-label={ar ? 'إعادة' : 'Reset'}
            className="grid h-11 w-11 place-items-center rounded-2xl border border-[#e0ded7] text-[#59615c]">
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SLIPS.map(slip => (
          <button key={slip.id} type="button" onClick={() => mark(slip.id, slip.ar, slip.en)}
            className="min-h-14 rounded-2xl border border-[#e2e0d9] bg-white px-3 py-2 text-start text-[11px] font-black leading-5 text-[#5e6661] transition hover:bg-[#f7f5ef]">
            <span className="block truncate">{ar ? slip.ar : slip.en}</span>
            {!!marks[slip.id] && <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-[#8a6536]"><Check className="h-3 w-3" />{ar ? countAr(marks[slip.id]) : `${marks[slip.id]}×`}</span>}
          </button>
        ))}
      </div>

      <p role="status" aria-live="polite" className="sr-only">{announce}</p>

      <div className={`rounded-xl px-3.5 py-3 text-[11px] font-bold leading-6 ${total ? 'bg-[#F5EDE2] text-[#7a5a2f]' : 'bg-[#E7EEE9] text-[#214C40]'}`}>
        {total
          ? (ar
            ? `رصدت ${countAr(total)} في هذه البروفة. أعِد المقطع الذي تكرّرت فيه الزلّة؛ التكرار في موضعٍ واحد علامةُ ضبطٍ لا علامةُ خوف.`
            : `You marked ${total} slip${total === 1 ? '' : 's'} in this run. Re-read the passage where they clustered; a cluster points at a passage, not at nerves.`)
          : (ar ? 'لا زلّات في هذه البروفة حتى الآن.' : 'No slips in this run yet.')}
      </div>
    </div>
  );
};

export default WarmupSanctuary;
