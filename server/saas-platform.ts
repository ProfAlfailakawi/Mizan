import crypto from 'crypto';
import { lookup as dnsLookup } from 'dns/promises';
import fs from 'fs';
import path from 'path';

export type CommercialRole='super_admin'|'operator_owner'|'operator_admin'|'org_admin'|'storage_admin'|'billing_admin';
export type CommercialActor={uid:string;role:string;organizationId:string;operatorId?:string};
export type LicenseState='active'|'grace_period'|'suspended'|'expired'|'archived';
export type StorageProvider='mizan'|'cloudflare_r2'|'amazon_s3'|'google_cloud_storage'|'azure_blob';
export type CompetitionCommercialState='draft'|'registration_open'|'registration_closed'|'judging'|'completed'|'archived';

export interface PlanOverage{includedParticipants?:number;perParticipantMinor?:number;includedStorageGb?:number;perStorageGbMinor?:number}
export interface PlanRecord{
 id:string;name:string;currency:string;priceMinor:number;billingPeriod:'monthly'|'annual'|'custom';active:boolean;
 limits:{licensedOrganizations:number;activeCompetitions:number;annualParticipants:number;storageBytes:number;branches:number;videoBytes?:number};
 features:Record<string,boolean>;
 /* تسعير الاستهلاك الزائد: ما يتجاوز المشمول في الباقة يُحتسب بندًا في فاتورة التجديد. */
 overage?:PlanOverage;
 ownerOperatorId?:string;createdAt:string;updatedAt:string;
 /* الكتالوج التجاري: `mizan` باقات ميزان العالمية (أسعارها مؤرّخة في planVersions)، `operator` باقات مشغّل، `legacy` ما قبل الكتالوج. */
 slug?:string;nameArabic?:string;catalog?:'mizan'|'operator'|'legacy';custom?:boolean;displayOrder?:number;
}
import { CONSENT_BACKED_DOCUMENTS, isPublished, legalDocumentState } from '../src/lib/legal-documents';
import type { LegalChainLink, LegalDocumentConfig } from '../src/lib/legal-documents';
import type { CommercialPolicy, PlanVersionRecord, SubscriptionTermRecord, OperatorTierRecord, OperatorAgreementRecord, OperatorWalletRecord, WalletLedgerEntry, IdempotencyRecord, OperatorResalePriceRecord, OwnershipEvent, CommercialMigrationReport, BrandProfileRecord, CustomDomainRecord, PublishedCompetitionListing, WebhookEndpointRecord, WebhookDeliveryRecord, WebhookEventType } from './commercial/types';
import * as engine from './commercial/engine';
import * as brand from './commercial/brand-discover';
import * as hooks from './commercial/webhooks';
import { ensureCommercialCollections, migrateCommercialSchema } from './commercial/migration';
import * as pay from './commercial/payment-gateways';
import { buildPaymentGateway, validatePaymentProfile, type GatewayTransport, type PaymentProviderProfile, type WebhookSettlement } from './payments';

export type BillingSubjectType='operator'|'organization';
export type SubscriptionStatus='trialing'|'active'|'past_due'|'canceled'|'unpaid';
export type InvoiceStatus='draft'|'open'|'paid'|'void'|'uncollectible';
export interface SubscriptionRecord{id:string;subjectType:BillingSubjectType;subjectId:string;ownerOperatorId?:string;planId:string;status:SubscriptionStatus;currency:string;amountMinor:number;billingPeriod:'monthly'|'annual'|'custom';currentPeriodStart:string;currentPeriodEnd:string;autoRenew?:boolean;/* شروط التجاوز تُثبَّت لحظة بدء الدورة: تعديل الباقة لاحقًا لا يغيّر فاتورة دورة انقضت. */overage?:PlanOverage;provider:string;externalRef?:string;createdAt:string;updatedAt:string;canceledAt?:string;/** تخفيضٌ مجدول يدخل مع الدورة التالية. */pendingPlanId?:string;pendingPlanRequestedAt?:string}
export interface InvoiceLine{description:string;amountMinor:number;quantity?:number}
export interface InvoiceRecord{id:string;number:string;subscriptionId?:string;lines?:InvoiceLine[];subjectType:BillingSubjectType;subjectId:string;ownerOperatorId?:string;currency:string;amountMinor:number;status:InvoiceStatus;periodStart?:string;periodEnd?:string;issuedAt:string;dueAt?:string;paidAt?:string;provider:string;externalRef?:string;method?:string;note?:string;createdAt:string;updatedAt:string;/** ما يترتّب على السداد: تجديد دورة، ترقية، شحن رصيد مشغّل… */kind?:'subscription'|'renewal'|'plan_upgrade'|'wallet_top_up'|'manual';metadata?:{planId?:string;termId?:string;operatorId?:string};paymentFailedNotifiedAt?:string}
export interface OperatorRecord{id:string;name:string;status:'active'|'suspended';pricingTier:string;whiteLabelLevel:'mizan'|'co_branded'|'full';storageCapBytes?:number;createdAt:string;/** وثائق المشغّل باسمه هو. تُستعمل لجهاته التي لم تنشر وثائقها — ويُعلَن أنها وثائقُه. */legal?:LegalDocumentConfig}
export interface OrganizationRecord{
 id:string;tenantId:string;licenseId:string;officialName:string;shortName:string;organizationType:string;country:string;
 legalEmail?:string;legalPhone?:string;website?:string;legalRegistration?:string;primaryContact?:string;operatorId?:string;
 /** مَن يملك العلاقة التجارية: ميزان مباشرة أم مشغّل. لا يتغيّر إلا بنقلٍ إداريٍّ مُدقَّق. */
 commercialOwner?:'direct'|'operator';
 operational:{phone?:string;notificationEmail?:string;contactName?:string;address?:string};status:'active'|'suspended'|'archived';createdAt:string;updatedAt:string;
 /** وثائق الجهة نفسها. غيابُها ينزل بالسلسلة إلى المشغّل ثم المنصّة — باسم الناشر الحقيقي. */
 legal?:LegalDocumentConfig;
}
export interface LicenseRecord{
 id:string;organizationId:string;planId:string;startsAt:string;expiresAt:string;status:LicenseState;graceUntil?:string;
 overrides?:Partial<{activeCompetitions:number;annualParticipants:number;storageBytes:number;branches:number}>;
 whiteLabelEnabled:boolean;brandingLevel:'mizan'|'co_branded'|'full';customDomainEnabled:boolean;uploadsDisabled?:boolean;
 temporaryStorageBoost?:{bytes:number;expiresAt:string;reason:string};createdAt:string;updatedAt:string;
}
export interface CreditLedgerRow{id:string;operatorId:string;kind:'purchase'|'consume'|'refund'|'admin_adjustment'|'expire';quantity:number;balanceAfter:number;reason:string;reference?:string;createdAt:string;actorId:string}
export interface ParticipantUsageRow{id:string;tenantId:string;organizationId:string;competitionId:string;participantId:string;/** إرثٌ للقراءة فقط: الاستحقاق يُقاس بدورة الاشتراك لا بالسنة الميلادية. */year:number;createdAt:string;subscriptionTermId?:string;usageKey?:string;identityKey?:string}
export interface CompetitionUsageRow{id:string;tenantId:string;organizationId:string;organizerOrganizationId:string;state:CompetitionCommercialState;updatedAt:string}
export interface StorageObjectRecord{id:string;tenantId:string;organizationId:string;competitionId?:string;fileType:string;mimeType:string;sizeBytes:number;provider:StorageProvider;storageKey:string;category:'audio'|'video'|'image'|'document'|'other';state:'reserved'|'stored'|'migrating'|'deleted';checksum?:string;createdAt:string;deletedAt?:string}
export interface StorageAccountRecord{id:string;tenantId:string;organizationId:string;provider:Exclude<StorageProvider,'mizan'>;container:string;region?:string;endpoint?:string;connectionStatus:'pending_test'|'connected'|'degraded'|'disconnected'|'migrating';lastTestedAt?:string;lastTestResult?:string;secretReference:string;isPrimary:boolean;createdAt:string;updatedAt:string}
export interface StorageMigrationRecord{id:string;tenantId:string;organizationId:string;source:StorageProvider;destination:StorageProvider;status:'queued'|'running'|'paused'|'completed'|'failed';totalFiles:number;completedFiles:number;failedFiles:number;sourceDeletionPolicy:'retain'|'delete_after_verification';createdAt:string;updatedAt:string}
export interface ChangeRequestRecord{id:string;organizationId:string;tenantId:string;field:keyof Pick<OrganizationRecord,'officialName'|'country'|'operatorId'|'legalEmail'|'legalPhone'>;currentValue:string;requestedValue:string;reason:string;attachmentRef?:string;status:'pending'|'approved'|'rejected'|'needs_information';submittedBy:string;createdAt:string;decidedAt?:string;decidedBy?:string;decisionNote?:string}
/*
 * مرساةُ السجل: طولُه وتلبيدُه الأخير، محفوظان خارج ملفّ الحالة.
 *
 * سلسلةُ التلبيد تكشف تغييرَ سطرٍ وحذفَه من الوسط وقلبَ الرتبة — ولا تكشف قطعَ الذيل،
 * لأن البادئةَ سلسلةٌ صحيحةٌ أقصر. فيلزمها شاهدٌ من خارجها يقول «كان الطولُ كذا».
 */
/*
 * اشتراكُ الجهة هو مدّةُ سريان وثائقها.
 *
 * قرارُ المالك في 19 سبتمبر 2026: «المشغّل أو الجهة مدّتُه سنة إلا إذا جدّدنا له،
 * ويقف لمّا نوقف الاشتراك عليه». فوثيقةُ جهةٍ انتهى ترخيصُها أو أُوقف ليست وثيقةً
 * سارية، ولا تُعرض على متسابقٍ ليوافق عليها.
 *
 * وإسقاطُها لا يُخفي شيئًا ولا يُلبس أحدًا ثوبَ أحد: السلسلةُ تنزل إلى المشغّل ثم
 * المنصّة، و`resolveLegalDocument` تُرجع ناشرَ الحلقة الفائزة — فيقرأ المتسابق اسمَ
 * من نشر الوثيقة فعلًا، ويُسجَّل في أثر موافقته.
 *
 * والمهلة (`grace_period`) سريان: الجهةُ ما زالت تعمل فيها، فوثيقتُها ما زالت وثيقتَها.
 * وانقضاءُ `expiresAt` يُسقط السريان ولو بقيت الحالةُ مكتوبةً `active` — فالتاريخُ
 * أصدقُ من حقلٍ لم يُحدَّث.
 */
export function licenseInForce(license:LicenseRecord|undefined,at:number=Date.now()):boolean{
 if(!license)return false;
 if(license.status!=='active'&&license.status!=='grace_period')return false;
 const startsAt=Date.parse(license.startsAt),expiresAt=Date.parse(license.expiresAt);
 if(!Number.isFinite(startsAt)||!Number.isFinite(expiresAt))return false;
 if(at<startsAt)return false;
 if(at>=expiresAt){
  if(license.status!=='grace_period')return false;
  const graceUntil=license.graceUntil?Date.parse(license.graceUntil):NaN;
  if(!Number.isFinite(graceUntil)||at>=graceUntil)return false;
 }
 return true;
}

export interface AuditAnchor{rows:number;lastHash:string;updatedAt:string}

export interface AuditRow{id:string;sequence:number;timestamp:string;actorId:string;actorRole:string;tenantId?:string;organizationId?:string;action:string;entityType:string;entityId:string;reason?:string;previousHash:string;hash:string}

interface State{
 version:1;sequence:number;plans:PlanRecord[];operators:OperatorRecord[];organizations:OrganizationRecord[];licenses:LicenseRecord[];
 creditLedger:CreditLedgerRow[];participantUsage:ParticipantUsageRow[];competitions:CompetitionUsageRow[];storageObjects:StorageObjectRecord[];
 storageAccounts:StorageAccountRecord[];storageMigrations:StorageMigrationRecord[];changeRequests:ChangeRequestRecord[];audit:AuditRow[];
 subscriptions:SubscriptionRecord[];invoices:InvoiceRecord[];
 commercialSchemaVersion?:number;commercialPolicy?:CommercialPolicy;planVersions:PlanVersionRecord[];subscriptionTerms:SubscriptionTermRecord[];
 operatorTiers:OperatorTierRecord[];operatorAgreements:OperatorAgreementRecord[];operatorWallets:OperatorWalletRecord[];walletLedger:WalletLedgerEntry[];
 idempotency:IdempotencyRecord[];resalePrices:OperatorResalePriceRecord[];ownershipEvents:OwnershipEvent[];migrationReports:CommercialMigrationReport[];
 brandProfiles:BrandProfileRecord[];customDomains:CustomDomainRecord[];discoverListings:PublishedCompetitionListing[];
 webhookEndpoints:WebhookEndpointRecord[];webhookDeliveries:WebhookDeliveryRecord[];
 paymentGateways?:pay.PaymentGatewayConfigRecord[];registrationPaymentIntents?:pay.RegistrationPaymentIntentRecord[];
}

const now=()=>new Date().toISOString();
const clean=(v:unknown,max=200)=>String(v??'').trim().slice(0,max);
const positive=(v:unknown)=>Math.max(0,Math.floor(Number(v)||0));
const canonical=(value:unknown):string=>{if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;const o=value as Record<string,unknown>;return `{${Object.keys(o).sort().map(k=>`${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`};
const hash=(value:unknown)=>crypto.createHash('sha256').update(canonical(value)).digest('hex');
const safeId=(prefix:string,sequence:number)=>`${prefix}-${String(sequence).padStart(6,'0')}`;
const STALE_RESERVATION_MS=60*60*1000; // حجز رفع لم يُثبَّت خلال ساعة يُعدّ مهجورًا
const activeCompetitionStates=new Set<CompetitionCommercialState>(['registration_open','registration_closed','judging']);
const storageCategory=(mime:string):StorageObjectRecord['category']=>mime.startsWith('audio/')?'audio':mime.startsWith('video/')?'video':mime.startsWith('image/')?'image':mime==='application/pdf'||mime.includes('document')?'document':'other';

export class SecretVault{
 private key:Buffer;
 constructor(private file:string,masterKey:string){if(masterKey.length<24)throw new Error('STORAGE_SECRET_MASTER_KEY_REQUIRED');this.key=crypto.createHash('sha256').update(masterKey).digest();fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700})}
 private read():Record<string,string>{try{return JSON.parse(fs.readFileSync(this.file,'utf8'))}catch{return {}}}
 put(secret:Record<string,string>){const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',this.key,iv);const encrypted=Buffer.concat([cipher.update(JSON.stringify(secret),'utf8'),cipher.final()]);const ref=`sec_${crypto.randomUUID()}`;const rows=this.read();rows[ref]=Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');this.write(rows);return ref}
 get(ref:string){const raw=this.read()[ref];if(!raw)throw new Error('STORAGE_SECRET_NOT_FOUND');const b=Buffer.from(raw,'base64url'),iv=b.subarray(0,12),tag=b.subarray(12,28),data=b.subarray(28);const decipher=crypto.createDecipheriv('aes-256-gcm',this.key,iv);decipher.setAuthTag(tag);return JSON.parse(Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8')) as Record<string,string>}
 remove(ref:string){const rows=this.read();delete rows[ref];this.write(rows)}
 private write(rows:Record<string,string>){const tmp=`${this.file}.${process.pid}.tmp`;fs.writeFileSync(tmp,JSON.stringify(rows),{mode:0o600});fs.renameSync(tmp,this.file)}
}

export type StorageProbe=(account:StorageAccountRecord,secret:Record<string,string>)=>Promise<{upload:boolean;read:boolean;remove:boolean;code?:string;availableBytes?:number}>;

export class SaaSPlatformRepository{
 /** `clock` is injectable so term boundaries (Dec→Jan, renewals, leap days) are testable deterministically. */
 constructor(private file:string,private vault?:SecretVault,private probe?:StorageProbe,private clock:()=>number=()=>Date.now()){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});if(!fs.existsSync(file))this.write(this.empty());this.migrateCommercial()}
 private static SYSTEM:CommercialActor={uid:'__commercial__',role:'system',organizationId:'__platform__'};
 private ctx(s:State,actor:CommercialActor,at:number=this.clock()):engine.EngineCtx{return {s,actor,at,nextId:(prefix:string)=>this.next(s,prefix),audit:(input)=>{this.audit(s,actor,input)}}}
 /** Additive schema migration (calendar-year usage → subscription terms, catalog seed). Runs once. */
 private migrateCommercial(){const s=this.read();if((s.commercialSchemaVersion||1)>=2)return;this.mutate(next=>{migrateCommercialSchema(this.ctx(next,SaaSPlatformRepository.SYSTEM))})}
 /** Run a commercial engine operation inside one atomic state write. */
 private tx<T>(actor:CommercialActor,fn:(ctx:engine.EngineCtx)=>T):T{return this.mutate(s=>fn(this.ctx(s,actor)))}
 private view<T>(fn:(s:State,at:number)=>T):T{return fn(this.read(),this.clock())}
 private empty():State{return {version:1,sequence:0,plans:[],operators:[],organizations:[],licenses:[],creditLedger:[],participantUsage:[],competitions:[],storageObjects:[],storageAccounts:[],storageMigrations:[],changeRequests:[],audit:[],subscriptions:[],invoices:[],planVersions:[],subscriptionTerms:[],operatorTiers:[],operatorAgreements:[],operatorWallets:[],walletLedger:[],idempotency:[],resalePrices:[],ownershipEvents:[],migrationReports:[],brandProfiles:[],customDomains:[],discoverListings:[],webhookEndpoints:[],webhookDeliveries:[],paymentGateways:[],registrationPaymentIntents:[]}}
 private read():State{try{const s=JSON.parse(fs.readFileSync(this.file,'utf8')) as State;const out={...this.empty(),...s};ensureCommercialCollections(out);return out}catch{return this.empty()}}
 private write(s:State){const tmp=`${this.file}.${process.pid}.tmp`;fs.writeFileSync(tmp,JSON.stringify(s,null,2),{mode:0o600});fs.renameSync(tmp,this.file);this.writeAnchor(s)}
 private get anchorFile(){return `${this.file}.audit-anchor.json`}
 /* تُكتب المرساةُ مع كل حالة، فلا يبقى سجلٌّ بلا شاهدٍ على طوله. */
 private writeAnchor(s:State){try{const anchor:AuditAnchor={rows:s.audit.length,lastHash:s.audit.at(-1)?.hash||'GENESIS',updatedAt:now()};const tmp=`${this.anchorFile}.${process.pid}.tmp`;fs.writeFileSync(tmp,JSON.stringify(anchor,null,2),{mode:0o600});fs.renameSync(tmp,this.anchorFile)}catch{/* المرساةُ إضافةُ كشفٍ لا شرطَ كتابة: تعذّرُها لا يُسقط المعاملة */}}
 private readAnchor():AuditAnchor|null{try{const a=JSON.parse(fs.readFileSync(this.anchorFile,'utf8')) as AuditAnchor;return Number.isInteger(a?.rows)&&typeof a?.lastHash==='string'?a:null}catch{return null}}
 /** المرساةُ الحالية، لتُحفَظ خارج المضيف — وهذا وحده يحرس من عبثٍ يملك الملفّين. */
 auditAnchor():AuditAnchor{const s=this.read();return {rows:s.audit.length,lastHash:s.audit.at(-1)?.hash||'GENESIS',updatedAt:now()}}
 private mutate<T>(fn:(s:State)=>T):T{const s=this.read(),out=fn(s);this.write(s);return out}
 private next(s:State,prefix:string){s.sequence++;return safeId(prefix,s.sequence)}
 private audit(s:State,actor:CommercialActor,input:{tenantId?:string;organizationId?:string;action:string;entityType:string;entityId:string;reason?:string}){const previous=s.audit.at(-1)?.hash||'GENESIS';const base={id:this.next(s,'AUD'),sequence:s.audit.length+1,timestamp:now(),actorId:actor.uid,actorRole:actor.role,...input,previousHash:previous};const row:AuditRow={...base,hash:hash(base)};s.audit.push(row);return row}
 private super(actor:CommercialActor){if(actor.role!=='super_admin')throw new Error('SUPER_ADMIN_REQUIRED')}
 private orgScope(actor:CommercialActor,organizationId:string){if(actor.role==='super_admin')return;const org=this.read().organizations.find(x=>x.id===organizationId);if(!org)throw new Error('ORGANIZATION_NOT_FOUND');if(['operator_owner','operator_admin'].includes(actor.role)&&actor.operatorId&&org.operatorId===actor.operatorId)return;if(actor.organizationId!==organizationId)throw new Error('CROSS_TENANT_ACCESS_BLOCKED')}
 /** Read-only scope helpers used by identity and notification authorization. */
 operatorExists(operatorId:string){return this.read().operators.some(x=>x.id===operatorId&&x.status==='active')}
 operatorIdForOrganization(organizationId:string){return this.read().organizations.find(x=>x.id===organizationId)?.operatorId}
 operatorOrganizationIds(operatorId:string){return this.read().organizations.filter(x=>x.operatorId===operatorId&&x.status!=='archived').map(x=>x.id)}
 organizationBelongsToOperator(organizationId:string,operatorId:string){return this.read().organizations.some(x=>x.id===organizationId&&x.operatorId===operatorId&&x.status!=='archived')}
 operatorName(operatorId?:string){if(!operatorId)return undefined;return this.read().operators.find(x=>x.id===operatorId)?.name}
 /*
  * سلسلةُ ناشري الوثائق لهذه الجهة، من الأدنى إلى الأعلى وبلا طبقة المنصّة —
  * فالمنصّة تُقرأ من بيئة التشغيل لا من هذا المخزن، ويضيفها المُنادي.
  *
  * وما لا وثيقةَ له لا يُمثَّل بحلقةٍ فارغة تُوهم أنه نشر شيئًا: يُترك، فتنزل السلسلة
  * إلى من بعده، ويُعلَن اسمُه هو.
  */
 legalChainFor(organizationId:string,at:number=Date.now()):LegalChainLink[]{
  const state=this.read();
  const organization=state.organizations.find(x=>x.id===organizationId);
  const chain:LegalChainLink[]=[];
  const license=organization?state.licenses.find(x=>x.organizationId===organization.id):undefined;
  if(organization?.legal&&licenseInForce(license,at))chain.push({level:'organization',config:organization.legal});
  const operator=organization?.operatorId?state.operators.find(x=>x.id===organization.operatorId):undefined;
  if(operator?.legal&&operator.status==='active')chain.push({level:'operator',config:operator.legal});
  return chain;
 }
 // Owner-console tenants: every SaaS organization (operator-owned or direct) exposed as a tenant row
 // so Tenant 360, the live mirror and the owner list can see and diagnose it in one place.
 listOwnerTenants():{orgId:string;displayName:string;displayNameArabic:string;status:'active'|'suspended';operatorId?:string;operatorName?:string;source:'saas'}[]{const s=this.read();return s.organizations.filter(o=>o.status!=='archived').map(o=>({orgId:o.id,displayName:o.shortName||o.officialName,displayNameArabic:o.officialName||o.shortName||o.id,status:o.status==='suspended'?'suspended':'active',operatorId:o.operatorId,operatorName:o.operatorId?s.operators.find(x=>x.id===o.operatorId)?.name:undefined,source:'saas' as const}))}
 organizationName(organizationId?:string){if(!organizationId)return undefined;return this.read().organizations.find(x=>x.id===organizationId)?.officialName}
 private planLimits(s:State,license:LicenseRecord){const p=s.plans.find(x=>x.id===license.planId);if(!p)throw new Error('PLAN_NOT_FOUND');const boost=license.temporaryStorageBoost&&Date.parse(license.temporaryStorageBoost.expiresAt)>Date.now()?license.temporaryStorageBoost.bytes:0;return {activeCompetitions:license.overrides?.activeCompetitions??p.limits.activeCompetitions,annualParticipants:license.overrides?.annualParticipants??p.limits.annualParticipants,storageBytes:(license.overrides?.storageBytes??p.limits.storageBytes)+boost,branches:license.overrides?.branches??p.limits.branches}}

 seedInitialPlan(actor:CommercialActor,input?:Partial<PlanRecord>){this.super(actor);return this.mutate(s=>{const existingPlan=s.plans.find(x=>x.catalog!=='mizan'&&!x.ownerOperatorId);if(existingPlan)return existingPlan;const t=now();const p:PlanRecord={id:this.next(s,'PLAN'),name:clean(input?.name||'Basic',80),currency:clean(input?.currency||'KWD',3).toUpperCase(),priceMinor:positive(input?.priceMinor),billingPeriod:input?.billingPeriod||'annual',active:true,limits:{licensedOrganizations:positive(input?.limits?.licensedOrganizations||1),activeCompetitions:positive(input?.limits?.activeCompetitions||3),annualParticipants:positive(input?.limits?.annualParticipants||2500),storageBytes:positive(input?.limits?.storageBytes||10*1024**3),branches:positive(input?.limits?.branches||3)},features:{external_storage:false,white_label:false,video:false,...input?.features},createdAt:t,updatedAt:t,catalog:'legacy'};s.plans.push(p);this.audit(s,actor,{action:'PLAN_CREATED',entityType:'plan',entityId:p.id});return p})}
 upsertPlan(actor:CommercialActor,input:Partial<PlanRecord>){this.super(actor);return this.mutate(s=>{const existing=input.id?s.plans.find(x=>x.id===input.id):undefined;const p=this.buildPlan(s,input,existing,undefined,now());if(existing)Object.assign(existing,p);else s.plans.push(p);this.audit(s,actor,{action:existing?'PLAN_UPDATED':'PLAN_CREATED',entityType:'plan',entityId:p.id});return p})}
 deletePlan(actor:CommercialActor,id:string){this.super(actor);return this.mutate(s=>{const index=s.plans.findIndex(x=>x.id===id);if(index<0)throw new Error('PLAN_NOT_FOUND');if(s.licenses.some(x=>x.planId===id))throw new Error('PLAN_IN_USE');if(s.subscriptions.some(x=>x.planId===id&&x.status!=='canceled'))throw new Error('PLAN_IN_USE');const [plan]=s.plans.splice(index,1);this.audit(s,actor,{action:'PLAN_DELETED',entityType:'plan',entityId:id,reason:plan.name});return {id,name:plan.name}})}

 // ————— باقات المشغّل: ينشئها المشغّل ويبيعها لجهاته (بنفس بنية خطط المنصة، بنطاق المشغّل) —————
 private operatorScope(actor:CommercialActor){if(!['operator_owner','operator_admin'].includes(actor.role)||!actor.operatorId)throw new Error('OPERATOR_REQUIRED');return actor.operatorId}
 private buildPlan(s:State,input:Partial<PlanRecord>,existing:PlanRecord|undefined,ownerOperatorId:string|undefined,t:string):PlanRecord{const p:PlanRecord={id:existing?.id||this.next(s,'PLAN'),name:clean(input.name||existing?.name,80),currency:clean(input.currency||existing?.currency||'KWD',3).toUpperCase(),priceMinor:positive(input.priceMinor??existing?.priceMinor),billingPeriod:input.billingPeriod||existing?.billingPeriod||'annual',active:input.active??existing?.active??true,limits:{licensedOrganizations:positive(input.limits?.licensedOrganizations??existing?.limits.licensedOrganizations??1),activeCompetitions:positive(input.limits?.activeCompetitions??existing?.limits.activeCompetitions??3),annualParticipants:positive(input.limits?.annualParticipants??existing?.limits.annualParticipants??2500),storageBytes:positive(input.limits?.storageBytes??existing?.limits.storageBytes??10*1024**3),branches:positive(input.limits?.branches??existing?.limits.branches??3),videoBytes:input.limits?.videoBytes??existing?.limits.videoBytes},features:{...(existing?.features||{}),...(input.features||{})},overage:input.overage??existing?.overage,ownerOperatorId:existing?.ownerOperatorId??ownerOperatorId,createdAt:existing?.createdAt||t,updatedAt:t};if(!p.name)throw new Error('PLAN_NAME_REQUIRED');return p}
 operatorUpsertPlan(actor:CommercialActor,input:Partial<PlanRecord>){const opId=this.operatorScope(actor);return this.mutate(s=>{const existing=input.id?s.plans.find(x=>x.id===input.id):undefined;if(existing&&existing.ownerOperatorId!==opId)throw new Error('CROSS_OPERATOR_PLAN_BLOCKED');const p=this.buildPlan(s,input,existing,opId,now());if(existing)Object.assign(existing,p);else s.plans.push(p);this.audit(s,actor,{action:existing?'OPERATOR_PLAN_UPDATED':'OPERATOR_PLAN_CREATED',entityType:'plan',entityId:p.id,reason:opId});return p})}
 operatorDeletePlan(actor:CommercialActor,id:string){const opId=this.operatorScope(actor);return this.mutate(s=>{const index=s.plans.findIndex(x=>x.id===id&&x.ownerOperatorId===opId);if(index<0)throw new Error('PLAN_NOT_FOUND');if(s.licenses.some(x=>x.planId===id)||s.subscriptions.some(x=>x.planId===id&&x.status!=='canceled'))throw new Error('PLAN_IN_USE');const [plan]=s.plans.splice(index,1);this.audit(s,actor,{action:'OPERATOR_PLAN_DELETED',entityType:'plan',entityId:id,reason:plan.name});return {id,name:plan.name}})}

 // ————— الفوترة والاشتراكات (محايدة للدفع: provider='manual' افتراضًا، externalRef جاهز لأي بوابة) —————
 private orgOperatorId(s:State,organizationId:string){return s.organizations.find(x=>x.id===organizationId)?.operatorId}
 private assertBillingManage(s:State,actor:CommercialActor,subjectType:BillingSubjectType,subjectId:string){if(actor.role==='super_admin')return;if(['operator_owner','operator_admin'].includes(actor.role)&&actor.operatorId){if(subjectType==='organization'&&this.orgOperatorId(s,subjectId)===actor.operatorId)return}throw new Error('BILLING_NOT_ALLOWED')}
 private periodEnd(startISO:string,period:'monthly'|'annual'|'custom'){const d=new Date(startISO);if(period==='annual')d.setUTCFullYear(d.getUTCFullYear()+1);else if(period==='monthly')d.setUTCMonth(d.getUTCMonth()+1);else d.setUTCMonth(d.getUTCMonth()+1);return d.toISOString()}
 createSubscription(actor:CommercialActor,input:{subjectType:BillingSubjectType;subjectId:string;planId:string;startsAt?:string;provider?:string;amountMinor?:number;autoRenew?:boolean;channelOverrideReason?:string}){return this.mutate(s=>{this.assertBillingManage(s,actor,input.subjectType,input.subjectId);/* تعارض القنوات: ميزان المباشر لا يُصدر اشتراكًا لجهةٍ يملكها مشغّل دون علمٍ صريح. */if(input.subjectType==='organization'&&actor.role==='super_admin'){const o=s.organizations.find(x=>x.id===input.subjectId);if(o&&engine.commercialOwnerOf(o)==='operator'&&o.operatorId&&engine.activeAgreement(s,o.operatorId,this.clock()))engine.assertDirectChannel(s,input.subjectId,input.channelOverrideReason)}const plan=s.plans.find(x=>x.id===input.planId);if(!plan)throw new Error('PLAN_NOT_FOUND');if(input.subjectType==='operator'){if(!s.operators.some(x=>x.id===input.subjectId))throw new Error('OPERATOR_NOT_FOUND')}else if(!s.organizations.some(x=>x.id===input.subjectId))throw new Error('ORGANIZATION_NOT_FOUND');const t=now(),start=input.startsAt?new Date(input.startsAt).toISOString():t;const ownerOperatorId=input.subjectType==='organization'?this.orgOperatorId(s,input.subjectId):undefined;const sub:SubscriptionRecord={id:this.next(s,'SUB'),subjectType:input.subjectType,subjectId:input.subjectId,ownerOperatorId,planId:plan.id,status:'active',currency:plan.currency,amountMinor:input.amountMinor!=null?positive(input.amountMinor):plan.priceMinor,billingPeriod:plan.billingPeriod,currentPeriodStart:start,currentPeriodEnd:this.periodEnd(start,plan.billingPeriod),autoRenew:input.autoRenew!==false,overage:plan.overage?{...plan.overage}:undefined,provider:clean(input.provider||'manual',40),createdAt:t,updatedAt:t};s.subscriptions.push(sub);this.audit(s,actor,{action:'SUBSCRIPTION_CREATED',entityType:'subscription',entityId:sub.id,reason:`${input.subjectType}:${input.subjectId}`});return sub})}
 setSubscriptionAutoRenew(actor:CommercialActor,id:string,autoRenew:boolean){return this.mutate(s=>{const sub=s.subscriptions.find(x=>x.id===id);if(!sub)throw new Error('SUBSCRIPTION_NOT_FOUND');this.assertBillingManage(s,actor,sub.subjectType,sub.subjectId);sub.autoRenew=!!autoRenew;sub.updatedAt=now();this.audit(s,actor,{action:autoRenew?'SUBSCRIPTION_AUTORENEW_ON':'SUBSCRIPTION_AUTORENEW_OFF',entityType:'subscription',entityId:id});return sub})}
 cancelSubscription(actor:CommercialActor,id:string){return this.mutate(s=>{const sub=s.subscriptions.find(x=>x.id===id);if(!sub)throw new Error('SUBSCRIPTION_NOT_FOUND');this.assertBillingManage(s,actor,sub.subjectType,sub.subjectId);sub.status='canceled';sub.canceledAt=now();sub.updatedAt=now();this.audit(s,actor,{action:'SUBSCRIPTION_CANCELED',entityType:'subscription',entityId:id});return sub})}
 issueInvoice(actor:CommercialActor,input:{subjectType:BillingSubjectType;subjectId:string;subscriptionId?:string;amountMinor:number;currency?:string;dueAt?:string;periodStart?:string;periodEnd?:string;provider?:string;note?:string}){return this.mutate(s=>{this.assertBillingManage(s,actor,input.subjectType,input.subjectId);const amount=positive(input.amountMinor);if(!amount)throw new Error('INVOICE_AMOUNT_REQUIRED');const sub=input.subscriptionId?s.subscriptions.find(x=>x.id===input.subscriptionId):undefined;if(input.subscriptionId&&!sub)throw new Error('SUBSCRIPTION_NOT_FOUND');const t=now(),ownerOperatorId=input.subjectType==='organization'?this.orgOperatorId(s,input.subjectId):undefined;const inv:InvoiceRecord={id:this.next(s,'INV'),number:`INV-${String(s.invoices.length+1).padStart(6,'0')}`,subscriptionId:sub?.id,subjectType:input.subjectType,subjectId:input.subjectId,ownerOperatorId,currency:clean(input.currency||sub?.currency||'KWD',3).toUpperCase(),amountMinor:amount,status:'open',periodStart:input.periodStart,periodEnd:input.periodEnd,issuedAt:t,dueAt:input.dueAt?new Date(input.dueAt).toISOString():undefined,provider:clean(input.provider||'manual',40),note:clean(input.note,300)||undefined,createdAt:t,updatedAt:t};s.invoices.push(inv);this.audit(s,actor,{action:'INVOICE_ISSUED',entityType:'invoice',entityId:inv.id,reason:`${input.subjectType}:${input.subjectId} ${amount}`});return inv})}
 markInvoicePaid(actor:CommercialActor,id:string,input?:{method?:string;reference?:string;provider?:string;paidAt?:string}){return this.mutate(s=>{const inv=s.invoices.find(x=>x.id===id);if(!inv)throw new Error('INVOICE_NOT_FOUND');this.assertBillingManage(s,actor,inv.subjectType,inv.subjectId);if(inv.status==='void')throw new Error('INVOICE_VOID');inv.status='paid';inv.paidAt=input?.paidAt?new Date(input.paidAt).toISOString():now();inv.method=clean(input?.method||'manual',40);if(input?.reference)inv.externalRef=clean(input.reference,120);if(input?.provider)inv.provider=clean(input.provider,40);inv.updatedAt=now();this.audit(s,actor,{action:'INVOICE_PAID',entityType:'invoice',entityId:id,reason:inv.method});this.onInvoicePaid(s,actor,inv);return inv})}
 /*
  * إقفال الدورة تلقائيًا: عند انتهاء دورة اشتراك نشط تُصدَر فاتورة الدورة التالية وتتقدّم الدورة.
  * متكرّرة بأمان: تشغيلها مرتين لا يُصدر فاتورتين لأن الفاتورة تُميَّز ببداية دورتها.
  */
 private overageLines(s:State,sub:SubscriptionRecord,plan:PlanRecord|undefined,periodStart:string,periodEnd:string):InvoiceLine[]{
  /* الشروط المثبّتة على الاشتراك تسبق شروط الباقة الحالية: لا تُعاد تسعيرة دورة انقضت بأثر رجعي. */
  const o=sub.overage??plan?.overage;if(!o||sub.subjectType!=='organization')return [];
  const lines:InvoiceLine[]=[];
  /* الاستهلاك يُقاس بالدورة المفوترة نفسها، لا بالسنة الميلادية: وإلا فاتت دورة لا تبدأ في يناير،
     وتكرّرت المحاسبة على المتسابقين أنفسهم في كل تجديد شهري. */
  const from=Date.parse(periodStart),to=Date.parse(periodEnd);
  if(o.perParticipantMinor){
   const used=s.participantUsage.filter(x=>{if(x.organizationId!==sub.subjectId)return false;const at=Date.parse(x.createdAt);return Number.isFinite(at)?at>=from&&at<to:x.year===new Date(periodStart).getUTCFullYear()}).length;
   const extra=Math.max(0,used-positive(o.includedParticipants));
   if(extra>0)lines.push({description:`متسابقون فوق المشمول (${extra})`,quantity:extra,amountMinor:extra*positive(o.perParticipantMinor)});
  }
  if(o.perStorageGbMinor){
   const bytes=s.storageObjects.filter(x=>x.organizationId===sub.subjectId&&x.provider==='mizan'&&x.state==='stored').reduce((n,x)=>n+x.sizeBytes,0);
   const extra=Math.max(0,Math.ceil(bytes/1024**3)-positive(o.includedStorageGb));
   if(extra>0)lines.push({description:`تخزين فوق المشمول (${extra} GB)`,quantity:extra,amountMinor:extra*positive(o.perStorageGbMinor)});
  }
  return lines;
 }
  /*
   * ما يترتّب على سداد فاتورة، في معاملة السداد نفسها (ذرّيًّا، ومتكرّرًا بأمان):
   * تجديد → دورة جديدة وتمديد الترخيص؛ ترقية → تغيير باقة الدورة الحالية؛ شحن → رصيد المشغّل.
   */
  private onInvoicePaid(s:State,actor:CommercialActor,inv:InvoiceRecord){
   const ctx=this.ctx(s,actor);
   if(inv.kind==='wallet_top_up'&&inv.subjectType==='operator'){engine.topUpWallet(ctx,inv.subjectId,{amountMinor:inv.amountMinor,currency:inv.currency,reference:`invoice:${inv.id}`,invoiceId:inv.id,reason:`Top-up invoice ${inv.number}`});return}
   if(inv.subjectType!=='organization')return;
   if(inv.kind==='plan_upgrade'&&inv.metadata?.planId){engine.applyDirectUpgrade(ctx,inv.subjectId,inv.metadata.planId,inv.id);return}
   if(inv.kind==='renewal'){
    if(!engine.latestTerm(s,inv.subjectId)){this.audit(s,actor,{organizationId:inv.subjectId,action:'RENEWAL_TERM_SKIPPED_NO_PRIOR_TERM',entityType:'invoice',entityId:inv.id});return}
    const {term,alreadyApplied}=engine.renewTerm(ctx,inv.subjectId,{invoiceId:inv.id});
    if(!alreadyApplied)hooks.enqueueWebhookEvent(ctx,inv.subjectId,'subscription.renewed',{termId:term.id,planId:term.planId,startsAt:term.startsAt,endsAt:term.endsAt});
   }
  }
  /*
   * دورة الفوترة: تجديد عملاء المشغّلين من رصيده، وإصدار فواتير التجديد للعملاء المباشرين (والدورة
   * الجديدة تُنشأ عند السداد لا عند الإصدار)، وإقفال الدورات المنتهية، وانتهاء أرصدة الاتفاقيات.
   * متكرّرة بأمان: فاتورة الدورة تُميَّز ببدايتها، وتجديد المشغّل يُميَّز بالدورة التي يجدّدها.
   */
  runBillingCycle(asOf:Date=new Date(this.clock())){return this.mutate(s=>{
   const at=asOf.toISOString(),issued:InvoiceRecord[]=[];let advanced=0;
   const ctx=this.ctx(s,{uid:'__billing__',role:'system',organizationId:'__platform__'},asOf.getTime());
   const walletRenewals:{organizationId:string;termId?:string;pending?:boolean;error?:string}[]=[];
   for(const sub of s.subscriptions){
    if(sub.autoRenew===false)continue;
    if(Date.parse(sub.currentPeriodEnd)>asOf.getTime())continue;
    if(sub.provider==='operator_wallet'&&sub.subjectType==='organization'){
     if(sub.status!=='active'&&sub.status!=='past_due')continue;
     /* المشغّل يدفع من رصيده بسعر الجملة؛ ميزان لا يُصدر فاتورةً على عميل المشغّل. */
     try{const r=engine.operatorRenewOrganization(ctx,sub.subjectId,{auto:true});if('pending' in r){walletRenewals.push({organizationId:sub.subjectId,pending:true});hooks.enqueueWebhookEvent(ctx,sub.subjectId,'subscription.payment_failed',{reason:'OPERATOR_RENEWAL_PENDING',subscriptionId:sub.id})}else if(!r.alreadyRenewed){walletRenewals.push({organizationId:sub.subjectId,termId:r.term.id});hooks.enqueueWebhookEvent(ctx,sub.subjectId,'subscription.renewed',{termId:r.term.id,planId:r.term.planId,startsAt:r.term.startsAt,endsAt:r.term.endsAt})}}
     catch(err){const code=err instanceof Error?err.message:'RENEWAL_FAILED';walletRenewals.push({organizationId:sub.subjectId,error:code});if(sub.status!=='past_due'){sub.status='past_due';sub.updatedAt=at}this.audit(s,ctx.actor,{organizationId:sub.subjectId,action:'OPERATOR_RENEWAL_FAILED',entityType:'subscription',entityId:sub.id,reason:code})}
     continue;
    }
    if(sub.status!=='active')continue;
    const periodStart=sub.currentPeriodEnd,periodEnd=this.periodEnd(periodStart,sub.billingPeriod);
    const planId=sub.pendingPlanId||sub.planId;
    const plan=s.plans.find(x=>x.id===planId);
    /* باقة الكتالوج تُجدَّد بسعرها المعمول به يوم التجديد؛ السعر التعاقدي على الاشتراك يبقى لغيرها. */
    const renewalAmount=plan?.catalog==='mizan'&&!plan.custom?engine.planPriceAt(s,plan.id,asOf.getTime()).publicPriceMinor:sub.amountMinor;
    const already=s.invoices.some(x=>x.subscriptionId===sub.id&&x.periodStart===periodStart);
    if(!already){
     const lines:InvoiceLine[]=[{description:`اشتراك ${plan?.name||planId}`,amountMinor:renewalAmount},...this.overageLines(s,sub,plan,sub.currentPeriodStart,periodStart)];
     const amountMinor=lines.reduce((n,x)=>n+x.amountMinor,0);
     /* تجديد بلا مبلغ ليس فاتورة: لا يُفتح مستحق بصفر يتراكم في «غير محصّل» ثم يظهر متأخرًا. */
     if(amountMinor>0){
      const due=new Date(periodStart);due.setUTCDate(due.getUTCDate()+14);
      const inv:InvoiceRecord={id:this.next(s,'INV'),number:`INV-${String(s.invoices.length+1).padStart(6,'0')}`,subscriptionId:sub.id,lines,subjectType:sub.subjectType,subjectId:sub.subjectId,ownerOperatorId:sub.ownerOperatorId,currency:sub.currency,amountMinor,status:'open',periodStart,periodEnd,issuedAt:at,dueAt:due.toISOString(),provider:'manual',kind:'renewal',createdAt:at,updatedAt:at};
      s.invoices.push(inv);issued.push(inv);
      this.audit(s,{uid:'__billing__',role:'system',organizationId:'__platform__'},{action:'INVOICE_ISSUED_BY_RENEWAL',entityType:'invoice',entityId:inv.id,reason:`${sub.subjectType}:${sub.subjectId}`});
     }else if(sub.subjectType==='organization'&&engine.latestTerm(s,sub.subjectId)&&!s.subscriptionTerms.some(t=>t.organizationId===sub.subjectId&&!t.legacy&&Date.parse(t.startsAt)>=Date.parse(periodStart))){
      /* باقةٌ بلا مقابل (عقد وطني أو منحة) تتجدّد دورتُها مباشرةً بلا فاتورة. */
      engine.renewTerm(ctx,sub.subjectId,{});
     }
    }
    /* الدورة الجديدة تلتقط شروط الباقة كما هي الآن، وتبقى مثبّتة حتى نهايتها. */
    sub.currentPeriodStart=periodStart;sub.currentPeriodEnd=periodEnd;sub.overage=plan?.overage?{...plan.overage}:undefined;sub.updatedAt=at;advanced++;
   }
   const ownershipTransfers=engine.applyDueOwnershipTransfers(ctx).length;
   const closedTerms=engine.closeEndedTerms(ctx);
   const expiredAgreements=engine.expireEndedAgreements(ctx);
   /* تعذّر السداد يُبلَّغ مرّةً واحدة لكل فاتورة تجاوزت استحقاقها. */
   for(const inv of s.invoices){
    if(inv.status!=='open'||inv.subjectType!=='organization'||inv.paymentFailedNotifiedAt||!inv.dueAt||Date.parse(inv.dueAt)>asOf.getTime())continue;
    inv.paymentFailedNotifiedAt=at;
    hooks.enqueueWebhookEvent(ctx,inv.subjectId,'subscription.payment_failed',{invoiceId:inv.id,invoiceNumber:inv.number,dueAt:inv.dueAt});
    this.audit(s,ctx.actor,{organizationId:inv.subjectId,action:'SUBSCRIPTION_PAYMENT_OVERDUE',entityType:'invoice',entityId:inv.id});
   }
   return {at,advanced,issued:issued.map(x=>this.decorateInvoice(s,x)),walletRenewals,closedTerms,expiredAgreements,ownershipTransfers}})}
 /* بدء دفع إلكتروني: يتحقق من الصلاحية ويعيد بيانات الفاتورة للبوابة (النداء الشبكي خارج الحالة). */
 beginCheckout(actor:CommercialActor,id:string){const s=this.read();const inv=s.invoices.find(x=>x.id===id);if(!inv)throw new Error('INVOICE_NOT_FOUND');this.assertBillingManage(s,actor,inv.subjectType,inv.subjectId);if(inv.status!=='open')throw new Error('INVOICE_NOT_OPEN');return {invoice:inv,subjectName:this.subjectLabel(s,inv.subjectType,inv.subjectId),contact:inv.subjectType==='organization'?s.organizations.find(x=>x.id===inv.subjectId):undefined}}
 attachCheckout(actor:CommercialActor,id:string,input:{provider:string;externalRef:string}){return this.mutate(s=>{const inv=s.invoices.find(x=>x.id===id);if(!inv)throw new Error('INVOICE_NOT_FOUND');this.assertBillingManage(s,actor,inv.subjectType,inv.subjectId);inv.provider=clean(input.provider,40)||'manual';inv.externalRef=clean(input.externalRef,160);inv.updatedAt=now();this.audit(s,actor,{action:'INVOICE_CHECKOUT_STARTED',entityType:'invoice',entityId:id,reason:inv.provider});return this.decorateInvoice(s,inv)})}
 /* تسوية آلية من إشعار البوابة: بلا فاعل بشري، ومتكرّرة بأمان — إشعار مُعاد لا يغيّر شيئًا. */
 settleInvoiceByReference(provider:string,externalRef:string,input:{amountMinor?:number;currency?:string;paidAt?:string;method?:string}){
  const gateway=clean(provider,40),ref=clean(externalRef,160);
  if(!ref)throw new Error('PAYMENT_REFERENCE_REQUIRED');
  /* المرجع فريد داخل بوابته فقط: مطابقته وحدها قد تصيب فاتورة بوابة أخرى أو تحصيل يدوي. */
  const locate=(s:State)=>s.invoices.find(x=>x.externalRef===ref&&x.provider===gateway);
  /* التدقيق يجب أن يبقى حتى مع الرفض: الرمي يمنع الكتابة، فيُكتب المخالفة في معاملة مستقلة. */
  const auditRejection=(action:string,invoiceId:string,reason:string)=>this.mutate(s=>{this.audit(s,{uid:'__gateway__',role:'system',organizationId:'__platform__'},{action,entityType:'invoice',entityId:invoiceId,reason})});
  const found=locate(this.read());
  if(!found)throw new Error('INVOICE_NOT_FOUND');
  if(found.status==='open'){
   if(input.amountMinor!==undefined&&Math.round(input.amountMinor)!==found.amountMinor){auditRejection('INVOICE_PAYMENT_AMOUNT_MISMATCH',found.id,`expected ${found.amountMinor} received ${input.amountMinor}`);throw new Error('PAYMENT_AMOUNT_MISMATCH')}
   /* مبلغ متطابق رقميًا بعملة أخرى ليس سدادًا: ٥٠٠٠ سنت لا تُغلق فاتورة ٥٠٠٠ فلس. */
   if(input.currency&&clean(input.currency,3).toUpperCase()!==found.currency.toUpperCase()){auditRejection('INVOICE_PAYMENT_CURRENCY_MISMATCH',found.id,`expected ${found.currency} received ${input.currency}`);throw new Error('PAYMENT_CURRENCY_MISMATCH')}
  }
  return this.mutate(s=>{const inv=locate(s);if(!inv)throw new Error('INVOICE_NOT_FOUND');
  if(inv.status==='paid')return {invoice:this.decorateInvoice(s,inv),alreadySettled:true};
  if(inv.status!=='open')throw new Error('INVOICE_NOT_OPEN');
  inv.status='paid';inv.paidAt=input.paidAt?new Date(input.paidAt).toISOString():now();inv.method=clean(input.method,40)||gateway;inv.updatedAt=now();
  this.audit(s,{uid:'__gateway__',role:'system',organizationId:'__platform__'},{action:'INVOICE_PAID_BY_GATEWAY',entityType:'invoice',entityId:inv.id,reason:`${gateway}:${ref}`});this.onInvoicePaid(s,{uid:'__gateway__',role:'system',organizationId:'__platform__'},inv);
  return {invoice:this.decorateInvoice(s,inv),alreadySettled:false}})}
 /* تذكير بفاتورة مفتوحة: يتحقق من الصلاحية ويوثّق، ويترك الإرسال لمركز الإشعارات في الطبقة الأعلى. */
 remindInvoice(actor:CommercialActor,id:string){return this.mutate(s=>{const inv=s.invoices.find(x=>x.id===id);if(!inv)throw new Error('INVOICE_NOT_FOUND');this.assertBillingManage(s,actor,inv.subjectType,inv.subjectId);if(inv.status!=='open')throw new Error('INVOICE_NOT_OPEN');this.audit(s,actor,{action:'INVOICE_REMINDER_SENT',entityType:'invoice',entityId:id,reason:`${inv.subjectType}:${inv.subjectId}`});return {invoice:this.decorateInvoice(s,inv),organizationId:inv.subjectType==='organization'?inv.subjectId:undefined,operatorId:inv.subjectType==='operator'?inv.subjectId:inv.ownerOperatorId}})}
 voidInvoice(actor:CommercialActor,id:string){return this.mutate(s=>{const inv=s.invoices.find(x=>x.id===id);if(!inv)throw new Error('INVOICE_NOT_FOUND');this.assertBillingManage(s,actor,inv.subjectType,inv.subjectId);if(inv.status==='paid')throw new Error('INVOICE_ALREADY_PAID');inv.status='void';inv.updatedAt=now();this.audit(s,actor,{action:'INVOICE_VOIDED',entityType:'invoice',entityId:id});return inv})}
 private subjectLabel(s:State,t:BillingSubjectType,id:string){return t==='operator'?(s.operators.find(x=>x.id===id)?.name||id):(s.organizations.find(x=>x.id===id)?.officialName||id)}
 /* «متأخرة» ليست حالة مخزّنة بل اشتقاق زمني: فاتورة مفتوحة مضى تاريخ استحقاقها. */
 private isOverdue(inv:InvoiceRecord){return inv.status==='open'&&!!inv.dueAt&&Date.parse(inv.dueAt)<Date.now()}
 private decorateInvoice(s:State,inv:InvoiceRecord){return {...inv,overdue:this.isOverdue(inv),daysOverdue:this.isOverdue(inv)?Math.floor((Date.now()-Date.parse(inv.dueAt!))/86400_000):0,subjectName:this.subjectLabel(s,inv.subjectType,inv.subjectId),operatorName:inv.ownerOperatorId?s.operators.find(x=>x.id===inv.ownerOperatorId)?.name:undefined}}
 private decorateSub(s:State,sub:SubscriptionRecord){const plan=s.plans.find(x=>x.id===sub.planId);const open=s.invoices.filter(x=>x.subscriptionId===sub.id&&x.status==='open');return {...sub,planName:plan?.name,subjectName:this.subjectLabel(s,sub.subjectType,sub.subjectId),operatorName:sub.ownerOperatorId?s.operators.find(x=>x.id===sub.ownerOperatorId)?.name:undefined,openInvoices:open.length,openAmountMinor:open.reduce((n,x)=>n+x.amountMinor,0)}}
 billingSummary(s:State,subs:SubscriptionRecord[],invs:InvoiceRecord[]){const paid=invs.filter(x=>x.status==='paid'),open=invs.filter(x=>x.status==='open');const byCurrency=(rows:InvoiceRecord[])=>Object.entries(rows.reduce((m,x)=>{m[x.currency]=(m[x.currency]||0)+x.amountMinor;return m},{} as Record<string,number>)).map(([currency,amountMinor])=>({currency,amountMinor}));const overdue=open.filter(x=>this.isOverdue(x));
  /* إيرادات آخر ١٢ شهرًا من الفواتير المدفوعة فعلًا، مجمّعة بالشهر والعملة. */
  const months:{month:string;byCurrency:{currency:string;amountMinor:number}[];count:number}[]=[];
  for(let i=11;i>=0;i--){const d=new Date();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-i);const key=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;const rows=paid.filter(x=>String(x.paidAt||'').slice(0,7)===key);months.push({month:key,count:rows.length,byCurrency:byCurrency(rows)})}
  return {activeSubscriptions:subs.filter(x=>x.status==='active').length,canceledSubscriptions:subs.filter(x=>x.status==='canceled').length,paidInvoices:paid.length,openInvoices:open.length,overdueInvoices:overdue.length,collected:byCurrency(paid),outstanding:byCurrency(open),overdue:byCurrency(overdue),revenueByMonth:months}}
 createOperator(actor:CommercialActor,input:{name:string;pricingTier?:string;whiteLabelLevel?:OperatorRecord['whiteLabelLevel']}){this.super(actor);return this.mutate(s=>{const op:OperatorRecord={id:this.next(s,'OP'),name:clean(input.name,120),status:'active',pricingTier:clean(input.pricingTier||'standard',40),whiteLabelLevel:input.whiteLabelLevel||'mizan',createdAt:now()};if(!op.name)throw new Error('OPERATOR_NAME_REQUIRED');s.operators.push(op);this.audit(s,actor,{action:'OPERATOR_CREATED',entityType:'operator',entityId:op.id});return op})}
 updateOperator(actor:CommercialActor,operatorId:string,input:{name?:string;status?:OperatorRecord['status'];pricingTier?:string;whiteLabelLevel?:OperatorRecord['whiteLabelLevel'];storageCapBytes?:number}){this.super(actor);return this.mutate(s=>{const op=s.operators.find(x=>x.id===operatorId);if(!op)throw new Error('OPERATOR_NOT_FOUND');if(input.name!==undefined){const name=clean(input.name,120);if(!name)throw new Error('OPERATOR_NAME_REQUIRED');op.name=name}if(input.status&&['active','suspended'].includes(input.status))op.status=input.status;if(input.pricingTier!==undefined)op.pricingTier=clean(input.pricingTier,40)||'standard';if(input.whiteLabelLevel&&['mizan','co_branded','full'].includes(input.whiteLabelLevel))op.whiteLabelLevel=input.whiteLabelLevel;if(input.storageCapBytes!==undefined)op.storageCapBytes=positive(input.storageCapBytes)||undefined;this.audit(s,actor,{action:'OPERATOR_UPDATED',entityType:'operator',entityId:op.id,reason:`${op.name} · ${op.status} · ${op.pricingTier} · ${op.whiteLabelLevel}`});return op})}
 /*
  * نشرُ وثائق طبقةٍ باسمها.
  *
  * كانت الحقولُ (`OperatorRecord.legal` و`OrganizationRecord.legal`) موجودةً وقارئُها
  * `legalChainFor` موجودًا — **ولا كاتبَ لهما أصلًا**. فكانت السلسلةُ تخرج فارغةً دائمًا
  * ويسقط الجميعُ إلى وثيقة المنصّة: نموذجٌ ثلاثيُّ الطبقات لا يُستعمل منه إلا طبقةٌ واحدة.
  *
  * والنشرُ فعلٌ يُسأل عنه صاحبُه، فيُكتب في سجلّ التدقيق باسم فاعله. والتنظيفُ هنا
  * يقتصر على القصّ، ولا يُكمل ناقصًا: صحّةُ الوثيقة يحكم بها `legalDocumentState`
  * وحدَه عند القراءة، فالنقصُ الجزئيّ يبقى `LEGAL_DOCUMENT_NOT_PUBLISHED` ولا يُحتجّ به.
  * و`null` سحبٌ للنشر — تنزل السلسلةُ بعده إلى من فوقه باسمه هو.
  */
 private normalizeLegal(input:LegalDocumentConfig|null|undefined):LegalDocumentConfig|undefined{
  if(!input)return undefined;
  const documents:LegalDocumentConfig['documents']={};
  for(const kind of CONSENT_BACKED_DOCUMENTS){
   const entry=input.documents?.[kind];if(!entry)continue;
   documents[kind]={version:clean(entry.version,40)||undefined,effectiveDate:clean(entry.effectiveDate,10)||undefined,url:clean(entry.url,500)||undefined};
  }
  const entityName=clean(input.entityName,180)||undefined;
  if(!entityName&&!Object.keys(documents).length)return undefined;
  return {entityName,documents};
 }
 private legalAuditReason(config:LegalDocumentConfig|undefined){
  if(!config)return 'legal documents withdrawn';
  const published=CONSENT_BACKED_DOCUMENTS.filter(kind=>isPublished(legalDocumentState(config,kind)));
  return `${config.entityName||'(no entity name)'} · published: ${published.join(', ')||'none'}`;
 }
 setOperatorLegal(actor:CommercialActor,operatorId:string,legal:LegalDocumentConfig|null){this.super(actor);return this.mutate(s=>{const op=s.operators.find(x=>x.id===operatorId);if(!op)throw new Error('OPERATOR_NOT_FOUND');op.legal=this.normalizeLegal(legal);this.audit(s,actor,{action:'OPERATOR_LEGAL_DOCUMENTS_SET',entityType:'operator',entityId:op.id,reason:this.legalAuditReason(op.legal)});return op})}
 setOrganizationLegal(actor:CommercialActor,organizationId:string,legal:LegalDocumentConfig|null){this.super(actor);return this.mutate(s=>{const org=s.organizations.find(x=>x.id===organizationId);if(!org)throw new Error('ORGANIZATION_NOT_FOUND');org.legal=this.normalizeLegal(legal);this.audit(s,actor,{tenantId:org.tenantId,organizationId:org.id,action:'ORGANIZATION_LEGAL_DOCUMENTS_SET',entityType:'organization',entityId:org.id,reason:this.legalAuditReason(org.legal)});return org})}
 deleteOperator(actor:CommercialActor,operatorId:string){this.super(actor);return this.mutate(s=>{const index=s.operators.findIndex(x=>x.id===operatorId);if(index<0)throw new Error('OPERATOR_NOT_FOUND');if(s.organizations.some(x=>x.operatorId===operatorId))throw new Error('OPERATOR_HAS_ORGANIZATIONS');if(this.creditBalance(s,operatorId)!==0)throw new Error('OPERATOR_HAS_CREDIT_BALANCE');const op=s.operators[index];s.operators.splice(index,1);s.creditLedger=s.creditLedger.filter(x=>x.operatorId!==operatorId);this.audit(s,actor,{action:'OPERATOR_DELETED',entityType:'operator',entityId:operatorId,reason:op.name});return {id:operatorId,name:op.name}})}
 creditBalance(s:State,operatorId:string){return s.creditLedger.filter(x=>x.operatorId===operatorId).reduce((n,x)=>n+x.quantity,0)}
 adjustCredits(actor:CommercialActor,operatorId:string,quantity:number,reason:string,kind:CreditLedgerRow['kind']='admin_adjustment'){this.super(actor);if(!Number.isInteger(quantity)||quantity===0)throw new Error('CREDIT_QUANTITY_INVALID');if(clean(reason).length<3)throw new Error('REASON_REQUIRED');return this.mutate(s=>{const op=s.operators.find(x=>x.id===operatorId);if(!op)throw new Error('OPERATOR_NOT_FOUND');const balance=this.creditBalance(s,operatorId)+quantity;if(balance<0)throw new Error('INSUFFICIENT_LICENSE_CREDITS');const row:CreditLedgerRow={id:this.next(s,'CR'),operatorId,kind,quantity,balanceAfter:balance,reason:clean(reason,300),createdAt:now(),actorId:actor.uid};s.creditLedger.push(row);this.audit(s,actor,{action:'LICENSE_CREDITS_ADJUSTED',entityType:'operator',entityId:operatorId,reason});return row})}
 createOrganization(actor:CommercialActor,input:{officialName:string;shortName:string;organizationType:string;country:string;legalEmail?:string;legalPhone?:string;website?:string;legalRegistration?:string;primaryContact?:string;operatorId?:string;planId:string;startsAt:string;expiresAt:string}){return this.mutate(s=>{const operatorId=input.operatorId||(actor.role.startsWith('operator_')?actor.operatorId:undefined);if(actor.role!=='super_admin'&&(!['operator_owner','operator_admin'].includes(actor.role)||!operatorId||operatorId!==actor.operatorId))throw new Error('ORGANIZATION_CREATE_NOT_ALLOWED');if(operatorId){const op=s.operators.find(x=>x.id===operatorId&&x.status==='active');if(!op)throw new Error('OPERATOR_NOT_ACTIVE');/* المشغّل ذو الاتفاقية النشطة يفعّل عملاءه من رصيده المالي بسعر الجملة، لا بوحدات «جهة واحدة». */if(actor.role!=='super_admin'&&engine.activeAgreement(s,operatorId,this.clock()))throw new Error('OPERATOR_WALLET_ACTIVATION_REQUIRED');if(this.creditBalance(s,operatorId)<1)throw new Error('INSUFFICIENT_LICENSE_CREDITS')}
 const plan=s.plans.find(x=>x.id===input.planId&&x.active);if(!plan)throw new Error('PLAN_NOT_FOUND');if(plan.ownerOperatorId&&plan.ownerOperatorId!==operatorId)throw new Error('PLAN_NOT_FOUND');if(!clean(input.officialName)||!clean(input.shortName)||!clean(input.country))throw new Error('ORGANIZATION_IDENTITY_REQUIRED');if(Date.parse(input.expiresAt)<=Date.parse(input.startsAt))throw new Error('LICENSE_DATES_INVALID');const orgId=this.next(s,'MZ-ORG'),tenantId=this.next(s,'MZ-TEN'),licenseId=this.next(s,'MZ-LIC'),t=now();const org:OrganizationRecord={id:orgId,tenantId,licenseId,officialName:clean(input.officialName,180),shortName:clean(input.shortName,80),organizationType:clean(input.organizationType,80),country:clean(input.country,2).toUpperCase(),legalEmail:clean(input.legalEmail,180)||undefined,legalPhone:clean(input.legalPhone,40)||undefined,website:clean(input.website,240)||undefined,legalRegistration:clean(input.legalRegistration,100)||undefined,primaryContact:clean(input.primaryContact,120)||undefined,operatorId,commercialOwner:operatorId?'operator':'direct',status:'active',operational:{},createdAt:t,updatedAt:t};const license:LicenseRecord={id:licenseId,organizationId:orgId,planId:plan.id,startsAt:new Date(input.startsAt).toISOString(),expiresAt:new Date(input.expiresAt).toISOString(),status:'active',whiteLabelEnabled:false,brandingLevel:'mizan',customDomainEnabled:false,createdAt:t,updatedAt:t};s.organizations.push(org);s.licenses.push(license);if(operatorId){const balance=this.creditBalance(s,operatorId)-1;s.creditLedger.push({id:this.next(s,'CR'),operatorId,kind:'consume',quantity:-1,balanceAfter:balance,reason:`Organization ${org.id}`,reference:org.id,createdAt:t,actorId:actor.uid})}this.audit(s,actor,{tenantId,organizationId:org.id,action:'ORGANIZATION_CREATED',entityType:'organization',entityId:org.id,reason:operatorId?'operator license credit consumed':'direct MIZAN customer'});const term=engine.createInitialTerm(this.ctx(s,actor),org,license);return {organization:org,license,term,creditBalance:operatorId?this.creditBalance(s,operatorId):undefined}})}
 updateOrganization(actor:CommercialActor,id:string,input:Partial<OrganizationRecord>&{planId?:string;startsAt?:string;expiresAt?:string;licenseStatus?:LicenseState}){this.super(actor);return this.mutate(s=>{const org=s.organizations.find(x=>x.id===id),license=s.licenses.find(x=>x.organizationId===id);if(!org||!license)throw new Error('ORGANIZATION_NOT_FOUND');if(input.planId){const plan=s.plans.find(x=>x.id===input.planId&&x.active);if(!plan)throw new Error('PLAN_NOT_FOUND');license.planId=plan.id}if(input.startsAt||input.expiresAt){const startsAt=input.startsAt?new Date(input.startsAt).toISOString():license.startsAt,expiresAt=input.expiresAt?new Date(input.expiresAt).toISOString():license.expiresAt;if(Date.parse(expiresAt)<=Date.parse(startsAt))throw new Error('LICENSE_DATES_INVALID');license.startsAt=startsAt;license.expiresAt=expiresAt}if(input.licenseStatus)license.status=input.licenseStatus;license.updatedAt=now();org.officialName=clean(input.officialName||org.officialName,180);org.shortName=clean(input.shortName||org.shortName,80);org.organizationType=clean(input.organizationType||org.organizationType,80);org.country=clean(input.country||org.country,2).toUpperCase();org.legalEmail=clean(input.legalEmail??org.legalEmail,180)||undefined;org.legalPhone=clean(input.legalPhone??org.legalPhone,40)||undefined;org.website=clean(input.website??org.website,240)||undefined;org.legalRegistration=clean(input.legalRegistration??org.legalRegistration,100)||undefined;org.primaryContact=clean(input.primaryContact??org.primaryContact,120)||undefined;org.operatorId=clean(input.operatorId??org.operatorId,120)||undefined;if(input.status)org.status=input.status;org.updatedAt=now();this.audit(s,actor,{tenantId:org.tenantId,organizationId:org.id,action:'ORGANIZATION_UPDATED',entityType:'organization',entityId:org.id});return {organization:org,license}})}
 deleteOrganization(actor:CommercialActor,id:string){this.super(actor);return this.mutate(s=>{const index=s.organizations.findIndex(x=>x.id===id);if(index<0)throw new Error('ORGANIZATION_NOT_FOUND');const org=s.organizations[index];const hasUsage=s.competitions.some(x=>x.organizationId===id)||s.participantUsage.some(x=>x.organizationId===id)||s.storageObjects.some(x=>x.organizationId===id&&x.state!=='deleted')||s.storageAccounts.some(x=>x.organizationId===id)||s.storageMigrations.some(x=>x.organizationId===id)||s.changeRequests.some(x=>x.organizationId===id);if(hasUsage||s.walletLedger.some(x=>x.organizationId===id)||s.invoices.some(x=>x.subjectType==='organization'&&x.subjectId===id))throw new Error('ORGANIZATION_HAS_RECORDS');s.organizations.splice(index,1);s.licenses=s.licenses.filter(x=>x.organizationId!==id);s.subscriptionTerms=s.subscriptionTerms.filter(x=>x.organizationId!==id);this.audit(s,actor,{tenantId:org.tenantId,organizationId:id,action:'ORGANIZATION_DELETED',entityType:'organization',entityId:id,reason:org.officialName});return {id,name:org.officialName}})}
 migrateLegacyTenants(actor:CommercialActor,tenants:{orgId:string;displayNameArabic?:string;displayName?:string;status?:string}[],planId:string){this.super(actor);return this.mutate(s=>{let migrated=0;for(const old of tenants){if(s.organizations.some(x=>x.id===old.orgId))continue;const t=new Date(this.clock()).toISOString(),tenantId=this.next(s,'MZ-TEN'),licenseId=this.next(s,'MZ-LIC');s.organizations.push({id:old.orgId,tenantId,licenseId,officialName:clean(old.displayNameArabic||old.displayName||old.orgId),shortName:clean(old.displayNameArabic||old.displayName||old.orgId,80),organizationType:'legacy',country:'KW',operational:{},status:old.status==='suspended'?'suspended':'active',createdAt:t,updatedAt:t});s.licenses.push({id:licenseId,organizationId:old.orgId,planId,startsAt:t,expiresAt:new Date(this.clock()+365*86400_000).toISOString(),status:'active',whiteLabelEnabled:false,brandingLevel:'mizan',customDomainEnabled:false,createdAt:t,updatedAt:t});/* الجهة المرحَّلة بعد التشغيل تحتاج دورتها الأولى، وإلا صُنّفت موقوفة رغم ترخيصها. */engine.createInitialTerm(this.ctx(s,actor),s.organizations.at(-1)!,s.licenses.at(-1)!);this.audit(s,actor,{tenantId,organizationId:old.orgId,action:'LEGACY_ORGANIZATION_MIGRATED',entityType:'organization',entityId:old.orgId});migrated++}return {migrated}})}
 updateOperational(actor:CommercialActor,organizationId:string,patch:OrganizationRecord['operational']){this.orgScope(actor,organizationId);return this.mutate(s=>{const org=s.organizations.find(x=>x.id===organizationId);if(!org)throw new Error('ORGANIZATION_NOT_FOUND');org.operational={...org.operational,...Object.fromEntries(Object.entries(patch||{}).map(([k,v])=>[k,clean(v,240)]))};org.updatedAt=now();this.audit(s,actor,{tenantId:org.tenantId,organizationId,action:'ORGANIZATION_OPERATIONAL_PROFILE_UPDATED',entityType:'organization',entityId:organizationId});return org})}
 requestIdentityChange(actor:CommercialActor,organizationId:string,input:{field:ChangeRequestRecord['field'];requestedValue:string;reason:string;attachmentRef?:string}){this.orgScope(actor,organizationId);return this.mutate(s=>{const org=s.organizations.find(x=>x.id===organizationId);if(!org)throw new Error('ORGANIZATION_NOT_FOUND');if(!['officialName','country','operatorId','legalEmail','legalPhone'].includes(input.field))throw new Error('IDENTITY_FIELD_NOT_REQUESTABLE');const current=clean((org as unknown as Record<string,unknown>)[input.field]);if(!clean(input.requestedValue)||clean(input.reason).length<5)throw new Error('CHANGE_REQUEST_INCOMPLETE');const row:ChangeRequestRecord={id:this.next(s,'REQ'),organizationId,tenantId:org.tenantId,field:input.field,currentValue:current,requestedValue:clean(input.requestedValue,240),reason:clean(input.reason,500),attachmentRef:clean(input.attachmentRef,240)||undefined,status:'pending',submittedBy:actor.uid,createdAt:now()};s.changeRequests.push(row);this.audit(s,actor,{tenantId:org.tenantId,organizationId,action:'ORGANIZATION_IDENTITY_CHANGE_REQUESTED',entityType:'change_request',entityId:row.id,reason:row.reason});return row})}
 decideChange(actor:CommercialActor,id:string,decision:'approved'|'rejected'|'needs_information',note:string){this.super(actor);return this.mutate(s=>{const r=s.changeRequests.find(x=>x.id===id);if(!r||r.status!=='pending')throw new Error('CHANGE_REQUEST_NOT_PENDING');if(decision!=='approved'&&clean(note).length<3)throw new Error('DECISION_NOTE_REQUIRED');r.status=decision;r.decidedAt=now();r.decidedBy=actor.uid;r.decisionNote=clean(note,500)||undefined;if(decision==='approved'){const org=s.organizations.find(x=>x.id===r.organizationId);if(!org)throw new Error('ORGANIZATION_NOT_FOUND');(org as unknown as Record<string,unknown>)[r.field]=r.requestedValue;org.updatedAt=now()}this.audit(s,actor,{tenantId:r.tenantId,organizationId:r.organizationId,action:`ORGANIZATION_CHANGE_${decision.toUpperCase()}`,entityType:'change_request',entityId:r.id,reason:note});return r})}
 /* حدّ المسابقات = النشطة في الوقت نفسه، وفق دورة الاشتراك وحالة الوصول (انظر engine.setCompetitionCommercialState). */
 setCompetitionState(actor:CommercialActor,input:{organizationId:string;competitionId:string;organizerOrganizationId?:string;state:CompetitionCommercialState}){this.orgScope(actor,input.organizationId);return this.tx(actor,ctx=>engine.setCompetitionCommercialState(ctx,input))}
 /*
  * متسابقٌ فريدٌ داخل الجهة في دورة اشتراكها — لا في السنة الميلادية. `year` يُقبل للتوافق ويُتجاهَل
  * في الاستحقاق: اشتراكٌ بدأ 20 ديسمبر لا تتجدّد حصّته في 1 يناير.
  */
 recordParticipant(actor:CommercialActor,input:{organizationId:string;competitionId:string;participantId:string;identityKey?:string;year?:number}){this.orgScope(actor,input.organizationId);return this.tx(actor,ctx=>engine.recordParticipantUsage(ctx,input))}
 reserveUpload(actor:CommercialActor,input:{organizationId:string;competitionId?:string;fileType:string;mimeType:string;sizeBytes:number;provider?:StorageProvider}){this.orgScope(actor,input.organizationId);return this.mutate(s=>{const org=s.organizations.find(x=>x.id===input.organizationId),license=s.licenses.find(x=>x.organizationId===input.organizationId);if(!org||!license)throw new Error('LICENSE_NOT_FOUND');if(license.uploadsDisabled)throw new Error('UPLOADS_DISABLED_BY_PLATFORM');this.sweepStaleReservations(s);const size=positive(input.sizeBytes);if(!size)throw new Error('FILE_SIZE_REQUIRED');const mode=input.provider||'mizan';if(mode!=='mizan'){const plan=s.plans.find(x=>x.id===license.planId);if(!plan?.features.external_storage)throw new Error('EXTERNAL_STORAGE_NOT_INCLUDED');if(!s.storageAccounts.some(x=>x.organizationId===org.id&&x.provider===mode&&x.connectionStatus==='connected'))throw new Error('DESTINATION_STORAGE_NOT_READY');}const used=s.storageObjects.filter(x=>x.organizationId===org.id&&x.provider==='mizan'&&x.state==='stored').reduce((n,x)=>n+x.sizeBytes,0),reserved=s.storageObjects.filter(x=>x.organizationId===org.id&&x.provider==='mizan'&&x.state==='reserved').reduce((n,x)=>n+x.sizeBytes,0);if(mode==='mizan'&&used+reserved+size>this.planLimits(s,license).storageBytes)throw new Error('STORAGE_QUOTA_REACHED');if(mode==='mizan')this.assertOperatorStorageCap(s,org.operatorId,size);const id=this.next(s,'FILE'),key=`tenants/${org.tenantId}/competitions/${clean(input.competitionId||'_shared',120)}/${id}`;const row:StorageObjectRecord={id,tenantId:org.tenantId,organizationId:org.id,competitionId:clean(input.competitionId,120)||undefined,fileType:clean(input.fileType,60),mimeType:clean(input.mimeType,120),sizeBytes:size,provider:mode,storageKey:key,category:storageCategory(input.mimeType),state:'reserved',createdAt:now()};s.storageObjects.push(row);return row})}
 /* الحجوزات المهجورة (رفع بدأ ولم يكتمل) كانت تبتلع حصة الجهة إلى الأبد. تُنظَّف تلقائيًا مع كل حجز جديد. */
 private sweepStaleReservations(s:State,maxAgeMs=STALE_RESERVATION_MS){const cutoff=Date.now()-maxAgeMs;const before=s.storageObjects.length;s.storageObjects=s.storageObjects.filter(x=>!(x.state==='reserved'&&Date.parse(x.createdAt)<cutoff));return before-s.storageObjects.length}
 private releaseReservation(id:string){this.mutate(s=>{s.storageObjects=s.storageObjects.filter(x=>!(x.id===id&&x.state==='reserved'))})}
 /* سقف اختياري على مستوى المشغّل: مجموع ما تستهلكه جهاته لا يتجاوزه، مهما كانت حصص الخطط فرديًا. */
 private assertOperatorStorageCap(s:State,operatorId:string|undefined,addingBytes:number){if(!operatorId)return;const op=s.operators.find(x=>x.id===operatorId);const cap=positive(op?.storageCapBytes);if(!cap)return;const orgIds=new Set(s.organizations.filter(x=>x.operatorId===operatorId).map(x=>x.id));const consumed=s.storageObjects.filter(x=>orgIds.has(x.organizationId)&&x.provider==='mizan'&&(x.state==='stored'||x.state==='reserved')).reduce((n,x)=>n+x.sizeBytes,0);if(consumed+addingBytes>cap)throw new Error('OPERATOR_STORAGE_CAP_REACHED')}
 /* التثبيت يعتمد الحجم المقيس على الخادم لا المُبلَّغ من العميل: أي فارق يُصحَّح، وتجاوز الحصة يُرفض ويُحرَّر الحجز. */
 finalizeUpload(actor:CommercialActor,id:string,input:{organizationId:string;checksum:string;actualSizeBytes?:number}){this.orgScope(actor,input.organizationId);return this.mutate(s=>{const o=s.storageObjects.find(x=>x.id===id&&x.organizationId===input.organizationId);if(!o||o.state!=='reserved')throw new Error('UPLOAD_RESERVATION_NOT_FOUND');if(!clean(input.checksum))throw new Error('UPLOAD_CHECKSUM_REQUIRED');
  if(input.actualSizeBytes!==undefined){const actual=positive(input.actualSizeBytes);if(!actual)throw new Error('FILE_SIZE_REQUIRED');
   if(actual!==o.sizeBytes&&o.provider==='mizan'){const license=s.licenses.find(x=>x.organizationId===input.organizationId);if(!license)throw new Error('LICENSE_NOT_FOUND');
    const others=s.storageObjects.filter(x=>x.organizationId===input.organizationId&&x.provider==='mizan'&&x.id!==o.id&&(x.state==='stored'||x.state==='reserved')).reduce((n,x)=>n+x.sizeBytes,0);
    /* الرفض يجب أن يُحرّر الحجز فعلًا: الكتابة الخارجية لا تحدث عند الرمي، فيُحرَّر بكتابة مستقلة قبله. */
    if(others+actual>this.planLimits(s,license).storageBytes){this.releaseReservation(o.id);throw new Error('STORAGE_QUOTA_REACHED')}
    const org=s.organizations.find(x=>x.id===input.organizationId);
    try{this.assertOperatorStorageCap(s,org?.operatorId,actual-o.sizeBytes)}catch(err){this.releaseReservation(o.id);throw err}
   }
   o.sizeBytes=actual;
  }
  o.state='stored';o.checksum=clean(input.checksum,128);return o})}
 configureStorage(actor:CommercialActor,organizationId:string,input:{provider:Exclude<StorageProvider,'mizan'>;container:string;region?:string;endpoint?:string;secret:Record<string,string>}){if(!['super_admin','org_admin','storage_admin'].includes(actor.role))throw new Error('STORAGE_ADMIN_REQUIRED');this.orgScope(actor,organizationId);if(!this.vault)throw new Error('STORAGE_SECRET_VAULT_NOT_CONFIGURED');return this.mutate(s=>{const org=s.organizations.find(x=>x.id===organizationId),license=s.licenses.find(x=>x.organizationId===organizationId),plan=license&&s.plans.find(x=>x.id===license.planId);if(!org||!license||!plan)throw new Error('LICENSE_NOT_FOUND');if(!plan.features.external_storage)throw new Error('EXTERNAL_STORAGE_NOT_INCLUDED');if(!clean(input.container)||!input.secret||!Object.keys(input.secret).length)throw new Error('STORAGE_CONFIGURATION_INCOMPLETE');const ref=this.vault!.put(Object.fromEntries(Object.entries(input.secret).map(([k,v])=>[clean(k,80),clean(v,1000)])));const t=now(),row:StorageAccountRecord={id:this.next(s,'SA'),tenantId:org.tenantId,organizationId:org.id,provider:input.provider,container:clean(input.container,180),region:clean(input.region,80)||undefined,endpoint:clean(input.endpoint,300)||undefined,connectionStatus:'pending_test',secretReference:ref,isPrimary:false,createdAt:t,updatedAt:t};s.storageAccounts.push(row);this.audit(s,actor,{tenantId:org.tenantId,organizationId:org.id,action:'STORAGE_ACCOUNT_CONFIGURED',entityType:'storage_account',entityId:row.id});return {...row,secretReference:'stored_securely'}})}
 async testStorage(actor:CommercialActor,organizationId:string,accountId:string){if(!['super_admin','org_admin','storage_admin'].includes(actor.role))throw new Error('STORAGE_ADMIN_REQUIRED');this.orgScope(actor,organizationId);if(!this.vault||!this.probe)throw new Error('STORAGE_PROBE_NOT_CONFIGURED');const s=this.read(),account=s.storageAccounts.find(x=>x.id===accountId&&x.organizationId===organizationId);if(!account)throw new Error('STORAGE_ACCOUNT_NOT_FOUND');let result;try{result=await this.probe(account,this.vault.get(account.secretReference))}catch{result={upload:false,read:false,remove:false,code:'PROVIDER_UNAVAILABLE'}}return this.mutate(next=>{const row=next.storageAccounts.find(x=>x.id===accountId)!;row.lastTestedAt=now();row.lastTestResult=result.upload&&result.read&&result.remove?'upload_read_delete_verified':result.code||(!result.upload?'upload_permission_missing':!result.read?'read_permission_missing':'delete_permission_missing');row.connectionStatus=result.upload&&result.read&&result.remove?'connected':'degraded';row.isPrimary=row.connectionStatus==='connected';row.updatedAt=now();this.audit(next,actor,{tenantId:row.tenantId,organizationId:row.organizationId,action:'STORAGE_CONNECTION_TESTED',entityType:'storage_account',entityId:row.id,reason:row.lastTestResult});return {...row,secretReference:'stored_securely'}})}
 startMigration(actor:CommercialActor,organizationId:string,destination:StorageProvider,deleteAfterVerification=false){this.orgScope(actor,organizationId);return this.mutate(s=>{const org=s.organizations.find(x=>x.id===organizationId);if(!org)throw new Error('ORGANIZATION_NOT_FOUND');if(destination!=='mizan'&&!s.storageAccounts.some(x=>x.organizationId===organizationId&&x.provider===destination&&x.connectionStatus==='connected'))throw new Error('DESTINATION_STORAGE_NOT_READY');const total=s.storageObjects.filter(x=>x.organizationId===organizationId&&x.provider==='mizan'&&x.state==='stored').length;const t=now(),m:StorageMigrationRecord={id:this.next(s,'MIG'),tenantId:org.tenantId,organizationId,status:'queued',source:'mizan',destination,totalFiles:total,completedFiles:0,failedFiles:0,sourceDeletionPolicy:deleteAfterVerification?'delete_after_verification':'retain',createdAt:t,updatedAt:t};s.storageMigrations.push(m);this.audit(s,actor,{tenantId:org.tenantId,organizationId,action:'STORAGE_MIGRATION_QUEUED',entityType:'storage_migration',entityId:m.id});return m})}
 usage(actor:CommercialActor,organizationId:string){this.orgScope(actor,organizationId);const s=this.read(),org=s.organizations.find(x=>x.id===organizationId),license=s.licenses.find(x=>x.organizationId===organizationId);if(!org||!license)throw new Error('ORGANIZATION_NOT_FOUND');const objects=s.storageObjects.filter(x=>x.organizationId===organizationId&&x.state==='stored'),byCategory=Object.fromEntries(['audio','video','image','document','other'].map(c=>[c,objects.filter(x=>x.category===c).reduce((n,x)=>n+x.sizeBytes,0)]));const mizanUsed=objects.filter(x=>x.provider==='mizan').reduce((n,x)=>n+x.sizeBytes,0),externalUsed=objects.filter(x=>x.provider!=='mizan').reduce((n,x)=>n+x.sizeBytes,0),reserved=s.storageObjects.filter(x=>x.organizationId===organizationId&&x.state==='reserved').reduce((n,x)=>n+x.sizeBytes,0),limits=this.planLimits(s,license),at=this.clock(),term=engine.entitlementTerm(s,organizationId,at);if(term){limits.annualParticipants=term.participantAllowance;limits.activeCompetitions=term.activeCompetitionAllowance}return {organization:org,license:{...license,limits},usage:{activeCompetitions:s.competitions.filter(x=>x.organizationId===organizationId&&activeCompetitionStates.has(x.state)).length,annualParticipants:term?engine.participantsUsedInTerm(s,term):0,termStartsAt:term?.startsAt,termEndsAt:term?.endsAt,accessState:engine.accessState(s,organizationId,at),mizanStorageBytes:mizanUsed,externalStorageBytes:externalUsed,reservedBytes:reserved,byCategory},storageAccounts:s.storageAccounts.filter(x=>x.organizationId===organizationId).map(x=>({...x,secretReference:undefined})),migrations:s.storageMigrations.filter(x=>x.organizationId===organizationId),changeRequests:s.changeRequests.filter(x=>x.organizationId===organizationId)}}
 dashboard(actor:CommercialActor){this.super(actor);const s=this.read(),near=Date.now()+30*86400_000;return {counts:{organizations:s.organizations.length,activeOrganizations:s.organizations.filter(x=>x.status==='active').length,suspendedOrganizations:s.organizations.filter(x=>x.status==='suspended').length,operators:s.operators.length,activeOperators:s.operators.filter(x=>x.status==='active').length,activeCompetitions:s.competitions.filter(x=>activeCompetitionStates.has(x.state)).length,participantsThisYear:s.organizations.reduce((n,o)=>{const t=engine.currentTerm(s,o.id,this.clock());return n+(t?engine.participantsUsedInTerm(s,t):0)},0),licensesExpiringSoon:s.licenses.filter(x=>x.status==='active'&&Date.parse(x.expiresAt)<=near).length,pendingChangeRequests:s.changeRequests.filter(x=>x.status==='pending').length},storage:{mizanBytes:s.storageObjects.filter(x=>x.provider==='mizan'&&x.state==='stored').reduce((n,x)=>n+x.sizeBytes,0),externalBytes:s.storageObjects.filter(x=>x.provider!=='mizan'&&x.state==='stored').reduce((n,x)=>n+x.sizeBytes,0)},organizations:s.organizations.map(o=>{const l=s.licenses.find(x=>x.organizationId===o.id),p=l&&s.plans.find(x=>x.id===l.planId),u=s.storageObjects.filter(x=>x.organizationId===o.id&&x.provider==='mizan'&&x.state==='stored').reduce((n,x)=>n+x.sizeBytes,0);return {...o,license:l&&{...l,planName:p?.name,limits:this.planLimits(s,l)},storageUsedBytes:u,activeCompetitions:s.competitions.filter(x=>x.organizationId===o.id&&activeCompetitionStates.has(x.state)).length,participants:(()=>{const t=engine.currentTerm(s,o.id,this.clock());return t?engine.participantsUsedInTerm(s,t):0})(),accessState:l?engine.accessState(s,o.id,this.clock()):'suspended',operatorName:s.operators.find(x=>x.id===o.operatorId)?.name}}),operators:s.operators.map(o=>{const orgIds=new Set(s.organizations.filter(x=>x.operatorId===o.id).map(x=>x.id));return {...o,creditBalance:this.creditBalance(s,o.id),organizations:orgIds.size,storageUsedBytes:s.storageObjects.filter(x=>orgIds.has(x.organizationId)&&x.provider==='mizan'&&x.state==='stored').reduce((n,x)=>n+x.sizeBytes,0)}}),plans:s.plans.filter(x=>!x.ownerOperatorId),changeRequests:s.changeRequests,creditLedger:s.creditLedger.slice(-200).reverse(),audit:s.audit.slice(-200).reverse(),billing:{subscriptions:s.subscriptions.slice().reverse().map(x=>this.decorateSub(s,x)),invoices:s.invoices.slice(-300).reverse().map(x=>this.decorateInvoice(s,x)),summary:this.billingSummary(s,s.subscriptions,s.invoices)}}}
 /*
  * لوحة المشغّل كانت تعرض الجهات المرتبطة بترخيصه وحدها، فمشغّلٌ يدير جهته هو — وهي جهةٌ
  * مباشرة أنشأها مالك المنصّة بلا رصيدٍ من المشغّل — يرى «٠ جهة» و«لا توجد جهات حتى الآن»
  * وهو يفتح مسابقاتها في التبويب المجاور. العدّاد يكذّب عينه.
  *
  * فتُضاف جهته هو حين لا تكون من جهات ترخيصه، مُعلَّمةً بأنها مباشرة لا محتسبة على رصيده.
  * وهذا لا يوسّع وصولًا: هي الجهة التي يحملها ادّعاؤه أصلًا ويفتحها من كل باب آخر. أمّا
  * الفوترة فتبقى على جهات ترخيصه وحدها — تلك ما يبيعه، وهذه ما يملكه.
  */
 operatorDashboard(actor:CommercialActor){if(!['operator_owner','operator_admin'].includes(actor.role)||!actor.operatorId)throw new Error('OPERATOR_REQUIRED');const s=this.read(),op=s.operators.find(x=>x.id===actor.operatorId);if(!op)throw new Error('OPERATOR_NOT_FOUND');const licensed=s.organizations.filter(x=>x.operatorId===op.id);const ownOrganization=actor.organizationId&&!licensed.some(x=>x.id===actor.organizationId)?s.organizations.filter(x=>x.id===actor.organizationId&&x.status!=='archived'):[];const organizations=[...licensed,...ownOrganization];const orgIds=new Set(licensed.map(o=>o.id));const sellable=s.plans.filter(x=>x.active&&(!x.ownerOperatorId||x.ownerOperatorId===op.id));const ownedPlans=s.plans.filter(x=>x.ownerOperatorId===op.id);const orgSubs=s.subscriptions.filter(x=>x.subjectType==='organization'&&orgIds.has(x.subjectId));const orgInvoices=s.invoices.filter(x=>x.subjectType==='organization'&&orgIds.has(x.subjectId));const mySub=s.subscriptions.filter(x=>x.subjectType==='operator'&&x.subjectId===op.id).map(x=>this.decorateSub(s,x));const myInvoices=s.invoices.filter(x=>x.subjectType==='operator'&&x.subjectId===op.id).map(x=>this.decorateInvoice(s,x));return {operator:op,creditBalance:this.creditBalance(s,op.id),plans:sellable.map(x=>({id:x.id,name:x.name,active:x.active,ownerOperatorId:x.ownerOperatorId})),ownedPlans,organizations:organizations.map(o=>({organization:o,license:s.licenses.find(x=>x.organizationId===o.id),linkedToOperator:o.operatorId===op.id,usage:this.usage({...actor,operatorId:op.id},o.id).usage})),creditLedger:s.creditLedger.filter(x=>x.operatorId===op.id).slice(-100).reverse(),billing:{subscriptions:orgSubs.slice().reverse().map(x=>this.decorateSub(s,x)),invoices:orgInvoices.slice(-200).reverse().map(x=>this.decorateInvoice(s,x)),summary:this.billingSummary(s,orgSubs,orgInvoices),mySubscription:mySub,myInvoices}}}
 /* ═════════════════════ الطبقة التجارية (MIZAN_COMMERCIAL_MODEL.md) ═════════════════════ */

 /** Public list-price catalog: one source for the pricing page, upgrade page, admin and operator calculator. */
 publicCatalog(){return this.view((s,at)=>engine.catalogView(s,at).filter(p=>p.active))}
 adminCatalog(actor:CommercialActor){this.super(actor);return this.view((s,at)=>({plans:engine.catalogView(s,at),versions:s.planVersions.slice().reverse(),tiers:s.operatorTiers,policy:engine.policyOf(s)}))}
 schedulePlanPrice(actor:CommercialActor,planId:string,input:engine.PlanVersionInput){return this.tx(actor,ctx=>engine.schedulePlanVersion(ctx,planId,input))}
 updateCommercialPolicy(actor:CommercialActor,patch:Partial<CommercialPolicy>){return this.tx(actor,ctx=>engine.updatePolicy(ctx,patch))}

 /** Channel-private detail (discount, wholesale, wallet) only for the platform and the owning operator. */
 private seesChannelPrivate(s:State,actor:CommercialActor,organizationId:string){if(actor.role==='super_admin')return true;const org=s.organizations.find(x=>x.id===organizationId);return ['operator_owner','operator_admin'].includes(actor.role)&&!!actor.operatorId&&org?.operatorId===actor.operatorId}
 organizationBilling(actor:CommercialActor,organizationId:string){this.orgScope(actor,organizationId);return this.view((s,at)=>({...engine.organizationBillingView(s,organizationId,at,{channelPrivate:this.seesChannelPrivate(s,actor,organizationId)}),catalog:engine.commercialOwnerOf(engine.organizationOf(s,organizationId))==='direct'||this.seesChannelPrivate(s,actor,organizationId)?engine.catalogView(s,at).filter(p=>p.active&&!p.custom):[]}))}
 private billingRole(actor:CommercialActor){if(!['super_admin','org_admin','billing_admin','operator_owner','operator_admin'].includes(actor.role))throw new Error('BILLING_ROLE_REQUIRED')}
 /** Direct customer upgrade: an invoice for the public-price difference; the plan changes when it is paid. */
 requestDirectUpgrade(actor:CommercialActor,organizationId:string,planId:string){this.orgScope(actor,organizationId);this.billingRole(actor);return this.mutate(s=>{const ctx=this.ctx(s,actor);const org=engine.organizationOf(s,organizationId);if(engine.commercialOwnerOf(org)!=='direct')throw new engine.CommercialError('ORGANIZATION_MANAGED_BY_OPERATOR');const q=engine.directUpgradeQuote(s,organizationId,planId,ctx.at);if(q.amountMinor===0)return {applied:true,term:engine.applyDirectUpgrade(ctx,organizationId,planId)};const open=s.invoices.find(x=>x.subjectType==='organization'&&x.subjectId===organizationId&&x.kind==='plan_upgrade'&&x.status==='open'&&x.metadata?.planId===planId);if(open)return {applied:false,invoice:this.decorateInvoice(s,open)};const sub=s.subscriptions.find(x=>x.subjectType==='organization'&&x.subjectId===organizationId&&x.status!=='canceled');const t=now(),due=new Date(ctx.at+14*86400_000).toISOString();const plan=s.plans.find(x=>x.id===planId);const inv:InvoiceRecord={id:this.next(s,'INV'),number:`INV-${String(s.invoices.length+1).padStart(6,'0')}`,subscriptionId:sub?.id,lines:[{description:`ترقية إلى ${plan?.name||planId} للدورة الحالية`,amountMinor:q.amountMinor}],subjectType:'organization',subjectId:organizationId,currency:q.currency,amountMinor:q.amountMinor,status:'open',periodStart:q.term.startsAt,periodEnd:q.term.endsAt,issuedAt:t,dueAt:due,provider:'manual',kind:'plan_upgrade',metadata:{planId,termId:q.term.id},createdAt:t,updatedAt:t};s.invoices.push(inv);this.audit(s,actor,{tenantId:org.tenantId,organizationId,action:'PLAN_UPGRADE_INVOICED',entityType:'invoice',entityId:inv.id,reason:`${q.term.planId}→${planId} ${q.amountMinor} ${q.currency}`});return {applied:false,invoice:this.decorateInvoice(s,inv)}})}
 scheduleDowngrade(actor:CommercialActor,organizationId:string,planId:string|null){this.orgScope(actor,organizationId);this.billingRole(actor);return this.tx(actor,ctx=>engine.scheduleDowngrade(ctx,organizationId,planId))}
 setContractOverride(actor:CommercialActor,organizationId:string,input:{participantAllowance?:number|null;activeCompetitionAllowance?:number|null;storageBytes?:number|null;reason:string}){return this.tx(actor,ctx=>engine.setContractOverride(ctx,organizationId,input))}
 transferCommercialOwner(actor:CommercialActor,organizationId:string,input:{toOperatorId?:string|null;effectiveAt?:string;reason:string;subscriptionTreatment?:'keep_current_term'|'close_current_term'}){return this.tx(actor,ctx=>engine.transferCommercialOwner(ctx,organizationId,input))}
 /** Platform-recorded renewal for a contract paid outside the invoice flow (e.g. national contract). */
 adminRenewTerm(actor:CommercialActor,organizationId:string,input:{reason:string;contractPriceMinor?:number}){this.super(actor);if(clean(input.reason).length<5)throw new Error('REASON_REQUIRED');return this.tx(actor,ctx=>{const r=engine.renewTerm(ctx,organizationId,{contractPriceMinor:input.contractPriceMinor});hooks.enqueueWebhookEvent(ctx,organizationId,'subscription.renewed',{termId:r.term.id,planId:r.term.planId,startsAt:r.term.startsAt,endsAt:r.term.endsAt});return r})}

 /* ——— operator commercial engine ——— */
 upsertOperatorTier(actor:CommercialActor,input:any){return this.tx(actor,ctx=>engine.upsertOperatorTier(ctx,input))}
 createAgreement(actor:CommercialActor,input:engine.AgreementInput){return this.tx(actor,ctx=>engine.createAgreement(ctx,input))}
 approveAgreement(actor:CommercialActor,id:string){return this.tx(actor,ctx=>engine.approveAgreement(ctx,id))}
 updateAgreement(actor:CommercialActor,id:string,patch:Partial<engine.AgreementInput>,reason:string){return this.tx(actor,ctx=>engine.updateAgreementTerms(ctx,id,patch,reason))}
 terminateAgreement(actor:CommercialActor,id:string,reason:string){return this.tx(actor,ctx=>engine.terminateAgreement(ctx,id,reason))}
 renewAgreement(actor:CommercialActor,id:string,patch:Partial<engine.AgreementInput>={}){return this.tx(actor,ctx=>engine.renewAgreement(ctx,id,patch))}
 fundCommitment(actor:CommercialActor,agreementId:string,input:{amountMinor?:number;reference:string}){return this.tx(actor,ctx=>engine.fundCommitment(ctx,agreementId,input))}
 adminTopUp(actor:CommercialActor,operatorId:string,input:{amountMinor:number;currency?:string;reference:string;reason?:string}){this.super(actor);return this.tx(actor,ctx=>engine.topUpWallet(ctx,operatorId,input))}
 adminAdjustWallet(actor:CommercialActor,operatorId:string,input:{amountMinor:number;currency:string;reason:string}){return this.tx(actor,ctx=>engine.adminAdjustWallet(ctx,operatorId,input))}
 refundWalletEntry(actor:CommercialActor,entryId:string,input:{amountMinor?:number;reason:string}){return this.tx(actor,ctx=>engine.refundWalletEntry(ctx,entryId,input))}
 /** Operator asks to top up: an invoice to the operator; the wallet is credited when it is paid. */
 requestTopUpInvoice(actor:CommercialActor,amountMinor:number){const operatorId=engine.requireOperator(actor);return this.mutate(s=>{const ctx=this.ctx(s,actor);const a=engine.activeAgreement(s,operatorId,ctx.at);if(!a)throw new engine.CommercialError('AGREEMENT_NOT_ACTIVE');if(!Number.isSafeInteger(amountMinor)||amountMinor<=0)throw new engine.CommercialError('AMOUNTMINOR_MUST_BE_INTEGER_MINOR_UNITS');const t=now();const inv:InvoiceRecord={id:this.next(s,'INV'),number:`INV-${String(s.invoices.length+1).padStart(6,'0')}`,lines:[{description:'شحن رصيد المشغّل',amountMinor}],subjectType:'operator',subjectId:operatorId,currency:a.currency,amountMinor,status:'open',issuedAt:t,dueAt:new Date(ctx.at+14*86400_000).toISOString(),provider:'manual',kind:'wallet_top_up',metadata:{operatorId},createdAt:t,updatedAt:t};s.invoices.push(inv);this.audit(s,actor,{action:'WALLET_TOP_UP_REQUESTED',entityType:'invoice',entityId:inv.id,reason:`${operatorId} ${amountMinor} ${a.currency}`});return this.decorateInvoice(s,inv)})}
 operatorActivateOrganization(actor:CommercialActor,input:engine.OrganizationIdentityInput&{planId:string;startsAt?:string},idempotencyKey:string){const operatorId=engine.requireOperator(actor);return this.tx(actor,ctx=>engine.idempotent(ctx,`operator-activation:${operatorId}`,idempotencyKey,input,()=>engine.operatorActivateOrganization(ctx,input)))}
 operatorRenewOrganization(actor:CommercialActor,organizationId:string,idempotencyKey:string){const operatorId=engine.requireOperator(actor);return this.tx(actor,ctx=>engine.idempotent(ctx,`operator-renewal:${operatorId}`,idempotencyKey,{organizationId},()=>{const r=engine.operatorRenewOrganization(ctx,organizationId);if(!('pending' in r)&&!r.alreadyRenewed)hooks.enqueueWebhookEvent(ctx,organizationId,'subscription.renewed',{termId:r.term.id,planId:r.term.planId,startsAt:r.term.startsAt,endsAt:r.term.endsAt});return r}))}
 operatorUpgradeOrganization(actor:CommercialActor,organizationId:string,planId:string,idempotencyKey:string){const operatorId=engine.requireOperator(actor);return this.tx(actor,ctx=>engine.idempotent(ctx,`operator-upgrade:${operatorId}`,idempotencyKey,{organizationId,planId},()=>engine.operatorUpgradePlan(ctx,organizationId,planId)))}
 operatorScheduleDowngrade(actor:CommercialActor,organizationId:string,planId:string|null){const operatorId=engine.requireOperator(actor);return this.tx(actor,ctx=>{if(engine.organizationOf(ctx.s,organizationId).operatorId!==operatorId)throw new engine.CommercialError('CROSS_OPERATOR_ACCESS_BLOCKED');return engine.scheduleDowngrade(ctx,organizationId,planId)})}
 operatorCommercial(actor:CommercialActor){const operatorId=engine.requireOperator(actor);return this.view((s,at)=>({...engine.operatorCommercialView(s,operatorId,at),brand:s.brandProfiles.find(b=>b.ownerType==='operator'&&b.ownerId===operatorId),brandRights:brand.operatorBrandRights(s,operatorId,at),domains:s.customDomains.filter(d=>d.ownerType==='operator'&&d.ownerId===operatorId),listings:s.discoverListings.filter(l=>l.operatorId===operatorId)}))}
 adminOperatorCommercial(actor:CommercialActor,operatorId:string){this.super(actor);return this.view((s,at)=>({...engine.operatorCommercialView(s,operatorId,at),operator:s.operators.find(x=>x.id===operatorId)}))}
 setResalePrice(actor:CommercialActor,input:{planId:string;market?:string;currency:string;resalePriceMinor:number|null}){return this.tx(actor,ctx=>engine.setResalePrice(ctx,input))}
 platformCommercialReport(actor:CommercialActor){this.super(actor);return this.view((s,at)=>({...engine.platformCommercialReport(s,at),agreements:s.operatorAgreements.slice().reverse(),wallets:s.operatorWallets,walletChecks:s.operatorWallets.map(w=>engine.verifyWallet(s,w.id)),migrationReports:s.migrationReports,operators:s.operators.map(o=>({id:o.id,name:o.name,status:o.status,legacyCreditBalance:this.creditBalance(s,o.id)}))}))}
 walletLedger(actor:CommercialActor,filter:{operatorId?:string;type?:string}={}){this.super(actor);return this.view(s=>s.walletLedger.filter(e=>(!filter.operatorId||e.operatorId===filter.operatorId)&&(!filter.type||e.type===filter.type)).slice().reverse())}
 /** Financial ledger export (CSV). Amounts stay integers in minor units — no float formatting. */
 exportWalletLedgerCsv(actor:CommercialActor,operatorId?:string){const rows=this.walletLedger(actor,{operatorId}).slice().reverse();const cols=['id','createdAt','operatorId','agreementId','type','amountMinor','balanceAfterMinor','currency','organizationId','subscriptionTermId','planId','publicPriceMinor','discountBps','invoiceId','reference','reason','createdBy'] as const;const esc=(v:unknown)=>{const t=v===undefined||v===null?'':String(v);return /[",\n]/.test(t)||/^[=+\-@]/.test(t)?`"${t.replace(/"/g,'""').replace(/^([=+\-@])/,"'$1")}"`:t};return [cols.join(','),...rows.map(r=>cols.map(c=>esc((r as any)[c])).join(','))].join('\n')}
 organizationOperatorId(organizationId:string){return this.read().organizations.find(x=>x.id===organizationId)?.operatorId}

 /* ——— white label & Discover ——— */
 brandFor(actor:CommercialActor,ownerType:'operator'|'organization',ownerId:string){if(ownerType==='organization')this.orgScope(actor,ownerId);else if(actor.role!=='super_admin'&&actor.operatorId!==ownerId)throw new Error('CROSS_OPERATOR_ACCESS_BLOCKED');return this.view((s,at)=>({profile:s.brandProfiles.find(b=>b.ownerType===ownerType&&b.ownerId===ownerId),rights:brand.rightsFor(s,ownerType,ownerId,at),domains:s.customDomains.filter(d=>d.ownerType===ownerType&&d.ownerId===ownerId).map(d=>({...d,verificationRecord:brand.verificationRecordName(d.hostname)}))}))}
 setBrandProfile(actor:CommercialActor,ownerType:'operator'|'organization',ownerId:string,input:Partial<BrandProfileRecord>){return this.tx(actor,ctx=>brand.setBrandProfile(ctx,ownerType,ownerId,input))}
 requestCustomDomain(actor:CommercialActor,ownerType:'operator'|'organization',ownerId:string,input:{hostname:string;purpose?:'platform'|'discover'}){return this.tx(actor,ctx=>brand.requestCustomDomain(ctx,ownerType,ownerId,input))}
 /** DNS lookup happens outside the state write; only its result is recorded. */
 async verifyCustomDomain(actor:CommercialActor,domainId:string,resolveTxt:(name:string)=>Promise<string[][]>){const d=this.read().customDomains.find(x=>x.id===domainId);if(!d)throw new Error('DOMAIN_NOT_FOUND');let result:{txtRecords:string[]|null;error?:string};try{result={txtRecords:(await resolveTxt(brand.verificationRecordName(d.hostname))).map(chunks=>chunks.join(''))}}catch(err){result={txtRecords:null,error:(err as any)?.code||'DNS_LOOKUP_FAILED'}}return this.tx(actor,ctx=>brand.recordDomainVerification(ctx,domainId,result))}
 disableCustomDomain(actor:CommercialActor,domainId:string,reason:string){return this.tx(actor,ctx=>brand.disableCustomDomain(ctx,domainId,reason))}
 resolveBrand(host:string|undefined){return this.view((s,at)=>brand.resolveBrandForHost(s,host,at))}
 publishDiscoverListing(actor:CommercialActor,organizationId:string,input:brand.ListingInput){return this.tx(actor,ctx=>brand.publishListing(ctx,organizationId,input))}
 unpublishDiscoverListing(actor:CommercialActor,listingId:string){return this.tx(actor,ctx=>brand.unpublishListing(ctx,listingId))}
 organizationListings(actor:CommercialActor,organizationId:string){return this.mutate(s=>brand.listingsForOrganization(this.ctx(s,actor),organizationId))}
 discover(host:string|undefined,query:brand.DiscoverQuery){return this.view((s,at)=>{const resolved=brand.resolveBrandForHost(s,host,at);return {brand:resolved,listings:brand.discoverListings(s,resolved,query,at)}})}

 /* ——— partner webhooks ——— */
 createWebhookEndpoint(actor:CommercialActor,organizationId:string,input:{url:string;events:string[]}){this.orgScope(actor,organizationId);if(!['super_admin','org_admin'].includes(actor.role))throw new Error('ORG_ADMIN_REQUIRED');if(!this.vault)throw new Error('WEBHOOK_SECRET_VAULT_NOT_CONFIGURED');const secret=`whsec_${crypto.randomBytes(24).toString('base64url')}`;return this.tx(actor,ctx=>{hooks.assertWebhookUrl(String(input.url||''));const ref=this.vault!.put({secret});const endpoint=hooks.createWebhookEndpoint(ctx,organizationId,input,ref);return {endpoint:{...endpoint,secretRef:undefined},signingSecret:secret}})}
 listWebhooks(actor:CommercialActor,organizationId:string){this.orgScope(actor,organizationId);return this.view(s=>({endpoints:s.webhookEndpoints.filter(e=>e.organizationId===organizationId).map(e=>({...e,secretRef:undefined})),deliveries:s.webhookDeliveries.filter(d=>d.organizationId===organizationId).slice(-100).reverse().map(d=>({...d,payload:undefined}))}))}
 disableWebhookEndpoint(actor:CommercialActor,organizationId:string,endpointId:string){this.orgScope(actor,organizationId);return this.mutate(s=>{const e=s.webhookEndpoints.find(x=>x.id===endpointId&&x.organizationId===organizationId);if(!e)throw new Error('WEBHOOK_NOT_FOUND');e.status='disabled';e.disabledReason='BY_USER';e.updatedAt=now();this.audit(s,actor,{organizationId,action:'WEBHOOK_ENDPOINT_DISABLED',entityType:'webhook_endpoint',entityId:e.id});return {...e,secretRef:undefined}})}
 /* ── بوابات الدفع الخاصة بالجهات والمشغّلين (رسوم التسجيل) ── */
 savePaymentGateway(actor:CommercialActor,ownerType:pay.GatewayOwnerType,ownerId:string,input:{provider?:string;presetId?:string;displayName?:string;profile:unknown;apiKey:string;webhookSecret?:string}){
  if(!this.vault)throw new Error('PAYMENT_SECRET_VAULT_NOT_CONFIGURED');
  if(!['operator','organization'].includes(ownerType))throw new Error('PAYMENT_GATEWAY_OWNER_INVALID');
  pay.assertOwnerExists(this.read() as any,ownerType,ownerId);pay.assertGatewayManager(this.read() as any,actor,ownerType,ownerId);
  const profile=input.profile as PaymentProviderProfile;const errors=validatePaymentProfile(profile);if(errors.length)throw new Error(`PAYMENT_PROFILE_INVALID:${errors[0]}`);
  const apiKey=clean(input.apiKey,4000),webhookSecret=clean(input.webhookSecret,4000);if(!apiKey)throw new Error('PAYMENT_API_KEY_REQUIRED');
  if(profile.webhook&&!profile.statusQuery&&!webhookSecret)throw new Error('PAYMENT_WEBHOOK_SECRET_REQUIRED');
  const ref=this.vault.put({apiKey,webhookSecret});
  try{return pay.redactGateway(this.tx(actor,ctx=>pay.saveGatewayConfig(ctx,{ownerType,ownerId,provider:clean(input.provider||profile.name||'gateway',40),presetId:input.presetId,displayName:input.displayName,profile:JSON.parse(JSON.stringify(profile)),secretRef:ref})))}
  catch(err){this.vault.remove(ref);throw err}
 }
 listPaymentGateways(actor:CommercialActor,ownerType:pay.GatewayOwnerType,ownerId:string){const s=this.read() as any;pay.assertGatewayManager(s,actor,ownerType,ownerId);const effective=ownerType==='organization'?pay.effectiveGateway(s,ownerId):null;return {gateways:pay.listGateways(s,ownerType,ownerId),effective:effective?{id:effective.id,ownerType:effective.ownerType,provider:effective.provider,displayName:effective.displayName}:null}}
 disablePaymentGateway(actor:CommercialActor,gatewayId:string){return pay.redactGateway(this.tx(actor,ctx=>pay.disableGateway(ctx,gatewayId)))}
 private gatewayRuntime(config:pay.PaymentGatewayConfigRecord,transport:GatewayTransport){if(!this.vault)throw new Error('PAYMENT_SECRET_VAULT_NOT_CONFIGURED');const secret=this.vault.get(config.secretRef);return buildPaymentGateway(config.profile as unknown as PaymentProviderProfile,{apiKey:secret.apiKey,webhookSecret:secret.webhookSecret},config.provider,transport)}
 /**
  * اختبار البوابة بمفاتيح الجهة: إنشاء صفحة دفع حقيقية (بلا سداد) ثم الاستعلام عنها. نجاحهما
  * يثبت العنوان والمفتاح وشكل الرد معًا، فتُفعَّل. بوابةٌ بلا استعلام تُفعَّل بإشعار سدادٍ موقَّع
  * لعملية الاختبار نفسها.
  */
 async testPaymentGateway(actor:CommercialActor,gatewayId:string,input:{amountMinor?:number;currency:string;callbackUrl:string;webhookUrl?:string},transport:GatewayTransport){
  const s=this.read() as any,config=(s.paymentGateways||[]).find((g:pay.PaymentGatewayConfigRecord)=>g.id===gatewayId) as pay.PaymentGatewayConfigRecord|undefined;
  if(!config)throw new Error('PAYMENT_GATEWAY_NOT_FOUND');pay.assertGatewayManager(s,actor,config.ownerType,config.ownerId);if(config.status==='disabled')throw new Error('PAYMENT_GATEWAY_DISABLED');
  const amountMinor=Number.isSafeInteger(input.amountMinor)&&Number(input.amountMinor)>0?Number(input.amountMinor):100,currency=clean(input.currency,3).toUpperCase();if(!/^[A-Z]{3}$/.test(currency))throw new Error('CURRENCY_INVALID');
  let code='OK',ok=false,paymentUrl:string|undefined,externalRef:string|undefined;
  try{
   const gw=this.gatewayRuntime(config,transport);
   const out=await gw.createCheckout({invoiceId:`TEST-${config.id}-${Date.now()}`,invoiceNumber:'TEST',amountMinor,currency,description:'MIZAN gateway test',customer:{name:'MIZAN Test'},callbackUrl:input.callbackUrl,errorUrl:input.callbackUrl,webhookUrl:input.webhookUrl});
   paymentUrl=out.paymentUrl;externalRef=out.externalRef;
   if(gw.canQueryStatus){const q=await gw.queryStatus(out.externalRef,currency);
    /* لا تُفعَّل بوابة لا يقرأ ملفها المبلغ والعملة من ردّ الاستعلام: لن تستطيع إثبات أي سداد. */
    ok=!!q&&q.amountMinor!==undefined&&!!q.currency;code=!q?'STATUS_QUERY_UNREADABLE':!ok?'STATUS_QUERY_MISSING_AMOUNT_OR_CURRENCY':`STATUS_${q.status.toUpperCase()}`}
   else code='AWAITING_SIGNED_NOTIFICATION';
  }catch(err){code=err instanceof Error?err.message.slice(0,80):'GATEWAY_TEST_FAILED'}
  const organizationId=config.ownerType==='organization'?config.ownerId:'';
  return this.tx(actor,ctx=>{
   if(externalRef)pay.recordIntent(ctx,{gatewayConfigId:config.id,provider:config.provider,organizationId,competitionId:'',participantId:'',participantPath:'',amountMinor,currency,externalRef,purpose:'gateway_test'});
   const g=pay.recordGatewayTest(ctx,config.id,{ok,code});
   return {gateway:pay.redactGateway(g),ok,code,paymentUrl};
  });
 }
 /** بوابة الجهة الفعّالة الآن للعرض العام: هل يمكن الدفع الإلكتروني؟ بلا أي تفاصيل حساسة. */
 publicPaymentAvailability(organizationId:string){const g=pay.effectiveGateway(this.read() as any,organizationId);return g?{available:true,provider:g.provider,displayName:g.displayName}:{available:false}}
 async startRegistrationCheckout(input:{organizationId:string;competitionId:string;participantId:string;participantPath:string;amountMinor:number;currency:string;description:string;customer:{name?:string;email?:string;phone?:string};callbackUrl:string;errorUrl:string;webhookUrlFor:(gatewayId:string)=>string},transport:GatewayTransport){
  const s=this.read() as any,config=pay.effectiveGateway(s,input.organizationId);if(!config)throw new Error('PAYMENT_GATEWAY_NOT_CONFIGURED');
  const previous=pay.latestIntentFor(s,input.participantPath);
  if(previous?.status==='paid')return {intent:previous,alreadyPaid:true as const};
  /* صفحة دفع لم تكتمل خلال نصف ساعة، بالمبلغ والبوابة نفسيهما، تُعاد بدل فتح عملية ثانية. */
  if(previous&&previous.status==='created'&&previous.gatewayConfigId===config.id&&previous.amountMinor===input.amountMinor&&previous.currency===input.currency&&(previous as any).paymentUrl&&this.clock()-Date.parse(previous.createdAt)<30*60_000)return {intent:previous,paymentUrl:String((previous as any).paymentUrl),reused:true as const};
  const gw=this.gatewayRuntime(config,transport);
  const out=await gw.createCheckout({invoiceId:`${input.competitionId}-${input.participantId}`.slice(0,120),invoiceNumber:input.participantId,amountMinor:input.amountMinor,currency:input.currency,description:input.description,customer:input.customer,callbackUrl:input.callbackUrl,errorUrl:input.errorUrl,webhookUrl:input.webhookUrlFor(config.id)});
  const intent=this.tx(SaaSPlatformRepository.SYSTEM,ctx=>{const row=pay.recordIntent(ctx,{gatewayConfigId:config.id,provider:config.provider,organizationId:input.organizationId,competitionId:input.competitionId,participantId:input.participantId,participantPath:input.participantPath,amountMinor:input.amountMinor,currency:input.currency,externalRef:out.externalRef,purpose:'registration_fee'});(row as any).paymentUrl=out.paymentUrl;return row});
  return {intent,paymentUrl:out.paymentUrl};
 }
 latestRegistrationIntent(participantPath:string){return pay.latestIntentFor(this.read() as any,participantPath)}
 /** يسأل البوابة عن نيّةٍ ويطبّق النتيجة. الخطأ الشبكي لا يغيّر شيئًا. */
 async verifyRegistrationIntent(intentId:string,transport:GatewayTransport){
  const s=this.read() as any,intent=(s.registrationPaymentIntents||[]).find((i:pay.RegistrationPaymentIntentRecord)=>i.id===intentId) as pay.RegistrationPaymentIntentRecord|undefined;if(!intent)throw new Error('PAYMENT_INTENT_NOT_FOUND');
  if(intent.status==='paid')return {intent,changed:false};
  const config=(s.paymentGateways||[]).find((g:pay.PaymentGatewayConfigRecord)=>g.id===intent.gatewayConfigId) as pay.PaymentGatewayConfigRecord|undefined;if(!config)throw new Error('PAYMENT_GATEWAY_NOT_FOUND');
  const gw=this.gatewayRuntime(config,transport);if(!gw.canQueryStatus)return {intent,changed:false};
  const q=await gw.queryStatus(intent.externalRef,intent.currency);if(!q)return {intent,changed:false};
  return this.settle(intent.id,q);
 }
 private settle(intentId:string,q:Pick<WebhookSettlement,'status'|'amountMinor'|'currency'>){return this.tx(SaaSPlatformRepository.SYSTEM,ctx=>{const out=pay.applySettlement(ctx,intentId,q);
  /* عملية اختبارٍ مدفوعة بإشعار موقّع تفعّل البوابة التي لا استعلام لها. */
  if(out.changed&&out.intent.status==='paid'&&out.intent.purpose==='gateway_test'){const g=(ctx.s as any).paymentGateways?.find((x:pay.PaymentGatewayConfigRecord)=>x.id===out.intent.gatewayConfigId);if(g&&g.status==='pending_test')pay.recordGatewayTest({...ctx,actor:{...SaaSPlatformRepository.SYSTEM,role:'super_admin'}},g.id,{ok:true,code:'SIGNED_NOTIFICATION_PAID'})}
  return out})}
 /**
  * إشعار وارد من بوابة جهةٍ ما. إن كان للملف توقيع يُتحقق منه ثم يُستعلم إن أمكن؛ وإلا يُستخرج
  * المرجع ويُسأل عنه بالمفتاح السرّي. الإشعار وحده لا يُثبت سدادًا بلا توقيع صحيح.
  */
 async handleGatewayNotification(gatewayId:string,headers:Record<string,unknown>,raw:Buffer,transport:GatewayTransport){
  const s=this.read() as any,config=(s.paymentGateways||[]).find((g:pay.PaymentGatewayConfigRecord)=>g.id===gatewayId) as pay.PaymentGatewayConfigRecord|undefined;/* بوابة عُطّلت أو استُبدلت لا تفتح عمليات جديدة، لكن إشعارات عملياتها القائمة تُقبل وتُسوّى. */
  if(!config)throw new Error('PAYMENT_GATEWAY_NOT_FOUND');
  const gw=this.gatewayRuntime(config,transport);
  const signed=(config.profile as any).webhook?gw.verifyWebhook(headers,raw):null;
  const ref=signed?.externalRef||gw.referenceFromNotification(raw);if(!ref)throw new Error('PAYMENT_NOTIFICATION_UNREADABLE');
  const intent=pay.intentByReference(s,config.id,ref);if(!intent)throw new Error('PAYMENT_INTENT_NOT_FOUND');
  if(gw.canQueryStatus){const q=await gw.queryStatus(intent.externalRef,intent.currency);return q?this.settle(intent.id,q):{intent,changed:false}}
  if(!signed)throw new Error('PAYMENT_SIGNATURE_INVALID');
  return this.settle(intent.id,signed);
 }
 registrationIntentsToReconcile(limit=50){return pay.intentsToReconcile(this.read() as any,this.clock(),limit)}
 markRegistrationIntentRecorded(intentId:string){return this.tx(SaaSPlatformRepository.SYSTEM,ctx=>pay.markIntentRecorded(ctx,intentId))}
 registrationPaymentIntents(actor:CommercialActor,organizationId:string,competitionId?:string){this.orgScope(actor,organizationId);return pay.intentsForOrganization(this.read() as any,organizationId,competitionId).map(i=>({...i,paymentUrl:undefined}))}
 /** Who should hear about renewals and overdue invoices now (communications triggers). Read-only. */
 communicationTargets(windowsDays:number[]=[30,7]){return this.view((s,at)=>{const renewals:{organizationId:string;name:string;email?:string;termId:string;endsAt:string;daysLeft:number;window:number}[]=[];for(const o of s.organizations){if(o.status!=='active')continue;const t=engine.currentTerm(s,o.id,at);if(!t)continue;if(s.subscriptionTerms.some(x=>x.renewedFromTermId===t.id))continue;const daysLeft=Math.ceil((Date.parse(t.endsAt)-at)/86400_000);const window=[...windowsDays].sort((a,b)=>a-b).find(w=>daysLeft<=w);if(window===undefined)continue;renewals.push({organizationId:o.id,name:o.officialName,email:o.legalEmail||o.operational.notificationEmail,termId:t.id,endsAt:t.endsAt,daysLeft,window})}const overdue=s.invoices.filter(i=>i.status==='open'&&i.subjectType==='organization'&&i.dueAt&&Date.parse(i.dueAt)<at).map(i=>{const o=s.organizations.find(x=>x.id===i.subjectId);return {organizationId:i.subjectId,name:o?.officialName||i.subjectId,email:o?.legalEmail||o?.operational.notificationEmail,invoiceId:i.id,invoiceNumber:i.number}});return {renewals,overdue}})}
 /** A domain event reported by an authenticated client: role-checked, org from identity, PII-free, deduplicated. */
 reportDomainEvent(actor:CommercialActor,organizationId:string,input:{type:string;competitionId?:string;subjectId?:string;participantCode?:string}){this.orgScope(actor,organizationId);const allowed=hooks.DOMAIN_EVENT_REPORTERS[input.type];if(!allowed)throw new Error('DOMAIN_EVENT_TYPE_NOT_ALLOWED');if(!allowed.includes(actor.role))throw new Error('DOMAIN_EVENT_ROLE_NOT_ALLOWED');const data=hooks.domainEventPayload(input);return this.tx(SaaSPlatformRepository.SYSTEM,ctx=>hooks.enqueueWebhookEvent(ctx,organizationId,input.type as WebhookEventType,data,`${data.competitionId}:${data.subjectId}`).length)}
 /** Server-side emission for domain events (registration, results…). */
 emitWebhookEvent(organizationId:string,type:WebhookEventType,data:Record<string,unknown>){return this.tx(SaaSPlatformRepository.SYSTEM,ctx=>hooks.enqueueWebhookEvent(ctx,organizationId,type,data).length)}
 /** Deliver due webhooks. Network I/O is outside the state write; each outcome is recorded idempotently. */
 async dispatchWebhooks(send:(url:string,init:{method:'POST';headers:Record<string,string>;body:string},pinnedAddress:string)=>Promise<{status:number}>=(url,init,address)=>hooks.pinnedHttpsPost(url,init,address),lookup:hooks.AddressLookup=async host=>(await dnsLookup(host,{all:true})).map(x=>x.address)){const s=this.read();const due=hooks.dueDeliveries(s,this.clock());let delivered=0;for(const d of due){const endpoint=s.webhookEndpoints.find(e=>e.id===d.endpointId);if(!endpoint||endpoint.status!=='active'||!this.vault)continue;const attempt=d.attempts+1;let outcome:{ok:boolean;statusCode?:number;error?:string};try{const [pinnedAddress]=await hooks.assertPublicDestination(endpoint.url,lookup);const secret=this.vault.get(endpoint.secretRef).secret;const ts=Math.floor(this.clock()/1000);const r=await send(endpoint.url,{method:'POST',headers:{'content-type':'application/json','x-mizan-event':d.eventType,'x-mizan-delivery':d.id,'x-mizan-signature':hooks.signWebhook(secret,ts,d.payload)},body:d.payload},pinnedAddress);outcome={ok:r.status>=200&&r.status<300,statusCode:r.status}}catch(err){outcome={ok:false,error:err instanceof Error?(err.message==='WEBHOOK_URL_PRIVATE_NETWORK'?err.message:err.name):'DELIVERY_FAILED'}}this.tx(SaaSPlatformRepository.SYSTEM,ctx=>hooks.recordDeliveryAttempt(ctx,d.id,attempt,outcome));if(outcome.ok)delivered++}return {attempted:due.length,delivered}}
 /*
  * يُفحص أمران: سلامةُ السلسلة، ثم مطابقتُها مرساةً من خارجها.
  *
  * و`expected` مرساةٌ يحملها المشغّل خارج المضيف، وهي الأقوى: مَن يملك الكتابةَ على
  * القرص يملك الملفَّ ومرساتَه السيّارة معه، فلا تُعصمه المرساةُ المجاورة. فتُقدَّم
  * المرساةُ الممرَّرة على المجاورة إن وُجدت.
  *
  * ويُعلَن `anchored` صراحةً: سجلٌّ بلا مرساةٍ تُفحَص سلسلتُه ولا يُدَّعى كشفُ القطع فيه.
  */
 verifyAudit(expected?:AuditAnchor){const s=this.read();let previous='GENESIS';
  for(const row of s.audit){const {hash:rowHash,...base}=row;if(row.previousHash!==previous||hash(base)!==rowHash)return {valid:false,sequence:row.sequence,anchored:false as const};previous=row.hash}
  const anchor=expected||this.readAnchor();
  if(!anchor)return {valid:true,rows:s.audit.length,anchored:false as const};
  if(s.audit.length<anchor.rows)return {valid:false,code:'AUDIT_LEDGER_TRUNCATED',expectedRows:anchor.rows,rows:s.audit.length,anchored:true as const};
  if(s.audit.length===anchor.rows&&previous!==anchor.lastHash)return {valid:false,code:'AUDIT_LEDGER_ANCHOR_MISMATCH',rows:s.audit.length,anchored:true as const};
  return {valid:true,rows:s.audit.length,anchored:true as const}}
}
