#!/usr/bin/env python3
from pathlib import Path
import re

ROOT=Path.cwd()

def read(rel):
    p=ROOT/rel
    if not p.is_file(): raise RuntimeError(f'missing {rel}')
    return p.read_text(encoding='utf-8')

def write(rel,text):
    p=ROOT/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text,encoding='utf-8')

def rep(text,old,new,rel,label,count=1):
    got=text.count(old)
    if got!=count: raise RuntimeError(f'{rel}: {label}: expected {count}, got {got}')
    return text.replace(old,new,count)

def sub(text,pattern,repl,rel,label,count=1,flags=re.S):
    out,n=re.subn(pattern,repl,text,count=count,flags=flags)
    if n!=count: raise RuntimeError(f'{rel}: {label}: expected {count}, got {n}')
    return out

# -----------------------------------------------------------------------------
# 1) Shared input normalization / validation, used by browser and server.
# -----------------------------------------------------------------------------
write('shared/input-validation.ts', r'''const DIGITS:Record<string,string>={
 '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
 '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9',
};
export const toAsciiDigits=(value:unknown)=>String(value??'').replace(/[٠-٩۰-۹]/g,d=>DIGITS[d]||d);
export const normalizeSpaces=(value:unknown)=>toAsciiDigits(value).replace(/\s+/g,' ').trim();
export const normalizeEmail=(value:unknown)=>toAsciiDigits(value).trim().replace(/\s+/g,'').toLowerCase();
export const normalizePhone=(value:unknown)=>{
 const raw=toAsciiDigits(value).trim(); const plus=raw.startsWith('+')?'+':'';
 return plus+raw.replace(/[^0-9]/g,'');
};
export const normalizeDomain=(value:unknown)=>toAsciiDigits(value).trim().toLowerCase().replace(/^https?:\/\//i,'').split(/[/?#]/,1)[0].replace(/:\d+$/,'').replace(/\.$/,'');
export const normalizeWebsiteUrl=(value:unknown)=>{
 const raw=toAsciiDigits(value).trim(); if(!raw)return '';
 const candidate=/^https?:\/\//i.test(raw)?raw:`https://${raw}`;
 try{const u=new URL(candidate);if(!['http:','https:'].includes(u.protocol)||!u.hostname)return '';u.username='';u.password='';return u.toString().replace(/\/$/,'')}catch{return ''}
};
export const normalizeArabicText=(value:unknown)=>toAsciiDigits(value).replace(/[A-Za-z]/g,'').replace(/\s{2,}/g,' ');
export const normalizeLatinText=(value:unknown)=>toAsciiDigits(value).replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g,'').replace(/\s{2,}/g,' ');
export const isEmail=(value:unknown)=>/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(value));
export const isDomain=(value:unknown)=>/^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(normalizeDomain(value));
export const isWebsiteUrl=(value:unknown)=>{const n=normalizeWebsiteUrl(value);if(!n)return false;try{return isDomain(new URL(n).hostname)}catch{return false}};
export const isPhone=(value:unknown)=>/^\+?[0-9]{6,18}$/.test(normalizePhone(value));
export const isArabicText=(value:unknown)=>{const v=normalizeSpaces(value);return !v||(!/[A-Za-z]/.test(v)&&/[\u0600-\u06FF]/.test(v))};
export const isLatinText=(value:unknown)=>{const v=normalizeSpaces(value);return !v||(!/[\u0600-\u06FF]/.test(v)&&/[A-Za-z]/.test(v))};
''')
write('src/lib/input-validation.ts', r'''export * from '../../shared/input-validation';
import {normalizeArabicText,normalizeEmail,normalizeLatinText,normalizePhone,toAsciiDigits} from '../../shared/input-validation';

/** One capture-phase guard covers typing and paste across the app without fighting React state. */
export function installInputNormalization(){
 if(typeof document==='undefined'||document.documentElement.dataset.mizanInputGuard==='1')return;
 document.documentElement.dataset.mizanInputGuard='1';
 document.addEventListener('input',event=>{
  const el=event.target;if(!(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement)||el.type==='password')return;
  const kind=el.dataset.mizanKind||'';let next=toAsciiDigits(el.value);
  if(kind==='arabic'||el.lang==='ar')next=normalizeArabicText(next);
  else if(kind==='latin'||el.lang==='en')next=normalizeLatinText(next);
  else if(el instanceof HTMLInputElement&&el.type==='tel')next=normalizePhone(next);
  else if(el instanceof HTMLInputElement&&el.type==='email')next=normalizeEmail(next);
  if(next!==el.value)el.value=next;
 },true);
 document.addEventListener('focusin',event=>{const el=event.target;if(!(el instanceof HTMLInputElement))return;if(['email','url','tel','number'].includes(el.type))el.dir='ltr'},true);
}
''')

rel='src/main.tsx';t=read(rel)
t=rep(t,"import {installAppUpdate} from './lib/app-update';", "import {installAppUpdate} from './lib/app-update';\nimport {installInputNormalization} from './lib/input-validation';",rel,'input guard import')
t=rep(t,'installStaleShellRecovery();','installStaleShellRecovery();\ninstallInputNormalization();',rel,'input guard install')
write(rel,t)

# -----------------------------------------------------------------------------
# 2) Tenant registry: suspended tenants resolve to an explicit state, never disappear.
# -----------------------------------------------------------------------------
rel='server/tenant-registry.ts';t=read(rel)
t=rep(t,"  status?: 'active' | 'suspended';", "  status?: 'active' | 'suspended';\n  certificateTheme?: 'quiet_authority'|'institutional'|'ceremonial';",rel,'certificate theme field')
new_resolver=r'''export function resolveTenantAny(host: string | undefined, tenants: TenantRecord[] = tenantRegistry()): TenantRecord | null {
  const h = normalizeHost(host || '');
  if (!h) return null;
  const custom = tenants.find(t => (t.customDomains || []).some(d => normalizeHost(d) === h));
  if (custom) return custom;
  const base = baseDomain();
  if (base && h !== base && h.endsWith(`.${base}`)) {
    const label = h.slice(0, -(base.length + 1));
    if (label && !label.includes('.')) return tenants.find(t => normalizeHost(t.subdomain || '') === label) || null;
  }
  return null;
}

export function resolveTenant(host: string | undefined, tenants: TenantRecord[] = tenantRegistry()): TenantRecord | null {
  const tenant=resolveTenantAny(host,tenants);return tenant?.status==='suspended'?null:tenant;
}

export const tenantByOrganizationId=(orgId:string,tenants:TenantRecord[]=tenantRegistry())=>tenants.find(t=>t.orgId===orgId)||null;
'''
t=sub(t,r'export function resolveTenant\(host: string \| undefined, tenants: TenantRecord\[\] = tenantRegistry\(\)\): TenantRecord \| null \{.*?\n\}\n\n(?=/\*\* الشكل)',new_resolver+'\n',rel,'tenant resolvers')
t=rep(t,"    orgId: t.orgId,", "    orgId: t.orgId,\n    status: t.status === 'suspended' ? 'suspended' : 'active',",rel,'public status')
t=rep(t,"  if (t.displayPlacements !== undefined) res.displayPlacements = t.displayPlacements;", "  if (t.displayPlacements !== undefined) res.displayPlacements = t.displayPlacements;\n  if (t.certificateTheme !== undefined) res.certificateTheme = t.certificateTheme;",rel,'public certificate theme')
write(rel,t)

# -----------------------------------------------------------------------------
# 3) Tenant store: server-side language/type validation + smart normalization.
# -----------------------------------------------------------------------------
rel='server/tenant-store.ts';t=read(rel)
t=rep(t,"import type { TenantRecord } from './tenant-registry';", "import type { TenantRecord } from './tenant-registry';\nimport {isArabicText,isDomain,isEmail,isLatinText,isPhone,isWebsiteUrl,normalizeDomain,normalizeEmail,normalizePhone,normalizeWebsiteUrl,toAsciiDigits} from '../shared/input-validation';",rel,'shared validation import')
t=rep(t,"const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/\\.$/, '');", "const norm = (v: unknown) => normalizeDomain(v);",rel,'domain normalizer')
validate=r'''export function validateTenant(candidate: TenantRecord, others: TenantRecord[]): TenantValidation {
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
    if (!isDomain(d) || !DOMAIN_RE.test(d)) { errors.push(`CUSTOM_DOMAIN_INVALID:${d}`); continue; }
    if (others.some(t => (t.customDomains || []).map(norm).includes(d))) errors.push(`CUSTOM_DOMAIN_TAKEN:${d}`);
  }
  if (new Set(domains).size !== domains.length) errors.push('CUSTOM_DOMAIN_DUPLICATE');
  if (!sub && domains.length === 0) errors.push('HOST_REQUIRED');
  if (candidate.status && candidate.status !== 'active' && candidate.status !== 'suspended') errors.push('STATUS_INVALID');
  if (candidate.displayNameArabic && !isArabicText(candidate.displayNameArabic)) errors.push('DISPLAY_NAME_AR_INVALID');
  if (candidate.displayName && !isLatinText(candidate.displayName)) errors.push('DISPLAY_NAME_EN_INVALID');
  if (candidate.sloganArabic && !isArabicText(candidate.sloganArabic)) errors.push('SLOGAN_AR_INVALID');
  if (candidate.slogan && !isLatinText(candidate.slogan)) errors.push('SLOGAN_EN_INVALID');
  if (candidate.addressArabic && !isArabicText(candidate.addressArabic)) errors.push('ADDRESS_AR_INVALID');
  if (candidate.address && !isLatinText(candidate.address)) errors.push('ADDRESS_EN_INVALID');
  if (candidate.logoUrl) {
    const rawLogo = String(candidate.logoUrl).trim();
    const isSafeHttps = /^https:\/\/[^\s]+$/i.test(rawLogo);
    const isSafeDataUri = /^data:image\/(?:png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(rawLogo);
    if (!isSafeHttps && !isSafeDataUri) errors.push('LOGO_URL_INVALID');
  }
  if (candidate.websiteUrl && !isWebsiteUrl(candidate.websiteUrl)) errors.push('WEBSITE_URL_INVALID');
  if (candidate.phoneNumber && !isPhone(candidate.phoneNumber)) errors.push('PHONE_NUMBER_INVALID');
  if (candidate.supportEmail && !isEmail(candidate.supportEmail)) errors.push('EMAIL_INVALID');
  if (candidate.certificateTheme && !['quiet_authority','institutional','ceremonial'].includes(candidate.certificateTheme)) errors.push('CERTIFICATE_THEME_INVALID');
  return { ok: errors.length === 0, errors };
}'''
t=sub(t,r'export function validateTenant\(candidate: TenantRecord, others: TenantRecord\[\]\): TenantValidation \{.*?\n\}',validate,rel,'tenant validation')
normalize=r'''export function normalizeTenant(candidate: TenantRecord): TenantRecord {
  const domains = Array.isArray(candidate.customDomains) ? candidate.customDomains.map(norm).filter(Boolean) : [];
  const record: TenantRecord = { orgId:String(candidate.orgId||'').trim(), status:candidate.status==='suspended'?'suspended':'active' };
  const sub=norm(candidate.subdomain); if(sub)record.subdomain=sub;if(domains.length)record.customDomains=[...new Set(domains)];
  if(candidate.displayName)record.displayName=toAsciiDigits(candidate.displayName).trim().slice(0,100);
  if(candidate.displayNameArabic)record.displayNameArabic=toAsciiDigits(candidate.displayNameArabic).trim().slice(0,100);
  if(candidate.logoUrl)record.logoUrl=String(candidate.logoUrl).trim();
  if(candidate.slogan)record.slogan=toAsciiDigits(candidate.slogan).trim().slice(0,200);
  if(candidate.sloganArabic)record.sloganArabic=toAsciiDigits(candidate.sloganArabic).trim().slice(0,200);
  if(candidate.websiteUrl){const u=normalizeWebsiteUrl(candidate.websiteUrl);if(u)record.websiteUrl=u;}
  if(candidate.phoneNumber)record.phoneNumber=normalizePhone(candidate.phoneNumber);
  if(candidate.supportEmail)record.supportEmail=normalizeEmail(candidate.supportEmail);
  if(candidate.address)record.address=toAsciiDigits(candidate.address).trim().slice(0,300);
  if(candidate.addressArabic)record.addressArabic=toAsciiDigits(candidate.addressArabic).trim().slice(0,300);
  if(candidate.certificateTheme)record.certificateTheme=candidate.certificateTheme;
  if(candidate.displayPlacements&&typeof candidate.displayPlacements==='object')record.displayPlacements={
    showHeaderLogo:candidate.displayPlacements.showHeaderLogo!==false,showHeaderSlogan:Boolean(candidate.displayPlacements.showHeaderSlogan),showHeaderContact:Boolean(candidate.displayPlacements.showHeaderContact),showFooterContact:candidate.displayPlacements.showFooterContact!==false,showFooterAddress:candidate.displayPlacements.showFooterAddress!==false,showFooterWebsite:candidate.displayPlacements.showFooterWebsite!==false,showOnCertificates:candidate.displayPlacements.showOnCertificates!==false,showOnVenueScreens:candidate.displayPlacements.showOnVenueScreens!==false,showOnPublicPortal:candidate.displayPlacements.showOnPublicPortal!==false,
  };
  if(candidate.note)record.note=toAsciiDigits(candidate.note).trim().slice(0,300);
  return record;
}'''
t=sub(t,r'export function normalizeTenant\(candidate: TenantRecord\): TenantRecord \{.*?\n\}',normalize,rel,'tenant normalization')
write(rel,t)

# -----------------------------------------------------------------------------
# 4) Public tenant client + suspended organization screen.
# -----------------------------------------------------------------------------
write('src/lib/tenant.ts', r'''import type { BrandDisplayPlacements } from '../types';
export interface PublicTenant {
 orgId:string;status?:'active'|'suspended';displayName:string|null;displayNameArabic:string|null;logoUrl:string|null;
 slogan?:string|null;sloganArabic?:string|null;websiteUrl?:string|null;phoneNumber?:string|null;supportEmail?:string|null;address?:string|null;addressArabic?:string|null;displayPlacements?:BrandDisplayPlacements|null;certificateTheme?:'quiet_authority'|'institutional'|'ceremonial'|null;
}
export async function fetchTenant(signal?:AbortSignal):Promise<PublicTenant|null>{
 try{const r=await fetch('/api/public/tenant',{signal,headers:{accept:'application/json'}});if(r.status===204)return null;const body=await r.json().catch(()=>null) as PublicTenant|null;if(!r.ok||!body||typeof body.orgId!=='string'||!body.orgId)return null;return body}catch{return null}
}
''')
rel='src/App.tsx';t=read(rel)
insert=r'''const TenantSuspendedScreen:React.FC<{language:string}>=({language})=>{const ar=language==='ar';return <div className="min-h-screen grid place-items-center bg-[#f7f5ef] p-5" dir={ar?'rtl':'ltr'}><div className="mizan-surface max-w-lg p-8 sm:p-10 text-center"><div className="flex justify-center"><MizanLogo language={ar?'ar':'en'} compact/></div><div className="mizan-kicker mt-6">{ar?'حالة الجهة':'ORGANIZATION STATUS'}</div><h1 className="text-2xl font-black mt-2">{ar?'تم إيقاف وصول هذه الجهة مؤقتًا':'Organization access is temporarily suspended'}</h1><p className="text-sm text-[#636864] leading-7 mt-4">{ar?'بيانات الجهة ومسابقاتها محفوظة بالكامل، لكن الوصول التشغيلي متوقف حاليًا. يرجى التواصل مع إدارة المنصة.':'All organization data remains محفوظة; operational access is temporarily unavailable. Please contact the platform administrator.'}</p></div></div>};

'''
t=rep(t,'export default function App() {',insert+'export default function App() {',rel,'suspended screen')
t=rep(t," const [experienceHome,setExperienceHome]=useState(()=>demoMode && !window.location.hash);", " const [experienceHome,setExperienceHome]=useState(()=>demoMode && !window.location.hash);\n const [tenantSuspended,setTenantSuspended]=useState(false);",rel,'tenant suspended state')
old=""" useEffect(()=>{const c=new AbortController();void fetchTenant(c.signal).then(t=>{if(!t)return;\n  updateOrganizationBrand({"""
new=""" useEffect(()=>{const c=new AbortController();void fetchTenant(c.signal).then(t=>{if(!t)return;setTenantSuspended(t.status==='suspended');if(t.status==='suspended')return;\n  updateOrganizationBrand({"""
t=rep(t,old,new,rel,'tenant hydrate suspended')
t=rep(t," if(marketing) return <Suspense fallback={<ViewFallback/>}><MarketingSite/></Suspense>;", " if(marketing) return <Suspense fallback={<ViewFallback/>}><MarketingSite/></Suspense>;\n if(tenantSuspended) return <TenantSuspendedScreen language={language}/>;",rel,'blocked render')
write(rel,t)

# -----------------------------------------------------------------------------
# 5) Server tenant persistence read endpoint + hard suspended enforcement.
# -----------------------------------------------------------------------------
rel='server.ts';t=read(rel)
t=rep(t,"import { publicTenant, resolveTenant, resetTenantRegistry, tenantRegistry } from './server/tenant-registry';", "import { publicTenant, resolveTenantAny, resetTenantRegistry, tenantRegistry, tenantByOrganizationId } from './server/tenant-registry';",rel,'tenant registry imports')
needle="""  const requireGovernanceRoles=(roles:string[]):RequestHandler=>async(req,res,next)=>{const raw=String(req.headers.authorization||'');"""
replacement="""  const tenantAccessBlocked=(identity:ServerIdentity)=>identity.role!=='super_admin'&&tenantByOrganizationId(identity.organizationId)?.status==='suspended';\n  const requireGovernanceRoles=(roles:string[]):RequestHandler=>async(req,res,next)=>{const raw=String(req.headers.authorization||'');"""
t=rep(t,needle,replacement,rel,'tenant access helper')
old="if(!roles.includes(identity.role))return res.status(403).json({code:'ROLE_NOT_ALLOWED'});if(!mfaSatisfied(base,identity.role))return res.status(403).json({code:'MFA_REQUIRED'});(req as any).firebaseBase=base;"
new="if(!roles.includes(identity.role))return res.status(403).json({code:'ROLE_NOT_ALLOWED'});if(tenantAccessBlocked(identity))return res.status(423).json({code:'TENANT_SUSPENDED'});if(!mfaSatisfied(base,identity.role))return res.status(403).json({code:'MFA_REQUIRED'});(req as any).firebaseBase=base;"
if t.count(old)!=2: raise RuntimeError(f'{rel}: expected 2 auth role bodies, got {t.count(old)}')
t=t.replace(old,new,2)
t=rep(t,'    const tenant=resolveTenant(host);','    const tenant=resolveTenantAny(host);',rel,'public suspended resolve')
# Insert authoritative GET for brand before PATCH.
marker="""  /* تحديث الهوية البيضاء وإعدادات الشعار والعرض للجهة المشترية (org_admin أو super_admin) */\n  const brandAdmins = requireFirebaseRoles(['super_admin', 'org_admin']);\n"""
brand_get="""  /* تحديث الهوية البيضاء وإعدادات الشعار والعرض للجهة المشترية (org_admin أو super_admin) */\n  const brandAdmins = requireFirebaseRoles(['super_admin', 'org_admin']);\n  app.get('/api/tenant/brand', ownerRateLimit, brandAdmins, (req,res)=>{const store=tenantAdmin(res);if(!store)return;const actor=(req as any).mizanIdentity;const isSuper=actor?.role==='super_admin';const orgId=isSuper&&req.query?.orgId?String(req.query.orgId):actor?.organizationId;if(!orgId)return res.status(400).json({code:'ORG_ID_REQUIRED'});const tenant=store.list().find(x=>x.orgId===orgId);if(!tenant)return res.status(404).json({code:'ORG_NOT_FOUND'});res.setHeader('cache-control','no-store');return res.json({tenant});});\n"""
t=rep(t,marker,brand_get,rel,'brand get route')
# Identity grant routes.
route="""  app.post('/api/identity/grants/:id/suspend',requireGovernanceRoles(['super_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.suspendGrant((req as any).mizanIdentity,String(req.params.id),String(req.body?.reason||'')))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'GRANT_SUSPEND_FAILED'})}});\n"""
extra=route+"""  app.post('/api/identity/grants/:id/resume',requireGovernanceRoles(['super_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.resumeGrant((req as any).mizanIdentity,String(req.params.id),String(req.body?.reason||'')))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'GRANT_RESUME_FAILED'})}});\n  app.post('/api/identity/grants/:id/reissue-qr',requireGovernanceRoles(['super_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.reissueQr((req as any).mizanIdentity,String(req.params.id)))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'QR_REISSUE_FAILED'})}});\n"""
t=rep(t,route,extra,rel,'identity resume/reissue routes')
write(rel,t)

# -----------------------------------------------------------------------------
# 6) Identity repository: resume + QR reissue + safe repeat activation.
# -----------------------------------------------------------------------------
rel='server/identity-governance.ts';t=read(rel)
old="""  previewInvitation(token:string){\n    const s=this.read();this.cleanup(s);this.write(s);const tokenHash=hash(String(token||''));const inv=s.invitations.find(x=>x.status==='READY'&&x.activationTokenHash===tokenHash);\n    if(!inv)throw new Error('ACTIVATION_TOKEN_INVALID');\n    return {email:inv.email,displayName:inv.displayName,requestedRole:inv.requestedRole,organizationId:inv.organizationId,competitionId:inv.competitionId,expiresAt:inv.expiresAt};\n  }"""
new="""  previewInvitation(token:string){\n    const s=this.read();this.cleanup(s);this.write(s);const tokenHash=hash(String(token||''));const inv=s.invitations.find(x=>x.status==='READY'&&x.activationTokenHash===tokenHash);\n    if(!inv)throw new Error('ACTIVATION_TOKEN_INVALID');\n    const account=s.accounts.find(a=>a.organizationId===inv.organizationId&&normalizeEmail(a.email)===inv.email&&a.status==='ACTIVE');\n    const existingAccount=!!account&&s.grants.some(g=>g.accountId===account.id&&g.organizationId===inv.organizationId&&g.competitionId===inv.competitionId&&g.role===inv.requestedRole&&g.status==='ACTIVE');\n    return {email:inv.email,displayName:inv.displayName,requestedRole:inv.requestedRole,organizationId:inv.organizationId,competitionId:inv.competitionId,expiresAt:inv.expiresAt,existingAccount};\n  }"""
t=rep(t,old,new,rel,'invitation preview existing')
old_dup="""    if(account&&s.grants.some(g=>g.accountId===account.id&&g.status==='ACTIVE'&&g.competitionId===inv.competitionId))throw new Error('IDENTITY_ALREADY_BOUND_TO_COMPETITION');\n    const now=new Date().toISOString();"""
new_dup="""    const existingGrant=account&&s.grants.find(g=>g.accountId===account.id&&g.status==='ACTIVE'&&g.competitionId===inv.competitionId&&g.role===inv.requestedRole);\n    if(existingGrant){inv.status='ACTIVATED';delete inv.activationTokenHash;this.write(s);this.appendAudit({uid:base.uid,role:existingGrant.role,organizationId:existingGrant.organizationId},'IDENTITY_QR_REISSUE_ACTIVATED','Grant',existingGrant.id,'Reissued one-time QR confirmed the existing competition grant');return {account,grant:existingGrant,reissued:true};}\n    const now=new Date().toISOString();"""
t=rep(t,old_dup,new_dup,rel,'repeat activation')
anchor="""  suspendGrant(actor:ServerIdentity,grantId:string,reason:string){"""
methods=r'''  resumeGrant(actor:ServerIdentity,grantId:string,reason:string){
    if(!['super_admin','org_admin','comp_admin'].includes(actor.role))throw new Error('RESUME_NOT_ALLOWED');if(reason.trim().length<5)throw new Error('RESUME_REASON_REQUIRED');
    const s=this.read();const {grant}=this.scopedGrant(actor,s,grantId);if(grant.status!=='SUSPENDED')throw new Error('GRANT_NOT_SUSPENDED');grant.status='ACTIVE';this.write(s);this.appendAudit({...actor,organizationId:grant.organizationId},'IDENTITY_GRANT_RESUMED','Grant',grant.id,reason);return {grant};
  }

  reissueQr(actor:ServerIdentity,grantId:string){
    if(!['super_admin','org_admin','comp_admin'].includes(actor.role))throw new Error('QR_REISSUE_NOT_ALLOWED');
    const s=this.read();this.cleanup(s);const {grant,account}=this.scopedGrant(actor,s,grantId);if(grant.status!=='ACTIVE')throw new Error('GRANT_NOT_ACTIVE');
    for(const inv of s.invitations)if(inv.organizationId===grant.organizationId&&inv.competitionId===grant.competitionId&&inv.email===normalizeEmail(account.email)&&inv.status==='READY'){inv.status='REVOKED';delete inv.activationTokenHash;}
    const rawToken=crypto.randomBytes(24).toString('base64url');const now=new Date();
    const invitation:Invitation={id:crypto.randomUUID(),organizationId:grant.organizationId,competitionId:grant.competitionId,committeeId:grant.committeeId,email:normalizeEmail(account.email),displayName:account.displayName,requestedRole:grant.role,reason:'Reissued activation QR for existing authorized user',status:'READY',createdAt:now.toISOString(),createdBy:actor.uid,expiresAt:new Date(now.getTime()+48*3600_000).toISOString(),activationTokenHash:hash(rawToken)};
    s.invitations.unshift(invitation);this.write(s);this.appendAudit({...actor,organizationId:grant.organizationId},'IDENTITY_QR_REISSUED','Grant',grant.id,'Previous pending activation QR invalidated; new one-time QR issued');return {invitation:{...invitation,activationTokenHash:undefined},activationToken:rawToken};
  }

'''
t=rep(t,anchor,methods+anchor,rel,'grant resume/reissue methods')
write(rel,t)

# -----------------------------------------------------------------------------
# 7) Auth portal: reissued QR goes directly to existing-account sign in/reset.
# -----------------------------------------------------------------------------
rel='src/components/auth/AuthPortal.tsx';t=read(rel)
t=rep(t,"type InvitationPreview={email:string;displayName:string;requestedRole:string;organizationId:string;competitionId?:string;expiresAt:string};", "type InvitationPreview={email:string;displayName:string;requestedRole:string;organizationId:string;competitionId?:string;expiresAt:string;existingAccount?:boolean};",rel,'preview type')
old="setPreview(body.invitation as InvitationPreview);setEmail(String(body.invitation?.email||''));"
new="setPreview(body.invitation as InvitationPreview);setEmail(String(body.invitation?.email||''));setExistingMode(Boolean(body.invitation?.existingAccount));"
t=rep(t,old,new,rel,'existing mode from preview')
write(rel,t)

# -----------------------------------------------------------------------------
# 8) Identity UI: tenant selector support, per-grant freeze/resume, reissue QR.
# -----------------------------------------------------------------------------
write('src/components/admin/IdentityGovernance.tsx', r'''import React,{useEffect,useMemo,useState} from 'react';
import {KeyRound,ShieldCheck,UserPlus,Laptop2,RefreshCcw,Trash2,QrCode,Copy,PauseCircle,PlayCircle,RotateCcw} from 'lucide-react';
import {useAppStore} from '../../lib/store';import {auth} from '../../lib/firebase';import {Button} from '../design-system/Button';import {Badge} from '../design-system/Badge';import {Modal} from '../design-system/Modal';import {RealQRCode} from '../design-system/RealQRCode';import type {Role} from '../../types';import {isEmail,normalizeEmail,normalizeSpaces} from '../../lib/input-validation';
const ORG_STAFF:Role[]=['comp_admin','head_judge','judge','ops_manager','exception_host','delegation_manager','broadcast_operator','auditor','guardian','support_agent'];const COMP_STAFF:Role[]=['head_judge','judge','ops_manager','exception_host','delegation_manager','broadcast_operator','guardian'];const OWNER_STAFF:Role[]=['org_admin','support_agent'];
const arRole=(r:Role)=>({super_admin:'مدير المنصة',org_admin:'مدير الجهة',comp_admin:'مدير المسابقة',head_judge:'رئيس التحكيم',judge:'محكم',ops_manager:'مدير التشغيل',exception_host:'مكتب الاستثناء',delegation_manager:'مسؤول وفد',participant:'متسابق',broadcast_operator:'مشغل الحفل',auditor:'مدقق',guardian:'ولي أمر',support_agent:'دعم'} as Partial<Record<Role,string>>)[r]||r;
type RemoteData={accounts:any[];grants:any[];invitations:any[];sessions:any[]};
export const activationQrValue=(token:string,origin?:string)=>{const base=(origin||window.location.origin).replace(/\/$/,'');const link=`${base}/#a=${encodeURIComponent(token)}`;return new TextEncoder().encode(link).length<=78?link:`MZI1|${token}`};
export const IdentityGovernance:React.FC<{competitionId?:string;organizationId?:string}>=({competitionId,organizationId})=>{
 const s=useAppStore();const ar=s.language==='ar';const production=import.meta.env.VITE_REQUIRE_AUTH==='true';const competitionScoped=Boolean(competitionId);const scopeOrgId=organizationId||s.organization.id;
 const [email,setEmail]=useState('');const [name,setName]=useState('');const [role,setRole]=useState<Role|''>('');const [message,setMessage]=useState('');const [oneTimeToken,setOneTimeToken]=useState('');const [remote,setRemote]=useState<RemoteData|null>(null);const [loading,setLoading]=useState(false);const [deleteTarget,setDeleteTarget]=useState<{account:any;grant:any}|null>(null);const [deleting,setDeleting]=useState(false);
 const availableRoles=useMemo<Role[]>(()=>s.currentUser.role==='super_admin'?OWNER_STAFF:s.currentUser.role==='comp_admin'?COMP_STAFF:ORG_STAFF,[s.currentUser.role]);
 const api=async(path:string,init:RequestInit={})=>{const u=auth.currentUser;if(!u)throw new Error('IDENTITY_REQUIRED');const token=await u.getIdToken();return fetch(path,{...init,headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...(init.headers||{})}})};
 const loadRemote=async()=>{if(!production)return;setLoading(true);try{const params=new URLSearchParams();if(s.currentUser.role==='super_admin')params.set('organizationId',scopeOrgId);if(competitionId)params.set('competitionId',competitionId);const r=await api(`/api/identity/governance${params.size?`?${params}`:''}`);const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(String(body.code||'IDENTITY_GOVERNANCE_UNAVAILABLE'));setRemote(body)}catch(e){setMessage(e instanceof Error?e.message:(ar?'تعذر تحميل الصلاحيات.':'Could not load access.'));setRemote(null)}finally{setLoading(false)}};
 useEffect(()=>{void loadRemote()},[production,scopeOrgId,competitionId]);
 const devGrants=useMemo(()=>s.roleGrants.filter(g=>g.organizationId===scopeOrgId&&g.role!=='scientific_admin'&&(!competitionId||g.competitionId===competitionId)),[s.roleGrants,scopeOrgId,competitionId]);const ids=useMemo(()=>new Set(devGrants.map(g=>g.accountId)),[devGrants]);const devAccounts=useMemo(()=>s.identityAccounts.filter(a=>a.organizationId===scopeOrgId&&ids.has(a.id)&&!s.roleGrants.some(g=>g.accountId===a.id&&g.role==='super_admin'&&g.status==='ACTIVE')),[s.identityAccounts,s.roleGrants,scopeOrgId,ids]);
 const accounts=production?(remote?.accounts||[]):devAccounts;const grants=production?(remote?.grants||[]):devGrants;const invitations=production?(remote?.invitations||[]):s.identityInvitations.filter(i=>i.organizationId===scopeOrgId&&i.requestedRole!=='scientific_admin'&&(!competitionId||i.competitionId===competitionId));const sessions=production?(remote?.sessions||[]):s.authSessions.filter(x=>x.organizationId===scopeOrgId&&(!competitionId||(x as any).competitionId===competitionId));
 const qrValue=oneTimeToken?activationQrValue(oneTimeToken):'';
 const create=async()=>{setMessage('');setOneTimeToken('');const cleanEmail=normalizeEmail(email),cleanName=normalizeSpaces(name);if(!role||!isEmail(cleanEmail)||!cleanName)return setMessage(ar?'تحقق من الاسم والبريد والدور.':'Check name, email and role.');if(production){try{if(s.currentUser.role!=='super_admin'&&!competitionId)return setMessage('COMPETITION_SCOPE_REQUIRED');const r=await api('/api/identity/invitations',{method:'POST',body:JSON.stringify({email:cleanEmail,displayName:cleanName,requestedRole:role,organizationId:s.currentUser.role==='super_admin'?scopeOrgId:undefined,competitionId:s.currentUser.role==='super_admin'?undefined:competitionId,reason:'Authorized scoped role provisioning'})});const body=await r.json().catch(()=>({}));if(!r.ok)return setMessage(String(body.code||'INVITATION_FAILED'));setEmail('');setName('');setRole('');if(body.activationToken)setOneTimeToken(body.activationToken);setMessage(ar?'الدعوة جاهزة. سلّم QR للشخص المعني فقط.':'Invitation ready. Share the QR only with the intended person.');await loadRemote()}catch{setMessage('IDENTITY_SERVER_UNAVAILABLE')}return}if(!competitionId)return setMessage('COMPETITION_SCOPE_REQUIRED');const r=await s.createIdentityInvitation({email:cleanEmail,displayName:cleanName,requestedRole:role,competitionId,reason:'Authorized competition role provisioning'});if(!r.ok)return setMessage(r.reason);if(r.activationToken)setOneTimeToken(r.activationToken)};
 const grantsFor=(account:any)=>grants.filter((g:any)=>g.accountId===account.id&&['ACTIVE','SUSPENDED'].includes(g.status));
 const toggle=async(grant:any)=>{if(!production)return;const resume=grant.status==='SUSPENDED';const r=await api(`/api/identity/grants/${encodeURIComponent(grant.id)}/${resume?'resume':'suspend'}`,{method:'POST',body:JSON.stringify({reason:resume?'Authorized competition access restored':'Authorized competition access frozen'})});const body=await r.json().catch(()=>({}));setMessage(r.ok?(resume?(ar?'أُعيدت الصلاحية لهذه المسابقة.':'Competition access restored.'):(ar?'جُمّدت الصلاحية لهذه المسابقة وأُغلقت جلساتها.':'Competition access frozen and its sessions closed.')):String(body.code||'ACCESS_CHANGE_FAILED'));await loadRemote()};
 const reissue=async(grant:any)=>{if(!production)return;setOneTimeToken('');const r=await api(`/api/identity/grants/${encodeURIComponent(grant.id)}/reissue-qr`,{method:'POST',body:'{}'});const body=await r.json().catch(()=>({}));if(!r.ok)return setMessage(String(body.code||'QR_REISSUE_FAILED'));setOneTimeToken(String(body.activationToken||''));setMessage(ar?'أُلغي أي QR سابق وصدر QR جديد لمرة واحدة.':'Any previous QR was invalidated and a new one-time QR was issued.');await loadRemote()};
 const revoke=async(grant:any)=>{if(!production)return;const r=await api(`/api/identity/grants/${encodeURIComponent(grant.id)}/revoke-sessions`,{method:'POST',body:JSON.stringify({reason:'Secure session handover'})});const body=await r.json().catch(()=>({}));setMessage(r.ok?(ar?`أُغلقت ${body.count||0} جلسة.`:`${body.count||0} session(s) revoked.`):String(body.code||'SESSION_REVOKE_FAILED'));await loadRemote()};
 const remove=async()=>{if(!deleteTarget||!production)return;setDeleting(true);try{const r=await api(`/api/identity/grants/${encodeURIComponent(deleteTarget.grant.id)}`,{method:'DELETE',body:JSON.stringify({reason:'Scoped access removed by authorized administrator'})});const body=await r.json().catch(()=>({}));if(!r.ok)return setMessage(String(body.code||'REMOVE_FAILED'));setMessage(ar?'أُلغيت هذه الصلاحية فقط، وبقيت بقية صلاحيات المستخدم كما هي.':'Only this grant was removed; the user’s other grants are unchanged.');setDeleteTarget(null);await loadRemote()}finally{setDeleting(false)}};
 const copy=async()=>{try{await navigator.clipboard.writeText(qrValue);setMessage(ar?'تم نسخ رابط/رمز التفعيل.':'Activation link copied.')}catch{setMessage(ar?'تعذر النسخ؛ استخدم QR.':'Copy failed; use the QR.')}};
 return <section className="mizan-surface p-5 sm:p-6">
  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4"><div><div className="mizan-kicker">{ar?'الهوية والصلاحيات':'IDENTITY & ACCESS'}</div><h2 className="text-xl font-black mt-1">{competitionScoped?(ar?'فريق هذه المسابقة فقط':'This competition team only'):(ar?'صلاحيات هذه الجهة':'Organization access')}</h2><p className="text-xs leading-6 text-[#636864] mt-2 max-w-2xl">{competitionScoped?(ar?'أي صلاحية هنا تخص هذه المسابقة وحدها. التجميد والحذف لا يمسان مسابقات أخرى.':'Every grant here belongs only to this competition. Freeze/remove never touches another competition.'):(ar?'رؤية مركزية للحسابات والدعوات وكل صلاحية حسب المسابقة.':'A central view of accounts, invitations and every competition-scoped grant.')}</p></div><div className="grid grid-cols-3 gap-2 min-w-64"><Mini n={grants.filter((g:any)=>g.status==='ACTIVE').length} t={ar?'صلاحيات':'Grants'}/><Mini n={invitations.filter((i:any)=>i.status==='READY').length} t={ar?'دعوات':'Invites'}/><Mini n={sessions.filter((x:any)=>x.status==='ACTIVE').length} t={ar?'جلسات':'Sessions'}/></div></div>
  {production&&<div className="mt-4 rounded-xl bg-[#E7EEE9] text-[#214C40] px-4 py-3 flex items-center gap-3"><ShieldCheck className="w-4 h-4"/><div className="text-[11px] font-bold flex-1">{ar?'العزل والتجميد والحذف تفرض من الخادم، لا بإخفاء الأزرار.':'Isolation, freeze and removal are server-enforced.'}</div><button className="w-11 h-11 grid place-items-center" onClick={()=>void loadRemote()} aria-label={ar?'تحديث':'Refresh'}><RefreshCcw className={`w-4 h-4 ${loading?'animate-spin':''}`}/></button></div>}
  <div className="mt-5 rounded-2xl border border-[#dfddd6] p-4"><div className="flex items-center gap-2"><UserPlus className="w-4 h-4 text-[#2F6555]"/><div className="text-sm font-black">{ar?'إضافة مستخدم':'Invite user'}</div></div><div className="grid sm:grid-cols-2 gap-2 mt-4"><input lang={ar?'ar':'en'} data-mizan-kind={ar?'arabic':'latin'} value={name} onChange={e=>setName(e.target.value)} className="mizan-input" placeholder={ar?'الاسم الحقيقي':'Legal/display name'}/><input type="email" dir="ltr" value={email} onChange={e=>setEmail(e.target.value)} className="mizan-input" placeholder="name@example.com"/><select value={role} onChange={e=>setRole(e.target.value as Role|'')} className="mizan-input sm:col-span-2"><option value="" disabled>{ar?'اختر الدور':'Choose role'}</option>{availableRoles.map(r=><option key={r} value={r}>{ar?arRole(r):r.replaceAll('_',' ')}</option>)}</select></div><Button className="mt-3" disabled={!isEmail(email)||!name.trim()||!role} onClick={()=>void create()} icon={<KeyRound className="w-4 h-4"/>}>{ar?'إنشاء QR التفعيل':'Create activation QR'}</Button>{message&&<div className="mt-3 rounded-xl bg-[#f3f1eb] p-3 text-xs font-bold break-words">{message}</div>}
  {oneTimeToken&&<div className="mt-4 rounded-2xl border border-[#d9e4de] bg-[#F7FAF8] p-4"><div className="flex items-center gap-2 text-[#214C40]"><QrCode className="w-4 h-4"/><div className="text-xs font-black">{ar?'QR تفعيل — لمرة واحدة':'ONE-TIME ACTIVATION QR'}</div></div><div className="mt-4 flex justify-center"><div className="rounded-2xl bg-white p-3 border"><RealQRCode value={qrValue} size={184}/></div></div><button onClick={()=>void copy()} className="mt-3 mx-auto min-h-11 px-3 rounded-xl flex items-center gap-2 text-xs font-bold text-[#214C40]"><Copy className="w-4 h-4"/>{ar?'نسخ رابط احتياطي':'Copy fallback link'}</button></div>}</div>
  <div className="mt-5"><div className="text-sm font-black">{ar?'المستخدمون والصلاحيات':'Users & grants'}</div><div className="mt-3 divide-y divide-[#e5e3dc]">{accounts.map((a:any)=><div key={a.id} className="py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-black text-sm">{a.displayName}</div><div dir="ltr" className="text-[11px] text-[#656b66] break-all">{a.email}</div></div><Badge variant={a.status==='ACTIVE'?'emerald':'neutral'}>{a.status==='ACTIVE'?(ar?'حساب نشط':'Active'):(ar?'حساب موقوف':'Suspended')}</Badge></div><div className="mt-3 space-y-2">{grantsFor(a).map((g:any)=><div key={g.id} className="rounded-xl bg-[#f7f5ef] p-3 flex flex-wrap items-center gap-2"><div className="flex-1 min-w-[180px]"><div className="text-xs font-black">{ar?arRole(g.role):g.role.replaceAll('_',' ')}</div><div className="text-[10px] text-[#656b66] mt-1">{g.competitionId?(ar?`مسابقة: ${g.competitionId}`:`Competition: ${g.competitionId}`):(ar?'صلاحية على مستوى الجهة':'Organization-level grant')}</div></div><Badge variant={g.status==='ACTIVE'?'emerald':'amber'}>{g.status==='ACTIVE'?(ar?'نشطة':'Active'):(ar?'مجمّدة':'Frozen')}</Badge><IconButton title={g.status==='ACTIVE'?(ar?'تجميد الصلاحية':'Freeze access'):(ar?'إعادة الصلاحية':'Restore access')} onClick={()=>void toggle(g)}>{g.status==='ACTIVE'?<PauseCircle className="w-4 h-4"/>:<PlayCircle className="w-4 h-4"/>}</IconButton>{g.status==='ACTIVE'&&<IconButton title={ar?'إصدار QR جديد':'Reissue QR'} onClick={()=>void reissue(g)}><QrCode className="w-4 h-4"/></IconButton>}<IconButton title={ar?'إغلاق جلسات هذه الصلاحية':'Revoke scoped sessions'} onClick={()=>void revoke(g)}><Laptop2 className="w-4 h-4"/></IconButton><IconButton danger title={ar?'حذف هذه الصلاحية':'Remove this grant'} onClick={()=>setDeleteTarget({account:a,grant:g})}><Trash2 className="w-4 h-4"/></IconButton></div>)}</div></div>)}{!accounts.length&&<div className="py-8 text-center text-xs text-[#696f6b]">{ar?'لا يوجد مستخدمون في هذا النطاق بعد.':'No users in this scope yet.'}</div>}</div></div>
  <div className="mt-5"><div className="text-sm font-black">{ar?'دعوات التفعيل':'Activation invitations'}</div><div className="mt-3 divide-y divide-[#e5e3dc]">{invitations.slice(0,12).map((i:any)=><div key={i.id} className="py-3 flex items-center justify-between gap-3"><div className="min-w-0"><div className="text-xs font-black">{i.displayName}</div><div className="text-[10px] text-[#656b66] break-all" dir="ltr">{i.email}</div></div><Badge variant={i.status==='READY'?'emerald':i.status==='EXPIRED'?'amber':'neutral'}>{i.status==='READY'?(ar?'جاهزة':'Ready'):i.status==='ACTIVATED'?(ar?'فُعّلت':'Activated'):i.status==='EXPIRED'?(ar?'منتهية':'Expired'):(ar?'قديمة':'Legacy')}</Badge></div>)}{!invitations.length&&<div className="py-6 text-center text-xs text-[#696f6b]">{ar?'لا توجد دعوات معلقة.':'No invitations.'}</div>}</div></div>
  <Modal open={!!deleteTarget} onClose={()=>setDeleteTarget(null)} title={ar?'إلغاء الصلاحية':'Remove grant'}><p className="text-sm text-[#565d59] leading-7">{ar?'سيُلغى هذا الدور في هذا النطاق فقط. لن تُمس أي صلاحية للمستخدم في مسابقة أخرى.':'Only this scoped role will be removed; other competition grants stay untouched.'}</p><div className="mt-5 flex gap-2 justify-end"><Button variant="ghost" onClick={()=>setDeleteTarget(null)}>{ar?'تراجع':'Cancel'}</Button><Button disabled={deleting} onClick={()=>void remove()} icon={<Trash2 className="w-4 h-4"/>}>{deleting?'…':(ar?'إلغاء الصلاحية':'Remove')}</Button></div></Modal>
 </section>;
};
const IconButton=({title,onClick,children,danger=false}:{title:string;onClick:()=>void;children:React.ReactNode;danger?:boolean})=><button type="button" title={title} aria-label={title} onClick={onClick} className={`w-11 h-11 rounded-xl border grid place-items-center ${danger?'text-[#94564d] border-[#ead9d5] hover:bg-[#f7ece9]':'text-[#214C40] border-[#d9dfdb] hover:bg-white'}`}>{children}</button>;
const Mini=({n,t}:{n:number;t:string})=><div className="rounded-xl bg-[#f3f1eb] p-3 text-center"><div className="text-lg font-black">{n}</div><div className="text-[10px] text-[#656b66]">{t}</div></div>;
''')

# -----------------------------------------------------------------------------
# 9) Owner tenant console: immediate authoritative status + per-tenant access view.
# -----------------------------------------------------------------------------
write('src/components/admin/TenantConsole.tsx', r'''import React,{useCallback,useEffect,useState} from 'react';import {Building2,Globe2,Plus,RefreshCw,ShieldCheck,XCircle,Sparkles,KeyRound} from 'lucide-react';import {useAppStore} from '../../lib/store';import {auth} from '../../lib/firebase';import {Button} from '../design-system/Button';import {Badge} from '../design-system/Badge';import {TenantBrandStudio} from './TenantBrandStudio';import {IdentityGovernance} from './IdentityGovernance';import {normalizeDomain,normalizeLatinText,normalizeArabicText} from '../../lib/input-validation';
type TenantRow={orgId:string;displayNameArabic?:string;displayName?:string;logoUrl?:string;slogan?:string;sloganArabic?:string;websiteUrl?:string;phoneNumber?:string;supportEmail?:string;address?:string;addressArabic?:string;displayPlacements?:any;certificateTheme?:'quiet_authority'|'institutional'|'ceremonial';subdomain?:string;customDomains?:string[];note?:string;status?:'active'|'suspended'};
const ERR:Record<string,string>={ORG_ID_REQUIRED:'معرّف الجهة مطلوب.',ORG_ID_INVALID:'معرّف الجهة يقبل الحروف اللاتينية والأرقام والشرطة فقط.',ORG_ID_TAKEN:'هذا المعرّف مستعمل.',ORG_NOT_FOUND:'لا توجد جهة بهذا المعرّف.',SUBDOMAIN_INVALID:'النطاق الفرعي غير صالح.',SUBDOMAIN_RESERVED:'هذا النطاق محجوز.',SUBDOMAIN_TAKEN:'النطاق مستخدم.',HOST_REQUIRED:'لا بد من نطاق للجهة.',TENANTS_PINNED_TO_ENV:'سجل الجهات مثبت في بيئة النشر.',TENANT_STORE_NOT_CONFIGURED:'سجل الجهات غير مهيأ في هذا النشر.',IDENTITY_REQUIRED:'تلزم هوية المالك.',FORBIDDEN_ROLE:'هذا الإجراء لمالك المنصة وحده.'};const say=(c:string)=>ERR[c]||c;
export const TenantConsole:React.FC=()=>{const s=useAppStore();const ar=s.language==='ar';const [rows,setRows]=useState<TenantRow[]>([]);const [baseDomain,setBaseDomain]=useState('');const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [adding,setAdding]=useState(false);const [form,setForm]=useState({orgId:'',displayNameArabic:'',subdomain:'',note:''});const [busy,setBusy]=useState('');const [brandOrg,setBrandOrg]=useState<string|null>(null);const [accessOrg,setAccessOrg]=useState<string|null>(null);
 const call=useCallback(async(path:string,init?:RequestInit)=>{const u=auth.currentUser;if(!u)throw new Error(say('IDENTITY_REQUIRED'));const token=await u.getIdToken();const res=await fetch(path,{...init,headers:{...(init?.body?{'content-type':'application/json'}:{}),authorization:`Bearer ${token}`}});const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error((body.errors||[]).map(say).join(' · ')||say(body.code||`HTTP_${res.status}`));return body},[]);
 const load=useCallback(async()=>{setLoading(true);setError('');try{const d=await call('/api/owner/tenants');setRows(d.tenants||[]);setBaseDomain(d.baseDomain||'')}catch(e){setError((e as Error).message)}finally{setLoading(false)}},[call]);useEffect(()=>{void load()},[load]);
 const submit=async()=>{setBusy('add');setError('');setNotice('');try{const body=await call('/api/owner/tenants',{method:'POST',body:JSON.stringify({...form,orgId:normalizeLatinText(form.orgId).trim(),displayNameArabic:normalizeArabicText(form.displayNameArabic).trim(),subdomain:normalizeDomain(form.subdomain)})});setRows(x=>[...x,body.tenant]);setForm({orgId:'',displayNameArabic:'',subdomain:'',note:''});setAdding(false);setNotice(ar?'تم إنشاء الجهة وحفظها على الخادم.':'Organization created and persisted.')}catch(e){setError((e as Error).message)}finally{setBusy('')}};
 const toggle=async(t:TenantRow)=>{setBusy(t.orgId);setError('');setNotice('');try{const suspend=t.status!=='suspended';const body=await call(`/api/owner/tenants/${encodeURIComponent(t.orgId)}/${suspend?'suspend':'activate'}`,{method:'POST'});setRows(x=>x.map(r=>r.orgId===t.orgId?body.tenant:r));setNotice(suspend?(ar?'تم إيقاف الجهة فورًا. جلساتها وطلباتِها التالية مرفوضة حتى إعادة التفعيل.':'Organization suspended immediately.'):(ar?'أُعيد تفعيل الجهة وأصبح الوصول متاحًا.':'Organization access restored.'))}catch(e){setError((e as Error).message)}finally{setBusy('')}};
 const host=(t:TenantRow)=>t.customDomains?.[0]||(t.subdomain&&baseDomain?`${t.subdomain}.${baseDomain}`:t.subdomain||'—');
 return <div className="space-y-4"><section className="mizan-surface p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="mizan-kicker">{ar?'الجهات المشتركة':'TENANTS'}</div><h2 className="font-extrabold mt-1">{ar?'الجهات ونطاقاتها':'Tenants and domains'}</h2><p className="text-[11px] leading-5 text-[#656b66] mt-1 max-w-xl">{ar?'الإيقاف فعلي من الخادم، والهوية والصلاحيات لكل جهة مرئية للمالك من هنا.':'Suspension is server-enforced; tenant identity and access are visible here.'}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" icon={<RefreshCw className="w-4 h-4"/>} onClick={()=>void load()}>{ar?'تحديث':'Refresh'}</Button><Button size="sm" icon={<Plus className="w-4 h-4"/>} onClick={()=>setAdding(v=>!v)}>{ar?'جهة جديدة':'New tenant'}</Button></div></div>{error&&<div className="mt-4 rounded-2xl bg-[#F4E6E3] p-3 text-xs font-bold text-[#88473f]">{error}</div>}{notice&&<div className="mt-4 rounded-2xl bg-[#E7EEE9] p-3 text-xs font-bold text-[#214C40]">{notice}</div>}
 {adding&&<div className="mt-4 rounded-2xl border bg-[#fbfaf6] p-4 grid sm:grid-cols-2 gap-3"><label><span className="text-[10px] font-black">{ar?'معرّف الجهة (لاتيني)':'Tenant id'}</span><input lang="en" data-mizan-kind="latin" value={form.orgId} onChange={e=>setForm(f=>({...f,orgId:e.target.value}))} className="mizan-input mt-1"/></label><label><span className="text-[10px] font-black">{ar?'الاسم المعروض بالعربية':'Arabic display name'}</span><input lang="ar" data-mizan-kind="arabic" value={form.displayNameArabic} onChange={e=>setForm(f=>({...f,displayNameArabic:e.target.value}))} className="mizan-input mt-1"/></label><label><span className="text-[10px] font-black">{ar?'النطاق الفرعي':'Subdomain'}</span><input lang="en" data-mizan-kind="latin" dir="ltr" value={form.subdomain} onChange={e=>setForm(f=>({...f,subdomain:e.target.value}))} className="mizan-input mt-1"/></label><label><span className="text-[10px] font-black">{ar?'ملاحظة إدارية':'Admin note'}</span><input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} className="mizan-input mt-1"/></label><div className="sm:col-span-2 flex justify-end"><Button size="sm" onClick={()=>void submit()} disabled={busy==='add'||!form.orgId.trim()||!form.subdomain.trim()}>{busy==='add'?'…':(ar?'إضافة':'Add')}</Button></div></div>}
 <div className="mt-4 divide-y divide-[#e5e3dc]">{loading?<div className="py-8 text-center text-xs">{ar?'جارٍ التحميل…':'Loading…'}</div>:rows.map(t=>{const suspended=t.status==='suspended';return <div key={t.orgId} className="py-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-[#2F6555]"/><span className="font-black text-sm">{t.displayNameArabic||t.displayName||t.orgId}</span><Badge variant={suspended?'neutral':'emerald'}>{suspended?(ar?'موقوفة':'Suspended'):(ar?'نشطة':'Active')}</Badge></div><div className="mt-1 flex gap-1.5 text-[11px] text-[#656b66]"><Globe2 className="w-3.5 h-3.5"/><span dir="ltr" className="break-all">{host(t)}</span></div></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" icon={<Sparkles className="w-4 h-4"/>} onClick={()=>{setBrandOrg(x=>x===t.orgId?null:t.orgId);setAccessOrg(null)}}>{brandOrg===t.orgId?(ar?'إغلاق الهوية':'Close brand'):(ar?'الهوية':'Brand')}</Button><Button size="sm" variant="outline" icon={<KeyRound className="w-4 h-4"/>} onClick={()=>{setAccessOrg(x=>x===t.orgId?null:t.orgId);setBrandOrg(null)}}>{accessOrg===t.orgId?(ar?'إغلاق الصلاحيات':'Close access'):(ar?'الصلاحيات':'Access')}</Button><Button size="sm" variant="outline" icon={suspended?<ShieldCheck className="w-4 h-4"/>:<XCircle className="w-4 h-4"/>} disabled={busy===t.orgId} onClick={()=>void toggle(t)}>{busy===t.orgId?'…':suspended?(ar?'إعادة التفعيل':'Activate'):(ar?'إيقاف':'Suspend')}</Button></div></div>{brandOrg===t.orgId&&<div className="w-full mt-3 pt-3 border-t"><TenantBrandStudio orgId={t.orgId} initialBrand={{displayName:t.displayName,displayNameArabic:t.displayNameArabic,logoUrl:t.logoUrl,slogan:t.slogan,sloganArabic:t.sloganArabic,websiteUrl:t.websiteUrl,phoneNumber:t.phoneNumber,supportEmail:t.supportEmail,address:t.address,addressArabic:t.addressArabic,displayPlacements:t.displayPlacements,certificateTheme:t.certificateTheme} as any} onSaved={()=>void load()}/></div>}{accessOrg===t.orgId&&<div className="w-full mt-3 pt-3 border-t"><IdentityGovernance organizationId={t.orgId}/></div>}</div>})}{!loading&&!rows.length&&<div className="py-8 text-center text-xs text-[#656b66]">{ar?'لا جهات بعد.':'No tenants yet.'}</div>}</div></section></div>};
''')

# Remove duplicated global identity view from Super Admin; TenantConsole now owns tenant-scoped access.
rel='src/components/admin/RolePortals.tsx';t=read(rel)
t=rep(t,"import { IdentityGovernance } from './IdentityGovernance';\n",'',rel,'remove identity import')
t=sub(t,r'\s*\{\/\* دعوة المستخدمين ومنحهم الأدوار:.*?\*\/\}\s*<IdentityGovernance\/>','',rel,'remove duplicate global identity')
write(rel,t)

# -----------------------------------------------------------------------------
# 10) Brand studio: authoritative server read/write + no false success + normalized fields.
# -----------------------------------------------------------------------------
rel='src/components/admin/TenantBrandStudio.tsx';t=read(rel)
t=rep(t,"import type { OrganizationBrand, BrandDisplayPlacements } from '../../types';", "import type { OrganizationBrand, BrandDisplayPlacements } from '../../types';\nimport {isArabicText,isEmail,isLatinText,isPhone,isWebsiteUrl,normalizeArabicText,normalizeEmail,normalizeLatinText,normalizePhone,normalizeWebsiteUrl,toAsciiDigits} from '../../lib/input-validation';",rel,'brand validation import')
state_anchor="""  const [serverError, setServerError] = useState('');\n"""
hydrate=state_anchor+r'''
  // Production always hydrates from the server record, even on admin.dr-* where host-based branding cannot identify the tenant.
  useEffect(() => {
    const user=auth?.currentUser;if(!user)return;let live=true;
    void user.getIdToken().then(token=>fetch(`/api/tenant/brand${orgId?`?orgId=${encodeURIComponent(orgId)}`:''}`,{headers:{authorization:`Bearer ${token}`}})).then(async res=>({ok:res.ok,body:await res.json().catch(()=>({}))})).then(({ok,body})=>{
      if(!live||!ok||!body?.tenant)return;const b=body.tenant;
      setNameArabic(b.displayNameArabic||'');setNameEnglish(b.displayName||'');setSloganArabic(b.sloganArabic||'');setSloganEnglish(b.slogan||'');setLogoUrl(b.logoUrl||'');setWebsiteUrl(b.websiteUrl||'');setPhoneNumber(b.phoneNumber||'');setSupportEmail(b.supportEmail||'');setAddressArabic(b.addressArabic||'');setAddressEnglish(b.address||'');setCertificateTheme(b.certificateTheme||'quiet_authority');
      const p=b.displayPlacements||{};setPlacements({showHeaderLogo:p.showHeaderLogo!==false,showHeaderSlogan:Boolean(p.showHeaderSlogan),showHeaderContact:Boolean(p.showHeaderContact),showFooterContact:p.showFooterContact!==false,showFooterAddress:p.showFooterAddress!==false,showFooterWebsite:p.showFooterWebsite!==false,showOnCertificates:p.showOnCertificates!==false,showOnVenueScreens:p.showOnVenueScreens!==false,showOnPublicPortal:p.showOnPublicPortal!==false});
    }).catch(()=>{});return()=>{live=false};
  }, [orgId]);
'''
t=rep(t,state_anchor,hydrate,rel,'brand authoritative hydrate')
# Replace validation computation.
validation=r'''  const validationErrors = useMemo(() => {
    const errs:string[]=[];
    if(logoUrl.trim()&&probe.status==='broken')errs.push(ar?'الشعار مكسور أو لا يمكن فتحه':'Logo is broken or inaccessible');
    if(nameArabic.trim()&&!isArabicText(nameArabic))errs.push(ar?'الاسم العربي يجب أن يكتب بالعربية':'Arabic name must use Arabic letters');
    if(nameEnglish.trim()&&!isLatinText(nameEnglish))errs.push(ar?'الاسم الإنجليزي يجب أن يكتب بالإنجليزية':'English name must use Latin letters');
    if(sloganArabic.trim()&&!isArabicText(sloganArabic))errs.push(ar?'السلوجن العربي يجب أن يكتب بالعربية':'Arabic slogan must use Arabic letters');
    if(sloganEnglish.trim()&&!isLatinText(sloganEnglish))errs.push(ar?'السلوجن الإنجليزي يجب أن يكتب بالإنجليزية':'English slogan must use Latin letters');
    if(websiteUrl.trim()&&!isWebsiteUrl(websiteUrl))errs.push(ar?'اكتب موقعًا صحيحًا مثل dr-alfailakawi.com':'Enter a valid website');
    if(supportEmail.trim()&&!isEmail(supportEmail))errs.push(ar?'صيغة البريد الإلكتروني غير صحيحة':'Invalid email format');
    if(phoneNumber.trim()&&!isPhone(phoneNumber))errs.push(ar?'رقم الهاتف غير صالح':'Invalid phone number');
    if(addressArabic.trim()&&!isArabicText(addressArabic))errs.push(ar?'العنوان العربي يجب أن يكتب بالعربية':'Arabic address must use Arabic letters');
    if(addressEnglish.trim()&&!isLatinText(addressEnglish))errs.push(ar?'العنوان الإنجليزي يجب أن يكتب بالإنجليزية':'English address must use Latin letters');
    return errs;
  }, [logoUrl,probe.status,nameArabic,nameEnglish,sloganArabic,sloganEnglish,websiteUrl,supportEmail,phoneNumber,addressArabic,addressEnglish,ar]);'''
t=sub(t,r'  const validationErrors = useMemo\(\(\) => \{.*?\n  \}, \[logoUrl, probe\.status, websiteUrl, supportEmail, phoneNumber, ar\]\);',validation,rel,'brand validation')
# Replace entire save function up to return.
save=r'''  const handleSave = async () => {
    if(!canSave)return;setSaving(true);setServerError('');setSaveSuccess(false);
    const normalizedWebsite=websiteUrl.trim()?normalizeWebsiteUrl(websiteUrl):'';
    const updatedBrand:OrganizationBrand={...(effectiveBrand||{name:'',nameArabic:'',primaryColor:'#0d1e18',accentColor:'#10b981'}),name:normalizeLatinText(nameEnglish).trim()||effectiveBrand?.name||'',nameArabic:normalizeArabicText(nameArabic).trim()||effectiveBrand?.nameArabic||'',displayName:normalizeLatinText(nameEnglish).trim()||undefined,displayNameArabic:normalizeArabicText(nameArabic).trim()||undefined,logoUrl:logoUrl.trim()||undefined,slogan:normalizeLatinText(sloganEnglish).trim()||undefined,sloganArabic:normalizeArabicText(sloganArabic).trim()||undefined,websiteUrl:normalizedWebsite||undefined,phoneNumber:phoneNumber.trim()?normalizePhone(phoneNumber):undefined,supportEmail:supportEmail.trim()?normalizeEmail(supportEmail):undefined,address:normalizeLatinText(addressEnglish).trim()||undefined,addressArabic:normalizeArabicText(addressArabic).trim()||undefined,certificateTheme,displayPlacements:placements};
    try{
      const user=auth?.currentUser;
      if(user){const token=await user.getIdToken();const res=await fetch('/api/tenant/brand',{method:'PATCH',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({orgId:orgId||store.organization?.id,displayName:updatedBrand.displayName,displayNameArabic:updatedBrand.displayNameArabic,logoUrl:updatedBrand.logoUrl,slogan:updatedBrand.slogan,sloganArabic:updatedBrand.sloganArabic,websiteUrl:updatedBrand.websiteUrl,phoneNumber:updatedBrand.phoneNumber,supportEmail:updatedBrand.supportEmail,address:updatedBrand.address,addressArabic:updatedBrand.addressArabic,certificateTheme:updatedBrand.certificateTheme,displayPlacements:updatedBrand.displayPlacements})});const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(String((body.errors||[]).join(' · ')||body.code||'BRAND_SAVE_FAILED'));const b=body.tenant||{};const authoritative:OrganizationBrand={...updatedBrand,displayName:b.displayName,displayNameArabic:b.displayNameArabic,logoUrl:b.logoUrl,slogan:b.slogan,sloganArabic:b.sloganArabic,websiteUrl:b.websiteUrl,phoneNumber:b.phoneNumber,supportEmail:b.supportEmail,address:b.address,addressArabic:b.addressArabic,certificateTheme:b.certificateTheme||certificateTheme,displayPlacements:b.displayPlacements||placements};if(!orgId||orgId===store.organization?.id)store.updateOrganizationBrand(authoritative);onSaved?.(authoritative);setWebsiteUrl(authoritative.websiteUrl||'');setPhoneNumber(authoritative.phoneNumber||'');setSupportEmail(authoritative.supportEmail||'');}
      else{store.updateOrganizationBrand(updatedBrand);onSaved?.(updatedBrand)}
      setSaveSuccess(true);setTimeout(()=>setSaveSuccess(false),4000);
    }catch(err){setServerError(ar?`لم يُحفظ شيء: ${(err as Error).message}`:(err as Error).message)}finally{setSaving(false)}
  };

  return ('''
t=sub(t,r'  const handleSave = async \(\) => \{.*?\n  \};\n\n  return \(',save,rel,'server-first brand save')
# input normalization/language tags
repls=[
("value={nameArabic}\n                  onChange={e => setNameArabic(e.target.value)}","lang=\"ar\" data-mizan-kind=\"arabic\"\n                  value={nameArabic}\n                  onChange={e => setNameArabic(normalizeArabicText(e.target.value))}"),
("value={nameEnglish}\n                  onChange={e => setNameEnglish(e.target.value)}","lang=\"en\" data-mizan-kind=\"latin\"\n                  value={nameEnglish}\n                  onChange={e => setNameEnglish(normalizeLatinText(e.target.value))}"),
("value={sloganArabic}\n                  onChange={e => setSloganArabic(e.target.value)}","lang=\"ar\" data-mizan-kind=\"arabic\"\n                  value={sloganArabic}\n                  onChange={e => setSloganArabic(normalizeArabicText(e.target.value))}"),
("value={sloganEnglish}\n                  onChange={e => setSloganEnglish(e.target.value)}","lang=\"en\" data-mizan-kind=\"latin\"\n                  value={sloganEnglish}\n                  onChange={e => setSloganEnglish(normalizeLatinText(e.target.value))}"),
("value={websiteUrl}\n                    onChange={e => setWebsiteUrl(e.target.value)}","dir=\"ltr\"\n                    value={websiteUrl}\n                    onChange={e => setWebsiteUrl(toAsciiDigits(e.target.value))}"),
("value={phoneNumber}\n                    onChange={e => setPhoneNumber(e.target.value)}","value={phoneNumber}\n                    onChange={e => setPhoneNumber(normalizePhone(e.target.value))}"),
("value={supportEmail}\n                    onChange={e => setSupportEmail(e.target.value)}","dir=\"ltr\"\n                    value={supportEmail}\n                    onChange={e => setSupportEmail(normalizeEmail(e.target.value))}"),
("value={addressArabic}\n                    onChange={e => setAddressArabic(e.target.value)}","lang=\"ar\" data-mizan-kind=\"arabic\"\n                    value={addressArabic}\n                    onChange={e => setAddressArabic(normalizeArabicText(e.target.value))}"),
]
for old,new in repls:
    if old in t:t=t.replace(old,new,1)
write(rel,t)

# -----------------------------------------------------------------------------
# 11) Static + behavior tests for the critical bugs fixed in phase A.
# -----------------------------------------------------------------------------
write('tests/product-hardening-phase-a.test.ts', r'''import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {toAsciiDigits,normalizeWebsiteUrl,normalizePhone,isEmail,isArabicText,isLatinText} from '../shared/input-validation';import {IdentityGovernanceRepository} from '../server/identity-governance';import {TenantStore} from '../server/tenant-store';
test('input normalization is shared and deterministic',()=>{assert.equal(toAsciiDigits('١٢۳'),'123');assert.equal(normalizePhone('+٩٦٥ ١٢٣٤-٥٦٧٨'),'+96512345678');assert.equal(normalizeWebsiteUrl('Dr-Alfailakawi.com'),'https://dr-alfailakawi.com');assert.equal(isEmail('test@test.com'),true);assert.equal(isArabicText('جهة تجريبية ١'),true);assert.equal(isLatinText('Test Organization 1'),true)});
test('tenant brand persistence is durable and suspension preserves data',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-tenant-'));const file=path.join(dir,'tenants.json');try{const s=new TenantStore(file);assert.equal(s.add({orgId:'org1',subdomain:'org1',status:'active'}).ok,true);const out=s.update('org1',{displayNameArabic:'جهة تجريبية',websiteUrl:'dr-alfailakawi.com',phoneNumber:'٩٦٥١٢٣٤٥٦٧٨',supportEmail:'TEST@Test.com',certificateTheme:'ceremonial'});assert.equal(out.ok,true);const reloaded=new TenantStore(file).list()[0];assert.equal(reloaded.websiteUrl,'https://dr-alfailakawi.com');assert.equal(reloaded.phoneNumber,'96512345678');assert.equal(reloaded.supportEmail,'test@test.com');assert.equal(reloaded.certificateTheme,'ceremonial');assert.equal(s.suspend('org1').ok,true);assert.equal(new TenantStore(file).list()[0].displayNameArabic,'جهة تجريبية');assert.equal(s.activate('org1').ok,true)}finally{fs.rmSync(dir,{recursive:true,force:true})}});
test('competition grants freeze/resume and QR reissue without duplication',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-id-'));try{const r=new IdentityGovernanceRepository(dir);const admin={uid:'oa',email:'oa@test.com',role:'org_admin' as const,organizationId:'org1'};const inv=r.createInvitation(admin,{email:'j@test.com',displayName:'Judge',requestedRole:'judge',competitionId:'A',reason:'Assign judge'});const first=r.activate({uid:'u1',email:'j@test.com'},inv.activationToken);const frozen=r.suspendGrant(admin,first.grant.id,'Freeze access temporarily');assert.equal(frozen.grant.status,'SUSPENDED');assert.equal(r.resumeGrant(admin,first.grant.id,'Restore access now').grant.status,'ACTIVE');const q=r.reissueQr(admin,first.grant.id);assert.equal(r.previewInvitation(q.activationToken).existingAccount,true);const again=r.activate({uid:'u1',email:'j@test.com'},q.activationToken);assert.equal(again.grant.id,first.grant.id);assert.equal(r.list(admin,undefined,'A').grants.filter(g=>g.status==='ACTIVE').length,1)}finally{fs.rmSync(dir,{recursive:true,force:true})}});
test('critical UI/server guards are wired',()=>{const brand=fs.readFileSync('src/components/admin/TenantBrandStudio.tsx','utf8');const tenant=fs.readFileSync('src/components/admin/TenantConsole.tsx','utf8');const app=fs.readFileSync('src/App.tsx','utf8');const server=fs.readFileSync('server.ts','utf8');const id=fs.readFileSync('src/components/admin/IdentityGovernance.tsx','utf8');assert.match(brand,/if\(!res\.ok\)throw new Error/);assert.match(brand,/\/api\/tenant\/brand\$\{orgId/);assert.match(app,/TenantSuspendedScreen/);assert.match(server,/tenantAccessBlocked/);assert.match(server,/\/api\/identity\/grants\/:id\/resume/);assert.match(server,/\/api\/identity\/grants\/:id\/reissue-qr/);assert.match(tenant,/IdentityGovernance organizationId=\{t\.orgId\}/);assert.match(id,/PauseCircle/);assert.match(id,/reissue-qr/)});
''')

print('Phase A hardening materialized successfully.')
