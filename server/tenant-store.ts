/*
 * سجل الجهات القابل للتحرير أثناء التشغيل.
 *
 * كان السجل يُقرأ من متغيّر بيئة فقط، فإضافة جهة تعني تعديل بيئة النشر وإعادة
 * تشغيل الخادم. وذلك يجعل بيع النظام لجهة جديدة عملًا تقنيًا لا قرارًا إداريًا.
 * هنا يصير السجل ملفًّا يُكتب من لوحة التحكم، فتُضاف الجهة وتعمل فورًا.
 *
 * النطاق الفرعي لا يحتاج أي عمل على مزوّد النطاق: سجل DNS واحد بنمط * يغطّي
 * كل الجهات القادمة. النطاق الخاص وحده يحتاج توجيهًا من الجهة صاحبته.
 */
import fs from 'fs';
import path from 'path';
import type { TenantRecord } from './tenant-registry';

/** أسماء لا تصلح نطاقًا لجهة: تتعارض مع مضيفات النظام أو تنتحل صفته. */
export const RESERVED_SUBDOMAINS = ['www', 'api', 'admin', 'app', 'mail', 'ftp', 'cdn', 'static', 'assets', 'status', 'support', 'help', 'mizan', 'root', 'localhost'];

const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const DOMAIN_RE = /^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/\.$/, '');

export interface TenantValidation { ok: boolean; errors: string[] }

/**
 * يتحقق من جهة واحدة في سياق بقية السجل: الشكل، والتصادم مع جهة أخرى.
 * التصادم خطأ لا تحذير — مضيف واحد يحلّ إلى جهتين يعني تسرّب بيانات بينهما.
 */
export function validateTenant(candidate: TenantRecord, others: TenantRecord[]): TenantValidation {
  const errors: string[] = [];
  const orgId = String(candidate.orgId || '').trim();
  if (!orgId) errors.push('ORG_ID_REQUIRED');
  else if (!/^[A-Za-z0-9_-]{2,64}$/.test(orgId)) errors.push('ORG_ID_INVALID');

  const sub = norm(candidate.subdomain);
  if (sub) {
    if (!SUBDOMAIN_RE.test(sub)) errors.push('SUBDOMAIN_INVALID');
    else if (RESERVED_SUBDOMAINS.includes(sub)) errors.push('SUBDOMAIN_RESERVED');
    else if (others.some(t => norm(t.subdomain) === sub)) errors.push('SUBDOMAIN_TAKEN');
  }

  const domains = Array.isArray(candidate.customDomains) ? candidate.customDomains.map(norm).filter(Boolean) : [];
  for (const d of domains) {
    if (!DOMAIN_RE.test(d)) { errors.push(`CUSTOM_DOMAIN_INVALID:${d}`); continue; }
    if (others.some(t => (t.customDomains || []).map(norm).includes(d))) errors.push(`CUSTOM_DOMAIN_TAKEN:${d}`);
  }
  if (new Set(domains).size !== domains.length) errors.push('CUSTOM_DOMAIN_DUPLICATE');

  if (!sub && domains.length === 0) errors.push('HOST_REQUIRED');
  if (candidate.status && candidate.status !== 'active' && candidate.status !== 'suspended') errors.push('STATUS_INVALID');

  // فحص شروط الشعار لتفادي الروابط المكسورة أو غير الآمنة
  if (candidate.logoUrl) {
    const rawLogo = String(candidate.logoUrl).trim();
    const isSafeHttps = /^https:\/\/[^\s$.?#].[^\s]*$/i.test(rawLogo);
    const isSafeDataUri = /^data:image\/(?:png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(rawLogo);
    if (!isSafeHttps && !isSafeDataUri) {
      errors.push('LOGO_URL_INVALID');
    }
  }

  // فحص رابط الموقع الإلكتروني
  if (candidate.websiteUrl) {
    const rawWeb = String(candidate.websiteUrl).trim();
    if (!/^https?:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?::\d+)?(?:\/.*)?$/i.test(rawWeb)) {
      errors.push('WEBSITE_URL_INVALID');
    }
  }

  // فحص رقم الهاتف
  if (candidate.phoneNumber) {
    const rawPhone = String(candidate.phoneNumber).trim();
    if (!/^\+?[0-9\s\-().]{6,25}$/.test(rawPhone)) {
      errors.push('PHONE_NUMBER_INVALID');
    }
  }

  // فحص البريد الإلكتروني الرسمي
  if (candidate.supportEmail) {
    const rawEmail = String(candidate.supportEmail).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      errors.push('EMAIL_INVALID');
    }
  }

  return { ok: errors.length === 0, errors };
}

/** يوحّد شكل السجل قبل الحفظ حتى لا يعتمد الحلّ على حالة الأحرف أو المسافات. */
export function normalizeTenant(candidate: TenantRecord): TenantRecord {
  const domains = Array.isArray(candidate.customDomains) ? candidate.customDomains.map(norm).filter(Boolean) : [];
  const record: TenantRecord = {
    orgId: String(candidate.orgId || '').trim(),
    status: candidate.status === 'suspended' ? 'suspended' : 'active',
  };
  const sub = norm(candidate.subdomain);
  if (sub) record.subdomain = sub;
  if (domains.length) record.customDomains = [...new Set(domains)];
  if (candidate.displayName) record.displayName = String(candidate.displayName).trim().slice(0, 100);
  if (candidate.displayNameArabic) record.displayNameArabic = String(candidate.displayNameArabic).trim().slice(0, 100);
  if (candidate.logoUrl) record.logoUrl = String(candidate.logoUrl).trim();
  if (candidate.slogan) record.slogan = String(candidate.slogan).trim().slice(0, 200);
  if (candidate.sloganArabic) record.sloganArabic = String(candidate.sloganArabic).trim().slice(0, 200);
  if (candidate.websiteUrl) record.websiteUrl = String(candidate.websiteUrl).trim();
  if (candidate.phoneNumber) record.phoneNumber = String(candidate.phoneNumber).trim();
  if (candidate.supportEmail) record.supportEmail = String(candidate.supportEmail).trim().toLowerCase();
  if (candidate.address) record.address = String(candidate.address).trim().slice(0, 300);
  if (candidate.addressArabic) record.addressArabic = String(candidate.addressArabic).trim().slice(0, 300);
  if (candidate.displayPlacements && typeof candidate.displayPlacements === 'object') {
    record.displayPlacements = {
      showHeaderLogo: candidate.displayPlacements.showHeaderLogo !== false,
      showHeaderSlogan: Boolean(candidate.displayPlacements.showHeaderSlogan),
      showHeaderContact: Boolean(candidate.displayPlacements.showHeaderContact),
      showFooterContact: candidate.displayPlacements.showFooterContact !== false,
      showFooterAddress: candidate.displayPlacements.showFooterAddress !== false,
      showFooterWebsite: candidate.displayPlacements.showFooterWebsite !== false,
      showOnCertificates: candidate.displayPlacements.showOnCertificates !== false,
      showOnVenueScreens: candidate.displayPlacements.showOnVenueScreens !== false,
      showOnPublicPortal: candidate.displayPlacements.showOnPublicPortal !== false,
    };
  }
  if (candidate.note) record.note = String(candidate.note).trim().slice(0, 300);
  return record;
}

export class TenantStore {
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
    const dir = path.dirname(file);
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  list(): TenantRecord[] {
    try {
      const value = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const rows = Array.isArray(value) ? value : Array.isArray(value?.tenants) ? value.tenants : [];
      return rows.filter((t: TenantRecord) => t && typeof t.orgId === 'string' && t.orgId);
    } catch { return []; }
  }

  /* الكتابة عبر ملف مؤقت ثم إبدال ذرّي: انقطاعُ تيار أثناء الحفظ لا يترك سجلًا نصفه
     مكتوب، فتفقد كل الجهات نطاقاتها دفعة واحدة. */
  private write(rows: TenantRecord[]) {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ tenants: rows }, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  /** يضيف جهة جديدة. معرّف مكرَّر يُرفض: التحديث له مسار خاص. */
  add(candidate: TenantRecord): { ok: true; tenant: TenantRecord } | { ok: false; errors: string[] } {
    const rows = this.list();
    const record = normalizeTenant(candidate);
    if (rows.some(t => t.orgId === record.orgId)) return { ok: false, errors: ['ORG_ID_TAKEN'] };
    const check = validateTenant(record, rows);
    if (!check.ok) return { ok: false, errors: check.errors };
    this.write([...rows, record]);
    return { ok: true, tenant: record };
  }

  /** يعدّل جهة قائمة. يُستثنى سجلها نفسه من فحص التصادم وإلا اصطدمت بذاتها. */
  update(orgId: string, patch: Partial<TenantRecord>): { ok: true; tenant: TenantRecord } | { ok: false; errors: string[] } {
    const rows = this.list();
    const index = rows.findIndex(t => t.orgId === orgId);
    if (index < 0) return { ok: false, errors: ['ORG_NOT_FOUND'] };
    const record = normalizeTenant({ ...rows[index], ...patch, orgId });
    const check = validateTenant(record, rows.filter((_, i) => i !== index));
    if (!check.ok) return { ok: false, errors: check.errors };
    const next = [...rows];
    next[index] = record;
    this.write(next);
    return { ok: true, tenant: record };
  }

  /* الجهة تُوقَف ولا تُحذف: حذفها يفتح نطاقها لجهة أخرى، فترث بيانات لا تخصّها. */
  suspend(orgId: string) { return this.update(orgId, { status: 'suspended' }); }
  activate(orgId: string) { return this.update(orgId, { status: 'active' }); }
}
