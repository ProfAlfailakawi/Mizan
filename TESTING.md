# Testing Strategy

Required before production launch:
- unit tests for eligibility, scoring, state transitions and FairDraw constraints;
- tenant-isolation and permission tests;
- multi-judge concurrency tests;
- duplicate scan/idempotency tests;
- sealed-result mutation rejection tests;
- certificate verification tests;
- offline/reconnect conflict tests;
- RTL/LTR visual regression;
- keyboard/screen-reader checks;
- load test for the target event size;
- venue rehearsal with real microphones, tablets, kiosks and edge infrastructure;
- shadow judging for every AI capability before certification.

A screen existing is never an acceptance criterion by itself.

## Judging policy matrix
The acceptance matrix includes:
- all judges / all criteria + event based
- specialized judges + event based
- specialized judges + direct score
- hybrid judges + hybrid entry
- AI disabled and AI advisory modes
- single and multi-question sessions
- drop-extremes panel aggregation
- result seal and appeal mutation guards

Judge event undo is append-preserving (`reversed=true`), and locked submissions cannot be edited through JudgeOS.

## Final local verification — 2026-09-02

Actually executed in this environment:
- `npx --yes tsc --noEmit` — PASS.
- `node scripts/scan-secrets.mjs` — PASS.
- `node scripts/source-audit.mjs` — PASS.
- Direct synthetic Rule Simulator check — PASS.
- Current QR implementation was previously validated by rasterizing a generated QR and decoding it with OpenCV (`MZ1|A-104`) — PASS.

Attempted but not claimed as passed:
- `npx --yes tsx --test tests/*.test.ts` — timed out because `tsx`/project dependencies are not installed locally and package retrieval is unavailable/too slow in this environment.
- Full `npm run build`, browser E2E, cross-device Edge testing and 2,000-participant load testing therefore remain release-environment checks.

Never convert an unexecuted test into a PASS in project status.
