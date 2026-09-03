import React, {useEffect, useRef, useState} from 'react';
import {MizanMark, MizanWordmark} from '../design-system/MizanLogo';

/*
 * Launch splash.
 *
 * Was: a 941×1672 raster poster stretched with object-contain, so every landscape
 * viewport showed a portrait plate with visible seams, and its Arabic subtitle —
 * "نظام المسايقات القرآئية" — was misspelled into the pixels where nobody could fix it.
 *
 * Now: the brand mark assembles as vector geometry (arch → muṣḥaf → qalam → orb →
 * finial), the wordmark lifts in behind it, and the tagline is real, correctable text.
 * Nothing to download, sharp at any density, and the whole sequence collapses to a
 * static frame under prefers-reduced-motion.
 */

const HOLD_MS = 2450;
const EXIT_MS = 340;
const REDUCED_HOLD_MS = 700;

export const SplashExperience: React.FC<{onDone: () => void}> = ({onDone}) => {
  const [leaving, setLeaving] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const hold = reduced ? REDUCED_HOLD_MS : HOLD_MS;
    const exit = reduced ? 0 : EXIT_MS;

    const leave = window.setTimeout(() => setLeaving(true), hold);
    const finish = window.setTimeout(() => done.current(), hold + exit);

    // The splash is a courtesy, never a gate: any intent to proceed ends it early.
    const skip = () => { setLeaving(true); window.setTimeout(() => done.current(), exit); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') skip(); };
    window.addEventListener('keydown', onKey);

    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(finish);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div
      className={`mizan-splash ${leaving ? 'mizan-splash-leaving' : ''}`}
      dir="rtl"
      role="status"
      aria-label="جاري فتح ميزان"
    >
      <div className="mizan-splash-field" aria-hidden="true" />
      <div className="mizan-splash-halo" aria-hidden="true" />

      <div className="mizan-splash-stage">
        <MizanMark className="mizan-mark is-animated mizan-splash-mark" decorative />
        <div className="mizan-splash-word">
          <MizanWordmark language="ar" tagline="نظام المسابقات القرآنية" className="is-stacked" />
        </div>
      </div>

      <div className="mizan-splash-track" aria-hidden="true"><span /></div>
      <span className="sr-only">جاري فتح ميزان</span>
    </div>
  );
};
