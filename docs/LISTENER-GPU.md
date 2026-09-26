# مستمع «يسمعك» على معالجٍ رسوميّ — الكلفةُ والطريق

الفجوةُ الوحيدةُ الجوهريّة أمام «ترتيل» هي سرعةُ التنبيه (docs/TARTEEL-COMPARISON.md): ترتيل
يُنبّه في نحو ثانيتين، وميزانُ في ١٤–٢١ ثانية. وسببُنا الأوّل مقيس: مستمعٌ على CPU يحتاج
٠٫٥–١٫٢ ثانيةَ حسابٍ لكلّ مقطعٍ طولُه ١٫٥ ثانية (المساران معًا)، فيتزاحم الطابورُ ويكبر
التأخّر. على NVIDIA L4 يهبط حسابُ المقطع إلى أجزاء الثانية، فيصير التأخّرُ محكومًا بطول
الدفعة لا بالحساب — وهو الشرطُ اللازم (لا الكافي وحده) لتنبيهٍ في نحو ثانيتين، ولإدخال
نموذجٍ أدقَّ في المسار الحيّ لاحقًا.

## الكلفة (أسعارُ Cloud Run الرسميّة، فُتحت الصفحةُ وقُرئت في ٢٦ سبتمبر ٢٠٢٦)

GPU على Cloud Run يُلزم فوترةَ «مثيلٍ كامل» بأربعة vCPU و16GiB ذاكرة. أسعارُ المستوى الأوّل
(Tier 1، ومنه europe-west1) في الثانية:

| البند | السعر/ثانية | بالساعة |
|---|---|---|
| NVIDIA L4 (بلا تكرارٍ منطقيّ `--no-gpu-zonal-redundancy`) | $0.0001867 | $0.672 |
| 4 vCPU (فوترة مثيل: $0.000018 لكلّ vCPU) | $0.000072 | $0.259 |
| 16 GiB ذاكرة ($0.000002 لكلّ GiB) | $0.000032 | $0.115 |
| **المجموع وقتَ عمل المثيل** | | **≈ $1.05/ساعة ≈ ٠٫٣٢ د.ك/ساعة** |

والخدمةُ تنام إلى الصفر حين لا أحدَ يتدرّب — فالفاتورةُ بساعات الاستخدام لا بالشهر:

| السيناريو | ساعات/شهر | الكلفة/شهر تقريبًا |
|---|---|---|
| تجربةٌ وقياس (ساعتان يوميًّا) | ~61 | **$64 ≈ ٢٠ د.ك** |
| تدريبٌ مفتوح ٦ ساعات يوميًّا | ~183 | **$191 ≈ ٥٩ د.ك** |
| مثيلٌ دائم ٢٤/٧ (`--min-instances 1`) | 730 | **$764 ≈ ٢٣٥ د.ك** |

- المثيلُ الواحد يخدم عدّةَ متدرّبين معًا (`--concurrency 8`): الساعةُ نفسُها تُقتسم.
- بعد نومٍ إلى الصفر، أوّلُ طلبٍ ينتظر إقلاعَ المثيل (صورةُ CUDA أثقل — رتِّب
  `--min-instances 1` في أوقات الدوام والمسابقات فقط).
- بديلٌ أرخص (VM Spot بنحو ربع الثمن) مرفوضٌ هنا: يُنتزع بلا إنذارٍ في منتصف تلاوة،
  ولا ينام إلى الصفر، ويُدار يدويًّا.

## قيدان يُتحقّق منهما عند التنفيذ

1. **الإقليم**: خدماتُ ميزان في `me-central1` (الدوحة)، وGPU على Cloud Run متاحٌ في أقاليمَ
   محدودة. الأقربُ المرشّح `europe-west1` — والتحقّقُ لحظةَ التنفيذ:
   `gcloud run regions list` ثم أمرُ النشر نفسُه يرفض إقليمًا بلا GPU. زيادةُ المسافة تضيف
   نحو ٠٫١ ثانية ذهابًا وإيابًا — لا تُذكر أمام ثوانٍ نوفّرها.
2. **الحصّة**: `Total Nvidia L4 GPU allocation, per project per region` تُطلب مرّةً من
   وحدة الحصص إن كانت صفرًا.

## التنفيذ (كلُّ شيءٍ جاهز — يبقى أمران يُنفَّذان مرّة)

الشيفرةُ نفسُها تخدم النشرين: `app.py` يختار العتادَ عند الإقلاع (`MIZAN_LISTENER_DEVICE`:
`auto`/`cuda`/`cpu` — وفي صورة GPU الأصلُ `cuda` **بلا** رجوعٍ صامتٍ إلى CPU يدفع ثمنَ
الرسوميّ ويعمل ببطء العاديّ)، و`/health` يذكر `device` فيُرى في ملخّص النشر ما الذي يعمل فعلًا.

**١) بناءُ صورة GPU** (من جذر المستودع):

```bash
gcloud builds submit services/quran-practice-listener \
  --config services/quran-practice-listener/cloudbuild.gpu.yaml \
  --substitutions _TAG=europe-west1-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy/mizan-quran-listener-gpu:manual-1
```

**٢) النشرُ خدمةً منفصلة** (لا يمسّ الخدمةَ العاملة — والرجوعُ متغيّرُ بيئةٍ واحد):

```bash
gcloud run deploy mizan-quran-listener-gpu \
  --image europe-west1-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy/mizan-quran-listener-gpu:manual-1 \
  --region europe-west1 --platform managed --no-allow-unauthenticated \
  --gpu 1 --gpu-type nvidia-l4 --no-gpu-zonal-redundancy \
  --cpu 4 --memory 16Gi --concurrency 8 --min-instances 0 --max-instances 1 \
  --no-cpu-throttling --cpu-boost --timeout 60 \
  --set-env-vars MIZAN_LISTENER_DEVICE=cuda

gcloud run services add-iam-policy-binding mizan-quran-listener-gpu --region europe-west1 \
  --member "serviceAccount:$(gcloud run services describe mizan --region me-central1 --format='value(spec.template.spec.serviceAccountName)')" \
  --role roles/run.invoker
```

**٣) توجيهُ ميزان إليه** (وهو مفتاحُ الرجوع أيضًا):

```bash
gcloud run services update mizan --region me-central1 \
  --update-env-vars MIZAN_QURAN_PRACTICE_LISTENER_URL="$(gcloud run services describe mizan-quran-listener-gpu --region europe-west1 --format='value(status.url)')/listen"
```

ثم يُقاس قبل أيّ حكم: `tools/live-listen` على الموقع الحيّ، والمقارنةُ بأرقام
docs/TARTEEL-COMPARISON.md. فإن لم يهبط التأخّرُ كما حُسب، يُعاد المتغيّرُ إلى الخدمة القديمة
وتُحذف خدمةُ GPU — ولا كلفةَ باقية.

## ما بعد GPU (بترتيبه)

1. تقصيرُ الدفعة من ١٫٥ ث نحو ٠٫٥ ث (الحسابُ لم يعد القيد) — فيهبط سقفُ التأخّر بنيويًّا.
2. تسريعُ «استقرار» الخطأ (اليوم: ثلاثُ كلماتٍ بعده) إلى كلمةٍ أو وقفة — بالقياس، لا بالظنّ:
   الإنذارُ الكاذبُ هو الحَكَم.
3. النموذجُ الأدقّ (المعلّم) في المسار الحيّ — عتادُه صار حاضرًا.
