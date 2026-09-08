/*
 * حلّ الجهة من اسم النطاق.
 *
 * نشرٌ واحد يخدم كل الجهات، وتمييز الجهة يأتي من المضيف الذي وصل منه الطلب:
 *   - نطاق فرعي تحت النطاق الأساسي:  jamiat-x.mizan.app  ⇒  الجهة "jamiat-x"
 *   - نطاق خاص بالجهة تُوجَّهه إلينا:  quran.jamiatx.org  ⇒  الجهة المرتبطة به في السجل
 *
 * السجل بيانات تشغيلية لا كود: ملف JSON (MIZAN_TENANTS_FILE) أو متغيّر بيئة (MIZAN_TENANTS).
 * غياب السجل ليس خطأً — يعني نشرًا بجهة واحدة، فلا يُحلّ مضيفٌ إلى جهة ولا يُسرَّب اسم جهة أخرى.
 */
import fs from 'fs';

export interface TenantBrandPlacements {
  showHeaderLogo?: boolean;
  showHeaderSlogan?: boolean;
  showHeaderContact?: boolean;
  showFooterContact?: boolean;
  showFooterAddress?: boolean;
  showFooterWebsite?: boolean;
  showOnCertificates?: boolean;
  showOnVenueScreens?: boolean;
  showOnPublicPortal?: boolean;
}

export interface TenantRecord {
  /** معرّف الجهة كما هو في تخزين البيانات: organizations/<orgId>/… */
  orgId: string;
  /** التسمية الظاهرة للمستخدم (الهوية البيضاء). */
  displayName?: string;
  displayNameArabic?: string;
  logoUrl?: string;
  /** الشعار اللفظي أو السلوجن */
  slogan?: string;
  sloganArabic?: string;
  /** الموقع الإلكتروني الرسمي للجهة */
  websiteUrl?: string;
  /** أرقام التواصل والدعم الرسمي */
  phoneNumber?: string;
  /** البريد الإلكتروني الرسمي للاستفسارات والدعم */
  supportEmail?: string;
  /** المقر والعنوان الجغرافي */
  address?: string;
  addressArabic?: string;
  /** خيارات ظهور عناصر الهوية */
  displayPlacements?: TenantBrandPlacements;
  /** النطاق الفرعي تحت النطاق الأساسي، دون نقاط. */
  subdomain?: string;
  /** نطاقات خاصة تُوجَّه إلى هذا النشر. */
  customDomains?: string[];
  /** ملاحظة إدارية للمالك (حال الاشتراك مثلًا). لا تُعرض للزوّار. */
  note?: string;
  status?: 'active' | 'suspended';
}

const normalizeHost = (raw: string) =>
  String(raw || '').trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');

function readTenants(): TenantRecord[] {
  const inline = process.env.MIZAN_TENANTS;
  const file = process.env.MIZAN_TENANTS_FILE;
  const parse = (text: string): TenantRecord[] => {
    try {
      const value = JSON.parse(text);
      const rows = Array.isArray(value) ? value : Array.isArray(value?.tenants) ? value.tenants : [];
      return rows.filter((t: any) => t && typeof t.orgId === 'string' && t.orgId);
    } catch { return []; }
  };
  if (inline) return parse(inline);
  if (file) { try { return parse(fs.readFileSync(file, 'utf8')); } catch { return []; } }
  return [];
}

/** يُقرأ مرة ويُخزَّن؛ السجل يتغيّر مع النشر لا مع كل طلب. */
let cached: TenantRecord[] | null = null;
export const tenantRegistry = (): TenantRecord[] => (cached ??= readTenants());
export const resetTenantRegistry = () => { cached = null; };

export const baseDomain = () => normalizeHost(process.env.MIZAN_BASE_DOMAIN || '');

/**
 * يعيد الجهة صاحبة هذا المضيف، أو null.
 * النطاق الخاص يُقدَّم على النطاق الفرعي: الجهة التي طلبت نطاقها تتوقعه هو الحاكم.
 */
export function resolveTenant(host: string | undefined, tenants: TenantRecord[] = tenantRegistry()): TenantRecord | null {
  const h = normalizeHost(host || '');
  if (!h) return null;
  const active = tenants.filter(t => t.status !== 'suspended');

  const custom = active.find(t => (t.customDomains || []).some(d => normalizeHost(d) === h));
  if (custom) return custom;

  const base = baseDomain();
  if (base && h !== base && h.endsWith(`.${base}`)) {
    const label = h.slice(0, -(base.length + 1));
    // نطاق فرعي واحد فقط؛ "a.b.mizan.app" ليس جهة "a".
    if (label && !label.includes('.')) {
      const byLabel = active.find(t => normalizeHost(t.subdomain || '') === label);
      if (byLabel) return byLabel;
    }
  }
  return null;
}

/** الشكل الذي يراه المتصفح: هوية العرض فقط، دون تفاصيل السجل الأخرى. */
export const publicTenant = (t: TenantRecord) => {
  const res: Record<string, unknown> = {
    orgId: t.orgId,
    displayName: t.displayName || null,
    displayNameArabic: t.displayNameArabic || null,
    logoUrl: t.logoUrl || null,
  };
  if (t.slogan !== undefined) res.slogan = t.slogan;
  if (t.sloganArabic !== undefined) res.sloganArabic = t.sloganArabic;
  if (t.websiteUrl !== undefined) res.websiteUrl = t.websiteUrl;
  if (t.phoneNumber !== undefined) res.phoneNumber = t.phoneNumber;
  if (t.supportEmail !== undefined) res.supportEmail = t.supportEmail;
  if (t.address !== undefined) res.address = t.address;
  if (t.addressArabic !== undefined) res.addressArabic = t.addressArabic;
  if (t.displayPlacements !== undefined) res.displayPlacements = t.displayPlacements;
  return res;
};
