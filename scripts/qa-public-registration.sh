#!/usr/bin/env bash
# يشغّل فحصَ السطح مقابل **خادمٍ حقيقيّ** ومحاكي Firestore، فيعمل قسمُ التسجيل بدل أن يُتخطّى.
#
# يُستدعى من داخل `firebase emulators:exec`، فـ`FIRESTORE_EMULATOR_HOST` مضبوطٌ حين يبدأ.
set -uo pipefail

PORT="${MIZAN_QA_PORT:-8787}"
BASE="http://127.0.0.1:${PORT}"
COMP="${MIZAN_QA_COMPETITION_ID:-comp-qa-surface}"
export FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-mizan-qa-surface}"

if [[ -z "${FIRESTORE_EMULATOR_HOST:-}" ]]; then
  echo "EMULATOR_NOT_RUNNING: يُشغَّل هذا السكربت داخل \`firebase emulators:exec\`."; exit 2
fi

echo "── زرعُ مسابقةٍ منشورة"
npm run -s qa:seed-public || exit 1

echo "── تشغيل الخادم على ${PORT}"
PORT="$PORT" node dist/server.cjs > /tmp/mizan-qa-server.log 2>&1 &
server_pid=$!
cleanup() { kill "$server_pid" 2>/dev/null || true; }
trap cleanup EXIT

# الانتظارُ بالاستجابة لا بعددِ ثوانٍ ثابت: رقمٌ ثابت يمرّ على آلةٍ ويسقط على أخرى.
for _ in $(seq 1 60); do
  if curl -fsS "${BASE}/api/health" > /dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [[ -z "${ready:-}" ]]; then
  echo "SERVER_DID_NOT_START: لم يستجب /api/health خلال ٦٠ ثانية"; tail -20 /tmp/mizan-qa-server.log; exit 1
fi
echo "   الخادم جاهز"

# وتُقرأ المسابقةُ من الخادم قبل المتصفّح: لو ردّ 404 لكان الفحصُ يقيس زرعًا فاشلًا لا واجهة.
if ! curl -fsS "${BASE}/api/public/competitions/${COMP}" > /dev/null; then
  echo "PUBLIC_COMPETITION_NOT_SERVED: الزرعُ لم يصل إلى /api/public"; exit 1
fi
echo "   المسابقة تُخدَم من /api/public"

npm run -s qa:scope-visual -- --base="$BASE" --comp="$COMP"
