import { useEffect, useRef } from 'react';

/*
 * نشر إسقاط شاشات القاعة.
 *
 * جهازٌ واحد يدير المسابقة ينشر ما تعرضه كل الشاشات. هذا ما يجعل الشاشة **بلا امتياز**:
 * لا حساب، ولا جلسة، ولا صلاحية قراءةٍ لسجلّ المتسابقين على جهازٍ معلّقٍ في ممرّ.
 *
 * والمسألة التي تحكم إيقاع النشر ليست الكلفة بل **الصدق**:
 *
 * الشاشة تعلن توقّفها حين يتجاوز عمر الإسقاط حدًّا — وهذه ميزة لا عطب. فلو نُشر عند
 * التغيّر وحده لصارت قاعةٌ هادئة عشر دقائق (وهي حالة طبيعية تمامًا: لجانٌ تعمل وطابورٌ
 * لم يتحرّك) تُظهر على كل شاشة «التحديث متوقف» وهو يعمل. وكذبةٌ في الاتجاه المعاكس.
 *
 * فالنشر هنا على إيقاعين: **فورًا عند تغيّر المعروض**، و**نبضةٌ هادئة** وإن لم يتغيّر شيء
 * تبقي الختم الزمني حيًّا دون الحدّ الذي تُعلن عنده الشاشة تأخّرها.
 */

/** كل هذه المدة يُفحص المعروض: تغيّر ⇒ نشرٌ فوري. */
const POLL_MS = 5_000;
/**
 * أقصى صمت قبل نبضةٍ تُجدّد الختم. أقلّ من `BOARD_LAGGING_MS` (٣٠ث) بهامشٍ يحتمل
 * تباطؤ المؤقّتات في تبويبٍ خلفي — فلا تُعلن شاشةٌ تأخّرًا لا وجود له.
 */
const HEARTBEAT_MS = 20_000;

interface BoardPublisherPort {
  /** ما سيُعرض الآن، لمقارنته بما نُشر. */
  currentDisplayBoard: () => unknown;
  publishDisplayBoard: () => Promise<{ ok: boolean; reason: string }>;
}

/** بصمة المعروض دون ختمه الزمني: الختم يتغيّر كل مرّة، فمقارنته تجعل كل فحصٍ «تغيّرًا». */
function contentSignature(board: unknown): string {
  try {
    const { generatedAt, ...rest } = (board || {}) as Record<string, unknown>;
    void generatedAt;
    return JSON.stringify(rest);
  } catch { return '' }
}

export function useBoardPublisher(active: boolean, store: BoardPublisherPort): void {
  /* المخزن يُعاد بناؤه كل رسم؛ المرجع يبقي المؤقّت على آخر نسخة بلا إعادة جدولة. */
  const portRef = useRef(store);
  portRef.current = store;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let lastSignature = '';
    let lastPublishedAt = 0;
    /* نشرٌ معلّق لا يُطلق نشرًا آخر فوقه: شبكةٌ بطيئة كانت تُكدّس الطلبات. */
    let inFlight = false;

    const tick = async () => {
      if (cancelled || inFlight) return;
      const signature = contentSignature(portRef.current.currentDisplayBoard());
      const silentFor = Date.now() - lastPublishedAt;
      if (signature === lastSignature && silentFor < HEARTBEAT_MS) return;

      inFlight = true;
      try {
        const out = await portRef.current.publishDisplayBoard();
        if (cancelled) return;
        /* الفشل لا يُثبِّت البصمة: المحاولة تُعاد في الدورة التالية بدل أن تُبتلع بصمت. */
        if (out.ok) { lastSignature = signature; lastPublishedAt = Date.now(); }
      } catch { /* النشر لا يُفشل شاشةً ولا جلسة. */ }
      finally { inFlight = false; }
    };

    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [active]);
}
