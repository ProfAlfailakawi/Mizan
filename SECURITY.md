# MIZAN Security Model

## Principles
- Deny by default.
- Tenant isolation before feature convenience.
- Least privilege by role and granular permission.
- No hidden Super Admin result-edit path.
- Sensitive changes require reason, audit and, where configured, dual approval.
- AI tools never receive authority they do not have outside the model.

## Firestore
`firestore.rules` no longer exposes a public wildcard. Production authentication must issue trusted custom claims such as `org_id` and `role` server-side. Client-provided role strings are not security boundaries.

## Result integrity
Result sealing uses SHA-256 through Web Crypto. A production environment should additionally use server-held signing keys/HSM and an append-only audit repository.

## Quran/audio/documents
- Approved Quran Vault only; never generate source text with an LLM.
- Audio/document URLs should be signed and time-limited in production.
- Retention is competition-policy driven.
- Participant identity should be masked from AI processing when not required.
