import React, { useEffect, useState } from 'react';
import { Accessibility, Moon, Sun } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { Modal } from '../design-system/Modal';
import { AccessibilityChoices } from '../design-system/AccessibilityControls';
import { onThemeChange, readTheme, setTheme, type MizanTheme } from '../../lib/mihrab-theme';

/*
 * زرّ الإتاحة في الترويسة لكل الأدوار: يفتح عناصر «الإتاحة الهادئة» نفسها التي كانت في
 * تبويب مالك المنصة وحده (`AccessibilityChoices` — مصدرٌ واحد لا نسخة)، ومعها مفتاح
 * «وضع المحراب». وزرّ المحراب المستقل يظهر بجانبه من العرض المتوسط فما فوق.
 */

export function useMihrabTheme(): [MizanTheme, () => void] {
  const [theme, set] = useState<MizanTheme>(() => (typeof window === 'undefined' ? 'light' : readTheme()));
  useEffect(() => onThemeChange(set), []);
  return [theme, () => setTheme(theme === 'mihrab' ? 'light' : 'mihrab')];
}

export const MihrabToggle: React.FC<{ ar: boolean; className?: string }> = ({ ar, className = '' }) => {
  const [theme, toggle] = useMihrabTheme();
  const on = theme === 'mihrab';
  const label = on ? (ar ? 'العودة إلى السمة الفاتحة' : 'Back to the light theme') : (ar ? 'وضع المحراب (داكن)' : 'Mihrab mode (dark)');
  return (
    <button type="button" onClick={toggle} aria-pressed={on} title={label} aria-label={label}
      className={`mz-vw-iconbtn min-w-11 h-11 items-center justify-center rounded-xl hover:bg-[#efede7] text-[color:var(--muted)] ${className}`}>
      {on ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
};

export const AccessibilityButton: React.FC<{ variant?: 'icon' | 'menu'; className?: string }> = ({ variant = 'icon', className = '' }) => {
  const s = useAppStore();
  const ar = s.language === 'ar';
  const [open, setOpen] = useState(false);
  const [theme, toggle] = useMihrabTheme();
  const label = ar ? 'الإتاحة والمظهر' : 'Accessibility and appearance';
  return (
    <>
      {variant === 'menu'
        ? <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold text-[#3f4742] hover:bg-[#f2f0ea] text-start ${className}`}><Accessibility className="w-4 h-4 text-[color:var(--muted)]" />{label}</button>
        : <button type="button" onClick={() => setOpen(true)} title={label} aria-label={label} aria-haspopup="dialog"
          className={`mz-vw-iconbtn min-w-11 h-11 items-center justify-center rounded-xl hover:bg-[#efede7] text-[color:var(--muted)] ${className || 'inline-flex'}`}>
          <Accessibility className="w-4 h-4" />
        </button>}
      <Modal isOpen={open} onClose={() => setOpen(false)} title={label} subtitle={ar ? 'تكيّف هادئ بلا تصنيف للمستخدم.' : 'Quiet adaptation without labeling the person.'} maxWidth="md">
        <AccessibilityChoices s={s} ar={ar} />
        <button type="button" onClick={toggle} aria-pressed={theme === 'mihrab'}
          className={`mt-2 w-full min-h-14 rounded-xl border px-4 text-start text-xs font-black flex items-center justify-between ${theme === 'mihrab' ? 'bg-[var(--emerald-soft)] border-[#9db5ab] text-[color:var(--emerald)]' : 'bg-white border-[#dedcd5]'}`}>
          <span className="inline-flex items-center gap-2"><Moon className="w-4 h-4" />{ar ? 'وضع المحراب — سمة داكنة من ألوان القاعة' : 'Mihrab mode — a dark theme from the hall colours'}</span>
          <span className={`w-3 h-3 rounded-full ${theme === 'mihrab' ? 'bg-[var(--emerald-2)]' : 'bg-[#d2d0c9]'}`} />
        </button>
      </Modal>
    </>
  );
};
