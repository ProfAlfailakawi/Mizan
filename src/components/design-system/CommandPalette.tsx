import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Award, Search, UserRound, X } from 'lucide-react';
import { useAppStore } from '../../lib/store';

type Result = { id: string; kind: string; title: string; meta: string };

/*
 * The palette opened with ⌘K but could only be driven with a mouse from there: no arrow
 * keys, no Enter, no active row. A command palette that needs the mouse is just a search
 * box in a hurry. It now has full keyboard flow, combobox semantics, and focus return.
 */
export const CommandPalette: React.FC<{ open?: boolean; onOpenChange?: (v: boolean) => void }> = ({ open: controlled, onOpenChange }) => {
  const s = useAppStore();
  const ar = s.language === 'ar';
  const [internal, setInternal] = useState(false);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const open = controlled ?? internal;
  const restoreTo = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const listId = React.useId();

  const setOpen = (v: boolean) => { setInternal(v); onOpenChange?.(v); if (!v) { setQ(''); setCursor(0); } };

  const results = useMemo<Result[]>(() => {
    const x = q.trim().toLowerCase();
    if (!x) return [];
    return [
      ...s.participants.filter(p => `${p.code} ${p.fullName} ${p.fullNameArabic} ${p.email}`.toLowerCase().includes(x)).slice(0, 5).map(p => ({ id: p.id, kind: 'participant', title: ar ? p.fullNameArabic : p.fullName, meta: `${p.code} · ${p.status}` })),
      ...s.competitions.filter(c => `${c.name} ${c.nameArabic} ${c.edition}`.toLowerCase().includes(x)).slice(0, 3).map(c => ({ id: c.id, kind: 'competition', title: ar ? c.nameArabic : c.name, meta: c.edition })),
      ...s.certificates.filter(c => `${c.certificateNumber} ${c.participantName} ${c.participantNameArabic}`.toLowerCase().includes(x)).slice(0, 3).map(c => ({ id: c.id, kind: 'certificate', title: c.certificateNumber, meta: ar ? c.participantNameArabic : c.participantName })),
    ].slice(0, 9);
  }, [q, s.participants, s.competitions, s.certificates, ar]);

  // A new query invalidates the old cursor position.
  useEffect(() => { setCursor(0); }, [q]);

  const choose = (r?: Result) => {
    if (!r) return;
    if (r.kind === 'competition') s.selectCompetition(r.id);
    setOpen(false);
  };

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(!open); return; }
      if (!open) return;
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => (results.length ? (c + 1) % results.length : 0)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => (results.length ? (c - 1 + results.length) % results.length : 0)); }
      if (e.key === 'Enter') { e.preventDefault(); choose(results[cursor]); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [open, results, cursor]);

  // Keep the active row in view when arrowing past the visible window.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  useEffect(() => {
    if (open) { restoreTo.current = (document.activeElement as HTMLElement) || null; }
    else { restoreTo.current?.focus?.(); }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-[rgba(18,32,27,.28)] p-4 sm:p-12" onMouseDown={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ar ? 'بحث سريع' : 'Quick search'}
        className="mx-auto max-w-xl mizan-surface overflow-hidden flex flex-col max-h-[85dvh]"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[#e5e3dc] px-4 shrink-0">
          <Search className="w-4 h-4 text-[#616a65]" aria-hidden="true" />
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-activedescendant={results.length ? `${listId}-${cursor}` : undefined}
            aria-label={ar ? 'ابحث عن متسابق، مسابقة، شهادة' : 'Search participant, competition, certificate'}
            placeholder={ar ? 'ابحث عن متسابق، مسابقة، شهادة…' : 'Search participant, competition, certificate…'}
            className="min-w-0 flex-1 bg-transparent py-4 text-sm outline-none"
          />
          <kbd className="mizan-palette-key hidden sm:block">⌘K</kbd>
          <button onClick={() => setOpen(false)} aria-label={ar ? 'إغلاق' : 'Close'} className="w-11 h-11 rounded-lg grid place-items-center hover:bg-[#efede7]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div ref={listRef} id={listId} role="listbox" className="p-2 flex-1 min-h-0 max-h-[420px] overflow-y-auto">
          {!q ? (
            <div className="p-8 text-center text-xs text-[#686e69]">
              {ar ? 'اكتب للبحث. النتائج مقيدة بصلاحيات وسياق الجهة الحالية.' : 'Type to search. Results stay within the current tenant context.'}
            </div>
          ) : results.length ? results.map((r, i) => (
            <button
              key={`${r.kind}-${r.id}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === cursor}
              data-active={i === cursor}
              onMouseEnter={() => setCursor(i)}
              onClick={() => choose(r)}
              className="mizan-palette-row"
            >
              <span className="w-9 h-9 rounded-xl bg-[#E7EEE9] text-[#214C40] grid place-items-center shrink-0" aria-hidden="true">
                {r.kind === 'participant' ? <UserRound className="w-4 h-4" /> : r.kind === 'certificate' ? <Award className="w-4 h-4" /> : <Search className="w-4 h-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold truncate">{r.title}</span>
                <span className="block text-[10px] text-[#656b66] mt-1">{r.meta}</span>
              </span>
            </button>
          )) : (
            <div className="p-8 text-center text-xs text-[#686e69]">{ar ? 'لا نتائج' : 'No results'}</div>
          )}
        </div>

        {/* Result count spoken on change, so the list is not mouse-and-eye only. */}
        <div className="sr-only" role="status" aria-live="polite">
          {q ? (ar ? `${results.length} نتيجة` : `${results.length} results`) : ''}
        </div>
      </div>
    </div>
  );
};
