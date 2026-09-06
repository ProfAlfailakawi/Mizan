#!/usr/bin/env bash
#
# فحص الدخان بعد كل نشر.
#
# ما يُثبته هذا الملف محدود عمدًا، وحدُّه يجب أن يبقى مفهومًا: أن الطرق **مركّبة ومحروسة**،
# وأن الرايات التي تدّعيها الخدمة عن نفسها صادقة. ولا يُثبت أن ختمًا يقع — ذلك يحتاج هويتين
# حاكمتين مستقلّتين وجلسة فيها إرسالات محكمين، وهو اختبار بشري لا آلي.
#
# والقاعدة التي تحكم كل تحقّق هنا: **الرمز المتوقّع ليس 200**. نقطة النزاهة يجب أن تردّ 401
# لطلبٍ بلا هوية. و401 هي الخبر الجيد:
#
#   401 → موجودة ومحروسة            (المطلوب)
#   404 → غير مركّبة                 (النشر ناقص)
#   503 → السلطة غير مهيّأة           (التهيئة ناقصة)
#   200 → **محروسة بلا حارس**         (عطل أمني: تُعالج فورًا)
#
# التشغيل:
#   bash scripts/smoke-production.sh https://your-service-url
#   bash scripts/smoke-production.sh            # يستنتج العنوان من gcloud

set -uo pipefail

URL="${1:-}"
if [ -z "${URL}" ]; then
  URL="$(gcloud run services describe "${SERVICE:-mizan}" --region "${REGION:-me-central1}" \
    --format='value(status.url)' 2>/dev/null || true)"
fi
if [ -z "${URL}" ]; then
  echo "Usage: bash scripts/smoke-production.sh <service-url>" >&2
  exit 2
fi
URL="${URL%/}"

pass=0; fail=0
ok()   { printf '  ✓ %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  ✗ %s\n' "$1" >&2; fail=$((fail+1)); }

echo "MIZAN smoke test · ${URL}"
echo ""

HEALTH="$(curl -sS --max-time 25 "${URL}/api/health" 2>/dev/null || true)"
CAPS="$(curl -sS --max-time 25 "${URL}/api/capabilities" 2>/dev/null || true)"

if [ -z "${HEALTH}" ]; then
  echo "The service did not answer /api/health. Nothing else can be concluded." >&2
  exit 1
fi

echo "Service reachable"
case "${HEALTH}" in *'"status":"ok"'*) ok "health reports ok" ;; *) bad "health did not report ok" ;; esac
echo ""

# ── الرايات التي تدّعيها الخدمة عن نفسها ─────────────────────────────────────
echo "Declared configuration"
flag() { # flag <json> <key> <expected-substring> <label>
  case "$1" in *"\"$2\":$3"*) ok "$4" ;; *) bad "$4 — not reported by the service" ;; esac
}
flag "${HEALTH}" integrityAuthorityStatus '"ENABLED"' "integrity authority enabled"
flag "${HEALTH}" trustSigningConfigured   'true'      "Ed25519 signing key loaded"
flag "${CAPS}"   serverQuorumAuthority     'true'      "server-side quorum authority"
flag "${CAPS}"   serverFairDrawCommitReveal 'true'     "server-side draw commit/reveal"
echo ""

# ── أن الطرق مركّبة ومحروسة ──────────────────────────────────────────────────
# طلبٌ بلا ترويسة هوية. القبول هنا يعني بابًا مفتوحًا على النتائج، فيُعامل عطلًا لا ملاحظة.
echo "Integrity endpoints reject unauthenticated callers"
guarded() { # guarded <method> <path> <label>
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 25 -X "$1" "${URL}$2" 2>/dev/null || echo 000)"
  case "${code}" in
    401|403) ok "$3 → ${code}" ;;
    200|201) bad "$3 → ${code} — REACHABLE WITHOUT AUTHENTICATION. Treat as a security defect." ;;
    404)     bad "$3 → 404 — not mounted; the deployment is missing this route." ;;
    503)     bad "$3 → 503 — the authority is not configured on this service." ;;
    *)       bad "$3 → ${code}" ;;
  esac
}
guarded POST /api/results/seal                 "seal a result"
guarded POST /api/results/seal/verify          "verify a seal"
guarded POST /api/integrity/quorum/request     "request a quorum"
guarded GET  /api/integrity/quorum             "list quorum actions"
guarded POST /api/integrity/fairdraw/commit    "commit a draw"
guarded GET  /api/integrity/authority-audit    "read the authority audit"
echo ""

echo "${pass} passed, ${fail} failed"
if [ "${fail}" -gt 0 ]; then
  echo ""
  echo "Not deployment-ready. Read the service logs before using this build in a competition:" >&2
  echo "  gcloud run services logs read ${SERVICE:-mizan} --region ${REGION:-me-central1} --limit 50" >&2
  exit 1
fi

echo ""
echo "Routes are mounted and guarded, and the declared configuration matches."
echo "Still unproven by this test: that a real seal completes. That needs two independent"
echo "governance sign-ins and a session with judge submissions — a human check, not this one."
