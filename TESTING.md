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
