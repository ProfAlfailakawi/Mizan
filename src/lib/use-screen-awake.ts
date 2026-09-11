import { useEffect } from 'react';

/*
 * إبقاء شاشة القاعة مستيقظة.
 *
 * لوحةُ نداءٍ تُطفئ نفسها بعد دقيقتين ليست لوحة نداء. التلفاز أو اللوح المعلّق في القاعة
 * يُخفت ثم ينام بإعداد الجهاز، فيقف المتسابق أمام شاشةٍ سوداء ويُنادى عليه فلا يعلم.
 *
 * `navigator.wakeLock` يمنع ذلك. وثلاثة أمور تجعل استعماله صحيحًا:
 *
 *   ١) **يُفقد القفل عند إخفاء الصفحة** — تبديل تبويب، إطفاء الشاشة يدويًا، تصغير النافذة.
 *      المتصفّح يحرّره ولا يعيده وحده، فيلزم طلبه من جديد عند العودة للظهور. هذا أكثر ما
 *      يُنسى في استعمال هذه الواجهة، وأثره أن تنام الشاشة بعد أول تبديلٍ للتبويب.
 *   ٢) **قد يُرفض الطلب** — بطارية منخفضة، أو صفحة غير ظاهرة، أو متصفّح لا يدعمه أصلًا
 *      (سفاري القديم وفَيرفُكس). الرفض حالةٌ طبيعية لا خطأ يُوقف الشاشة.
 *   ٣) **يجب أن يُحرَّر عند الخروج** — وإلّا بقي الجهاز مستيقظًا بعد إغلاق الشاشة.
 *
 * ولأن القفل لا يُطلب إلا بإيماءةٍ أو ظهور، فالنداء هنا عند أول تركيب وعند كل عودةٍ للظهور.
 */

type WakeLockSentinelLike = { released?: boolean; release: () => Promise<void> };

export function useScreenAwake(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined') return;
    const api = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!api?.request) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || sentinel || document.visibilityState !== 'visible') return;
      try { sentinel = await api.request('screen'); }
      catch { /* بطارية منخفضة أو صفحة غير ظاهرة — الشاشة تعمل، وتنام كما يشاء الجهاز. */ }
      /* إبطالٌ سبق وصول الوعد: حرّر فورًا بدل أن يبقى الجهاز مستيقظًا بعد إغلاق الشاشة. */
      if (cancelled && sentinel) { void sentinel.release().catch(() => {}); sentinel = null; }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
      else sentinel = null; /* حرّره المتصفّح عند الإخفاء؛ لا نمسك مرجعًا ميتًا. */
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel) { void sentinel.release().catch(() => {}); sentinel = null; }
    };
  }, [active]);
}
