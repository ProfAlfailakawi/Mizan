/*
 * هوية الجهة المشتقّة من النطاق.
 *
 * النشر واحد لكل الجهات، والمضيف هو ما يميّز الجهة. يسأل المتصفح الخادم عن الجهة صاحبة
 * هذا النطاق، فتظهر هويتها (اسمها وشعارها) بدل «ميزان» لزوّار نطاقها.
 *
 * 204 يعني نشرًا بجهة واحدة، فتبقى الهوية الافتراضية — وهو ما يجب أن يحدث في العرض التجريبي.
 */
export interface PublicTenant {
  orgId: string;
  displayName: string | null;
  displayNameArabic: string | null;
  logoUrl: string | null;
}

export async function fetchTenant(signal?: AbortSignal): Promise<PublicTenant | null> {
  try {
    const r = await fetch('/api/public/tenant', { signal, headers: { accept: 'application/json' } });
    if (r.status === 204 || !r.ok) return null;
    const body = (await r.json()) as PublicTenant;
    return body && typeof body.orgId === 'string' && body.orgId ? body : null;
  } catch {
    return null; // تعذّر السؤال ⇒ الهوية الافتراضية، لا شاشة خطأ
  }
}
