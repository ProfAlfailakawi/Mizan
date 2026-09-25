import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Lightbulb, Mic, RotateCcw, Square } from 'lucide-react';

import { MushafFaceSurface, type FaceWord } from './MushafFaceSurface';
import { warmQuranFont } from '../../lib/quran-font';
import { surahNameArabic } from '../judge/OfficialMushafSurface';
import { drawFace } from '../../../server/mushaf-face';
import type { FaceMark, FaceReading } from '../../lib/face-reading';
import { explainChoice, faceWeights, type AttemptWord, type AttemptWordKind, type FaceAttempt } from '../../lib/face-memory';
import { HifzJourney } from './HifzJourney';
import {
  amendFaceAttempt, attemptFrom, loadJourneyLedger, faceNote, faceSupportsListening, faceSurahSegments, judgingNote, listenableFaces, loadFaceAttempts, rememberFaceAttempt, segmentAt,
  reviewNote, serialQueue, type SerialQueue,
} from '../../lib/face-review';
import { answerKeepsPermission, finalJudgment, followFrontier, liveJudgment, provisionalReach } from '../../lib/live-judging';
import { OPEN_ROUGH_GATE, admitRough, type RoughGate } from '../../lib/rough-position';
import {
  alertWindow, createAlertSpeaker, dropWordsUnderAlert, planAlert, EMPTY_ALERT_MEMORY,
  type AlertMemory, type AlertSpeaker, type SoundWindow,
} from '../../lib/recitation-alerts';
import type { ExpectedWord, HeardWord, Mistake } from '../../lib/recitation-diff';
import { quranSkeleton } from '../../lib/quran-orthography';
import { fetchDeliveryPassage, fetchDivergencePoints, type DivergencePoint } from '../../lib/kfgqpc-library';
import { SimilarSlipCard, type SimilarSlip } from './SimilarSlipCard';
import { CHUNK_MS, recognitionWindow, catchUpWindow } from '../../lib/recognition-window';
import { faceWordLookup, readRecitation, SAMPLED_PATH_MARKS, settleRecitation, type FaceAlignmentSample } from '../../lib/face-session';
import {
  fetchPracticeFace, fetchPracticeFaceCatalogue,
  type PracticeFaceCatalogue, type PracticeFacePage,
} from '../../lib/practice-faces';
import {
  fetchPracticeJudgingGate, submitPracticeAlignmentChunk, submitPracticeRecognitionChunk, submitTashkeelAnalysis,
  type JourneyPracticeAuth, type QuranJudgingGate, type QuranReadingId,
} from '../../lib/quran-intelligence';
import { alignHeardToFace, buildAyahSegments } from '../../lib/recitation-segments';
import { createSnippetPlayer, type SnippetPlayer } from '../../lib/recitation-snippet';
import { blobToBase64, notHeardAyat, runTashkeel, type UnclearAyah } from '../../lib/tashkeel-run';
import { playReferenceWord, spokenPosition } from '../../lib/reference-word';
import { EMPTY_TASHKEEL, TASHKEEL_HAFS_ONLY_NOTE, TashkeelReport, tashkeelFailureNote, unclearReason, type TashkeelRetake, type TashkeelState } from './TashkeelReport';
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

type Stage = 'loading' | 'ready' | 'asking' | 'reciting' | 'analysing' | 'report' | 'blocked';

/*
 * طولُ المقطع الواحد — رقمٌ **واحدٌ** يخدم ثلاثةً: التسجيل، وتوقيتُ الكلمة من أوّل
 * التلاوة، ووحدةُ العدّ التي تُعرض. وكان مكتوبًا في موضعه وحده، فلمّا احتاجه التوقيتُ
 * كاد يُكتب ثانيةً — ورقمان يصفان شيئًا واحدًا يفترقان.
 */

/* أقصى ما يكشفه الموضعُ التقريبيُّ في مقطعٍ واحد (ثانيتان) تحت الإخفاء — نحو سرعة التلاوة. */
export const VEIL_STEP = 4;
/** كم مقطعًا متتاليًا يسقط قبل أن يُترك التتبّعُ بالكلمات. */
export const FOLLOW_FAILURE_LIMIT = 3;

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
  /** بطاقة رحلة عامة: تفتح نفس التدريب دون اشتراط حساب Firebase. */
  journeyAuth?: JourneyPracticeAuth;
}

const microphoneFailureNote = (error: unknown, ar: boolean) => {
  const name = error && typeof error === 'object' && 'name' in error ? String((error as { name?: unknown }).name || '') : '';
  if (/NotAllowedError|SecurityError/i.test(name)) return ar
    ? 'لم يُسمح للميكروفون. اضغط رمز القفل في المتصفّح، اسمح بالميكروفون لهذا الموقع، ثم اضغط «ابدأ التلاوة» من جديد.'
    : 'Microphone permission is blocked. Allow microphone access for this site, then press “Begin reciting” again.';
  if (/NotFoundError|DevicesNotFoundError/i.test(name)) return ar
    ? 'لم يجد الجهاز ميكروفونًا متاحًا. وصّل الميكروفون أو فعّله ثم أعد المحاولة.'
    : 'No microphone was found. Connect or enable one, then try again.';
  if (/NotReadableError|TrackStartError|AbortError/i.test(name)) return ar
    ? 'الميكروفون مستخدم من تطبيق آخر أو تعذّر تشغيله. أغلق التطبيق الذي يستخدمه ثم أعد المحاولة.'
    : 'The microphone is busy or could not start. Close the app using it, then try again.';
  return ar
    ? 'تعذّر فتح الميكروفون الآن. لم يبدأ «يسمعك» ولم يُرفع أي صوت؛ أعد المحاولة.'
    : 'The microphone could not open. Smart listening did not start and no audio was uploaded; try again.';
};

const listeningFailureNote = (code: string, ar: boolean) => {
  if (/JOURNEY_(TOKEN_INVALID|NOT_FOUND|REVOKED)|HTTP_401|HTTP_403/.test(code)) return ar
    ? 'توقّف «يسمعك» لأن بطاقة الرحلة لم تعد صالحة. افتح رابط الرحلة الأحدث ثم أعد المحاولة.'
    : 'Smart listening stopped because this journey link is no longer valid. Open your latest journey link and try again.';
  if (/PRACTICE_STATUS_BLOCKED/.test(code)) return ar
    ? 'توقّف التدريب لأن حالتك انتقلت إلى مرحلة لا تسمح بالتهيئة الخاصة الآن.'
    : 'Private practice stopped because your journey moved to a stage where preparation is no longer available.';
  if (/PRACTICE_(SCOPE|READING|REQUEST)/.test(code)) return ar
    ? 'توقّف الاستماع لأن نطاقك أو روايتك تغيّرا. أعد فتح بطاقة الرحلة ليُحمَّل الاعتماد الأحدث.'
    : 'Listening stopped because your approved range or reading changed. Reopen the journey to load the latest settings.';
  return faceNote(code, ar);
};

export const MushafListens: React.FC<MushafListensProps> = ({ ar, scope, deliveryReading, listening, owner, journeyAuth }) => {
  const [stage, setStage] = useState<Stage>('loading');
  const [note, setNote] = useState('');
  const [catalogue, setCatalogue] = useState<PracticeFaceCatalogue | null>(null);
  const [attempts, setAttempts] = useState<FaceAttempt[]>([]);
  const [face, setFace] = useState<PracticeFacePage | null>(null);
  const [choice, setChoice] = useState('');
  const [reading, setReading] = useState<FaceReading | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [heard, setHeard] = useState(0);
  /*
   * القلمُ والأثرُ والحجاب — ما يُرسم على الوجه أثناء التلاوة.
   *
   * `reached` أبعدُ ما بلغه القارئ من أوّل الوجه، من شاهدين: موضعُ المحاذاة (أين هو)،
   * وجبهةُ السماع (ما قاله فعلًا). ولا يرجع الأثرُ إلى الوراء: من أعاد آيةً لم يُمحَ ما تلاه.
   */
  const [reached, setReached] = useState(0);
  const reachedRef = useRef(0);
  /* آخرُ موضعٍ مُثبَتٍ في نصّ المستمع — يُرسل معه ليرسو عليه ولا يقفز بعيدًا. */
  const lastGlobal = useRef(-1);
  /** آخرُ موضعٍ تقريبيٍّ كشف شيئًا تحت الحجاب — فتكرارُه لا يكشف مزيدًا. */
  const lastRough = useRef(-1);
  /** سورةُ القطعة التي يُطلب لها الموضعُ التقريبيّ — في الوجه العابر تتبدّل، فتُنسى المرساة. */
  const alignSurah = useRef<number | null>(null);
  /** قفزةٌ تقريبيّةٌ بعيدةٌ تنتظر جوابًا ثانيًا يؤكّدها (`rough-position.ts`). */
  const roughGate = useRef<RoughGate>(OPEN_ROUGH_GATE);
  /** آخرُ جبهةِ سماعٍ مقبولة — تُقاس بها القفزةُ البعيدة (`credibleFrontier`). */
  const trustedFrontier = useRef(-1);
  useEffect(() => { reachedRef.current = reached; }, [reached]);
  const [pen, setPen] = useState<number | null>(null);
  const [veiled, setVeiled] = useState(false);
  const veiledRef = useRef(false);
  useEffect(() => { veiledRef.current = veiled; }, [veiled]);
  const [hint, setHint] = useState<number | null>(null);
  const [hints, setHints] = useState(0);
  /*
   * «دخلتَ على نظيرتها»: حين يقول الطالبُ عند مفترقٍ كلمةَ الآية المتشابهة لا كلمةَ آيته.
   *
   * المفترقاتُ معدودةٌ مسبقًا من حزمة الرواية نفسها (عبارةٌ مشتركة ثم كلمةٌ تختلف). فإن
   * سُمع في موضع كلمةٍ عند مفترقٍ كلمةُ أحد فروعه بعينها، فليس خطأً عابرًا: هو انتقالٌ إلى
   * آيةٍ أخرى — ويُسمّى له موضعُها ليراجع الفرقَ بين الآيتين، لا الكلمةَ وحدها.
   */
  const [slips, setSlips] = useState<SimilarSlip[]>([]);
  const forksRef = useRef<Map<number, DivergencePoint>>(new Map());
  /*
   * والقلمُ ينساب ولا يقفز.
   *
   * الموضعُ يصل كلَّ ثانيتين، وقد تقدّم القارئُ فيهما كلماتٍ. فلو قفز القلمُ إليه لبدا
   * الأثرُ متقطّعًا متأخّرًا. فيُعطى الهدف، ويمشي القلمُ إليه كلمةً كلمة بسرعةٍ تقطع
   * المسافة قبل أن يصل الموضعُ التالي — فيُرى يتبع القارئ. والرجوعُ (إعادةُ آية) قفزٌ
   * مباشر: لا يُمشى بالقلم إلى الوراء كلمةً كلمة.
   */
  const [penTarget, setPenTarget] = useState<number | null>(null);
  const advance = useCallback((index: number | null) => {
    if (index === null || index < 0) return;
    setPenTarget(index);
  }, []);
  /*
   * و«بلغ» لا يتجاوز ما سُمع أبدًا — لا بمؤقّت ولا بكلمةٍ سابقة.
   *
   * كان القلمُ ينساب بمؤقّتٍ بين موضعين، و«بلغ» يسبقه بكلمة (`pen + 2`) — فكان الإخفاءُ
   * («اختبر حفظك») يكشف كلماتٍ بالوقت، بل كلمةً لم يقلها الطالبُ بعد. والحفظُ يُختبر بما
   * يُتلى: فالكشفُ لا يتقدّم إلا إلى الموضع الذي وصل من السماع نفسه، والكلمةُ تنكشف بعد
   * أن تُقال لا قبل. وفي الإخفاء لا انسياب: يقفز القلمُ إلى ما سُمع ويقف.
   */
  useEffect(() => {
    if (penTarget === null) { setPen(null); return; }
    setReached(r => Math.max(r, penTarget + 1));
    if (veiled || pen === null || penTarget < pen || penTarget - pen > 24) { setPen(penTarget); return; }
    if (penTarget === pen) return;
    const step = Math.max(90, Math.min(260, 1500 / (penTarget - pen)));
    const t = window.setTimeout(() => setPen(p => (p === null ? penTarget : Math.min(penTarget, p + 1))), step);
    return () => window.clearTimeout(t);
  }, [pen, penTarget, veiled]);
  /* هل بقي مقطعٌ لم يصل حين قُرئ التقرير؟ */
  const [incomplete, setIncomplete] = useState(false);
  /* إذنُ الحكم لهذه الرواية — يُسأل عنه الخادم، ولا تحسبه الشاشةُ لنفسها. */
  const [gate, setGate] = useState<QuranJudgingGate | null>(null);
  /*
   * ومواضعُ الخطأ: `undefined` تعني **لم يُحكم**، ومصفوفةٌ فارغةٌ تعني حُكم فلم يُوجد.
   * والفرقُ بينهما هو الفرقُ بين صمتٍ لا يعرف وصمتٍ يعرف — ولا يُعرضان سواءً.
   */
  const [mistakes, setMistakes] = useState<readonly Mistake[] | undefined>(undefined);
  /* وانقطع سماعُ مقطعٍ في هذه المراجعة؟ فلا حكمَ عليها، ويُقال. */
  const [judgingLost, setJudgingLost] = useState<boolean | 'changed'>(false);

  const samples = useRef<FaceAlignmentSample[]>([]);
  /* ما سُمع من كلماتٍ، بتوقيتٍ من أوّل التلاوة لا من أوّل المقطع. */
  const heardWords = useRef<HeardWord[]>([]);
  /*
   * تسجيلُ الوجه لمراجعة «المعلّم» بعد التلاوة: في الذاكرة وحدها، ويُترك عند وجهٍ آخر أو بدءٍ
   * جديد أو مغادرة الشاشة. لا يُكتب في مخزنٍ ولا يُرفع إلا إلى المراجعة نفسها.
   */
  const recording = useRef<Blob[]>([]);
  const tashkeelRun = useRef(0);
  /* زمنُ كلّ كلمةٍ سُمعت في التسجيل، ومشغّلُ «تلاوتك هنا» — من الذاكرة وحدها. */
  /* `source` صفرٌ لتسجيل الوجه، وما بعده لإعاداتِ الآيات بترتيبها. */
  const wordTimes = useRef<Map<number, { startMs: number; endMs: number; source: number }>>(new Map());
  const retakeClips = useRef<Blob[][]>([]);
  const snippets = useRef<Map<number, SnippetPlayer>>(new Map());
  const [retake, setRetake] = useState<TashkeelRetake | null>(null);
  const [tashkeel, setTashkeel] = useState<TashkeelState>(EMPTY_TASHKEEL);
  const alertMemory = useRef<AlertMemory>(EMPTY_ALERT_MEMORY);
  /* ونوافذُ خرج فيها صوتٌ من السمّاعة — يُطرح ما سُمع تحتها قبل أن يُحكم. */
  const alertWindows = useRef<SoundWindow[]>([]);
  const speaker = useRef<AlertSpeaker | null>(null);
  /*
   * وإذنُ الحكم يُلتقط **عند بدء التلاوة** ويثبت إلى آخرها.
   *
   * فسؤالُ البوّابة طلبٌ لا يعود فورًا. ولو قُرئ الإذنُ عند كلّ مقطعٍ لبدأ الطالبُ
   * قبل أن يعود الجواب، فتُهمل أوّلُ مقاطعه، ثمّ يُفتح البابُ في أثناء التلاوة
   * فتُقابَل بقيّةُ ما سُمع بالوجه كلِّه — **فيُعدّ أوّلُ الوجه الذي قرأه ساقطًا**.
   *
   * فإن لم يكن الإذنُ معروفًا عند الضغط، لم تُحكم هذه المراجعةُ أصلًا — وتُحكم
   * التي بعدها. ومن هنا أيضًا يُطرح الحكمُ إن سقط مقطعُ سماعٍ في الطريق.
   */
  const attemptJudging = useRef<QuranJudgingGate | null>(null);
  /*
   * التتبّعُ بالكلمات منفصلٌ عن الحكم: يعمل والحكمُ مغلق، ويبقى إن سقط إذنُ المحاولة.
   * ولا يتوقّف لمقطعٍ واحدٍ يسقط — بل بعد FOLLOW_FAILURE_LIMIT متتالية، أو إن قال
   * الخادمُ إنّ السماعَ غيرُ متاحٍ أصلًا. وحينها يعود إلى الموضع التقريبيّ.
   */
  const wordFollow = useRef(true);
  /*
   * آخرُ مقطعٍ دُفع إلى كلٍّ من المسارين — فمهمّةٌ تبدأ وقد جاء بعدها أحدثُ منها تُترك له.
   *
   * كان كلُّ مقطعٍ يُسمع ولو تأخّر: فإذا زاد الحسابُ على طول المقطع (خادمٌ مشغول، شبكةٌ
   * بطيئة) تراكم الطابورُ وكبر التأخّرُ بلا حدّ — قيس ٣٠ ثانيةً وسيطًا (MIZAN-LISTENER-FOLLOW-1).
   * والنوافذُ متداخلة، فالأحدثُ يحمل ما فات ما دام يبدأ قبل آخر ما ثبت.
   */
  const latestRecognition = useRef(-1);
  const latestAlignment = useRef(-1);
  const followFailures = useRef(0);
  const chunkIndex = useRef(0);
  const startedAt = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  /** آخرُ لحظةٍ ثُبّت ما سُمع قبلها — النوافذُ متداخلة، والكلمةُ تُحسب مرّةً واحدة. */
  const committedUntil = useRef(0);
  /** وآخرُ ما عولج من الصوت (حدُّ تثبيت آخر نافذةٍ أُرسلت) — به يُترك طلبٌ لا جديدَ فيه. */
  const coveredUntil = useRef(0);
  /*
   * النوافذُ متداخلة، فالكلمةُ تُسمع أكثر من مرّة: تُثبَّت مرّةً واحدة — ما بدأ بعد آخر
   * مُثبَّت، وانتهى قبل حافّة النافذة بمهلة (إلا في المقطع الأخير). وتوقيتُها من أوّل التلاوة.
   */
  const committedWords = (words: readonly { text: string; confidence: number; startMs?: number; endMs?: number }[], windowStartMs: number, commitUntilMs: number): HeardWord[] => {
    const timed: HeardWord[] = [];
    for (const w of words) {
      if (w.startMs === undefined || w.endMs === undefined) continue;
      const startMs = windowStartMs + w.startMs, endMs = windowStartMs + w.endMs;
      if (startMs < committedUntil.current - 80 || endMs > commitUntilMs) continue;
      timed.push({ text: w.text, confidence: w.confidence, startMs, endMs });
      committedUntil.current = Math.max(committedUntil.current, endMs);
    }
    return timed;
  };
  /* وما بعد حافّة التثبيت من المقطع نفسِه — يُكشف منه ما طابق الكلمةَ التالية تمامًا (`provisionalReach`)، ولا يُحكم به. */
  const edgeWords = (words: readonly { text: string; startMs?: number; endMs?: number }[], windowStartMs: number, commitUntilMs: number): string[] =>
    words.filter(w => w.endMs !== undefined && w.startMs !== undefined && windowStartMs + w.startMs >= committedUntil.current - 80 && windowStartMs + w.endMs > commitUntilMs)
      .map(w => w.text);
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(true);
  /* ترتيبُ التلاوة لا ترتيبُ الشبكة — والضمانُ في `serialQueue` لا في هذا الملفّ. */
  const queue = useRef<SerialQueue>(serialQueue());
  /*
   * وللسماع طابورُه هو، لا يُقاسَم طابورَ المحاذاة.
   *
   * فكلاهما يلزمه الترتيب، ولكنّ الطابورَ يعدّ **أيَّ** مهمّةٍ سقطت ناقصةً — ومن
   * ذلك العدّ يُعرف أنّ التلاوة لم تكتمل، فلا تُحفظ المراجعةُ ويُقال للطالب إنّ
   * مقطعًا لم يصل. فلمّا دخل السماعُ الطابورَ نفسَه صار سقوطُ مقطعِ سماعٍ **يُسقط
   * وصفَ التلاوة وحفظَها** — وهو يعمل ولا شأن له بكشف الخطأ. وقِيس ذلك في متصفّح:
   * «محاولات ٠» في تلاوةٍ تتبُّعُها تامّ.
   *
   * فطابوران: الترتيبُ محفوظٌ في كلٍّ، وسقوطُ أحدهما لا يُحاسَب به الآخر.
   */
  const recognition = useRef<SerialQueue>(serialQueue());

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
  /* خطُّ المصحف يُطلب عند فتح «يسمعك» — فإذا سُحب الوجهُ كان جاهزًا فظهر به من أوّل لحظة. */
  useEffect(() => { void warmQuranFont(); }, []);

  /* القائمةُ تُطلب مرّةً لكلّ نطاقٍ ورواية — وهي مواضعُ بلا نصّ، فلا تُحمَّل الحزمةُ كلُّها. */
  useEffect(() => {
    if (!deliveryReading) { setStage('blocked'); setNote(ar ? 'لا تتوفّر حزمةُ تسليمٍ معتمدةٌ لروايتك بعد، فلا يُفتح وجهٌ على نصٍّ غير معتمد.' : 'No certified package for your reading yet.'); return; }
    let live = true;
    setStage('loading');
    void (async () => {
      try {
        const out = await fetchPracticeFaceCatalogue(deliveryReading, scope, journeyAuth);
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
  }, [deliveryReading, scope, ar, journeyAuth?.competitionId, journeyAuth?.key]);

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
      try { const answer = await fetchPracticeJudgingGate(listenReading, journeyAuth); if (live) setGate(answer); }
      catch { if (live) setGate(null); }
    })();
    return () => { live = false; };
  }, [listenReading, journeyAuth?.competitionId, journeyAuth?.key]);

  useEffect(() => {
    forksRef.current = new Map();
    if (!face || !deliveryReading) return;
    let live = true;
    const bySurah = new Map<number, { lo: number; hi: number }>();
    for (const w of face.words) { const r = bySurah.get(w.surah); bySurah.set(w.surah, r ? { lo: Math.min(r.lo, w.ayah), hi: Math.max(r.hi, w.ayah) } : { lo: w.ayah, hi: w.ayah }); }
    /* محرّكُ المتشابهات يعدّ الكلمة في آيتها من صفر (`server/quran-mutashabihat`)، والوجهُ من واحد. */
    const at = new Map(face.words.map(w => [`${w.surah}:${w.ayah}:${w.ayahWordIndex - 1}`, w.index] as const));
    void Promise.all([...bySurah].map(([surah, r]) => fetchDivergencePoints(deliveryReading, surah, r.lo, r.hi).catch(() => [] as DivergencePoint[]))).then(rows => {
      if (!live) return;
      const map = new Map<number, DivergencePoint>();
      for (const p of rows.flat()) { const i = at.get(`${p.surah}:${p.ayah}:${p.wordIndex}`); if (i !== undefined) map.set(i, p); }
      forksRef.current = map;
    });
    return () => { live = false; };
  }, [face, deliveryReading]);
  const noticeSlips = useCallback((list: readonly Mistake[]) => {
    const found: SimilarSlip[] = [];
    for (const m of list) {
      if (m.kind !== 'substituted' || m.wordIndex === null || !m.heard) continue;
      const point = forksRef.current.get(m.wordIndex);
      const heard = quranSkeleton(m.heard);
      const branch = point?.branches.find(b => quranSkeleton(b.nextWord) === heard);
      if (point && branch) found.push({ wordIndex: m.wordIndex, shared: point.sharedPhrase, expected: point.expectedWord, heard: branch.nextWord, surah: branch.at.surah, ayah: branch.at.ayah, surahName: branch.surahNameArabic });
    }
    if (found.length) setSlips(prev => {
      const seen = new Set(prev.map(x => x.wordIndex));
      const fresh = found.filter(x => !seen.has(x.wordIndex));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }, []);

  /*
   * المستمعُ يستيقظ قبل أن يُطلب منه السماع.
   *
   * خدمةُ الاستماع تنام حين لا يُسمع أحد، وأوّلُ إقلاعٍ قد يأخذ دقيقة. فلو بدأ الطالبُ
   * التلاوةَ وهي تستيقظ سقطت أوائلُ المقاطع، وقيل له «التقريرُ ناقص» عن تلاوةٍ تامّة.
   * فيُسأل عن حالها (والسؤالُ نفسُه يوقظها)، ويبقى زرُّ البدء يقول «يستعدّ» حتى تجهز —
   * بحدٍّ أقصى دقيقتين، ثم يُفتح على كل حال فلا يُحبس الطالبُ خلف خدمةٍ متعثّرة.
   */
  /* «يُفحص» حتى يعود أوّلُ جواب — فلا يُفتح الزرُّ لحظةً قبل أن تُعرف الجاهزية. */
  const [listenerState, setListenerState] = useState<string>('CHECKING');
  useEffect(() => {
    if (!listening || stage !== 'ready') return;
    let live = true; let tries = 0; let timer = 0;
    const poll = async () => {
      try {
        const r = await fetch('/api/health?listener=1', { cache: 'no-store', headers: { accept: 'application/json' } });
        const body = await r.json().catch(() => ({}));
        const state = String(body?.quranPracticeListener?.state || 'UNKNOWN');
        if (!live) return;
        tries += 1;
        const warming = ['LOADING', 'RETRYING', 'CHECKING', 'WAKING'].includes(state);
        if (warming && tries < 24) { setListenerState(state); timer = window.setTimeout(poll, 5000); }
        /*
         * وبعد دقيقتين لا يُفتح الزرُّ على مستمعٍ لم يجهز: كان الطالبُ يتلو وجهًا كاملًا ولا يُسمع منه
         * شيء. فيُقال له بصدق إنّ المستمع غيرُ متاحٍ الآن، ويُسأل عنه كلَّ نصف دقيقة حتى يعود.
         */
        else if (warming) { setListenerState('TIMEOUT'); timer = window.setTimeout(poll, 30_000); }
        else {
          setListenerState(state);
          /* ومستمعٌ لا يُوصل إليه يُسأل عنه كذلك كلَّ نصف دقيقة — فلا يُقفل الزرُّ إلى الأبد. */
          if (state === 'UNREACHABLE' || /^HTTP_/.test(state)) timer = window.setTimeout(poll, 30_000);
        }
      } catch { if (live) { setListenerState('UNREACHABLE'); timer = window.setTimeout(poll, 30_000); } }
    };
    void poll();
    return () => { live = false; window.clearTimeout(timer); };
  }, [listening, stage]);
  const listenerWarming = ['LOADING', 'RETRYING', 'CHECKING', 'WAKING'].includes(listenerState);
  const listenerDown = listenerState === 'TIMEOUT' || listenerState === 'UNREACHABLE' || /^HTTP_/.test(listenerState);
  /* ثوانٍ تُعدّ أمام الطالب — فلا يظنّ زرًّا رماديًّا صامتًا ميكروفونًا معطّلًا. */
  const [warmSeconds, setWarmSeconds] = useState(0);
  useEffect(() => {
    if (!listenerWarming) { setWarmSeconds(0); return; }
    const since = Date.now();
    const t = window.setInterval(() => setWarmSeconds(Math.floor((Date.now() - since) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [listenerWarming]);

  const lookupRef = useRef<(s: FaceAlignmentSample) => number | null>(() => null);
  useEffect(() => { lookupRef.current = face ? faceWordLookup(face.words) : () => null; }, [face]);
  /* التلميح: الكلمةُ التالية تنكشف ثانيتين ونصفًا، وتُعدّ — فالحفظُ بتلميحٍ غيرُه بلا تلميح. */
  const giveHint = useCallback(() => {
    setHint(reached);
    setHints(n => n + 1);
  }, [reached]);
  useEffect(() => {
    if (hint === null) return;
    const t = window.setTimeout(() => setHint(null), 2500);
    return () => window.clearTimeout(t);
  }, [hint]);

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
  /*
   * ما تنفرد به روايةُ المتسابق عن حفص لا يُحكم عليه.
   *
   * المحرّكُ يسمع كلَّ الروايات، لكنّ نموذجَه تدرّب على حفص أكثر، فقد يسمع لفظَ ورشٍ
   * الصحيحَ خطأً. فتُعرف كلماتُ الوجه التي لا نظيرَ لها في نصّ حفص حولها، ولا يُقال
   * فيها «أخطأت» — والزيادةُ لا تُنسب في غير حفص، لأنّ لفظ الرواية قد يُسمع زيادة.
   * ميزانٌ يسكت حيث لا يعرف، ولا يُخطّئ قارئًا مصيبًا.
   */
  const riwayaOnlyRef = useRef<{ words: Set<number>; strictAdded: boolean }>({ words: new Set(), strictAdded: true });
  useEffect(() => {
    riwayaOnlyRef.current = { words: new Set(), strictAdded: true };
    if (!face || !deliveryReading || deliveryReading === 'hafs') return;
    riwayaOnlyRef.current = { words: new Set(face.words.map(w => w.index)), strictAdded: false };
    let live = true;
    const bySurah = new Map<number, { lo: number; hi: number }>();
    for (const w of face.words) { const r = bySurah.get(w.surah); bySurah.set(w.surah, r ? { lo: Math.min(r.lo, w.ayah), hi: Math.max(r.hi, w.ayah) } : { lo: w.ayah, hi: w.ayah }); }
    void Promise.all([...bySurah].map(async ([surah, r]) => [surah, await fetchDeliveryPassage('hafs', surah, Math.max(1, r.lo - 3), r.hi + 3).catch(() => null)] as const)).then(rows => {
      if (!live) return;
      const hafs = new Map<number, Set<string>>();
      for (const [surah, passage] of rows) if (passage) hafs.set(surah, new Set(passage.ayat.flatMap(a => a.text.split(/\s+/).map(quranSkeleton).filter(Boolean))));
      const only = new Set<number>();
      for (const w of face.words) { const set = hafs.get(w.surah); if (!set || !set.has(quranSkeleton(w.text))) only.add(w.index); }
      riwayaOnlyRef.current = { words: only, strictAdded: false };
    });
    return () => { live = false; };
  }, [face, deliveryReading]);
  const judgeable = useCallback((list: readonly Mistake[]) => list.filter(m => m.wordIndex === null ? riwayaOnlyRef.current.strictAdded : !riwayaOnlyRef.current.words.has(m.wordIndex)), []);
  useEffect(() => { faceSkeletonsRef.current = faceSkeletons; }, [faceSkeletons]);
  /* والحكمُ لا يُفتح إلا ببابٍ مفتوحٍ لهذه الرواية بعينها. */
  const judging = gate?.word === 'OPEN' ? gate : null;
  const judgingRef = useRef<QuranJudgingGate | null>(null);
  useEffect(() => { judgingRef.current = judging; }, [judging]);

  const draw = useCallback(async (seed: string, forcedPage?: number) => {
    if (!deliveryReading || !candidates.length) return;
    /* وما بقي من طابور الوجه السابق يُترك قبل أن يُسحب وجهٌ جديد. */
    queue.current.abandon(); queue.current = serialQueue();
    recognition.current.abandon(); recognition.current = serialQueue();
    setStage('loading'); setReading(null); setNote(''); samples.current = []; setHeard(0); setReached(0); setPen(null); setPenTarget(null); setHint(null); setHints(0); setSlips([]); setSeconds(0); setIncomplete(false);
    heardWords.current = []; alertMemory.current = EMPTY_ALERT_MEMORY; alertWindows.current = []; chunkIndex.current = 0; latestRecognition.current = -1; latestAlignment.current = -1; lastGlobal.current = -1; lastRough.current = -1; roughGate.current = OPEN_ROUGH_GATE; trustedFrontier.current = -1; wordFollow.current = true; followFailures.current = 0;
    recording.current = []; tashkeelRun.current += 1; setTashkeel(EMPTY_TASHKEEL);
    snippets.current.forEach(p => p.close()); snippets.current = new Map(); wordTimes.current = new Map(); retakeClips.current = [];
    try { retakeRec.current?.rec.stop(); } catch { /* مغلق */ } setRetake(null);
    attemptJudging.current = null;
    setMistakes(undefined); setJudgingLost(false);
    const weightOf = faceWeights(attempts, Date.now());
    /* صفحةٌ اختارها الطالبُ من خريطة حفظه — من نطاقه وحده؛ وإلا فالسحبُ الموزون. */
    const picked = (forcedPage !== undefined ? candidates.find(c => c.page === forcedPage) : undefined) ?? drawFace(candidates, seed, weightOf);
    if (!picked) { setStage('blocked'); setNote(ar ? 'لم يُسحب وجه.' : 'No face drawn.'); return; }
    try {
      const page = await fetchPracticeFace(deliveryReading, picked.page, journeyAuth);
      if (!alive.current) return;
      setFace(page);
      setChoice(forcedPage === page.page
        ? (ar ? 'اخترتَه أنت من رحلة حفظك.' : 'You chose it from your hifz journey.')
        : explainChoice(page.page, attempts, Date.now(), ar));
      setStage('ready');
    } catch (err) {
      setStage('blocked');
      setNote(faceNote(err instanceof Error ? err.message : '', ar));
    }
  }, [deliveryReading, candidates, attempts, ar, journeyAuth?.competitionId, journeyAuth?.key]);

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
    recording.current = []; tashkeelRun.current += 1;
    snippets.current.forEach(p => p.close()); snippets.current = new Map(); retakeClips.current = [];
    try { retakeRec.current?.rec.stop(); } catch { /* مغلق */ }
    queue.current.abandon(); recognition.current.abandon(); stopAudio();
    speaker.current?.close(); speaker.current = null;
  }, [stopAudio]);

  const begin = useCallback(async () => {
    if (!face) return;
    samples.current = []; setHeard(0); setReached(0); setPen(null); setPenTarget(null); setHint(null); setHints(0); setSlips([]); setSeconds(0); setNote(''); setIncomplete(false);
    heardWords.current = []; alertMemory.current = EMPTY_ALERT_MEMORY; alertWindows.current = []; chunkIndex.current = 0; latestRecognition.current = -1; latestAlignment.current = -1; lastGlobal.current = -1; lastRough.current = -1; roughGate.current = OPEN_ROUGH_GATE; trustedFrontier.current = -1; wordFollow.current = true; followFailures.current = 0;
    recording.current = []; tashkeelRun.current += 1; setTashkeel(EMPTY_TASHKEEL);
    snippets.current.forEach(p => p.close()); snippets.current = new Map(); wordTimes.current = new Map(); retakeClips.current = [];
    try { retakeRec.current?.rec.stop(); } catch { /* مغلق */ } setRetake(null);
    setMistakes(undefined); setJudgingLost(false);
    /* والإذنُ يُلتقط الآن ويثبت: مجهولٌ عند الضغط يعني مراجعةً لا تُحكم. */
    attemptJudging.current = judgingRef.current;
    queue.current.abandon(); queue.current = serialQueue();
    recognition.current.abandon(); recognition.current = serialQueue();

    /*
     * لا ندخل حالة «يتلو» إلا إذا كان الاستماع الحقيقي جاهزًا لهذا الوجه.
     * سابقًا كانت المراجعة اليدوية تشغّل المؤقّت وزر «أنهيتُ» رغم أن لا تحليل يجري؛
     * فيبدو للمتسابق أن «يسمعك» يعمل وهو لا يسمع. الوجه يبقى مفتوحًا للمراجعة فقط.
     */
    if (!listening || !faceSupportsListening(face)) { setStage('ready'); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setStage('ready');
      setNote(ar
        ? 'الميكروفون غير متاح في هذا المتصفّح أو في اتصال غير آمن. افتح البطاقة عبر HTTPS في Safari أو Chrome ثم أعد المحاولة.'
        : 'Microphone access is unavailable in this browser or insecure context. Open the journey over HTTPS in Safari or Chrome and try again.');
      return;
    }
    try {
      /* يمنع ضغطةً ثانيةً بينما نافذة الإذن مفتوحة، ولا يبدأ مؤقّت التلاوة بعد. */
      setStage('asking');
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (!alive.current) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current = media;
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(m => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
      recorder.current = rec;
      startedAt.current = Date.now();
      setStage('reciting');
      /* الطابورُ يُربط **تزامنيًّا** عند وصول المقطع، فلا يسبق متأخّرٌ سابقَه. */
      let head: Blob | null = null;
      const all: Blob[] = [];
      /* قطعُ السور في الوجه — واحدةٌ في أكثر الوجوه، واثنتان أو أكثر في الوجه العابر. */
      const surahSegments = faceSurahSegments(face.words);
      alignSurah.current = null;
      recording.current = all;
      committedUntil.current = 0; coveredUntil.current = 0;
      rec.ondataavailable = e => {
        if (!e.data.size) return;
        const chunk = e.data;
        /*
         * ترويسةُ الملف في المقطع الأوّل وحده؛ وما بعده عنقودٌ لا يُفكّ منفردًا — فكان المستمعُ
         * يتلقّى صوتًا لا يُقرأ ويعود بلا موضع. فيُسبق كلُّ مقطعٍ بالأوّل لمسار التتبّع.
         */
        if (!head) head = chunk;
        const index = chunkIndex.current;
        all.push(chunk);
        /*
         * نافذةُ السماع: الترويسةُ ثمّ آخرُ المقاطع (نحو ست ثوانٍ، وأكثرُ عند اللحاق) — تُحسب
         * في المهمّة حين يجيء دورُها (`catchUpWindow`)، لا هنا.
         *
         * المقطعُ وحده (ثانيتان) يقطع الكلمةَ عند حدّه فيسمعها المحرّكُ خطأً، فيُقال للطالب
         * «أخطأت» وهو مصيب. فيُسمع في سياقه، ولا يُثبَّت إلا ما استقرّ قبل حافّة النافذة.
         */
        const finalChunk = rec.state === 'inactive';
        const listenable = chunk === head ? chunk : new Blob([head, chunk], { type: chunk.type || head.type });
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
        latestAlignment.current = index;
        queue.current.push(async live => {
          /* الموضعُ التقريبيُّ يحتاج أحدثَ مقطعٍ وحده: ما سبقه أحدثُ منه لا يُرسل. */
          if (!finalChunk && latestAlignment.current > index) { setHeard(n => n + 1); return; }
          /*
           * والموضعُ التقريبيُّ لسورةٍ واحدة: في الوجه العابر يُطلب لقطعة السورة التي فيها الكلمةُ
           * التالية لما بلغه القارئ. وحين تتبدّل السورةُ تُنسى المرساة — فرقمُها في نصّ السورة الأخرى.
           */
          const segment = segmentAt(surahSegments, Math.min(face.words.length - 1, Math.max(0, reachedRef.current)));
          const part = segment ?? { surah: face.surahStart, startAyah: face.ayahStart, endAyah: face.ayahEnd };
          if (alignSurah.current !== part.surah) { alignSurah.current = part.surah; lastGlobal.current = -1; }
          const out = await submitPracticeAlignmentChunk({
            blob: listenable, reading: listening.reading, sourcePackageId: listening.sourcePackageId,
            surah: part.surah, startAyah: part.startAyah, endAyah: part.endAyah,
            after: lastGlobal.current >= 0 ? lastGlobal.current : undefined,
            headBytes: chunk === head ? 0 : head.size,
          }, journeyAuth);
          /*
           * ويُسأل الطابورُ قبل الكتابة: أما زال هو الجاري؟
           *
           * فمقطعٌ انقضت مهلتُه ثمّ عاد، والطالبُ قد انتقل إلى وجهٍ آخر، يكتب في
           * مواضع الوجه الجديد مواضعَ الوجه القديم — فيختلط تقريرٌ بتقرير، وتُحفظ
           * محاولةٌ مغشوشة تُرجّح وجهًا بغير سبب.
           */
          if (!alive.current || !live()) return;
          samples.current = [...samples.current, { surah: out.surah, ayah: out.ayah, wordIndex: out.wordIndex, alignmentState: out.alignmentState }];
          /* موضعٌ «LOST» مرشَّحٌ لم يُوثَق به (ضجيجٌ أو مطابقةٌ ضعيفة): لا يحرّك القلمَ ولا يكشف كلمة. */
          if (out.alignmentState !== 'LOST') {
            const target = lookupRef.current({ surah: out.surah, ayah: out.ayah, wordIndex: out.wordIndex, alignmentState: out.alignmentState });
            /*
             * والقفزةُ البعيدةُ للأمام تنتظر جوابًا ثانيًا يؤكّدها — ولا تصير مرساةً قبل ذلك.
             * (قِيس: `LOCKED` على 33:15 والصوتُ في الآية 7 علّم ثمانين كلمةً «مقروءة».)
             */
            const admitted = target === null ? null : admitRough(target, reachedRef.current - 1, roughGate.current, Date.now());
            if (admitted) roughGate.current = admitted.gate;
            if (admitted?.accept && out.alignmentState === 'LOCKED' && Number.isInteger(out.globalIndex)) lastGlobal.current = out.globalIndex as number;
            if (admitted?.accept) {
              /*
               * وفي «اختبر حفظك» لا يكشف الموضعُ التقريبيُّ ما لم يُسمع:
               * ـ إن كان السماعُ كلمةً كلمةً جاريًا فهو وحده يكشف (أدنا)، والتقريبيُّ لا يكشف شيئًا؛
               * ـ وإلا فلا يكشف إلا موضعًا مُثبَتًا (LOCKED)، ولا يتقدّم في مقطعٍ واحدٍ أكثرَ من
               *   `VEIL_STEP` كلمات — فمطابقةٌ ضعيفةٌ مع آيةٍ بعيدة لا تفتح نصفَ الصفحة.
               */
              if (!veiledRef.current) advance(target);
              else if (!attemptJudging.current && !wordFollow.current && out.alignmentState === 'LOCKED' && target !== null && target > lastRough.current) {
                // الكشفُ يتقدّم بدليلٍ جديد فقط: موضعٌ مُثبَتٌ أبعدُ من السابق، ولا يسبقه بأكثر من VEIL_STEP.
                lastRough.current = target;
                advance(Math.min(target, reachedRef.current - 1 + VEIL_STEP));
              }
            }
          }
          setHeard(n => n + 1);
        }, error => {
          const code = error instanceof Error ? error.message : '';
          /* وتعذّرٌ بنيويٌّ يوقف التتبّع كلَّه؛ وتعثُّرُ مقطعٍ واحدٍ يُعدّ ولا يوقف شيئًا. */
          if (/NOT_CONFIGURED|BENCHMARK|BACKEND|IDENTITY_REQUIRED|HTTP_401|HTTP_403|JOURNEY_|PRACTICE_(STATUS|SCOPE|READING|REQUEST)/.test(code)) {
            setNote(listeningFailureNote(code, ar));
            stopAudio();
            setStage('ready');
          }
        });

        /*
         * ومسارُ السماع ثانٍ، ولا يُفتح إلا بإذن.
         *
         * ويدخل **الطابورَ نفسَه** لا طابورًا آخر: ترتيبُ الكلمات هو ترتيبُ التلاوة،
         * ومقطعان يتسابقان يخلطان ما سُمع فيصنعان خطأً حيث لا خطأ — وهي العلّةُ التي
         * صنعت «أعدتَ» الكاذبة في مسار المحاذاة، ولا تُعاد هنا.
         */
        if (attemptJudging.current || wordFollow.current) {
          latestRecognition.current = index;
          recognition.current.push(async live => {
            const permission = attemptJudging.current;
            if (!permission && !wordFollow.current) return;
            /*
             * وإن جاء بعدها أحدثُ تُترك له — بشرط ألا يترك ثقبًا: نافذةُ الأحدث تبدأ قبل آخر ما ثبت،
             * فكلُّ ما قيل بعده في نافذته. (والمقطعُ الأخيرُ لا يُترك أبدًا.)
             */
            const newest = latestRecognition.current;
            // وتُقاس بالتي تليها لا بأحدثِها: فالتاليةُ إن غطّت تُترك لها هذه، وهي تُقاس بما يليها — حتى أحدثِ نافذةٍ تغطّي.
            if (!finalChunk && newest > index && recognitionWindow(index + 1, false).startMs <= committedUntil.current) return;
            /*
             * ونافذتُه تُحسب الآن لا عند وصول المقطع: إن كان خلفه أحدثُ امتدّت إليه (`catchUpWindow`)،
             * فيُلحق بالتلاوة في طلبٍ واحد. وإن لم يبقَ بعد آخر ما ثبت شيءٌ جديد، فلا طلب.
             */
            const reach = catchUpWindow(index, finalChunk ? index : newest, finalChunk, committedUntil.current);
            if (!finalChunk && reach.commitUntilMs <= Math.max(committedUntil.current, coveredUntil.current)) return;
            const parts = reach.headed ? [all[0], ...all.slice(reach.first, reach.last + 1)] : all.slice(0, reach.last + 1);
            const out = await submitPracticeRecognitionChunk({
              blob: new Blob(parts, { type: chunk.type || all[0].type }), headBytes: reach.headed ? all[0].size : 0,
              reading: listening.reading, sourcePackageId: listening.sourcePackageId,
            }, journeyAuth);
            if (!alive.current || !live()) return;
            coveredUntil.current = Math.max(coveredUntil.current, reach.commitUntilMs);
            followFailures.current = 0;
            if (!permission) {
              /* تتبّعٌ بلا حكم: الموضعُ من الكلمات المسموعة، ولا خطأَ يُعرض ولا نغمة. */
              heardWords.current = [...heardWords.current, ...committedWords(out.words, reach.startMs, reach.commitUntilMs)];
              const frontier = followFrontier(expectedRef.current, heardWords.current, trustedFrontier.current);
              trustedFrontier.current = Math.max(trustedFrontier.current, frontier);
              /* ومن الجبهة الفارغة (-1) كذلك: أوّلُ كلمةٍ عند الحافّة تنكشف ولا تنتظر النافذةَ التالية. */
              advance(provisionalReach(expectedRef.current, frontier, edgeWords(out.words, reach.startMs, reach.commitUntilMs)));
              return;
            }
            /*
             * وجوابٌ جاء ببوّابةٍ غيرِ التي بدأت بها المحاولة لا يُحكم به: تغيّر القياسُ
             * في أثناء التلاوة. فتُطرح المحاولةُ كلُّها، وتُحفظ البوّابةُ الجديدة للتالية.
             */
            if (!answerKeepsPermission(permission, out)) {
              judgingRef.current = out.gate.word === 'OPEN' ? out.gate : null;
              setGate(out.gate);
              throw new Error('QURAN_JUDGING_GATE_CHANGED');
            }
            /*
             * توقيتُ الكلمة يصير من أوّل التلاوة، فتُقاس به نوافذُ النغمات.
             *
             * والنوافذُ متداخلة، فالكلمةُ تُسمع أكثر من مرّة: تُثبَّت مرّةً واحدة — ما بدأ بعد
             * آخر مُثبَّت، وانتهى قبل حافّة النافذة بمهلة (إلا في المقطع الأخير).
             */
            const timed = committedWords(out.words, reach.startMs, reach.commitUntilMs);
            /* وما سُمع تحت نغمةٍ يُطرح: الميكروفونُ خام، فيلتقط صدى التنبيه كلمةً. */
            const { kept } = dropWordsUnderAlert(timed, alertWindows.current, text => faceSkeletonsRef.current.has(quranSkeleton(text)));
            heardWords.current = [...heardWords.current, ...kept];

            const judged = liveJudgment(expectedRef.current, heardWords.current, permission, undefined, trustedFrontier.current);
            trustedFrontier.current = Math.max(trustedFrontier.current, judged.frontier);
            /* وجبهةُ السماع أدقُّ شاهدٍ على الموضع: ما قاله فعلًا لا ما يُظنّ أنّه بلغه. */
            advance(provisionalReach(expectedRef.current, judged.frontier, edgeWords(out.words, reach.startMs, reach.commitUntilMs)));
            const settledHere = judgeable(judged.settled);
            setMistakes(judged.judgment ? settledHere : undefined);
            noticeSlips(settledHere);

            const now = Date.now() - startedAt.current;
            const plan = planAlert(settledHere, alertMemory.current, now);
            alertMemory.current = plan.memory;
            if (plan.sound) {
              if (!speaker.current) speaker.current = createAlertSpeaker();
              speaker.current.play();
              alertWindows.current = [...alertWindows.current, alertWindow(now)];
            }
          }, error => {
            const code0 = error instanceof Error ? error.message : '';
            if (!attemptJudging.current) {
              /* سقوطٌ في التتبّع وحده: يُحتمل مقطعٌ أو اثنان، ثمّ يعود الموضعُ التقريبيّ. */
              followFailures.current += 1;
              if (followFailures.current >= FOLLOW_FAILURE_LIMIT || /NOT_CONFIGURED|JUDGING_CLOSED|MISMATCH/.test(code0)) wordFollow.current = false;
              return;
            }
            /*
             * **وأيُّ مقطعٍ سماعٍ يسقط يُبطل حكمَ هذه المراجعة كلِّها** — لا العلّةُ
             * البنيويّةُ وحدها.
             *
             * فمقطعٌ لم يصل يترك ثقبًا في ما سُمع، والمقابلةُ تقرأ الثقبَ إسقاطًا:
             * كلماتٌ قرأها الطالبُ صحيحةً تُعلَّم «لم تُسمع» ويُنبَّه عليها بصوت.
             * وكان الشرطُ مقصورًا على أسماءٍ بعينها، فيبقى البابُ مفتوحًا بعد عطبِ
             * شبكةٍ أو 502 أو تجاوزِ حدّ — وهي أكثرُ ما يقع.
             *
             * وسقوطُ السماع لا يُسقط التتبّع: تبقى العلاماتُ تُقاس ويبقى الوجهُ يُقرأ.
             */
            const code = error instanceof Error ? error.message : '';
            attemptJudging.current = null;
            setMistakes(undefined);
            /* والتبدّلُ يُكشف في الشاشة (بوّابةُ الجواب) أو في الخادم (البابُ بعد الجواب). */
            const changed = /GATE_CHANGED/.test(code);
            setJudgingLost(changed ? 'changed' : true);
            if (code === 'QURAN_ASR_GATE_CHANGED') {
              /* والخادمُ لم يردّ البوّابةَ الجديدة، فتُسأل عنها للمحاولة التالية. */
              judgingRef.current = null;
              void fetchPracticeJudgingGate(listening.reading, journeyAuth)
                .then(fresh => { if (alive.current) setGate(fresh); })
                .catch(() => { if (alive.current) setGate(null); });
            }
            if (/NOT_CONFIGURED|JUDGING_CLOSED|MISMATCH|MODEL_NOT_BENCHMARKED/.test(code)) {
              judgingRef.current = null;
              setGate(previous => (previous ? { ...previous, word: 'CLOSED', tashkeel: 'CLOSED', reasons: [code] } : previous));
            }
          });
        }
      };
      rec.start(CHUNK_MS);
    } catch (error) {
      /* إن رُفض الإذن فلا نظهر جلسةً وهميةً ولا مؤقّتًا يتحرك من دون صوت. */
      releaseMic();
      setStage('ready');
      setNote(microphoneFailureNote(error, ar));
    }
  }, [face, listening, ar, stopAudio, releaseMic, journeyAuth?.competitionId, journeyAuth?.key]);

  useEffect(() => {
    if (stage !== 'reciting') return;
    const timer = window.setInterval(() => setSeconds(s => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  /*
   * «المعلّم»: بعد التلاوة تُراجَع الحركاتُ والمدود آيةً آية.
   *
   * يُبنى من السماع الحيّ أين تبدأ كلُّ آيةٍ وأين تنتهي من التسجيل (`buildAyahSegments`)،
   * ويُرسل التسجيلُ ومقاطعُه دفعاتٍ إلى المعلّم؛ وتعود ملاحظاتُه على كلماتٍ بعينها فتُخطّ
   * تحتها في الصفحة ويُكتب تقريرُها. ولحفص وحده، ولا يعمل بلا سماعٍ كلمةً كلمة (لا أزمنة).
   */
  const reviewTashkeel = useCallback(async () => {
    const run = ++tashkeelRun.current;
    const isCurrent = () => alive.current && tashkeelRun.current === run;
    if (!face) return;
    if (deliveryReading !== 'hafs') { setTashkeel({ ...EMPTY_TASHKEEL, phase: 'unavailable', note: TASHKEEL_HAFS_ONLY_NOTE(ar) }); return; }
    const parts = recording.current;
    const heard = heardWords.current;
    /* بلا سماعٍ كلمةً كلمة لا تُعرف أزمنةُ الآيات — وبوّابةُ السماع تقول سببَها فوق. */
    if (!parts.length || !heard.length) { setTashkeel(EMPTY_TASHKEEL); return; }
    const faceWords = face.words.map(w => ({ index: w.index, text: w.text, surah: w.surah, ayah: w.ayah }));
    const times = alignHeardToFace(faceWords, heard);
    wordTimes.current = new Map([...times].map(([i, t]) => [i, { ...t, source: 0 }]));
    const segments = buildAyahSegments(faceWords, heard);
    if (!segments.length) {
      setTashkeel({ ...EMPTY_TASHKEEL, phase: 'unavailable', note: ar ? 'لم يُسمع من الوجه ما يكفي لمراجعة الحركات آيةً آية — اقرأه كاملًا بصوتٍ واضح ثم أعد.' : 'Too little of the face was heard to review vowels ayah by ayah.' });
      return;
    }
    const unheard = notHeardAyat(faceWords, times, new Set(segments.map(x => `${x.surah}:${x.ayah}`)));
    const withUnheard = (list: UnclearAyah[]) => [...unheard, ...list].sort((a, b) => a.surah - b.surah || a.ayah - b.ayah);
    setTashkeel({ ...EMPTY_TASHKEEL, phase: 'analysing', total: segments.length, unclearAyat: unheard });
    const audio = await blobToBase64(new Blob(parts, { type: parts[0].type || 'audio/webm' }));
    if (!isCurrent()) return;
    if (audio.length > 8_000_000) {
      setTashkeel({ ...EMPTY_TASHKEEL, phase: 'failed', total: segments.length, note: tashkeelFailureNote('TASHKEEL_AUDIO_INVALID', ar) });
      return;
    }
    /* أوّلُ مراجعةٍ بعد سكونٍ تنتظر إقلاعَ المعلّم: يُقال «يستعدّ» إن طال الجوابُ الأوّل. */
    const slow = window.setTimeout(() => {
      if (isCurrent()) setTashkeel(s => (s.phase === 'analysing' && s.done === 0 ? { ...s, phase: 'warming' } : s));
    }, 12_000);
    const out = await runTashkeel({
      segments,
      submit: batch => submitTashkeelAnalysis({ audio, segments: batch, scope }, journeyAuth),
      onProgress: p => { if (isCurrent()) setTashkeel(s => ({ ...s, ...p, unclearAyat: withUnheard(p.unclearAyat), phase: p.phase === 'analysing' && p.done === 0 && s.phase === 'warming' ? 'warming' : p.phase })); },
      isCurrent,
    }).finally(() => window.clearTimeout(slow));
    if (!isCurrent() || out.phase === 'cancelled') return;
    if (out.phase === 'off') { setTashkeel(EMPTY_TASHKEEL); return; }
    if (out.phase === 'unsupported') { setTashkeel({ ...EMPTY_TASHKEEL, phase: 'unavailable', note: TASHKEEL_HAFS_ONLY_NOTE(ar) }); return; }
    const { phase: _phase, ...tallies } = out as Extract<typeof out, { phase: 'done' | 'failed' }>;
    const merged = { ...tallies, unclearAyat: withUnheard(out.unclearAyat), unclear: out.unclear + unheard.length };
    if (out.phase === 'failed') { setTashkeel({ ...merged, phase: 'failed', note: tashkeelFailureNote(out.code, ar) }); return; }
    setTashkeel({ ...merged, phase: 'done' });
  }, [face, deliveryReading, scope, ar, journeyAuth?.competitionId, journeyAuth?.key]);

  /* «تلاوتك هنا»: الكلمةُ بصوت الطالب — من تسجيل الوجه أو من إعادة آيتها — ولا يخرج من الجهاز. */
  const listenAt = useCallback((index: number) => {
    const t = wordTimes.current.get(index);
    const parts = t ? (t.source === 0 ? recording.current : retakeClips.current[t.source - 1]) : undefined;
    if (!t || !parts?.length) return;
    let player = snippets.current.get(t.source);
    if (!player) { player = createSnippetPlayer(parts); snippets.current.set(t.source, player); }
    void player.play(t.startMs, t.endMs);
  }, []);

  /* «القارئ»: الكلمةُ نفسُها من تلاوة المرجع (حفص). */
  const referenceOf = useCallback((index: number) => {
    const w = face?.words[index];
    if (!w || deliveryReading !== 'hafs') return null;
    const ayahWords = face!.words.filter(x => x.surah === w.surah && x.ayah === w.ayah);
    const spoken = spokenPosition(ayahWords.map(x => x.text), ayahWords.findIndex(x => x.index === index));
    return spoken < 0 ? null : { surah: w.surah, ayah: w.ayah, spoken };
  }, [face, deliveryReading]);
  const hearReference = useCallback((index: number) => {
    const at = referenceOf(index);
    if (at) void playReferenceWord(at.surah, at.ayah, at.spoken);
  }, [referenceOf]);

  /*
   * «أعِد هذه الآية»: تُسجَّل الآيةُ وحدها (ثلاثون ثانيةً على الأكثر)، وتُعرف أزمنةُ كلماتها
   * بالسماع نفسه، ويراجعها المعلّم، وتُدمج في التقرير مكانَ ما كان لها — والتسجيلُ في الذاكرة وحدها.
   */
  const retakeRec = useRef<{ rec: MediaRecorder; stream: MediaStream; timers: number[] } | null>(null);
  const retakePending = useRef(false);
  const stopRetake = useCallback(() => {
    const r = retakeRec.current;
    if (r && r.rec.state !== 'inactive') { try { r.rec.stop(); } catch { /* مغلق */ } }
  }, []);
  const startRetake = useCallback(async (u: UnclearAyah) => {
    /* الموضعُ يُحجز قبل سؤال الإذن: ضغطةٌ ثانيةٌ والإذنُ معلّقٌ لا تفتح ميكروفونًا ثانيًا. */
    if (!face || retakeRec.current || retakePending.current) return;
    const ayahWords = face.words.filter(w => w.surah === u.surah && w.ayah === u.ayah).map(w => ({ index: w.index, text: w.text, surah: w.surah, ayah: w.ayah }));
    if (!ayahWords.length) return;
    const run = tashkeelRun.current;
    const isCurrent = () => alive.current && tashkeelRun.current === run;
    let media: MediaStream;
    retakePending.current = true;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (error) {
      retakePending.current = false;
      if (isCurrent()) setRetake({ surah: u.surah, ayah: u.ayah, phase: 'failed', seconds: 0, note: microphoneFailureNote(error, ar) });
      return;
    }
    retakePending.current = false;
    /* وإن تغيّر الوجهُ أو غادر الطالبُ والإذنُ معلّق: يُعاد الميكروفون ولا يبدأ تسجيل. */
    if (!isCurrent()) { media.getTracks().forEach(t => t.stop()); return; }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    const started = Date.now();
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const r = retakeRec.current;
      r?.timers.forEach(t => window.clearInterval(t));
      media.getTracks().forEach(t => t.stop());
      retakeRec.current = null;
      void (async () => {
        const seconds = (Date.now() - started) / 1000;
        if (!isCurrent()) return;
        if (!chunks.length || seconds < 0.8) { setRetake({ surah: u.surah, ayah: u.ayah, phase: 'failed', seconds: 0, note: ar ? 'لم يُسجَّل شيء — أعِد المحاولة.' : 'Nothing was recorded — try again.' }); return; }
        setRetake({ surah: u.surah, ayah: u.ayah, phase: 'reviewing', seconds: Math.round(seconds) });
        const clip = new Blob(chunks, { type: chunks[0].type || 'audio/webm' });
        /* أزمنةُ الكلمات من السماع نفسه، إن كان الإذنُ قائمًا؛ وإلا فالتسجيلُ كلُّه مقطعٌ واحد. */
        let heard: HeardWord[] = [];
        if (judgingRef.current && listening) {
          try {
            const out = await submitPracticeRecognitionChunk({ blob: clip, headBytes: 0, reading: listening.reading, sourcePackageId: listening.sourcePackageId }, journeyAuth);
            heard = out.words.filter(w => w.startMs !== undefined && w.endMs !== undefined).map(w => ({ text: w.text, confidence: w.confidence, startMs: w.startMs as number, endMs: w.endMs as number }));
          } catch { /* يُراجَع بلا أزمنة */ }
        }
        const source = retakeClips.current.push(chunks);
        let segments = heard.length ? buildAyahSegments(ayahWords, heard, { minCoverage: 0.5 }) : [];
        if (heard.length) {
          const times = alignHeardToFace(ayahWords, heard);
          for (const [i, t] of times) wordTimes.current.set(i, { ...t, source });
        }
        if (!segments.length && seconds <= 19.5) {
          const spoken = ayahWords.map((w, k) => ({ w, k })).filter(x => quranSkeleton(x.w.text).length > 0);
          if (spoken.length) segments = [{ id: `${u.surah}:${u.ayah}`, surah: u.surah, ayah: u.ayah, startMs: 0, endMs: Math.round(seconds * 1000), ayahWords: ayahWords.map(w => w.text), wordIndices: ayahWords.map(w => w.index), from: spoken[0].k, to: spoken[spoken.length - 1].k }];
        }
        if (!segments.length) { setRetake({ surah: u.surah, ayah: u.ayah, phase: 'failed', seconds: 0, note: ar ? 'التسجيلُ أطولُ من أن يُراجَع — اقرأ الآيةَ وحدها.' : 'Too long to review — recite only this ayah.' }); return; }
        segments = segments.map(x => ({ ...x, id: `${x.id}~r${source}` }));
        const audio = await blobToBase64(clip);
        const out = await runTashkeel({ segments, submit: batch => submitTashkeelAnalysis({ audio, segments: batch, scope }, journeyAuth), onProgress: () => {}, isCurrent });
        if (!isCurrent() || out.phase === 'cancelled') return;
        if (out.phase !== 'done') {
          setRetake({ surah: u.surah, ayah: u.ayah, phase: 'failed', seconds: 0, note: out.phase === 'failed' ? tashkeelFailureNote(out.code, ar) : unclearReason('', ar) });
          return;
        }
        const own = new Set(ayahWords.map(w => w.index));
        setTashkeel(st => {
          const others = st.unclearAyat.filter(x => !(x.surah === u.surah && x.ayah === u.ayah));
          const still = out.unclearAyat.length ? [{ ...out.unclearAyat[0], id: u.id }] : [];
          const unclearAyat = [...others, ...still].sort((a, b) => a.surah - b.surah || a.ayah - b.ayah);
          const findings = [...st.findings.filter(f => !own.has(f.wordIndex)), ...out.findings].sort((a, b) => a.wordIndex - b.wordIndex);
          return { ...st, findings, unclearAyat, unclear: unclearAyat.length, reviewed: st.reviewed + (still.length ? 0 : 1), mode: out.mode ?? st.mode, benchmark: out.benchmark ?? st.benchmark };
        });
        setRetake(out.unclearAyat.length ? { surah: u.surah, ayah: u.ayah, phase: 'failed', seconds: 0, note: unclearReason(out.unclearAyat[0].reason, ar) } : null);
      })();
    };
    const tick = window.setInterval(() => setRetake(r => (r && r.phase === 'recording' ? { ...r, seconds: Math.floor((Date.now() - started) / 1000) } : r)), 500);
    const limit = window.setTimeout(() => stopRetake(), 30_000);
    retakeRec.current = { rec, stream: media, timers: [tick, limit] };
    setRetake({ surah: u.surah, ayah: u.ayah, phase: 'recording', seconds: 0 });
    rec.start();
  }, [face, ar, listening, scope, journeyAuth?.competitionId, journeyAuth?.key, stopRetake]);

  const finish = useCallback(async () => {
    if (!face) return;
    setStage('analysing');
    const settled = await settleRecitation({
      flush: stopAndRelease,
      drain: () => queue.current.drain(),
      read: complete => ({ ...readRecitation(samples.current, face.words, face.page, { complete }), complete }),
    });
    if (!alive.current) return;
    /*
     * ويُنتظر السماعُ على حدة — وتأخّرُه ليس نقصًا في التلاوة.
     *
     * وإن لم يفرغ طابورُه في مهلته فقد بقي آخرُ ما سُمع في الطريق. وحكمُ الخاتمة
     * يُحاسب الذيلَ حذفًا، فتلاوةٌ ناقصةُ السماع تُقرأ «أسقطَ آخرَ الوجه» — وهو لم
     * يُسقط. فيُطرح الحكمُ ويُقال للطالب لماذا.
     */
    /*
     * ويُنتظر طابورُ السماع **حكمًا كان أو تتبّعًا**: فالتقريرُ و«المعلّم» يقرآن ما سُمع،
     * وذيلٌ لم يصل يسقط منهما. وما لم يفرغ في مهلته يُترك، فلا يحرّك القلمَ بعد التقرير.
     */
    if ((attemptJudging.current || wordFollow.current) && !(await recognition.current.drain())) {
      /*
       * ويُترك الطابورُ لا الإذنُ وحده: فالمهمّةُ الجاريةُ التقطت إذنَها قبل أن تنتظر،
       * فإن عاد جوابُها بعد المهلة كتب أخطاءً ونغّم بعد أن قيل للطالب «لم يُحكم».
       */
      recognition.current.abandon();
      if (attemptJudging.current) {
        attemptJudging.current = null;
        setJudgingLost(true);
      }
    }
    if (!alive.current) return;
    setReading(settled.reading);
    /*
     * وحكمُ الخاتمة يختلف عن حكم الأثناء: لا جبهةَ بعده.
     *
     * فما كان مؤجَّلًا بمسافة الأمان يُقال الآن، وآخرُ الوجه الذي لم يُقرأ يصير خطأً
     * حقيقيًّا — إذ لم يبقَ ما يُنتظر.
     */
    const permission = attemptJudging.current;
    const verdict = permission ? finalJudgment(expectedRef.current, heardWords.current, permission) : null;
    setMistakes(verdict ? judgeable(verdict.mistakes) : undefined);
    if (verdict) noticeSlips(judgeable(verdict.mistakes));
    if (settled.attempt) {
      /*
       * والمحاولةُ تحفظ **كلماتِ** التعثّر لا أنواعَه وحدها: ما أعاده أو التبس عليه من علامات
       * المتابعة، وما سقط أو أُبدل من حكم الكلمات. فتعرف «رحلةُ حفظك» أيَّ كلمةٍ تتكرّر.
       */
      const at = (i: number, k: AttemptWordKind): AttemptWord | null => {
        const w = face.words[i];
        return w ? { i, s: w.surah, a: w.ayah, t: w.text.slice(0, 64), k } : null;
      };
      /*
       * وما بعد أبعد موضعٍ بلغه لا يُسجَّل «سقط»: من توقّف عند الآية الثالثة لم ينسَ ما بعدها،
       * بل لم يقرأه. فالسجلُّ للتعثّر لا للتوقّف (كما في «لم يُسمع» عند المعلّم).
       */
      const judged = (verdict ? judgeable(verdict.mistakes) : []).filter(m => m.wordIndex !== null);
      const farthest = Math.max(settled.reading.indices.reach,
        ...judged.filter(m => m.kind !== 'skipped').map(m => (m.wordIndex as number) + 1));
      const words = [
        ...settled.reading.marks.filter(m => m.kind === 'repeat' || m.kind === 'confusable').map(m => at(m.word, m.kind as AttemptWordKind)),
        ...judged.filter(m => (m.wordIndex as number) < farthest)
          .map(m => at(m.wordIndex as number, m.kind === 'tashkeel' ? 'vowel' : m.kind)),
      ].filter((w): w is AttemptWord => !!w);
      const attempt = { ...settled.attempt, words, reach: farthest, judged: { words: !!verdict } };
      attemptKey.current = { at: attempt.at, page: attempt.page };
      setAttempts(rememberFaceAttempt(owner, deliveryReading || '', attempt));
    } else attemptKey.current = null;
    /* وتلاوةٌ لم يصل بعضُها تُقال ناقصةً، ولا تُعرض وكأنّها تامّة. */
    setIncomplete(!settled.complete);
    setStage('report');
    /* والمعلّمُ بعد التقرير لا قبله: لا ينتظر الطالبُ الحركاتِ ليرى الكلمات. */
    void reviewTashkeel();
  }, [face, owner, deliveryReading, stopAndRelease, reviewTashkeel]);

  /*
   * ملاحظاتُ «المعلّم» تلحق بمحاولتها حين تكتمل — وتُستبدل كلُّها بعد كلّ إعادة آية، فلا يبقى
   * في الذاكرة ما صحّحته الإعادة.
   */
  const attemptKey = useRef<{ at: string; page: number } | null>(null);
  useEffect(() => {
    const key = attemptKey.current;
    if (!key || !face || face.page !== key.page || tashkeel.phase !== 'done') return;
    const kind = (k: string): AttemptWordKind => (k === 'tajweed' ? 'tajweed' : k === 'letter' ? 'letter' : 'vowel');
    const teacher = tashkeel.findings.map(f => {
      const w = face.words[f.wordIndex];
      return w ? { i: f.wordIndex, s: w.surah, a: w.ayah, t: w.text.slice(0, 64), k: kind(f.kind) } : null;
    }).filter((w): w is AttemptWord => !!w);
    setAttempts(amendFaceAttempt(owner, deliveryReading || '', key.at, key.page, teacher, ['vowel', 'tajweed', 'letter'], true));
  }, [tashkeel.phase, tashkeel.findings, face, owner, deliveryReading]);

  const practisable = useMemo(() => new Set(candidates.map(c => c.page)), [candidates]);
  /* السجلُّ الدائم يُقرأ كلما تغيّرت الذاكرة (أي بعد كلّ حفظ). */
  const ledger = useMemo(() => loadJourneyLedger(owner, deliveryReading || ''), [owner, deliveryReading, attempts]);

  const words: FaceWord[] = useMemo(
    () => (face?.words ?? []).map(w => ({ index: w.index, text: w.text, surah: w.surah, ayah: w.ayah, endsAyah: w.endsAyah, ayahWordIndex: w.ayahWordIndex })),
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
  const gateNote = analysed && stage !== 'ready' ? judgingNote(gate, ar, judgingLost) : undefined;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mizan-kicker">{ar ? 'اختبار ذكي' : 'SMART PRACTICE'}</div>
          <h2 className="mt-1 text-lg font-black">{ar ? 'اقرأ… والمصحف يتابعك' : 'Recite… the Mushaf follows'}</h2>
          <p className="mt-1 max-w-xl text-[10px] leading-5 text-[#5f6663]">
            {ar
              ? 'صفحة المصحف الحقيقية من روايتك، كما يراها المحكّم. اقرأها بصوتك؛ وبعد الانتهاء يعيد لك ميزان مواضع المراجعة بلا درجة ولا ازدحام.'
              : 'The real printed page for your reading, exactly as the judge sees it. Recite aloud; when you finish, MIZAN returns only the places worth reviewing — no score and no clutter.'}
          </p>
          <p className="mt-1 text-[9px] font-bold text-[#6b716d]">{ar?'لا يُسجَّل صوتك، ولا يصل اللجنة منه شيء، ولا يُحتسب في درجتك.':'Your voice is not recorded, nothing is sent to the judging panel, and this never affects your score.'}</p>
        </div>
      </header>

      {(stage === 'ready' || stage === 'report' || stage === 'blocked') && (
        <HifzJourney ar={ar} attempts={attempts} ledger={ledger} practisable={practisable} current={face?.page}
          onPractise={page => void draw(`${owner}:${Date.now()}`, page)} />
      )}

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
            {stage === 'ready' && analysed && (
              <button onClick={() => void begin()} data-listens="yes" disabled={listenerWarming || listenerDown} data-listener={listenerState}
                className={`inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-xs font-black text-white transition ${listenerWarming ? 'cursor-wait bg-[#6f8a80]' : 'bg-[#214C40]'}`}>
                <Mic className={`h-4 w-4 ${listenerWarming ? 'motion-safe:animate-pulse' : ''}`} aria-hidden="true" />
                {listenerWarming
                  ? (ar ? `المستمع يستيقظ… ${warmSeconds.toLocaleString('ar-EG')} ث` : `Listener waking… ${warmSeconds}s`)
                  : (ar ? 'ابدأ التلاوة' : 'Begin reciting')}
              </button>
            )}
            {stage === 'ready' && analysed && listenerDown && (
              <p className="basis-full text-center text-[11px] font-bold leading-6 text-[#8f2d1c]" data-listener-down role="status" aria-live="polite">
                {ar
                  ? 'المستمعُ غيرُ متاحٍ الآن، فلن يُسمع ما تتلوه — ولا نريد أن تقرأ وجهًا كاملًا بلا مراجعة. يُعاد السؤالُ عنه تلقائيًّا كلَّ نصف دقيقة، ويُفتح الزرُّ حين يعود. ويمكنك الآن «اختبر حفظك» بلا سماع.'
                  : 'The listener is unavailable right now, so nothing you recite would be heard. It is re-checked every 30 seconds and the button unlocks when it is back.'}
              </p>
            )}
            {stage === 'ready' && analysed && listenerWarming && (
              <p className="basis-full text-center text-[11px] leading-6 text-[#5f6663]" data-listener-waking role="status" aria-live="polite">
                {ar
                  ? 'الميكروفونُ سليم — المستمعُ ينام حين لا يُسمع أحد، وأوّلُ تلاوةٍ بعد سكونٍ تنتظر إقلاعَه (عادةً أقلّ من دقيقة). يُفتح الزرُّ وحده حين يجهز.'
                  : 'Your microphone is fine — the listener sleeps when idle and takes up to a minute to wake. The button unlocks by itself.'}
              </p>
            )}
            {stage === 'asking' && (
              <span className="inline-flex items-center gap-2 rounded-2xl bg-[#E7EEE9] px-5 py-2.5 text-xs font-black text-[#214C40]" data-stage="asking" role="status" aria-live="polite">
                <Mic className="h-4 w-4 motion-safe:animate-pulse" aria-hidden="true" />{ar ? 'جارٍ فتح الميكروفون…' : 'Opening microphone…'}
              </span>
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
            {/*
              * «اختبر حفظك»: تُحجب الكلماتُ بظلالها، وتنكشف كلُّ كلمةٍ حين تُتلى.
              * زرٌّ واحدٌ يُفهم من اسمه — والتلميحُ بجانبه حين يُحتاج، ويُعدّ.
              */}
            {analysed && (stage === 'ready' || stage === 'reciting') && (
              <button onClick={() => setVeiled(v => !v)} aria-pressed={veiled} data-veil={veiled ? 'on' : 'off'}
                className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-xs font-black transition ${veiled ? 'border-[#b89a55] bg-[#f6eed8] text-[#6b4f18]' : 'border-[#cfd6d2] bg-white text-[#214C40]'}`}>
                {veiled ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
                {veiled ? (ar ? 'أظهِر الصفحة' : 'Show the page') : (ar ? 'اختبر حفظك' : 'Test your memory')}
              </button>
            )}
            {veiled && stage === 'reciting' && (
              <button onClick={giveHint} data-hint-count={hints}
                className="inline-flex items-center gap-2 rounded-2xl border border-[#e2d3ae] bg-[#fffaf0] px-4 py-2.5 text-xs font-black text-[#7a5a1c]">
                <Lightbulb className="h-4 w-4" aria-hidden="true" />{ar ? 'تلميح' : 'Hint'}
                {hints > 0 && <span className="tabular-nums opacity-70">{ar ? `(${hints})` : `(${hints})`}</span>}
              </button>
            )}
            {stage === 'report' && (
              <button onClick={() => void draw(`${owner}:${Date.now()}`)}
                className="inline-flex items-center gap-2 rounded-2xl border border-[#cfd6d2] bg-white px-5 py-2.5 text-xs font-black text-[#214C40]">
                <RotateCcw className="h-4 w-4" aria-hidden="true" />{ar ? 'وجهٌ آخر' : 'Another face'}
              </button>
            )}
          </div>

          {slips.length > 0 && (stage === 'reciting' || stage === 'report') && (
            <div className="space-y-2" data-similar-slips={slips.length}>
              {(stage === 'reciting' ? slips.slice(-1) : slips).map(slip => <SimilarSlipCard key={slip.wordIndex} slip={slip} ar={ar} />)}
            </div>
          )}

          <MushafFaceSurface
            ar={ar}
            page={face.page}
            deliveryReading={deliveryReading}
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
            notes={stage === 'report' ? tashkeel.findings : undefined}
            live={stage === 'reciting' || stage === 'analysing' || ((stage === 'ready' || stage === 'asking') && veiled)
              ? { cursor: stage === 'reciting' ? pen : null, reached, veiled: veiled && stage !== 'analysing', hint }
              : undefined}
          />

          {gateNote && (
            <p className="text-center text-[10px] leading-5 text-[#6b716d]" data-judging-gate={gate?.word ?? 'UNKNOWN'}>{gateNote}</p>
          )}

          {stage === 'report' && (
            <TashkeelReport
              ar={ar}
              state={tashkeel}
              wordOf={index => { const w = face.words[index]; return w ? { text: w.text, ayah: w.ayah } : undefined; }}
              onRetry={() => void reviewTashkeel()}
              canListen={index => wordTimes.current.has(index)}
              onListen={listenAt}
              canHearReference={index => referenceOf(index) !== null}
              onHearReference={hearReference}
              retake={retake}
              onRetake={u => void startRetake(u)}
              onRetakeStop={stopRetake}
            />
          )}

          {stage === 'report' && hints > 0 && (
            <p className="text-center text-[11px] font-bold leading-5 text-[#7a5a1c]" data-hints-used={hints}>
              {ar ? `استعنتَ بـ${hints} ${hints === 1 ? 'تلميح' : 'تلميحات'} في هذا الوجه.` : `You used ${hints} hint${hints === 1 ? '' : 's'} on this face.`}
            </p>
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
