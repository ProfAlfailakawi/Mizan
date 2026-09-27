/*
 * الدخول الموحّد للمؤسسات (SAML / OIDC) عبر Firebase Identity Platform.
 *
 * لا نكتب تحقق توقيع SAML بأنفسنا: التحقق يتم في Identity Platform الذي تعتمد عليه المنصّة
 * أصلًا. وهذه الوحدة تحفظ إعداد الجهة (معرّف المزوّد في Firebase، النطاقات المسموحة، خريطة
 * المجموعات إلى الأدوار)، وتكشف المزوّد لشاشة الدخول بالنطاق، وتقترح الدور من المجموعات.
 *
 * والصلاحية لا تُمنح من المجموعة وحدها: الدور المقترح يمرّ بحوكمة الهويات (دعوة واعتماد)،
 * ولا تقترح الخريطة أبدًا دورًا منصّيًا أو دور مشغّل. أقلّ صلاحية دائمًا.
 *
 * يتطلّب تفعيلُه خارجيًا: ترقية مشروع Firebase إلى Identity Platform، وتسجيل مزوّد SAML/OIDC
 * للجهة هناك (شهادة IdP، ومعرّف الكيان، وعنوان ACS). بدون ذلك يبقى الإعداد «مسودة».
 */
import fs from 'fs';
import path from 'path';

export const SSO_ASSIGNABLE_ROLES = ['org_admin', 'comp_admin', 'head_judge', 'judge', 'ops_manager', 'auditor', 'exception_host', 'delegation_manager', 'support_agent'] as const;
export type SsoRole = typeof SSO_ASSIGNABLE_ROLES[number];

export interface SsoConfig {
  organizationId: string;
  protocol: 'saml' | 'oidc';
  /** Firebase Identity Platform provider id, e.g. `saml.acme-university` or `oidc.acme`. */
  firebaseProviderId: string;
  displayName: string;
  allowedEmailDomains: string[];
  groupsAttribute: string;
  roleMapping: { group: string; role: SsoRole }[];
  status: 'draft' | 'active' | 'disabled';
  /** When true, password sign-in is discouraged for this organization's domains on the login screen. */
  preferSso: boolean;
  updatedAt: string;
  updatedBy: string;
}

export class SsoError extends Error {}

const DOMAIN = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function validateSsoConfig(input: Partial<SsoConfig>): Omit<SsoConfig, 'organizationId' | 'updatedAt' | 'updatedBy'> {
  const protocol = input.protocol === 'oidc' ? 'oidc' : 'saml';
  const providerId = String(input.firebaseProviderId || '').trim();
  if (!new RegExp(`^${protocol}\\.[a-z0-9][a-z0-9-]{1,60}$`).test(providerId)) throw new SsoError('SSO_PROVIDER_ID_INVALID');
  const domains = [...new Set((input.allowedEmailDomains || []).map(d => String(d).trim().toLowerCase().replace(/^@/, '')))].filter(Boolean);
  if (!domains.length || domains.some(d => !DOMAIN.test(d))) throw new SsoError('SSO_DOMAINS_INVALID');
  if (domains.some(d => ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com'].includes(d))) throw new SsoError('SSO_PUBLIC_EMAIL_DOMAIN_NOT_ALLOWED');
  const mapping = (input.roleMapping || []).map(m => ({ group: String(m.group || '').trim().slice(0, 200), role: m.role }));
  for (const m of mapping) if (!m.group || !(SSO_ASSIGNABLE_ROLES as readonly string[]).includes(m.role)) throw new SsoError('SSO_ROLE_MAPPING_INVALID');
  return {
    protocol, firebaseProviderId: providerId, displayName: String(input.displayName || '').trim().slice(0, 80) || providerId,
    allowedEmailDomains: domains, groupsAttribute: String(input.groupsAttribute || 'groups').trim().slice(0, 80) || 'groups',
    roleMapping: mapping, status: input.status === 'active' || input.status === 'disabled' ? input.status : 'draft', preferSso: !!input.preferSso,
  };
}

/**
 * Suggest a role for an SSO identity. Returns null (deny) when the email domain is not allowed or
 * no group maps. When several groups match, the least-privileged mapped role wins.
 */
export function suggestRole(config: SsoConfig, claims: { email?: string; groups?: string[] | string; signInProvider?: string }): { role: SsoRole; matchedGroup: string } | null {
  if (config.status !== 'active') return null;
  if (claims.signInProvider && claims.signInProvider !== config.firebaseProviderId) return null;
  const domain = String(claims.email || '').toLowerCase().split('@')[1];
  if (!domain || !config.allowedEmailDomains.includes(domain)) return null;
  const groups = Array.isArray(claims.groups) ? claims.groups : String(claims.groups || '').split(',');
  const clean = new Set(groups.map(g => String(g).trim()).filter(Boolean));
  const order: SsoRole[] = ['auditor', 'support_agent', 'delegation_manager', 'exception_host', 'judge', 'ops_manager', 'head_judge', 'comp_admin', 'org_admin'];
  const matches = config.roleMapping.filter(m => clean.has(m.group)).sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  return matches[0] ? { role: matches[0].role, matchedGroup: matches[0].group } : null;
}

export class SsoConfigRepository {
  constructor(private file: string, private clock: () => number = () => Date.now()) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    if (!fs.existsSync(file)) this.write([]);
  }
  private read(): SsoConfig[] { try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { return []; } }
  private write(rows: SsoConfig[]) { const tmp = `${this.file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(rows, null, 2), { mode: 0o600 }); fs.renameSync(tmp, this.file); }
  get(organizationId: string) { return this.read().find(c => c.organizationId === organizationId); }
  save(organizationId: string, actorId: string, input: Partial<SsoConfig>) {
    const v = validateSsoConfig(input);
    const rows = this.read();
    const clash = rows.find(c => c.organizationId !== organizationId && c.status === 'active' && c.allowedEmailDomains.some(d => v.allowedEmailDomains.includes(d)));
    if (clash) throw new SsoError('SSO_DOMAIN_CLAIMED_BY_ANOTHER_ORGANIZATION');
    const record: SsoConfig = { ...v, organizationId, updatedAt: new Date(this.clock()).toISOString(), updatedBy: actorId };
    this.write([...rows.filter(c => c.organizationId !== organizationId), record]);
    return record;
  }
  /** Public discovery for the login screen: provider for an email's domain, nothing else. */
  discover(email: string) {
    const domain = String(email || '').toLowerCase().split('@')[1];
    if (!domain) return null;
    const c = this.read().find(x => x.status === 'active' && x.allowedEmailDomains.includes(domain));
    return c ? { providerId: c.firebaseProviderId, protocol: c.protocol, displayName: c.displayName, preferSso: c.preferSso } : null;
  }
}
