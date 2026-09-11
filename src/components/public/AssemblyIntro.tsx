import React, { useEffect, useState } from 'react';
import { Award, BadgeCheck, Gavel, Plus, ShieldCheck, UserRound } from 'lucide-react';
import { MizanMark } from '../design-system/MizanLogo';

/*
 * ExperienceHub signature overture — «الميزان يتزن» (the scale balances), ~3.2s.
 *
 * A full-viewport veil. An abstract balance scale — a beam and two pans, drawn
 * as simple strokes in the site's palette — appears centered. The six moments
 * of a MIZAN competition (registration, participant, judging, integrity,
 * results, certificate) descend gracefully into the two pans; the beam tips
 * under their arrival and rebalances with a weighted, spring-like settle. At
 * the exact instant of perfect equilibrium the composition fuses into the
 * MIZAN mark; a calm beat, then the veil lifts. The symbolism is the brand
 * name itself.
 *
 * Runs once per SESSION (sessionStorage). Transform + opacity only — SVG
 * stroke drawing included — so it stays on the compositor (see "MIZAN overture
 * — الميزان يتزن" in src/index.css). Under prefers-reduced-motion or
 * html[data-mizan-motion="reduced"] the overlay never mounts.
 *
 * Public marketing surface only. Never used by JudgeOS / CommandCenter /
 * operational screens.
 */

const SEEN_KEY = 'mizan-overture-seen';
const TOTAL_MS = 3250;

/* Six chips, three per pan. dx/dy are offsets from the pan's resting center. */
const CHIPS: Array<{
  icon: React.ComponentType<{ className?: string }>;
  side: -1 | 1;      // -1 left pan, +1 right pan
  dx: number; dy: number;
  delay: number;     // descent stagger (ms)
}> = [
  { icon: Plus,        side: -1, dx: -15, dy: 3,  delay: 0 },
  { icon: UserRound,   side: 1,  dx: 15,  dy: 3,  delay: 110 },
  { icon: Gavel,       side: -1, dx: 15,  dy: 3,  delay: 220 },
  { icon: ShieldCheck, side: 1,  dx: -15, dy: 3,  delay: 330 },
  { icon: Award,       side: -1, dx: 0,   dy: -9, delay: 440 },
  { icon: BadgeCheck,  side: 1,  dx: 0,   dy: -9, delay: 550 },
];

const PAN_X = 86;  // px from center to each pan's center
const PAN_Y = 46;  // px from center down to the pans

function reducedMotion(): boolean {
  try {
    return (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.dataset.mizanMotion === 'reduced'
    );
  } catch {
    return false;
  }
}

function seenThisSession(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen(): void {
  try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode */ }
}

export const AssemblyIntro: React.FC = () => {
  const [show, setShow] = useState(() => !reducedMotion() && !seenThisSession());
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!show) return;
    markSeen();
    const t = window.setTimeout(() => setShow(false), TOTAL_MS);
    return () => window.clearTimeout(t);
  }, [show]);

  if (!show) return null;

  const skip = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => setShow(false), 240);
  };

  return (
    <div
      aria-hidden={leaving || undefined}
      className={`mz-ovt-veil fixed inset-0 z-[70] bg-[#F7F5EF] pointer-events-none overflow-hidden${leaving ? ' mz-ovt-veil--skip' : ''}`}
    >
      <div aria-hidden="true" className="absolute inset-0 grid place-items-center">
        <div className="relative">
          {/* The scale + its cargo: one rigid body that tips and rebalances. */}
          <div className="mz-ovt-scale relative w-[280px] h-[220px] sm:w-[320px] sm:h-[240px]">
            <div className="mz-ovt-tilt absolute inset-0">
              {/* Abstract balance scale — simple elegant strokes. */}
              <svg
                className="absolute inset-0 w-full h-full"
                viewBox="0 0 280 220"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <g stroke="#214C40" strokeWidth="2.5" strokeLinecap="round">
                  {/* beam */}
                  <path className="mz-ovt-stroke" pathLength={1} d="M54 64H226" />
                  {/* finial above the fulcrum */}
                  <path className="mz-ovt-stroke mz-ovt-stroke-2" pathLength={1} d="M140 64V46" />
                  {/* suspension cords */}
                  <path className="mz-ovt-stroke mz-ovt-stroke-2" pathLength={1} d="M54 64v42M226 64v42" />
                </g>
                <g stroke="#B98B4E" strokeWidth="2.5" strokeLinecap="round">
                  {/* the two pans — shallow crescents */}
                  <path className="mz-ovt-stroke mz-ovt-stroke-3" pathLength={1} d="M22 106c4 18 16 28 32 28s28-10 32-28" />
                  <path className="mz-ovt-stroke mz-ovt-stroke-3" pathLength={1} d="M194 106c4 18 16 28 32 28s28-10 32-28" />
                </g>
                {/* diamond finial cap, echoing the mark's finial */}
                <path className="mz-ovt-finial" d="M140 36l5 8-5 8-5-8Z" fill="#B98B4E" />
              </svg>

              {/* The six moments descend into the pans. */}
              {CHIPS.map(({ icon: Icon, side, dx, dy, delay }, i) => (
                <span
                  key={i}
                  className="mz-ovt-chip absolute top-1/2 left-1/2 w-[40px] h-[40px] -mt-5 -ml-5 rounded-xl border border-[#DFDED7] bg-[#FFFEFB] grid place-items-center text-[#214C40] shadow-[0_1px_2px_rgba(23,27,24,.06)]"
                  style={{
                    '--mzx': `${side * PAN_X + dx}px`,
                    '--mzy': `${PAN_Y + dy}px`,
                    '--mzd': `${delay}ms`,
                  } as React.CSSProperties}
                >
                  <Icon className="w-[18px] h-[18px]" />
                </span>
              ))}
            </div>
          </div>

          {/* Equilibrium: the composition fuses into the mark. */}
          <div className="absolute inset-0 grid place-items-center">
            <MizanMark className="mz-ovt-mark w-24 h-24 sm:w-28 sm:h-28" decorative />
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={skip}
        className="mz-ovt-skip absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto px-5 py-2 rounded-full border border-[#DFDED7] bg-[#FFFEFB]/80 text-[13px] text-[#6B7069] hover:text-[#214C40] hover:border-[#C9C7BC] transition-colors"
      >
        تخطي
      </button>
    </div>
  );
};
