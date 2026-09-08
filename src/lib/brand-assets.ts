import { auth } from './firebase';

export const MAX_BRAND_LOGO_BYTES = 2 * 1024 * 1024;
export const BRAND_LOGO_TYPES = ['image/png','image/jpeg','image/webp','image/svg+xml'] as const;
type BrandLogoType = typeof BRAND_LOGO_TYPES[number];

const extType = (name: string): BrandLogoType | '' => {
  const ext = name.toLowerCase().split('.').pop() || '';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  return '';
};

export const brandLogoMime = (file: File): BrandLogoType | '' => {
  const raw = String(file.type || '').toLowerCase();
  if ((BRAND_LOGO_TYPES as readonly string[]).includes(raw)) return raw as BrandLogoType;
  return extType(file.name);
};

export function validateBrandLogoFile(file: File): BrandLogoType {
  const type = brandLogoMime(file);
  if (!type) throw new Error('LOGO_TYPE_NOT_ALLOWED');
  if (file.size <= 0) throw new Error('LOGO_EMPTY');
  if (file.size > MAX_BRAND_LOGO_BYTES) throw new Error('LOGO_TOO_LARGE');
  return type;
}

const token = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error('IDENTITY_REQUIRED');
  return user.getIdToken();
};

const request = async (path: string, init: RequestInit) => {
  const bearer = await token();
  const res = await fetch(path, {
    ...init,
    headers: {
      authorization: `Bearer ${bearer}`,
      ...(init.headers || {})
    }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(String(body.code || body.error || `BRAND_ASSET_${res.status}`));
  }
  return res;
};

const enc = (v: string) => encodeURIComponent(v);
const orgPath = (organizationId: string) => `/api/brand-assets/organizations/${enc(organizationId)}/logo`;
const compPath = (organizationId: string, competitionId: string) => `/api/brand-assets/organizations/${enc(organizationId)}/competitions/${enc(competitionId)}/logo`;

const upload = async (path: string, file: File) => {
  const contentType = validateBrandLogoFile(file);
  const res = await request(path, { method: 'PUT', headers: { 'content-type': contentType }, body: file });
  const body = await res.json() as { url?: string };
  if (!body.url || !body.url.startsWith('/api/public/brand-assets/')) throw new Error('BRAND_ASSET_URL_INVALID');
  return body.url;
};

export const uploadOrganizationLogo = (organizationId: string, file: File) => upload(orgPath(organizationId), file);
export const uploadCompetitionLogo = (organizationId: string, competitionId: string, file: File) => upload(compPath(organizationId, competitionId), file);
export const deleteOrganizationLogo = async (organizationId: string) => { await request(orgPath(organizationId), { method: 'DELETE' }); };
export const deleteCompetitionLogo = async (organizationId: string, competitionId: string) => { await request(compPath(organizationId, competitionId), { method: 'DELETE' }); };
export const isManagedBrandLogoUrl = (value: string | undefined) => Boolean(value && value.startsWith('/api/public/brand-assets/'));
