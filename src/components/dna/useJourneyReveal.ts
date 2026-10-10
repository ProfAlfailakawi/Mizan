import * as React from 'react';

/*
 * One-shot sequential reveal for journey steppers.
 *
 * The caller's step states are the truth. This hook only decides how many of the
 * already-true lit stations (`target`) are shown so far while the stepper first
 * scrolls into view. It never goes past `target`, plays once per mount (and once
 * per `playKey` per tab session), and returns `lit = null` once settled, which
 * means "render the real states". SSR, no IntersectionObserver and reduced motion
 * all start at `null`, so the final state is what is drawn.
 */

/** Length of the one-shot halo on the last lit station (keep in sync with dna.css and index.css). */
export const JOURNEY_HALO_MS = 1550;
const STORE_KEY = 'mizan:journey-played';
const playedKeys = new Set<string>();

function readStore(): string[] {
  try {
    const raw = window.sessionStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

export function journeyAlreadyPlayed(playKey?: string | null): boolean {
  if (!playKey) return false;
  if (playedKeys.has(playKey)) return true;
  if (typeof window === 'undefined') return false;
  if (readStore().includes(playKey)) {
    playedKeys.add(playKey);
    return true;
  }
  return false;
}

export function markJourneyPlayed(playKey?: string | null): void {
  if (!playKey) return;
  playedKeys.add(playKey);
  if (typeof window === 'undefined') return;
  try {
    const keys = readStore();
    if (!keys.includes(playKey)) window.sessionStorage.setItem(STORE_KEY, JSON.stringify([...keys, playKey].slice(-50)));
  } catch {
    /* storage can be blocked; the module-level Set still prevents a replay in this tab */
  }
}

/** Test hook: forget what has played. */
export function resetJourneyPlayed(): void {
  playedKeys.clear();
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
}

/** ~0.55-0.75s per station on short rails, capped so the whole intro stays near 4s. */
export function journeyStepMs(count: number): number {
  const n = Math.max(1, count);
  return Math.min(750, Math.max(350, Math.round(4000 / n)));
}

/** How many leading stations are really lit: index of the last done/current step + 1. */
export function journeyTarget(states: ReadonlyArray<string>): number {
  let target = 0;
  states.forEach((s, i) => {
    if (s === 'done' || s === 'current') target = i + 1;
  });
  return target;
}

/**
 * A ratio the element can actually reach: a rail taller than ~90% of the viewport can never be
 * 50% visible in one frame, and waiting for it would hide the real state forever.
 */
export function journeyEffectiveThreshold(threshold: number, elementHeight: number, viewportHeight: number): number {
  if (!(elementHeight > 0) || !(viewportHeight > 0)) return threshold;
  return Math.min(threshold, Math.max(0.05, (0.9 * viewportHeight) / elementHeight));
}

/** Displayed state during the intro: stations not yet reached read as pending. */
export function journeyDisplayState<S extends string>(real: S, index: number, target: number, lit: number | null): S | 'pending' {
  if (lit === null || index >= target || index < lit) return real;
  return 'pending';
}

export interface JourneyRevealOptions {
  /** Number of stations that are really lit (see journeyTarget). */
  target: number;
  count: number;
  stepMs?: number;
  threshold?: number;
  enabled?: boolean;
  /** Keep the rail unlit (not started) while the host is still waiting for its real data. */
  hold?: boolean;
  /** Entity id: the same entity does not replay in this tab session. */
  playKey?: string | null;
  /** Small wait after the rail enters view so a parent fade-in is not missed. */
  startDelayMs?: number;
}

/** Can the intro run for this rail right now (before it is measured)? Mirrors the arming checks in the hook. */
function canArmIntro(enabled: boolean, target: number, playKey?: string | null): boolean {
  if (!enabled || target <= 0 || typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  return !journeyAlreadyPlayed(playKey);
}

export function useJourneyReveal<T extends HTMLElement = HTMLOListElement>({
  target,
  count,
  stepMs,
  threshold = 0.5,
  enabled = true,
  hold = false,
  playKey,
  startDelayMs = 250,
}: JourneyRevealOptions) {
  const ref = React.useRef<T | null>(null);
  // Armed from the very first render when the intro can run, so the first committed frame is already unlit.
  // Starting from the final state and flipping it in a layout effect lets CSS transitions animate the filled
  // rail back to empty (a visible flash). A rail that then proves unmeasurable falls back to the real state.
  const arm0 = React.useRef<boolean | null>(null);
  if (arm0.current === null) arm0.current = canArmIntro(enabled, target, playKey);
  const armedAtMount = arm0.current === true;
  const [lit, setLit] = React.useState<number | null>(armedAtMount ? 0 : null);
  const [just, setJust] = React.useState<number | null>(null);
  const [armed, setArmed] = React.useState(armedAtMount);
  const [started, setStarted] = React.useState(false);
  const thresholdRef = React.useRef(threshold);
  const keyRef = React.useRef(playKey);
  const decidedRef = React.useRef(armedAtMount); // play-once per mount: set when armed or permanently skipped
  const pendingMeasure = React.useRef(armedAtMount); // armed at first render, geometry not checked yet
  const litRef = React.useRef<number | null>(armedAtMount ? 0 : null);
  const ms = stepMs ?? journeyStepMs(count);
  const setLitBoth = (v: number | null) => { litRef.current = v; setLit(v); };

  // Decided before paint so the final state never flashes. Re-checked when `target` changes, so a rail
  // that mounts with nothing lit (data still loading) arms on its first 0 -> >0 transition instead of
  // being settled forever. A rail that is not measurable (collapsed) or has no lit station stays real.
  React.useLayoutEffect(() => {
    // The same mounted rail reused for another entity starts clean: old observer/ticker are torn down by
    // the effects' deps, and nothing of the previous key's lit/armed state carries over.
    if (keyRef.current !== playKey) {
      keyRef.current = playKey;
      decidedRef.current = false;
      setStarted(false);
      setArmed(false);
      setLitBoth(null);
      setJust(null);
      pendingMeasure.current = false;
    }
    if (pendingMeasure.current) {
      pendingMeasure.current = false;
      const first = ref.current?.getBoundingClientRect();
      if (!first || first.height <= 0 || first.width <= 0) {
        // Not measurable (collapsed/hidden): show the real state and stay re-armable.
        decidedRef.current = false;
        setArmed(false);
        setLitBoth(null);
        return;
      }
      thresholdRef.current = journeyEffectiveThreshold(threshold, first.height, window.innerHeight);
      return;
    }
    if (decidedRef.current || !enabled || typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || journeyAlreadyPlayed(playKey)) { decidedRef.current = true; return; }
    if (target <= 0) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0 || rect.width <= 0) return;
    thresholdRef.current = journeyEffectiveThreshold(threshold, rect.height, window.innerHeight);
    decidedRef.current = true;
    setArmed(true);
    setLitBoth(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, enabled, playKey]);

  // Wait for the rail to really be on screen (ratio, not just 1px) at an attainable threshold.
  React.useEffect(() => {
    if (!armed || hold || started) return;
    const el = ref.current;
    if (!el) return;
    const need = thresholdRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting && e.intersectionRatio >= need - 0.01)) return;
        io.disconnect();
        markJourneyPlayed(playKey);
        setStarted(true);
      },
      { threshold: [need] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [armed, hold, started, playKey]);

  // The ticker always converges: it restarts from the current lit count whenever `target` moves, so a
  // live update mid-intro extends it, and it can only end by settling to null (real states).
  React.useEffect(() => {
    if (!started) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // `just` is cleared with the rest so a settled rail carries no halo attribute that a remount could replay.
    const settle = () => { setLitBoth(null); setJust(null); setArmed(false); setStarted(false); };
    const run = (cur: number) => {
      // Let the last station's one-shot halo finish before settling (its end frame equals the settled look).
      if (cur >= target) { timer = setTimeout(settle, Math.max(ms, JOURNEY_HALO_MS)); return; }
      timer = setTimeout(() => { setLitBoth(cur + 1); setJust(cur); run(cur + 1); }, cur === 0 ? startDelayMs : ms);
    };
    run(litRef.current ?? 0);
    return () => { if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, target, ms, startDelayMs]);

  return { ref, lit, just, stepMs: ms };
}
