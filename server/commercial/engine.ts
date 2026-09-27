/*
 * محرّك ميزان التجاري — المصدر الوحيد لقواعد الاستحقاق والرصيد والتسعير بالجملة.
 *
 * كل دالة هنا تعمل داخل معاملة `SaaSPlatformRepository.mutate()` الواحدة: تُقرأ الحالة،
 * تُطبَّق القاعدة، ثم تُكتب الحالة كاملةً ذرّيًا (rename). فإن رمت دالةٌ في المنتصف لا يُكتب
 * شيء — لا ترخيصٌ نصف مُنشأ، ولا خصمٌ بلا دورة، ولا دورةٌ بلا خصم.
 *
 * والمعاملات متسلسلة داخل العملية الواحدة (Node أحادي الخيط و`mutate` متزامنة)، فتسجيلان
 * متزامنان عند 149/150 لا يصلان معًا إلى 151: الثاني يقرأ ما كتبه الأول. (المخزن ملفٌّ
 * بكاتبٍ واحد؛ نشرٌ متعدد النسخ يحتاج مخزنًا معامَلاتيًّا — انظر التقرير.)
 */

import crypto from 'crypto';
import type {
  PlanRecord, OrganizationRecord, LicenseRecord, SubscriptionRecord, InvoiceRecord, OperatorRecord,
  ParticipantUsageRow, CompetitionUsageRow, CreditLedgerRow, CommercialActor,
} from '../saas-platform';
import type {
  PlanVersionRecord, SubscriptionTermRecord, OperatorTierRecord, OperatorAgreementRecord, OperatorWalletRecord,
  WalletLedgerEntry, WalletEntryType, IdempotencyRecord, OperatorResalePriceRecord, CommercialPolicy, OwnershipEvent,
  AccessState, CommercialOwner, UsageMetric, TermChange, WhiteLabelRights, DiscoverRights, ExclusivityTerms,
  CommercialMigrationReport, BrandProfileRecord, CustomDomainRecord, PublishedCompetitionListing,
  WebhookEndpointRecord, WebhookDeliveryRecord,
} from './types';
import { applyDiscountBps, assertBps, assertCurrency, assertMinor, assertNonNegativeMinor } from './money';
import { addUtcMonthsClamped, anniversary, containsInstant, normalizeInstant, wholeDaysBetween } from './term-calendar';
import { DEFAULT_POLICY } from './catalog-seed';

/* ————————————————————————————— state & context ————————————————————————————— */

export interface CommercialState {
  sequence: number;
  plans: PlanRecord[];
  operators: OperatorRecord[];
  organizations: OrganizationRecord[];
  licenses: LicenseRecord[];
  creditLedger: CreditLedgerRow[];
  participantUsage: ParticipantUsageRow[];
  competitions: CompetitionUsageRow[];
  subscriptions: SubscriptionRecord[];
  invoices: InvoiceRecord[];
  commercialSchemaVersion?: number;
  commercialPolicy?: CommercialPolicy;
  planVersions: PlanVersionRecord[];
  subscriptionTerms: SubscriptionTermRecord[];
  operatorTiers: OperatorTierRecord[];
  operatorAgreements: OperatorAgreementRecord[];
  operatorWallets: OperatorWalletRecord[];
  walletLedger: WalletLedgerEntry[];
  idempotency: IdempotencyRecord[];
  resalePrices: OperatorResalePriceRecord[];
  ownershipEvents: OwnershipEvent[];
  migrationReports: CommercialMigrationReport[];
  brandProfiles: BrandProfileRecord[];
  customDomains: CustomDomainRecord[];
  discoverListings: PublishedCompetitionListing[];
  webhookEndpoints: WebhookEndpointRecord[];
  webhookDeliveries: WebhookDeliveryRecord[];
}

export interface AuditInput { tenantId?: string; organizationId?: string; action: string; entityType: string; entityId: string; reason?: string }

export interface EngineCtx {
  s: CommercialState;
  actor: CommercialActor;
  /** Transaction clock (ms). Injected so entitlement boundaries are deterministic and testable. */
  at: number;
  nextId(prefix: string): string;
  audit(input: AuditInput): void;
}

/** A commercial refusal that carries structured, UI-safe details (amounts, limits). */
export class CommercialError extends Error {
  constructor(public code: string, public details?: Record<string, unknown>) { super(code); }
}

const iso = (ms: number) => new Date(ms).toISOString();
const clean = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
const isOperatorRole = (role: string) => role === 'operator_owner' || role === 'operator_admin';

export function requireSuper(actor: CommercialActor) {
  if (actor.role !== 'super_admin') throw new CommercialError('SUPER_ADMIN_REQUIRED');
}

export function requireOperator(actor: CommercialActor): string {
  if (!isOperatorRole(actor.role) || !actor.operatorId) throw new CommercialError('OPERATOR_REQUIRED');
  return actor.operatorId;
}

export function policyOf(s: CommercialState): CommercialPolicy {
  return { ...DEFAULT_POLICY, updatedAt: '', updatedBy: '', ...(s.commercialPolicy || {}) } as CommercialPolicy;
}

export function updatePolicy(ctx: EngineCtx, patch: Partial<CommercialPolicy>) {
  requireSuper(ctx.actor);
  const current = policyOf(ctx.s);
  const next: CommercialPolicy = { ...current };
  const int = (v: unknown, min: number, max: number, code: string) => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new CommercialError(code);
    return v;
  };
  if (patch.graceDays !== undefined) next.graceDays = int(patch.graceDays, 0, 365, 'POLICY_GRACE_DAYS_INVALID');
  if (patch.readOnlyDays !== undefined) next.readOnlyDays = int(patch.readOnlyDays, 0, 3650, 'POLICY_READ_ONLY_DAYS_INVALID');
  if (patch.termMonths !== undefined) next.termMonths = int(patch.termMonths, 1, 60, 'POLICY_TERM_MONTHS_INVALID');
  if (patch.graceAllowsOperations !== undefined) next.graceAllowsOperations = !!patch.graceAllowsOperations;
  if (patch.mapEnforcement !== undefined) next.mapEnforcement = !!patch.mapEnforcement;
  if (patch.defaultUsageMetric !== undefined) {
    if (!['unique_participant', 'competition_entry'].includes(patch.defaultUsageMetric)) throw new CommercialError('POLICY_USAGE_METRIC_INVALID');
    next.defaultUsageMetric = patch.defaultUsageMetric;
  }
  if (patch.defaultWalletExpiryPolicy !== undefined) {
    if (!['expire_at_agreement_end', 'carry_over'].includes(patch.defaultWalletExpiryPolicy)) throw new CommercialError('POLICY_WALLET_EXPIRY_INVALID');
    next.defaultWalletExpiryPolicy = patch.defaultWalletExpiryPolicy;
  }
  if (patch.upgradeProration !== undefined) {
    if (!['full_difference', 'none'].includes(patch.upgradeProration)) throw new CommercialError('POLICY_PRORATION_INVALID');
    next.upgradeProration = patch.upgradeProration;
  }
  if (patch.usageWarningThresholdsBps !== undefined) {
    if (!Array.isArray(patch.usageWarningThresholdsBps) || !patch.usageWarningThresholdsBps.length) throw new CommercialError('POLICY_THRESHOLDS_INVALID');
    next.usageWarningThresholdsBps = [...new Set(patch.usageWarningThresholdsBps.map(assertBps))].sort((a, b) => a - b);
  }
  next.updatedAt = iso(ctx.at);
  next.updatedBy = ctx.actor.uid;
  ctx.s.commercialPolicy = next;
  ctx.audit({ action: 'COMMERCIAL_POLICY_UPDATED', entityType: 'commercial_policy', entityId: 'policy', reason: JSON.stringify(patch).slice(0, 300) });
  return next;
}

/* ————————————————————————————— idempotency ————————————————————————————— */

const requestHash = (payload: unknown) => crypto.createHash('sha256').update(JSON.stringify(payload ?? null)).digest('hex');

/**
 * Runs `fn` at most once per (scope, key). A repeated request with the same key returns the
 * first result without side effects; the same key with a different payload is refused.
 * Stored inside the same state write as the side effects, so the two can never diverge.
 */
export function idempotent<T>(ctx: EngineCtx, scope: string, key: string | undefined, payload: unknown, fn: () => T): T {
  const k = clean(key, 200);
  if (!k) throw new CommercialError('IDEMPOTENCY_KEY_REQUIRED');
  const fullKey = `${scope}:${k}`;
  const hash = requestHash(payload);
  const existing = ctx.s.idempotency.find(x => x.key === fullKey);
  if (existing) {
    if (existing.requestHash !== hash) throw new CommercialError('IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST');
    return existing.result as T;
  }
  const result = fn();
  ctx.s.idempotency.push({ key: fullKey, scope, requestHash: hash, result: JSON.parse(JSON.stringify(result ?? null)), createdAt: iso(ctx.at) });
  return result;
}

/* ————————————————————————————— plan catalog & versions ————————————————————————————— */

export interface EffectivePlanPrice {
  planId: string;
  planVersionId?: string;
  currency: string;
  publicPriceMinor: number;
  participantAllowance: number;
  activeCompetitionAllowance: number;
  custom: boolean;
}

export function planById(s: CommercialState, planId: string) {
  const plan = s.plans.find(x => x.id === planId);
  if (!plan) throw new CommercialError('PLAN_NOT_FOUND');
  return plan;
}

/** The plan's price and allowance in force at `at`. Legacy plans without versions fall back to the plan record. */
export function planPriceAt(s: CommercialState, planId: string, at: number): EffectivePlanPrice {
  const plan = planById(s, planId);
  const versions = s.planVersions
    .filter(v => v.planId === planId && Date.parse(v.effectiveFrom) <= at && (!v.effectiveTo || at < Date.parse(v.effectiveTo)))
    .sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom) || b.version - a.version);
  const v = versions[0];
  if (v) return { planId, planVersionId: v.id, currency: v.currency, publicPriceMinor: v.publicPriceMinor, participantAllowance: v.participantAllowance, activeCompetitionAllowance: v.activeCompetitionAllowance, custom: !!plan.custom };
  return { planId, currency: plan.currency, publicPriceMinor: plan.priceMinor, participantAllowance: plan.limits.annualParticipants, activeCompetitionAllowance: plan.limits.activeCompetitions, custom: !!plan.custom };
}

export interface PlanVersionInput {
  publicPriceMinor: number;
  participantAllowance?: number;
  activeCompetitionAllowance?: number;
  effectiveFrom?: string;
  note?: string;
}

/**
 * Schedules a new dated price/allowance for a plan. Never edits a past version: a change can
 * only take effect now or later, and the previous open version is closed at that instant.
 * Terms and invoices already issued keep their own snapshot and are untouched.
 */
export function schedulePlanVersion(ctx: EngineCtx, planId: string, input: PlanVersionInput): PlanVersionRecord {
  requireSuper(ctx.actor);
  const plan = planById(ctx.s, planId);
  if (plan.ownerOperatorId) throw new CommercialError('OPERATOR_PLAN_NOT_VERSIONED');
  const price = assertNonNegativeMinor(input.publicPriceMinor, 'publicPriceMinor');
  const current = planPriceAt(ctx.s, planId, ctx.at);
  const participantAllowance = input.participantAllowance ?? current.participantAllowance;
  const activeCompetitionAllowance = input.activeCompetitionAllowance ?? current.activeCompetitionAllowance;
  assertNonNegativeMinor(participantAllowance, 'participantAllowance');
  assertNonNegativeMinor(activeCompetitionAllowance, 'activeCompetitionAllowance');
  const effectiveFrom = input.effectiveFrom ? Date.parse(input.effectiveFrom) : ctx.at;
  if (!Number.isFinite(effectiveFrom)) throw new CommercialError('EFFECTIVE_FROM_INVALID');
  /* لا تسعيرَ بأثرٍ رجعي: ما مضى من فواتير ودورات يبقى كما بيع. */
  if (effectiveFrom < ctx.at - 60_000) throw new CommercialError('RETROACTIVE_PRICE_CHANGE_NOT_ALLOWED');
  const from = iso(effectiveFrom);
  const versions = ctx.s.planVersions.filter(v => v.planId === planId);
  for (const v of versions) {
    const vFrom = Date.parse(v.effectiveFrom);
    if (vFrom >= effectiveFrom) throw new CommercialError('LATER_PRICE_VERSION_ALREADY_SCHEDULED');
    if (!v.effectiveTo || Date.parse(v.effectiveTo) > effectiveFrom) v.effectiveTo = from;
  }
  const record: PlanVersionRecord = {
    id: ctx.nextId('PV'), planId, version: versions.length + 1, currency: plan.currency, publicPriceMinor: price,
    participantAllowance, activeCompetitionAllowance, effectiveFrom: from, createdAt: iso(ctx.at), createdBy: ctx.actor.uid,
    note: clean(input.note, 300) || undefined,
  };
  ctx.s.planVersions.push(record);
  if (effectiveFrom <= ctx.at) syncPlanRecord(plan, record);
  ctx.audit({ action: 'PLAN_PRICE_VERSION_SCHEDULED', entityType: 'plan', entityId: planId, reason: `v${record.version} ${record.currency} ${price} from ${from}` });
  return record;
}

/** Keep the legacy plan fields readable by older code paths. Pricing logic reads versions. */
export function syncPlanRecord(plan: PlanRecord, v: PlanVersionRecord) {
  plan.priceMinor = v.publicPriceMinor;
  plan.limits.annualParticipants = v.participantAllowance;
  plan.limits.activeCompetitions = v.activeCompetitionAllowance;
}

export function catalogView(s: CommercialState, at: number) {
  return s.plans
    .filter(p => p.catalog === 'mizan')
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
    .map(p => {
      const price = planPriceAt(s, p.id, at);
      const upcoming = s.planVersions
        .filter(v => v.planId === p.id && Date.parse(v.effectiveFrom) > at)
        .sort((a, b) => Date.parse(a.effectiveFrom) - Date.parse(b.effectiveFrom))[0];
      return {
        id: p.id, slug: p.slug, name: p.name, nameArabic: p.nameArabic, active: p.active, custom: !!p.custom,
        currency: price.currency, publicPriceMinor: price.publicPriceMinor, planVersionId: price.planVersionId,
        participantAllowance: price.participantAllowance, activeCompetitionAllowance: price.activeCompetitionAllowance,
        storageBytes: p.limits.storageBytes, branches: p.limits.branches, displayOrder: p.displayOrder ?? 0,
        upcomingVersion: upcoming ? { publicPriceMinor: upcoming.publicPriceMinor, effectiveFrom: upcoming.effectiveFrom } : undefined,
      };
    });
}

/* ————————————————————————————— subscription terms ————————————————————————————— */

export function organizationOf(s: CommercialState, organizationId: string) {
  const org = s.organizations.find(x => x.id === organizationId);
  if (!org) throw new CommercialError('ORGANIZATION_NOT_FOUND');
  return org;
}

export function licenseOf(s: CommercialState, organizationId: string) {
  const license = s.licenses.find(x => x.organizationId === organizationId);
  if (!license) throw new CommercialError('LICENSE_NOT_FOUND');
  return license;
}

export function commercialOwnerOf(org: OrganizationRecord): CommercialOwner {
  return org.commercialOwner || (org.operatorId ? 'operator' : 'direct');
}

export function termsOf(s: CommercialState, organizationId: string, includeLegacy = false) {
  return s.subscriptionTerms
    .filter(t => t.organizationId === organizationId && (includeLegacy || !t.legacy))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/** The real (non-legacy) term covering `at`, if any. */
export function currentTerm(s: CommercialState, organizationId: string, at: number) {
  return termsOf(s, organizationId).find(t => containsInstant(t, at));
}

export function latestTerm(s: CommercialState, organizationId: string) {
  const terms = termsOf(s, organizationId);
  return terms.sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt))[0];
}

/**
 * Commercial access state. Derived from dates, never stored, so a stale field can't lie:
 *   active → grace → read_only → suspended, with explicit suspension and cancellation on top.
 * No state here deletes anything.
 */
export function accessState(s: CommercialState, organizationId: string, at: number): AccessState {
  const org = organizationOf(s, organizationId);
  const license = s.licenses.find(x => x.organizationId === organizationId);
  if (org.status === 'suspended' || license?.status === 'suspended') return 'suspended';
  if (currentTerm(s, organizationId, at)) return 'active';
  const sub = s.subscriptions.find(x => x.subjectType === 'organization' && x.subjectId === organizationId && x.status !== 'canceled');
  const everSubscribed = s.subscriptions.some(x => x.subjectType === 'organization' && x.subjectId === organizationId);
  if (!sub && everSubscribed) return 'cancelled';
  const latest = latestTerm(s, organizationId);
  if (!latest) return 'suspended';
  const endedAt = Date.parse(latest.endsAt);
  if (at < Date.parse(latest.startsAt)) return 'suspended';
  const policy = policyOf(s);
  /* مهلةٌ صريحة على الترخيص (graceUntil) تتقدّم على مهلة السياسة العامة. */
  const graceUntil = license?.status === 'grace_period' && license.graceUntil ? Date.parse(license.graceUntil) : NaN;
  const graceEnds = Number.isFinite(graceUntil) ? Math.max(graceUntil, endedAt) : endedAt + policy.graceDays * 86_400_000;
  if (at < graceEnds) return 'grace';
  if (at < graceEnds + policy.readOnlyDays * 86_400_000) return 'read_only';
  return 'suspended';
}

/** The term new usage is attributed to: the current term, or the lapsed term during grace. */
export function entitlementTerm(s: CommercialState, organizationId: string, at: number) {
  const current = currentTerm(s, organizationId, at);
  if (current) return current;
  return accessState(s, organizationId, at) === 'grace' ? latestTerm(s, organizationId) : undefined;
}

export function assertOperationsAllowed(s: CommercialState, organizationId: string, at: number) {
  const state = accessState(s, organizationId, at);
  if (state === 'active') return;
  if (state === 'grace' && policyOf(s).graceAllowsOperations) return;
  if (state === 'grace') throw new CommercialError('SUBSCRIPTION_IN_GRACE', { state });
  if (state === 'read_only') throw new CommercialError('TENANT_READ_ONLY', { state });
  throw new CommercialError('TENANT_SUSPENDED', { state });
}

interface Allowance { participantAllowance: number; activeCompetitionAllowance: number }

/** Plan base allowance + visible contract override = effective allowance. */
export function effectiveAllowance(base: Allowance, license: LicenseRecord | undefined): Allowance & { base: Allowance; override: Partial<Allowance> } {
  const override: Partial<Allowance> = {};
  if (license?.overrides?.annualParticipants !== undefined) override.participantAllowance = license.overrides.annualParticipants;
  if (license?.overrides?.activeCompetitions !== undefined) override.activeCompetitionAllowance = license.overrides.activeCompetitions;
  return {
    participantAllowance: override.participantAllowance ?? base.participantAllowance,
    activeCompetitionAllowance: override.activeCompetitionAllowance ?? base.activeCompetitionAllowance,
    base: { participantAllowance: base.participantAllowance, activeCompetitionAllowance: base.activeCompetitionAllowance },
    override,
  };
}

export interface CreateTermInput {
  organization: OrganizationRecord;
  license: LicenseRecord;
  subscription?: SubscriptionRecord;
  planId: string;
  startsAt: string;
  endsAt: string;
  anchorAt: string;
  termIndex: number;
  source: SubscriptionTermRecord['source'];
  contractPriceMinor?: number;
  operator?: { operatorId: string; agreementId: string; discountBps: number; wholesalePriceMinor: number; walletEntryId?: string };
  renewedFromTermId?: string;
  invoiceId?: string;
}

export function createTerm(ctx: EngineCtx, input: CreateTermInput): SubscriptionTermRecord {
  const price = planPriceAt(ctx.s, input.planId, Date.parse(input.startsAt) <= ctx.at ? ctx.at : Date.parse(input.startsAt));
  const allowance = effectiveAllowance(price, input.license);
  if (Date.parse(input.endsAt) <= Date.parse(input.startsAt)) throw new CommercialError('TERM_DATES_INVALID');
  const overlap = termsOf(ctx.s, input.organization.id).find(t => Date.parse(t.startsAt) < Date.parse(input.endsAt) && Date.parse(input.startsAt) < Date.parse(t.endsAt));
  if (overlap) throw new CommercialError('TERM_OVERLAP', { termId: overlap.id });
  const term: SubscriptionTermRecord = {
    id: ctx.nextId('TERM'), tenantId: input.organization.tenantId, organizationId: input.organization.id,
    subscriptionId: input.subscription?.id, licenseId: input.license.id, planId: input.planId, planVersionId: price.planVersionId,
    termIndex: input.termIndex, anchorAt: input.anchorAt, startsAt: normalizeInstant(input.startsAt), endsAt: normalizeInstant(input.endsAt),
    status: 'active', source: input.source, participantAllowance: allowance.participantAllowance,
    activeCompetitionAllowance: allowance.activeCompetitionAllowance, usageMetric: policyOf(ctx.s).defaultUsageMetric,
    currency: price.currency, publicPriceMinor: price.publicPriceMinor, contractPriceMinor: input.contractPriceMinor,
    operatorId: input.operator?.operatorId, operatorAgreementId: input.operator?.agreementId, discountBps: input.operator?.discountBps,
    wholesalePriceMinor: input.operator?.wholesalePriceMinor, walletEntryId: input.operator?.walletEntryId,
    renewedFromTermId: input.renewedFromTermId, invoiceId: input.invoiceId, changes: [], createdAt: iso(ctx.at), createdBy: ctx.actor.uid,
  };
  ctx.s.subscriptionTerms.push(term);
  ctx.audit({ tenantId: term.tenantId, organizationId: term.organizationId, action: 'SUBSCRIPTION_TERM_CREATED', entityType: 'subscription_term', entityId: term.id, reason: `${term.source} #${term.termIndex} ${term.startsAt.slice(0, 10)}→${term.endsAt.slice(0, 10)} ${term.participantAllowance}p/${term.activeCompetitionAllowance}c` });
  return term;
}

/** Close terms whose period has ended. Status is informational — entitlement reads dates. */
export function closeEndedTerms(ctx: EngineCtx) {
  let closed = 0;
  for (const t of ctx.s.subscriptionTerms) {
    if (t.status === 'active' && Date.parse(t.endsAt) <= ctx.at) {
      t.status = 'closed'; t.closedAt = iso(ctx.at); closed++;
      ctx.audit({ tenantId: t.tenantId, organizationId: t.organizationId, action: 'SUBSCRIPTION_TERM_CLOSED', entityType: 'subscription_term', entityId: t.id });
    }
  }
  return closed;
}

/** Initial term for a newly licensed organization: exactly the licence period. */
export function createInitialTerm(ctx: EngineCtx, org: OrganizationRecord, license: LicenseRecord, extra: Partial<CreateTermInput> = {}) {
  return createTerm(ctx, {
    organization: org, license, planId: license.planId, startsAt: license.startsAt, endsAt: license.expiresAt,
    anchorAt: license.expiresAt, termIndex: 1, source: 'initial', ...extra,
  });
}

/**
 * Boundaries of the next term after `previous`, on the anniversary grid anchored at the end of
 * the first term. If the organization lapsed for more than a full term, the next paid term is
 * the one covering `at` — lapsed periods are not sold retroactively.
 */
export function nextTermWindow(s: CommercialState, previous: SubscriptionTermRecord, at: number) {
  const months = policyOf(s).termMonths;
  let index = previous.termIndex + 1;
  let startsAt = previous.endsAt;
  let endsAt = anniversary(previous.anchorAt, index - 1, months);
  if (Date.parse(endsAt) <= Date.parse(startsAt)) endsAt = addUtcMonthsClamped(startsAt, months);
  while (Date.parse(endsAt) <= at) {
    index++;
    startsAt = endsAt;
    endsAt = anniversary(previous.anchorAt, index - 1, months);
  }
  return { termIndex: index, startsAt, endsAt };
}

/**
 * Renewal: close the previous entitlement, open a fresh one, extend the licence. Usage resets
 * only because new usage attaches to the new term; nothing historical is edited or removed.
 */
export function renewTerm(ctx: EngineCtx, organizationId: string, input: { invoiceId?: string; contractPriceMinor?: number; operator?: CreateTermInput['operator'] } = {}) {
  const s = ctx.s;
  if (input.invoiceId) {
    const already = s.subscriptionTerms.find(t => t.invoiceId === input.invoiceId);
    if (already) return { term: already, alreadyApplied: true };
  }
  const org = organizationOf(s, organizationId);
  const license = licenseOf(s, organizationId);
  const previous = latestTerm(s, organizationId);
  if (!previous) throw new CommercialError('SUBSCRIPTION_TERM_NOT_FOUND');
  const sub = s.subscriptions.find(x => x.subjectType === 'organization' && x.subjectId === organizationId && x.status !== 'canceled');
  const window = nextTermWindow(s, previous, ctx.at);
  /* تخفيضٌ مجدول يدخل مع الدورة الجديدة، لا في منتصف دورةٍ نشطة. */
  const planId = sub?.pendingPlanId || license.planId;
  if (sub?.pendingPlanId) {
    license.planId = sub.pendingPlanId;
    sub.planId = sub.pendingPlanId;
    delete sub.pendingPlanId; delete sub.pendingPlanRequestedAt;
    ctx.audit({ tenantId: org.tenantId, organizationId, action: 'SCHEDULED_PLAN_CHANGE_APPLIED', entityType: 'subscription', entityId: sub.id, reason: planId });
  }
  if (previous.status === 'active' && Date.parse(previous.endsAt) <= ctx.at) { previous.status = 'closed'; previous.closedAt = iso(ctx.at); }
  const term = createTerm(ctx, {
    organization: org, license, subscription: sub, planId, startsAt: window.startsAt, endsAt: window.endsAt,
    anchorAt: previous.anchorAt, termIndex: window.termIndex, source: 'renewal', renewedFromTermId: previous.id,
    invoiceId: input.invoiceId, contractPriceMinor: input.contractPriceMinor ?? previous.contractPriceMinor, operator: input.operator,
  });
  const previousExpiry = license.expiresAt;
  license.expiresAt = term.endsAt;
  if (license.status === 'grace_period' || license.status === 'expired') license.status = 'active';
  delete license.graceUntil;
  license.updatedAt = iso(ctx.at);
  if (sub) {
    sub.status = 'active';
    sub.currentPeriodStart = term.startsAt;
    sub.currentPeriodEnd = term.endsAt;
    sub.updatedAt = iso(ctx.at);
  }
  ctx.audit({ tenantId: org.tenantId, organizationId, action: 'SUBSCRIPTION_RENEWED', entityType: 'subscription_term', entityId: term.id, reason: `licence ${previousExpiry.slice(0, 10)}→${term.endsAt.slice(0, 10)}` });
  return { term, alreadyApplied: false };
}

/* ————————————————————————————— usage & limits ————————————————————————————— */

export function activeCompetitionStates() {
  return new Set(['registration_open', 'registration_closed', 'judging']);
}

export function usageKey(metric: UsageMetric, input: { competitionId: string; participantId: string; identityKey?: string }) {
  return metric === 'competition_entry'
    ? `${input.competitionId}:${input.participantId}`
    : (clean(input.identityKey, 200) || input.participantId);
}

export function participantsUsedInTerm(s: CommercialState, term: SubscriptionTermRecord) {
  const keys = new Set<string>();
  for (const row of s.participantUsage) {
    if (row.subscriptionTermId !== term.id) continue;
    keys.add(row.usageKey || usageKey(term.usageMetric, row));
  }
  return keys.size;
}

export function recordParticipantUsage(ctx: EngineCtx, input: { organizationId: string; competitionId: string; participantId: string; identityKey?: string }) {
  const s = ctx.s;
  const org = organizationOf(s, input.organizationId);
  licenseOf(s, input.organizationId);
  const competition = s.competitions.find(x => x.id === input.competitionId && x.organizationId === org.id);
  if (!competition || competition.state === 'draft') throw new CommercialError('PARTICIPANT_USAGE_REQUIRES_PUBLISHED_COMPETITION');
  const participantId = clean(input.participantId, 120);
  if (!participantId) throw new CommercialError('PARTICIPANT_ID_REQUIRED');
  const term = entitlementTerm(s, org.id, ctx.at);
  const key = usageKey(term?.usageMetric || policyOf(s).defaultUsageMetric, { ...input, participantId });
  if (term) {
    const duplicate = s.participantUsage.find(x => x.subscriptionTermId === term.id && (x.usageKey || usageKey(term.usageMetric, x)) === key);
    if (duplicate) return duplicate;
  }
  assertOperationsAllowed(s, org.id, ctx.at);
  if (!term) throw new CommercialError('SUBSCRIPTION_TERM_NOT_FOUND');
  const used = participantsUsedInTerm(s, term);
  if (used >= term.participantAllowance) {
    throw new CommercialError('ANNUAL_PARTICIPANT_LIMIT_REACHED', { used, allowance: term.participantAllowance, termEndsAt: term.endsAt });
  }
  const row: ParticipantUsageRow = {
    id: ctx.nextId('PU'), tenantId: org.tenantId, organizationId: org.id, competitionId: clean(input.competitionId, 120), participantId,
    year: new Date(ctx.at).getUTCFullYear(), createdAt: iso(ctx.at), subscriptionTermId: term.id, usageKey: key,
    identityKey: clean(input.identityKey, 200) || undefined,
  };
  s.participantUsage.push(row);
  return row;
}

export function setCompetitionCommercialState(ctx: EngineCtx, input: { organizationId: string; competitionId: string; organizerOrganizationId?: string; state: CompetitionUsageRow['state'] }) {
  const s = ctx.s;
  const org = organizationOf(s, input.organizationId);
  licenseOf(s, input.organizationId);
  const organizer = input.organizerOrganizationId || input.organizationId;
  if (organizer !== input.organizationId) throw new CommercialError('INDEPENDENT_ORGANIZER_REQUIRES_LICENSE');
  const active = activeCompetitionStates();
  const existing = s.competitions.find(x => x.id === input.competitionId && x.organizationId === input.organizationId);
  const activating = active.has(input.state) && (!existing || !active.has(existing.state));
  if (activating) {
    assertOperationsAllowed(s, org.id, ctx.at);
    const term = entitlementTerm(s, org.id, ctx.at);
    if (!term) throw new CommercialError('SUBSCRIPTION_TERM_NOT_FOUND');
    const count = s.competitions.filter(x => x.organizationId === org.id && active.has(x.state)).length;
    if (count >= term.activeCompetitionAllowance) {
      throw new CommercialError('ACTIVE_COMPETITION_LIMIT_REACHED', { active: count, allowance: term.activeCompetitionAllowance });
    }
  }
  const row: CompetitionUsageRow = existing || { id: clean(input.competitionId, 120), tenantId: org.tenantId, organizationId: org.id, organizerOrganizationId: organizer, state: 'draft', updatedAt: iso(ctx.at) };
  row.state = input.state;
  row.updatedAt = iso(ctx.at);
  if (!existing) s.competitions.push(row);
  ctx.audit({ tenantId: org.tenantId, organizationId: org.id, action: 'COMPETITION_STATE_CHANGED', entityType: 'competition', entityId: row.id, reason: row.state });
  return row;
}

const redactTerm = (t: SubscriptionTermRecord, channelPrivate: boolean) => {
  if (channelPrivate) return t;
  const { operatorAgreementId: _a, discountBps: _d, wholesalePriceMinor: _w, walletEntryId: _e, ...rest } = t;
  return { ...rest, changes: t.changes.map(c => ({ ...c, walletEntryId: undefined })) };
};

/**
 * The organization's billing view: plan, term, usage, history, warnings. For an operator's
 * customer the channel-private fields (discount, wholesale cost, wallet) are removed, and the
 * public list price is hidden too, since the customer's real price is the operator's.
 */
export function organizationBillingView(s: CommercialState, organizationId: string, at: number, opts: { channelPrivate: boolean }) {
  const org = organizationOf(s, organizationId);
  const license = licenseOf(s, organizationId);
  const owner = commercialOwnerOf(org);
  const term = entitlementTerm(s, organizationId, at);
  const state = accessState(s, organizationId, at);
  const plan = s.plans.find(x => x.id === (term?.planId || license.planId));
  const sub = s.subscriptions.find(x => x.subjectType === 'organization' && x.subjectId === organizationId && x.status !== 'canceled');
  const used = term ? participantsUsedInTerm(s, term) : 0;
  const allowance = term?.participantAllowance ?? 0;
  const active = activeCompetitionStates();
  const activeCount = s.competitions.filter(x => x.organizationId === organizationId && active.has(x.state)).length;
  const policy = policyOf(s);
  const ratioBps = allowance ? Math.floor((used * 10_000) / allowance) : (used ? 10_000 : 0);
  const warningThresholdBps = [...policy.usageWarningThresholdsBps].reverse().find(bps => ratioBps >= bps);
  const priceAllowed = opts.channelPrivate || owner === 'direct';
  const base = term ? { participantAllowance: planPriceAt(s, term.planId, Date.parse(term.startsAt)).participantAllowance, activeCompetitionAllowance: planPriceAt(s, term.planId, Date.parse(term.startsAt)).activeCompetitionAllowance } : undefined;
  const history = termsOf(s, organizationId, true)
    .filter(t => t.id !== term?.id)
    .map(t => ({ ...redactTerm(t, opts.channelPrivate), publicPriceMinor: priceAllowed ? t.publicPriceMinor : undefined, participantsUsed: participantsUsedInTerm(s, t) }))
    .reverse();
  const pendingPlan = sub?.pendingPlanId ? s.plans.find(x => x.id === sub.pendingPlanId) : undefined;
  return {
    organization: { id: org.id, officialName: org.officialName, shortName: org.shortName, operatorId: opts.channelPrivate ? org.operatorId : undefined },
    commercialOwner: owner,
    accessState: state,
    plan: plan ? { id: plan.id, name: plan.name, nameArabic: plan.nameArabic, slug: plan.slug } : undefined,
    term: term ? { ...redactTerm(term, opts.channelPrivate), publicPriceMinor: priceAllowed ? term.publicPriceMinor : undefined } : undefined,
    renewalDate: term?.endsAt,
    usage: {
      participantsUsed: used,
      participantAllowance: allowance,
      participantsRemaining: Math.max(0, allowance - used),
      activeCompetitions: activeCount,
      activeCompetitionAllowance: term?.activeCompetitionAllowance ?? 0,
      usageRatioBps: ratioBps,
      warningThresholdBps,
      thresholdsBps: policy.usageWarningThresholdsBps,
    },
    limits: term && base ? {
      base,
      override: effectiveAllowance(base, license).override,
      effective: { participantAllowance: term.participantAllowance, activeCompetitionAllowance: term.activeCompetitionAllowance },
    } : undefined,
    pendingPlanChange: pendingPlan ? { planId: pendingPlan.id, name: pendingPlan.name, effectiveAt: term?.endsAt } : undefined,
    history,
    /* شراءُ الترقية يمرّ بمن يملك العلاقة التجارية: المنصّة للمباشر، والمشغّل لعملائه. */
    upgradePath: owner === 'operator' ? 'contact_operator' : 'mizan_direct',
  };
}

/* ————————————————————————————— operator tiers & agreements ————————————————————————————— */

const normalizeRights = (r: Partial<WhiteLabelRights> | undefined, fallback: WhiteLabelRights): WhiteLabelRights => {
  const level = r?.level && ['mizan', 'co_branded', 'full'].includes(r.level) ? r.level : fallback.level;
  const full = level === 'full';
  return {
    level,
    customDomain: level === 'mizan' ? false : (r?.customDomain ?? fallback.customDomain),
    customEmailBranding: level === 'mizan' ? false : (r?.customEmailBranding ?? fallback.customEmailBranding),
    /* إخفاء علامة ميزان حقٌّ لا يوجد إلا في العلامة البيضاء الكاملة. */
    hideMizanBrand: full ? (r?.hideMizanBrand ?? fallback.hideMizanBrand) : false,
  };
};

export function upsertOperatorTier(ctx: EngineCtx, input: Partial<OperatorTierRecord> & { slug: string }) {
  requireSuper(ctx.actor);
  const slug = clean(input.slug, 60).toLowerCase();
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) throw new CommercialError('TIER_SLUG_INVALID');
  const existing = ctx.s.operatorTiers.find(x => x.slug === slug || (input.id && x.id === input.id));
  const t = iso(ctx.at);
  const fallbackRights: WhiteLabelRights = existing?.defaultWhiteLabelRights || { level: 'co_branded', customDomain: false, customEmailBranding: false, hideMizanBrand: false };
  const tier: OperatorTierRecord = {
    id: existing?.id || ctx.nextId('TIER'), slug,
    name: clean(input.name ?? existing?.name, 120), nameArabic: clean(input.nameArabic ?? existing?.nameArabic, 120),
    currency: assertCurrency(input.currency ?? existing?.currency ?? 'USD'),
    minimumAnnualCommitmentMinor: assertNonNegativeMinor(input.minimumAnnualCommitmentMinor ?? existing?.minimumAnnualCommitmentMinor ?? 0, 'minimumAnnualCommitmentMinor'),
    discountBps: assertBps(input.discountBps ?? existing?.discountBps ?? 0),
    defaultWhiteLabelRights: normalizeRights(input.defaultWhiteLabelRights, fallbackRights),
    defaultDiscoverRights: { operatorDirectory: !!(input.defaultDiscoverRights?.operatorDirectory ?? existing?.defaultDiscoverRights.operatorDirectory) },
    defaultGlobalSyndicationRights: !!(input.defaultGlobalSyndicationRights ?? existing?.defaultGlobalSyndicationRights),
    active: input.active ?? existing?.active ?? true,
    displayOrder: Number.isInteger(input.displayOrder) ? input.displayOrder! : existing?.displayOrder ?? 0,
    createdAt: existing?.createdAt || t, updatedAt: t,
  };
  if (!tier.name) throw new CommercialError('TIER_NAME_REQUIRED');
  if (existing) Object.assign(existing, tier); else ctx.s.operatorTiers.push(tier);
  ctx.audit({ action: existing ? 'OPERATOR_TIER_UPDATED' : 'OPERATOR_TIER_CREATED', entityType: 'operator_tier', entityId: tier.id, reason: `${tier.slug} ${tier.discountBps}bps min ${tier.minimumAnnualCommitmentMinor}` });
  return tier;
}

const normalizeExclusivity = (x: Partial<ExclusivityTerms> | undefined | null): ExclusivityTerms | undefined => {
  if (!x || !x.enabled) return undefined;
  const territories = Array.isArray(x.territories) ? x.territories.map(t => clean(t, 60).toUpperCase()).filter(Boolean) : [];
  /* الحصرية لا تُفترض: لا تُقبل إلا صريحةً محدودةً بمنطقة وتاريخين. */
  if (!territories.length) throw new CommercialError('EXCLUSIVITY_TERRITORIES_REQUIRED');
  if (!x.startsAt || !x.endsAt || !(Date.parse(x.endsAt) > Date.parse(x.startsAt))) throw new CommercialError('EXCLUSIVITY_DATES_REQUIRED');
  return {
    enabled: true, territories, startsAt: normalizeInstant(x.startsAt), endsAt: normalizeInstant(x.endsAt),
    minimumSalesMinor: x.minimumSalesMinor !== undefined ? assertNonNegativeMinor(x.minimumSalesMinor, 'minimumSalesMinor') : undefined,
    minimumActiveOrganizations: x.minimumActiveOrganizations !== undefined ? assertNonNegativeMinor(x.minimumActiveOrganizations, 'minimumActiveOrganizations') : undefined,
    renewalConditions: clean(x.renewalConditions, 500) || undefined,
  };
};

export interface AgreementInput {
  operatorId: string;
  tierId: string;
  startsAt?: string;
  endsAt?: string;
  currency?: string;
  discountBps?: number;
  minimumAnnualCommitmentMinor?: number;
  whiteLabelRights?: Partial<WhiteLabelRights>;
  discoverRights?: Partial<DiscoverRights>;
  globalSyndicationRights?: boolean;
  exclusivity?: Partial<ExclusivityTerms> | null;
  walletExpiryPolicy?: OperatorAgreementRecord['walletExpiryPolicy'];
  creditFacilityMinor?: number;
  minimumAdvertisedPriceMinor?: Record<string, number> | null;
}

export function createAgreement(ctx: EngineCtx, input: AgreementInput, renewedFrom?: OperatorAgreementRecord): OperatorAgreementRecord {
  requireSuper(ctx.actor);
  const s = ctx.s;
  if (!s.operators.some(x => x.id === input.operatorId)) throw new CommercialError('OPERATOR_NOT_FOUND');
  const tier = s.operatorTiers.find(x => x.id === input.tierId || x.slug === input.tierId);
  if (!tier || !tier.active) throw new CommercialError('OPERATOR_TIER_NOT_FOUND');
  const startsAt = normalizeInstant(input.startsAt || iso(ctx.at));
  const endsAt = normalizeInstant(input.endsAt || addUtcMonthsClamped(startsAt, 12));
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new CommercialError('AGREEMENT_DATES_INVALID');
  const map = input.minimumAdvertisedPriceMinor;
  if (map) for (const [planId, v] of Object.entries(map)) { planById(s, planId); assertNonNegativeMinor(v, 'minimumAdvertisedPriceMinor'); }
  const agreement: OperatorAgreementRecord = {
    id: ctx.nextId('AGR'), operatorId: input.operatorId, tierId: tier.id,
    currency: assertCurrency(input.currency || tier.currency),
    discountBps: assertBps(input.discountBps ?? tier.discountBps),
    minimumAnnualCommitmentMinor: assertNonNegativeMinor(input.minimumAnnualCommitmentMinor ?? tier.minimumAnnualCommitmentMinor, 'minimumAnnualCommitmentMinor'),
    startsAt, endsAt, status: 'draft',
    whiteLabelRights: normalizeRights(input.whiteLabelRights, tier.defaultWhiteLabelRights),
    discoverRights: { operatorDirectory: input.discoverRights?.operatorDirectory ?? tier.defaultDiscoverRights.operatorDirectory },
    globalSyndicationRights: input.globalSyndicationRights ?? tier.defaultGlobalSyndicationRights,
    exclusivity: normalizeExclusivity(input.exclusivity),
    walletExpiryPolicy: input.walletExpiryPolicy === 'carry_over' || input.walletExpiryPolicy === 'expire_at_agreement_end' ? input.walletExpiryPolicy : policyOf(s).defaultWalletExpiryPolicy,
    creditFacilityMinor: assertNonNegativeMinor(input.creditFacilityMinor ?? 0, 'creditFacilityMinor'),
    minimumAdvertisedPriceMinor: map ? { ...map } : null,
    renewedFromAgreementId: renewedFrom?.id,
    createdAt: iso(ctx.at), createdBy: ctx.actor.uid, history: [],
  };
  s.operatorAgreements.push(agreement);
  ctx.audit({ action: renewedFrom ? 'OPERATOR_AGREEMENT_RENEWAL_DRAFTED' : 'OPERATOR_AGREEMENT_CREATED', entityType: 'operator_agreement', entityId: agreement.id, reason: `${agreement.operatorId} ${tier.slug} ${agreement.discountBps}bps ${agreement.currency} ${agreement.minimumAnnualCommitmentMinor}${agreement.exclusivity ? ' exclusivity:' + agreement.exclusivity.territories.join(',') : ''}` });
  return agreement;
}

export function agreementById(s: CommercialState, id: string) {
  const a = s.operatorAgreements.find(x => x.id === id);
  if (!a) throw new CommercialError('OPERATOR_AGREEMENT_NOT_FOUND');
  return a;
}

export function activeAgreement(s: CommercialState, operatorId: string, at: number) {
  return s.operatorAgreements.find(a => a.operatorId === operatorId && a.status === 'active' && Date.parse(a.startsAt) <= at && at < Date.parse(a.endsAt));
}

export function approveAgreement(ctx: EngineCtx, id: string) {
  requireSuper(ctx.actor);
  const a = agreementById(ctx.s, id);
  if (a.status !== 'draft') throw new CommercialError('AGREEMENT_NOT_DRAFT');
  const overlap = ctx.s.operatorAgreements.find(x => x.id !== a.id && x.operatorId === a.operatorId && x.status === 'active'
    && Date.parse(x.startsAt) < Date.parse(a.endsAt) && Date.parse(a.startsAt) < Date.parse(x.endsAt));
  if (overlap) throw new CommercialError('AGREEMENT_OVERLAP', { agreementId: overlap.id });
  a.status = 'active';
  a.approvedAt = iso(ctx.at);
  a.approvedBy = ctx.actor.uid;
  walletFor(ctx, a.operatorId, a.currency);
  const op = ctx.s.operators.find(x => x.id === a.operatorId);
  if (op) op.whiteLabelLevel = a.whiteLabelRights.level;
  ctx.audit({ action: 'OPERATOR_AGREEMENT_APPROVED', entityType: 'operator_agreement', entityId: a.id, reason: a.operatorId });
  return a;
}

export function updateAgreementTerms(ctx: EngineCtx, id: string, patch: Partial<AgreementInput>, reason: string) {
  requireSuper(ctx.actor);
  if (clean(reason).length < 3) throw new CommercialError('REASON_REQUIRED');
  const a = agreementById(ctx.s, id);
  if (a.status === 'terminated' || a.status === 'expired') throw new CommercialError('AGREEMENT_CLOSED');
  const change = (field: string, from: unknown, to: unknown) => {
    if (JSON.stringify(from) === JSON.stringify(to)) return;
    a.history.push({ at: iso(ctx.at), by: ctx.actor.uid, field, from, to, reason: clean(reason, 300) });
  };
  if (patch.discountBps !== undefined) { const v = assertBps(patch.discountBps); change('discountBps', a.discountBps, v); a.discountBps = v; }
  if (patch.minimumAnnualCommitmentMinor !== undefined) { const v = assertNonNegativeMinor(patch.minimumAnnualCommitmentMinor, 'minimumAnnualCommitmentMinor'); change('minimumAnnualCommitmentMinor', a.minimumAnnualCommitmentMinor, v); a.minimumAnnualCommitmentMinor = v; }
  if (patch.whiteLabelRights) { const v = normalizeRights(patch.whiteLabelRights, a.whiteLabelRights); change('whiteLabelRights', a.whiteLabelRights, v); a.whiteLabelRights = v; const op = ctx.s.operators.find(x => x.id === a.operatorId); if (op && a.status === 'active') op.whiteLabelLevel = v.level; }
  if (patch.discoverRights) { const v = { operatorDirectory: !!patch.discoverRights.operatorDirectory }; change('discoverRights', a.discoverRights, v); a.discoverRights = v; }
  if (patch.globalSyndicationRights !== undefined) { change('globalSyndicationRights', a.globalSyndicationRights, !!patch.globalSyndicationRights); a.globalSyndicationRights = !!patch.globalSyndicationRights; }
  if (patch.exclusivity !== undefined) { const v = normalizeExclusivity(patch.exclusivity); change('exclusivity', a.exclusivity, v); a.exclusivity = v; }
  if (patch.creditFacilityMinor !== undefined) { const v = assertNonNegativeMinor(patch.creditFacilityMinor, 'creditFacilityMinor'); change('creditFacilityMinor', a.creditFacilityMinor, v); a.creditFacilityMinor = v; }
  if (patch.walletExpiryPolicy !== undefined) { if (!['carry_over', 'expire_at_agreement_end'].includes(patch.walletExpiryPolicy)) throw new CommercialError('WALLET_EXPIRY_POLICY_INVALID'); change('walletExpiryPolicy', a.walletExpiryPolicy, patch.walletExpiryPolicy); a.walletExpiryPolicy = patch.walletExpiryPolicy; }
  if (patch.minimumAdvertisedPriceMinor !== undefined) {
    const map = patch.minimumAdvertisedPriceMinor;
    if (map) for (const [planId, v] of Object.entries(map)) { planById(ctx.s, planId); assertNonNegativeMinor(v, 'minimumAdvertisedPriceMinor'); }
    change('minimumAdvertisedPriceMinor', a.minimumAdvertisedPriceMinor, map); a.minimumAdvertisedPriceMinor = map ? { ...map } : null;
  }
  if (patch.endsAt !== undefined) { const v = normalizeInstant(patch.endsAt); if (Date.parse(v) <= Date.parse(a.startsAt)) throw new CommercialError('AGREEMENT_DATES_INVALID'); change('endsAt', a.endsAt, v); a.endsAt = v; }
  ctx.audit({ action: 'OPERATOR_AGREEMENT_CHANGED', entityType: 'operator_agreement', entityId: a.id, reason: `${clean(reason, 200)} · ${Object.keys(patch).join(',')}` });
  return a;
}

export function terminateAgreement(ctx: EngineCtx, id: string, reason: string) {
  requireSuper(ctx.actor);
  if (clean(reason).length < 3) throw new CommercialError('REASON_REQUIRED');
  const a = agreementById(ctx.s, id);
  if (a.status === 'terminated') return a;
  a.status = 'terminated';
  a.terminatedAt = iso(ctx.at);
  a.terminationReason = clean(reason, 300);
  ctx.audit({ action: 'OPERATOR_AGREEMENT_TERMINATED', entityType: 'operator_agreement', entityId: a.id, reason: a.terminationReason });
  return a;
}

export function renewAgreement(ctx: EngineCtx, id: string, patch: Partial<AgreementInput> = {}) {
  const prev = agreementById(ctx.s, id);
  if (prev.status === 'terminated') throw new CommercialError('AGREEMENT_CLOSED');
  const startsAt = patch.startsAt || prev.endsAt;
  return createAgreement(ctx, {
    operatorId: prev.operatorId, tierId: patch.tierId || prev.tierId, startsAt, endsAt: patch.endsAt || addUtcMonthsClamped(startsAt, 12),
    currency: prev.currency, discountBps: patch.discountBps ?? prev.discountBps,
    minimumAnnualCommitmentMinor: patch.minimumAnnualCommitmentMinor ?? prev.minimumAnnualCommitmentMinor,
    whiteLabelRights: patch.whiteLabelRights || prev.whiteLabelRights, discoverRights: patch.discoverRights || prev.discoverRights,
    globalSyndicationRights: patch.globalSyndicationRights ?? prev.globalSyndicationRights,
    /* الحصرية لا تُجدَّد تلقائيًا: تُمنح من جديد صراحةً إن تحقّقت شروطها. */
    exclusivity: patch.exclusivity ?? null,
    walletExpiryPolicy: patch.walletExpiryPolicy || prev.walletExpiryPolicy, creditFacilityMinor: patch.creditFacilityMinor ?? prev.creditFacilityMinor,
    minimumAdvertisedPriceMinor: patch.minimumAdvertisedPriceMinor !== undefined ? patch.minimumAdvertisedPriceMinor : prev.minimumAdvertisedPriceMinor,
  }, prev);
}

/* ————————————————————————————— wallet ————————————————————————————— */

export function findWallet(s: CommercialState, operatorId: string, currency: string) {
  return s.operatorWallets.find(w => w.operatorId === operatorId && w.currency === currency);
}

export function walletFor(ctx: EngineCtx, operatorId: string, currency: string) {
  const c = assertCurrency(currency);
  let w = findWallet(ctx.s, operatorId, c);
  if (!w) {
    const t = iso(ctx.at);
    w = { id: ctx.nextId('WAL'), operatorId, currency: c, balanceMinor: 0, committedMinor: 0, spentMinor: 0, createdAt: t, updatedAt: t };
    ctx.s.operatorWallets.push(w);
    ctx.audit({ action: 'OPERATOR_WALLET_CREATED', entityType: 'operator_wallet', entityId: w.id, reason: `${operatorId} ${c}` });
  }
  return w;
}

const DEBIT_TYPES = new Set<WalletEntryType>(['license_activation', 'license_renewal', 'plan_upgrade']);

export interface WalletEntryInput extends Omit<WalletLedgerEntry, 'id' | 'walletId' | 'balanceAfterMinor' | 'currency' | 'createdAt' | 'createdBy'> {}

/**
 * Appends one immutable ledger entry and updates the cached wallet totals in the same write.
 * The floor is −creditFacility of the active agreement (0 by default: no negative wallet).
 */
export function postWalletEntry(ctx: EngineCtx, currency: string, input: WalletEntryInput): WalletLedgerEntry {
  const wallet = walletFor(ctx, input.operatorId, currency);
  const amount = assertMinor(input.amountMinor, 'amountMinor');
  if (amount === 0) throw new CommercialError('WALLET_AMOUNT_ZERO');
  if (DEBIT_TYPES.has(input.type) && amount > 0) throw new CommercialError('WALLET_DEBIT_MUST_BE_NEGATIVE');
  if (['commitment', 'top_up', 'refund'].includes(input.type) && amount < 0) throw new CommercialError('WALLET_CREDIT_MUST_BE_POSITIVE');
  if (input.type === 'expiration' && amount > 0) throw new CommercialError('WALLET_EXPIRATION_MUST_BE_NEGATIVE');
  const balance = ledgerBalance(ctx.s, wallet.id);
  const after = balance + amount;
  const facility = activeAgreement(ctx.s, input.operatorId, ctx.at)?.creditFacilityMinor ?? 0;
  if (amount < 0 && after < -facility) {
    throw new CommercialError('INSUFFICIENT_WALLET_BALANCE', { requiredMinor: -amount, availableMinor: balance + facility, shortfallMinor: -amount - (balance + facility), currency: wallet.currency });
  }
  const entry: WalletLedgerEntry = {
    ...input, id: ctx.nextId('WLE'), walletId: wallet.id, amountMinor: amount, balanceAfterMinor: after, currency: wallet.currency,
    createdAt: iso(ctx.at), createdBy: ctx.actor.uid,
  };
  ctx.s.walletLedger.push(entry);
  wallet.balanceMinor = after;
  if (input.type === 'commitment') wallet.committedMinor += amount;
  if (DEBIT_TYPES.has(input.type)) wallet.spentMinor += -amount;
  if (input.type === 'refund') wallet.spentMinor -= amount;
  wallet.updatedAt = entry.createdAt;
  ctx.audit({ organizationId: input.organizationId, action: `WALLET_${input.type.toUpperCase()}`, entityType: 'wallet_ledger_entry', entityId: entry.id, reason: `${input.operatorId} ${amount} ${wallet.currency}${input.reason ? ' · ' + clean(input.reason, 160) : ''}` });
  return entry;
}

export function ledgerBalance(s: CommercialState, walletId: string) {
  return s.walletLedger.filter(e => e.walletId === walletId).reduce((n, e) => n + e.amountMinor, 0);
}

/** The ledger is the truth; the cached balance must match it exactly. */
export function verifyWallet(s: CommercialState, walletId: string) {
  const wallet = s.operatorWallets.find(w => w.id === walletId);
  if (!wallet) throw new CommercialError('WALLET_NOT_FOUND');
  const entries = s.walletLedger.filter(e => e.walletId === walletId);
  let running = 0;
  for (const e of entries) {
    running += e.amountMinor;
    if (e.balanceAfterMinor !== running) return { valid: false, walletId, entryId: e.id, code: 'WALLET_RUNNING_BALANCE_MISMATCH' };
  }
  if (running !== wallet.balanceMinor) return { valid: false, walletId, code: 'WALLET_CACHE_MISMATCH', ledgerMinor: running, cachedMinor: wallet.balanceMinor };
  return { valid: true, walletId, balanceMinor: running, entries: entries.length };
}

export function fundCommitment(ctx: EngineCtx, agreementId: string, input: { amountMinor?: number; reference: string }) {
  requireSuper(ctx.actor);
  const a = agreementById(ctx.s, agreementId);
  if (a.status !== 'active') throw new CommercialError('AGREEMENT_NOT_ACTIVE');
  const reference = clean(input.reference, 160);
  if (!reference) throw new CommercialError('PAYMENT_REFERENCE_REQUIRED');
  const existing = ctx.s.walletLedger.find(e => e.agreementId === a.id && e.type === 'commitment' && e.reference === reference);
  if (existing) return existing;
  const amount = assertNonNegativeMinor(input.amountMinor ?? a.minimumAnnualCommitmentMinor, 'amountMinor');
  return postWalletEntry(ctx, a.currency, { operatorId: a.operatorId, agreementId: a.id, type: 'commitment', amountMinor: amount, reference, reason: 'Annual minimum commitment received' });
}

export function topUpWallet(ctx: EngineCtx, operatorId: string, input: { amountMinor: number; currency?: string; reference: string; reason?: string; invoiceId?: string }) {
  /* مالٌ استُلم يُقيَّد دائمًا — حتى لو انتهت الاتفاقية بين إصدار فاتورة الشحن وسدادها. */
  const a = activeAgreement(ctx.s, operatorId, ctx.at)
    || ctx.s.operatorAgreements.filter(x => x.operatorId === operatorId && x.status !== 'draft').sort((x, y) => Date.parse(y.startsAt) - Date.parse(x.startsAt))[0];
  if (!a) throw new CommercialError('AGREEMENT_NOT_ACTIVE');
  const currency = assertCurrency(input.currency || a.currency);
  if (currency !== a.currency) throw new CommercialError('WALLET_CURRENCY_MISMATCH');
  const reference = clean(input.reference, 160);
  if (!reference) throw new CommercialError('PAYMENT_REFERENCE_REQUIRED');
  const existing = ctx.s.walletLedger.find(e => e.operatorId === operatorId && e.type === 'top_up' && e.reference === reference);
  if (existing) return existing;
  const amount = assertNonNegativeMinor(input.amountMinor, 'amountMinor');
  if (!amount) throw new CommercialError('WALLET_AMOUNT_ZERO');
  return postWalletEntry(ctx, currency, { operatorId, agreementId: a.id, type: 'top_up', amountMinor: amount, reference, invoiceId: input.invoiceId, reason: clean(input.reason, 300) || 'Wallet top-up' });
}

export function adminAdjustWallet(ctx: EngineCtx, operatorId: string, input: { amountMinor: number; currency: string; reason: string }) {
  requireSuper(ctx.actor);
  if (clean(input.reason).length < 5) throw new CommercialError('REASON_REQUIRED');
  if (!ctx.s.operators.some(x => x.id === operatorId)) throw new CommercialError('OPERATOR_NOT_FOUND');
  return postWalletEntry(ctx, input.currency, { operatorId, agreementId: activeAgreement(ctx.s, operatorId, ctx.at)?.id, type: 'admin_adjustment', amountMinor: assertMinor(input.amountMinor), reason: clean(input.reason, 300) });
}

/** Refund = compensating credit against one debit entry. The debit itself is never edited. */
export function refundWalletEntry(ctx: EngineCtx, entryId: string, input: { amountMinor?: number; reason: string }) {
  requireSuper(ctx.actor);
  if (clean(input.reason).length < 5) throw new CommercialError('REASON_REQUIRED');
  const debit = ctx.s.walletLedger.find(e => e.id === entryId);
  if (!debit || !DEBIT_TYPES.has(debit.type)) throw new CommercialError('REFUNDABLE_ENTRY_NOT_FOUND');
  const refunded = ctx.s.walletLedger.filter(e => e.reversesEntryId === debit.id && e.type === 'refund').reduce((n, e) => n + e.amountMinor, 0);
  const remaining = -debit.amountMinor - refunded;
  const amount = assertNonNegativeMinor(input.amountMinor ?? remaining, 'amountMinor');
  if (!amount || amount > remaining) throw new CommercialError('REFUND_EXCEEDS_DEBIT', { remainingMinor: remaining });
  return postWalletEntry(ctx, debit.currency, {
    operatorId: debit.operatorId, agreementId: debit.agreementId, type: 'refund', amountMinor: amount, reversesEntryId: debit.id,
    organizationId: debit.organizationId, subscriptionId: debit.subscriptionId, subscriptionTermId: debit.subscriptionTermId, planId: debit.planId,
    reason: clean(input.reason, 300),
  });
}

/**
 * Agreement ends → its unused commitment balance expires (policy `expire_at_agreement_end`),
 * as an explicit `expiration` entry. Nothing is deleted. `carry_over` keeps the balance.
 */
export function expireEndedAgreements(ctx: EngineCtx) {
  const out: { agreementId: string; expiredMinor: number }[] = [];
  for (const a of ctx.s.operatorAgreements) {
    if (a.status !== 'active' || Date.parse(a.endsAt) > ctx.at) continue;
    a.status = 'expired';
    a.expiredAt = iso(ctx.at);
    ctx.audit({ action: 'OPERATOR_AGREEMENT_EXPIRED', entityType: 'operator_agreement', entityId: a.id, reason: a.operatorId });
    const wallet = findWallet(ctx.s, a.operatorId, a.currency);
    if (!wallet || a.walletExpiryPolicy === 'carry_over') continue;
    if (ctx.s.walletLedger.some(e => e.type === 'expiration' && e.agreementId === a.id)) continue;
    const balance = ledgerBalance(ctx.s, wallet.id);
    if (balance <= 0) continue;
    postWalletEntry(ctx, a.currency, { operatorId: a.operatorId, agreementId: a.id, type: 'expiration', amountMinor: -balance, reason: `Commitment period ${a.startsAt.slice(0, 10)}→${a.endsAt.slice(0, 10)} ended` });
    out.push({ agreementId: a.id, expiredMinor: balance });
  }
  return out;
}

/* ————————————————————————————— wholesale pricing ————————————————————————————— */

export interface WholesaleQuote {
  operatorId: string;
  agreementId: string;
  planId: string;
  planVersionId?: string;
  currency: string;
  publicPriceMinor: number;
  discountBps: number;
  wholesalePriceMinor: number;
  participantAllowance: number;
  activeCompetitionAllowance: number;
}

/** The only place wholesale price is computed: public list price at `at` × (1 − discount). */
export function wholesaleQuote(s: CommercialState, operatorId: string, planId: string, at: number): WholesaleQuote {
  const agreement = activeAgreement(s, operatorId, at);
  if (!agreement) throw new CommercialError('AGREEMENT_NOT_ACTIVE');
  const plan = planById(s, planId);
  if (plan.catalog !== 'mizan' || !plan.active) throw new CommercialError('PLAN_NOT_IN_WHOLESALE_CATALOG');
  if (plan.custom) throw new CommercialError('CUSTOM_PLAN_REQUIRES_CONTRACT');
  const price = planPriceAt(s, planId, at);
  /* لا تحويل عملات ضمنيًا: رصيدٌ بالدولار لا يشتري باقةً مسعّرة بعملةٍ أخرى. */
  if (price.currency !== agreement.currency) throw new CommercialError('WALLET_CURRENCY_MISMATCH', { planCurrency: price.currency, walletCurrency: agreement.currency });
  return {
    operatorId, agreementId: agreement.id, planId, planVersionId: price.planVersionId, currency: price.currency,
    publicPriceMinor: price.publicPriceMinor, discountBps: agreement.discountBps,
    wholesalePriceMinor: applyDiscountBps(price.publicPriceMinor, agreement.discountBps),
    participantAllowance: price.participantAllowance, activeCompetitionAllowance: price.activeCompetitionAllowance,
  };
}

/** Upgrade proration policies. Isolated so the policy can change without touching callers. */
export const UPGRADE_PRORATION: Record<CommercialPolicy['upgradeProration'], (current: number, target: number) => number> = {
  full_difference: (current, target) => Math.max(0, target - current),
  none: () => 0,
};

export function wholesaleCatalog(s: CommercialState, operatorId: string, at: number) {
  const agreement = activeAgreement(s, operatorId, at);
  return catalogView(s, at).filter(p => p.active).map(p => {
    let wholesalePriceMinor: number | undefined;
    if (agreement && !p.custom && p.currency === agreement.currency) wholesalePriceMinor = applyDiscountBps(p.publicPriceMinor, agreement.discountBps);
    const resale = s.resalePrices.find(r => r.operatorId === operatorId && r.planId === p.id && r.market === 'default');
    const map = agreement?.minimumAdvertisedPriceMinor?.[p.id];
    return { ...p, discountBps: agreement?.discountBps, wholesalePriceMinor, resalePriceMinor: resale?.resalePriceMinor, resaleCurrency: resale?.currency, minimumAdvertisedPriceMinor: map };
  });
}

export function setResalePrice(ctx: EngineCtx, input: { planId: string; market?: string; currency: string; resalePriceMinor: number | null }) {
  const operatorId = requireOperator(ctx.actor);
  planById(ctx.s, input.planId);
  const market = clean(input.market || 'default', 40) || 'default';
  const index = ctx.s.resalePrices.findIndex(r => r.operatorId === operatorId && r.planId === input.planId && r.market === market);
  if (input.resalePriceMinor === null) {
    if (index >= 0) ctx.s.resalePrices.splice(index, 1);
    return null;
  }
  const amount = assertNonNegativeMinor(input.resalePriceMinor, 'resalePriceMinor');
  const currency = assertCurrency(input.currency);
  const agreement = activeAgreement(ctx.s, operatorId, ctx.at);
  /* سياسة السعر الإعلاني الأدنى غير معتمدة بعد: لا تُفرض إلا إن فعّلها مسؤول المنصّة. */
  const map = agreement?.minimumAdvertisedPriceMinor?.[input.planId];
  if (policyOf(ctx.s).mapEnforcement && map !== undefined && currency === agreement?.currency && amount < map) {
    throw new CommercialError('RESALE_BELOW_MINIMUM_ADVERTISED_PRICE', { minimumAdvertisedPriceMinor: map });
  }
  const record: OperatorResalePriceRecord = { id: index >= 0 ? ctx.s.resalePrices[index].id : ctx.nextId('RSP'), operatorId, planId: input.planId, market, currency, resalePriceMinor: amount, updatedAt: iso(ctx.at), updatedBy: ctx.actor.uid };
  if (index >= 0) ctx.s.resalePrices[index] = record; else ctx.s.resalePrices.push(record);
  return record;
}

/* ————————————————————————————— upgrades, downgrades, overrides ————————————————————————————— */

function applyTermPlanChange(ctx: EngineCtx, term: SubscriptionTermRecord, planId: string, kind: TermChange['kind'], extra: Partial<TermChange> = {}) {
  const license = licenseOf(ctx.s, term.organizationId);
  const price = planPriceAt(ctx.s, planId, ctx.at);
  const allowance = effectiveAllowance(price, license);
  const change: TermChange = {
    at: iso(ctx.at), by: ctx.actor.uid, kind,
    from: { planId: term.planId, participantAllowance: term.participantAllowance, activeCompetitionAllowance: term.activeCompetitionAllowance },
    to: { planId, participantAllowance: allowance.participantAllowance, activeCompetitionAllowance: allowance.activeCompetitionAllowance },
    ...extra,
  };
  term.changes.push(change);
  term.planId = planId;
  term.planVersionId = price.planVersionId;
  term.participantAllowance = allowance.participantAllowance;
  term.activeCompetitionAllowance = allowance.activeCompetitionAllowance;
  license.planId = planId;
  license.updatedAt = iso(ctx.at);
  const sub = ctx.s.subscriptions.find(x => x.subjectType === 'organization' && x.subjectId === term.organizationId && x.status !== 'canceled');
  if (sub) { sub.planId = planId; sub.updatedAt = iso(ctx.at); }
  return change;
}

export function assertUpgradeTarget(s: CommercialState, term: SubscriptionTermRecord, targetPlanId: string, at: number) {
  const target = planPriceAt(s, targetPlanId, at);
  const plan = planById(s, targetPlanId);
  if (!plan.active) throw new CommercialError('PLAN_NOT_FOUND');
  if (targetPlanId === term.planId) throw new CommercialError('PLAN_UNCHANGED');
  if (target.participantAllowance < term.participantAllowance && target.activeCompetitionAllowance <= term.activeCompetitionAllowance) {
    throw new CommercialError('DOWNGRADE_MUST_BE_SCHEDULED');
  }
  return target;
}

/** Operator-managed upgrade within the current term: debit the wholesale difference. */
export function operatorUpgradePlan(ctx: EngineCtx, organizationId: string, targetPlanId: string) {
  const operatorId = requireOperator(ctx.actor);
  const org = organizationOf(ctx.s, organizationId);
  if (org.operatorId !== operatorId || commercialOwnerOf(org) !== 'operator') throw new CommercialError('CROSS_OPERATOR_ACCESS_BLOCKED');
  const term = currentTerm(ctx.s, organizationId, ctx.at);
  if (!term) throw new CommercialError('SUBSCRIPTION_TERM_NOT_FOUND');
  assertUpgradeTarget(ctx.s, term, targetPlanId, ctx.at);
  const quote = wholesaleQuote(ctx.s, operatorId, targetPlanId, ctx.at);
  const paidSoFar = term.wholesalePriceMinor ?? 0;
  const debit = UPGRADE_PRORATION[policyOf(ctx.s).upgradeProration](paidSoFar, quote.wholesalePriceMinor);
  let entry: WalletLedgerEntry | undefined;
  if (debit > 0) {
    entry = postWalletEntry(ctx, quote.currency, {
      operatorId, agreementId: quote.agreementId, type: 'plan_upgrade', amountMinor: -debit, organizationId, subscriptionId: term.subscriptionId,
      subscriptionTermId: term.id, planId: targetPlanId, planVersionId: quote.planVersionId, publicPriceMinor: quote.publicPriceMinor, discountBps: quote.discountBps,
      reason: `Upgrade ${term.planId} → ${targetPlanId}`,
    });
  }
  const change = applyTermPlanChange(ctx, term, targetPlanId, 'plan_upgrade', { walletEntryId: entry?.id });
  term.wholesalePriceMinor = paidSoFar + debit;
  ctx.audit({ tenantId: org.tenantId, organizationId, action: 'PLAN_UPGRADED', entityType: 'subscription_term', entityId: term.id, reason: `${change.from.planId}→${change.to.planId} debit ${debit} ${quote.currency}` });
  return { term, debitMinor: debit, currency: quote.currency, walletEntry: entry };
}

/** Direct upgrade price: the public-price difference for the current term. */
export function directUpgradeQuote(s: CommercialState, organizationId: string, targetPlanId: string, at: number) {
  const term = currentTerm(s, organizationId, at);
  if (!term) throw new CommercialError('SUBSCRIPTION_TERM_NOT_FOUND');
  const target = assertUpgradeTarget(s, term, targetPlanId, at);
  if (target.currency !== term.currency) throw new CommercialError('PLAN_CURRENCY_MISMATCH');
  const paid = term.contractPriceMinor ?? term.publicPriceMinor;
  const amountMinor = UPGRADE_PRORATION[policyOf(s).upgradeProration](paid, target.publicPriceMinor);
  return { term, target, amountMinor, currency: term.currency };
}

export function applyDirectUpgrade(ctx: EngineCtx, organizationId: string, targetPlanId: string, invoiceId?: string) {
  const term = currentTerm(ctx.s, organizationId, ctx.at);
  if (!term) throw new CommercialError('SUBSCRIPTION_TERM_NOT_FOUND');
  if (invoiceId && term.changes.some(c => c.invoiceId === invoiceId)) return term;
  assertUpgradeTarget(ctx.s, term, targetPlanId, ctx.at);
  const change = applyTermPlanChange(ctx, term, targetPlanId, 'plan_upgrade', { invoiceId });
  const org = organizationOf(ctx.s, organizationId);
  ctx.audit({ tenantId: org.tenantId, organizationId, action: 'PLAN_UPGRADED', entityType: 'subscription_term', entityId: term.id, reason: `${change.from.planId}→${change.to.planId}${invoiceId ? ' invoice ' + invoiceId : ''}` });
  return term;
}

/** Downgrades never shrink an active term: they are scheduled for the next renewal. */
export function scheduleDowngrade(ctx: EngineCtx, organizationId: string, targetPlanId: string | null) {
  const s = ctx.s;
  const org = organizationOf(s, organizationId);
  const sub = s.subscriptions.find(x => x.subjectType === 'organization' && x.subjectId === organizationId && x.status !== 'canceled');
  if (!sub) throw new CommercialError('SUBSCRIPTION_NOT_FOUND');
  if (targetPlanId === null) {
    delete sub.pendingPlanId; delete sub.pendingPlanRequestedAt;
    ctx.audit({ tenantId: org.tenantId, organizationId, action: 'SCHEDULED_PLAN_CHANGE_CANCELLED', entityType: 'subscription', entityId: sub.id });
    return { scheduled: false };
  }
  const target = planPriceAt(s, targetPlanId, ctx.at);
  if (!planById(s, targetPlanId).active) throw new CommercialError('PLAN_NOT_FOUND');
  const license = licenseOf(s, organizationId);
  const effective = effectiveAllowance(target, license);
  const active = activeCompetitionStates();
  const activeNow = s.competitions.filter(x => x.organizationId === organizationId && active.has(x.state)).length;
  sub.pendingPlanId = targetPlanId;
  sub.pendingPlanRequestedAt = iso(ctx.at);
  sub.updatedAt = iso(ctx.at);
  ctx.audit({ tenantId: org.tenantId, organizationId, action: 'PLAN_DOWNGRADE_SCHEDULED', entityType: 'subscription', entityId: sub.id, reason: targetPlanId });
  return {
    scheduled: true, effectiveAt: currentTerm(s, organizationId, ctx.at)?.endsAt,
    validation: {
      activeCompetitions: activeNow, newActiveCompetitionAllowance: effective.activeCompetitionAllowance,
      exceedsActiveLimit: activeNow > effective.activeCompetitionAllowance,
      /* لا تُحذف مسابقة لتتوافق الجهة مع الباقة الأصغر: يُنبَّه المسؤول فقط. */
      message: activeNow > effective.activeCompetitionAllowance ? 'CLOSE_OR_COMPLETE_COMPETITIONS_BEFORE_RENEWAL' : undefined,
    },
  };
}

export function setContractOverride(ctx: EngineCtx, organizationId: string, input: { participantAllowance?: number | null; activeCompetitionAllowance?: number | null; storageBytes?: number | null; reason: string }) {
  requireSuper(ctx.actor);
  if (clean(input.reason).length < 5) throw new CommercialError('REASON_REQUIRED');
  const org = organizationOf(ctx.s, organizationId);
  const license = licenseOf(ctx.s, organizationId);
  const overrides = { ...(license.overrides || {}) };
  const apply = (key: 'annualParticipants' | 'activeCompetitions' | 'storageBytes', v: number | null | undefined) => {
    if (v === undefined) return;
    if (v === null) delete overrides[key]; else overrides[key] = assertNonNegativeMinor(v, key);
  };
  apply('annualParticipants', input.participantAllowance);
  apply('activeCompetitions', input.activeCompetitionAllowance);
  apply('storageBytes', input.storageBytes);
  license.overrides = overrides;
  license.updatedAt = iso(ctx.at);
  const term = currentTerm(ctx.s, organizationId, ctx.at);
  if (term) applyTermPlanChange(ctx, term, term.planId, 'contract_override', { reason: clean(input.reason, 300) });
  ctx.audit({ tenantId: org.tenantId, organizationId, action: 'QUOTA_OVERRIDE_SET', entityType: 'license', entityId: license.id, reason: `${clean(input.reason, 200)} · ${JSON.stringify(overrides)}` });
  return { license, term };
}

/* ————————————————————————————— commercial ownership ————————————————————————————— */

/** Admin-governed channel transfer (operator ↔ direct). Never self-service. */
export function transferCommercialOwner(ctx: EngineCtx, organizationId: string, input: { toOperatorId?: string | null; effectiveAt?: string; reason: string; subscriptionTreatment?: OwnershipEvent['subscriptionTreatment'] }) {
  requireSuper(ctx.actor);
  if (clean(input.reason).length < 5) throw new CommercialError('REASON_REQUIRED');
  const org = organizationOf(ctx.s, organizationId);
  const toOperatorId = input.toOperatorId || undefined;
  if (toOperatorId) {
    if (!ctx.s.operators.some(x => x.id === toOperatorId && x.status === 'active')) throw new CommercialError('OPERATOR_NOT_ACTIVE');
    if (!activeAgreement(ctx.s, toOperatorId, ctx.at)) throw new CommercialError('AGREEMENT_NOT_ACTIVE');
  }
  const from = { owner: commercialOwnerOf(org), operatorId: org.operatorId };
  const to = { owner: (toOperatorId ? 'operator' : 'direct') as CommercialOwner, operatorId: toOperatorId };
  if (from.owner === to.owner && from.operatorId === to.operatorId) throw new CommercialError('OWNER_UNCHANGED');
  const treatment = input.subscriptionTreatment === 'close_current_term' ? 'close_current_term' : 'keep_current_term';
  const event: OwnershipEvent = {
    id: ctx.nextId('OWN'), organizationId, from, to, effectiveAt: normalizeInstant(input.effectiveAt || iso(ctx.at)), reason: clean(input.reason, 500),
    subscriptionTreatment: treatment, actorId: ctx.actor.uid, createdAt: iso(ctx.at),
  };
  ctx.s.ownershipEvents.push(event);
  org.operatorId = toOperatorId;
  org.commercialOwner = to.owner;
  org.updatedAt = iso(ctx.at);
  for (const sub of ctx.s.subscriptions) {
    if (sub.subjectType !== 'organization' || sub.subjectId !== organizationId || sub.status === 'canceled') continue;
    sub.ownerOperatorId = toOperatorId;
    sub.provider = toOperatorId ? 'operator_wallet' : 'manual';
    sub.updatedAt = iso(ctx.at);
  }
  if (treatment === 'close_current_term') {
    const term = currentTerm(ctx.s, organizationId, ctx.at);
    if (term) { term.endsAt = iso(Math.max(ctx.at, Date.parse(term.startsAt) + 1)); term.status = 'closed'; term.closedAt = iso(ctx.at); }
  }
  ctx.audit({ tenantId: org.tenantId, organizationId, action: 'COMMERCIAL_OWNER_TRANSFERRED', entityType: 'organization', entityId: organizationId, reason: `${from.owner}:${from.operatorId || '-'} → ${to.owner}:${to.operatorId || '-'} · ${event.reason}` });
  return event;
}

/** Channel-conflict guard: MIZAN direct must not license an operator-managed organization unknowingly. */
export function assertDirectChannel(s: CommercialState, organizationId: string, allowOverrideReason?: string) {
  const org = organizationOf(s, organizationId);
  if (commercialOwnerOf(org) === 'operator' && clean(allowOverrideReason).length < 5) {
    throw new CommercialError('ORGANIZATION_MANAGED_BY_OPERATOR', { operatorId: org.operatorId });
  }
}

/* ————————————————————————————— organization activation & renewal ————————————————————————————— */

export interface OrganizationIdentityInput {
  officialName: string; shortName: string; organizationType: string; country: string;
  legalEmail?: string; legalPhone?: string; website?: string; legalRegistration?: string; primaryContact?: string;
}

/** Shared by direct creation and operator activation, so there is one organization shape. */
export function buildOrganizationRecords(ctx: EngineCtx, input: OrganizationIdentityInput, opts: { operatorId?: string; planId: string; startsAt: string; expiresAt: string; commercialOwner: CommercialOwner }) {
  if (!clean(input.officialName) || !clean(input.shortName) || !clean(input.country)) throw new CommercialError('ORGANIZATION_IDENTITY_REQUIRED');
  const startsAt = normalizeInstant(opts.startsAt), expiresAt = normalizeInstant(opts.expiresAt);
  if (Date.parse(expiresAt) <= Date.parse(startsAt)) throw new CommercialError('LICENSE_DATES_INVALID');
  const orgId = ctx.nextId('MZ-ORG'), tenantId = ctx.nextId('MZ-TEN'), licenseId = ctx.nextId('MZ-LIC'), t = iso(ctx.at);
  const org: OrganizationRecord = {
    id: orgId, tenantId, licenseId, officialName: clean(input.officialName, 180), shortName: clean(input.shortName, 80),
    organizationType: clean(input.organizationType, 80), country: clean(input.country, 2).toUpperCase(),
    legalEmail: clean(input.legalEmail, 180) || undefined, legalPhone: clean(input.legalPhone, 40) || undefined,
    website: clean(input.website, 240) || undefined, legalRegistration: clean(input.legalRegistration, 100) || undefined,
    primaryContact: clean(input.primaryContact, 120) || undefined, operatorId: opts.operatorId, commercialOwner: opts.commercialOwner,
    status: 'active', operational: {}, createdAt: t, updatedAt: t,
  };
  const license: LicenseRecord = {
    id: licenseId, organizationId: orgId, planId: opts.planId, startsAt, expiresAt, status: 'active',
    whiteLabelEnabled: false, brandingLevel: 'mizan', customDomainEnabled: false, createdAt: t, updatedAt: t,
  };
  ctx.s.organizations.push(org);
  ctx.s.licenses.push(license);
  return { org, license };
}

/**
 * Operator activates a customer on a MIZAN plan, paid from the wallet at wholesale:
 * quote → balance check → organization + licence + subscription + first term → debit → audit.
 * One state write; a refusal anywhere leaves nothing behind (no partial licence, no debit).
 */
export function operatorActivateOrganization(ctx: EngineCtx, input: OrganizationIdentityInput & { planId: string; startsAt?: string }) {
  const operatorId = requireOperator(ctx.actor);
  const op = ctx.s.operators.find(x => x.id === operatorId && x.status === 'active');
  if (!op) throw new CommercialError('OPERATOR_NOT_ACTIVE');
  const quote = wholesaleQuote(ctx.s, operatorId, input.planId, ctx.at);
  const wallet = findWallet(ctx.s, operatorId, quote.currency);
  const balance = wallet ? ledgerBalance(ctx.s, wallet.id) : 0;
  const facility = activeAgreement(ctx.s, operatorId, ctx.at)?.creditFacilityMinor ?? 0;
  if (balance + facility < quote.wholesalePriceMinor) {
    throw new CommercialError('INSUFFICIENT_WALLET_BALANCE', { requiredMinor: quote.wholesalePriceMinor, availableMinor: balance + facility, shortfallMinor: quote.wholesalePriceMinor - balance - facility, currency: quote.currency });
  }
  const startsAt = input.startsAt ? normalizeInstant(input.startsAt) : iso(ctx.at);
  if (Date.parse(startsAt) < ctx.at - 86_400_000) throw new CommercialError('BACKDATED_ACTIVATION_NOT_ALLOWED');
  const endsAt = addUtcMonthsClamped(startsAt, policyOf(ctx.s).termMonths);
  const { org, license } = buildOrganizationRecords(ctx, input, { operatorId, planId: input.planId, startsAt, expiresAt: endsAt, commercialOwner: 'operator' });
  const t = iso(ctx.at);
  const sub: SubscriptionRecord = {
    id: ctx.nextId('SUB'), subjectType: 'organization', subjectId: org.id, ownerOperatorId: operatorId, planId: input.planId, status: 'active',
    currency: quote.currency, amountMinor: quote.wholesalePriceMinor, billingPeriod: 'annual', currentPeriodStart: startsAt, currentPeriodEnd: endsAt,
    autoRenew: true, provider: 'operator_wallet', createdAt: t, updatedAt: t,
  };
  ctx.s.subscriptions.push(sub);
  const term = createInitialTerm(ctx, org, license, {
    subscription: sub,
    operator: { operatorId, agreementId: quote.agreementId, discountBps: quote.discountBps, wholesalePriceMinor: quote.wholesalePriceMinor },
  });
  const entry = postWalletEntry(ctx, quote.currency, {
    operatorId, agreementId: quote.agreementId, type: 'license_activation', amountMinor: -quote.wholesalePriceMinor,
    organizationId: org.id, subscriptionId: sub.id, subscriptionTermId: term.id, planId: quote.planId, planVersionId: quote.planVersionId,
    publicPriceMinor: quote.publicPriceMinor, discountBps: quote.discountBps, reason: `Activate ${org.shortName} on ${quote.planId}`,
  });
  term.walletEntryId = entry.id;
  ctx.audit({ tenantId: org.tenantId, organizationId: org.id, action: 'OPERATOR_ORGANIZATION_ACTIVATED', entityType: 'organization', entityId: org.id, reason: `${operatorId} ${quote.planId} wholesale ${quote.wholesalePriceMinor} ${quote.currency}` });
  return { organization: org, license, subscription: sub, term, walletEntry: entry, quote };
}

export const RENEWAL_WINDOW_DAYS = 60;

/**
 * Operator renewal of a customer: debit the current wholesale price, open the next term.
 * `auto` is the billing cycle acting for the operator; an unaffordable auto renewal marks the
 * subscription past-due (the organization follows grace → read-only), it never deletes data.
 */
export function operatorRenewOrganization(ctx: EngineCtx, organizationId: string, opts: { auto?: boolean } = {}) {
  const org = organizationOf(ctx.s, organizationId);
  const operatorId = opts.auto ? org.operatorId : requireOperator(ctx.actor);
  if (!operatorId || org.operatorId !== operatorId || commercialOwnerOf(org) !== 'operator') throw new CommercialError('CROSS_OPERATOR_ACCESS_BLOCKED');
  const previous = latestTerm(ctx.s, organizationId);
  if (!previous) throw new CommercialError('SUBSCRIPTION_TERM_NOT_FOUND');
  if (Date.parse(previous.endsAt) - ctx.at > RENEWAL_WINDOW_DAYS * 86_400_000) throw new CommercialError('RENEWAL_TOO_EARLY', { renewableFrom: iso(Date.parse(previous.endsAt) - RENEWAL_WINDOW_DAYS * 86_400_000) });
  const existing = ctx.s.subscriptionTerms.find(t => t.renewedFromTermId === previous.id);
  if (existing) return { term: existing, alreadyRenewed: true as const };
  const sub = ctx.s.subscriptions.find(x => x.subjectType === 'organization' && x.subjectId === organizationId && x.status !== 'canceled');
  const planId = sub?.pendingPlanId || licenseOf(ctx.s, organizationId).planId;
  const quote = wholesaleQuote(ctx.s, operatorId, planId, ctx.at);
  const wallet = findWallet(ctx.s, operatorId, quote.currency);
  const balance = wallet ? ledgerBalance(ctx.s, wallet.id) : 0;
  const facility = activeAgreement(ctx.s, operatorId, ctx.at)?.creditFacilityMinor ?? 0;
  if (balance + facility < quote.wholesalePriceMinor) {
    const details = { requiredMinor: quote.wholesalePriceMinor, availableMinor: balance + facility, shortfallMinor: quote.wholesalePriceMinor - balance - facility, currency: quote.currency };
    if (opts.auto) {
      if (sub && sub.status !== 'past_due') {
        sub.status = 'past_due'; sub.updatedAt = iso(ctx.at);
        ctx.audit({ tenantId: org.tenantId, organizationId, action: 'OPERATOR_RENEWAL_PENDING_BALANCE', entityType: 'subscription', entityId: sub.id, reason: JSON.stringify(details) });
      }
      return { pending: true as const, details };
    }
    throw new CommercialError('INSUFFICIENT_WALLET_BALANCE', details);
  }
  const { term } = renewTerm(ctx, organizationId, { operator: { operatorId, agreementId: quote.agreementId, discountBps: quote.discountBps, wholesalePriceMinor: quote.wholesalePriceMinor } });
  const entry = postWalletEntry(ctx, quote.currency, {
    operatorId, agreementId: quote.agreementId, type: 'license_renewal', amountMinor: -quote.wholesalePriceMinor, organizationId,
    subscriptionId: sub?.id, subscriptionTermId: term.id, planId: quote.planId, planVersionId: quote.planVersionId,
    publicPriceMinor: quote.publicPriceMinor, discountBps: quote.discountBps, reason: `Renew ${org.shortName} term #${term.termIndex}`,
  });
  term.walletEntryId = entry.id;
  if (sub) sub.amountMinor = quote.wholesalePriceMinor;
  return { term, walletEntry: entry, quote, alreadyRenewed: false as const };
}

/* ————————————————————————————— reports ————————————————————————————— */

const sumBy = <T>(rows: T[], key: (r: T) => string, value: (r: T) => number) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) || 0) + value(r));
  return [...m.entries()].map(([currency, amountMinor]) => ({ currency, amountMinor }));
};

export function platformCommercialReport(s: CommercialState, at: number) {
  const current = s.organizations.map(o => ({ org: o, term: currentTerm(s, o.id, at) })).filter(x => x.term);
  const direct = current.filter(x => commercialOwnerOf(x.org) === 'direct');
  const since = at - 365 * 86_400_000;
  const debits = s.walletLedger.filter(e => DEBIT_TYPES.has(e.type) && Date.parse(e.createdAt) >= since);
  const refunds = s.walletLedger.filter(e => e.type === 'refund' && Date.parse(e.createdAt) >= since);
  const planDistribution = new Map<string, number>();
  for (const x of current) planDistribution.set(x.term!.planId, (planDistribution.get(x.term!.planId) || 0) + 1);
  const renewals = s.subscriptionTerms.filter(t => t.source === 'renewal' && Date.parse(t.createdAt) >= since);
  const upcoming = current.filter(x => Date.parse(x.term!.endsAt) - at <= 60 * 86_400_000);
  return {
    asOf: iso(at),
    /* مجموعٌ «على نمط الإيراد السنوي المتكرّر» من الدورات الحالية للعملاء المباشرين — ليس قيدًا محاسبيًّا. */
    directAnnualRecurring: sumBy(direct, x => x.term!.currency, x => x.term!.contractPriceMinor ?? x.term!.publicPriceMinor),
    operatorWholesaleSales12m: sumBy(debits, e => e.currency, e => -e.amountMinor),
    operatorRefunds12m: sumBy(refunds, e => e.currency, e => e.amountMinor),
    walletCommitments12m: sumBy(s.walletLedger.filter(e => e.type === 'commitment' && Date.parse(e.createdAt) >= since), e => e.currency, e => e.amountMinor),
    walletBalances: sumBy(s.operatorWallets, w => w.currency, w => w.balanceMinor),
    renewals12m: renewals.length,
    activeOrganizations: current.length,
    directOrganizations: direct.length,
    operatorOrganizations: current.length - direct.length,
    upcomingRenewals60d: upcoming.length,
    planDistribution: [...planDistribution.entries()].map(([planId, count]) => ({ planId, planName: s.plans.find(p => p.id === planId)?.name || planId, count })),
    accessStates: s.organizations.reduce((m, o) => { const st = s.licenses.some(l => l.organizationId === o.id) ? accessState(s, o.id, at) : 'suspended'; m[st] = (m[st] || 0) + 1; return m; }, {} as Record<string, number>),
  };
}

export function operatorCommercialView(s: CommercialState, operatorId: string, at: number) {
  const agreement = activeAgreement(s, operatorId, at);
  const agreements = s.operatorAgreements.filter(a => a.operatorId === operatorId).sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  const wallets = s.operatorWallets.filter(w => w.operatorId === operatorId);
  const orgs = s.organizations.filter(o => o.operatorId === operatorId && commercialOwnerOf(o) === 'operator');
  const customers = orgs.map(o => {
    const term = currentTerm(s, o.id, at);
    const latest = term || latestTerm(s, o.id);
    const plan = latest ? s.plans.find(p => p.id === latest.planId) : undefined;
    const brand = s.brandProfiles.find(b => b.ownerType === 'organization' && b.ownerId === o.id);
    const domain = s.customDomains.find(d => d.ownerType === 'organization' && d.ownerId === o.id && d.status === 'active');
    return {
      organizationId: o.id, officialName: o.officialName, shortName: o.shortName, status: o.status,
      accessState: s.licenses.some(l => l.organizationId === o.id) ? accessState(s, o.id, at) : 'suspended',
      planId: latest?.planId, planName: plan?.name, term: latest ? { id: latest.id, startsAt: latest.startsAt, endsAt: latest.endsAt, termIndex: latest.termIndex } : undefined,
      participantsUsed: latest ? participantsUsedInTerm(s, latest) : 0, participantAllowance: latest?.participantAllowance ?? 0,
      renewalDate: latest?.endsAt, walletCostMinor: latest?.wholesalePriceMinor, currency: latest?.currency,
      branding: brand?.brandingMode || 'inherit', domain: domain?.hostname,
    };
  });
  const soon = at + 60 * 86_400_000;
  const wallet = agreement ? findWallet(s, operatorId, agreement.currency) : wallets[0];
  const spentThisAgreement = agreement && wallet ? s.walletLedger.filter(e => e.walletId === wallet.id && e.agreementId === agreement.id && DEBIT_TYPES.has(e.type)).reduce((n, e) => n - e.amountMinor, 0) : 0;
  return {
    agreement, agreements,
    tier: agreement ? s.operatorTiers.find(t => t.id === agreement.tierId) : undefined,
    wallet, wallets,
    summary: {
      balanceMinor: wallet?.balanceMinor ?? 0,
      currency: wallet?.currency || agreement?.currency || 'USD',
      annualCommitmentMinor: agreement?.minimumAnnualCommitmentMinor ?? 0,
      spentThisAgreementMinor: spentThisAgreement,
      commitmentRemainingMinor: Math.max(0, (agreement?.minimumAnnualCommitmentMinor ?? 0) - spentThisAgreement),
      discountBps: agreement?.discountBps,
      customerOrganizations: customers.length,
      activeCustomerSubscriptions: customers.filter(c => c.accessState === 'active').length,
      upcomingRenewals: customers.filter(c => c.renewalDate && Date.parse(c.renewalDate) <= soon && Date.parse(c.renewalDate) > at).length,
      pendingRenewals: customers.filter(c => c.accessState === 'grace' || c.accessState === 'read_only').length,
      suspendedCustomers: customers.filter(c => c.accessState === 'suspended').length,
    },
    customers,
    ledger: wallet ? s.walletLedger.filter(e => e.operatorId === operatorId).slice(-500).reverse() : [],
    pricing: wholesaleCatalog(s, operatorId, at),
    legacyCreditBalance: s.creditLedger.filter(x => x.operatorId === operatorId).reduce((n, x) => n + x.quantity, 0),
  };
}

export { iso as isoAt, wholeDaysBetween };
