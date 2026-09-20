import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Mic, RotateCcw, Square } from 'lucide-react';

import { MushafFaceSurface, type FaceWord } from './MushafFaceSurface';
import { surahNameArabic } from '../judge/OfficialMushafSurface';
import { drawFace } from '../../../server/mushaf-face';
import type { FaceMark, FaceReading } from '../../lib/face-reading';
import { explainChoice, faceWeights, type FaceAttempt } from '../../lib/face-memory';
import {
  attemptFrom, faceNote, faceSupportsListening, listenableFaces, loadFaceAttempts, rememberFaceAttempt,
  serialQueue, type SerialQueue,
} from '../../lib/face-review';
import { readRecitation, SAMPLED_PATH_MARKS, settleRecitation, type FaceAlignmentSample } from '../../lib/face-session';
import {
  fetchPracticeFace, fetchPracticeFaceCatalogue,
  type PracticeFaceCatalogue, type PracticeFacePage,
} from '../../lib/practice-faces';
import { submitPracticeAlignmentChunk, type QuranReadingId } from '../../lib/quran-intelligence';
import type { QuranScope } from '../../lib/quran-scope';

/*
 * «المصحفُ يسمعك» — أن يراجع الطالبُ بصفحته كما يراجع في مصحفه، والصفحةُ تردّ عليه.
 *
 * يُفتح وجهٌ كاملٌ من نطاقه، يقرؤه على ميكروفونه، فيُلوَّن الوجهُ نفسُه بتلاوته: أين
 * لبث، وأين رجع، وأين انقطع الأثر. ثم يميل الوجهُ التالي إلى حيث تعثّر — فيراجع ضعفَه
 * هو، لا ما تيسّر.
 *
 * وأربعةُ حدودٍ تحكمها، وهي حدودُ التدرّب في هذه المنظومة نفسِها:
 *
 *  ١) **لا درجة ولا حكم.** ما يُعرض وصفٌ لما جرى في تلاوته هو: «لبثتَ هنا»، «رجعتَ من
 *     هنا». والنظامُ يعرف أين بلغتَ وكم لبثت، **ولا يعرف ماذا قلت**. الحكمُ للبشر.
 *  ٢) **لا يُسجَّل صوته ولا يُرفع.** المقاطعُ تمرّ على المحرّك لحظةً بلحظة ثم تُطرح، ولا
 *     يُكتب منها دفترُ أدلّة، ولا تصل اللجنةَ منها كلمة.
 *  ٣) **ذاكرةُ تعثّره في جهازه وحده.** لا تُرفع ولا تُسأل عنها لجنة. ومن مسح بيانات
 *     متصفّحه ذهبت — ويُقال له ذلك.
 *  ٤) **ما لا يُقاس يُقال.** هذا المسارُ يقيس اللبثَ والرجوعَ والانقطاع، ولا يقيس بُعدَ
 *     الصوت ولا الالتباسَ ولا التخطّي. فيُعلن ذلك تحت الوجه، لئلّا يُقرأ الصمتُ براءة.
 */

type Stage = 'loading' | 'ready' | 'reciting' | 'analysing' | 'report' | 'blocked';

export interface MushafListensProps {
  ar: boolean;
  /** نطاق الطالب المعتمد — منه وحده تُسحب الوجوه. */
  scope: QuranScope;
  /** مفتاحُ حزمة التسليم لروايته. بلا حزمةٍ لا وجوه. */
  deliveryReading?: string;
  /** محرّكُ الاستماع، إن كان مهيّأً في هذه المسابقة. */
  listening?: { reading: QuranReadingId; sourcePackageId: string } | null;
  /** صاحبُ الذاكرة — تُفصل ذاكرةُ طالبٍ عن آخر على الجهاز الواحد. */
  owner: string;
}

export const MushafListens: React.FC<MushafListensProps> = ({ ar, scope, deliveryReading, listening, owner }) => {
  const [stage, setStage] = useState<Stage>('loading');
  const [note, setNote] = useState('');
  const [catalogue, setCatalogue] = useState<PracticeFaceCatalogue | null>(null);
  const [attempts, setAttempts] = useState<FaceAttempt[]>([]);
  const [face, setFace] = useState<PracticeFacePage | null>(null);
  const [choice, setChoice] = useState('');
  const [reading, setReading] = useState<FaceReading | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [heard, setHeard] = useState(0);
  /* هل بقي مقطعٌ لم يصل حين قُرئ التقرير؟ */
  const [incomplete, setIncomplete] = useState(false);

  const samples = useRef<FaceAlignmentSample[]>([]);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(true);
  /* ترتيبُ التلاوة لا ترتيبُ الشبكة — والضمانُ في `serialQueue` لا في هذا الملفّ. */
  const queue = useRef<SerialQueue>(serialQueue());

  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => { setAttempts(loadFaceAttempts(owner, deliveryReading || '')); }, [owner, deliveryReading]);

  /* القائمةُ تُطلب مرّةً لكلّ نطاقٍ ورواية — وهي مواضعُ بلا نصّ، فلا تُحمَّل الحزمةُ كلُّها. */
  useEffect(() => {
    if (!deliveryReading) { setStage('blocked'); setNote(ar ? 'لا تتوفّر حزمةُ تسليمٍ معتمدةٌ لروايتك بعد، فلا يُفتح وجهٌ على نصٍّ غير معتمد.' : 'No certified package for your reading yet.'); return; }
    let live = true;
    setStage('loading');
    void (async () => {
      try {
        const out = await fetchPracticeFaceCatalogue(deliveryReading, scope);
        if (!live) return;
        setCatalogue(out);
        if (!out.supportsFaces) { setStage('blocked'); setNote(ar ? 'حزمةُ روايتك لا تحمل مواضعَ صفحاتٍ بعد، فلا يُعرض لك وجهُ مصحفٍ لا نعرف حدودَه.' : 'Your reading package carries no page positions yet.'); return; }
        if (!out.faces.length) { setStage('blocked'); setNote(ar ? 'لا يقع في نطاقك المعتمد وجهُ مصحفٍ كاملٌ بعد. والوجهُ الناقصُ لا يُعرض.' : 'No whole Mushaf face falls inside your approved range yet.'); return; }
        setStage('ready');
      } catch (err) {
        if (!live) return;
        setStage('blocked');
        setNote(faceNote(err instanceof Error ? err.message : '', ar));
      }
    })();
    return () => { live = false; };
  }, [deliveryReading, scope, ar]);

  /* الوجوهُ الصالحةُ للاستماع: داخلَ النطاق، وفي سورةٍ واحدة حين يكون المحرّكُ مهيّأً. */
  const candidates = useMemo(() => listenableFaces(catalogue?.faces ?? [], listening), [catalogue, listening]);

  const draw = useCallback(async (seed: string) => {
    if (!deliveryReading || !candidates.length) return;
    setStage('loading'); setReading(null); setNote(''); samples.current = []; setHeard(0); setSeconds(0); setIncomplete(false);
    const weightOf = faceWeights(attempts, Date.now());
    const picked = drawFace(candidates, seed, weightOf);
    if (!picked) { setStage('blocked'); setNote(ar ? 'لم يُسحب وجه.' : 'No face drawn.'); return; }
    try {
      const page = await fetchPracticeFace(deliveryReading, picked.page);
      if (!alive.current) return;
      setFace(page);
      setChoice(explainChoice(page.page, attempts, Date.now(), ar));
      setStage('ready');
    } catch (err) {
      setStage('blocked');
      setNote(faceNote(err instanceof Error ? err.message : '', ar));
    }
  }, [deliveryReading, candidates, attempts, ar]);

  /* أوّلُ وجهٍ يُسحب حين تجهز القائمة، ولا ينتظر ضغطة. */
  useEffect(() => {
    if (stage === 'ready' && !face && candidates.length) void draw(`${owner}:${Date.now()}`);
  }, [stage, face, candidates.length, draw, owner]);

  const releaseMic = useCallback(() => {
    stream.current?.getTracks().forEach(t => t.stop());
    recorder.current = null; stream.current = null;
  }, []);

  /*
   * إيقافُ التسجيل ينتظر آخرَ مقطعٍ فعلًا، **ثم يُطلق الميكروفون فورًا**.
   *
   * فـ`stop()` يُطلق `dataavailable` أخيرًا بعد عودته، ثم `stop`. فمن قرأ المقاطعَ فورَ
   * الضغط أسقط آخرَ ثانيتين من تلاوة الطالب — وهي غالبًا خاتمةُ الوجه.
   *
   * وإطلاقُ الميكروفون في هذه الدالّة نفسِها لا بعدها: وقد كان بعد انتظار الطابور،
   * فلو تعلّق طلبٌ لا يعود بقي **الميكروفونُ مفتوحًا** بلا نهاية وضوءُه مضاءٌ في وجه
   * الطالب وقد أنهى. والإصلاحُ أن يصيرا فعلًا واحدًا لا ترتيبًا يُنسى: من أوقف التسجيل
   * فقد أطلق الميكروفون.
   */
  const stopAndRelease = useCallback(() => new Promise<void>(resolve => {
    const rec = recorder.current;
    const done = () => { releaseMic(); resolve(); };
    if (!rec || rec.state !== 'recording') { done(); return; }
    rec.addEventListener('stop', done, { once: true });
    try { rec.stop(); } catch { done(); }
  }), [releaseMic]);

  const stopAudio = useCallback(() => {
    if (recorder.current?.state === 'recording') { try { recorder.current.stop(); } catch { /* مغلقٌ أصلًا */ } }
    releaseMic();
  }, [releaseMic]);

  useEffect(() => stopAudio, [stopAudio]);

  const begin = useCallback(async () => {
    if (!face) return;
    samples.current = []; setHeard(0); setSeconds(0); setNote(''); setIncomplete(false);
    queue.current = serialQueue();
    setStage('reciting');
    if (!listening) return;   /* بلا محرّكٍ يبقى الوجهُ مفتوحًا للقراءة بلا استماع. */
    /*
     * ووجهٌ يعبر سورتين لا يُفتح له ميكروفون: المحاذاةُ تُطلب لسورةٍ ومدى آياتٍ فيها،
     * فإرسالُ مدًى ينتهي في سورةٍ أخرى يردّه الخادمُ — فيقرأ الطالبُ وجهًا كاملًا ثم
     * يُعطى تقريرًا فارغًا لا يعرف سببه.
     */
    if (!faceSupportsListening(face)) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setNote(ar ? 'هذا المتصفّح لا يتيح الميكروفون، فالوجهُ مفتوحٌ للقراءة بلا استماع.' : 'This browser cannot open a microphone.');
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (!alive.current) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current = media;
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(m => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
      recorder.current = rec;
      /* الطابورُ يُربط **تزامنيًّا** عند وصول المقطع، فلا يسبق متأخّرٌ سابقَه. */
      rec.ondataavailable = e => {
        if (!e.data.size) return;
        const chunk = e.data;
        queue.current.push(async () => {
          try {
            const out = await submitPracticeAlignmentChunk({
              blob: chunk, reading: listening.reading, sourcePackageId: listening.sourcePackageId,
              surah: face.surahStart, startAyah: face.ayahStart, endAyah: face.ayahEnd,
            });
            if (!alive.current) return;
            samples.current = [...samples.current, { surah: out.surah, ayah: out.ayah, wordIndex: out.wordIndex, alignmentState: out.alignmentState }];
            setHeard(n => n + 1);
          } catch (err) {
            const code = err instanceof Error ? err.message : '';
            if (/NOT_CONFIGURED|BENCHMARK|BACKEND|IDENTITY_REQUIRED|HTTP_401|HTTP_403/.test(code)) {
              setNote(faceNote(code, ar));
              stopAudio();
            }
          }
        });
      };
      rec.start(2000);
    } catch {
      setNote(ar ? 'لم يُفتح الميكروفون، فالوجهُ مفتوحٌ للقراءة بلا استماع.' : 'The microphone did not open.');
    }
  }, [face, listening, ar, stopAudio]);

  useEffect(() => {
    if (stage !== 'reciting') return;
    const timer = window.setInterval(() => setSeconds(s => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  const finish = useCallback(async () => {
    if (!face) return;
    setStage('analysing');
    const settled = await settleRecitation({
      flush: stopAndRelease,
      drain: () => queue.current.drain(),
      read: complete => ({ ...readRecitation(samples.current, face.words, face.page), complete }),
    });
    if (!alive.current) return;
    setReading(settled.reading);
    /* وتلاوةٌ لم يصل بعضُها تُقال ناقصةً، ولا تُعرض وكأنّها تامّة. */
    setIncomplete(!settled.complete);
    setStage('report');
    if (settled.attempt) setAttempts(rememberFaceAttempt(owner, deliveryReading || '', settled.attempt));
  }, [face, owner, deliveryReading, stopAndRelease]);

  const words: FaceWord[] = useMemo(
    () => (face?.words ?? []).map(w => ({ index: w.index, text: w.text, surah: w.surah, ayah: w.ayah, endsAyah: w.endsAyah })),
    [face],
  );
  const surahNames = useMemo(() => {
    const out: Record<number, string> = {};
    for (const n of face?.surahs ?? []) { const name = surahNameArabic(n); if (name) out[n] = name; }
    return out;
  }, [face]);

  const marks: readonly FaceMark[] = stage === 'report' && reading ? reading.marks : [];
  /* أيُحلَّل هذا الوجهُ فعلًا؟ محرّكٌ مهيّأٌ **ووجهٌ** يقبل القياس. */
  const analysed = !!listening && faceSupportsListening(face);
  const analysisNote = !listening
    ? (ar ? 'محرّكُ الاستماع غيرُ مهيّأٍ في هذه المسابقة، فالوجهُ مفتوحٌ للمراجعة بلا تحليل — ولا يُتظاهر بسماعٍ لم يقع.' : 'The listening engine is not configured here — the face is open for review without analysis.')
    : !faceSupportsListening(face)
      ? (ar ? 'هذا الوجهُ يحمل خاتمةَ سورةٍ وفاتحةَ أخرى، والتتبّعُ يُطلب لسورةٍ واحدة — فيُراجَع بلا تحليل، ولا يُفتح ميكروفونٌ يعود بتقريرٍ فارغ.' : 'This face spans two surahs and tracking is requested per surah — review it without analysis.')
      : incomplete
        ? (ar ? 'انقضت مهلةُ انتظار بعض المقاطع فلم تصل، وما تراه مبنيٌّ على ما وصل وحدَه — فالنقصُ من الاتّصال لا من تلاوتك. وأعِد الوجهَ إن شئت قياسًا تامًّا.' : 'Some chunks never arrived in time — what you see is built only on what did.')
        : (note || undefined);

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mizan-kicker">{ar ? 'راجع بصفحتك' : 'REVIEW BY THE PAGE'}</div>
          <h2 className="mt-1 text-lg font-black">{ar ? 'المصحفُ يسمعك' : 'The Mushaf listens'}</h2>
          <p className="mt-1 max-w-xl text-[10px] leading-5 text-[#5f6663]">
            {ar
              ? 'وجهٌ كاملٌ من نطاقك، تقرؤه على ميكروفونك، فيُلوَّن الوجهُ بتلاوتك: أين لبثتَ وأين رجعت. ثم يميل الوجهُ التالي إلى حيث تعثّرت.'
              : 'A whole face from your range: recite it, and the page itself shows where you lingered and where you went back.'}
          </p>
        </div>
        {catalogue && stage !== 'blocked' && (
          <div className="rounded-2xl bg-[#f4f2ec] px-3.5 py-2 text-center" data-faces-in-scope={catalogue.faces.length}>
            <div className="text-sm font-black tabular-nums text-[#39423d]" dir="ltr">{catalogue.faces.length} / {catalogue.wholeFaces}</div>
            <div className="text-[9px] text-[#5f6663]">{ar ? 'وجهًا في نطاقك' : 'faces in your range'}</div>
          </div>
        )}
      </header>

      {stage === 'blocked' && (
        <p className="mizan-surface p-6 text-center text-xs leading-6 text-[#5f6663]">{note}</p>
      )}

      {stage === 'loading' && (
        <p className="mizan-surface flex items-center justify-center gap-2 p-8 text-xs text-[#5f6663]">
          {ar ? 'يُسحب وجهٌ من نطاقك…' : 'Drawing a face from your range…'}
        </p>
      )}

      {face && stage !== 'blocked' && stage !== 'loading' && (
        <>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {stage === 'ready' && (
              <button onClick={() => void begin()} data-listens={analysed ? 'yes' : 'no'}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#214C40] px-5 py-2.5 text-xs font-black text-white">
                {analysed && <Mic className="h-4 w-4" aria-hidden="true" />}
                {analysed ? (ar ? 'ابدأ التلاوة' : 'Begin reciting') : (ar ? 'راجِع الوجه' : 'Review the face')}
              </button>
            )}
            {stage === 'analysing' && (
              <span className="inline-flex items-center gap-2 rounded-2xl bg-[#f4f2ec] px-5 py-2.5 text-xs font-black text-[#5f6663]" data-stage="analysing">
                {ar ? 'يُقرأ ما سُمع…' : 'Reading what was heard…'}
              </span>
            )}
            {stage === 'reciting' && (
              <button onClick={() => void finish()}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#8A3B2F] px-5 py-2.5 text-xs font-black text-white">
                <Square className="h-4 w-4" aria-hidden="true" />{ar ? 'أنهيتُ' : 'Done'}
                <span className="tabular-nums opacity-80" dir="ltr">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>
              </button>
            )}
            {stage === 'report' && (
              <button onClick={() => void draw(`${owner}:${Date.now()}`)}
                className="inline-flex items-center gap-2 rounded-2xl border border-[#cfd6d2] bg-white px-5 py-2.5 text-xs font-black text-[#214C40]">
                <RotateCcw className="h-4 w-4" aria-hidden="true" />{ar ? 'وجهٌ آخر' : 'Another face'}
              </button>
            )}
            {stage === 'reciting' && analysed && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#5f6663]" data-heard={heard}>
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                {ar ? `مقاطعُ سُمعت: ${heard}` : `chunks heard: ${heard}`}
              </span>
            )}
          </div>

          <MushafFaceSurface
            ar={ar}
            page={face.page}
            surahName={surahNames[face.surahStart]}
            surahNames={surahNames}
            words={words}
            marks={marks}
            indices={stage === 'report' && reading ? reading.indices : undefined}
            frameUnit="chunk"
            measurableMarks={stage === 'report' && analysed ? SAMPLED_PATH_MARKS : undefined}
            choiceNote={stage === 'report' ? undefined : choice}
            analysisNote={analysisNote}
          />

          {stage === 'report' && (
            <p className="text-center text-[10px] leading-5 text-[#6b716d]">
              {ar
                ? 'وتاريخُ مراجعتك محفوظٌ في هذا الجهاز وحده — لا يُرفع ولا تُسأل عنه لجنة، ويذهب بمسح بيانات المتصفّح.'
                : 'Your review history lives on this device only — never uploaded, and lost if you clear browser data.'}
            </p>
          )}
        </>
      )}
    </section>
  );
};
