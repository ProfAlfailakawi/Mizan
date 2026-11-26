/*
 * «وضع المحراب» — سمةٌ داكنة للتطبيق كله من ألوان القاعة (`--venue*`).
 *
 * تفضيلٌ لكل جهاز (لا بيانات مسابقة ولا كتابة إلى أي خادم): يُحفظ في التخزين المحلي إن
 * أمكن، ويُطبَّق علامةً على الجذر `html[data-mizan-theme="mihrab"]` قبل أول رسم. وغياب
 * التخزين (وضع خاص) يعني السمة الفاتحة الافتراضية كما كانت.
 */
export type MizanTheme = 'light' | 'mihrab';
const KEY = 'mizan.theme';
const EVENT = 'mizan:theme';

export function readTheme(): MizanTheme {
  try { return window.localStorage.getItem(KEY) === 'mihrab' ? 'mihrab' : 'light'; } catch { return 'light'; }
}

export function applyTheme(theme: MizanTheme): void {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  if (theme === 'mihrab') el.setAttribute('data-mizan-theme', 'mihrab');
  else el.removeAttribute('data-mizan-theme');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    if (!meta.getAttribute('data-light')) meta.setAttribute('data-light', meta.getAttribute('content') || '');
    meta.setAttribute('content', theme === 'mihrab' ? '#101a16' : meta.getAttribute('data-light') || '');
  }
}

export function setTheme(theme: MizanTheme): void {
  try { window.localStorage.setItem(KEY, theme); } catch { /* تخزين غير متاح: يبقى للجلسة */ }
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: theme }));
}

export function installTheme(): void {
  if (typeof window === 'undefined') return;
  applyTheme(readTheme());
}

export function onThemeChange(fn: (t: MizanTheme) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<MizanTheme>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
