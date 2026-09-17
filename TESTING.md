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

**بوابات §103 — شُغِّلت كلُّها ونجحت:**

| البوابة | النتيجة |
|---|---|
| `check:model` | ✅ ١١٤٨٨١ حالة · **٠ ثابت مكسور** (٧ ثوابت صمدت) |
| `fairness:lab` | ✅ ALL SCENARIOS PASSED |
| `fairness:adversarial` | ✅ ٣٦ تهيئة · **خروق قاطعة: نطاق ٠ · رواية ٠ · تكرار ٠** |
| `fairness:gate` | ✅ يجتاز ميزانية العدالة بلا تدهور |
| `oracle:benchmark` | ✅ بلا تناقض · ٣/٣ مسائل بلغت الأمثل المُثبَت · ٠ قرار جدوى كاذب |
| `load:rehearsal` | ✅ ٢٠٠ مشارك · ٢٠٠ موافَق · ٠ مخالف · الترتيب حتمي |
| `drill:failure` | ✅ ١٨٠ حكمًا · **١٨٠ مُستعادًا · ٠ مفقود · ٠ محتسَب مرتين** |
| `qa:firestore-rules` | ✅ ٧٠/٧٠ على المحاكي |
| `qa:venue-legibility` | ✅ كل نصٍّ مقيس يحقّق AA · الكود المنادى به يُقرأ من ١٩٫٢ م |
| `preflight` | ⛔ مانعٌ واحد: `VITE_REQUIRE_AUTH` — **مانعٌ بيئيّ مقصود** (لا يُعَدّ النشر حقيقيًا فتُزرع بيانات العرض)، وليس عطلًا في الشيفرة |

> **`fairness:gate` يُلحق سجلًّا** بـ`tests/fixtures/fairness-frontier-history.json` عند كل
> تشغيل. يُعاد ذلك السجلّ ولا يُلتزَم من بيئةٍ عابرة: يحمل أرقامها (`heapUsedMb`) بنفس
> `engineVersion` و`scenario` لقياسات الإصدار، فيصير قياسُ صندوقٍ رمليّ غير مميَّزٍ عن قياس
> إصدار. وخطُّ الأساس الحاكم `fairness-baseline.json` لا يُكتب إلا بـ`--write-baseline`.

**شُغِّل ووقف على حدٍّ بيئيّ (لا عطلَ منتج):**

- `qa:scope-visual` — يسقط على تعذّر الوصول إلى Firestore
  (`ERR_TUNNEL_CONNECTION_FAILED`، «Could not reach Cloud Firestore»)، والسكربت نفسه يسمّيها
  «خدمة خارجية غير متاحة في بيئة الفحص». فيبقى `BLOCKED_BY_RUNTIME_SECRET`.

- `qa:competition-day` في متصفّحٍ حقيقي على `vite preview`: المتصفّح يعمل، والصفحة تُحمَّل
  **بلا أي خطأ تشغيل** (`pageerror` = صفر)، وعنوانها صحيح. ثم يقف عند **شاشة الدخول**:
  الظاهر زرّان فقط («دخول آمن»، «نسيت كلمة المرور؟») ولا أزرارَ أدوارٍ يضغطها السكربت،
  فيسجّل «تعذّر الدخول بدور المحكم/المدقق». والسببُ اعتمادُ هوية غير مهيّأ لا خللٌ في
  السكربت ولا في المنتج — والتطبيق يطلب الدخول افتراضًا وهو السلوك الآمن. فيبقى E2E
  الكامل (§104) **`BLOCKED_BY_RUNTIME_SECRET`** حتى تتوفّر اعتمادات Firebase.

  **وصفةُ تشغيل سكربتات المتصفّح هنا:** نسخةُ Playwright في المستودع تطلب بناء Chromium
  رقم 1243، والموجود في هذه الصورة 1194، فيلزم تمرير المسار صراحةً:

  ```bash
  npm run build && npx vite preview --port 4173 --host 127.0.0.1 &
  PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
    npm run qa:venue-legibility
  ```

  وبلا هذا المتغيّر تسقط عند الإقلاع برسالة «Executable doesn't exist» فيُظنّ عطلًا في
  المنتج وهو عطلٌ في مسار المتصفّح. ولا يُشغَّل `npx playwright install` في هذه الصورة.

**لم يُشغَّل — ولا يُدّعى:**
- بناءُ صورة Docker (يشغّله CI؛ لم يُشغَّل هنا).
- `qa:live-day` · `qa:visual-baseline`.
- أي عملية R2 أو Firebase حقيقية (لا اعتمادات في البيئة).
- حملٌ بحجم الحدث المستهدف، وتجربةُ قاعةٍ بميكروفوناتٍ وأجهزةٍ فعلية.
- ولا يوجد `playwright.config` في المستودع؛ سكربتات QA تُشغَّل مباشرةً بـ`node`.

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
