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

## Local verification — 2026-09-17

القسمُ أدناه (٢٠٢٦-٠٩-٠٢) صار قديمًا في جزءٍ منه: كان يقول إن حزمة الاختبارات والبناء
لا تُشغَّل في البيئة المحلية. صارت تُشغَّل. وما يلي **شُغِّل فعلًا** في هذه البيئة، ولم
يُحوَّل شيءٌ لم يُشغَّل إلى PASS.

**شُغِّل ونجح:**
- `npm run check` (المركّبة: secret-scan · source-audit · production-audit · lint · test · build) — **خروج 0**.
- `npm run lint` (`tsc --noEmit`) — 0 أخطاء.
- `npm test` — **١٤٥٠ نجحت · 0 فشل** (`tests/*.test.ts`).
- `npm run secret-scan` · `npm run source-audit` (٤٨٢ ملفًا) · `npm run production-audit` — نجحت.
- `npm run arabic-ui-audit` — 14/14.
- `npm run build` — vite + esbuild + حارس PWA.
- **`npm run qa:firestore-rules` — 70/70 على المحاكي.** وهذا هو الحاجز الأخير بين نطاق
  متسابقٍ ومن لا حقّ له فيه، وكان يُعَدّ فحصًا لا يُشغَّل محليًا.
- `npm run config:validate` — على إعدادٍ سليم (خروج 0) وإعدادٍ فاسد (خروج 1).
- `npm run quran:release-matrix` · `npm run quran:verify-r2 -- --dry-run`.

**لم يُشغَّل — ولا يُدّعى:**
- بناءُ صورة Docker (يشغّله CI؛ لم يُشغَّل هنا).
- E2E في متصفّح (§104): لا `playwright.config` في المستودع، وسكربتات QA البصرية تلزمها
  نسخةٌ حيّة من التطبيق واعتمادات.
- `load:rehearsal` · `drill:failure` · `fairness:lab` · `fairness:adversarial` ·
  `fairness:gate` · `check:model` · `qa:scope-visual` · `qa:competition-day` ·
  `qa:live-day` · `qa:venue-legibility`.
- أي عملية R2 أو Firebase حقيقية (لا اعتمادات في البيئة).
- حملٌ بحجم الحدث المستهدف، وتجربةُ قاعةٍ بميكروفوناتٍ وأجهزةٍ فعلية.

**ملاحظة تشغيلية:** حاجزُ قواعد Firestore يلزمه Java ≥ ٢١ (المحاكي يعمل على JVM،
و`firebase-tools 15` لا يقبل ما قبلها). وهي متوفّرة في هذه البيئة (OpenJDK 21)، فيُشغَّل
الحاجز محليًا قبل الدفع بدل تركه لـCI.

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
