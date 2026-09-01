# MIZAN — Implementation Status

## Current local build
This repository implements the end-to-end product skeleton and executable workflows locally. It is **not deployed** and nothing in this package was uploaded to a cloud environment as part of this revision.

### Implemented in code
- Quiet Authority design system with role-specific experiences and no cross-role mega navigation.
- Multi-competition state with create/select flows; every competition owns an independent `CompetitionPolicy`.
- Competition DNA: registration, workflow, FairDraw, judging, results, certificates, privacy and automation settings per competition.
- Template system as starting points only; templates are not global rules.
- Dynamic JudgeOS actions and penalties derived from the active competition policy.
- Independent locked judge submissions and panel aggregation only when the configured panel count is reached.
- AI Integrity is advisory only; it is never allowed to deduct a score.
- Head Judge management-by-exception review.
- Smart check-in routing to compatible, lower-load committees.
- Participant journey from online registration through arrival, queue, test, result policy, appeal and certificate view.
- Kiosk self check-in with exception fallback.
- Competition command center and digital-twin capacity estimate.
- Organization, platform, scientific, delegation, exception and auditor role portals.
- Ceremony mode with explicit result reveal.
- SHA-256 result sealing using Web Crypto when available.
- FairDraw service with secure random tie-breaking, configurable difficulty target, diversity constraints and SHA-256 draw commitment.
- Tenant-oriented Firestore rules; the previous public `allow read, write: if true` rule has been removed.
- Local persistence and offline continuity for the local runtime; cloud sync activates only after real Firebase authentication.

### External production dependencies intentionally not faked
These require deployment credentials, approved datasets, institutional policy or infrastructure and therefore are represented by secure integration points rather than fabricated success states:
- Real Firebase identity/custom claims provisioning and server-side authorization service.
- Production database decomposition from the local demo store into domain repositories.
- SMS/WhatsApp/email providers.
- Government identity/document verification providers.
- Certified Quran corpora for every supported riwaya beyond the packaged approved fixtures.
- Production ASR/alignment/tajweed models and their scientific validation datasets.
- Edge appliance packaging, hot standby and real multi-device reconciliation testing.
- Real PDF signing/HSM certificate service.
- Public certificate repository/API.
- OBS/broadcast bridge and venue hardware.

A capability must remain disabled or marked Beta/Not certified until its evidence and integration are real.

## Completion audit — 2026-09-01
- JudgeOS now honors each competition's judging mode (`all_judges_all_criteria`, `specialized_judges`, `hybrid`) and score-entry mode (`event_based`, `direct_score`, `hybrid`). Specialized judges see only their applicable criteria/actions; panel submissions remain independent until lock.
- Direct-score values are normalized to the competition RuleSet maximum and aggregated only after the configured panel count is reached.
- Undo no longer destroys a judging event; it marks the event reversed so the event history remains reconstructable.
- Competition policies remain instance-owned and versioned. Templates are only starting points and never global judging law.
- Visual pass keeps role surfaces intentionally sparse: participant journey, kiosk, JudgeOS, head-judge exceptions, operations command center and ceremony do not share a generic dashboard layout.
- No external upload, deploy or cloud publication was performed during this completion pass.

## 2026-09-01 — Experience entry & competition isolation pass
- Demo/local mode no longer drops the reviewer directly into Competition Admin.
- Added MIZAN Experience Hub as the default local entry: every role and public journey is reachable in one quiet, low-noise screen.
- Added one-click return to the experience hub from operational screens and public demo routes.
- Real authenticated deployment still routes users directly to their authorized role; the role gallery is demo/development only.
- Hardened competition scoping for ReviewCase and AIObservation records by carrying competitionId on the entity itself and migrating legacy local demo records into the active competition scope.
- TypeScript static check passes after this pass (`tsc --noEmit`).
- Full dependency install/build could not be executed in this environment because package installation timed out; deployment environment should still run `npm run check` before release.

## 2026-09 completion pass — cost-aware venue operation

Implemented beyond the original prompt:
- Cost-Aware Deployment Studio with Lean / Balanced / Premium profiles.
- No proprietary-hardware assumption: existing computer + browser can operate MIZAN Gate.
- QR reader is optional; manual code and keyboard-wedge USB scanners work with the same gate flow.
- Paperless queue-number issuance; printer is optional rather than required.
- Full-screen Waiting Display for any TV/monitor, using participant codes by default for privacy.
- Hardware map derived from competition scale and operational policy.
- Explicit minimum-human-floor principle: automate routine flow while preserving an Exception Host for unusual cases and human judges for official judging.
- Role Test Matrix prepared for the next destructive QA phase.

Verification performed in this workspace:
- TypeScript `tsc --noEmit`: PASS after the completion pass.
- `npm install` was attempted but timed out in the execution environment, so package-dependent `npm test` and production `npm run build` could not be executed here. They must be run in the target development environment before release.
