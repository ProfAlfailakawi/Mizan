/*
 * العلامة البيضاء واكتشاف المسابقات (MIZAN Discover).
 *
 * ١) العلامة حقٌّ في العقد لا مفتاحٌ في الواجهة: المشغّل لا يمنح نفسه العلامة البيضاء الكاملة،
 *    والخادم يرفض أي إعدادٍ يتجاوز `whiteLabelRights` في اتفاقيته النشطة.
 * ٢) النطاق المخصّص لا يُفعَّل إلا بعد إثبات الملكية (سجل DNS TXT). وشهادة TLS تُصدرها
 *    حافة النشر، فتُتتبَّع حالتها هنا ولا تُدّعى.
 * ٣) Discover لا يقرأ إعدادات المسابقة الداخلية أبدًا: يقرأ إسقاطًا منشورًا بحقولٍ عامة
 *    مُسمّاة، ويُصفّى على الخادم حسب النطاق — فمسابقةٌ نشرُها العالمي مطفأ لا تظهر في الشبكة
 *    العالمية مهما خُمّنت معاملات البحث.
 */

import crypto from 'crypto';
import type {
  BrandProfileRecord, BrandingMode, CustomDomainRecord, DiscoverVisibility, PublishedCompetitionListing,
} from './types';
import { CommercialError, activeAgreement, commercialOwnerOf, organizationOf, type CommercialState, type EngineCtx } from './engine';

const iso = (ms: number) => new Date(ms).toISOString();
const clean = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
const isOperatorRole = (role: string) => role === 'operator_owner' || role === 'operator_admin';

const MIZAN_BRAND = {
  productName: 'MIZAN',
  productNameArabic: 'مِيزان',
  directoryName: 'MIZAN Discover',
  directoryNameArabic: 'ميزان — اكتشف المسابقات',
  tagline: 'Quran Competition Operating System',
  taglineArabic: 'نظام تشغيل المسابقات القرآنية',
};

/* ————————————————————————————— rights ————————————————————————————— */

export interface EffectiveBrandRights {
  maxMode: BrandingMode;
  customDomain: boolean;
  customEmailBranding: boolean;
  hideMizanBrand: boolean;
  operatorDirectory: boolean;
  globalSyndication: boolean;
}

const MODE_RANK: Record<BrandingMode, number> = { mizan: 0, co_branded: 1, full_white_label: 2 };
const levelToMode = (level: 'mizan' | 'co_branded' | 'full'): BrandingMode => level === 'full' ? 'full_white_label' : level;

/** An operator's brand rights come only from its active agreement. No agreement → MIZAN branding. */
export function operatorBrandRights(s: CommercialState, operatorId: string, at: number): EffectiveBrandRights {
  const a = activeAgreement(s, operatorId, at);
  if (!a) return { maxMode: 'mizan', customDomain: false, customEmailBranding: false, hideMizanBrand: false, operatorDirectory: false, globalSyndication: false };
  return {
    maxMode: levelToMode(a.whiteLabelRights.level), customDomain: a.whiteLabelRights.customDomain,
    customEmailBranding: a.whiteLabelRights.customEmailBranding, hideMizanBrand: a.whiteLabelRights.hideMizanBrand,
    operatorDirectory: a.discoverRights.operatorDirectory, globalSyndication: a.globalSyndicationRights,
  };
}

/** An organization's rights: inherited from its operator, or from its own licence when direct. */
export function organizationBrandRights(s: CommercialState, organizationId: string, at: number): EffectiveBrandRights {
  const org = organizationOf(s, organizationId);
  if (commercialOwnerOf(org) === 'operator' && org.operatorId) {
    const r = operatorBrandRights(s, org.operatorId, at);
    /* الجهة تحت مشغّلٍ لا تتجاوز حقوقه، ولا تُخفي علامته هو. */
    return { ...r, operatorDirectory: r.operatorDirectory, globalSyndication: r.globalSyndication };
  }
  const license = s.licenses.find(l => l.organizationId === organizationId);
  const level = license?.whiteLabelEnabled ? (license.brandingLevel || 'co_branded') : 'mizan';
  return {
    maxMode: levelToMode(level), customDomain: !!license?.customDomainEnabled, customEmailBranding: level !== 'mizan',
    hideMizanBrand: level === 'full', operatorDirectory: false, globalSyndication: true,
  };
}

/* ————————————————————————————— brand profiles ————————————————————————————— */

const COLOR = /^#[0-9a-fA-F]{6}$/;
const safeUrl = (v: unknown) => {
  const u = clean(v, 500);
  if (!u) return undefined;
  if (!/^https:\/\//i.test(u) && !u.startsWith('/')) throw new CommercialError('BRAND_URL_MUST_BE_HTTPS');
  return u;
};
const safeEmail = (v: unknown) => {
  const e = clean(v, 180);
  if (!e) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new CommercialError('BRAND_EMAIL_INVALID');
  return e;
};

function assertBrandOwner(ctx: EngineCtx, ownerType: 'operator' | 'organization', ownerId: string) {
  const { actor, s } = ctx;
  if (actor.role === 'super_admin') return;
  if (ownerType === 'operator') {
    if (!isOperatorRole(actor.role) || actor.operatorId !== ownerId) throw new CommercialError('CROSS_OPERATOR_ACCESS_BLOCKED');
    return;
  }
  const org = organizationOf(s, ownerId);
  if (isOperatorRole(actor.role) && actor.operatorId && org.operatorId === actor.operatorId) return;
  if (actor.role === 'org_admin' && actor.organizationId === ownerId) return;
  throw new CommercialError('CROSS_TENANT_ACCESS_BLOCKED');
}

export function rightsFor(s: CommercialState, ownerType: 'operator' | 'organization', ownerId: string, at: number) {
  return ownerType === 'operator' ? operatorBrandRights(s, ownerId, at) : organizationBrandRights(s, ownerId, at);
}

export function setBrandProfile(ctx: EngineCtx, ownerType: 'operator' | 'organization', ownerId: string, input: Partial<BrandProfileRecord>) {
  assertBrandOwner(ctx, ownerType, ownerId);
  if (ownerType === 'operator' && !ctx.s.operators.some(o => o.id === ownerId)) throw new CommercialError('OPERATOR_NOT_FOUND');
  const rights = rightsFor(ctx.s, ownerType, ownerId, ctx.at);
  const mode: BrandingMode = (input.brandingMode && input.brandingMode in MODE_RANK) ? input.brandingMode : 'mizan';
  /* الحقّ في العقد هو الحدّ: لا يُقبل وضعٌ أعلى منه حتى لو أرسلته واجهةٌ معدّلة. */
  if (MODE_RANK[mode] > MODE_RANK[rights.maxMode]) throw new CommercialError('BRANDING_MODE_NOT_PERMITTED', { maxMode: rights.maxMode });
  const wantsHide = input.showPoweredByMizan === false;
  if (wantsHide && !(mode === 'full_white_label' && rights.hideMizanBrand)) throw new CommercialError('HIDE_MIZAN_BRAND_NOT_PERMITTED');
  if ((input.emailSenderName || input.emailReplyTo) && !rights.customEmailBranding) throw new CommercialError('CUSTOM_EMAIL_BRANDING_NOT_PERMITTED');
  const primaryColor = clean(input.primaryColor, 7) || undefined;
  const accentColor = clean(input.accentColor, 7) || undefined;
  if ((primaryColor && !COLOR.test(primaryColor)) || (accentColor && !COLOR.test(accentColor))) throw new CommercialError('BRAND_COLOR_INVALID');
  const productName = clean(input.productName, 80);
  if (mode !== 'mizan' && !productName) throw new CommercialError('BRAND_PRODUCT_NAME_REQUIRED');
  const existing = ctx.s.brandProfiles.find(b => b.ownerType === ownerType && b.ownerId === ownerId);
  const record: BrandProfileRecord = {
    id: existing?.id || ctx.nextId('BRAND'), ownerType, ownerId, brandingMode: mode,
    productName: productName || MIZAN_BRAND.productName, productNameArabic: clean(input.productNameArabic, 80) || undefined,
    logoUrl: safeUrl(input.logoUrl), faviconUrl: safeUrl(input.faviconUrl), primaryColor, accentColor,
    loginTitle: clean(input.loginTitle, 120) || undefined, loginTitleArabic: clean(input.loginTitleArabic, 120) || undefined,
    emailSenderName: clean(input.emailSenderName, 80) || undefined, emailReplyTo: safeEmail(input.emailReplyTo),
    directoryName: clean(input.directoryName, 80) || undefined, directoryNameArabic: clean(input.directoryNameArabic, 80) || undefined,
    supportEmail: safeEmail(input.supportEmail), supportUrl: safeUrl(input.supportUrl), privacyUrl: safeUrl(input.privacyUrl), termsUrl: safeUrl(input.termsUrl),
    showPoweredByMizan: !wantsHide,
    updatedAt: iso(ctx.at), updatedBy: ctx.actor.uid,
  };
  if (existing) Object.assign(existing, record); else ctx.s.brandProfiles.push(record);
  if (ownerType === 'organization') {
    const license = ctx.s.licenses.find(l => l.organizationId === ownerId);
    if (license && mode !== 'mizan') { license.brandingLevel = mode === 'full_white_label' ? 'full' : 'co_branded'; license.whiteLabelEnabled = true; }
  }
  const org = ownerType === 'organization' ? ctx.s.organizations.find(o => o.id === ownerId) : undefined;
  ctx.audit({ tenantId: org?.tenantId, organizationId: org?.id, action: 'WHITE_LABEL_CHANGED', entityType: `${ownerType}_brand`, entityId: record.id, reason: `${ownerType}:${ownerId} ${mode} poweredBy=${record.showPoweredByMizan}` });
  return record;
}

/* ————————————————————————————— custom domains ————————————————————————————— */

const HOSTNAME = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const RESERVED_HOST_SUFFIXES = ['mizan.app', 'run.app', 'localhost'];

export function normalizeHostname(value: unknown) {
  const h = clean(value, 253).toLowerCase().replace(/\.$/, '');
  if (!HOSTNAME.test(h)) throw new CommercialError('DOMAIN_HOSTNAME_INVALID');
  if (RESERVED_HOST_SUFFIXES.some(r => h === r || h.endsWith(`.${r}`))) throw new CommercialError('DOMAIN_HOSTNAME_RESERVED');
  return h;
}

export const verificationRecordName = (hostname: string) => `_mizan-verify.${hostname}`;

export function requestCustomDomain(ctx: EngineCtx, ownerType: 'operator' | 'organization', ownerId: string, input: { hostname: string; purpose?: 'platform' | 'discover' }) {
  assertBrandOwner(ctx, ownerType, ownerId);
  if (!rightsFor(ctx.s, ownerType, ownerId, ctx.at).customDomain) throw new CommercialError('CUSTOM_DOMAIN_NOT_PERMITTED');
  const hostname = normalizeHostname(input.hostname);
  const taken = ctx.s.customDomains.find(d => d.hostname === hostname && d.status !== 'disabled');
  if (taken) {
    if (taken.ownerType === ownerType && taken.ownerId === ownerId) return taken;
    throw new CommercialError('DOMAIN_ALREADY_CLAIMED');
  }
  const t = iso(ctx.at);
  const record: CustomDomainRecord = {
    id: ctx.nextId('DOM'), ownerType, ownerId, hostname, purpose: input.purpose === 'discover' ? 'discover' : 'platform', status: 'pending',
    verificationToken: `mizan-verify=${crypto.randomBytes(18).toString('base64url')}`, sslStatus: 'external_pending', createdAt: t, updatedAt: t,
  };
  ctx.s.customDomains.push(record);
  ctx.audit({ action: 'CUSTOM_DOMAIN_REQUESTED', entityType: 'custom_domain', entityId: record.id, reason: `${ownerType}:${ownerId} ${hostname}` });
  return record;
}

/** Record a DNS verification result (the lookup itself happens outside the state transaction). */
export function recordDomainVerification(ctx: EngineCtx, domainId: string, result: { txtRecords: string[] | null; error?: string }) {
  const d = ctx.s.customDomains.find(x => x.id === domainId);
  if (!d) throw new CommercialError('DOMAIN_NOT_FOUND');
  assertBrandOwner(ctx, d.ownerType, d.ownerId);
  if (d.status === 'disabled') throw new CommercialError('DOMAIN_DISABLED');
  d.lastCheckedAt = iso(ctx.at);
  d.updatedAt = d.lastCheckedAt;
  const ok = !!result.txtRecords?.some(r => r.trim() === d.verificationToken);
  if (ok) {
    d.status = 'active'; d.verifiedAt = d.lastCheckedAt; d.lastError = undefined;
  } else {
    d.status = 'failed'; d.lastError = result.error || 'VERIFICATION_TXT_NOT_FOUND';
  }
  ctx.audit({ action: ok ? 'CUSTOM_DOMAIN_VERIFIED' : 'CUSTOM_DOMAIN_VERIFICATION_FAILED', entityType: 'custom_domain', entityId: d.id, reason: `${d.hostname} ${d.lastError || ''}` });
  return d;
}

export function disableCustomDomain(ctx: EngineCtx, domainId: string, reason: string) {
  const d = ctx.s.customDomains.find(x => x.id === domainId);
  if (!d) throw new CommercialError('DOMAIN_NOT_FOUND');
  assertBrandOwner(ctx, d.ownerType, d.ownerId);
  d.status = 'disabled'; d.updatedAt = iso(ctx.at);
  ctx.audit({ action: 'CUSTOM_DOMAIN_DISABLED', entityType: 'custom_domain', entityId: d.id, reason: `${d.hostname} ${clean(reason, 200)}` });
  return d;
}

/* ————————————————————————————— brand resolution ————————————————————————————— */

export interface ResolvedBrand {
  context: 'mizan' | 'operator' | 'organization';
  operatorId?: string;
  organizationId?: string;
  hostname?: string;
  brandingMode: BrandingMode;
  productName: string;
  productNameArabic?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  loginTitle?: string;
  loginTitleArabic?: string;
  directoryName: string;
  directoryNameArabic?: string;
  supportEmail?: string;
  supportUrl?: string;
  privacyUrl?: string;
  termsUrl?: string;
  showPoweredByMizan: boolean;
  /** Which Discover listings this host may show. */
  directoryScope: { kind: 'global' } | { kind: 'operator'; operatorId: string } | { kind: 'organization'; organizationId: string };
}

const mizanBrand = (hostname?: string): ResolvedBrand => ({
  context: 'mizan', hostname, brandingMode: 'mizan', productName: MIZAN_BRAND.productName, productNameArabic: MIZAN_BRAND.productNameArabic,
  directoryName: MIZAN_BRAND.directoryName, directoryNameArabic: MIZAN_BRAND.directoryNameArabic, showPoweredByMizan: true, directoryScope: { kind: 'global' },
});

/**
 * Host → brand. An active custom domain resolves to its owner's brand, clamped to the rights in
 * force *now* (a lapsed agreement falls back to MIZAN branding instead of keeping stale rights).
 */
export function resolveBrandForHost(s: CommercialState, rawHost: string | undefined, at: number): ResolvedBrand {
  const hostname = clean(rawHost, 253).toLowerCase().split(':')[0].replace(/\.$/, '');
  const domain = hostname ? s.customDomains.find(d => d.hostname === hostname && d.status === 'active') : undefined;
  if (!domain) return mizanBrand(hostname || undefined);
  const rights = rightsFor(s, domain.ownerType, domain.ownerId, at);
  if (!rights.customDomain) return mizanBrand(hostname);
  const profile = s.brandProfiles.find(b => b.ownerType === domain.ownerType && b.ownerId === domain.ownerId);
  const operatorId = domain.ownerType === 'operator' ? domain.ownerId : s.organizations.find(o => o.id === domain.ownerId)?.operatorId;
  const scope: ResolvedBrand['directoryScope'] = domain.ownerType === 'operator'
    ? { kind: 'operator', operatorId: domain.ownerId }
    : { kind: 'organization', organizationId: domain.ownerId };
  if (!profile || profile.brandingMode === 'mizan') return { ...mizanBrand(hostname), directoryScope: scope, context: domain.ownerType, operatorId, organizationId: domain.ownerType === 'organization' ? domain.ownerId : undefined };
  const mode: BrandingMode = MODE_RANK[profile.brandingMode] > MODE_RANK[rights.maxMode] ? rights.maxMode : profile.brandingMode;
  const hide = mode === 'full_white_label' && rights.hideMizanBrand && !profile.showPoweredByMizan;
  return {
    context: domain.ownerType, operatorId, organizationId: domain.ownerType === 'organization' ? domain.ownerId : undefined, hostname,
    brandingMode: mode, productName: mode === 'mizan' ? MIZAN_BRAND.productName : profile.productName,
    productNameArabic: mode === 'mizan' ? MIZAN_BRAND.productNameArabic : profile.productNameArabic,
    logoUrl: profile.logoUrl, faviconUrl: profile.faviconUrl, primaryColor: profile.primaryColor, accentColor: profile.accentColor,
    loginTitle: profile.loginTitle, loginTitleArabic: profile.loginTitleArabic,
    directoryName: profile.directoryName || (mode === 'full_white_label' ? `${profile.productName} Discover` : MIZAN_BRAND.directoryName),
    directoryNameArabic: profile.directoryNameArabic, supportEmail: profile.supportEmail, supportUrl: profile.supportUrl,
    privacyUrl: profile.privacyUrl, termsUrl: profile.termsUrl, showPoweredByMizan: !hide, directoryScope: scope,
  };
}

/* ————————————————————————————— Discover publishing ————————————————————————————— */

export interface ListingInput {
  competitionId: string;
  title: string;
  titleArabic?: string;
  summary?: string;
  summaryArabic?: string;
  registrationOpen?: boolean;
  registrationUrl?: string;
  startsOn?: string;
  endsOn?: string;
  registrationClosesOn?: string;
  country?: string;
  city?: string;
  mode?: PublishedCompetitionListing['mode'];
  publicCategories?: string[];
  riwayat?: string[];
  ageRanges?: string[];
  languages?: string[];
  memorizationLevels?: string[];
  visibility?: Partial<DiscoverVisibility>;
}

const list = (v: unknown, max = 20) => Array.isArray(v) ? v.map(x => clean(x, 80)).filter(Boolean).slice(0, max) : [];
const day = (v: unknown) => { const d = clean(v, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined; };
const slugify = (v: string) => v.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'competition';

function assertListingManager(ctx: EngineCtx, organizationId: string) {
  const { actor } = ctx;
  if (actor.role === 'super_admin') return;
  const org = organizationOf(ctx.s, organizationId);
  if (isOperatorRole(actor.role) && actor.operatorId && org.operatorId === actor.operatorId) return;
  if (['org_admin', 'comp_admin'].includes(actor.role) && actor.organizationId === organizationId) return;
  throw new CommercialError('CROSS_TENANT_ACCESS_BLOCKED');
}

/**
 * Publish (or update) a competition's public listing. Only whitelisted public fields are stored.
 * Each visibility flag is checked against the owner's rights; everything defaults to off.
 */
export function publishListing(ctx: EngineCtx, organizationId: string, input: ListingInput) {
  assertListingManager(ctx, organizationId);
  const s = ctx.s;
  const org = organizationOf(s, organizationId);
  const competitionId = clean(input.competitionId, 120);
  if (!competitionId) throw new CommercialError('COMPETITION_ID_REQUIRED');
  const tracked = s.competitions.find(c => c.id === competitionId);
  if (tracked && tracked.organizationId !== organizationId) throw new CommercialError('CROSS_TENANT_ACCESS_BLOCKED');
  const title = clean(input.title, 160);
  if (!title) throw new CommercialError('LISTING_TITLE_REQUIRED');
  const rights = organizationBrandRights(s, organizationId, ctx.at);
  const operatorManaged = commercialOwnerOf(org) === 'operator';
  const want: DiscoverVisibility = {
    organizationDirectory: !!input.visibility?.organizationDirectory,
    operatorDirectory: !!input.visibility?.operatorDirectory,
    globalSyndication: !!input.visibility?.globalSyndication,
  };
  if (want.operatorDirectory && !(operatorManaged && rights.operatorDirectory)) throw new CommercialError('OPERATOR_DIRECTORY_NOT_PERMITTED');
  if (want.globalSyndication && !rights.globalSyndication) throw new CommercialError('GLOBAL_SYNDICATION_NOT_PERMITTED');
  const registrationUrl = input.registrationUrl ? clean(input.registrationUrl, 500) : undefined;
  if (registrationUrl && !/^https:\/\//i.test(registrationUrl) && !registrationUrl.startsWith('/') && !registrationUrl.startsWith('#')) throw new CommercialError('REGISTRATION_URL_INVALID');
  const existing = s.discoverListings.find(l => l.competitionId === competitionId && l.organizationId === organizationId);
  const previousVisibility = existing?.visibility;
  let publicSlug = existing?.publicSlug;
  if (!publicSlug) {
    const base = slugify(`${org.shortName}-${input.title}`);
    publicSlug = base;
    for (let n = 2; s.discoverListings.some(l => l.publicSlug === publicSlug); n++) publicSlug = `${base}-${n}`;
  }
  const t = iso(ctx.at);
  const mode = input.mode && ['online', 'in_person', 'hybrid'].includes(input.mode) ? input.mode : 'in_person';
  const listing: PublishedCompetitionListing = {
    id: existing?.id || ctx.nextId('LST'), competitionId, organizationId, operatorId: operatorManaged ? org.operatorId : undefined, publicSlug,
    title, titleArabic: clean(input.titleArabic, 160) || undefined, summary: clean(input.summary, 600) || undefined, summaryArabic: clean(input.summaryArabic, 600) || undefined,
    institutionName: org.officialName, registrationOpen: !!input.registrationOpen, registrationUrl,
    startsOn: day(input.startsOn), endsOn: day(input.endsOn), registrationClosesOn: day(input.registrationClosesOn),
    country: clean(input.country, 2).toUpperCase() || org.country, city: clean(input.city, 80) || undefined, mode,
    publicCategories: list(input.publicCategories), riwayat: list(input.riwayat, 10), ageRanges: list(input.ageRanges, 10),
    languages: list(input.languages, 10), memorizationLevels: list(input.memorizationLevels, 10),
    visibility: want, status: 'published', publishedAt: existing?.publishedAt || t, publishedBy: ctx.actor.uid, updatedAt: t,
  };
  if (existing) Object.assign(existing, listing); else s.discoverListings.push(listing);
  ctx.audit({ tenantId: org.tenantId, organizationId, action: existing ? 'DISCOVER_LISTING_UPDATED' : 'DISCOVER_LISTING_PUBLISHED', entityType: 'discover_listing', entityId: listing.id, reason: JSON.stringify(want) });
  if (previousVisibility && previousVisibility.globalSyndication !== want.globalSyndication) {
    ctx.audit({ tenantId: org.tenantId, organizationId, action: 'DISCOVER_SYNDICATION_CHANGED', entityType: 'discover_listing', entityId: listing.id, reason: `global ${previousVisibility.globalSyndication}→${want.globalSyndication}` });
  }
  return listing;
}

export function unpublishListing(ctx: EngineCtx, listingId: string) {
  const l = ctx.s.discoverListings.find(x => x.id === listingId);
  if (!l) throw new CommercialError('LISTING_NOT_FOUND');
  assertListingManager(ctx, l.organizationId);
  l.status = 'unpublished'; l.updatedAt = iso(ctx.at);
  ctx.audit({ organizationId: l.organizationId, action: 'DISCOVER_LISTING_UNPUBLISHED', entityType: 'discover_listing', entityId: l.id });
  return l;
}

export function listingsForOrganization(ctx: EngineCtx, organizationId: string) {
  assertListingManager(ctx, organizationId);
  return ctx.s.discoverListings.filter(l => l.organizationId === organizationId);
}

export interface DiscoverQuery {
  q?: string;
  country?: string;
  mode?: string;
  registrationOpen?: boolean;
  riwaya?: string;
  language?: string;
  limit?: number;
}

const PUBLIC_FIELDS: (keyof PublishedCompetitionListing)[] = [
  'publicSlug', 'title', 'titleArabic', 'summary', 'summaryArabic', 'institutionName', 'registrationOpen', 'registrationUrl',
  'startsOn', 'endsOn', 'registrationClosesOn', 'country', 'city', 'mode', 'publicCategories', 'riwayat', 'ageRanges', 'languages', 'memorizationLevels',
];

/**
 * Public directory query. Scope comes from the resolved host — never from a query parameter —
 * and the visibility flag for that scope is checked on the server for every row.
 */
export function discoverListings(s: CommercialState, brand: ResolvedBrand, query: DiscoverQuery, at: number) {
  const scope = brand.directoryScope;
  const inScope = (l: PublishedCompetitionListing) => {
    if (l.status !== 'published') return false;
    const org = s.organizations.find(o => o.id === l.organizationId);
    if (!org || org.status !== 'active') return false;
    if (scope.kind === 'global') {
      if (!l.visibility.globalSyndication) return false;
      /* حقّ النشر العالمي يُقرأ الآن لا لحظة النشر: عقدٌ انتهى يُسقط الظهور العالمي. */
      return organizationBrandRights(s, l.organizationId, at).globalSyndication;
    }
    if (scope.kind === 'operator') return l.visibility.operatorDirectory && l.operatorId === scope.operatorId && org.operatorId === scope.operatorId && operatorBrandRights(s, scope.operatorId, at).operatorDirectory;
    return l.visibility.organizationDirectory && l.organizationId === scope.organizationId;
  };
  const q = clean(query.q, 80).toLowerCase();
  const rows = s.discoverListings.filter(inScope).filter(l => {
    if (query.country && l.country !== clean(query.country, 2).toUpperCase()) return false;
    if (query.mode && l.mode !== query.mode) return false;
    if (query.registrationOpen !== undefined && l.registrationOpen !== query.registrationOpen) return false;
    if (query.riwaya && !l.riwayat.includes(clean(query.riwaya, 80))) return false;
    if (query.language && !l.languages.includes(clean(query.language, 80))) return false;
    if (q && ![l.title, l.titleArabic, l.summary, l.summaryArabic, l.institutionName, l.city].some(v => v?.toLowerCase().includes(q))) return false;
    return true;
  });
  const limit = Math.min(200, Math.max(1, Math.floor(Number(query.limit) || 50)));
  const sorted = rows.sort((a, b) => Number(b.registrationOpen) - Number(a.registrationOpen) || String(a.startsOn || '9999').localeCompare(String(b.startsOn || '9999')));
  return sorted.slice(0, limit).map(l => Object.fromEntries(PUBLIC_FIELDS.map(k => [k, l[k]])));
}
