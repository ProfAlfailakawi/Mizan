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

### COMPLETED IN THE FOLLOW-UP CHANGE (second PR)
- **Registration form builder** (`src/lib/registration-form.ts`, `RegistrationFormBuilder.tsx`):
  13 field types, declarative `visibleWhen`/`requiredWhen` rules (including derived `age`),
  identical validation in the browser and on the server, hidden-branch answers never stored,
  schema validation in the builder.
- **Drafts, autosave, edit:** device-local autosaved drafts restored on return; participants edit
  their registration with their journey token until the deadline (`PUT
  /api/public/competitions/:id/registration`), fully revalidated, locked after the deadline or
  once checked in, with a per-field change log that records field names, not values.
- **Registration fees set by the organization** (not MIZAN fees): `registration.fee` policy,
  per-participant `registrationPayment` (pending/paid/refunded/waived) with receipt references
  and audit. No payment gateway is connected; collection is recorded manually.
- **Conflict of interest / recusal** (`conflict-of-interest.ts`): declare, recuse or abstain with a
  reason; head judge/admin decides (reassign participant, replace judge, keep with reason,
  reject); self-resolution blocked; the original assignment is snapshotted; routing and the
  scheduler exclude conflicted panels. Firestore rules: a judge can only create an open case in
  their own name; decisions are admin/head-judge only; nothing is deletable.
- **Smart scheduler** (`smart-scheduler.ts`): deterministic, explainable timetable from days,
  per-category session length, breaks, prayer breaks, transitions, hall capacity, judge
  availability and conflicts; unscheduled items carry reasons; manual pins recompute around
  them; draft → published with audit.
- **Qualification hierarchy** (`qualification.ts`): `qualifier_for` links with cycle detection;
  qualifiers computed only from sealed/published results with seal evidence; invitations
  create a *draft* participant carrying `qualifiedFrom` provenance (no automatic registration);
  status transitions with mandatory revoke reason.
- **Competition-domain webhooks:** `registration.created/updated` from the server;
  `participant.checked_in`, `judging.completed`, `results.published`, `certificate.issued`,
  `competition.completed` reported by the client to `POST /api/saas/events`, where the server
  derives the organization from identity, allow-lists event types per role, strips payloads to
  IDs (no PII) and deduplicates.
- **Webhook DNS pinning:** delivery goes over `https.request` with `lookup` pinned to the
  address that passed the private-range check; SNI and certificate validation are kept.
- **White label across the shell:** `/api/public/brand` is loaded before first render; title,
  favicon and colour tokens applied; the shared logo/wordmark (header, login, splash, portals)
  uses the host brand, and the MIZAN mark is hidden when the agreement allows.
- **Discover publishing UI** in Competition settings → Discover, prefilled from the
  competition, with only the visibility options the organization's rights allow.
- **Automated communications** (`server/communications.ts`): one outbox for in-app, email, SMS
  and WhatsApp; AR/EN templates for all listed triggers; dedupe; retries with backoff; masked
  listings; triggers wired for registration confirmation, renewal approaching (30/7 days),
  overdue payment, results published, certificate issued.
- **Enterprise SSO** (`server/sso.ts`): per-organization SAML/OIDC configuration backed by
  Firebase Identity Platform, email-domain discovery on the login screen, "Sign in with …"
  button, least-privilege group→role suggestion (never platform/operator roles). Grants still go
  through identity governance.

### REQUIRES EXTERNAL PROVIDER / CONFIGURATION (after the follow-up)
- Email/SMS/WhatsApp gateways: set `MIZAN_EMAIL_HTTP_*`, `MIZAN_SMS_HTTP_*`,
  `MIZAN_WHATSAPP_HTTP_*`. Until then those messages are recorded as `provider_not_configured`.
- SSO: upgrade the Firebase project to Identity Platform and register each organization's SAML
  or OIDC provider there.
- Payment gateway for registration fees: each organization (or its operator) adds its own
  gateway from its dashboard. The MyFatoorah, Tap and Stripe templates were written from public
  documentation and have not been run against a live account. Each one must pass the activation
  test with the owner's own keys before it collects money.

### DONE IN THE SECOND FOLLOW-UP (#321, #323)
- **Per-organization / per-operator payment gateways** (`server/commercial/payment-gateways.ts`,
  `server/payments.ts`, `server/payment-presets.ts`):
  - **Keys:** stored in the encrypted vault and never returned to the browser.
  - **Activation:** only after a real checkout plus a status query succeed.
  - **Settlement:** confirmed by querying the gateway with the secret key or by a valid
    signature. Amount and currency must match exactly, and settlement is idempotent.
  - **Network safety:** tenant-supplied URLs go through a DNS-pinned transport that blocks
    private networks.
  - **Reconciliation:** a job re-checks open payments every 10 minutes.
- **Schedule and check-in reminders** (`server/participant-reminders.ts`):
  - built from the published schedule, in the competition's time zone;
  - a slot notice is sent when a slot is set and again only if it changes;
  - a check-in reminder is sent the day before.
- **Incomplete-registration reminders** (`server/registration-reminders.ts`):
  - **Opt-in:** the participant asks for it explicitly; only the email and the competition are
    stored.
  - **Sending:** one reminder, cancelled if registration is completed or via the email link.
  - **Retention:** records are deleted after sending or after 21 days.
- **MIZAN Passport** (`server/passport.ts`, `#passport`):
  - **Holder key and privacy:** the key is held by the participant, and the passport is private
    by default.
  - **Adding entries:** participations are added with the participant's journey link.
  - **Certificates:** attached only if the public registry verifies them, and re-verified on
    every public view.
  - **Ownership and erasure:** one participation can belong to only one passport, and the
    holder can erase everything.
- **Participant-page languages:**
  - **Languages added:** Urdu (RTL), Indonesian, French and Turkish, alongside Arabic and
    English.
  - **Completeness:** enforced by `tests/public-i18n.test.ts`.
  - **Review status:** the four new languages are machine-assisted and marked
    `pending_native_review`.
- **Currency precision at the gateway boundary** (`shared/currency.ts`):
  - **At the gateway:** amounts use ISO 4217 decimal places (KWD = 3).
  - **In storage:** amounts stay in hundredths, as before.

### STILL NOT IMPLEMENTED
- **Automatic role grants from SSO groups:** deliberately not done; the suggestion is shown to
  admins and grants follow the existing governance flow.
- **Additional languages in the admin dashboards:** only the participant pages have them.
- **Native-speaker review** of the Urdu, Indonesian, French and Turkish translations.
- **Multi-instance writes:**
  - **Current state:** production deliberately runs `--max-instances=1`.
  - **Single-writer file stores:** the SaaS, communications, reminders, passport, seal,
    certificate and audit stores are all single-writer files.
  - **What scaling needs:** moving them to transactional Firestore, in stages. This awaits the
    owner's decision.

## 21. Remaining issues

- `ANNUAL_PARTICIPANT_LIMIT_REACHED` keeps its historical name for client compatibility, even
  though the limit is now per term.
- In-memory scans are fine at the current data volumes. A deployment with hundreds of
  thousands of usage rows should move to an indexed store (see above).
- Legacy operators on credits need a manual platform decision: create an agreement and fund
  its wallet explicitly.
