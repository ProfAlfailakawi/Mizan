# MIZAN
## Autonomous Operating System for Quran Competitions

MIZAN is an end-to-end competition operating system: online registration, eligibility, arrival, self check-in, queueing, committee routing, FairDraw, human judging, AI-assisted integrity review, results, appeals, ceremony reveal and certificates.

The key architectural rule is that **there is no universal competition rulebook in code**. Every competition has its own `CompetitionPolicy`, RuleSet, categories, judging actions, result policy, appeal policy, automation level and workflow.

## Run locally
```bash
npm install
npm run dev
```

Production build:
```bash
npm run build
npm start
```

## Core domains
- `src/lib/competition-config.ts` — competition-specific policies and starter templates.
- `src/lib/fairdraw.ts` — constrained question selection and draw commitment.
- `src/lib/store.ts` — executable local workflow state and Firebase-auth-gated sync.
- `src/lib/permissions.ts` — granular RBAC map.
- `src/lib/quran-vault.ts` — approved Quran source fixtures; LLM output is never a source of truth.
- `src/components/judge/JudgeOS.tsx` — distraction-free, policy-driven judging.
- `src/components/admin/CompetitionOverview.tsx` — Competition DNA and operational administration.

## Product principles
1. Complexity belongs to the system, not the user.
2. Humans handle exceptions, not routine.
3. Human judges decide; AI only recommends review.
4. Data is entered once and follows the participant to the certificate.
5. Each role sees only its job.
6. Each competition defines its own rules.
7. No external capability is presented as working until a real provider/certificate exists.

See `PROJECT_STATUS.md` for the exact boundary between implemented code and deployment-time external dependencies.

## Product rule: no global competition law
MIZAN provides configurable infrastructure, not one hard-coded competition format. Every competition has its own versioned policy and may differ in registration, eligibility, categories, question selection, panel structure, judge specialization, scoring, tie-breaks, appeals, result visibility, certificates, privacy and automation.
