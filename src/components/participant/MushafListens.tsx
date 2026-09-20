import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Mic, RotateCcw, Square } from 'lucide-react';

import { MushafFaceSurface, type FaceWord } from './MushafFaceSurface';
import { surahNameArabic } from '../judge/OfficialMushafSurface';
import { drawFace } from '../../../server/mushaf-face';
import type { FaceMark, FaceReading } from '../../lib/face-reading';
import { explainChoice, faceWeights, type FaceAttempt } from '../../lib/face-memory';
import {
  attemptFrom, faceNote, faceSupportsListening, judgingNote, listenableFaces, loadFaceAttempts, rememberFaceAttempt,
  reviewNote, serialQueue, type SerialQueue,
} from '../../lib/face-review';
import { finalJudgment, liveJudgment } from '../../lib/live-judging';
import {
  alertWindow, createAlertSpeaker, dropWordsUnderAlert, planAlert, EMPTY_ALERT_MEMORY,
  type AlertMemory, type AlertSpeaker, type SoundWindow,
} from '../../lib/recitation-alerts';
import type { ExpectedWord, HeardWord, Mistake } from '../../lib/recitation-diff';
import { quranSkeleton } from '../../lib/quran-orthography';
import { readRecitation, SAMPLED_PATH_MARKS, settleRecitation, type FaceAlignmentSample } from '../../lib/face-session';
import {
  fetchPracticeFace, fetchPracticeFaceCatalogue,
  type PracticeFaceCatalogue, type PracticeFacePage,
} from '../../lib/practice-faces';
import {
  fetchPracticeJudgingGate, submitPracticeAlignmentChunk, submitPracticeRecognitionChunk,
  type QuranJudgingGate, type QuranReadingId,
} from '../../lib/quran-intelligence';
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

/*
 * طولُ المقطع الواحد — رقمٌ **واحدٌ** يخدم ثلاثةً: التسجيل، وتوقيتُ الكلمة من أوّل
 * التلاوة، ووحدةُ العدّ التي تُعرض. وكان مكتوبًا في موضعه وحده، فلمّا احتاجه التوقيتُ
 * كاد يُكتب ثانيةً — ورقمان يصفان شيئًا واحدًا يفترقان.
 */
const CHUNK_MS = 2000;

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
  /* إذنُ الحكم لهذه الرواية — يُسأل عنه الخادم، ولا تحسبه الشاشةُ لنفسها. */
  const [gate, setGate] = useState<QuranJudgingGate | null>(null);
  /*
   * ومواضعُ الخطأ: `undefined` تعني **لم يُحكم**، ومصفوفةٌ فارغةٌ تعني حُكم فلم يُوجد.
   * والفرقُ بينهما هو الفرقُ بين صمتٍ لا يعرف وصمتٍ يعرف — ولا يُعرضان سواءً.
   */
  const [mistakes, setMistakes] = useState<readonly Mistake[] | undefined>(undefined);

  const samples = useRef<FaceAlignmentSample[]>([]);
  /* ما سُمع من كلماتٍ، بتوقيتٍ من أوّل التلاوة لا من أوّل المقطع. */
  const heardWords = useRef<HeardWord[]>([]);
  const alertMemory = useRef<AlertMemory>(EMPTY_ALERT_MEMORY);
  /* ونوافذُ خرج فيها صوتٌ من السمّاعة — يُطرح ما سُمع تحتها قبل أن يُحكم. */
  const alertWindows = useRef<SoundWindow[]>([]);
  const speaker = useRef<AlertSpeaker | null>(null);
  const chunkIndex = useRef(0);
  const startedAt = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(true);
  /* ترتيبُ التلاوة لا ترتيبُ الشبكة — والضمانُ في `serialQueue` لا في هذا الملفّ. */
  const queue = useRef<SerialQueue>(serialQueue());

  /*
   * والحياةُ تُعاد عند كلّ تركيب، لا تُنفى مرّةً فتبقى منفيّة.
   *
   * فـ`StrictMode` تُركّب المكوّن وتفكّه ثمّ تعيد تركيبه بالمراجع نفسِها. فكتابةُ
   * `alive.current = false` في التنظيف وحدَه تجعل الشاشةَ ميتةً بعد أوّل دورة: يصل
   * الوجهُ من الخادم فيُطرح، فتبقى عند «يُسحب وجهٌ من نطاقك…» أبدًا ولا تعرض وجهًا.
   * وهذا ما كان يقع فعلًا — ولم يره بناءٌ ولا تصييرٌ إلى نصّ، ورآه أوّلُ تشغيلٍ في
   * متصفّح.
   */
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
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

  /*
   * إذنُ الحكم يُسأل عنه مرّةً لكلّ رواية — ولا تفترضه الشاشة.
   *
   * وسقوطُ السؤال يُقرأ «مغلق»: بابٌ لا يُعرف حالُه بابٌ مغلق. ولا يُقال للطالب
   * «أخطأت» على شكٍّ في حالة بوّابة.
   */
  const listenReading = listening?.reading;
  useEffect(() => {
    if (!listenReading) { setGate(null); return; }
    let live = true;
    void (async () => {
      try { const answer = await fetchPracticeJudgingGate(listenReading); if (live) setGate(answer); }
      catch { if (live) setGate(null); }
    })();
    return () => { live = false; };
  }, [listenReading]);

  /* نصُّ الوجه كما يقابَل به ما سُمع — فهرسُ الكلمة هو نفسُه الذي تعرفه الشاشة. */
  const expected = useMemo<ExpectedWord[]>(() => (face?.words ?? []).map(w => ({ index: w.index, text: w.text })), [face]);
  const expectedRef = useRef<ExpectedWord[]>([]);
  useEffect(() => { expectedRef.current = expected; }, [expected]);
  /*
   * وهياكلُ كلمات الوجه — بها يُعرف أثرُ النغمة من كلمةٍ قُرئت.
   *
   * فالنغمةُ لا تصنع كلمةً من كلمات هذا الوجه، وأقصى ما تصنعه لفظٌ غريبٌ عنه. فلا
   * يُطرح تحتها إلا ما ليس منه — وإلا طُرحت كلماتٌ صحيحةٌ فصارت «لم تُسمع».
   */
  const faceSkeletons = useMemo(() => new Set(expected.map(w => quranSkeleton(w.text))), [expected]);
  const faceSkeletonsRef = useRef<Set<string>>(new Set());
  useEffect(() => { faceSkeletonsRef.current = faceSkeletons; }, [faceSkeletons]);
  /* والحكمُ لا يُفتح إلا ببابٍ مفتوحٍ لهذه الرواية بعينها. */
  const judging = gate?.word === 'OPEN' ? gate : null;
  const judgingRef = useRef<QuranJudgingGate | null>(null);
  useEffect(() => { judgingRef.current = judging; }, [judging]);

  const draw = useCallback(async (seed: string) => {
    if (!deliveryReading || !candidates.length) return;
    /* وما بقي من طابور الوجه السابق يُترك قبل أن يُسحب وجهٌ جديد. */
    queue.current.abandon(); queue.current = serialQueue();
    setStage('loading'); setReading(null); setNote(''); samples.current = []; setHeard(0); setSeconds(0); setIncomplete(false);
    heardWords.current = []; alertMemory.current = EMPTY_ALERT_MEMORY; alertWindows.current = []; chunkIndex.current = 0;
    setMistakes(undefined);
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

  /* وعند مغادرة الشاشة: يُطلق الميكروفونُ ويُترك ما بقي من الطابور. */
  useEffect(() => () => {
    queue.current.abandon(); stopAudio();
    speaker.current?.close(); speaker.current = null;
  }, [stopAudio]);

  const begin = useCallback(async () => {
    if (!face) return;
    samples.current = []; setHeard(0); setSeconds(0); setNote(''); setIncomplete(false);
    heardWords.current = []; alertMemory.current = EMPTY_ALERT_MEMORY; alertWindows.current = []; chunkIndex.current = 0;
    setMistakes(undefined);
    startedAt.current = Date.now();
    queue.current.abandon(); queue.current = serialQueue();
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
        /*
         * ورقمُ المقطع يُؤخذ هنا **تزامنيًّا**، لا داخل المهمّة.
         *
         * فتوقيتُ الكلمة يعود من المحرّك مُسنَدًا إلى أوّل المقطع، ويُحتاج مُسنَدًا إلى
         * أوّل التلاوة. ولو قُرئ العدّادُ بعد انتظارٍ لقرأ رقمَ مقطعٍ آخر — فتُطرح
         * كلماتٌ صحيحةٌ ويُبقى صدًى.
         */
        const chunkStartMs = chunkIndex.current * CHUNK_MS;
        chunkIndex.current += 1;
        /*
         * ولا `try` هنا: الخطأُ يمرّ إلى الطابور فيُعدّ ساقطًا، والبيانُ للطالب يُسلَّم
         * إلى `onFailure`. فلو التُقط هنا ومضت المهمّةُ رأى الطابورُ نجاحًا حيث وقع
         * سقوط، فقال «تمّ» ومقطعٌ لم يصل.
         */
        queue.current.push(async live => {
          const out = await submitPracticeAlignmentChunk({
            blob: chunk, reading: listening.reading, sourcePackageId: listening.sourcePackageId,
            surah: face.surahStart, startAyah: face.ayahStart, endAyah: face.ayahEnd,
          });
          /*
           * ويُسأل الطابورُ قبل الكتابة: أما زال هو الجاري؟
           *
           * فمقطعٌ انقضت مهلتُه ثمّ عاد، والطالبُ قد انتقل إلى وجهٍ آخر، يكتب في
           * مواضع الوجه الجديد مواضعَ الوجه القديم — فيختلط تقريرٌ بتقرير، وتُحفظ
           * محاولةٌ مغشوشة تُرجّح وجهًا بغير سبب.
           */
          if (!alive.current || !live()) return;
          samples.current = [...samples.current, { surah: out.surah, ayah: out.ayah, wordIndex: out.wordIndex, alignmentState: out.alignmentState }];
          setHeard(n => n + 1);
        }, error => {
          const code = error instanceof Error ? error.message : '';
          /* وتعذّرٌ بنيويٌّ يوقف التتبّع كلَّه؛ وتعثُّرُ مقطعٍ واحدٍ يُعدّ ولا يوقف شيئًا. */
          if (/NOT_CONFIGURED|BENCHMARK|BACKEND|IDENTITY_REQUIRED|HTTP_401|HTTP_403/.test(code)) {
            setNote(faceNote(code, ar));
            stopAudio();
          }
        });

        /*
         * ومسارُ السماع ثانٍ، ولا يُفتح إلا بإذن.
         *
         * ويدخل **الطابورَ نفسَه** لا طابورًا آخر: ترتيبُ الكلمات هو ترتيبُ التلاوة،
         * ومقطعان يتسابقان يخلطان ما سُمع فيصنعان خطأً حيث لا خطأ — وهي العلّةُ التي
         * صنعت «أعدتَ» الكاذبة في مسار المحاذاة، ولا تُعاد هنا.
         */
        if (judgingRef.current) {
          queue.current.push(async live => {
            const permission = judgingRef.current;
            if (!permission) return;
            const out = await submitPracticeRecognitionChunk({
              blob: chunk, reading: listening.reading, sourcePackageId: listening.sourcePackageId,
            });
            if (!alive.current || !live()) return;
            /* توقيتُ الكلمة يصير من أوّل التلاوة، فتُقاس به نوافذُ النغمات. */
            const timed: HeardWord[] = out.words.map(w => ({
              text: w.text, confidence: w.confidence,
              startMs: w.startMs === undefined ? undefined : chunkStartMs + w.startMs,
              endMs: w.endMs === undefined ? undefined : chunkStartMs + w.endMs,
            }));
            /* وما سُمع تحت نغمةٍ يُطرح: الميكروفونُ خام، فيلتقط صدى التنبيه كلمةً. */
            const { kept } = dropWordsUnderAlert(timed, alertWindows.current, text => faceSkeletonsRef.current.has(quranSkeleton(text)));
            heardWords.current = [...heardWords.current, ...kept];

            const judged = liveJudgment(expectedRef.current, heardWords.current, permission);
            setMistakes(judged.judgment ? judged.settled : undefined);

            const now = Date.now() - startedAt.current;
            const plan = planAlert(judged.settled, alertMemory.current, now);
            alertMemory.current = plan.memory;
            if (plan.sound) {
              if (!speaker.current) speaker.current = createAlertSpeaker();
              speaker.current.play();
              alertWindows.current = [...alertWindows.current, alertWindow(now)];
            }
          }, error => {
            /*
             * وسقوطُ السماع لا يُسقط التتبّع: تبقى العلاماتُ تُقاس، ويبقى الوجهُ يُقرأ.
             * ويُقال للطالب حين يكون السببُ بنيويًّا — لا عند تعثّر مقطعٍ واحد.
             */
            const code = error instanceof Error ? error.message : '';
            if (/NOT_CONFIGURED|JUDGING_CLOSED|MISMATCH|MODEL_NOT_BENCHMARKED/.test(code)) {
              judgingRef.current = null;
              setGate(previous => (previous ? { ...previous, word: 'CLOSED', tashkeel: 'CLOSED', reasons: [code] } : previous));
              setMistakes(undefined);
            }
          });
        }
      };
      rec.start(CHUNK_MS);
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
      read: complete => ({ ...readRecitation(samples.current, face.words, face.page, { complete }), complete }),
    });
    if (!alive.current) return;
    setReading(settled.reading);
    /*
     * وحكمُ الخاتمة يختلف عن حكم الأثناء: لا جبهةَ بعده.
     *
     * فما كان مؤجَّلًا بمسافة الأمان يُقال الآن، وآخرُ الوجه الذي لم يُقرأ يصير خطأً
     * حقيقيًّا — إذ لم يبقَ ما يُنتظر.
     */
    const permission = judgingRef.current;
    const verdict = permission ? finalJudgment(expectedRef.current, heardWords.current, permission) : null;
    setMistakes(verdict ? verdict.mistakes : undefined);
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
  const analysisNote = reviewNote({ listening: !!listening, faceListenable: faceSupportsListening(face), note, incomplete, ar });
  /*
   * ويُقال للطالب لماذا لا يُحكم عليه — فالصمتُ عن خطئه ليس شهادةً بصوابه.
   *
   * ولا يُقال إلا حين يكون المحرّكُ مهيّأً والوجهُ يقبل القياس: وإلا فالسببُ الأوّلُ
   * مقولٌ في `analysisNote`، وتكرارُ سببين على وجهٍ واحدٍ يُربك.
   */
  const gateNote = analysed && stage !== 'ready' ? judgingNote(gate, ar) : undefined;

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
            mistakes={mistakes}
            indices={stage === 'report' && reading ? reading.indices : undefined}
            frameUnit="chunk"
            measurableMarks={stage === 'report' && analysed ? SAMPLED_PATH_MARKS : undefined}
            choiceNote={stage === 'report' ? undefined : choice}
            analysisNote={analysisNote}
          />

          {gateNote && (
            <p className="text-center text-[10px] leading-5 text-[#6b716d]" data-judging-gate={gate?.word ?? 'UNKNOWN'}>{gateNote}</p>
          )}

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
