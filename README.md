# MIZAN — ميزان
## Operating System for Quran Competitions

MIZAN runs a Quran competition from end to end: online registration and eligibility, arrival and self check-in, queueing and committee routing, the FairDraw question draw, human judging, advisory integrity review, sealed results, appeals, ceremony reveal and verifiable certificates. One deployment serves many organizations (multi-tenant SaaS), each with its own competitions and policies. The interface is Arabic-first, with English available.

- **Live site:** <https://mizan-quran.web.app/> (marketing surface; Firebase Hosting rewrites to the Cloud Run service `mizan` in `me-central1`)
- **Owner console:** <https://mizan-quran.web.app/admin>
- **Demo sandbox:** <https://mizan-quran.web.app/demo> (synthetic data, isolated from real tenants)
- **Health:** <https://mizan-quran.web.app/api/health>

[![CI](https://github.com/ProfAlfailakawi/Mizan/actions/workflows/ci.yml/badge.svg)](https://github.com/ProfAlfailakawi/Mizan/actions/workflows/ci.yml)
[![Runtime dependency security](https://github.com/ProfAlfailakawi/Mizan/actions/workflows/runtime-dependency-security.yml/badge.svg)](https://github.com/ProfAlfailakawi/Mizan/actions/workflows/runtime-dependency-security.yml)
[![Scheduled QA](https://github.com/ProfAlfailakawi/Mizan/actions/workflows/scheduled-qa.yml/badge.svg)](https://github.com/ProfAlfailakawi/Mizan/actions/workflows/scheduled-qa.yml)
[![Heavy fairness](https://github.com/ProfAlfailakawi/Mizan/actions/workflows/heavy-fairness.yml/badge.svg)](https://github.com/ProfAlfailakawi/Mizan/actions/workflows/heavy-fairness.yml)
[![Deploy to Cloud Run](https://github.com/ProfAlfailakawi/Mizan/actions/workflows/deploy-cloud-run.yml/badge.svg)](https://github.com/ProfAlfailakawi/Mizan/actions/workflows/deploy-cloud-run.yml)

The key architectural rule is that **there is no universal competition rulebook in code**. Every competition has its own `CompetitionPolicy`, RuleSet, categories, judging actions, result policy, appeal policy, automation level and workflow.

---

## Feature map — خريطة الميزات

Status: **Working (يعمل)** = implemented, tested and reachable in production. **Trial (تجريبي)** = shipped but labelled trial / gated by a benchmark. **In development (قيد التطوير)** = the contract and gates exist, the capability is not switched on.

Public routes use the URL hash (for example `#register?comp=<competitionId>`); competition-specific links need a real competition id.

| Feature — الميزة | What it does — ما تفعله | Live link — الرابط | Code — الشيفرة | Status — الحالة |
|---|---|---|---|---|
| Marketing site and owner console | One build serves the marketing surface and the owner console (`/admin`); the surface is chosen by host and path. Retired hosts redirect. | [/](https://mizan-quran.web.app/) · [/admin](https://mizan-quran.web.app/admin) | [src/lib/host-surface.ts](src/lib/host-surface.ts), [src/components/marketing/MarketingSite.tsx](src/components/marketing/MarketingSite.tsx), [server/retired-hosts.ts](server/retired-hosts.ts) | Working |
| Demo sandbox | A synthetic competition universe lives in the browser tab; the server gate is closed by default for demo requests, so they never reach identity, audit, Firestore, R2, AI, payments or mail. | [/demo](https://mizan-quran.web.app/demo) | [server/demo-sandbox.ts](server/demo-sandbox.ts), [src/lib/demo-transport.ts](src/lib/demo-transport.ts), [docs/DEMO-MODE.md](docs/DEMO-MODE.md) | Working |
| Competition DNA (per-competition policy) | Each competition owns a versioned policy for registration, categories and riwaya, FairDraw, judging, results, appeals, certificates, privacy and automation. Templates are only starting points. | in-app (org/competition admin) | [src/lib/competition-config.ts](src/lib/competition-config.ts), [src/components/admin/CompetitionOverview.tsx](src/components/admin/CompetitionOverview.tsx) | Working |
| Public competition page and registration | Landing page, category-bound registration (riwaya required and checked on the server), optional paid registration, reminders. | `#competition?comp=…` · `#register?comp=…` | [src/components/public/CompetitionLanding.tsx](src/components/public/CompetitionLanding.tsx), [src/components/public/RegistrationFlow.tsx](src/components/public/RegistrationFlow.tsx), [server/public-registration.ts](server/public-registration.ts) | Working |
| Participant and guardian journey | A journey link (competition + access key) shows status, queue, result per policy, appeal and certificate. | `#journey?comp=…&key=…` · `#guardian?…` | [src/components/public/JourneyAccess.tsx](src/components/public/JourneyAccess.tsx), [src/components/participant/ParticipantDashboard.tsx](src/components/participant/ParticipantDashboard.tsx) | Working |
| Discover directory | Public directory of published competitions. | [#discover](https://mizan-quran.web.app/#discover) | [src/components/public/DiscoverDirectory.tsx](src/components/public/DiscoverDirectory.tsx) | Working |
| Reciter passport | A participant-held record across competitions, with self-service update and erase. | [#passport](https://mizan-quran.web.app/#passport) | [src/components/public/PassportView.tsx](src/components/public/PassportView.tsx), [server/passport.ts](server/passport.ts) | Working |
| Gate kiosk and QR check-in | Self check-in by QR (camera or USB scanner) or manual code, with an exception fallback; routes to a compatible, lower-load committee. | in-app (venue surface) | [src/components/gate/KioskMode.tsx](src/components/gate/KioskMode.tsx), [src/lib/arrival-core.ts](src/lib/arrival-core.ts) | Working |
| Venue boards | Waiting board, corridor screen, committee display and hall recitation map for any TV, using participant codes by default for privacy. | `#board?…` | [src/components/public/WaitingBoard.tsx](src/components/public/WaitingBoard.tsx), [src/components/public/CorridorScreen.tsx](src/components/public/CorridorScreen.tsx), [src/components/public/CommitteeDisplay.tsx](src/components/public/CommitteeDisplay.tsx), [src/lib/display-board.ts](src/lib/display-board.ts) | Working |
| FairDraw question draw | Selects questions from the approved pool only, within the category scope, with difficulty and diversity constraints. A fresh 256-bit seed is committed (SHA-256) and revealed in the receipt so the draw can be replayed. See the limits below. | in-app (judge / head judge) | [src/lib/fairdraw.ts](src/lib/fairdraw.ts), [src/lib/question-engine.ts](src/lib/question-engine.ts), [FAIRDRAW.md](FAIRDRAW.md) | Working |
| Question escrow and secure runtime | The judge's device receives a question only after presence and approval checks, one question at a time. | in-app (judge) | [server/question-escrow.ts](server/question-escrow.ts), [server/secure-question-runtime.ts](server/secure-question-runtime.ts) | Working (needs server configuration) |
| JudgeOS | A focused judging cockpit driven by the competition policy (all-criteria, specialized or hybrid panels; event-based or direct scores). It switches to a two-pane layout from 600 px wide. Submissions stay independent until lock. | in-app (judge) | [src/components/judge/JudgeOS.tsx](src/components/judge/JudgeOS.tsx), [src/components/judge/OfficialMushafSurface.tsx](src/components/judge/OfficialMushafSurface.tsx) | Working |
| Head judge, calibration and blind rescoring | Management by exception, judge drift and calibration, blind rescoring plans and measurement. | in-app (head judge) | [src/components/head-judge/HeadJudgeInbox.tsx](src/components/head-judge/HeadJudgeInbox.tsx), [server/judge-calibration.ts](server/judge-calibration.ts), [server/blind-rescoring.ts](server/blind-rescoring.ts) | Working |
| Advisory integrity review (AI) | Flags sessions for human review. It never deducts a score and is not on the critical path (`aiCriticalPath: false`). | in-app | [src/lib/judging-integrity.ts](src/lib/judging-integrity.ts), [AI_INTEGRITY.md](AI_INTEGRITY.md) | Working (advisory only) |
| Result sealing and publication | The server builds the result seal from stored inputs, records attestations and publishes results according to the competition policy. | in-app | [server/result-sealing.ts](server/result-sealing.ts), [server/seal-inputs.ts](server/seal-inputs.ts), [server/result-publication.ts](server/result-publication.ts) | Working |
| Certificate and trust verification | Public verification of certificates and signed trust payloads. | [#verify](https://mizan-quran.web.app/#verify) · [#trust-verify](https://mizan-quran.web.app/#trust-verify) | [src/components/public/CertificateVerification.tsx](src/components/public/CertificateVerification.tsx), [src/components/public/TrustVerification.tsx](src/components/public/TrustVerification.tsx), [server/certificate-registry.ts](server/certificate-registry.ts) | Working |
| Ceremony and command center | Explicit result reveal for the hall, and an exceptions-first operations view. | in-app (broadcast / ops) | [src/components/public/CeremonyView.tsx](src/components/public/CeremonyView.tsx), [src/components/operations/CommandCenter.tsx](src/components/operations/CommandCenter.tsx) | Working |
| Official Quran source (KFGQPC) | Quran text, Mushaf pages, fonts and audio come only from approved King Fahd Complex (KFGQPC) packages that are locked by hash and served by the server and R2. LLM output is never a source of Quran text. | `/api/public/kfgqpc/...` | [server/kfgqpc-delivery.ts](server/kfgqpc-delivery.ts), [server/kfgqpc-official-library.ts](server/kfgqpc-official-library.ts), [src/lib/quran-vault.ts](src/lib/quran-vault.ts), [QURAN_SOURCE_GOVERNANCE.md](QURAN_SOURCE_GOVERNANCE.md), [KFGQPC_SOURCE_LOCK.md](KFGQPC_SOURCE_LOCK.md) | Working |
| Practice: "the Mushaf listens" (position tracking) | During practice, an alignment engine follows **where** the reciter is (ayah/word, pauses, repeats). It does not report what was said and it writes no score or evidence. | in-app (participant practice) | [src/components/participant/MushafListens.tsx](src/components/participant/MushafListens.tsx), [src/components/participant/PracticeStudio.tsx](src/components/participant/PracticeStudio.tsx), [server/quran-alignment-engine.ts](server/quran-alignment-engine.ts), [services/quran-practice-listener/app.py](services/quran-practice-listener/app.py) | Trial |
| Practice: "Al-Muaalem" tashkeel and tajweed notes | A post-recitation training mirror for **Hafs only** (vowel marks, shadda, madd, ghunna). It keeps no audio and writes no score. In production it runs in `trial` mode; the Hafs benchmark report is still `NOT_MEASURED`, so it cannot be opened without the trial label. | in-app (participant practice) | [services/quran-muaalem/app.py](services/quran-muaalem/app.py), [server/muaalem-gate.ts](server/muaalem-gate.ts), [src/components/participant/TashkeelReport.tsx](src/components/participant/TashkeelReport.tsx) | Trial |
| Word-level recognition (mistake detection) | The contract for an engine that returns heard words, gated per riwaya by a benchmark report. It will not say "you made a mistake" without that gate. No such engine is certified today. | — | [server/recitation-recogniser.ts](server/recitation-recogniser.ts), [docs/ASR-ENGINE.md](docs/ASR-ENGINE.md) | In development |
| Multi-tenant SaaS | Organizations, licences, plans, operators, quotas, tenant branding, domains and usage, with an audit history. | [/admin](https://mizan-quran.web.app/admin) | [server/saas-platform.ts](server/saas-platform.ts), [src/components/admin/SaaSWorkspace.tsx](src/components/admin/SaaSWorkspace.tsx), [SAAS_PLATFORM.md](SAAS_PLATFORM.md) | Working |
| Registration payments | Provider profiles (for example Tap, MyFatoorah, Stripe) with checkout and a webhook. Active only when an organization configures a gateway. | via registration | [server/payments.ts](server/payments.ts), [server/payment-presets.ts](server/payment-presets.ts) | Working (needs a configured gateway) |
| Identity and access | Sign-in, TOTP, invitations, grants, password reset, SSO; role-based permissions per tenant and competition. | `#reset-password` | [src/components/auth/AuthPortal.tsx](src/components/auth/AuthPortal.tsx), [server/identity-governance.ts](server/identity-governance.ts), [server/sso.ts](server/sso.ts), [src/lib/permissions.ts](src/lib/permissions.ts) | Working |
| Notifications (email/SMS/WhatsApp/push) | Notification records with consent, retry and fallback. Delivery needs an external provider; none is configured in production (`notificationProviderConfigured: false`), and no delivery is ever reported as successful without one. | — | [server/notification-center.ts](server/notification-center.ts), [server/communications.ts](server/communications.ts) | In development (no provider) |
| Audit ledger | A hash-chained audit history kept in a shared durable store. | — | [server/audit-ledger.ts](server/audit-ledger.ts), [server/durable-audit-ledger.ts](server/durable-audit-ledger.ts) | Working |
| "We're updating" page | Shown during a deploy instead of a Google error page. | — | [public/updating.html](public/updating.html), [server/updating-page.ts](server/updating-page.ts) | Working |
| ORBIT error sensor | A small client script that reports front-end errors to the ORBIT error collector at `orbitq8.web.app` (allowed in the production CSP). | — | [public/orbit-sensor.js](public/orbit-sensor.js) | Working |
| Apple native shell (iOS/iPadOS/Mac) | A Capacitor shell, store metadata and a release script. App Store availability is not confirmed from this repository. | — | [apple/](apple/), [apple-release/](apple-release/) | Trial |

### What MIZAN does not claim

- **FairDraw** proves that a draw met the competition's configured constraints. It does not claim absolute fairness. Known limit: the live-draw secret is generated on the device that runs the draw. It is unpredictable to participants, but it is not bound in advance to the server-side commitment (`/api/integrity/fairdraw/commit`). See [FAIRDRAW.md](FAIRDRAW.md).
- **Listening and recognition features are for training only.** Official judging is done by human judges. No recognition engine is certified for any riwaya, and the measured mismatch between Hafs and Warsh in [docs/ASR-ENGINE.md](docs/ASR-ENGINE.md) is the reason each riwaya has its own gate.
- **External capabilities** (notification providers, identity/document verification, HSM signing, broadcast bridges) stay visibly unconfigured until a real provider exists.

---

## Architecture

- **Client:** React 19 + Vite 6 + Tailwind 4 SPA in [src/](src/). The entry point is [src/main.tsx](src/main.tsx), role-based routing is in [src/App.tsx](src/App.tsx), and the main workflow state is in [src/lib/store.ts](src/lib/store.ts).
- **Server:** a single Express server, [server.ts](server.ts), with domain modules in [server/](server/). It is bundled to `dist/server.cjs` and runs on Cloud Run (`me-central1`) from the [Dockerfile](Dockerfile).
- **Data:** Firestore with tenant-scoped rules in [firestore.rules](firestore.rules). Quran assets live in private R2 storage ([server/r2-private.ts](server/r2-private.ts)).
- **Python services** (each a separate Cloud Run service): [services/quran-practice-listener/](services/quran-practice-listener/) (faster-whisper-based practice listener; a GPU variant is in [docs/LISTENER-GPU.md](docs/LISTENER-GPU.md)) and [services/quran-muaalem/](services/quran-muaalem/) (Wav2Vec2-BERT tashkeel/tajweed notes).
- **Shared code:** [shared/](shared/) holds input validation, currency and waqf symbols.

Key server endpoints (all in [server.ts](server.ts)):

| Endpoint | Purpose |
|---|---|
| `GET /api/health`, `GET /api/version`, `GET /api/time` | Health and configuration flags, build id, trusted time |
| `GET /demo` | Demo sandbox entry ([server/demo-sandbox.ts](server/demo-sandbox.ts)) |
| `GET/POST /api/public/competitions/...` | Published competitions, registration, payment checkout and status |
| `POST /api/public/journeys/...` | Journey resolution and practice endpoints |
| `GET /api/public/kfgqpc/...` | Approved Mushaf pages, fonts, passages, word timings, FairDraw pool |
| `POST /api/quran/fairdraw/balanced`, `/api/integrity/fairdraw/*` | Balanced draw, commit / reveal |
| `/api/question-escrow/:sessionId/*` | Judge-side question escrow |
| `POST /api/judging/blind-rescoring/*` | Blind rescoring plan and measurement |
| `POST /api/results/seal`, `/api/results/publish`, `/api/results/seal/verify` | Result sealing and publication |
| `/api/public/passports/*` | Reciter passport |
| `/api/saas/*`, `/api/owner/*`, `/api/v1/*` | Multi-tenant control plane and public plan / discover API |

More design documents: [ARCHITECTURE.md](ARCHITECTURE.md), [DATA_MODEL.md](DATA_MODEL.md), [TRUST_ARCHITECTURE.md](TRUST_ARCHITECTURE.md), [SCOPE_ENGINE.md](SCOPE_ENGINE.md), [COMMITTEE_DISTRIBUTION_ENGINE.md](COMMITTEE_DISTRIBUTION_ENGINE.md), [QURAN-INTELLIGENCE.md](QURAN-INTELLIGENCE.md), [docs/QURAN-READING-ARCHITECTURE.md](docs/QURAN-READING-ARCHITECTURE.md).

---

## Run locally

Requires Node `>=22.20.0 <23` and npm `>=10 <12` (see `engines` in [package.json](package.json)). Copy [.env.example](.env.example) to `.env` and fill in only what you need. Never commit real values.

```bash
npm ci
npm run dev        # tsx server.ts (API + Vite middleware)
```

Production build:

```bash
npm run build
npm start          # runs config:validate first, then node dist/server.cjs
```

### Main scripts

| Script | What it runs |
|---|---|
| `npm run dev` | `tsx server.ts` |
| `npm run build` | PWA and demo-entry checks, `vite build`, copy legal documents, bundle `server.ts` with esbuild |
| `npm start` | `node dist/server.cjs` (after `config:validate`) |
| `npm run lint` | `tsc --noEmit` |
| `npm test` | `tsx --test tests/*.test.ts` |
| `npm run test:ci` | Same tests, with TAP and JUnit output (used by CI) |
| `npm run check` | secret-scan + source-audit + production-audit + lint + test + build |
| `npm run secret-scan` / `source-audit` / `arabic-ui-audit` | Repository hygiene audits |
| `npm run qa:firestore-rules` | Firestore rules tests on the emulator (needs Java + firebase-tools) |
| `npm run fairness:gate` / `fairness:lab` / `fairness:adversarial` | FairDraw fairness checks |
| `npm run preflight` | Go-live preflight |
| `npm run quran:verify-local` / `quran:verify-r2` | KFGQPC source verification |
| `npm run quran:asr-conformance` / `quran:asr-benchmark` | Recognition contract and benchmark tools |

See [package.json](package.json) for the full list (QA rig, visual QA, KFGQPC ingestion, load rehearsal).

---

## Tests and quality gates

- **Unit and integration tests:** the 374 `*.test.ts` files in [tests/](tests/). Examples: [tests/fairdraw.test.ts](tests/fairdraw.test.ts), [tests/fairdraw-seed-scheme.test.ts](tests/fairdraw-seed-scheme.test.ts), [tests/demo-sandbox-isolation.test.ts](tests/demo-sandbox-isolation.test.ts), [tests/recitation-recogniser.test.ts](tests/recitation-recogniser.test.ts), [tests/host-surface.test.ts](tests/host-surface.test.ts), and the `firestore-rules-*.test.ts` emulator suite.
- **CI on every push and PR to `main`:** [.github/workflows/ci.yml](.github/workflows/ci.yml) runs type check, tests, the port contract, Firestore rules on the emulator, source and Arabic UI audits, the build, and a real Docker image build.
- **Dependency security:** [.github/workflows/runtime-dependency-security.yml](.github/workflows/runtime-dependency-security.yml) runs on PRs, on pushes to `main` and weekly.
- **Scheduled QA:** [.github/workflows/scheduled-qa.yml](.github/workflows/scheduled-qa.yml) and [.github/workflows/heavy-fairness.yml](.github/workflows/heavy-fairness.yml) (large-scale fairness simulation).
- **Manual release gates (need secrets):** [.github/workflows/release-gates.yml](.github/workflows/release-gates.yml).
- **Recognition benchmarks (manual or path-triggered):** [.github/workflows/muaalem-benchmark.yml](.github/workflows/muaalem-benchmark.yml), [.github/workflows/listener-benchmark.yml](.github/workflows/listener-benchmark.yml).
- Testing notes: [TESTING.md](TESTING.md), [ROLE_TEST_MATRIX.md](ROLE_TEST_MATRIX.md), [docs/QUALITY-SCORECARD.md](docs/QUALITY-SCORECARD.md).

---

## Deployment

Deployment is **manual only**.

1. [.github/workflows/deploy-cloud-run.yml](.github/workflows/deploy-cloud-run.yml) ("نشر ميزان إلى Cloud Run") is triggered by `workflow_dispatch`. It checks out `main`, **refuses to deploy unless the same commit passed CI**, authenticates to Google Cloud without a long-lived key, and runs `gcloud builds submit` with [cloudbuild.yaml](cloudbuild.yaml). That build deploys the `mizan` service plus the listener and Muaalem services, then checks that Cloud Run serves the same commit and that the legal documents are published.
2. Firebase Hosting ([firebase.json](firebase.json)) rewrites `mizan-quran.web.app` to the Cloud Run service. The old `mizan-f2ce3.web.app` site redirects there.
3. Firestore rules are deployed separately (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).
4. Other manual workflows: [.github/workflows/deploy-listener-gpu.yml](.github/workflows/deploy-listener-gpu.yml) (GPU listener and routing), [.github/workflows/kfgqpc-ingest.yml](.github/workflows/kfgqpc-ingest.yml) (KFGQPC package ingestion, dry-run by default), [.github/workflows/cue-audio.yml](.github/workflows/cue-audio.yml).

Runbooks: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/GO-LIVE.md](docs/GO-LIVE.md), [docs/ROLLBACK.md](docs/ROLLBACK.md), [docs/BACKUP-RESTORE.md](docs/BACKUP-RESTORE.md), [docs/OPERATIONS.md](docs/OPERATIONS.md), [CLOUD_TROUBLESHOOTING.md](CLOUD_TROUBLESHOOTING.md).

---

## Product principles

1. Complexity belongs to the system, not the user.
2. Humans handle exceptions, not routine.
3. Human judges decide; AI only recommends review.
4. Data is entered once and follows the participant to the certificate.
5. Each role sees only its job.
6. Each competition defines its own rules.
7. No external capability is presented as working until a real provider or certificate exists.

### Product rule: no global competition law

MIZAN provides configurable infrastructure, not one hard-coded competition format. Every competition has its own versioned policy and may differ in registration, eligibility, categories, question selection, panel structure, judge specialization, scoring, tie-breaks, appeals, result visibility, certificates, privacy and automation.

### Demo and review entry

The demo is reached at [/demo](https://mizan-quran.web.app/demo) or from the sign-in screen. A yellow demo bar switches between roles, resets the data and exits. Demo data is synthetic and lives only in the browser tab. The server side can be turned off with `MIZAN_DEMO_ENABLED=false`, and a build can drop the demo with `VITE_DISABLE_DEMO_MODE=true`. In authenticated production mode (`VITE_REQUIRE_AUTH=true`), claims route each account to its permitted role. Details: [docs/DEMO-MODE.md](docs/DEMO-MODE.md).

---

## Further reading

- Status history: [PROJECT_STATUS.md](PROJECT_STATUS.md) (older entries predate the production deployment), [docs/REMAINING-WORK.md](docs/REMAINING-WORK.md), [docs/HANDOVER.md](docs/HANDOVER.md)
- Security: [SECURITY.md](SECURITY.md), [SECURITY-TODO.md](SECURITY-TODO.md)
- Accessibility and localization: [ACCESSIBILITY.md](ACCESSIBILITY.md), [LOCALIZATION.md](LOCALIZATION.md)
- Legal documents (Arabic): [docs/legal/](docs/legal/)

---

آخر تحديث للتوثيق: 2026-11-12
