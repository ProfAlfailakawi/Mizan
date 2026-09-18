# سرّا التوقيع — لماذا، وكيف، وبأيّ ترتيب

## ما لا يعمل اليوم في الإنتاج

`cloudbuild.yaml` يضبط متغيّرات التشغيل وسرَّين (مفتاحا R2). **وهذان ليسا فيهما** —
ولم يُضبطا في أيّ نشرة:

| المتغيّر | ما يتعطّل بغيابه | الدليل |
|---|---|---|
| `MIZAN_PASS_SIGNING_SECRET` | إصدارُ بطاقات الدخول والتحقّقُ منها · **وحفظُ الأسئلة (question escrow)** | `server.ts` — `PASS_SIGNING_NOT_CONFIGURED` · `questionEscrowConfigured` |
| `MIZAN_CERT_SIGNING_SECRET` | التحقّقُ من الشهادة | `server.ts` — `CERTIFICATE_REPOSITORY_NOT_CONNECTED` |

وأثقلُهما تشغيليًّا **حفظُ الأسئلة**: هو ما يمنع كشفَ السؤال قبل أوانه يوم المسابقة،
وهو مُطفأٌ الآن لأن شرطَه `!!process.env.MIZAN_PASS_SIGNING_SECRET`.

> **وما يعمل رغم ذلك:** صفحةُ التحقّق العامّ تُعالج تعذُّرَ الوصول بأمانة — تقول
> «تعذّر التحقق الآن… وهذا لا يعني أن الشهادة غير صحيحة» ولا تحكم ببطلانها. فالعطلُ
> نقصُ ميزةٍ لا كذبٌ على القارئ.

## لماذا هما `WARNING` لا `BLOCKER`

`server/production-config-guard.ts` يصنّف غيابَهما تنبيهًا، فتُقلع الخدمةُ وتعمل ثم
تردّ `503` عند أوّل استعمال. وهذا تصنيفٌ قائمٌ في الشيفرة، لم يُغيَّر من هنا.

## لماذا لا يُنشئهما المساعد

هذان **سرّان**. ولا يُولَّد سرٌّ ولا يُكتب في مستودعٍ أبدًا. فتوليدُهما ووضعُهما في
Secret Manager عملُ المالك وحده.

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
١٦ محرفًا أو من القيم النائبة المعروفة (`changeme`, `secret`, …) — **رفضًا مانعًا
للإقلاع**، لا تنبيهًا. فلا تضع قيمةً من عندك.

### ٢) امنح حسابَ الخدمة حقَّ القراءة

حسابُ تشغيل Cloud Run هو الذي يقرأ السرّ:

```bash
gcloud run services describe mizan --region=me-central1 --project=mizan-f2ce3 --format='value(spec.template.spec.serviceAccountName)'
```

ثم — ضع الناتج مكان `⟦SA⟧`:

```bash
for S in MIZAN_PASS_SIGNING_SECRET MIZAN_CERT_SIGNING_SECRET; do gcloud secrets add-iam-policy-binding "$S" --member="serviceAccount:⟦SA⟧" --role=roles/secretmanager.secretAccessor --project=mizan-f2ce3; done
```

### ٣) قل «سويتهم» — وأربطهما أنا

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

---

## وسجلُّ الشهادات

`MIZAN_CERTIFICATE_REGISTRY_DIR` **أُضيف بالفعل** إلى `cloudbuild.yaml` على
`/mnt/authority/certificates` — الوحدةِ الدائمة نفسها التي تحمل سلطةَ النزاهة. وهو
مسارٌ لا سرّ، والسجلُّ يُنشئ مجلَّده بصلاحية `0700`. يسري مع أوّل نشرة.

## وإبدال سرٍّ لاحقًا

إضافةُ نسخةٍ جديدة تُبطل ما وُقِّع بالقديمة: كلُّ بطاقةٍ وشهادةٍ وُقِّعت بالسرّ السابق
تصير غيرَ صالحة. فلا يُبدَّل سرٌّ أثناء مسابقةٍ قائمة.

```bash
openssl rand -base64 48 | gcloud secrets versions add MIZAN_PASS_SIGNING_SECRET --data-file=- --project=mizan-f2ce3
```
