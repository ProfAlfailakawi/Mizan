# MIZAN Commercial Refactor — Implementation Report

Date: 2026-09-27. Branch: `claude/mizan-commercial-refactor-cjjost`. The commercial model
itself is described in `MIZAN_COMMERCIAL_MODEL.md`.

## 1. What existed before

- **SaaS control plane** — `server/saas-platform.ts`, `SaaSPlatformRepository`.
  - State is a JSON file written atomically with `rename`. Every mutation runs as a single
    synchronous read → apply → write, and appends to a hash-chained audit log with an external
    anchor.
  - It already held plans, operators, organizations, immutable licence IDs, subscriptions,
    invoices, gateway settlement, storage quotas and the legal-document chain.
- **Participant metering** was keyed on `year = current UTC year`. That meant a quota reset on
  1 January regardless of the subscription date.
- **Active-competition cap** was already simultaneous: it counted `registration_open`,
  `registration_closed` and `judging`.
- **Operators** used a *credit ledger* where 1 credit = 1 organization, regardless of plan.
  White label was a single `whiteLabelLevel` field that the platform set on the operator.
- **Competitions** live in the client store and Firestore.
  - A basic `cloneCompetition()` existed that deep-copied the current competition.
  - There was no series/edition model, no Discover directory and no custom-domain brand
    resolution.

## 2. Architecture changes

New modules live in `server/commercial/`. All of them run inside the existing
`mutate()` transaction and audit chain; no parallel system was created.

| Module | Responsibility |
|---|---|
| `money.ts` | Integer minor units, basis-point discount (`applyDiscountBps`), currency validation. |
| `term-calendar.ts` | UTC anniversary arithmetic with month-end clamping, and half-open terms. |
| `types.ts` | `SubscriptionTerm`, `PlanVersion`, `OperatorTier`, `OperatorAgreement`, `OperatorWallet`, `WalletLedgerEntry`, `Idempotency`, `ResalePrice`, `OwnershipEvent`, `BrandProfile`, `CustomDomain`, `PublishedCompetitionListing`, `WebhookEndpoint`/`Delivery`, `CommercialPolicy`, `CommercialMigrationReport`. |
| `catalog-seed.ts` | Seed values for plans, tiers and policy. They are written once and are additive; logic never reads them. |
| `engine.ts` | The single authoritative engine (see below). |
| `brand-discover.ts` | Brand rights from agreements, brand profiles, DNS-verified domains, host → brand resolution, Discover publishing and scoped queries. |
| `webhooks.ts` | HMAC signing and verification, SSRF-safe URL validation, enqueueing, backoff and auto-disable. |
| `migration.ts` | Schema-2 migration and report. |

`engine.ts` covers these areas:
- **Plans:** catalog and dated price versions.
- **Terms and access:** current, latest and entitlement terms; access-state lifecycle.
- **Usage limits:** participant usage and active-competition enforcement.
- **Subscription lifecycle:** renewal, upgrade and downgrade, contract overrides, channel
  transfer and channel guard.
- **Operators:** agreements, wallet ledger, wholesale quote, and operator
  activation/renewal/upgrade.
- **Cross-cutting:** idempotency and reports.

Client-side changes:
- `src/lib/competition-clone.ts` is a pure clone module that also provides the series index.
- `src/lib/commercial-i18n.ts` is a translation namespace (AR/EN) plus integer money
  formatting.
- `src/components/admin/CommercialPanels.tsx` and `src/components/public/DiscoverDirectory.tsx`
  hold the new UI.

## 3. Data changes and migration

State changes are additive:
- New collections: `planVersions`, `subscriptionTerms`, `operatorTiers`, `operatorAgreements`,
  `operatorWallets`, `walletLedger`, `idempotency`, `resalePrices`, `ownershipEvents`,
  `migrationReports`, `brandProfiles`, `customDomains`, `discoverListings`,
  `webhookEndpoints`, `webhookDeliveries`.
- New optional fields:
  - `PlanRecord`: `slug`, `nameArabic`, `catalog`, `custom`, `displayOrder`.
  - `OrganizationRecord`: `commercialOwner`.
  - `SubscriptionRecord`: `pendingPlanId`.
  - `InvoiceRecord`: `kind`, `metadata`, `paymentFailedNotifiedAt`.
  - `ParticipantUsageRow`: `subscriptionTermId`, `usageKey`, `identityKey`. The legacy `year`
    field is kept.
- Client `Competition` gains optional `seriesId`, `seriesName(Arabic)`, `editionLabel`,
  `previousEditionId` and `clonedFrom`.

The **migration** (`commercialSchemaVersion` 1 → 2) runs once when the repository loads:
- It creates a first term from each licence's own dates.
- It links legacy usage rows to the term that contains their `createdAt`. Rows outside every
  real term go to explicit `legacy` terms for their calendar year.
- It verifies that row count, `createdAt` and `year` are unchanged, and aborts the whole
  migration otherwise.
- It seeds the catalog and tiers additively.
- It lists operators holding legacy credits for review. **Credits are not converted to
  money.**

The migration is covered by a fixture test.

Indexes: the store is a single JSON document scanned in memory, so there are no database
indexes to add. Hot paths filter by `organizationId`/`subscriptionTermId`. See §21 for scale
limits.

## 4–7. Subscriptions, participant quota, active limits, renewal

**Quota and limits**
- Participant usage is counted per `SubscriptionTerm`, unique per organization, and enforced
  server-side inside the write transaction.
- The error code `ANNUAL_PARTICIPANT_LIMIT_REACHED` is kept for client compatibility. Its
  message now says "term".
- Active competitions are counted as simultaneous. Drafts, completed and archived
  competitions are free. Closing a competition is always allowed.

**Access and renewal**
- Access state is derived from dates at read time: active → grace → read_only → suspended,
  with explicit suspension or cancellation overriding it.
- Direct renewal: the renewal invoice is issued by the billing cycle. On payment, the
  invoice-paid hook atomically opens the new term, extends the licence, syncs the
  subscription, writes an audit event and emits a webhook. The hook is idempotent per
  invoice.
- Zero-price contracts renew directly.

**Plan changes**
- Upgrade: an invoice for the price difference for a direct customer, or a wallet debit for an
  operator. The proration policy is a single table.
- Downgrade: scheduled for the next term.
- Contract overrides are shown as base + override = effective.

## 8–9. Series, editions and clone

The wizard has four steps: source → name/edition → parts → summary. It is opened from the
organization's competition list.

**Copied:** categories, judging, registration policy/form, certificate template, branding,
schedule/venue structure, and results/appeals/privacy/operations policies.

**Never copied:** registrations, scores, results, appeals, certificates, payments, audit logs,
seals and the old DNA.

The new edition gets a new ID, a new unfrozen rule set and policy snapshot, `draft` status and
series links. The old competition joins the series without being changed otherwise.

## 10–12. Operator, wallet and wholesale pricing

- **Agreements:** created from a tier with overridable discount and commitment. They go through
  approve, change (with reason and history), renew (exclusivity is not carried over) and
  terminate. Overlapping active agreements are refused.
- **Wallet:**
  - Funded by commitment funding (idempotent per payment reference) or by top-up. A top-up is
    either an operator-requested invoice paid through the invoice flow, or an owner-recorded
    receipt.
  - Debited by activation, renewal and upgrade, all idempotent via `Idempotency-Key`.
  - Refunds are capped compensating entries. Admin adjustments require a reason.
  - When an agreement ends, its unused balance expires as an `expiration` entry.
  - The ledger is verified against the cached balance.
- **Wholesale pricing:** calculated only in `engine.wholesaleQuote`, as public price at the
  current date × (10000 − bps) / 10000, in integers.
- **Legacy operators:** operators without an agreement keep the legacy credit path, so existing
  deployments keep working. An operator with an active agreement must use wallet activation
  (`OPERATOR_WALLET_ACTIVATION_REQUIRED`).

## 13–14. White label and Discover

**White label**
- The operator or organization can customize: product name, logo, favicon, colours, login
  title, directory name, support/legal links, and email sender and reply-to (subject to
  rights).
- Branding mode (`mizan` / `co_branded` / `full_white_label`) and hiding the MIZAN brand are
  enforced against the agreement on the server.
- Custom domains are activated through a DNS TXT check (`_mizan-verify.<host>`), using a real
  `dns.resolveTxt` lookup.
- `/api/public/brand` resolves the brand by host.

**Discover**
- Discover serves a whitelisted listing projection.
- The scope comes from the host and is filtered server-side per listing flag and current
  rights.
- A listing with syndication OFF never reaches the global directory.
- Public page: `#discover`.

## 15. UI

| Surface | Change |
|---|---|
| Organization, "Usage & licence" | New **Subscription** tab: plan, term (inclusive dates), status, participant and active-competition progress bars, 70/85/95/100% warnings, override table, pending change, upgrade cards (direct customers) or "contact your operator", and term history. New **Branding** tab for org admins. |
| Organization, Competitions | "Start from a previous competition" button opens the new-edition wizard. |
| Operator workspace | New default tab **Wallet & customers**: summary (balance, commitment, spent, tier, discount, dates, customer counts, renewals, suspended), customer table with renew, activation form showing the wholesale price, wallet ledger with type filter and top-up request, pricing (public / wholesale / resale), and branding plus domains. |
| Platform admin console | New tab **Catalog, operators & wallets**: reports, catalog with dated price scheduling, agreement creation, approval and commitment funding, ledger CSV export, migration report. |
| Public | `#discover` page, branded by host. |

## 16. API

**Public** (rate limited, listed in the endpoint inventory with reasons):
- `GET /api/public/plans`, `/api/public/brand`, `/api/public/discover`
- `GET /api/v1/plans`, `/api/v1/discover`

**Authenticated:**
- `GET /api/v1/organization/subscription`

**Owner:**
- `GET /api/saas/owner/commercial`
- `POST /api/saas/owner/plans/:id/versions`
- `PUT /api/saas/owner/commercial/policy`, `PUT /api/saas/owner/operator-tiers`
- `POST /api/saas/owner/agreements`, and `POST …/:id/approve`, `PUT …/:id`,
  `POST …/:id/terminate`, `POST …/:id/renew`, `POST …/:id/commitment`
- `GET /api/saas/owner/operators/:id/commercial`
- `POST …/operators/:id/wallet/top-up`, `POST …/operators/:id/wallet/adjust`
- `POST /api/saas/owner/wallet/entries/:id/refund`
- `GET /api/saas/owner/wallet/ledger` (supports `?format=csv`)
- `POST /api/saas/owner/organizations/:id/override`, `…/transfer`, `…/renew`

**Operator:**
- `GET /api/saas/operator/commercial`
- `POST /api/saas/operator/customers`, `POST …/customers/:id/renew`, `…/upgrade`,
  `…/downgrade`
- `POST /api/saas/operator/wallet/top-up-request`
- `PUT /api/saas/operator/resale-prices`

**Brand and domains:**
- `GET|PUT /api/saas/brand/:ownerType/:ownerId`
- `POST …/domains`
- `POST /api/saas/domains/:id/verify`, `POST /api/saas/domains/:id/disable`

**Organization:**
- `GET /api/saas/organization/billing`
- `POST /api/saas/organization/upgrade`, `POST /api/saas/organization/downgrade`
- `GET|POST /api/saas/organization/discover`, `POST …/discover/:id/unpublish`
- `GET|POST /api/saas/organization/webhooks`, `POST …/webhooks/:id/disable`

**Webhook events:**
- `registration.created`, `registration.updated`, `participant.checked_in`,
  `judging.completed`, `competition.completed`, `results.published`, `certificate.issued`,
  `subscription.renewed`, `subscription.payment_failed`
- Signature header: `X-Mizan-Signature: t=…,v1=HMAC-SHA256`.

## 17. Security

The following are tested:
- Cross-operator isolation: wallet views, admin view, upgrade on another operator's customer,
  ledger.
- Cross-organization isolation for billing, usage, brand and webhooks. The cross-tenant guard
  inventory was extended with 7 new guarded methods.
- An operator cannot self-grant brand rights.
- A customer never sees channel-private pricing.
- Discover scope cannot be widened by query parameters.
- Webhook URLs must be HTTPS and cannot target private or metadata addresses.
- The webhook secret is shown once and never listed.
- CSV export neutralises formula injection.
- Financial idempotency.
- A new public route without a documented reason fails the endpoint inventory test.

## 18. Tests

| Run | Tests | Pass | Fail | Skipped |
|---|---:|---:|---:|---:|
| Baseline before changes | 2,652 | 2,640 | 0 | 12 |
| After changes | 2,687 | 2,675 | 0 | 12 |

New test files:
- `tests/commercial-model.test.ts` — 24 tests. They cover §111, §112, §113, §115–§124 and
  §151–§156, plus concurrency, non-payment, downgrade, refunds and expiry, exclusivity,
  overrides and webhooks.
- `tests/competition-clone.test.ts` — 4 tests.

Existing tests changed:
- `saas-cross-tenant-guard` now probes the new guarded methods (strengthened, not loosened).
- `endpoint-authorization-inventory` lists the new public routes with reasons.
- `product-polish-phase-b` now reads both files for the new-edition rule, because the reset
  logic moved into `competition-clone.ts`. Its assertions still require the same resets.

## 19. Build

| Command | Result |
|---|---|
| `npx tsc --noEmit` (`npm run lint`) | pass |
| `npm test` | 0 failures |
| `npm run build` | pass (vite, legal-document copy and esbuild server bundle) |
| `npm run secret-scan` | pass |
| `npm run source-audit` | pass |
| `npm run production-audit` | pass |

## 20. Classification

### COMPLETE IN CODE
- Term-based participant quota, simultaneous active-competition cap, renewal that preserves
  history, and the non-payment lifecycle.
- Dated plan versions, a single catalog and contract overrides.
- Operator tiers, agreements, wallet ledger, wholesale pricing, and idempotent
  activation/renewal/upgrade.
- Refunds, adjustments, expiry and reports.
- Channel ownership, channel guard and admin transfer.
- Brand rights and brand profiles, host resolution, Discover projection and scoping.
- Competition clone wizard, series and editions.
- Webhook signing, retries and delivery log.
- Migration with its report.
- UI for organization, operator and platform admin.

### COMPLETE BUT REQUIRES CONFIGURATION
- `MIZAN_SAAS_DATA_DIR`, which must point to durable storage.
- `MIZAN_STORAGE_SECRET_MASTER_KEY`, which is required to store webhook signing secrets.
- Custom domains: DNS verification works, but serving traffic needs a Cloud Run or edge domain
  mapping plus TLS (`sslStatus` stays `external_pending` until then).
- Commercial policy values (grace and read-only days, thresholds) and final prices and
  discounts, which the platform admin sets.

### REQUIRES EXTERNAL PROVIDER / CREDENTIAL
- A payment gateway for real online checkout. The existing gateway abstraction is reused, and
  manual settlement works.
- Email, SMS and WhatsApp delivery for renewal and payment reminders. The existing
  notification center is unchanged; this change emits audit events and webhooks only.
- SAML/enterprise SSO: no provider is configured and nothing was built.

### NOT IMPLEMENTED / BLOCKED (explicitly out of this change)
- **Webhook event coverage.** Webhooks are emitted for the subscription events only. The
  competition-domain events (registration, check-in, judging, results, certificates) are
  defined and signable, but they are not yet emitted from the Firestore-side flows.
- **Discover publishing UI.** There is no publishing form in the competition screen yet.
  Listings are published through the API
  (`POST /api/saas/organization/discover`).
- **Full app-chrome white label.** Host brand applies to the Discover page, the document title
  and the favicon. The authenticated admin shell, login screen and email templates still render
  MIZAN branding. Brand resolution data (`/api/public/brand`) is available for them to consume.
- **Registration Form Builder extensions.** The existing field schema was not extended: no
  conditional logic, no new field types, no autosave or resume.
- **Workflows and planning:** conflict-of-interest/recusal workflow, Smart Scheduler,
  qualification hierarchy.
- **Participant registration payments** (organization-charged fees).
- **Additional UI languages.** The namespace is ready; only AR and EN exist.
- **MIZAN Passport** — future work by design.
- **Multi-instance writes.** The SaaS store is a single-writer JSON file. Transactions are
  serialized within one process, which is what guarantees the 150-seat and active-cap races,
  but it is not safe for multiple concurrent server instances writing the same file. Scaling
  horizontally requires moving the repository to a transactional database (e.g. Firestore
  transactions), keeping the same engine functions.

## 21. Remaining issues

- `ANNUAL_PARTICIPANT_LIMIT_REACHED` keeps its historical name for client compatibility, even
  though the limit is now per term.
- In-memory scans are fine at the current data volumes. A deployment with hundreds of
  thousands of usage rows should move to an indexed store (see above).
- Legacy operators on credits need a manual platform decision: create an agreement and fund
  its wallet explicitly.
