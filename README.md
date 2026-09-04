# ميزان · حزمة ذكاء التحكيم (الملفات المتغيّرة فقط)

هذه **ليست** المشروع كاملًا — فقط الملفات الجديدة/المعدّلة لتنفيذ المقترحات السبعة،
بمساراتها الحقيقية داخل المشروع.

## طريقتان للتطبيق داخل نسختك المحليّة (Downloads/Websites/Mizan)

**(أ) عبر الـ patch (موصى به):**
```bash
cd مجلد-المشروع
git apply --3way mizan-judge-intelligence.patch
npm install && npm run build
```

**(ب) نسخ الملفات يدويًّا:** انسخ محتوى `src/` و`tests/` فوق مثيلاتها في المشروع
(نفس المسارات)، ثم `npm run build`.

> ملفّان معدّلان فقط خارج الملفات الجديدة: `src/App.tsx` و`src/components/public/ExperienceHub.tsx`.
> الباقي ملفات جديدة تمامًا.

## المحتوى
| المسار | الغرض |
|--------|-------|
| `src/lib/fairdraw-parity.ts` | تكافؤ طاقة القرعة (#٣) |
| `src/lib/mudood-engine.ts` | محرك المدود التناسبي (#٢) |
| `src/lib/mutashabihat-radar.ts` | رادار المتشابهات (#١) |
| `src/lib/committee-integrity.ts` | نزاهة اللجان على مستوى اللجنة (#٧) |
| `src/lib/reciter-passport.ts` | سجل القارئ الموحّد (#٥) |
| `src/components/public/BroadcastStage.tsx` | محرك البثّ الحجمي (#٦) |
| `src/components/public/JudgeIntelligenceLab.tsx` | مختبر ذكاء التحكيم + محراب الإحماء (#٤) |
| `src/App.tsx` · `ExperienceHub.tsx` | ربط الواجهتين (تحميل كسول + أزرار) |
| `tests/*.test.ts` | ٢٥ اختبار وحدة (٢٢٠/٢٢٠ ناجحة) |

## الوصول داخل التطبيق
- المختبر: Experience Hub ← «مختبر ذكاء التحكيم»، أو `/#judge-intelligence`
- البثّ: `/#broadcast`

كله استشاري/وضع ظل ولا يمسّ الدرجة. النص وعلامات الوقف توضيحية؛ رسميًّا من حزمة KFGQPC معتمدة.
