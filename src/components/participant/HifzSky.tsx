import React, { useMemo } from 'react';
import { arabicIndicDigits } from '../judge/AyahMark';
import { JUZ_START_PAGES, type PageState } from '../../lib/hifz-journey';

/*
 * «سماء المصحف» — عرضٌ بديل لخريطة رحلة الحفظ نفسها.
 *
 * كل صفحةٍ نجمةٌ في موضعٍ ثابت (لا نصّ قرآنيّ هنا أبدًا، مواضع فقط)، وكل جزءٍ كوكبة.
 * الصفحة المتينة نجمةٌ مضيئة، وما يحتاج مراجعة أخفت، والضعيفة جمرة، وما لم يُتلَ غبار.
 * وحين تتّصل نجوم الجزء المتينة تُرسم خطوطه، فإذا اكتمل الجزء كلّه صارت كوكبته ذهبية.
 * البيانات هي `pageMemory` التي تقرؤها الخريطة، فلا يفترق العرضان.
 */

const COLS = 6;
const CELL = 100;

type Star = { page: number; x: number; y: number; state: PageState | 'none' };

/** موضع الصفحة داخل كوكبة جزئها: دوّامةٌ ثابتة، فلا تتبدّل السماء بين زيارة وأخرى. */
function layout(rtl: boolean): { juz: number; cx: number; cy: number; pages: { page: number; x: number; y: number }[] }[] {
  return JUZ_START_PAGES.map((start, k) => {
    const end = k + 1 < JUZ_START_PAGES.length ? JUZ_START_PAGES[k + 1] - 1 : 604;
    const col = k % COLS;
    const row = Math.floor(k / COLS);
    const cx = (rtl ? COLS - 1 - col : col) * CELL + CELL / 2;
    const cy = row * CELL + CELL / 2;
    const n = end - start + 1;
    const pages = Array.from({ length: n }, (_, j) => {
      /* دوّامةٌ متّصلة: الصفحة التالية جارةُ سابقتها، فتُقرأ الكوكبة خطًّا واحدًا يلتفّ. */
      const r = 7 + 33 * ((j + 0.5) / n);
      const a = j * 0.92 + k * 0.7;
      return { page: start + j, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    });
    return { juz: k + 1, cx, cy, pages };
  });
}

export const HifzSky: React.FC<{ ar: boolean; memory: Map<number, { state: PageState }>; current?: number }> = ({ ar, memory, current }) => {
  const groups = useMemo(() => layout(ar), [ar]);
  const n = (x: number) => (ar ? arabicIndicDigits(x) : String(x));
  const strongTotal = useMemo(() => [...memory.values()].filter(m => m.state === 'strong').length, [memory]);
  const complete = groups.filter(g => g.pages.every(p => memory.get(p.page)?.state === 'strong')).length;
  const label = ar
    ? `سماء المصحف: ${n(strongTotal)} صفحة متينة من ٦٠٤، و${n(complete)} جزءًا مكتملًا من ٣٠`
    : `Mushaf sky: ${strongTotal} of 604 pages solid, ${complete} of 30 juz complete`;

  return (
    <figure className="mz-vw-sky" data-hifz-sky>
      <svg viewBox={`0 0 ${COLS * CELL} ${5 * CELL}`} role="img" aria-label={label} className="block h-auto w-full">
        {groups.map(g => {
          const stars: Star[] = g.pages.map(p => ({ ...p, state: memory.get(p.page)?.state ?? 'none' }));
          const done = stars.every(s => s.state === 'strong');
          const lit = stars.filter(s => s.state === 'strong');
          return (
            <g key={g.juz} className={`mz-vw-constellation${done ? ' is-complete' : ''}`} style={{ '--mz-vw-i': g.juz } as React.CSSProperties}>
              {lit.length > 1 && <polyline className="mz-vw-sky-line" points={lit.map(s => `${s.x.toFixed(1)},${s.y.toFixed(1)}`).join(' ')} />}
              {stars.map(s => (
                <circle key={s.page} cx={s.x.toFixed(1)} cy={s.y.toFixed(1)}
                  r={s.state === 'strong' ? 2.6 : s.state === 'review' ? 2 : s.state === 'weak' ? 1.8 : 1}
                  className={`mz-vw-star is-${s.state}${s.page === current ? ' is-current' : ''}`} />
              ))}
              <text x={g.cx} y={g.cy + CELL / 2 - 4} textAnchor="middle" className="mz-vw-sky-juz">{n(g.juz)}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mizan-journey__hint">
        {ar
          ? `${n(strongTotal)} نجمة مضيئة · ${n(complete)} كوكبة مكتملة. كل نجمة صفحة، وكل كوكبة جزء.`
          : `${strongTotal} bright stars · ${complete} complete constellations. Each star is a page, each constellation a juz.`}
      </figcaption>
    </figure>
  );
};
