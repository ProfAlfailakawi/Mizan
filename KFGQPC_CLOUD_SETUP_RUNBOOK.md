# MIZAN · دليل أصول القرآن على السحابة (النسخة النهائية)

> الحالة: **التسليم مكتمل وحيّ** على Cloudflare R2 + Cloud Run. مصدر الأصول = مرايا مفتوحة (ترخيص MIT) لأن موقع مجمع الملك فهد محجوب عن مراكز البيانات وشبكات المستخدم.

## 1) الوضع الحالي (مُنجَز)
- **Cloudflare R2** (`mizan-quran-assets`): **7471 كائن ≈ 679MB — ضمن الطبقة المجانية (10GB)**.
- **الموقع الحي** `https://mizan-jaqsk44ouq-ww.a.run.app` يخدم الأصول من R2 (تم التحقق: خطوط + صوت من أول آية لآخر آية).
- كتالوج READY منشور: `delivery/_mizan/catalog.json`.

### المرفوع في R2
| الأصل | المفتاح | المصدر |
|------|---------|--------|
| نص 6 روايات | `delivery/quran-data/<reading>/vN/data.json` | thetruetruth/quran-data-kfgqpc |
| خطوط 6 روايات | `delivery/fonts/<reading>/vN/primary.woff2\|ttf` | thetruetruth |
| 604 صفحة مصحف | `delivery/mushaf-pages/madinah/v1/NNN.png` | files.quran.app (madani) |
| التفسير الميسّر | `delivery/quran-data/tafsir-muyassar/v1/data.json` | spa5k/tafsir_api |
| التجويد (حفص، فهرسة حرفية) | `delivery/quran-data/tajweed-muyassar/v1/data.json` | cpfair/quran-tajweed |
| صوت حفص/المعيقلي (6236 آية) | `delivery/audio/hafs/maher-al-muaiqly/v1/SSS/AAA.mp3` | everyayah |
| تخطيط الكلمة (604) | `delivery/quran-data/mushaf-layout/v1/page-NNN.json` | zonetecde/mushaf-layout |

## 2) كيفية إعادة التشغيل/التحديث
كل الأوامر بحساب compute (يقرأ أسرار R2):
```bash
SA=projects/mizan-f2ce3/serviceAccounts/993698501419-compute@developer.gserviceaccount.com
gcloud builds submit --config cloudbuild-mirror-delivery.yaml --service-account=$SA --async .   # خطوط+نص+صفحات+تفسير
gcloud builds submit --config cloudbuild-audio.yaml           --service-account=$SA --async .   # صوت حفص + تخطيط الكلمة
gcloud builds submit --config cloudbuild-tajweed.yaml         --service-account=$SA --async .   # تجويد + كتالوج
gcloud builds submit --config cloudbuild-catalog.yaml         --service-account=$SA --async .   # إعادة نشر الكتالوج فقط
```

## 3) المتبقّي — يحتاجك أنت
- **Firebase** (`FIREBASE_PROJECT_ID` + `VITE_FIREBASE_*`): غير مضبوط على Cloud Run → الأدوار/دخول الإدارة/سطح المصحف المحمي معطّلة. أضِفها كأسرار/متغيرات على خدمة `mizan` ثم أعد النشر.
- **قرار صوت شعبة/قالون/السوسي**: ما فيه مصدر رواية-صحيح مفتوح مؤكّد، وMIZAN يمنع الاستبدال بين الروايات. إما تزوّدني بمصدر موثّق أو نتركها مقفولة (كما هو تصميم MIZAN).
- **غريب القرآن الميسّر**: يحتاج تصدير من QUL (ما فيه مرآة raw نظيفة).

## 4) المتبقّي — مسار علمي/بناء (ليس تنزيلًا)
- **خزنة المصدر/FairDraw/الوقف**: النص مرفوع للتسليم، لكن الإدخال العلمي المُصدّق checksum-gated على قفل المجمع القديم؛ يحتاج مواءمة سياسة المصدر مع بصمات المرآة (تغيير حسّاس — لم يُنفَّذ).
- **محاذاة صوتية حية + benchmarks**: أساسها مفتوح جاهز (`tarteel-ai/whisper-base-ar-quran`, `cpfair/quran-align`)، لكن يحتاج نشر backend وتقييم.
- **الاعتماد الرسمي الموقّع + الماستر الفكتوري**: رسمي فقط (يحتاج تواصل/إذن المجمع).
