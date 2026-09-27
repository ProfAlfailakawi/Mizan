# MIZAN Commercial Model

**MIZAN — Quran Competition Operating System / مِيزان — نظام تشغيل المسابقات القرآنية المؤسسية**

This document describes the commercial model as implemented in code. Every number below is a
*seed default*: the live values live in the platform store and are edited by the platform
administrator. Business logic never reads these constants directly.

> We don't sell scattered features. We sell operating capacity inside the complete MIZAN system.
> At renewal we reset usage, not history. The operator is a wholesale distributor, not a
> revenue-share partner.

## 1. Direct plans

| Slug | Plan | Participants / term | Simultaneous active competitions | Public list price (annual) |
|---|---|---:|---:|---:|
| `mizan-150` | MIZAN 150 | 150 | 1 | USD 249 |
| `mizan-500` | MIZAN 500 | 500 | 2 | USD 599 |
| `mizan-2k` | MIZAN 2K | 2,000 | 5 | USD 1,490 |
| `mizan-10k` | MIZAN 10K | 10,000 | 10 | USD 3,490 |
| `mizan-50k` | MIZAN 50K | 50,000 | 25 | USD 7,900 |
| `mizan-national` | MIZAN National | contract | contract | contract |

- Every regular plan includes the full product. Plans differ by scale only. There are no
  certificate, AI, WhatsApp, judging, branch or extra-competition add-ons.
- Storage and branch ceilings on a plan are **infrastructure safety limits**. They are not
  sold as features.
- Slugs are the stable keys. Display names can change.
- Prices are **dated plan versions** (`planVersions`, with `effectiveFrom`/`effectiveTo`). A new
  price can only take effect now or later. It is never retroactive. Terms and invoices keep
  their own price snapshot, so a 2026 invoice never turns into the 2027 price.
- **National** has no implicit "unlimited". Its capacity is an explicit, audited contract
  override, displayed as *plan base + contract override = effective limit*.
- The catalog is one source of truth: `/api/public/plans` serves the pricing page, the
  organization's upgrade page, platform admin and the operator's wholesale calculator.

## 2. Entitlement semantics

### Subscription term
- A `SubscriptionTerm` covers `[startsAt, endsAt)` in UTC. For example, a subscription that
  starts on 27 Sep 2026 runs until 26 Sep 2027 inclusive.
- Anniversaries are computed from a fixed anchor, `anchor + n × 12 months`, with month-end
  clamping. Dates therefore never drift. For example, an anchor of 29 Feb 2028 gives
  28 Feb 2029, 2030 and 2031, then 29 Feb 2032.
- **There is no 1 January reset.** Calendar-year metering was removed. The old `year` field is
  kept on legacy rows, but only as history.
- Each term snapshots its plan, plan version, price, currency and effective allowances. Terms
  sold by an operator also snapshot the operator, agreement, discount and wholesale price.

### Participants
- The default metric is `unique_participant`: one person is counted once per organization per
  term, however many competitions they enter. The model also supports `competition_entry`
  (policy `defaultUsageMetric`), so switching metrics needs no rebuild.
- Usage is enforced on the server when a participant is recorded. The check runs inside the
  same atomic state write as the insert. Two concurrent requests at 149/150 therefore cannot
  produce 151.
- The client's metering calls never block an operation that is already in progress, such as
  judging. The organizer sees the limit at the entitlement gate and in preflight.
- Usage warnings are raised at 70%, 85%, 95% and 100% (configurable). Hitting the limit
  prompts a **move to the next plan**. There are no per-participant micro-overages. Legacy
  overage lines are still honoured, but only for plans that explicitly carry them.

### Competitions
- The limit counts **competitions active at the same time**, not competitions per year.
  Commercially active states are `registration_open`, `registration_closed` and `judging`.
- `draft`, `completed` and `archived` never take an active slot. History can hold any number
  of competitions. A cloned draft does not consume a slot until it is opened.
- Closing or completing a competition is always allowed, even when the organization is
  suspended or read-only.

## 3. Renewal and non-payment

**Renewal resets usage, not data.** A renewal opens a new term. Old usage stays attached to the
old term. Competitions, results, certificates, audit trails, seals and trust records are never
touched. The code contains no deletion-on-renewal path.

**Direct renewal**
1. The billing cycle issues a renewal invoice at the price in force on renewal day. If a
   downgrade is scheduled, the new plan's price is used.
2. When the invoice is paid, the same transaction runs the whole renewal:
   - it marks the invoice paid;
   - it opens the new term (idempotent per invoice);
   - it extends the licence;
   - it syncs the subscription;
   - it writes an audit event;
   - it emits the `subscription.renewed` webhook.

**Lifecycle without payment**

Access state is derived from dates at read time. It is never stored.

`active → grace (14 days) → read_only (60 days) → suspended`

Explicit suspension and cancellation override this sequence.

- **Grace:** operations continue (`graceAllowsOperations`, configurable).
- **Read-only:** history, results and data are visible, but no new registration or activation
  is allowed.
- **Suspended:** no new operations.

No state deletes data. Any future deletion policy must be a separate, explicit and audited
process.

**Plan changes**
- **Upgrade:** a direct customer receives an invoice for the public-price difference, and the
  plan is applied when it is paid. An operator is debited the wholesale difference. The
  proration policy lives in a single table, `UPGRADE_PRORATION`.
- **Downgrade:** always scheduled for the next term. It never shrinks the current term and
  never deletes competitions. The admin is warned if active competitions exceed the new limit.

## 4. Operator model

The roles are:
- **MIZAN** — manufacturer and platform owner.
- **Operator** — distributor and reseller.
- **Organization** — end customer.

**What MIZAN charges**
- There is no revenue share, no percentage of the operator's sale, and no fee per judge,
  certificate, competition or participant.
- MIZAN settles only the **wholesale licence price**:
  `wholesale = publicListPrice × (10000 − discountBps) / 10000`
  This is integer arithmetic in minor units, rounded half-up.
- The operator sets its own resale price. Recording it is optional and never affects
  settlement.
- Minimum-advertised-price fields exist but are **not enforced** (`mapEnforcement=false`).

**Tiers (seed values, admin-editable)**

| Tier | Minimum annual commitment | Suggested discount |
|---|---:|---:|
| Authorized Operator | USD 2,500 | 40% (4000 bps) |
| Growth Operator | USD 10,000 | 50% |
| Strategic / Regional Operator | USD 30,000 | 60% |

**Agreements** (`OperatorAgreement`) carry:
- currency, discount in basis points, commitment and dates;
- white-label rights, Discover rights and global-syndication rights;
- the wallet-expiry policy and the credit facility (default 0, so a wallet can never go
  negative);
- optional minimum advertised prices.

Every change is recorded in `history` together with its reason, and is audited.

**Exclusivity** is never implied by a tier. It must be explicit, with territories, start and
end dates, and optional KPIs. It is not carried over on renewal.

## 5. Wallet

**Ledger**
- `OperatorWalletLedgerEntry` rows are immutable and signed: credits are positive, debits
  negative.
- Entry types: `commitment`, `top_up`, `license_activation`, `license_renewal`,
  `plan_upgrade`, `refund`, `admin_adjustment`, `expiration`.
- The wallet balance is a cache. `verifyWallet` proves it equals Σ ledger, and the platform
  report shows the check for every wallet.

**Idempotency**
- Activation, renewal and upgrade require an `Idempotency-Key`. Replaying a key returns the
  first result. Reusing a key with a different request is refused.
- Commitment funding and top-ups are idempotent per payment reference or invoice.

**Corrections and balance rules**
- A refund is a compensating entry against a specific debit, capped at that debit.
- An adjustment requires a written reason.
- Currencies are never mixed: the plan currency must equal the wallet currency, and there is
  no implicit FX.
- An insufficient balance is refused with `required / available / shortfall`, and nothing is
  created.

**Commitment expiry**
- When an agreement ends, its unused balance expires as an `expiration` entry
  (`expire_at_agreement_end`, the default). The alternative policy is `carry_over`.

**Top-up**
- The operator requests a top-up, which issues an invoice. The wallet is credited when that
  invoice is paid. The platform owner can also record a top-up that was received directly.

## 6. White label

**Branding modes**
- `mizan`, `co_branded` and `full_white_label`.
- An operator's maximum mode comes from its **active agreement**, never from a UI toggle. The
  server rejects any request above that right.
- Hiding "Powered by MIZAN" requires both `full_white_label` and the `hideMizanBrand` right.

**What can be customized**
- product name and logo;
- favicon and colours;
- login title and directory name;
- email sender name and reply-to (requires the email-branding right);
- support, privacy and terms links.

**Custom domains**
- A domain moves through `pending → active | failed`. It becomes active only after its DNS TXT
  record `_mizan-verify.<host>` matches its token.
- TLS is provisioned by the deployment edge. It is tracked here (`sslStatus`) and not claimed.

**Brand resolution**
- `/api/public/brand` resolves the brand from the request host.
- A lapsed agreement falls back to MIZAN branding automatically.

## 7. MIZAN Discover

**Listings**
- Discover reads a **published listing projection** that contains whitelisted public fields
  only. It never reads internal competition configuration.
- Each listing has independent flags: `organizationDirectory`, `operatorDirectory` and
  `globalSyndication`.
- Every flag is off by default, and each one is checked against the owner's rights when the
  listing is published and again when it is read.

**Scope**
- The scope comes from the **host**, never from a query parameter:
  - the MIZAN host shows the global network, meaning `globalSyndication=true` only;
  - an operator domain shows that operator's directory;
  - an organization domain shows that organization's directory.
- A listing with global syndication OFF therefore cannot surface in the global directory
  under any search parameters.
- Operators can run Discover under their own brand, with MIZAN hidden when their agreement
  permits it.

## 8. Channel ownership

**Commercial owner**
- `organization.commercialOwner` is either `direct` or `operator`.
- MIZAN direct cannot create a subscription for an organization managed by an active-agreement
  operator unless it supplies an explicit override reason.
- An operator's customers are shown "contact your operator" instead of MIZAN checkout.

**Channel transfer**
- Moving an organization between channels is done through `transferCommercialOwner`. It is
  super-admin only, requires a reason and an effective date, and is audited.

**Channel-private data**
- An operator's customer never sees the operator's discount, wholesale cost, wallet or
  margin, and does not see MIZAN's public list price either.

## 9. Competition series, editions and cloning

Organizations clone **their own** configuration. This is separate from templates, which are
generic starting points.

**What is copied** (each part can be toggled in the wizard):
- categories and eligibility;
- judging criteria, weights and deductions;
- registration policy and form;
- certificate template;
- branding;
- schedule and venue structure;
- results, appeals, privacy and operations policies.

**What is never copied:**
- participants, registrations, attendance and queues;
- scores, results, winners and appeals;
- issued certificates and verification codes;
- payments and message logs;
- audit logs, seals and Merkle proofs;
- the old competition's DNA.

**How the new edition starts**
- It is a deep-copied snapshot with a new ID, a new unfrozen rule set and policy, and
  `draft` status.
- It is linked through `seriesId`, `editionLabel` and `previousEditionId`.
- Existing competitions keep working unchanged, because the series fields are optional.

## 10. Migration

The migration runs once, on load, and is additive:
1. Every licence gets its first term from its own dates.
2. Legacy `participantUsage.year` rows are linked to the term that contains their
   `createdAt`. Rows outside every real term go to explicitly marked `legacy` terms for their
   calendar year. These terms are never current.
3. Row counts, dates and years are verified unchanged. If anything differs, the migration
   aborts.
4. The legacy operator credit ledger (1 credit = 1 organization) is retained untouched. It is
   **not converted to money**. Operators with a non-zero balance are listed in the migration
   report for platform review.

The resulting `CommercialMigrationReport` is visible in the platform commercial panel.
