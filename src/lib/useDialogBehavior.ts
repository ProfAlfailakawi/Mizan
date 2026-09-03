import { useEffect, useRef } from 'react';

/*
 * Shared dialog behaviour: focus in, focus trapped, focus returned, Escape to close,
 * and body scroll locked while any dialog is open.
 *
 * MIZAN has several overlay surfaces (Modal, ClarityGuide, the command palette, the
 * venue overlays) and each had implemented some subset of this — usually the visual
 * part and none of the keyboard part. A keyboard user could Tab straight out of an
 * open dialog into the page behind it and lose their place entirely.
 */

let openDialogCount = 0;

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useDialogBehavior(
  open: boolean,
  onClose: () => void,
  ref: { current: HTMLElement | null },
  options: { lockScroll?: boolean; autoFocus?: boolean } = {},
) {
  const { lockScroll = true, autoFocus = true } = options;
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = (document.activeElement as HTMLElement) || null;

    // Counted, so a nested dialog closing does not hand scrolling back to the page
    // while an outer dialog is still open.
    if (lockScroll) {
      openDialogCount += 1;
      document.body.style.overflow = 'hidden';
    }

    const focusables = () =>
      Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) || [])
        .filter(el => el.offsetParent !== null);

    if (autoFocus) {
      const items = focusables();
      // Prefer the first real control over a leading close button.
      (items.length > 1 ? items[1] : items[0] || ref.current)?.focus?.();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement;
      const inside = ref.current?.contains(active);
      if (e.shiftKey && (active === first || !inside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (lockScroll) {
        openDialogCount = Math.max(0, openDialogCount - 1);
        if (openDialogCount === 0) document.body.style.overflow = '';
      }
      restoreTo.current?.focus?.();
    };
  }, [open, onClose, ref, lockScroll, autoFocus]);
}
