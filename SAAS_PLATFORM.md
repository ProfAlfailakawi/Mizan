# MIZAN SaaS Platform

This layer turns MIZAN's existing competition product into a server-enforced,
multi-tenant SaaS control plane. It keeps commercial administration separate
from competition operations and never trusts tenant or operator identifiers
sent by the browser.

## Enable the control plane

Set a durable data directory before starting the server:

```bash
MIZAN_SAAS_DATA_DIR=./.mizan-data/saas
```

External-storage credentials also require a stable 32-byte master key encoded
as 64 hexadecimal characters:

```bash
MIZAN_STORAGE_SECRET_MASTER_KEY=<64-hex-characters>
```

Keep the key outside the repository and back it up independently. Losing it
makes stored provider credentials unreadable. The main SaaS state contains only
encrypted secret references; plaintext access keys are never returned to the
browser or written to the audit log.

## Roles and boundaries

- `super_admin`: plans, organizations, operators, license decisions, and audit.
- `operator_owner` / `operator_admin`: their operator account and licensed
  organizations only.
- `org_admin`: organization operations, license usage, change requests, and
  entitled storage configuration.
- `storage_admin`: storage configuration and migration within the organization.
- `billing_admin`: plan and usage visibility within the organization.
- `branch_admin`: competition operations only; no license or legal-identity UI.

The API derives `organization_id`, `operator_id`, and role from verified Firebase
claims. A caller cannot switch tenants by posting another identifier.

## Enforced invariants

- Organization and license IDs are immutable.
- Legal identity changes use a request/approval workflow; routine operational
  fields can be edited independently.
- Operator license credit is deducted in the same atomic mutation that creates
  an organization.
- Active-competition quota is checked on activation, so drafts remain possible
  and completed/archived competitions release capacity.
- Annual participant usage is ledger-based and excludes draft competitions.
- Upload reservations count both used and reserved bytes and use tenant-prefixed
  object keys. Finalization requires the expected checksum.
- External storage is marked connected only after upload/read/delete probes all
  succeed. Migrations retain the source by default and require a connected
  destination.
- Every mutation appends a hash-chained audit event. The super-admin dashboard
  reports persisted counts and sums, not seeded demo totals.

## External storage adapters

The repository supports S3-compatible, Azure Blob, Google Cloud Storage, and
SFTP configuration records and probe injection. This source tree deliberately
does not include cloud credentials or a provider-specific network adapter. Until
an adapter is supplied by the deployment, the connection test returns
`STORAGE_PROBE_NOT_CONFIGURED` and the UI does not claim success.

## Legacy migration

Use the authenticated migration endpoint for an existing tenant. It assigns a
stable organization ID and license ID without rewriting competition-domain
records. Run it first in a copied environment, verify usage totals and audit
integrity, then point production traffic at the resulting control-plane data.

## Verification

```bash
npm run check
```

The SaaS test suite covers tenant creation and credit accounting, legal-identity
approval, competition and participant limits, storage reservation/finalization,
external-storage probe gating, migration safety, and audit-chain verification.
