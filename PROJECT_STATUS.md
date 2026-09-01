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
