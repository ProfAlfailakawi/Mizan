import * as React from 'react';
import { journeyAlreadyPlayed, journeyEffectiveThreshold, markJourneyPlayed } from './useJourneyReveal';

/*
 * Calm one-shot motion primitives for the DNA kit: first-view draw, count-up and change highlight.
 *
 * Rules shared by all three (they reuse the journey's play-once store and its reduced-motion stance):
 *  - the FINAL state is what renders whenever motion cannot or should not run: SSR, no IntersectionObserver,
 *    reduced motion (OS or the app switch), an unmeasurable (hidden) element, a key that already played;
 *  - the first committed frame is decided synchronously, so there is never a flash of the final value;
 *  - nothing here ever blocks a click or holds a value back: content is readable, motion is a flourish;
 *  - after the first play, later data changes snap (counts) or use the element's own transition (rings);
 *  - only transform / opacity / stroke-dashoffset / width are animated by the CSS that consumes these.
 */

/** True when decorative motion may run right now (browser can observe, user has not asked for less). */
export function motionAllowed(): boolean {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return false;
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
    if (document.documentElement.getAttribute('data-mizan-motion') === 'reduced') return false;
  } catch {
    return false;
  }
  return true;
}

const drawKey = (playKey: string) => `draw:${playKey}`;

/** Same easing as --ease-brand / --dna-ease: cubic-bezier(.22,.75,.22,1), evaluated for rAF-driven values. */
export function brandEase(t: number): number {
  const x1 = 0.22, y1 = 0.75, x2 = 0.22, y2 = 1;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const bez = (a: number, b: number, s: number) => 3 * a * s * (1 - s) * (1 - s) + 3 * b * s * s * (1 - s) + s * s * s;
  let lo = 0, hi = 1, s = t;
  for (let i = 0; i < 22; i += 1) {
    s = (lo + hi) / 2;
    if (bez(x1, x2, s) < t) lo = s; else hi = s;
  }
  return bez(y1, y2, s);
}

export type DrawPhase = 'pending' | 'play' | null;

export interface FirstViewOptions {
  /** Entity id: the same key never replays in this tab session. Without a key it plays once per mount. */
  playKey?: string | null;
  enabled?: boolean;
  threshold?: number;
  /** How long the `play` phase lasts before the element settles to `null` (plain final state). */
  settleMs?: number;
}

/**
 * `pending` = armed, element not yet in view (draw the empty state); `play` = in view, animate to the final
 * state; `null` = rest (final state, no motion attributes). Starts at `null` whenever motion cannot run.
 */
export function useFirstView<T extends HTMLElement | SVGElement = HTMLElement>({
  playKey,
  enabled = true,
  threshold = 0.4,
  settleMs = 1400,
}: FirstViewOptions = {}) {
  const ref = React.useRef<T | null>(null);
  const [phase, setPhase] = React.useState<DrawPhase>(() =>
    enabled && motionAllowed() && !(playKey && journeyAlreadyPlayed(drawKey(playKey))) ? 'pending' : null,
  );
  const need = React.useRef(threshold);

  // An element that cannot be measured (collapsed, display:none) would never intersect: show its real state.
  React.useLayoutEffect(() => {
    if (phase !== 'pending') return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) { setPhase(null); return; }
    need.current = journeyEffectiveThreshold(threshold, rect.height, window.innerHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (phase !== 'pending') return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting && e.intersectionRatio >= need.current - 0.01)) return;
        io.disconnect();
        if (playKey) markJourneyPlayed(drawKey(playKey));
        // A hidden tab would run the motion unseen: land on the final state.
        setPhase(typeof document !== 'undefined' && document.hidden ? null : 'play');
      },
      { threshold: [need.current] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [phase, playKey]);

  React.useEffect(() => {
    if (phase !== 'play') return;
    const t = setTimeout(() => setPhase(null), settleMs);
    return () => clearTimeout(t);
  }, [phase, settleMs]);

  return { ref, phase };
}

export interface CountUpOptions {
  value: number;
  playKey?: string | null;
  enabled?: boolean;
  threshold?: number;
  durationMs?: number;
}

/**
 * Number that rolls 0 -> value once per playKey (per tab session) when first in view; afterwards it always
 * equals `value` (live refreshes snap, never re-roll). Returns the number to format and whether it is rolling.
 */
export function useCountUp<T extends HTMLElement = HTMLElement>({ value, playKey, enabled = true, threshold = 0.4, durationMs = 700 }: CountUpOptions) {
  const ref = React.useRef<T | null>(null);
  const finite = Number.isFinite(value);
  const armed0 = enabled && finite && value !== 0 && motionAllowed() && !(playKey && journeyAlreadyPlayed(drawKey(playKey)));
  // 'wait' = armed, shows 0; 'run' = rolling; 'rest' = shows the live value.
  const [stage, setStage] = React.useState<'wait' | 'run' | 'rest'>(armed0 ? 'wait' : 'rest');
  const [shown, setShown] = React.useState(armed0 ? 0 : value);
  const latest = React.useRef(value);
  latest.current = value;
  const need = React.useRef(threshold);

  React.useLayoutEffect(() => {
    if (stage !== 'wait') return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) { setStage('rest'); return; }
    need.current = journeyEffectiveThreshold(threshold, rect.height, window.innerHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (stage !== 'wait') return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting && e.intersectionRatio >= need.current - 0.01)) return;
        io.disconnect();
        if (playKey) markJourneyPlayed(drawKey(playKey));
        setStage(typeof document !== 'undefined' && document.hidden ? 'rest' : 'run');
      },
      { threshold: [need.current] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [stage, playKey]);

  React.useEffect(() => {
    if (stage !== 'run') return;
    let raf = 0;
    const t0 = performance.now();
    const dur = Math.min(900, Math.max(200, durationMs));
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const target = latest.current;
      if (p >= 1) { setShown(target); setStage('rest'); return; }
      const raw = target * brandEase(p);
      setShown(Number.isInteger(target) ? Math.round(raw) : raw);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage, durationMs]);

  return { ref, value: stage === 'rest' ? value : shown, rolling: stage !== 'rest' };
}

/**
 * True for ~1.2s after `signature` changes (never on the first render, never for an unchanged value).
 * Use it to put one soft tint on the element that just changed. Reduced motion: never flags.
 */
export function useChangeFlash(signature: string | number | null | undefined, holdMs = 1300): boolean {
  const prev = React.useRef(signature);
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    if (prev.current === signature) return;
    prev.current = signature;
    if (!motionAllowed()) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), holdMs);
    return () => clearTimeout(t);
  }, [signature, holdMs]);
  return on;
}

/**
 * Keys whose value differs from the previous render (first render: none). `only` filters the direction,
 * e.g. 'rise' for a tally that grew. The set empties itself after ~1.3s.
 */
export function useChangedKeys(values: Record<string, number | string | null | undefined>, only: 'any' | 'rise' = 'any', holdMs = 1300): ReadonlySet<string> {
  const prev = React.useRef<Record<string, number | string | null | undefined> | null>(null);
  const latest = React.useRef(values);
  latest.current = values;
  const sig = JSON.stringify(values);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [changed, setChanged] = React.useState<ReadonlySet<string>>(() => new Set());
  React.useEffect(() => {
    const before = prev.current;
    const now = latest.current;
    prev.current = now;
    if (!before || !motionAllowed()) return;
    const next = new Set<string>();
    for (const k of Object.keys(now)) {
      const a = before[k], b = now[k];
      if (a === b || a === undefined) continue;
      if (only === 'rise' && !(typeof a === 'number' && typeof b === 'number' && b > a)) continue;
      next.add(k);
    }
    if (!next.size) return;
    setChanged(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setChanged(new Set()), holdMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return changed;
}

/**
 * Shows `value`; when it RISES after the first paint it rolls once from the previous value to the new one
 * (a streak that just grew). First render, drops and reduced motion snap. Not for live refreshes of tallies.
 */
export function useRiseCount(value: number, durationMs = 700): number {
  const prev = React.useRef(value);
  const [shown, setShown] = React.useState(value);
  const [rolling, setRolling] = React.useState(false);
  React.useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (value === from) return;
    if (!(value > from) || !motionAllowed()) { setRolling(false); setShown(value); return; }
    setRolling(true);
    let raf = 0;
    const t0 = performance.now();
    const dur = Math.min(900, Math.max(200, durationMs));
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      if (p >= 1) { setShown(value); setRolling(false); return; }
      setShown(Math.round(from + (value - from) * brandEase(p)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);
  return rolling ? shown : value;
}

/**
 * True for ~1.3s after a number moves in the given direction (never on the first render). For a single figure the
 * reader is waiting on, e.g. the queue "ahead" count dropping. Reduced motion: never flags.
 */
export function useValueFlash(value: number, dir: 'any' | 'drop' | 'rise' = 'any', holdMs = 1300): boolean {
  const prev = React.useRef(value);
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (before === value) return;
    if (dir === 'drop' && !(value < before)) return;
    if (dir === 'rise' && !(value > before)) return;
    if (!motionAllowed()) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), holdMs);
    return () => clearTimeout(t);
  }, [value, dir, holdMs]);
  return on;
}
