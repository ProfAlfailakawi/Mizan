import React, { useEffect, useMemo, useRef, useState } from 'react';
import { JUZ_START_PAGES } from '../../lib/hifz-journey';

/*
 * «ختمة القاعة الحيّة» — ثلاثون جزءًا تمتلئ ذهبًا كلما أُتمّت التلاوات.
 *
 * يقرأ التجميع نفسه الذي تقرؤه لوحة «ختمة القاعة» (`board.recitation.pages`: عدد مرات تلاوة
 * كل صفحة اليوم)، فلا اسم ولا كود ولا موضعَ جلسةٍ جارية: نسبةٌ لكل جزء نحو الختمة التالية.
 * وحين يكتمل جزءٌ ينبض مرّةً واحدة. تقليل الحركة يعرض الامتلاء بلا نبض.
 */

export const HallJuzBar: React.FC<{ ar: boolean; pages: number[]; khatmatCompleted: number }> = ({ ar, pages, khatmatCompleted }) => {
  const next = khatmatCompleted + 1;
  const juz = useMemo(() => JUZ_START_PAGES.map((start, k) => {
    const end = k + 1 < JUZ_START_PAGES.length ? JUZ_START_PAGES[k + 1] - 1 : 604;
    let reached = 0;
    for (let p = start; p <= end; p++) if ((pages[p - 1] || 0) >= next) reached++;
    return reached / (end - start + 1);
  }), [pages, next]);

  /* النبض للجزء الذي اكتمل الآن فقط، لا لما كان مكتملًا عند فتح الشاشة. */
  const prev = useRef<boolean[] | null>(null);
  const [pulse, setPulse] = useState<Set<number>>(() => new Set());
  useEffect(() => {
    const done = juz.map(f => f >= 1);
    const was = prev.current;
    prev.current = done;
    if (!was) return;
    const fresh = done.flatMap((d, i) => (d && !was[i] ? [i] : []));
    if (!fresh.length) return;
    setPulse(new Set(fresh));
    const t = setTimeout(() => setPulse(new Set()), 2400);
    return () => clearTimeout(t);
  }, [juz]);

  const completed = juz.filter(f => f >= 1).length;
  return (
    <div className="mz-vw-juzbar mt-5" role="img"
      aria-label={ar ? `ختمة القاعة: ${completed} جزءًا من ٣٠ اكتمل نحو الختمة التالية` : `Hall khatma: ${completed} of 30 juz complete toward the next khatma`}>
      <div className="mb-2 flex items-center justify-between text-[11px] font-black mizan-venue-faint">
        <span>{ar ? 'الأجزاء الثلاثون' : '30 JUZ'}</span>
        <span className="text-[#e0c894] tabular-nums" dir="ltr">{completed}/30</span>
      </div>
      <div className="mz-vw-juzbar__track" aria-hidden="true">
        {juz.map((f, i) => (
          <span key={i} className={`mz-vw-juzbar__cell${f >= 1 ? ' is-done' : ''}`} data-pulse={pulse.has(i) ? '' : undefined}>
            <i style={{ height: `${Math.round(f * 100)}%` }} />
          </span>
        ))}
      </div>
    </div>
  );
};
