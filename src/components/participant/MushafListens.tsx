import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Lightbulb, Mic, RotateCcw, Square } from 'lucide-react';

import { MushafFaceSurface, type FaceWord } from './MushafFaceSurface';
import { surahNameArabic } from '../judge/OfficialMushafSurface';
import { drawFace } from '../../../server/mushaf-face';
import type { FaceMark, FaceReading } from '../../lib/face-reading';
import { explainChoice, faceWeights, type FaceAttempt } from '../../lib/face-memory';
import {
  attemptFrom, faceNote, faceSupportsListening, judgingNote, listenableFaces, loadFaceAttempts, rememberFaceAttempt,
  reviewNote, serialQueue, type SerialQueue,
} from '../../lib/face-review';
import { answerKeepsPermission, finalJudgment, liveJudgment } from '../../lib/live-judging';
import {
  alertWindow, createAlertSpeaker, dropWordsUnderAlert, planAlert, EMPTY_ALERT_MEMORY,
  type AlertMemory, type AlertSpeaker, type SoundWindow,
} from '../../lib/recitation-alerts';
import type { ExpectedWord, HeardWord, Mistake } from '../../lib/recitation-diff';
import { quranSkeleton } from '../../lib/quran-orthography';
import { fetchDeliveryPassage, fetchDivergencePoints, type DivergencePoint } from '../../lib/kfgqpc-library';
import { SimilarSlipCard, type SimilarSlip } from './SimilarSlipCard';
import { faceWordLookup, readRecitation, SAMPLED_PATH_MARKS, settleRecitation, type FaceAlignmentSample } from '../../lib/face-session';
import {
  fetchPracticeFace, fetchPracticeFaceCatalogue,
  type PracticeFaceCatalogue, type PracticeFacePage,
} from '../../lib/practice-faces';
import {
  fetchPracticeJudgingGate, submitPracticeAlignmentChunk, submitPracticeRecognitionChunk,
  type JourneyPracticeAuth, type QuranJudgingGate, type QuranReadingId,
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

type Stage = 'loading' | 'ready' | 'asking' | 'reciting' | 'analysing' | 'report' | 'blocked';

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
  const [pen, setPen] = useState<number | null>(null);
  const [veiled, setVeiled] = useState(false);
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
  const advance = useCallback((index: number | null) => {
    if (index === null || index < 0) return;
    setPen(index);
    setReached(r => Math.max(r, index + 1));
  }, []);
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
  const chunkIndex = useRef(0);
  const startedAt = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  /** آخرُ لحظةٍ ثُبّت ما سُمع قبلها — النوافذُ متداخلة، والكلمةُ تُحسب مرّةً واحدة. */
  const committedUntil = useRef(0);
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
    const at = new Map(face.words.map(w => [`${w.surah}:${w.ayah}:${w.ayahWordIndex}`, w.index] as const));
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

  const draw = useCallback(async (seed: string) => {
    if (!deliveryReading || !candidates.length) return;
    /* وما بقي من طابور الوجه السابق يُترك قبل أن يُسحب وجهٌ جديد. */
    queue.current.abandon(); queue.current = serialQueue();
    recognition.current.abandon(); recognition.current = serialQueue();
    setStage('loading'); setReading(null); setNote(''); samples.current = []; setHeard(0); setReached(0); setPen(null); setHint(null); setHints(0); setSlips([]); setSeconds(0); setIncomplete(false);
    heardWords.current = []; alertMemory.current = EMPTY_ALERT_MEMORY; alertWindows.current = []; chunkIndex.current = 0;
    attemptJudging.current = null;
    setMistakes(undefined); setJudgingLost(false);
    const weightOf = faceWeights(attempts, Date.now());
    const picked = drawFace(candidates, seed, weightOf);
    if (!picked) { setStage('blocked'); setNote(ar ? 'لم يُسحب وجه.' : 'No face drawn.'); return; }
    try {
      const page = await fetchPracticeFace(deliveryReading, picked.page, journeyAuth);
      if (!alive.current) return;
      setFace(page);
      setChoice(explainChoice(page.page, attempts, Date.now(), ar));
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
    queue.current.abandon(); recognition.current.abandon(); stopAudio();
    speaker.current?.close(); speaker.current = null;
  }, [stopAudio]);

  const begin = useCallback(async () => {
    if (!face) return;
    samples.current = []; setHeard(0); setReached(0); setPen(null); setHint(null); setHints(0); setSlips([]); setSeconds(0); setNote(''); setIncomplete(false);
    heardWords.current = []; alertMemory.current = EMPTY_ALERT_MEMORY; alertWindows.current = []; chunkIndex.current = 0;
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
      committedUntil.current = 0;
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
         * نافذةُ السماع: الترويسةُ ثمّ آخرُ ثلاثة مقاطع (نحو ست ثوانٍ).
         *
         * المقطعُ وحده (ثانيتان) يقطع الكلمةَ عند حدّه فيسمعها المحرّكُ خطأً، فيُقال للطالب
         * «أخطأت» وهو مصيب. فيُسمع في سياقه، ولا يُثبَّت إلا ما استقرّ قبل حافّة النافذة.
         */
        const first = Math.max(1, index - 2);
        const windowParts = index === 0 ? [chunk] : [all[0], ...all.slice(first, index + 1)];
        const windowStartMs = index === 0 ? 0 : first * CHUNK_MS;
        const windowEndMs = (index + 1) * CHUNK_MS;
        const windowBlob = new Blob(windowParts, { type: chunk.type || all[0].type });
        const windowHeadBytes = index === 0 ? 0 : all[0].size;
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
        queue.current.push(async live => {
          const out = await submitPracticeAlignmentChunk({
            blob: listenable, reading: listening.reading, sourcePackageId: listening.sourcePackageId,
            surah: face.surahStart, startAyah: face.ayahStart, endAyah: face.ayahEnd,
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
          advance(lookupRef.current({ surah: out.surah, ayah: out.ayah, wordIndex: out.wordIndex, alignmentState: out.alignmentState }));
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
        if (attemptJudging.current) {
          recognition.current.push(async live => {
            const permission = attemptJudging.current;
            if (!permission) return;
            const out = await submitPracticeRecognitionChunk({
              blob: windowBlob, headBytes: windowHeadBytes, reading: listening.reading, sourcePackageId: listening.sourcePackageId,
            }, journeyAuth);
            if (!alive.current || !live()) return;
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
            const hold = finalChunk ? 0 : 1200;
            const timed: HeardWord[] = [];
            for (const w of out.words) {
              if (w.startMs === undefined || w.endMs === undefined) continue;
              const startMs = windowStartMs + w.startMs, endMs = windowStartMs + w.endMs;
              if (startMs < committedUntil.current - 80 || endMs > windowEndMs - hold) continue;
              timed.push({ text: w.text, confidence: w.confidence, startMs, endMs });
              committedUntil.current = Math.max(committedUntil.current, endMs);
            }
            /* وما سُمع تحت نغمةٍ يُطرح: الميكروفونُ خام، فيلتقط صدى التنبيه كلمةً. */
            const { kept } = dropWordsUnderAlert(timed, alertWindows.current, text => faceSkeletonsRef.current.has(quranSkeleton(text)));
            heardWords.current = [...heardWords.current, ...kept];

            const judged = liveJudgment(expectedRef.current, heardWords.current, permission);
            /* وجبهةُ السماع أدقُّ شاهدٍ على الموضع: ما قاله فعلًا لا ما يُظنّ أنّه بلغه. */
            if (judged.frontier > 0) advance(judged.frontier - 1);
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
    if (attemptJudging.current && !(await recognition.current.drain())) {
      /*
       * ويُترك الطابورُ لا الإذنُ وحده: فالمهمّةُ الجاريةُ التقطت إذنَها قبل أن تنتظر،
       * فإن عاد جوابُها بعد المهلة كتب أخطاءً ونغّم بعد أن قيل للطالب «لم يُحكم».
       */
      recognition.current.abandon();
      attemptJudging.current = null;
      setJudgingLost(true);
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
    /* وتلاوةٌ لم يصل بعضُها تُقال ناقصةً، ولا تُعرض وكأنّها تامّة. */
    setIncomplete(!settled.complete);
    setStage('report');
    if (settled.attempt) setAttempts(rememberFaceAttempt(owner, deliveryReading || '', settled.attempt));
  }, [face, owner, deliveryReading, stopAndRelease]);

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
              <button onClick={() => void begin()} data-listens="yes"
                className="inline-flex items-center gap-2 rounded-2xl bg-[#214C40] px-5 py-2.5 text-xs font-black text-white">
                <Mic className="h-4 w-4" aria-hidden="true" />
                {ar ? 'ابدأ التلاوة' : 'Begin reciting'}
              </button>
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
            live={stage === 'reciting' || stage === 'analysing' || (stage === 'ready' && veiled)
              ? { cursor: stage === 'reciting' ? pen : null, reached, veiled: veiled && stage !== 'analysing', hint }
              : undefined}
          />

          {gateNote && (
            <p className="text-center text-[10px] leading-5 text-[#6b716d]" data-judging-gate={gate?.word ?? 'UNKNOWN'}>{gateNote}</p>
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
