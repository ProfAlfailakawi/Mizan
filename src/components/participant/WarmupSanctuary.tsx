import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Ear, ListChecks, MapPin, Mic, RotateCcw, Square, Timer, Wind } from 'lucide-react';
import { fetchJourneyPracticeContext, submitPracticeAlignmentChunk, type JourneyPracticeAuth, type JourneyPracticeContext, type QuranAlignmentResult, type QuranReadingId } from '../../lib/quran-intelligence';
import { MushafListens } from './MushafListens';
import { IS_DEMO_SESSION } from '../../lib/store';

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

type Door = 'where' | 'breath' | 'rehearsal' | 'listen';

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
  /** هل يُوزَّع سؤاله على مناطقَ مختلفة من نطاقه — حقيقةٌ نعم/لا، بلا حدودٍ ولا عدد. */
  spreadAcrossZones?: boolean;
  /** عدد الأسئلة المقرّر لفئته. */
  questionCount?: number;
  /** الدقائق المقرّرة للسؤال الواحد — يُبنى عليها مؤقّت البروفة. */
  minutesPerQuestion?: number;
  /** المقطع الذي اختاره المتسابق للتدريب، بروايته وحزمتها — يُبنى عليه التقييم الإلكتروني. */
  practicePassage?: PracticePassage;
  /** بطاقة رحلة عامة تفتح «يسمعك» بكامل تجربة المصحف الذكي بلا حساب منفصل. */
  journeyPracticeAuth?: JourneyPracticeAuth;
}

/** المقطع المعروض في استوديو التدريب: هو نفسه ما يُقيَّم عليه إلكترونيًّا. */
export interface PracticePassage {
  reading: QuranReadingId;
  sourcePackageId: string;
  surah: number;
  startAyah: number;
  endAyah: number;
  label: string;
}

export const WarmupSanctuary: React.FC<WarmupSanctuaryProps> = ({ ar, scopeText, spreadAcrossZones, questionCount, minutesPerQuestion, practicePassage, journeyPracticeAuth }) => {
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
            ['listen', Ear, ar ? 'يسمعك' : 'Listen'],
          ] as [Door, React.ComponentType<{ className?: string }>, string][]).map(([id, Icon, label]) => (
            <button key={id} type="button" role="tab" aria-selected={door === id} onClick={() => setDoor(id)} className={`mizan-tab ${door === id ? 'is-active' : ''}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>

        {door === 'where' && <WhereDoor ar={ar} scopeText={scopeText} spreadAcrossZones={spreadAcrossZones} questionCount={questionCount} minutesPerQuestion={minutesPerQuestion} />}
        {door === 'breath' && <BreathDoor ar={ar} active={open} />}
        {door === 'rehearsal' && <RehearsalDoor ar={ar} minutesPerQuestion={minutesPerQuestion} />}
        {door === 'listen' && (journeyPracticeAuth ? <JourneyListenDoor ar={ar} access={journeyPracticeAuth} /> : <ListenDoor ar={ar} passage={practicePassage} />)}
      </div>
    </details>
  );
};

/* ── أين أُختبر ─────────────────────────────────────────────────────────── */

const WhereDoor: React.FC<Pick<WarmupSanctuaryProps, 'ar' | 'scopeText' | 'spreadAcrossZones' | 'questionCount' | 'minutesPerQuestion'>> = ({ ar, scopeText, spreadAcrossZones, questionCount, minutesPerQuestion }) => (
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

    {/*
      * حدودُ المناطق لا تُكتب للمتسابق.
      *
      * كانت تُعرض مفصّلةً: «الفاتحة ١ ← الإسراء ٥٠ · ٢٠٧٩ آية» وأخواتُها. وهي تبدو طمأنة،
      * وهي في الحقيقة خريطة: ثلاثُ مناطقَ وثلاثةُ أسئلة تعني سؤالًا من كلِّ ثلث، فينكمش
      * ما يُراجعه إلى ثلثٍ لكلّ سؤال. والمتسابقُ الذي يملك الخريطة ليس كمن لا يملكها،
      * فتختلّ المسابقة بلا أن يُخالف أحدٌ قاعدة.
      *
      * فبقي المعنى الذي يطمئنه — أن سؤاله لا يتجمّع في موضعٍ واحد — بلا حدٍّ ولا عدد.
      * والتفصيلُ يبقى حيث يخصّ: لوحةُ محرّك الأسئلة عند المنظّم.
      */}
    {spreadAcrossZones && (
      <div className="rounded-2xl border border-[#e4e2da] bg-white p-4">
        <div className="inline-flex items-center gap-2 text-xs font-black text-[#39423d]"><ListChecks className="h-4 w-4" />{ar ? 'أسئلتك موزَّعة على نطاقك' : 'Your questions are spread across your range'}</div>
        <p className="mt-2 text-[11px] leading-6 text-[#5b6460]">
          {ar
            ? 'لا تتجمّع أسئلتك في موضعٍ واحد من نطاقك، بل تتوزّع عليه. فراجِع نطاقك كلَّه.'
            : 'Your questions do not cluster in one part of your range; they are spread across it. Revise all of it.'}
        </p>
        <p className="mt-2 text-[10px] leading-5 text-[#696f6b]">
          {ar ? 'ولا تُعرض هنا حدودُ التوزيع: لا أحد — ولا النظام نفسه — يعرف مواضعك قبل وقوفك أمام اللجنة، وحدودُ المناطق وحدها تُضيّق ما تُراجعه.' : 'The distribution bounds are not shown: nobody, the system included, knows your loci beforehand — and the bounds alone would narrow what you revise.'}
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

/* ── يسمعك في بطاقة الرحلة العامة ─────────────────────────────────────── */

/**
 * بطاقةُ الرحلة لا تملك جلسة Firebase، لذلك كانت تبويبة «يسمعك» تبدو موجودةً ثم لا
 * تستطيع الوصول إلى أيٍّ من أبواب التدريب المحمية. هنا نفتح **نفس** «المصحف يسمعك»
 * الذي يراه المتسابق داخل حسابه، لكن باعتماد بطاقة الرحلة الخاصة به. الخادم هو الذي
 * يعيد النطاق والرواية ويعيد التحقق منهما مع كل طلب؛ المتصفح لا يقرر واحدًا منهما.
 */
const JourneyListenDoor: React.FC<{ ar:boolean; access:JourneyPracticeAuth }> = ({ ar, access }) => {
  const [context,setContext]=useState<JourneyPracticeContext|null>(null);
  const [state,setState]=useState<'loading'|'ready'|'blocked'>('loading');
  const [note,setNote]=useState('');
  const [retry,setRetry]=useState(0);

  useEffect(()=>{
    let live=true;setState('loading');setNote('');setContext(null);
    void fetchJourneyPracticeContext(access).then(out=>{if(!live)return;setContext(out);setState('ready')}).catch(err=>{
      if(!live)return;const code=err instanceof Error?err.message:'';setState('blocked');setNote(journeyPracticeNote(code,ar));
    });
    return()=>{live=false};
  },[access.competitionId,access.key,ar,retry]);

  if(state==='loading')return <div className="pt-4"><div className="rounded-2xl border border-[#e4e2da] bg-white p-6 text-center"><div className="mx-auto h-8 w-8 rounded-full border-2 border-[#d9dfdb] border-t-[#214C40] motion-safe:animate-spin"/><div className="mt-3 text-xs font-black text-[#214C40]">{ar?'يُهيَّأ المصحف لروايتك…':'Preparing your Mushaf…'}</div><p className="mt-1 text-[10px] leading-5 text-[#6b716d]">{ar?'يُثبت ميزان نطاقك وروايتك أولًا، ثم يفتح الميكروفون لك وحدك.':'MIZAN verifies your range and reading before the microphone can open.'}</p></div></div>;
  if(state==='blocked'||!context)return <div className="pt-4"><div className="rounded-2xl border border-[#e8d6b8] bg-[#fdf6e8] p-4 text-center"><div role="status" className="text-[11px] font-bold leading-6 text-[#6b4f18]">{note}</div><button type="button" onClick={()=>setRetry(x=>x+1)} className="mt-3 min-h-10 rounded-xl border border-[#d7c39d] bg-white/70 px-4 text-[10px] font-black text-[#6b4f18] transition hover:bg-white">{ar?'إعادة المحاولة':'Try again'}</button></div></div>;

  return <div className="pt-4"><MushafListens ar={ar} scope={context.scope} deliveryReading={context.deliveryReading} listening={context.listening} owner={context.owner} journeyAuth={access}/></div>;
};

const journeyPracticeNote=(code:string,ar:boolean)=>{
  if(!ar)return 'Smart listening is unavailable right now. Please try again.';
  if(/PRACTICE_STATUS_BLOCKED/.test(code))return 'يتوقف التدريب الذكي أثناء دخولك اللجنة، ويعود بعد انتهاء الجلسة.';
  if(/PRACTICE_SCOPE/.test(code))return 'لم يثبت نطاق تدريبك المعتمد بعد. حدّث بطاقة الرحلة أو راجع الجهة.';
  if(/PRACTICE_READING/.test(code))return 'روايتك غير مربوطة بعد بحزمة المصحف الذكي، لذلك لن يخمّن ميزان روايةً بديلة.';
  if(/JOURNEY_(TOKEN_INVALID|NOT_FOUND|REVOKED)/.test(code))return 'بطاقة الرحلة لم تعد صالحة. افتح الرابط الخاص الأحدث الذي أرسلته الجهة.';
  if(/FIRESTORE|SERVER|HTTP_5/.test(code))return 'تعذّر الوصول إلى خدمة الاستماع الآن. جرّب بعد لحظات؛ بقية التهيئة تعمل.';
  return 'تعذّر فتح «يسمعك» الآن. أعد المحاولة بعد لحظات.';
};

/* ── يسمعك: تقييم إلكتروني للتدريب وحده ───────────────────────────────── */

/*
 * المحرّك الذي يتتبّع التلاوة في القاعة يتتبّعها هنا أيضًا، والفرق كلُّه في الأثر: لا يُكتب
 * من هذا في دفتر أدلّة، ولا تصل اللجنة منه كلمة، ولا يمسّ الدرجة بحرف. والمقطع يختاره
 * المتسابق من نطاقه، فلا يُكشف له ما لا يعرفه.
 *
 * وما يُعرض ثلاثة أشياء لا رقمٌ واحد مبهم: أين وصل الآن، وكم مرّة فقد المحرّكُ أثرَه
 * (وهو ما يقابل التردّد والوقوف)، وجودة الصوت — لأن ضعف الإشارة ليس ضعف حفظ، وخلطُهما
 * يظلم المتدرّب.
 */
const ListenDoor: React.FC<{ ar: boolean; passage?: PracticePassage }> = ({ ar, passage }) => {
  const [state, setState] = useState<'idle' | 'asking' | 'live' | 'blocked'>('idle');
  const [last, setLast] = useState<QuranAlignmentResult | null>(null);
  const [lost, setLost] = useState(0);
  const [heard, setHeard] = useState(0);
  const [note, setNote] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wasLost = useRef(false);

  const stop = () => {
    recorderRef.current?.state === 'recording' && recorderRef.current.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    recorderRef.current = null; streamRef.current = null;
    setState('idle');
  };
  useEffect(() => () => stop(), []);

  const start = async () => {
    if (!passage) return;
    setNote(''); setLost(0); setHeard(0); setLast(null); wasLost.current = false;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setState('blocked');
      setNote(ar ? 'هذا المتصفح لا يتيح الاستماع. جرّب متصفحًا آخر أو هاتفك.' : 'This browser cannot listen.');
      return;
    }
    setState('asking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      streamRef.current = stream;
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(m => MediaRecorder.isTypeSupported(m));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = async e => {
        if (!e.data.size) return;
        try {
          const out = await submitPracticeAlignmentChunk({ blob: e.data, reading: passage.reading, sourcePackageId: passage.sourcePackageId, surah: passage.surah, startAyah: passage.startAyah, endAyah: passage.endAyah });
          setLast(out); setHeard(n => n + 1);
          const nowLost = out.alignmentState === 'LOST';
          if (nowLost && !wasLost.current) setLost(n => n + 1);
          wasLost.current = nowLost;
        } catch (err) {
          const code = err instanceof Error ? err.message : '';
          setNote(practiceNote(code, ar));
          if (/NOT_CONFIGURED|BENCHMARK|BACKEND/.test(code)) { stop(); setState('blocked'); }
        }
      };
      recorder.start(2000);
      setState('live');
    } catch {
      setState('blocked');
      setNote(ar ? 'لم يُسمح بالميكروفون. اسمح به من إعدادات المتصفح ثم أعد المحاولة.' : 'Microphone permission was denied.');
    }
  };

  if (!passage) return (
    <div className="pt-4">
      <div className="rounded-2xl border border-[#e4e2da] bg-white p-4 text-[11px] leading-6 text-[#5b6460]">
        {ar ? 'اختر مقطعًا من استوديو التدريب أسفل الصفحة، ثم عد إلى هنا ليستمع إليك النظام وأنت تقرؤه.' : 'Pick a passage in the practice studio below, then come back here.'}
      </div>
    </div>
  );

  return (
    <div className="pt-4 space-y-3">
      <div className="rounded-2xl border border-[#cddbd3] bg-[#F7FAF8] p-4">
        <div className="mizan-kicker">{ar ? 'يستمع إليك ويتابع موضعك' : 'IT LISTENS AND FOLLOWS'}</div>
        <h3 className="mt-1 text-sm font-black text-[#214C40]">{passage.label}</h3>
        <p className="mt-1.5 text-[11px] leading-6 text-[#3c4541]">
          {ar
            ? 'اقرأ المقطع بصوتك، ويتابع النظام أين وصلت. هذا تدريبك وحدك: لا يُسجَّل صوتك، ولا يصل اللجنة منه شيء، ولا يُحتسب في درجتك. الدرجة للمحكّم وحده.'
            : 'Recite aloud and it follows your position. Practice only: nothing is stored, nothing reaches the panel, nothing counts toward your score.'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {state !== 'live'
          ? <button type="button" onClick={() => void start()} disabled={state === 'asking' || state === 'blocked'} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#214C40] px-4 text-xs font-black text-white disabled:opacity-50"><Mic className="h-4 w-4" />{state === 'asking' ? (ar ? 'جارٍ الإذن…' : 'Asking…') : (ar ? 'ابدأ القراءة' : 'Start')}</button>
          : <button type="button" onClick={stop} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#d9dfdb] px-4 text-xs font-black text-[#214C40]"><Square className="h-4 w-4" />{ar ? 'أوقف' : 'Stop'}</button>}
        {state === 'live' && <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-[#2F6555]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#2F6555]" />{ar ? 'يستمع' : 'listening'}</span>}
      </div>

      {(state === 'live' || last) && (
        <div className="grid grid-cols-3 gap-2">
          <Cell ar={ar} value={last?.ayah ? String(last.ayah) : '—'} label={ar ? 'الآية الآن' : 'Ayah'} />
          <Cell ar={ar} value={String(lost)} label={ar ? 'فقد أثرك' : 'Lost you'} tone={lost ? 'warn' : 'calm'} />
          <Cell ar={ar} value={last?.backendEvidence?.acousticQuality !== undefined ? `${Math.round((last.backendEvidence.acousticQuality || 0) * 100)}%` : '—'} label={ar ? 'وضوح الصوت' : 'Audio'} />
        </div>
      )}

      {!!heard && state !== 'live' && (
        <div className="rounded-2xl border border-[#e4e2da] bg-white p-4 text-[11px] leading-6 text-[#5b6460]">
          {ar
            ? (lost === 0
              ? 'تابعك النظام من أول المقطع إلى آخره بلا انقطاع. هذا مؤشّر تمكّن، لا درجة.'
              : `فقد أثرك ${countAr(lost)}. الانقطاع قد يكون تردّدًا أو وقوفًا، وقد يكون ضعف صوتٍ لا ضعف حفظ — انظر «وضوح الصوت» قبل أن تحكم على نفسك.`)
            : (lost === 0 ? 'Followed you end to end.' : `Lost you ${lost} time(s).`)}
        </div>
      )}

      {note && <div role="status" className="rounded-2xl border border-[#e8d6b8] bg-[#fdf6e8] p-3.5 text-[11px] font-bold leading-6 text-[#6b4f18]">{note}</div>}
    </div>
  );
};

const Cell: React.FC<{ ar: boolean; value: string; label: string; tone?: 'calm' | 'warn' }> = ({ value, label, tone = 'calm' }) => (
  <div className={`rounded-xl p-3 text-center ${tone === 'warn' ? 'bg-[#fdf1f1]' : 'bg-[#f1efe9]'}`}>
    <div className="text-lg font-black tabular-nums">{value}</div>
    <div className="mt-1 text-[10px] text-[#646965]">{label}</div>
  </div>
);

/*
 * «أعد الدخول» جوابٌ خاطئٌ في بيئة العرض.
 *
 * الاستماعُ الحيّ يمرّ بهويّةٍ حقيقية (`bearer()`)، وبيئةُ العرض لا حسابَ فيها أصلًا —
 * فيرجع `IDENTITY_REQUIRED` دائمًا. وكان يُقال للزائر «انتهت جلسة دخولك، أعد الدخول»،
 * فيُرسَل إلى بابٍ لا يفتح شيئًا: لم تنتهِ جلسةٌ، ولا يوجد دخولٌ يُعاد. فيُفصل الحالان.
 */
/* رموز تعذّر الاستماع بلغة المتسابق — لا رمز خام في وجهه. */
const practiceNote = (code: string, ar: boolean) => {
  if (!ar) return `Listening is unavailable (${code}).`;
  if (/NOT_CONFIGURED/.test(code)) return 'خدمة الاستماع غير مهيّأة في هذه المسابقة بعد. بقية أبواب التهيئة تعمل.';
  if (/BENCHMARK/.test(code)) return 'خدمة الاستماع لم تُعتمد لهذه الرواية بعد.';
  if (/SOURCE_READING_MISMATCH/.test(code)) return 'المقطع المختار لا يوافق روايتك. اختر مقطعًا من نطاقك.';
  if (/OUTSIDE_EXPECTED_PASSAGE/.test(code)) return 'ما قرأتَه خارج المقطع المختار. ابدأ من أوّله.';
  if (/AUDIO_CHUNK_INVALID/.test(code)) return 'لم يصل صوتٌ واضح. قرّب الميكروفون وأعد المحاولة.';
  if (/IDENTITY_REQUIRED|HTTP_401|HTTP_403/.test(code)) return IS_DEMO_SESSION
    ? 'الاستماع الحيّ يحتاج حسابًا حقيقيًّا، وهذه بيئة عرض بلا حساب. بقية أبواب التهيئة تعمل هنا.'
    : 'انتهت جلسة دخولك. أعد الدخول ثم جرّب.';
  return 'تعذّر الاستماع الآن. أعد المحاولة بعد قليل.';
};
