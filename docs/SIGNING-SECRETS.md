# سرّا التوقيع — لماذا، وكيف، وبأيّ ترتيب

## ما لا يعمل اليوم في الإنتاج

`cloudbuild.yaml` يضبط متغيّرات التشغيل وسرَّين (مفتاحا R2). **وهذان ليسا فيهما** —
ولم يُضبطا في أيّ نشرة:

| المتغيّر | ما يتعطّل بغيابه | الدليل |
|---|---|---|
| `MIZAN_PASS_SIGNING_SECRET` | إصدارُ بطاقات الدخول والتحقّقُ منها · **وحفظُ الأسئلة (question escrow)** | `server.ts` — `PASS_SIGNING_NOT_CONFIGURED` · `questionEscrowConfigured` |
| `MIZAN_CERT_SIGNING_SECRET` | التحقّق الموقّع من الشهادة | `server.ts` — `CERTIFICATE_REPOSITORY_NOT_CONNECTED` |

وأثقلُهما تشغيليًّا **حفظُ الأسئلة**: هو ما يمنع كشفَ السؤال قبل أوانه يوم المسابقة،
وهو مُطفأٌ الآن لأن شرطَه `!!process.env.MIZAN_PASS_SIGNING_SECRET`.

> **وما يعمل رغم ذلك:** عملية الخادم نفسها تستطيع الإقلاع، وصفحةُ التحقّق العامّ تعالج
> تعذّر الوصول بأمانة. لكن «الخدمة تقلع» ليست مساويةً لـ«جاهزة لإطلاق تجاري».

## لماذا صارا مانعَي إطلاق

غياب السرّين لا يمنع Node من الإقلاع، لكنه يترك مسارين مطلوبين في يوم المسابقة يردّان
`503`: حفظ/كشف الأسئلة الآمن، والتحقق الموقّع من الشهادات. لذلك يصنّفهما
`scripts/go-live-preflight.mjs` **موانع إطلاق تجاري**.

هذا لا يعني كتابة السرّ في المستودع، ولا ربط اسم سرٍّ غير موجود. المعنى فقط أن تقرير
الجاهزية لا يصف نشرًا ناقصًا بأنه جاهز.

## لماذا لا يُنشئهما المساعد داخل المستودع

هذان **سرّان**. ولا يُولَّد سرٌّ ولا يُكتب في مستودعٍ أبدًا. إنشاؤهما ووضعهما في
Secret Manager عملُ تشغيلٍ خارج git. وبعد وجودهما يمكن ربط اسميهما في `cloudbuild.yaml`
بلا كشف قيمتهما.

---

## الخطوات — بالترتيب، والترتيبُ يهمّ

### ١) أنشئ السرّين

من Cloud Shell، **كلُّ أمرٍ في سطرٍ واحد**:

```bash
gcloud auth login
```

```bash
openssl rand -base64 48 | gcloud secrets create MIZAN_PASS_SIGNING_SECRET --data-file=- --project=mizan-f2ce3
```

```bash
openssl rand -base64 48 | gcloud secrets create MIZAN_CERT_SIGNING_SECRET --data-file=- --project=mizan-f2ce3
```

`openssl rand -base64 48` يولّد ٤٨ بايتًا عشوائية. والحارسُ يرفض أيَّ سرٍّ أقصرَ من
١٦ محرفًا أو من القيم النائبة المعروفة (`changeme`, `secret`, …). **لا تضع قيمةً من
عندك ولا تلتزمها في git.**

### ٢) امنح حسابَ الخدمة حقَّ القراءة

حسابُ تشغيل Cloud Run هو الذي يقرأ السرّ:

```bash
gcloud run services describe mizan --region=me-central1 --project=mizan-f2ce3 --format='value(spec.template.spec.serviceAccountName)'
```

ثم — ضع الناتج مكان `⟦SA⟧`:

```bash
for S in MIZAN_PASS_SIGNING_SECRET MIZAN_CERT_SIGNING_SECRET; do gcloud secrets add-iam-policy-binding "$S" --member="serviceAccount:⟦SA⟧" --role=roles/secretmanager.secretAccessor --project=mizan-f2ce3; done
```

### ٣) اربطهما بعد التأكد من وجودهما

يصير السطرُ في `cloudbuild.yaml`:

```yaml
      - '--update-secrets'
      - 'R2_ACCESS_KEY_ID=R2_ACCESS_KEY_ID:latest,R2_SECRET_ACCESS_KEY=R2_SECRET_ACCESS_KEY:latest,MIZAN_PASS_SIGNING_SECRET=MIZAN_PASS_SIGNING_SECRET:latest,MIZAN_CERT_SIGNING_SECRET=MIZAN_CERT_SIGNING_SECRET:latest'
```

**ولا يُدفع هذا السطر قبل وجود السرّين:** `gcloud run deploy` يفشل على سرٍّ غير
موجود، فيسقط النشرُ كلُّه — بما فيه ما لا علاقة له بالشهادات. ولهذا الترتيبُ:
**إنشاءٌ ثم ربط.**

### ٤) تحقّق بعد النشر

```bash
curl -s https://⟦رابط الخدمة⟧/api/health | grep -o '"passSigningConfigured":[a-z]*\|"certificateSigningConfigured":[a-z]*\|"questionEscrowConfigured":[a-z]*'
```

المطلوب `true` ثلاثًا.

ثم شغّل بوابة الجاهزية من بيئة تحمل القيم الفعلية:

```bash
npm run preflight
```

ويجب ألا يظهر أيٌّ من السرّين في قسم «موانع».

---

## وسجلُّ الشهادات

`MIZAN_CERTIFICATE_REGISTRY_DIR` **أُضيف بالفعل** إلى `cloudbuild.yaml` على
`/mnt/authority/certificates` — الوحدةِ الدائمة نفسها التي تحمل سلطةَ النزاهة. وهو
مسارٌ لا سرّ، والسجلُّ يُنشئ مجلَّده بصلاحية `0700`.

## وإبدال سرٍّ لاحقًا

إضافةُ نسخةٍ جديدة تُبطل ما وُقِّع بالقديمة إذا لم يكن هناك key-versioning/rotation
مقصود في طبقة التحقق. لذلك **لا يُبدّل سرٌّ أثناء مسابقةٍ قائمة** دون خطة تدوير واضحة.

```bash
openssl rand -base64 48 | gcloud secrets versions add MIZAN_PASS_SIGNING_SECRET --data-file=- --project=mizan-f2ce3
```
