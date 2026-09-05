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
// After the splash has played once this session, staff reopening the tablet get a brief
// courtesy frame instead of the full assembly. Long enough to read as intentional, short
// enough not to be friction.
const SEEN_HOLD_MS = 800;
const SEEN_KEY = 'mizan_splash_seen';

const wasSeen = (): boolean => {
  try { return sessionStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
};
const markSeen = (): void => {
  try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode — replay full next time */ }
};

export const SplashExperience: React.FC<{onDone: () => void}> = ({onDone}) => {
  const [leaving, setLeaving] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const exit = reduced ? 0 : EXIT_MS;
    const hold = reduced ? REDUCED_HOLD_MS : wasSeen() ? SEEN_HOLD_MS : HOLD_MS;

    // Mark seen as soon as the splash mounts, so any reload mid-sequence also gets the short frame.
    markSeen();

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

  // Touch tablets have no keyboard, so a tap anywhere on the splash must also dismiss it.
  const skipOnPointer = () => { setLeaving(true); const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; window.setTimeout(() => done.current(), reduced ? 0 : EXIT_MS); };

  return (
    <div
      className={`mizan-splash ${leaving ? 'mizan-splash-leaving' : ''}`}
      dir="rtl"
      role="status"
      aria-label="جاري فتح ميزان"
      onPointerDown={skipOnPointer}
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
