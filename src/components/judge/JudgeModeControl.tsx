import React, { useCallback, useEffect, useRef, useState } from 'react';

let panelSeq = 0;
import { Eye } from 'lucide-react';

/*
 * وضع المحكّم — تفضيلٌ للجهاز لا للحساب.
 *
 * القاعة تختلف: قاعةٌ مضاءة بكشّافات تُطفئ الشاشة الداكنة، وجلسةٌ ليلية تُتعب فيها
 * الورقةُ المضيئة العين. فالمحكّم يختار ما يناسب مكانه، ويبقى اختياره على جهازه.
 *
 * كل ما هنا يُسنَد بسمة `data-judge-*` على جذر قمرة المحكّم وحدها، فلا يتغيّر شيءٌ خارجها.
 * والوضع الافتراضي لا يضع أي سمة: الشاشة كما كانت حرفًا بحرف.
 */

export type JudgeTheme = 'default' | 'hall' | 'night';
export interface JudgeModePrefs { enabled: boolean; theme: JudgeTheme }

const STORAGE_KEY = 'mizan.judgeMode.v1';
const DEFAULT_PREFS: JudgeModePrefs = { enabled: false, theme: 'default' };
const THEMES: JudgeTheme[] = ['default', 'hall', 'night'];

const readPrefs = (): JudgeModePrefs => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<JudgeModePrefs>;
    return {
      enabled: parsed.enabled === true,
      theme: THEMES.includes(parsed.theme as JudgeTheme) ? (parsed.theme as JudgeTheme) : 'default',
    };
  } catch { return DEFAULT_PREFS; }
};

export function useJudgeMode() {
  const [prefs, setPrefs] = useState<JudgeModePrefs>(() => (typeof window === 'undefined' ? DEFAULT_PREFS : readPrefs()));
  const update = useCallback((patch: Partial<JudgeModePrefs>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch };
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* تخزينٌ ممنوع: يبقى الاختيار لهذه الجلسة */ }
      return next;
    });
  }, []);
  /* السمات تُنشر على الجذر؛ غيابها هو الافتراضي. */
  const attrs: Record<string, string | undefined> = {
    'data-judge-mode': prefs.enabled ? 'on' : undefined,
    'data-judge-theme': prefs.theme === 'default' ? undefined : prefs.theme,
  };
  return { prefs, update, attrs };
}

const THEME_LABEL: Record<JudgeTheme, [string, string]> = {
  default: ['الافتراضي', 'Default'],
  hall: ['إضاءة القاعة', 'Hall lighting'],
  night: ['ليلي', 'Night'],
};

export const JudgeModeControl: React.FC<{ ar: boolean; prefs: JudgeModePrefs; onChange: (patch: Partial<JudgeModePrefs>) => void; className?: string }> = ({ ar, prefs, onChange, className = '' }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useRef(`mizan-judge-mode-${++panelSeq}`).current;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const label = ar ? 'وضع المحكّم والعرض' : 'Judge mode & display';
  return <div ref={rootRef} className={`mizan-judge-modectl ${className}`}>
    <button type="button" className="mizan-judge-modebtn" aria-label={label} title={label}
      aria-expanded={open} aria-controls={panelId} data-on={prefs.enabled || prefs.theme !== 'default' ? 'true' : undefined}
      onClick={() => setOpen(v => !v)}>
      <Eye aria-hidden="true" />
    </button>
    {open && <div id={panelId} role="group" aria-label={label} className="mizan-judge-modepanel">
      <label className="mizan-judge-modeswitch">
        <input type="checkbox" checked={prefs.enabled} onChange={e => onChange({ enabled: e.target.checked })} />
        <span>{ar ? 'وضع المحكّم: خطٌّ أكبر وأهدافُ لمسٍ أوسع' : 'Judge mode: larger text & touch targets'}</span>
      </label>
      <div className="mizan-judge-modethemes" role="radiogroup" aria-label={ar ? 'سمة العرض' : 'Display theme'}>
        {THEMES.map(t => <button key={t} type="button" role="radio" aria-checked={prefs.theme === t}
          onClick={() => onChange({ theme: t })}>{ar ? THEME_LABEL[t][0] : THEME_LABEL[t][1]}</button>)}
      </div>
    </div>}
  </div>;
};
