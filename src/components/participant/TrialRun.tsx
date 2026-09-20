import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, Mic, PlayCircle, RotateCcw, ShieldCheck, SkipForward, Square, Timer } from 'lucide-react';
import { TrialSteps } from './TrialSteps';
import { ordinalToLocus, scopeRanges, type QuranScope } from '../../lib/quran-scope';
import { surahAyahCount } from '../../lib/mushaf-map';
import { surahNameArabic } from '../judge/OfficialMushafSurface';
import { fetchDeliveryPassage } from '../../lib/kfgqpc-library';
import { submitPracticeAlignmentChunk, type QuranAlignmentResult, type QuranReadingId } from '../../lib/quran-intelligence';
import { IS_DEMO_SESSION } from '../../lib/store';
import { describeStumble, emptyStumbleState, observeAlignment, type TrialPosition } from '../../lib/trial-stumbles';

/*
 * التجربة الكاملة — أن يعيش المتسابق يومه قبل يومه.
 *
 * التهيئة تجيب عن «أين أُختبر» و«كيف أهدّئ نفَسي»، والاستوديو يُسمعه المقطع. وبقي السؤال
 * الذي لا يجيب عنه شيء منهما: **كيف تجري اللحظة نفسها؟** أن يُقال له «الموضع الأول»،
 * فيفتح ميكروفونه ويقرأ على مؤقّت، ثم ينتقل إلى الثاني والثالث حتى يكمل عدد أسئلة فئته،
 * ثم يرى أثره كاملًا. هذه هي التجربة.
 *
 * وثلاثة حدود تحكمها، وهي نفسها حدود التدرّب في هذه المنظومة:
 *
 *  ١) **المواضع تُسحب من نطاقه هو**، من جدول المصحف القانوني، ولا تمسّ خزنة السؤال
 *     المعتمدة بحرف. فلا يتوهّم أحد أن ما رآه هنا هو ما سيُسأل عنه غدًا، ولا يُكشف
 *     لمتسابقٍ موضعٌ محجوز.
 *  ٢) **لا يُسجَّل صوته ولا يُرفع**: المقاطع تمرّ على محرّك التتبّع لحظةً بلحظة ثم تُطرح،
 *     ولا يُكتب من ذلك دفتر أدلّة ولا تصل اللجنة منه كلمة.
 *  ٣) **لا درجة**: ما يُعرض في التقرير وصفٌ لما جرى — أين فقد المحرّك أثره، وكم استغرق،
 *     وهل كان صوته واضحًا — لا حكمٌ على حفظه. الحكم للبشر في موضعه.
 *
 * وحين لا تكون خدمة الاستماع مهيّأة في المسابقة: لا تُغلق التجربة ولا يُدَّعى أنها تسمع.
 * تبقى بمؤقّتها ومواضعها ومقياس صوتها بروفةً صادقة، ويُقال له صراحةً إن التتبّع غير متاح.
 */

type Stage = 'intro' | 'mic' | 'run' | 'report';

interface TrialLocus { surah: number; startAyah: number; endAyah: number }

interface TrialOutcome {
  /** ثوانٍ قضاها في الموضع فعلًا. */
  seconds: number;
  /** كم مرة فقد المحرّك أثره في هذا الموضع (يقابل التردّد والوقوف). */
  lost: number;
  /** أين وقع كلُّ انقطاعٍ عُرف موضعُه — آخرُ ما تُتبّع قبله. لا يُخترع مجهولٌ منها. */
  stumbles: TrialPosition[];
  /** آخر آية تتبّعها المحرّك — أبعد ما وصل إليه. */
  reachedAyah?: number;
  /** متوسط وضوح الصوت في المقاطع المسموعة (0–1). */
  clarity?: number;
  /** هل وصل المحرّك أصلًا — أم مرّ الموضع بلا استماع. */
  heard: boolean;
  /** خرج منه بنفسه أم انتهى وقته. */
  ended: 'self' | 'time' | 'skipped';
}

export interface TrialRunProps {
  ar: boolean;
  /** نطاق المتسابق المعتمد — منه وحده تُسحب مواضع التجربة. */
  scope: QuranScope;
  /** عدد أسئلة فئته: التجربة بعددها هي، لا برقم مخترع. */
  questionCount: number;
  /** الدقائق المقرّرة للسؤال الواحد — مؤقّت كل موضع. */
  minutesPerQuestion?: number;
  /** عدد آيات المقطع الواحد كما تقدّره الفئة. */
  passageAyahCount?: number;
  /** مفتاح حزمة التسليم لعرض مطلع الموضع بنصّ المصحف المعتمد. */
  deliveryReading?: string;
  /** رواية محرّك التتبّع وحزمتها. غيابها يعني تجربةً بلا استماع، ويُقال ذلك. */
  listening?: { reading: QuranReadingId; sourcePackageId: string };
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, '0')}`;
const countAr = (n: number) => (n === 1 ? 'مرة واحدة' : n === 2 ? 'مرتين' : n <= 10 ? `${n} مرات` : `${n} مرة`);

/*
 * سحب المواضع.
 *
 * النطاق يُقرأ كمدى أرقامٍ متّصل، ثم يُقسَّم على عدد الأسئلة أقسامًا متساوية، ويُسحب من كل
 * قسمٍ موضع. والقسمة هنا ليست زينة: سحبٌ عشوائي حرّ يكدّس المواضع في ناحيةٍ ويترك نصف
 * النطاق بلا تجربة، فيخرج المتسابق مطمئنًّا إلى ما لم يجرّبه.
 *
 * وكل مقطع يُقصّ على حدّ سورته وحدّ القسم: لا موضع يبدأ في سورة وينتهي في التي بعدها.
 */
function drawTrialLoci(scope: QuranScope, count: number, ayat: number): TrialLocus[] {
  const ranges = scopeRanges(scope);
  const total = ranges.reduce((sum, [a, b]) => sum + (b - a + 1), 0);
  if (!total || count < 1) return [];
  const pickAt = (offset: number): TrialLocus | null => {
    let walked = 0;
    for (const [a, b] of ranges) {
      const size = b - a + 1;
      if (offset < walked + size) {
        const ordinal = a + (offset - walked);
        const locus = ordinalToLocus(ordinal);
        const surahEnd = surahAyahCount(locus.surah) || locus.ayah;
        // نهاية المقطع: لا تتجاوز السورة، ولا تتجاوز آخر آية في هذا القسم من النطاق.
        const maxByRange = ordinalToLocus(b);
        const ceiling = maxByRange.surah === locus.surah ? Math.min(surahEnd, maxByRange.ayah) : surahEnd;
        return { surah: locus.surah, startAyah: locus.ayah, endAyah: Math.min(ceiling, locus.ayah + Math.max(1, ayat) - 1) };
      }
      walked += size;
    }
    return null;
  };
  const bucket = total / count;
  const out: TrialLocus[] = [];
  for (let i = 0; i < count; i++) {
    const from = Math.floor(i * bucket);
    const span = Math.max(1, Math.floor((i + 1) * bucket) - from);
    const picked = pickAt(Math.min(total - 1, from + Math.floor(Math.random() * span)));
    if (picked) out.push(picked);
  }
  return out;
}

const locusLabel = (l: TrialLocus, ar: boolean) =>
  ar
    ? `${surahNameArabic(l.surah) || l.surah} · ${l.startAyah === l.endAyah ? `الآية ${l.startAyah}` : `الآيات ${l.startAyah}–${l.endAyah}`}`
    : `${l.surah}:${l.startAyah}${l.endAyah > l.startAyah ? `-${l.endAyah}` : ''}`;

export const TrialRun: React.FC<TrialRunProps> = ({ ar, scope, questionCount, minutesPerQuestion, passageAyahCount, deliveryReading, listening }) => {
  const [stage, setStage] = useState<Stage>('intro');
  const [loci, setLoci] = useState<TrialLocus[]>([]);
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<TrialOutcome[]>([]);
  const [note, setNote] = useState('');
  /* تتبّعٌ متعذّر لا يوقف التجربة؛ يوقف الادّعاء وحده. */
  const [listeningLive, setListeningLive] = useState(true);

  const limit = Math.max(1, Math.round(minutesPerQuestion || 5)) * 60;
  const total = Math.max(1, Math.min(25, Math.round(questionCount) || 1));

  const begin = () => {
    const drawn = drawTrialLoci(scope, total, Math.max(1, passageAyahCount || 3));
    if (!drawn.length) { setNote(ar ? 'نطاقك المعتمد لم يُحدَّد بعد، فلا تُسحب مواضع تجربة.' : 'Your approved range is not set yet.'); return; }
    setLoci(drawn); setOutcomes([]); setIndex(0); setNote(''); setListeningLive(!!listening);
    setStage('mic');
  };

  const finishOne = useCallback((outcome: TrialOutcome) => {
    setOutcomes(prev => [...prev, outcome]);
    setIndex(i => {
      const next = i + 1;
      if (next >= loci.length) setStage('report');
      return next;
    });
  }, [loci.length]);

  const restart = () => { setStage('intro'); setLoci([]); setOutcomes([]); setIndex(0); setNote(''); };

  return (
    <section className="overflow-hidden rounded-[26px] border border-[#d9d6cc] bg-gradient-to-b from-[#fdfbf5] to-[#f7f4ec]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e1d7] px-5 py-4">
        <div className="min-w-0">
          <div className="mizan-kicker">{ar ? 'تجربة كاملة' : 'FULL TRIAL'}</div>
          <h2 className="mt-1 text-lg font-black">{ar ? 'جرّب يومك قبل يومك' : 'Rehearse your day before it comes'}</h2>
          <p className="mt-1 text-[10px] leading-5 text-[#656b66]">
            {ar ? 'مواضع من نطاقك، مؤقّت كمؤقّت اللجنة، وميكروفونك مفتوح — بلا تسجيل وبلا درجة.' : 'Loci from your own range, the panel’s clock, your microphone open — no recording, no score.'}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E7EEE9] px-3 py-1.5 text-[10px] font-black text-[#214C40]">
          <ShieldCheck className="h-3.5 w-3.5" />{ar ? 'تدريب لا يُحتسب' : 'Practice only'}
        </span>
      </header>

      <div className="px-5 py-5">
        {stage === 'intro' && <TrialIntro ar={ar} total={total} limit={limit} listening={!!listening} onStart={begin} note={note} />}

        {stage === 'mic' && <MicGate ar={ar} onReady={() => setStage('run')} onCancel={restart} />}

        {stage === 'run' && loci[index] && (
          <TrialQuestion
            key={index}
            ar={ar}
            locus={loci[index]}
            order={index + 1}
            total={loci.length}
            limit={limit}
            deliveryReading={deliveryReading}
            listening={listeningLive ? listening : undefined}
            onListeningLost={message => { setListeningLive(false); setNote(message); }}
            onDone={finishOne}
          />
        )}

        {stage === 'report' && <TrialReport ar={ar} loci={loci} outcomes={outcomes} listened={listeningLive && !!listening} note={note} onRestart={restart} />}
      </div>
    </section>
  );
};

/* ── الباب: ما الذي سيحدث ───────────────────────────────────────────────── */

const TrialIntro: React.FC<{ ar: boolean; total: number; limit: number; listening: boolean; onStart: () => void; note: string }> = ({ ar, total, limit, listening, onStart, note }) => (
  <div className="space-y-4">
    <div className="grid grid-cols-3 gap-2">
      <Stat value={String(total)} label={ar ? 'موضعًا' : 'loci'} />
      <Stat value={clock(limit)} label={ar ? 'للموضع الواحد' : 'per locus'} />
      <Stat value={clock(limit * total)} label={ar ? 'مدة التجربة' : 'total'} />
    </div>

    <TrialSteps ar={ar} listening={listening} />

    {note && <p className="rounded-2xl border border-[#e8d6b8] bg-[#fdf6e8] p-3.5 text-[11px] font-bold leading-6 text-[#6b4f18]">{note}</p>}

    <button type="button" onClick={onStart} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#214C40] px-5 text-sm font-black text-white">
      <PlayCircle className="h-4.5 w-4.5" />{ar ? 'ابدأ التجربة' : 'Start the trial'}
    </button>
    <p className="text-center text-[10px] leading-5 text-[#696f6b]">
      {ar
        ? 'المواضع هنا تُسحب من نطاقك من جدول المصحف، ولا تمسّ خزنة السؤال المعتمدة. ما تراه هنا ليس ما ستُسأل عنه.'
        : 'These loci are drawn from your range in the canonical table, never from the certified question vault.'}
    </p>
  </div>
);

const Stat: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <div className="rounded-2xl bg-white/70 p-3 text-center ring-1 ring-[#e4e2da]">
    <div className="text-xl font-black tabular-nums">{value}</div>
    <div className="mt-0.5 text-[10px] text-[#646965]">{label}</div>
  </div>
);

/* ── بوابة الميكروفون ───────────────────────────────────────────────────── */

/*
 * الصوت يُرى قبل أن يُوثق به.
 *
 * «اسمح بالميكروفون» جملةٌ لا تُثبت شيئًا: الإذن قد يُمنح والجهاز مكتوم أو مصروف إلى مدخلٍ
 * آخر، فيقرأ المتسابق موضعًا كاملًا في صمتٍ لا يعلمه. فالشرط هنا أن يرى شريطه يتحرّك بصوته.
 */
const MicGate: React.FC<{ ar: boolean; onReady: () => void; onCancel: () => void }> = ({ ar, onReady, onCancel }) => {
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const [state, setState] = useState<'idle' | 'asking' | 'live' | 'blocked'>('idle');
  const [error, setError] = useState('');
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const frame = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const open = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setState('blocked'); setError(ar ? 'هذا المتصفّح لا يتيح الميكروفون. جرّب متصفحًا آخر أو هاتفك.' : 'This browser cannot open a microphone.'); return;
    }
    setState('asking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const Ctx: typeof AudioContext | undefined = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx(); ctxRef.current = ctx;
        const analyser = ctx.createAnalyser(); analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buffer = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(buffer);
          let sum = 0;
          for (const v of buffer) { const d = (v - 128) / 128; sum += d * d; }
          const rms = Math.min(1, Math.sqrt(sum / buffer.length) * 3.2);
          setLevel(rms); setPeak(p => Math.max(p, rms));
          frame.current = requestAnimationFrame(tick);
        };
        tick();
      } else {
        // بلا محلّل طيفٍ لا يُقاس الصوت، فلا يُدَّعى قياسه — ويُمضى بالإذن وحده.
        setPeak(1);
      }
      setState('live');
    } catch {
      setState('blocked'); setError(ar ? 'لم يُسمح بالميكروفون. اسمح به من إعدادات المتصفّح ثم أعد المحاولة.' : 'Microphone permission was denied.');
    }
  };

  const proven = peak > 0.08;
  const bars = 28;

  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#E7EEE9] text-[#214C40]"><Mic className="h-6 w-6" /></div>
      <div>
        <h3 className="text-base font-black">{ar ? 'تأكد أن صوتك يصل' : 'Confirm your voice arrives'}</h3>
        <p className="mx-auto mt-1.5 max-w-md text-[11px] leading-6 text-[#5b6460]">
          {ar ? 'افتح الميكروفون ثم اقرأ الاستعاذة بصوتك المعتاد. لا تبدأ التجربة حتى يتحرّك الشريط — الصمت في منتصف موضعك أسوأ من تأخير دقيقة هنا.' : 'Open the microphone and recite aloud until the meter moves.'}
        </p>
      </div>

      <div className="flex h-12 items-end justify-center gap-[3px]" aria-hidden="true">
        {Array.from({ length: bars }, (_, i) => {
          const reach = level * bars;
          const on = i < reach;
          const height = 6 + (on ? Math.min(40, 8 + (reach - i) * 7) : 0);
          return <span key={i} className="w-[5px] rounded-full transition-[height] duration-75" style={{ height, background: on ? '#2F6555' : '#e0ded7' }} />;
        })}
      </div>
      <p role="status" aria-live="polite" className="text-[11px] font-black text-[#214C40]">
        {state === 'live' ? (proven ? (ar ? 'صوتك يصل بوضوح' : 'Your voice is arriving') : (ar ? 'أسمِعنا صوتك…' : 'Say something…')) : state === 'asking' ? (ar ? 'جارٍ طلب الإذن…' : 'Asking…') : ' '}
      </p>

      {error && <p className="rounded-2xl border border-[#e8d6b8] bg-[#fdf6e8] p-3.5 text-start text-[11px] font-bold leading-6 text-[#6b4f18]">{error}</p>}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {state !== 'live'
          ? <button type="button" onClick={() => void open()} disabled={state === 'asking'} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#214C40] px-5 text-xs font-black text-white disabled:opacity-50"><Mic className="h-4 w-4" />{ar ? 'افتح الميكروفون' : 'Open microphone'}</button>
          : <button type="button" onClick={() => { stop(); onReady(); }} disabled={!proven} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#214C40] px-5 text-xs font-black text-white disabled:opacity-45"><ChevronLeft className="h-4 w-4 rtl:rotate-180" />{ar ? 'ابدأ الموضع الأول' : 'Start the first locus'}</button>}
        <button type="button" onClick={() => { stop(); onCancel(); }} className="min-h-11 rounded-2xl border border-[#e0ded7] px-4 text-xs font-black text-[#59615c]">{ar ? 'إلغاء' : 'Cancel'}</button>
      </div>
    </div>
  );
};

/* ── الموضع الواحد ──────────────────────────────────────────────────────── */

const TrialQuestion: React.FC<{
  ar: boolean; locus: TrialLocus; order: number; total: number; limit: number;
  deliveryReading?: string;
  listening?: { reading: QuranReadingId; sourcePackageId: string };
  onListeningLost: (message: string) => void;
  onDone: (outcome: TrialOutcome) => void;
}> = ({ ar, locus, order, total, limit, deliveryReading, listening, onListeningLost, onDone }) => {
  const [left, setLeft] = useState(limit);
  const [last, setLast] = useState<QuranAlignmentResult | null>(null);
  const [stumbleState, setStumbleState] = useState(emptyStumbleState);
  const lost = stumbleState.lostCount;
  const [heard, setHeard] = useState(0);
  const [clarity, setClarity] = useState<number[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  const [openingAsked, setOpeningAsked] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const closed = useRef(false);

  const stopAudio = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    recorderRef.current = null; streamRef.current = null;
  }, []);

  /* الميكروفون يُفتح مع الموضع ويُغلق بانتهائه: لا يبقى مفتوحًا بين موضعين. */
  useEffect(() => {
    let live = true;
    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        if (!live) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(m => MediaRecorder.isTypeSupported(m));
        const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        recorderRef.current = recorder;
        recorder.ondataavailable = async e => {
          if (!e.data.size || !listening) return;
          try {
            const out = await submitPracticeAlignmentChunk({ blob: e.data, reading: listening.reading, sourcePackageId: listening.sourcePackageId, surah: locus.surah, startAyah: locus.startAyah, endAyah: locus.endAyah });
            if (!live) return;
            setLast(out); setHeard(n => n + 1);
            if (out.backendEvidence?.acousticQuality !== undefined) setClarity(xs => [...xs, out.backendEvidence!.acousticQuality!]);
            /* العدُّ والموضعُ من مصدرٍ واحد — وإلا افترقا: عددٌ يقول ٣ ومواضعُ تقول ٢. */
            setStumbleState(prev => observeAlignment(prev, out));
          } catch (err) {
            const code = err instanceof Error ? err.message : '';
            // تعذّرٌ بنيويّ يوقف التتبّع للتجربة كلها؛ تعثّر مقطعٍ واحد لا يوقف شيئًا.
            if (/NOT_CONFIGURED|BENCHMARK|BACKEND|IDENTITY_REQUIRED|HTTP_401|HTTP_403/.test(code)) onListeningLost(trialNote(code, ar));
          }
        };
        recorder.start(2000);
      } catch { /* الإذن مُنح في البوابة؛ تعذّرٌ هنا يترك الموضع بمؤقّته وحده. */ }
    })();
    return () => { live = false; stopAudio(); };
  }, [locus.surah, locus.startAyah, locus.endAyah, listening?.reading, listening?.sourcePackageId]);

  const close = useCallback((ended: TrialOutcome['ended']) => {
    if (closed.current) return;
    closed.current = true;
    stopAudio();
    onDone({
      seconds: limit - left,
      lost,
      stumbles: stumbleState.stumbles,
      reachedAyah: last?.ayah,
      clarity: clarity.length ? clarity.reduce((a, b) => a + b, 0) / clarity.length : undefined,
      heard: heard > 0,
      ended,
    });
  }, [stopAudio, onDone, limit, left, lost, stumbleState.stumbles, last?.ayah, clarity, heard]);

  useEffect(() => {
    const id = window.setInterval(() => setLeft(x => x - 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => { if (left <= 0) close('time'); }, [left, close]);

  const revealOpening = async () => {
    setOpeningAsked(true);
    if (!deliveryReading) return;
    const passage = await fetchDeliveryPassage(deliveryReading, locus.surah, locus.startAyah, locus.startAyah).catch(() => null);
    setOpening(passage?.ayat?.[0]?.text || null);
  };

  const ratio = Math.max(0, Math.min(1, left / limit));
  const urgent = left <= 30;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5" role="list" aria-label={ar ? 'مواضع التجربة' : 'Trial loci'}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} role="listitem" aria-label={`${i + 1}`} className="h-1.5 flex-1 rounded-full" style={{ background: i < order - 1 ? '#2F6555' : i === order - 1 ? '#8aa79b' : '#e0ded7' }} />
        ))}
      </div>

      <div className="rounded-[22px] border border-[#cddbd3] bg-[#F7FAF8] p-5 text-center">
        <div className="mizan-kicker">{ar ? `الموضع ${order} من ${total}` : `Locus ${order} of ${total}`}</div>
        <h3 className="mt-2 text-xl font-black text-[#214C40]">{locusLabel(locus, ar)}</h3>
        {openingAsked
          ? <p className={opening ? 'font-quran mt-4 text-[1.55rem] leading-[2.1] text-[#202622]' : 'mt-3 text-[11px] text-[#656b66]'}>
              {opening || (ar ? 'تعذّر جلب المطلع الآن — اقرأ من أول الآية المذكورة.' : 'The opening could not be loaded; start from the ayah above.')}
            </p>
          : <button type="button" onClick={() => void revealOpening()} className="mt-4 min-h-10 rounded-xl border border-[#cddbd3] bg-white px-4 text-[11px] font-black text-[#214C40]">
              {ar ? 'لقّنّي المطلع' : 'Show the opening'}
            </button>}
      </div>

      <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#e4e2da] bg-white p-4">
        <div className="flex items-center gap-3">
          <span className="relative grid h-14 w-14 place-items-center">
            <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden="true">
              <circle cx="24" cy="24" r="20" fill="none" stroke="#eceae3" strokeWidth="4" />
              <circle cx="24" cy="24" r="20" fill="none" stroke={urgent ? '#9B3B2F' : '#2F6555'} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${ratio * 125.6} 125.6`} />
            </svg>
            <Timer className={`h-4 w-4 ${urgent ? 'text-[#9B3B2F]' : 'text-[#2F6555]'}`} />
          </span>
          <div>
            <div className={`text-2xl font-black tabular-nums leading-none ${urgent ? 'text-[#9B3B2F]' : ''}`}>{clock(Math.max(0, left))}</div>
            <div className="mt-1 text-[10px] font-bold text-[#666a67]">{ar ? 'المتبقي لهذا الموضع' : 'left on this locus'}</div>
          </div>
        </div>
        {listening && (
          <div className="grid grid-cols-2 gap-2 text-center">
            <Pill value={last?.ayah ? String(last.ayah) : '—'} label={ar ? 'الآية الآن' : 'Ayah'} />
            <Pill value={String(lost)} label={ar ? 'فقد أثرك' : 'Lost'} tone={lost ? 'warn' : 'calm'} />
          </div>
        )}
      </div>

      {listening
        ? <p className="flex items-center justify-center gap-1.5 text-[10px] font-black text-[#2F6555]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#2F6555]" />{ar ? 'يستمع ويتابع موضعك — ولا يُسجَّل شيء' : 'Listening and following — nothing is stored'}</p>
        : <p className="text-center text-[10px] font-bold text-[#696f6b]">{ar ? 'التتبّع غير متاح الآن؛ الموضع والمؤقّت يعملان.' : 'Tracking is unavailable; the locus and clock still run.'}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => close('self')} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#214C40] px-5 text-sm font-black text-white">
          <Square className="h-4 w-4" />{order === total ? (ar ? 'أنهيت — اعرض التقرير' : 'Finish') : (ar ? 'أنهيت هذا الموضع' : 'Done with this locus')}
        </button>
        <button type="button" onClick={() => close('skipped')} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#e0ded7] px-4 text-xs font-black text-[#59615c]">
          <SkipForward className="h-4 w-4 rtl:rotate-180" />{ar ? 'تخطّي' : 'Skip'}
        </button>
      </div>
    </div>
  );
};

const Pill: React.FC<{ value: string; label: string; tone?: 'calm' | 'warn' }> = ({ value, label, tone = 'calm' }) => (
  <div className={`rounded-xl px-3 py-2 ${tone === 'warn' ? 'bg-[#fdf1f1]' : 'bg-[#f1efe9]'}`}>
    <div className="text-base font-black tabular-nums leading-none">{value}</div>
    <div className="mt-1 text-[9px] text-[#646965]">{label}</div>
  </div>
);

/* ── التقرير ────────────────────────────────────────────────────────────── */

/*
 * التقرير يصف ولا يحكم.
 *
 * لا مجموع ولا نسبة ولا نجمة: المتسابق الذي يخرج من تدريبٍ برقمٍ يشبه الدرجة يحمله إلى
 * القاعة ثقةً أو خوفًا، وكلاهما زائف — فالمقياس هنا ليس المقياس هناك. فيُعرض ما جرى فعلًا:
 * كم موضعًا أكمل، وأين فقد المحرّك أثره، وكم استغرق، وهل كان صوته واضحًا.
 */
const TrialReport: React.FC<{ ar: boolean; loci: TrialLocus[]; outcomes: TrialOutcome[]; listened: boolean; note: string; onRestart: () => void }> = ({ ar, loci, outcomes, listened, note, onRestart }) => {
  const completed = outcomes.filter(o => o.ended !== 'skipped').length;
  const totalLost = outcomes.reduce((sum, o) => sum + o.lost, 0);
  const seconds = outcomes.reduce((sum, o) => sum + o.seconds, 0);
  const clarities = outcomes.map(o => o.clarity).filter((x): x is number => x !== undefined);
  const clarity = clarities.length ? clarities.reduce((a, b) => a + b, 0) / clarities.length : undefined;
  const hardest = useMemo(() => {
    let worst = -1, at = -1;
    outcomes.forEach((o, i) => { if (o.lost > worst) { worst = o.lost; at = i; } });
    return worst > 0 && at >= 0 ? { locus: loci[at], lost: worst, places: outcomes[at].stumbles.slice(0, 3) } : null;
  }, [outcomes, loci]);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#E7EEE9] text-[#214C40]"><CheckCircle2 className="h-6 w-6" /></div>
        <h3 className="mt-3 text-lg font-black">{ar ? 'انتهت تجربتك' : 'Trial complete'}</h3>
        <p className="mx-auto mt-1.5 max-w-md text-[11px] leading-6 text-[#5b6460]">
          {ar ? 'هذا وصف لما جرى في تجربتك وحدها، لا درجة ولا تنبّؤ بها. لم يُحفظ صوتك ولم يصل اللجنة من هذا شيء.' : 'A description of your own run — not a score and not a prediction. Nothing was stored or sent.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat value={`${completed}/${loci.length}`} label={ar ? 'موضعًا أكملت' : 'completed'} />
        <Stat value={clock(seconds)} label={ar ? 'زمن تلاوتك' : 'reciting time'} />
        <Stat value={listened ? String(totalLost) : '—'} label={ar ? 'انقطاع الأثر' : 'lost track'} />
        <Stat value={clarity !== undefined ? `${Math.round(clarity * 100)}%` : '—'} label={ar ? 'وضوح الصوت' : 'audio clarity'} />
      </div>

      {/* شريطٌ لكل موضع: طوله زمنه، ولونه حاله — يُقرأ بلمحة قبل أن يُقرأ بالتفصيل. */}
      <ul className="space-y-2">
        {loci.map((locus, i) => {
          const o = outcomes[i];
          const tone = !o ? '#e0ded7' : o.ended === 'skipped' ? '#cfcdc5' : o.lost === 0 ? '#2F6555' : o.lost <= 2 ? '#B98A3E' : '#9B3B2F';
          const width = o ? Math.max(6, Math.min(100, (o.seconds / Math.max(1, Math.max(...outcomes.map(x => x.seconds), 1))) * 100)) : 6;
          return (
            <li key={i} className="rounded-2xl border border-[#e4e2da] bg-white p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-black text-[#39423d]">{i + 1}. {locusLabel(locus, ar)}</div>
                  <div className="mt-1 text-[10px] font-bold text-[#656b66]">
                    {!o ? (ar ? 'لم يُقرأ' : 'not read')
                      : o.ended === 'skipped' ? (ar ? 'تخطّيته' : 'skipped')
                      : `${clock(o.seconds)} · ${listened ? (o.heard ? (o.lost === 0 ? (ar ? 'تتبّعك بلا انقطاع' : 'tracked throughout') : ar ? `فقد أثرك ${countAr(o.lost)}${o.stumbles.length ? ` — أوّلها عند ${describeStumble(o.stumbles[0], true)}` : ''}` : `lost ${o.lost}×${o.stumbles.length ? ` — first at ${describeStumble(o.stumbles[0], false)}` : ''}`) : (ar ? 'لم يصل صوتٌ واضح' : 'no clear audio')) : (ar ? 'بلا تتبّع' : 'no tracking')}`}
                  </div>
                </div>
                {o?.reachedAyah && <span className="shrink-0 rounded-lg bg-[#f1efe9] px-2.5 py-1 text-[10px] font-black tabular-nums text-[#4b534e]">{ar ? `بلغت الآية ${o.reachedAyah}` : `ayah ${o.reachedAyah}`}</span>}
              </div>
              <div className="mt-2.5 h-1.5 w-full rounded-full bg-[#f1efe9]"><span className="block h-1.5 rounded-full" style={{ width: `${width}%`, background: tone }} /></div>
            </li>
          );
        })}
      </ul>

      <div className={`rounded-2xl p-4 text-[11px] font-bold leading-6 ${hardest ? 'bg-[#F5EDE2] text-[#7a5a2f]' : 'bg-[#E7EEE9] text-[#214C40]'}`}>
        {!listened
          ? (ar ? 'جرت تجربتك بلا تتبّع صوتي، فالزمن وحده هو ما قيس فيها. راجع مواضعك التي ضاق عليك وقتها.' : 'This run had no tracking; only time was measured.')
          : hardest
            ? (ar
              ? `أكثر ما تعثّرت فيه: ${locusLabel(hardest.locus, true)} — فقد المحرّك أثرك فيه ${countAr(hardest.lost)}${hardest.places.length ? `، عند ${hardest.places.map(p => describeStumble(p, true)).join('، و')}` : ''}. أعِده وحده قبل أن تعيد التجربة كلها؛ الانقطاع قد يكون تردّدًا وقد يكون ضعف صوت، فانظر «وضوح الصوت» قبل أن تحكم على حفظك.`
              : `Most stumbles: ${locusLabel(hardest.locus, false)} (${hardest.lost}×)${hardest.places.length ? ` at ${hardest.places.map(p => describeStumble(p, false)).join('; ')}` : ''}. Re-read it alone before repeating the whole trial.`)
            : (ar ? 'تتبّعك المحرّك في كل مواضعك بلا انقطاع. هذا مؤشّر تمكّن، وليس درجة ولا وعدًا بها.' : 'You were tracked end to end across every locus. An indicator of command — not a score.')}
      </div>

      {note && <p className="rounded-2xl border border-[#e8d6b8] bg-[#fdf6e8] p-3.5 text-[11px] font-bold leading-6 text-[#6b4f18]">{note}</p>}

      <button type="button" onClick={onRestart} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#d9dfdb] px-5 text-sm font-black text-[#214C40]">
        <RotateCcw className="h-4 w-4" />{ar ? 'تجربة أخرى بمواضع جديدة' : 'Run again with new loci'}
      </button>
    </div>
  );
};

/*
 * «أعد الدخول» جوابٌ خاطئٌ في بيئة العرض.
 *
 * الاستماعُ الحيّ يمرّ بهويّةٍ حقيقية (`bearer()`)، وبيئةُ العرض لا حسابَ فيها أصلًا —
 * فيرجع `IDENTITY_REQUIRED` دائمًا. وكان يُقال للزائر «انتهت جلسة دخولك، أعد الدخول»،
 * فيُرسَل إلى بابٍ لا يفتح شيئًا: لم تنتهِ جلسةٌ، ولا يوجد دخولٌ يُعاد. فيُفصل الحالان.
 */
/* رموز تعذّر التتبّع بلغة المتسابق — لا رمز خام في وجهه. */
const trialNote = (code: string, ar: boolean) => {
  if (!ar) return `Tracking is unavailable (${code}).`;
  if (/NOT_CONFIGURED/.test(code)) return 'خدمة التتبّع غير مهيّأة في هذه المسابقة بعد، فجرت التجربة بمؤقّتها ومواضعها بلا استماع.';
  if (/BENCHMARK/.test(code)) return 'خدمة التتبّع لم تُعتمد لروايتك بعد، فجرت التجربة بلا استماع.';
  if (/IDENTITY_REQUIRED|HTTP_401|HTTP_403/.test(code)) return IS_DEMO_SESSION
    ? 'التتبّع الحيّ يحتاج حسابًا حقيقيًّا، وهذه بيئة عرض بلا حساب. تجري التجربة بمؤقّتها ومواضعها.'
    : 'انتهت جلسة دخولك فتوقّف التتبّع. أعد الدخول ثم جرّب من جديد.';
  return 'تعذّر التتبّع الآن، وأكملت التجربة بمؤقّتها ومواضعها.';
};

export default TrialRun;
