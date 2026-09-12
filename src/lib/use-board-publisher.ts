import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  POLL_MS, decidePublish, observeLease,
  type LeaseDecision, type LeaseWatch, type PublishedLease,
} from './board-lease';

/*
 * نشر إسقاط شاشات القاعة.
 *
 * أجهزةُ الإدارة تنشر ما تعرضه كل الشاشات. هذا ما يجعل الشاشة **بلا امتياز**: لا حساب،
 * ولا جلسة، ولا صلاحية قراءةٍ لسجلّ المتسابقين على جهازٍ معلّقٍ في ممرّ.
 *
 * وكان النشر معلّقًا بتبويبٍ واحد: يُغلق فتتوقّف عشرُ شاشاتٍ معًا. فصار كلُّ جهازٍ مؤهَّل
 * مرشَّحًا: واحدٌ ينشر، والبقيّة تراقب صامتة — لا تكتب شيئًا — فإن جمد ختمُ الناشر تولّى
 * أقربُها. وقواعدُ التناوب كلّها في `board-lease` مفصولةً عن الأثر، فتُختبر بلا شبكة.
 *
 * والمسألة التي تحكم إيقاع النشر ليست الكلفة بل **الصدق**: الشاشة تعلن توقّفها حين يتجاوز
 * عمر الإسقاط حدًّا — وهذه ميزة لا عطب. فلو نُشر عند التغيّر وحده لصارت قاعةٌ هادئة عشر
 * دقائق (لجانٌ تعمل وطابورٌ لم يتحرّك) تُظهر على كل شاشة «التحديث متوقف» وهو يعمل. فالنشر
 * على إيقاعين: فورًا عند تغيّر المعروض، ونبضةٌ هادئة تبقي الختم حيًّا.
 */

interface BoardPublisherPort {
  /** ما سيُعرض الآن، لمقارنته بما نُشر. */
  currentDisplayBoard: () => unknown;
  publishDisplayBoard: (publisherId?: string) => Promise<{ ok: boolean; reason: string }>;
  /** توقيع آخر نشرٍ وحده — من كتبه وبأيّ ختم. */
  readBoardLease: () => Promise<PublishedLease | null>;
  /**
   * هل يملك هذا الجهاز النشر الآن. يُسأل في كل دورة لا مرّة واحدة: الدور يتغيّر، والاتصال
   * ينقطع ويعود، وجهازٌ فقد أهليّته يجب أن يصمت فورًا لا أن يظنّ نفسه ناشرًا.
   */
  canPublishDisplayBoard: () => boolean;
}

/** بصمة المعروض دون ختمه الزمني: الختم يتغيّر كل مرّة، فمقارنته تجعل كل فحصٍ «تغيّرًا». */
function contentSignature(board: unknown): string {
  try {
    const { generatedAt, ...rest } = (board || {}) as Record<string, unknown>;
    void generatedAt;
    return JSON.stringify(rest);
  } catch { return '' }
}

/**
 * هويّة هذا التبويب. تُولَّد مرّة عند التحميل ولا تُحفظ: تبويبان على الجهاز نفسه ناشران
 * محتملان مستقلّان، وحفظُها كان سيجعلهما هويّةً واحدة يتنازعان عقدها.
 */
function newPublisherId(): string {
  const rnd = globalThis.crypto?.randomUUID?.();
  return rnd || `pub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const IDLE: LeaseDecision = { publish: false, role: 'INELIGIBLE', reason: 'NOT_ELIGIBLE', publisherId: null, silentForMs: 0 };

/*
 * دور هذا الجهاز يُنشر على مستوى الوحدة لا عبر الشجرة.
 *
 * الناشر خطّافٌ واحدٌ يُستدعى في جذر التطبيق، والذي يحتاج أن يعرف دوره سطحٌ تشغيليّ بعيد
 * عن الجذر بطبقات. وتمرير القرار عبرها كان سيُدخل شجرة التطبيق كلها في إعادة رسمٍ كل
 * أربع ثوانٍ — ثمنٌ باهظ لسطرٍ واحد.
 */
let publisherStatus: LeaseDecision = IDLE;
const statusListeners = new Set<() => void>();
const setPublisherStatus = (next: LeaseDecision) => {
  if (publisherStatus === next) return;
  publisherStatus = next;
  statusListeners.forEach(fn => fn());
};

/** دور هذا الجهاز في نشر شاشات القاعة، لمن يعرضه. `INELIGIBLE` إن لم يكن ناشرًا أصلًا. */
export function useBoardPublisherStatus(): LeaseDecision {
  return useSyncExternalStore(
    (fn) => { statusListeners.add(fn); return () => { statusListeners.delete(fn) } },
    () => publisherStatus,
    () => IDLE,
  );
}

/** يُرجع دور هذا الجهاز في النشر، فتستطيع غرفة العمليات أن تقوله لمن يقف أمامها. */
export function useBoardPublisher(active: boolean, store: BoardPublisherPort): LeaseDecision {
  /* المخزن يُعاد بناؤه كل رسم؛ المرجع يبقي المؤقّت على آخر نسخة بلا إعادة جدولة. */
  const portRef = useRef(store);
  portRef.current = store;
  const selfIdRef = useRef<string>('');
  if (!selfIdRef.current) selfIdRef.current = newPublisherId();
  const [decision, setDecision] = useState<LeaseDecision>(IDLE);

  useEffect(() => {
    if (!active) { setDecision(IDLE); setPublisherStatus(IDLE); return }
    let cancelled = false;
    let watch: LeaseWatch | null = null;
    let publishedSignature = '';
    /* نشرٌ معلّق لا يُطلق نشرًا آخر فوقه: شبكةٌ بطيئة كانت تُكدّس الطلبات. */
    let inFlight = false;

    const tick = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        /* غير المؤهَّل لا يقرأ ولا يكتب: لا يكفي أن يُردَّ نشرُه، فلو قرأ «لا ناشر» لَظنّ
           نفسه ناشرًا وأخبر من أمامه أن الشاشات معلّقة بجهازه — وهي ليست. */
        if (!portRef.current.canPublishDisplayBoard()) {
          watch = null;
          setDecision(prev => (prev === IDLE ? prev : IDLE));
          setPublisherStatus(IDLE);
          return;
        }

        /* قراءةُ العقد أولًا: بها وحدها يعرف الاحتياطُ أن عليه أن يصمت — أو أن يتولّى. */
        const lease = await portRef.current.readBoardLease();
        if (cancelled) return;
        watch = observeLease(watch, lease, Date.now());

        const signature = contentSignature(portRef.current.currentDisplayBoard());
        const next = decidePublish({
          selfId: selfIdRef.current,
          eligible: true,
          watch,
          /* ناشرٌ غيري ⇒ لا معنى لمقارنة بصمتي: القرار عنده لا عندي. */
          contentChanged: watch?.publisherId === selfIdRef.current && signature !== publishedSignature,
          now: Date.now(),
        });
        setDecision(prev => {
          const settled = prev.role === next.role && prev.reason === next.reason && prev.publisherId === next.publisherId ? prev : next;
          setPublisherStatus(settled);
          return settled;
        });
        if (!next.publish) return;

        const out = await portRef.current.publishDisplayBoard(selfIdRef.current);
        if (cancelled) return;
        /* الفشل لا يُثبِّت البصمة ولا العقد: تُعاد المحاولة في الدورة التالية بدل أن تُبتلع. */
        if (out.ok) publishedSignature = signature;
        /* والعقد يُقرأ في الدورة القادمة من الوثيقة، لا يُفترض من نجاح الكتابة: لو سبقني
           غيري في اللحظة نفسها فالوثيقة وحدها تقول من فاز. */
      } catch { /* النشر لا يُفشل شاشةً ولا جلسة. */ }
      finally { inFlight = false; }
    };

    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [active]);

  return decision;
}
