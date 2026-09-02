# MIZAN Data Model

The TypeScript contracts are in `src/types/index.ts`.

Primary aggregates:
- Organization / OrganizationBrand
- Competition / CompetitionPolicy / RuleSet / Category
- Participant / Registration lifecycle
- Committee / JudgeProfile / conflicts / calibration
- QuestionPoolItem / QuestionSelection
- Test session / JudgeEvent / JudgeSubmission
- AIObservation / ReviewCase
- ResultRecord / AppealRecord / Certificate
- IncidentRecord / AuditEvent / SimulationResult

## Versioning rules
- Competition policy is versioned.
- RuleSet is versioned and must be frozen for live judging in production.
- Quran source versions are immutable once approved.
- Result sealing records a SHA-256 checksum and the rule version used.
- Reversal of a judge event should be represented as an auditable action rather than silent history deletion.

## Multi-tenancy
Every production repository must scope records by organization and competition. Public verification records are intentionally separated from private competition data.
