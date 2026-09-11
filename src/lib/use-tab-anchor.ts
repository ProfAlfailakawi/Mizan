import { useEffect, useRef } from 'react';

/*
 * تبديل التبويب كان يُبقي موضع التمرير كما هو: تنتقل من قسمٍ طويل إلى قسمٍ قصير فتجد نفسك
 * في منتصف محتوى لم تطلبه — يضغط المستخدم «التجارة» فيجد نفسه أمام «النطاق». الرابط هنا
 * يعيد التبويب نفسه إلى أعلى النافذة عند كل تبديل، فيبدأ القسم الجديد من أوله كما يتوقّع.
 */
export function useTabAnchor<T>(active: T) {
  const ref = useRef<HTMLDivElement | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const node = ref.current;
    if (!node || typeof window === 'undefined') return;
    const top = node.getBoundingClientRect().top + window.scrollY - 96; // تحت الترويسة اللاصقة
    if (window.scrollY <= top) return; // القسم ظاهر أصلًا من أوله
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' });
  }, [active]);
  return ref;
}
