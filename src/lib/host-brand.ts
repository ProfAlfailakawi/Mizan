/*
 * علامة المضيف: اسم المنصّة وشعارها وألوانها كما يحلّها الخادم من النطاق (/api/public/brand).
 *
 * على نطاق مشغّلٍ بعلامة بيضاء كاملة تُستبدل «ميزان» في الترويسة وشاشة الدخول والبداية باسم
 * المشغّل وشعاره، ويُخفى رمز ميزان إن كانت اتفاقيته تسمح بذلك. على نطاق ميزان لا يتغيّر شيء.
 * تُجلب مرّةً وتُحفظ في الذاكرة؛ تعذّر الجلب يعني علامة ميزان الافتراضية لا شاشةً معطّلة.
 */
import { useSyncExternalStore } from 'react';

export interface HostBrand {
  context: 'mizan' | 'operator' | 'organization';
  brandingMode: 'mizan' | 'co_branded' | 'full_white_label';
  productName: string;
  productNameArabic?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  loginTitle?: string;
  loginTitleArabic?: string;
  supportEmail?: string;
  supportUrl?: string;
  privacyUrl?: string;
  termsUrl?: string;
  showPoweredByMizan: boolean;
}

let current: HostBrand | null = null;
let started = false;
const listeners = new Set<() => void>();

export function isWhiteLabel(b: HostBrand | null): b is HostBrand {
  return !!b && b.context !== 'mizan' && b.brandingMode !== 'mizan';
}

/** Apply title, favicon and colour tokens for a white-label host. Pure DOM side effects, idempotent. */
export function applyHostBrandToDocument(b: HostBrand | null, doc: Document | undefined = typeof document === 'undefined' ? undefined : document) {
  if (!doc || !isWhiteLabel(b)) return;
  const lang = doc.documentElement.lang;
  doc.title = (lang === 'ar' && b.productNameArabic) || b.productName;
  if (b.faviconUrl) {
    let link = doc.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) { link = doc.createElement('link'); link.rel = 'icon'; doc.head.appendChild(link); }
    link.href = b.faviconUrl;
  }
  if (b.primaryColor) doc.documentElement.style.setProperty('--brand-primary', b.primaryColor);
  if (b.accentColor) doc.documentElement.style.setProperty('--brand-accent', b.accentColor);
  doc.documentElement.dataset.whiteLabel = b.brandingMode;
}

export function loadHostBrand() {
  if (started || typeof fetch !== 'function' || typeof window === 'undefined') return;
  started = true;
  fetch('/api/public/brand', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then((b: HostBrand | null) => { if (!b) return; current = b; applyHostBrandToDocument(b); listeners.forEach(l => l()); })
    .catch(() => { /* علامة ميزان الافتراضية */ });
}

export function useHostBrand(): HostBrand | null {
  return useSyncExternalStore(cb => { listeners.add(cb); loadHostBrand(); return () => listeners.delete(cb); }, () => current, () => null);
}

/** Test seam. */
export function __setHostBrandForTests(b: HostBrand | null) { current = b; listeners.forEach(l => l()); }
