/*
 * أنواع الطبقة التجارية الجديدة لميزان.
 *
 * المبادئ الحاكمة (MIZAN_COMMERCIAL_MODEL.md):
 *  - المنتج كامل في كل باقة؛ تختلف الباقات بالحجم لا بحرمان الخصائص.
 *  - حصة المتسابقين لكل دورة اشتراك (SubscriptionTerm)، لا للسنة الميلادية.
 *  - حدّ المسابقات = المسابقات النشطة في الوقت نفسه، لا عددها في السنة.
 *  - التجديد يصفّر الاستعمال بدورة جديدة، ولا يمسّ البيانات التاريخية.
 *  - المشغّل موزّع بسعر الجملة من رصيدٍ مالي (Wallet) بسجلٍّ غير قابل للتعديل؛ لا نسبة من مبيعاته.
 *  - المال أعداد صحيحة بالوحدة الصغرى، والخصم بنقاط الأساس.
 */

export type UsageMetric = 'unique_participant' | 'competition_entry';
export type CommercialOwner = 'direct' | 'operator';

/** A dated public list price and allowance for a plan. History is never rewritten. */
export interface PlanVersionRecord {
  id: string;
  planId: string;
  version: number;
  currency: string;
  publicPriceMinor: number;
  participantAllowance: number;
  activeCompetitionAllowance: number;
  effectiveFrom: string;
  effectiveTo?: string;
  createdAt: string;
  createdBy: string;
  note?: string;
}

export interface TermChange {
  at: string;
  by: string;
  kind: 'plan_upgrade' | 'contract_override' | 'correction';
  from: { planId: string; participantAllowance: number; activeCompetitionAllowance: number };
  to: { planId: string; participantAllowance: number; activeCompetitionAllowance: number };
  reason?: string;
  invoiceId?: string;
  walletEntryId?: string;
}

/**
 * One entitlement period of a subscription. `[startsAt, endsAt)` in UTC.
 * Every participant-usage row belongs to exactly one term; renewal creates a new term
 * instead of rewriting an old one, so usage resets while history stays exact.
 */
export interface SubscriptionTermRecord {
  id: string;
  tenantId: string;
  organizationId: string;
  subscriptionId?: string;
  licenseId: string;
  planId: string;
  planVersionId?: string;
  termIndex: number;
  /** Anniversary anchor used to compute every later term boundary without drift. */
  anchorAt: string;
  startsAt: string;
  endsAt: string;
  status: 'active' | 'closed';
  source: 'initial' | 'renewal' | 'migration' | 'legacy_usage';
  /** A term synthesised by the migration from calendar-year usage that fits no real term. */
  legacy?: boolean;
  legacyYear?: number;
  participantAllowance: number;
  activeCompetitionAllowance: number;
  usageMetric: UsageMetric;
  currency: string;
  publicPriceMinor: number;
  /** Direct enterprise / national contract price, when different from the public list price. */
  contractPriceMinor?: number;
  /* ——— channel-private (never shown to an operator's end customer) ——— */
  operatorId?: string;
  operatorAgreementId?: string;
  discountBps?: number;
  wholesalePriceMinor?: number;
  walletEntryId?: string;
  /* ——— provenance ——— */
  renewedFromTermId?: string;
  invoiceId?: string;
  changes: TermChange[];
  createdAt: string;
  createdBy: string;
  closedAt?: string;
}

export interface WhiteLabelRights {
  level: 'mizan' | 'co_branded' | 'full';
  customDomain: boolean;
  customEmailBranding: boolean;
  hideMizanBrand: boolean;
}

export interface DiscoverRights {
  operatorDirectory: boolean;
}

export interface ExclusivityTerms {
  enabled: boolean;
  territories: string[];
  startsAt?: string;
  endsAt?: string;
  minimumSalesMinor?: number;
  minimumActiveOrganizations?: number;
  renewalConditions?: string;
}

export interface OperatorTierRecord {
  id: string;
  slug: string;
  name: string;
  nameArabic: string;
  currency: string;
  minimumAnnualCommitmentMinor: number;
  discountBps: number;
  defaultWhiteLabelRights: WhiteLabelRights;
  defaultDiscoverRights: DiscoverRights;
  defaultGlobalSyndicationRights: boolean;
  active: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type WalletExpiryPolicy = 'expire_at_agreement_end' | 'carry_over';

export interface AgreementHistoryRow {
  at: string;
  by: string;
  field: string;
  from: unknown;
  to: unknown;
  reason: string;
}

export interface OperatorAgreementRecord {
  id: string;
  operatorId: string;
  tierId: string;
  currency: string;
  discountBps: number;
  minimumAnnualCommitmentMinor: number;
  startsAt: string;
  endsAt: string;
  status: 'draft' | 'active' | 'expired' | 'terminated';
  whiteLabelRights: WhiteLabelRights;
  discoverRights: DiscoverRights;
  globalSyndicationRights: boolean;
  /** Never implied by tier. Only an explicit, dated, KPI-backed contractual grant. */
  exclusivity?: ExclusivityTerms;
  walletExpiryPolicy: WalletExpiryPolicy;
  /** Negative-balance allowance. 0 = no credit facility (the default). */
  creditFacilityMinor: number;
  /** Minimum advertised price per plan. Not enforced unless the platform policy enables MAP. */
  minimumAdvertisedPriceMinor?: Record<string, number> | null;
  renewedFromAgreementId?: string;
  createdAt: string;
  createdBy: string;
  approvedAt?: string;
  approvedBy?: string;
  terminatedAt?: string;
  terminationReason?: string;
  expiredAt?: string;
  history: AgreementHistoryRow[];
}

export interface OperatorWalletRecord {
  id: string;
  operatorId: string;
  currency: string;
  /** Cache of Σ ledger.amountMinor — the ledger is the source of truth (see verifyWallet). */
  balanceMinor: number;
  committedMinor: number;
  spentMinor: number;
  createdAt: string;
  updatedAt: string;
}

export type WalletEntryType =
  | 'commitment'
  | 'top_up'
  | 'license_activation'
  | 'license_renewal'
  | 'plan_upgrade'
  | 'refund'
  | 'admin_adjustment'
  | 'expiration';

/** Immutable. Credits are positive, debits negative. Corrections are compensating entries. */
export interface WalletLedgerEntry {
  id: string;
  walletId: string;
  operatorId: string;
  agreementId?: string;
  type: WalletEntryType;
  amountMinor: number;
  balanceAfterMinor: number;
  currency: string;
  organizationId?: string;
  subscriptionId?: string;
  subscriptionTermId?: string;
  invoiceId?: string;
  planId?: string;
  planVersionId?: string;
  publicPriceMinor?: number;
  discountBps?: number;
  reason?: string;
  reference?: string;
  reversesEntryId?: string;
  idempotencyKey?: string;
  createdAt: string;
  createdBy: string;
}

export interface IdempotencyRecord {
  key: string;
  scope: string;
  requestHash: string;
  result: unknown;
  createdAt: string;
}

export interface OperatorResalePriceRecord {
  id: string;
  operatorId: string;
  planId: string;
  market: string;
  currency: string;
  resalePriceMinor: number;
  updatedAt: string;
  updatedBy: string;
}

export interface CommercialPolicy {
  termMonths: number;
  graceDays: number;
  readOnlyDays: number;
  /** Whether new operations (registration, activation) are still allowed during grace. */
  graceAllowsOperations: boolean;
  usageWarningThresholdsBps: number[];
  defaultUsageMetric: UsageMetric;
  defaultWalletExpiryPolicy: WalletExpiryPolicy;
  upgradeProration: 'full_difference' | 'none';
  /** Minimum advertised price enforcement. Not approved yet — disabled by default. */
  mapEnforcement: boolean;
  updatedAt: string;
  updatedBy: string;
}

export interface OwnershipEvent {
  id: string;
  organizationId: string;
  from: { owner: CommercialOwner; operatorId?: string };
  to: { owner: CommercialOwner; operatorId?: string };
  effectiveAt: string;
  reason: string;
  subscriptionTreatment: 'keep_current_term' | 'close_current_term';
  actorId: string;
  createdAt: string;
}

export type AccessState = 'active' | 'grace' | 'read_only' | 'suspended' | 'cancelled';

/* ——————————————— White label & Discover ——————————————— */

export type BrandingMode = 'mizan' | 'co_branded' | 'full_white_label';

export interface BrandProfileRecord {
  id: string;
  ownerType: 'operator' | 'organization';
  ownerId: string;
  brandingMode: BrandingMode;
  productName: string;
  productNameArabic?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  loginTitle?: string;
  loginTitleArabic?: string;
  emailSenderName?: string;
  emailReplyTo?: string;
  directoryName?: string;
  directoryNameArabic?: string;
  supportEmail?: string;
  supportUrl?: string;
  privacyUrl?: string;
  termsUrl?: string;
  showPoweredByMizan: boolean;
  updatedAt: string;
  updatedBy: string;
}

export interface CustomDomainRecord {
  id: string;
  ownerType: 'operator' | 'organization';
  ownerId: string;
  hostname: string;
  purpose: 'platform' | 'discover';
  status: 'pending' | 'verifying' | 'active' | 'failed' | 'disabled';
  verificationToken: string;
  verifiedAt?: string;
  lastCheckedAt?: string;
  lastError?: string;
  /** TLS is provisioned by the deployment edge (e.g. Cloud Run domain mapping); tracked, not claimed. */
  sslStatus: 'external_pending' | 'active' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface DiscoverVisibility {
  organizationDirectory: boolean;
  operatorDirectory: boolean;
  globalSyndication: boolean;
}

/** Public projection only. Never a pointer into internal competition configuration. */
export interface PublishedCompetitionListing {
  id: string;
  competitionId: string;
  organizationId: string;
  operatorId?: string;
  publicSlug: string;
  title: string;
  titleArabic?: string;
  summary?: string;
  summaryArabic?: string;
  institutionName: string;
  registrationOpen: boolean;
  registrationUrl?: string;
  startsOn?: string;
  endsOn?: string;
  registrationClosesOn?: string;
  country?: string;
  city?: string;
  mode: 'online' | 'in_person' | 'hybrid';
  publicCategories: string[];
  riwayat: string[];
  ageRanges: string[];
  languages: string[];
  memorizationLevels: string[];
  visibility: DiscoverVisibility;
  status: 'published' | 'unpublished';
  publishedAt: string;
  publishedBy: string;
  updatedAt: string;
}

/* ——————————————— Partner API webhooks ——————————————— */

export const WEBHOOK_EVENT_TYPES = [
  'registration.created',
  'registration.updated',
  'participant.checked_in',
  'judging.completed',
  'competition.completed',
  'results.published',
  'certificate.issued',
  'subscription.renewed',
  'subscription.payment_failed',
] as const;
export type WebhookEventType = typeof WEBHOOK_EVENT_TYPES[number];

export interface WebhookEndpointRecord {
  id: string;
  organizationId: string;
  url: string;
  events: WebhookEventType[];
  secretRef: string;
  status: 'active' | 'disabled';
  consecutiveFailures: number;
  disabledReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDeliveryRecord {
  id: string;
  endpointId: string;
  organizationId: string;
  eventId: string;
  eventType: WebhookEventType;
  payload: string;
  attempts: number;
  status: 'pending' | 'delivered' | 'failed' | 'dead';
  nextAttemptAt: string;
  lastStatusCode?: number;
  lastError?: string;
  createdAt: string;
  deliveredAt?: string;
}

export interface CommercialMigrationReport {
  id: string;
  ranAt: string;
  schemaVersion: number;
  termsCreatedFromLicenses: number;
  legacyTermsCreated: number;
  usageRowsBefore: number;
  usageRowsAfter: number;
  usageRowsLinked: number;
  usageRowsLinkedToLegacyTerms: number;
  duplicatesDetected: number;
  catalogPlansSeeded: string[];
  operatorTiersSeeded: string[];
  legacyCreditOperators: { operatorId: string; operatorName: string; legacyCreditBalance: number }[];
  notes: string[];
}
