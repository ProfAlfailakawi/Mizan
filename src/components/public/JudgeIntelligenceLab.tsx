import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Radar, Gauge, Clock3, UsersRound, Sparkles, ShieldCheck } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { useDialogBehavior } from '../../lib/useDialogBehavior';
import { analyzeFairDrawParity } from '../../lib/fairdraw-parity';
import { classifyMadd } from '../../lib/mudood-engine';
import { buildMutashabihatRadar } from '../../lib/mutashabihat-radar';
import { analyzeCommitteeIntegrity, type ScoreEvent } from '../../lib/committee-integrity';
import type { MutashabihatTrapRecord, QuestionPoolItem } from '../../types';

/*
 * Judge Intelligence Lab (venue mode).
 *
 * A single native surface that demonstrates MIZAN's judge-facing intelligence, each panel
 * driven by a unit-tested library:
 *   - Mutashabihat radar   → mutashabihat-radar.ts
 *   - FairDraw parity      → fairdraw-parity.ts
 *   - Proportional mudood  → mudood-engine.ts
 *   - Committee integrity  → committee-integrity.ts
 *   - Warm-up sanctuary    → local-only breathing + optional voice-steadiness meter
 *
 * Every panel is advisory. Nothing here changes a score, and the warm-up meter never records
 * or transmits — it reads the microphone locally and is torn down on close.
 */

const GOLD = '#E8CB93', GOLD_DEEP = '#B98B4E', DANGER = '#C56A5F', EMER = '#2f6555';
const card = 'rounded-[16px] border p-4';
const cardStyle = { background: 'rgba(12,23,19,.5)', borderColor: 'rgba(232,203,147,.16)' };

type Tab = 'radar' | 'parity' | 'mudood' | 'committee' | 'warmup';

// ---- sample fixtures (illustrative; approved data comes from the store in production) ----
const SAMPLE_MAP: MutashabihatTrapRecord[] = [
  { id: 'm1', competitionId: 'demo', sourceManifestId: 'demo', qiraah: 'quran', rawi: 'hafs', expected: { surah: 2, ayah: 58 }, possible: { surah: 7, ayah: 161 }, similarityEvidence: { kind: 'TEXTUAL', score: 0.92, reference: 'ادخلوا الباب سجدا' }, status: 'APPROVED', createdAt: '' },
  { id: 'm2', competitionId: 'demo', sourceManifestId: 'demo', qiraah: 'quran', rawi: 'hafs', expected: { surah: 2, ayah: 58 }, possible: { surah: 20, ayah: 81 }, similarityEvidence: { kind: 'EXPERT', score: 0.74, reference: 'كلوا من طيبات' }, status: 'APPROVED', createdAt: '' },
  { id: 'm3', competitionId: 'demo', sourceManifestId: 'demo', qiraah: 'quran', rawi: 'hafs', expected: { surah: 6, ayah: 12 }, possible: { surah: 6, ayah: 20 }, similarityEvidence: { kind: 'TEXTUAL', score: 0.88 }, status: 'APPROVED', createdAt: '' },
];
function pool(diff: number, m: QuestionPoolItem['mutashabihatDensity'], t: QuestionPoolItem['tajweedComplexity']): QuestionPoolItem {
  return { id: Math.random().toString(36).slice(2), surahNumber: 2, surahNameArabic: '', surahNameEnglish: '', startAyah: 1, endAyah: 3, juzNumber: 1, riwaya: 'hafs', expectedTextArabic: '', difficultyRating: diff, mutashabihatDensity: m, tajweedComplexity: t, timesUsed: 0 };
}

const Pill: React.FC<{ ok: boolean; children: React.ReactNode }> = ({ ok, children }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold"
    style={{ color: ok ? GOLD : DANGER, borderColor: ok ? 'rgba(232,203,147,.4)' : 'rgba(197,106,95,.5)', background: ok ? 'rgba(232,203,147,.10)' : 'rgba(197,106,95,.12)' }}>{children}</span>
);

// ---------------------------------------------------------------- Radar panel
const RadarPanel: React.FC<{ ar: boolean }> = ({ ar }) => {
  const [ayah, setAyah] = useState(58);
  const radar = useMemo(() => buildMutashabihatRadar({ surah: 2, ayah }, SAMPLE_MAP), [ayah]);
  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-6" style={{ color: '#a9b6ae' }}>
        {ar ? 'عند تردّد المتسابق، يُظهر النظام المواضع المتشابهة التي تجذب الذاكرة — من خريطة معتمدة مسبقًا، لرئيس التحكيم فقط.' : 'On a hesitation, the system surfaces the twin loci that pull on memory — from a pre-approved map, for the head judge only.'}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span style={{ color: GOLD }}>{ar ? 'الموضع الحالي:' : 'Current locus:'}</span>
        {[58, 12, 1].map(a => (
          <button key={a} onClick={() => setAyah(a)} className="rounded-lg border px-3 py-1.5 text-[12.5px] font-bold" style={{ ...cardStyle, borderColor: a === ayah ? GOLD : 'rgba(232,203,147,.16)', color: a === ayah ? GOLD : '#f4f1e8' }}>{ar ? `البقرة ${a === 58 ? '٥٨' : a === 12 ? '(الأنعام ١٢)' : '١'}` : `2:${a}`}</button>
        ))}
      </div>
      <div className={card} style={cardStyle}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[13px] font-bold">{ar ? 'المواضع المنافِسة' : 'Competing loci'}</span>
          <Pill ok={radar.competitorCount === 0}>{radar.competitorCount === 0 ? (ar ? 'لا تشابه' : 'no twins') : `${radar.competitorCount} ${ar ? 'مطابقة' : 'matches'}`}</Pill>
        </div>
        {radar.competitors.length === 0 ? (
          <div className="text-[12.5px]" style={{ color: '#8b9a92' }}>{ar ? 'لا مواضع متشابهة معتمدة عند هذا الموضع.' : 'No approved twin loci at this position.'}</div>
        ) : (
          <div className="space-y-2">
            {radar.competitors.map((c, i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2" style={{ borderColor: 'rgba(232,203,147,.12)' }}>
                <div className="flex items-center gap-3">
                  <span className="font-quran text-[16px]" style={{ color: GOLD }}>{`${c.locus.surah}:${c.locus.ayah}`}</span>
                  {c.reference && <span className="font-quran text-[15px]" style={{ color: 'rgba(244,241,232,.8)' }}>{c.reference}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10.5px]" style={{ color: '#8b9a92' }}>{c.evidenceKind}</span>
                  <div className="h-1.5 w-20 overflow-hidden rounded-full" style={{ background: 'rgba(244,241,232,.12)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.round(c.score * 100)}%`, background: `linear-gradient(90deg,${EMER},${GOLD})` }} />
                  </div>
                  <span className="w-9 text-end text-[11px] font-bold" style={{ color: GOLD }}>{Math.round(c.score * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- Parity panel
const ParityPanel: React.FC<{ ar: boolean }> = ({ ar }) => {
  const [balanced, setBalanced] = useState(false);
  const cohort = useMemo(() => {
    if (balanced) return [
      { participantId: 'A', questions: [pool(3, 'low', 'intermediate'), pool(3, 'medium', 'basic'), pool(3, 'none', 'advanced')] },
      { participantId: 'B', questions: [pool(3, 'medium', 'basic'), pool(3, 'low', 'intermediate'), pool(3, 'none', 'advanced')] },
      { participantId: 'C', questions: [pool(4, 'none', 'basic'), pool(2, 'medium', 'intermediate'), pool(3, 'low', 'intermediate')] },
    ];
    return [
      { participantId: 'A', questions: [pool(1, 'none', 'basic'), pool(2, 'none', 'basic'), pool(1, 'low', 'basic')] },
      { participantId: 'B', questions: [pool(3, 'medium', 'intermediate'), pool(3, 'low', 'basic'), pool(3, 'none', 'intermediate')] },
      { participantId: 'C', questions: [pool(5, 'high', 'advanced'), pool(5, 'high', 'advanced'), pool(4, 'medium', 'advanced')] },
    ];
  }, [balanced]);
  const report = useMemo(() => analyzeFairDrawParity(cohort, 0.15), [cohort]);
  const ok = report.status === 'BALANCED';
  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-6" style={{ color: '#a9b6ae' }}>
        {ar ? 'القرعة تُثبت قابلية إعادة الإنتاج، لكن هل حمل كل متسابق نفس «الطاقة الذهنية»؟ يقيس هذا المؤشر مجموع الصعوبة (صعوبة + متشابهات + تجويد) ويُنبّه عند الفارق.' : 'FairDraw proves reproducibility — but do all sets carry the same cognitive energy? This measures total load (difficulty + mutashabihat + tajweed) and flags gaps.'}
      </p>
      <div className="flex items-center gap-2">
        <button onClick={() => setBalanced(false)} className="rounded-lg border px-3 py-1.5 text-[12.5px] font-bold" style={{ ...cardStyle, borderColor: !balanced ? DANGER : 'rgba(232,203,147,.16)', color: !balanced ? DANGER : '#f4f1e8' }}>{ar ? 'قرعة متفاوتة' : 'Lopsided draw'}</button>
        <button onClick={() => setBalanced(true)} className="rounded-lg border px-3 py-1.5 text-[12.5px] font-bold" style={{ ...cardStyle, borderColor: balanced ? GOLD : 'rgba(232,203,147,.16)', color: balanced ? GOLD : '#f4f1e8' }}>{ar ? 'قرعة متكافئة' : 'Balanced draw'}</button>
      </div>
      <div className={card} style={cardStyle}>
        <div className="mb-3 flex items-center justify-between">
          <Pill ok={ok}>{ok ? (ar ? 'متكافئة' : 'BALANCED') : (ar ? 'مراجعة — أعد القرعة' : 'REVIEW — re-draw')}</Pill>
          <span className="text-[11px]" style={{ color: '#8b9a92' }}>{ar ? 'أقصى فارق' : 'max gap'}: {(report.maxRelativeDelta * 100).toFixed(1)}%</span>
        </div>
        <div className="space-y-2">
          {report.participants.map(p => {
            const w = report.participants[report.participants.length - 1].totalEnergy || 1;
            return (
              <div key={p.participantId} className="flex items-center gap-3">
                <span className="w-6 text-[12px] font-bold" style={{ color: GOLD }}>{p.participantId}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(244,241,232,.10)' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.round((p.totalEnergy / w) * 100)}%`, background: `linear-gradient(90deg,${EMER},${GOLD})` }} />
                </div>
                <span className="w-10 text-end text-[11px]" style={{ color: '#a9b6ae' }}>{p.totalEnergy}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- Mudood panel
const MudoodPanel: React.FC<{ ar: boolean }> = ({ ar }) => {
  const [unit, setUnit] = useState(200);
  const [observed, setObserved] = useState(1200);
  const [expected, setExpected] = useState(6);
  const v = useMemo(() => { try { return classifyMadd(observed, unit, expected); } catch { return null; } }, [observed, unit, expected]);
  const Slider: React.FC<{ label: string; value: number; min: number; max: number; step: number; set: (n: number) => void; unitLabel: string }> = ({ label, value, min, max, step, set, unitLabel }) => (
    <label className="block">
      <div className="mb-1 flex items-center justify-between text-[12px]"><span style={{ color: '#a9b6ae' }}>{label}</span><span style={{ color: GOLD }}>{value} {unitLabel}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => set(+e.target.value)} className="h-[5px] w-full appearance-none rounded-full" style={{ background: `linear-gradient(90deg,${GOLD_DEEP} ${((value - min) / (max - min)) * 100}%, rgba(244,241,232,.14) ${((value - min) / (max - min)) * 100}%)` }} />
    </label>
  );
  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-6" style={{ color: '#a9b6ae' }}>
        {ar ? 'المدّ يُقاس بالحركات لا بالثواني: قارئ سريع وآخر بطيء كلاهما يُتقن مدّ ٦ حركات بزمن مختلف. النظام يقيس المدّ بنبض القارئ نفسه — استشاري لا يمسّ الدرجة.' : 'A madd is measured in ḥarakāt, not seconds. The engine measures it against the reciter\'s own tempo — advisory, never scoring.'}
      </p>
      <div className={card} style={cardStyle}>
        <div className="space-y-3">
          <Slider label={ar ? 'وحدة الحركة (نبض القارئ)' : 'ḥaraka unit (reciter tempo)'} value={unit} min={100} max={320} step={5} set={setUnit} unitLabel="ms" />
          <Slider label={ar ? 'زمن المدّ الملحوظ' : 'observed elongation'} value={observed} min={200} max={2400} step={20} set={setObserved} unitLabel="ms" />
          <Slider label={ar ? 'الحركات المتوقعة' : 'expected ḥarakāt'} value={expected} min={2} max={6} step={2} set={setExpected} unitLabel={ar ? 'حركات' : 'ḥ'} />
        </div>
      </div>
      {v && (
        <div className={card} style={cardStyle}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[26px] font-black" style={{ color: v.within ? GOLD : DANGER }}>{v.observedHarakat} <span className="text-[14px]" style={{ color: '#a9b6ae' }}>/ {v.expectedHarakat} {ar ? 'حركة' : 'ḥarakāt'}</span></div>
              <div className="mt-1 text-[12px]" style={{ color: '#8b9a92' }}>{ar ? (v.direction === 'on-measure' ? 'على المقدار' : v.direction === 'long' ? 'زائد عن المقدار' : 'أقصر من المقدار') : v.direction}</div>
            </div>
            <Pill ok={v.within}>{v.within ? (ar ? 'ضمن التسامح' : 'within') : (ar ? 'خارج التسامح' : 'off measure')}</Pill>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- Committee panel
const CommitteePanel: React.FC<{ ar: boolean }> = ({ ar }) => {
  const [synced, setSynced] = useState(true);
  const events = useMemo<ScoreEvent[]>(() => {
    const mk = (region: string, penalty: number, offset: number) => ({ committeeId: 'C1', region, penalty, submitOffsetMs: offset });
    if (synced) return [...Array(4)].flatMap((_, i) => [mk('A', 0.3, 90 + i * 8), mk('B', 1.3, 110 + i * 8)]);
    return [...Array(4)].flatMap((_, i) => [mk('A', 0.6, 700 + i * 120), mk('B', 0.7, 850 + i * 120)]);
  }, [synced]);
  const report = useMemo(() => analyzeCommitteeIntegrity(events), [events]);
  const sig = report.committees[0];
  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-6" style={{ color: '#a9b6ae' }}>
        {ar ? 'تشريح إحصائي بعد الجلسة — على مستوى اللجنة فقط، بلا ترتيب أي محكّم. يقيس تزامن الرصد وتكافؤ الخصم بين الوفود، كمؤشرات مراجعة للأمانة العامة.' : 'Post-session autopsy — at committee granularity only, never ranking a judge. Measures submission synchrony and regional evenness as review prompts.'}
      </p>
      <div className="flex items-center gap-2">
        <button onClick={() => setSynced(true)} className="rounded-lg border px-3 py-1.5 text-[12.5px] font-bold" style={{ ...cardStyle, borderColor: synced ? DANGER : 'rgba(232,203,147,.16)', color: synced ? DANGER : '#f4f1e8' }}>{ar ? 'رصد متزامن + فارق مناطقي' : 'Synced + regional gap'}</button>
        <button onClick={() => setSynced(false)} className="rounded-lg border px-3 py-1.5 text-[12.5px] font-bold" style={{ ...cardStyle, borderColor: !synced ? GOLD : 'rgba(232,203,147,.16)', color: !synced ? GOLD : '#f4f1e8' }}>{ar ? 'رصد مستقل ومتكافئ' : 'Independent + even'}</button>
      </div>
      <div className={card} style={cardStyle}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[11px]" style={{ color: '#8b9a92' }}>{ar ? 'تزامن الرصد' : 'Submission synchrony'}</div>
            <div className="mt-1"><Pill ok={sig.synchrony !== 'REVIEW_SYNC'}>{sig.synchrony === 'REVIEW_SYNC' ? (ar ? 'مراجعة' : 'review') : sig.synchrony === 'INDEPENDENT' ? (ar ? 'مستقل' : 'independent') : (ar ? 'غير كافٍ' : 'n/a')}</Pill></div>
            <div className="mt-1 text-[11px]" style={{ color: '#a9b6ae' }}>{ar ? 'فارق التوقيت' : 'spread'}: {sig.submissionSpreadMs ?? '—'} ms</div>
          </div>
          <div>
            <div className="text-[11px]" style={{ color: '#8b9a92' }}>{ar ? 'تكافؤ الوفود' : 'Regional evenness'}</div>
            <div className="mt-1"><Pill ok={sig.regionalEvenness !== 'REVIEW_REGIONAL'}>{sig.regionalEvenness === 'REVIEW_REGIONAL' ? (ar ? 'مراجعة' : 'review') : sig.regionalEvenness === 'EVEN' ? (ar ? 'متكافئ' : 'even') : (ar ? 'غير كافٍ' : 'n/a')}</Pill></div>
            <div className="mt-1 text-[11px]" style={{ color: '#a9b6ae' }}>{ar ? 'فارق الخصم' : 'penalty gap'}: {sig.regionalPenaltyGap ?? '—'}</div>
          </div>
        </div>
        <div className="mt-3 border-t pt-2 text-[11px]" style={{ borderColor: 'rgba(232,203,147,.12)', color: '#8b9a92' }}>{ar ? 'غير رسمي · لا يُصنّف أي محكّم فرديًّا.' : 'Non-official · no individual judge is ranked.'}</div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- Warm-up panel
const WarmupPanel: React.FC<{ ar: boolean }> = ({ ar }) => {
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in');
  const [mic, setMic] = useState<'idle' | 'on' | 'denied'>('idle');
  const [level, setLevel] = useState(0);
  const [steady, setSteady] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const levels = useRef<number[]>([]);

  useEffect(() => {
    const seq: Array<['in' | 'hold' | 'out', number]> = [['in', 4000], ['hold', 4000], ['out', 6000]];
    let i = 0; let t: number;
    const step = () => { setPhase(seq[i][0]); t = window.setTimeout(() => { i = (i + 1) % seq.length; step(); }, seq[i][1]); };
    step();
    return () => window.clearTimeout(t);
  }, []);

  const stopMic = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(tk => tk.stop());
    ctxRef.current?.close().catch(() => {});
    streamRef.current = null; ctxRef.current = null;
  };
  useEffect(() => () => stopMic(), []);

  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new Ctx();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      setMic('on');
      const loop = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0; for (let k = 0; k < buf.length; k++) sum += buf[k] * buf[k];
        const rms = Math.sqrt(sum / buf.length);
        const lv = Math.min(1, rms * 6);
        setLevel(lv);
        if (lv > 0.06) { levels.current.push(lv); if (levels.current.length > 60) levels.current.shift(); }
        if (levels.current.length > 8) {
          const m = levels.current.reduce((a, b) => a + b, 0) / levels.current.length;
          const varc = levels.current.reduce((a, b) => a + (b - m) ** 2, 0) / levels.current.length;
          setSteady(Math.max(0, Math.min(1, 1 - Math.sqrt(varc) / (m || 1))));
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch { setMic('denied'); }
  };

  const phaseText = ar ? { in: 'شهيق…', hold: 'احبس…', out: 'زفير…' }[phase] : { in: 'Inhale…', hold: 'Hold…', out: 'Exhale…' }[phase];
  const scale = phase === 'in' ? 1 : phase === 'hold' ? 1 : 0.6;
  const dur = phase === 'in' ? 4 : phase === 'hold' ? 0 : 6;

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-6" style={{ color: '#a9b6ae' }}>
        {ar ? 'كبينة هادئة قبل الصعود: تنفّس متوازن يخفض التوتر، ومقياس ثبات صوت اختياري يعمل محليًّا فقط — لا يُسجَّل ولا يصل للجنة.' : 'A calm pre-stage booth: balanced breathing to lower tension, and an optional voice-steadiness meter that runs locally only — never recorded, never seen by the panel.'}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={card} style={{ ...cardStyle, display: 'grid', placeItems: 'center', minHeight: 220 }}>
          <div className="grid place-items-center" style={{ position: 'relative', width: 180, height: 180 }}>
            <div style={{ position: 'absolute', width: 150, height: 150, borderRadius: '50%', border: `2px solid rgba(232,203,147,.25)`, transform: `scale(${scale})`, transition: `transform ${dur}s ease-in-out`, background: 'radial-gradient(circle, rgba(232,203,147,.12), transparent 70%)' }} />
            <div className="text-center">
              <div className="text-[20px] font-bold" style={{ color: GOLD }}>{phaseText}</div>
              <div className="mt-1 text-[11px]" style={{ color: '#8b9a92' }}>{ar ? 'تنفّس حجابي متوازن' : 'diaphragmatic breathing'}</div>
            </div>
          </div>
        </div>
        <div className={card} style={cardStyle}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-bold">{ar ? 'ثبات الصوت (اختياري)' : 'Voice steadiness (optional)'}</span>
            {mic === 'idle' && <button onClick={startMic} className="rounded-lg px-3 py-1.5 text-[12px] font-bold" style={{ background: `linear-gradient(180deg,${GOLD},${GOLD_DEEP})`, color: '#2a1e0c' }}>{ar ? 'ابدأ' : 'Start'}</button>}
            {mic === 'on' && <button onClick={() => { stopMic(); setMic('idle'); setLevel(0); setSteady(0); levels.current = []; }} className="rounded-lg border px-3 py-1.5 text-[12px] font-bold" style={{ borderColor: 'rgba(232,203,147,.3)' }}>{ar ? 'إيقاف' : 'Stop'}</button>}
          </div>
          {mic === 'denied' && <div className="text-[12px]" style={{ color: DANGER }}>{ar ? 'تعذّر الوصول للميكروفون — التنفّس يعمل بدونه.' : 'Microphone unavailable — breathing still works.'}</div>}
          {mic !== 'denied' && (
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-[11px]" style={{ color: '#8b9a92' }}>{ar ? 'مستوى الصوت' : 'Level'}</div>
                <div className="h-2.5 overflow-hidden rounded-full" style={{ background: 'rgba(244,241,232,.10)' }}><div className="h-full rounded-full" style={{ width: `${Math.round(level * 100)}%`, background: `linear-gradient(90deg,${EMER},${GOLD})`, transition: 'width .1s linear' }} /></div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px]" style={{ color: '#8b9a92' }}><span>{ar ? 'ثبات الطبقة' : 'Steadiness'}</span><span style={{ color: GOLD }}>{Math.round(steady * 100)}%</span></div>
                <div className="h-2.5 overflow-hidden rounded-full" style={{ background: 'rgba(244,241,232,.10)' }}><div className="h-full rounded-full" style={{ width: `${Math.round(steady * 100)}%`, background: steady > 0.6 ? `linear-gradient(90deg,${EMER},${GOLD})` : DANGER, transition: 'width .2s ease' }} /></div>
              </div>
              <div className="text-[11px]" style={{ color: '#8b9a92' }}>{ar ? 'ابدأ بطبقة هادئة وثابتة؛ تجنّب البدء بطبقة عالية تُنهك النفَس.' : 'Begin calm and steady; avoid opening too high — it strains the breath.'}</div>
            </div>
          )}
        </div>
      </div>
      <div className="text-[11px]" style={{ color: '#8b9a92' }}>{ar ? 'خصوصية: الصوت يُحلَّل داخل جهازك فقط ولا يُرسَل أو يُخزَّن.' : 'Privacy: audio is analyzed on your device only — never sent or stored.'}</div>
    </div>
  );
};

// ---------------------------------------------------------------- Shell
export const JudgeIntelligenceLab: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const { language } = useAppStore();
  const ar = language === 'ar';
  const ref = useRef<HTMLDivElement | null>(null);
  useDialogBehavior(!!onClose, onClose || (() => {}), ref, { autoFocus: false });
  const [tab, setTab] = useState<Tab>('radar');

  const tabs: Array<{ id: Tab; ar: string; en: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'radar', ar: 'رادار المتشابهات', en: 'Mutashabihat radar', icon: Radar },
    { id: 'parity', ar: 'تكافؤ القرعة', en: 'FairDraw parity', icon: Gauge },
    { id: 'mudood', ar: 'محرك المدود', en: 'Mudood engine', icon: Clock3 },
    { id: 'committee', ar: 'نزاهة اللجان', en: 'Committee integrity', icon: UsersRound },
    { id: 'warmup', ar: 'محراب الإحماء', en: 'Warm-up sanctuary', icon: Sparkles },
  ];

  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={ar ? 'مختبر ذكاء التحكيم' : 'Judge Intelligence Lab'} dir={ar ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 overflow-y-auto p-3 sm:p-6" style={{ background: 'radial-gradient(120% 90% at 50% -10%, #1d3128 0%, #16241f 42%, #0c1713 100%)', color: '#f4f1e8' }}>
      <div className="mx-auto max-w-[1100px]">
        <header className="mb-4 flex flex-wrap items-center gap-3 rounded-[18px] border px-4 py-3" style={cardStyle}>
          <span className="grid h-9 w-9 place-items-center rounded-[10px]" style={{ background: 'rgba(232,203,147,.10)', border: '1px solid rgba(232,203,147,.16)' }}><ShieldCheck className="h-5 w-5" style={{ color: GOLD }} /></span>
          <div className="me-auto">
            <div className="font-black text-[16px]">{ar ? 'مختبر ذكاء التحكيم' : 'Judge Intelligence Lab'}</div>
            <div className="text-[11px]" style={{ color: GOLD }}>{ar ? 'استشاري · لا يمسّ الدرجة · القرار للمحكم' : 'Advisory · never scores · the judge decides'}</div>
          </div>
          {onClose && <button onClick={onClose} aria-label={ar ? 'إغلاق' : 'close'} className="grid h-9 w-9 place-items-center rounded-[11px]" style={{ background: 'rgba(244,241,232,.05)', border: '1px solid rgba(232,203,147,.16)' }}><X className="h-[18px] w-[18px]" /></button>}
        </header>

        <div className="mb-4 flex flex-wrap gap-2">
          {tabs.map(t => {
            const Icon = t.icon; const active = t.id === tab;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className="inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[12.5px] font-bold transition"
                style={{ background: active ? 'rgba(232,203,147,.12)' : 'rgba(12,23,19,.5)', borderColor: active ? GOLD : 'rgba(232,203,147,.16)', color: active ? GOLD : '#f4f1e8' }}>
                <Icon className="h-4 w-4" />{ar ? t.ar : t.en}
              </button>
            );
          })}
        </div>

        <main className="pb-8">
          {tab === 'radar' && <RadarPanel ar={ar} />}
          {tab === 'parity' && <ParityPanel ar={ar} />}
          {tab === 'mudood' && <MudoodPanel ar={ar} />}
          {tab === 'committee' && <CommitteePanel ar={ar} />}
          {tab === 'warmup' && <WarmupPanel ar={ar} />}
        </main>
      </div>
    </div>
  );
};

export default JudgeIntelligenceLab;
