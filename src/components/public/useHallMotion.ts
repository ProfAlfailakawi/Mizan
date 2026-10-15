import { useMemo } from 'react';
import { useChangedKeys, useFirstView } from '../dna/useMotion';

/*
 * Calm motion for the hall's khatmah board (HallRecitationMap + the corridor's khatmah panel).
 * Presentation only: the numbers come from the caller's aggregate, nothing here reads or writes data.
 *  - the progress bar draws in once per session (`bar`);
 *  - a page whose tally just rose gets one soft glow (`rose`, ignored when many change at once = a catch-up refresh);
 *  - one gold halo when a new khatmah completes (`khatmahDone`).
 * The first render never glows or halos, and a live refresh never re-rolls anything.
 */
export function useHallMotion(pages: ReadonlyArray<number>, khatmat: number, key: string) {
  const bar = useFirstView<HTMLDivElement>({ playKey: `${key}:bar`, threshold: 0.4 });
  const tallies = useMemo(() => Object.fromEntries(pages.map((n, i) => [String(i), n])), [pages]);
  const rosePages = useChangedKeys(tallies, 'rise');
  const done = useChangedKeys({ khatmat }, 'rise');
  return {
    bar,
    rose: (i: number) => rosePages.size > 0 && rosePages.size <= 24 && rosePages.has(String(i)),
    khatmahDone: done.has('khatmat'),
  };
}
