#!/usr/bin/env bash
#
# تهيئة سلطة النزاهة على Cloud Run — يُشغَّل من Google Cloud Shell.
#
# لماذا هنا لا في Cloud Build؟ لأن `gcloud builds submit` ينفّذ بحساب Cloud Build، وهو
# افتراضيًا لا يملك تعديل Cloud Run ولا إنشاء الأسرار، فيفشل بأخطاء صلاحيات. أما Cloud Shell
# فيعمل بهويتك أنت، ومالك المشروع يملك ما يلزم بلا منح أدوار مسبقة.
#
# التشغيل:
#   bash scripts/setup-cloud-run-integrity.sh
#
# آمنٌ عند التكرار: ما هو قائم لا يُنشأ ثانية، والسرّ القائم لا يُدهس — تدوير المفتاح قرار
# يُتخذ عمدًا، لا أثرٌ جانبي لإعادة تشغيل هذا الملف.

set -euo pipefail

PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
SERVICE="${SERVICE:-mizan}"
REGION="${REGION:-me-central1}"
BUCKET="${BUCKET:-${PROJECT}-integrity-authority}"
SECRET="${SECRET:-MIZAN_TRUST_SIGNING_PRIVATE_KEY_PEM}"
MOUNT="/mnt/authority"

if [ -z "${PROJECT}" ] || [ "${PROJECT}" = "(unset)" ]; then
  echo "No project selected. Run: gcloud config set project <PROJECT_ID>" >&2
  exit 1
fi

echo "Project ${PROJECT} · service ${SERVICE} · region ${REGION}"
echo ""

# ── 1. المفتاح ───────────────────────────────────────────────────────────────
# يُولَّد ويُخزَّن في خطوة واحدة فلا يستقرّ على قرص ولا يُنسخ يدويًا بين أمرين — وهناك تضيع
# المفاتيح أو تُسرَّب.
if gcloud secrets describe "${SECRET}" --project "${PROJECT}" >/dev/null 2>&1; then
  echo "✓ Signing key already exists (${SECRET}); leaving it untouched."
else
  echo "Generating an Ed25519 signing key…"
  PEM_FILE="$(mktemp)"
  trap 'rm -f "${PEM_FILE}"' EXIT
  KEY_ID="$(PEM_OUT="${PEM_FILE}" node -e '
    const c=require("crypto"),fs=require("fs");
    const {privateKey,publicKey}=c.generateKeyPairSync("ed25519");
    fs.writeFileSync(process.env.PEM_OUT,privateKey.export({format:"pem",type:"pkcs8"}),{mode:0o600});
    const spki=publicKey.export({format:"der",type:"spki"}).toString("base64url");
    process.stdout.write("ed25519:"+c.createHash("sha256").update(spki).digest("hex").slice(0,16));
  ')"
  gcloud secrets create "${SECRET}" --project "${PROJECT}" --replication-policy=automatic >/dev/null
  gcloud secrets versions add "${SECRET}" --project "${PROJECT}" --data-file="${PEM_FILE}" >/dev/null
  rm -f "${PEM_FILE}"
  echo "✓ Signing key stored. Key id: ${KEY_ID}"
  echo "  Keep that id: a seal names the key that signed it."
fi

# ── 2. التخزين الدائم ────────────────────────────────────────────────────────
# قرص Cloud Run لكل نسخة ويُمحى مع إعادة التشغيل: موافقة نصاب لا تراها النسخة الأخرى، وبذرة
# التُزم بها تضيع قبل كشفها. فالحالة تُحفظ في حاوية تخزين تراها كل النسخ وتبقى.
if gcloud storage buckets describe "gs://${BUCKET}" --project "${PROJECT}" >/dev/null 2>&1; then
  echo "✓ Durable bucket gs://${BUCKET} already exists."
else
  gcloud storage buckets create "gs://${BUCKET}" --project "${PROJECT}" \
    --location="${REGION}" --uniform-bucket-level-access >/dev/null
  echo "✓ Created gs://${BUCKET}"
fi
# حالة النزاهة ليست للعامة تحت أي ظرف.
gcloud storage buckets update "gs://${BUCKET}" --project "${PROJECT}" --public-access-prevention >/dev/null

# ── 3. صلاحية الخدمة ─────────────────────────────────────────────────────────
SA="$(gcloud run services describe "${SERVICE}" --project "${PROJECT}" --region "${REGION}" \
  --format='value(spec.template.spec.serviceAccountName)' 2>/dev/null || true)"
if [ -z "${SA}" ]; then
  SA="$(gcloud projects describe "${PROJECT}" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
fi
echo "Service account: ${SA}"
gcloud secrets add-iam-policy-binding "${SECRET}" --project "${PROJECT}" \
  --member="serviceAccount:${SA}" --role=roles/secretmanager.secretAccessor >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" --project "${PROJECT}" \
  --member="serviceAccount:${SA}" --role=roles/storage.objectAdmin >/dev/null
echo "✓ Service account can read the key and write the authority state."

# ── 4. الربط ─────────────────────────────────────────────────────────────────
gcloud run services update "${SERVICE}" --project "${PROJECT}" --region "${REGION}" \
  --add-volume=name=authority,type=cloud-storage,bucket="${BUCKET}" \
  --add-volume-mount=volume=authority,mount-path="${MOUNT}" \
  --update-env-vars="MIZAN_INTEGRITY_AUTHORITY_DIR=${MOUNT},MIZAN_INTEGRITY_AUTHORITY_DURABLE=true" \
  --update-secrets="MIZAN_TRUST_SIGNING_PRIVATE_KEY_PEM=${SECRET}:latest" >/dev/null
echo "✓ Service updated."

# ── 5. التحقّق ───────────────────────────────────────────────────────────────
# التحقّق جزء من التهيئة لا خطوة لاحقة تُنسى: «طُبِّقت الأوامر» ليست «تعمل».
URL="$(gcloud run services describe "${SERVICE}" --project "${PROJECT}" --region "${REGION}" --format='value(status.url)')"
echo ""
echo "Verifying ${URL}/api/health"
for _ in 1 2 3 4 5 6; do
  BODY="$(curl -sS --max-time 20 "${URL}/api/health" || true)"
  case "${BODY}" in
    *'"integrityAuthorityStatus":"ENABLED"'*)
      case "${BODY}" in
        *'"trustSigningConfigured":true'*)
          echo ""
          echo "✓ Integrity authority ENABLED and the signing key is loaded."
          echo "  Sealing now composes on the server and signs with Ed25519."
          exit 0 ;;
      esac
      echo "  authority enabled, signing key not loaded yet…" ;;
    *) echo "  not ready yet…" ;;
  esac
  sleep 10
done

echo ""
echo "✗ Applied, but /api/health does not report an enabled, signing-capable authority." >&2
echo "  Last response: ${BODY}" >&2
echo "  Check the service logs: gcloud run services logs read ${SERVICE} --region ${REGION} --limit 50" >&2
exit 1
