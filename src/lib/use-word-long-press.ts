import { useCallback, useEffect, useRef } from 'react';
import { wordAtPoint } from './word-hit';

/*
 * ضغطةٌ مطوّلة على كلمة — المحكّم يلمس الكلمة التي أخطأ عندها القارئ.
 *
 * الضغطةُ المطوّلة تختلف عن النقر والتمرير: لا تُحسب إلا إذا ثبتت الإصبعُ مدّة العتبة دون
 * أن تتحرّك أكثر من بضع بكسلات، وتُلغى إذا بدأ تمريرٌ أو رُفعت الإصبع قبل العتبة. فلا تُسجَّل
 * علامةٌ من لمسةٍ عابرة أثناء تمرير الصفحة — وكل علامةٍ تُخصم من درجة متسابق.
 */

export interface LongPressWordHit { surah: number; ayah: number; word: number; text: string }

/* أقلُّ ما نقرؤه من حدث المؤشّر: يغني عن نوع React ويُختبر بكائنٍ عاديّ. */
interface PointerLike { clientX: number; clientY: number; pointerType?: string; button?: number }

export const LONG_PRESS_MS = 450;
export const LONG_PRESS_SLOP_PX = 10;

/**
 * متتبّعُ الضغطة المطوّلة — منطقُ التوقيت وحده، بلا React ولا DOM.
 *
 * `down` يبدأ العدّ، و`move` يُلغيه إن تجاوزت الإصبعُ الحدّ (تمريرٌ لا ضغطة)، و`cancel`
 * يُلغيه برفع الإصبع. ولا يُطلَق `onFire` إلا مرةً واحدة لكل ضغطة، وفي الإحداثيات الأولى.
 */
export function createLongPressTracker(onFire: (x: number, y: number) => void, ms = LONG_PRESS_MS, slop = LONG_PRESS_SLOP_PX) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let origin: { x: number; y: number } | null = null;
  const cancel = () => { if (timer !== null) clearTimeout(timer); timer = null; origin = null; };
  return {
    down(x: number, y: number) {
      cancel();
      origin = { x, y };
      timer = setTimeout(() => { timer = null; const o = origin; origin = null; if (o) onFire(o.x, o.y); }, ms);
    },
    move(x: number, y: number) { if (origin && Math.hypot(x - origin.x, y - origin.y) > slop) cancel(); },
    cancel,
    get pending() { return timer !== null; },
  };
}

export function useWordLongPress(opts: {
  enabled: boolean;
  surah?: number;
  /** نصّ الآية كما عُرض، أو undefined إن لم تكن من آيات المقطع. */
  ayahText: (ayah: number) => string | undefined;
  onHit: (hit: LongPressWordHit) => void;
  ms?: number;
}) {
  const latest = useRef(opts);
  latest.current = opts;
  const tracker = useRef<ReturnType<typeof createLongPressTracker> | null>(null);
  if (!tracker.current) {
    tracker.current = createLongPressTracker((x, y) => {
      const cur = latest.current;
      if (!cur.enabled || !cur.surah) return;
      const el = document.elementFromPoint(x, y)?.closest('[data-ayah]');
      const ayah = el ? Number(el.getAttribute('data-ayah')) : NaN;
      const text = Number.isInteger(ayah) ? cur.ayahText(ayah) : undefined;
      if (!el || !text) return;
      const hit = wordAtPoint(el, text, x, y);
      if (!hit) return;
      try { navigator.vibrate?.(15); } catch { /* اهتزازٌ غير متاح */ }
      cur.onHit({ surah: cur.surah, ayah, word: hit.word, text: hit.text });
    }, opts.ms);
  }
  const t = tracker.current;
  const cancel = useCallback(() => t.cancel(), [t]);
  useEffect(() => cancel, [cancel]);

  const onPointerDown = useCallback((e: PointerLike) => {
    const o = latest.current;
    if (!o.enabled || !o.surah || (e.pointerType === 'mouse' && e.button !== 0)) return;
    t.down(e.clientX, e.clientY);
  }, [t]);
  const onPointerMove = useCallback((e: PointerLike) => t.move(e.clientX, e.clientY), [t]);
  /* الضغطةُ المطوّلة تفتح في المتصفّح قائمةَ نسخٍ وتحديدَ نصّ؛ نمنعها حيث نُصغي للضغطة. */
  const onContextMenu = useCallback((e: { preventDefault: () => void }) => {
    if (latest.current.enabled) e.preventDefault();
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp: cancel, onPointerCancel: cancel, onPointerLeave: cancel, onContextMenu };
}
