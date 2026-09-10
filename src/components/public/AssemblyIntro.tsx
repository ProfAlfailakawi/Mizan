import React, { useEffect, useState } from 'react';
import { Award, BadgeCheck, Gavel, Plus, ShieldCheck, UserRound } from 'lucide-react';
import { MizanMark } from '../design-system/MizanLogo';

/*
 * ExperienceHub entry choreography — a once-per-entry, ~2.7s overture.
 *
 * Six fragments stand for the six moments of a MIZAN competition —
 * registration, the participant, judging, integrity, results and the
 * certificate. They drift in scattered, glide to a ring with premium easing,
 * then converge and give way to the MIZAN mark; the veil lifts and the page
 * beneath is revealed. Transform + opacity only (see "MIZAN assembly
 * choreography" in src/index.css).
 *
 * Under prefers-reduced-motion (or the in-app reduced-motion profile) the
 * overlay never mounts: the page shows its final state immediately.
 */

const FRAGMENTS: Array<{
  icon: React.ComponentType<{ className?: string }>;
  sx: string; sy: string; sr: string; // scattered start (transform offsets)
  angle: number;                      // seat on the assembly ring
  delay: number;
}> = [
  { icon: Plus,       sx: '-150px', sy: '-120px', sr: '-14deg', angle: -90,  delay: 0 },
  { icon: UserRound,  sx: '160px',  sy: '-100px', sr: '10deg',  angle: -30,  delay: 70 },
  { icon: Gavel,      sx: '180px',  sy: '90px',   sr: '-8deg',  angle: 30,   delay: 140 },
  { icon: ShieldCheck,sx: '30px',   sy: '170px',  sr: '12deg',  angle: 90,   delay: 40 },
  { icon: Award,      sx: '-170px', sy: '110px',  sr: '-11deg', angle: 150,  delay: 110 },
  { icon: BadgeCheck, sx: '-190px', sy: '-20px',  sr: '9deg',   angle: 210,  delay: 170 },
];

const RING = 104; // px radius of the pre-assembly ring

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

export const AssemblyIntro: React.FC = () => {
  const [show, setShow] = useState(() => !reducedMotion());
  useEffect(() => {
    if (!show) return;
    const t = window.setTimeout(() => setShow(false), 2750);
    return () => window.clearTimeout(t);
  }, [show]);
  if (!show) return null;

  return (
    <div
      aria-hidden="true"
      className="mz-assembly-veil fixed inset-0 z-[70] bg-[#F7F5EF] pointer-events-none overflow-hidden"
    >
      <div className="absolute inset-0 grid place-items-center">
        <div className="relative">
          <MizanMark className="mz-assembly-mark w-24 h-24 sm:w-28 sm:h-28" decorative />
          {FRAGMENTS.map(({ icon: Icon, sx, sy, sr, angle, delay }, i) => {
            const rad = (angle * Math.PI) / 180;
            const rx = Math.round(Math.cos(rad) * RING);
            const ry = Math.round(Math.sin(rad) * RING);
            return (
              <span
                key={i}
                className="mz-assembly-chip w-[54px] h-[54px] rounded-2xl border border-[#DFDED7] bg-[#FFFEFB] grid place-items-center text-[#214C40] shadow-[0_1px_2px_rgba(23,27,24,.06)]"
                style={{
                  '--mzsx': sx, '--mzsy': sy, '--mzsr': sr,
                  '--mzrx': `${rx}px`, '--mzry': `${ry}px`,
                  '--mzd': `${delay}ms`,
                } as React.CSSProperties}
              >
                <Icon className="w-5 h-5" />
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};
