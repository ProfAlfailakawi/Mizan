# MIZAN Trust Architecture

MIZAN's trust layer is designed so no single UI, AI model, administrator, or cloud connection is a hidden source of official truth.

## Implemented trust primitives

- **Quorum Seal**: protected actions can require approvals from distinct role groups. Result sealing uses Head Judge + Competition/Organization authority where the competition policy requires dual approval. Super Admin is not a hidden result editor.
- **Integrity Invariants**: checks protect sealed-result immutability, human judging authority, independent submissions, competition scope, and trust prerequisites. Blocking violations are recorded rather than silently bypassed.
- **Scientific Evidence Graph**: policies, rules, Quran source governance, FairDraw, AI capability evidence, results, certificates, and quorum evidence can be linked as a traceable graph.
- **Selective Result Proofs**: SHA-256 Merkle commitments prove that one disclosed result belongs to a committed result set without exposing the other results. This is selective disclosure, not a zk-SNARK claim.
- **Integrity Envelopes**: sealed results bind rule/policy versions, judge-submission hashes, FairDraw receipt, recording reference where available, audit head, and result seal into one digest.
- **MIZAN Protocol**: portable verification package independent of the visual interface.
- **Federation Attestations**: development adapter supports verifiable claims without redistributing original private documents. Production institutional signing uses the server Ed25519 trust adapter when configured.
- **Local Mesh / Edge**: browser BroadcastChannel is explicitly a same-origin development adapter. Production field continuity uses the server Edge relay architecture and requires a durable local deployment path.

## Server trust signing

`POST /api/enterprise/trust/sign` signs supported payloads with Ed25519 only when `MIZAN_TRUST_SIGNING_PRIVATE_KEY_PEM` is configured. If no institutional key exists, MIZAN returns `TRUST_SIGNING_NOT_CONFIGURED`; it does not invent a production key.

`POST /api/trust/verify` validates signatures against the configured institutional public key.

## Non-negotiable boundaries

AI does not alter official scores. Sealed results are immutable through normal application actions. Trust proofs never certify Quran data by themselves; Quran source certification remains a separate scientific-governance act. External signing, provider credentials, and production Edge storage are disabled until genuinely configured.
