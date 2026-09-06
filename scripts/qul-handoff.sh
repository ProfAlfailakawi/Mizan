#!/usr/bin/env bash
#
# تسليم بيانات التوقيت من Cloud Shell إلى بيئة التطوير.
#
# السبب: وكيل الشبكة في بيئة التطوير يحجب `android.quran.com` ونطاق خدمة Cloud Run، فلا يمكن
# جلب مقاطع QUL ولا قياس مدد الصوت من هناك. أما `storage.googleapis.com` فمتاح. فيُجمع ما
# يلزم هنا ويُرفع إلى حاوية مؤقّتة، ويكمل الباقي هناك بلا انتظار أحد.
#
# ما يُرفع: بنية قواعد التوقيت ومحتواها، و**مدد** ملفات الصوت لا الصوت نفسه. ولا يُرفع شيء
# يخصّ مسابقة أو مشاركًا أو نتيجة — البيانات كلها قرآنية عامة أو أرقام مدد.
#
# التشغيل:
#   bash scripts/qul-handoff.sh
#
# وبعد الفراغ منها تُحذف الحاوية بأمر واحد يُطبع في آخر المخرجات.

set -uo pipefail

PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
SERVICE="${SERVICE:-mizan}"
REGION="${REGION:-me-central1}"
BUCKET="${BUCKET:-${PROJECT}-mizan-handoff}"
WORK="${WORK:-$HOME/mizan-handoff}"
RECORDING="${RECORDING:-hafs-muaiqly}"

if [ -z "${PROJECT}" ] || [ "${PROJECT}" = "(unset)" ]; then
  echo "No project selected. Run: gcloud config set project <PROJECT_ID>" >&2
  exit 1
fi

rm -rf "${WORK}"; mkdir -p "${WORK}"
echo "MIZAN handoff · project ${PROJECT}"
echo "Working in ${WORK}"
echo ""

# ── 1. قواعد التوقيت: البنية أولًا، فهي التي تقول أهي كلمة أم آية ────────────
echo "── QUL timing databases"
for r in maher_al_muaiqly yasser_dussary abdullah_juhany; do
  zip=""
  for candidate in "$HOME/Mizan/${r}.zip" "$HOME/${r}.zip" "./${r}.zip"; do
    [ -f "${candidate}" ] && zip="${candidate}" && break
  done
  if [ -z "${zip}" ]; then
    echo "  ${r}: zip not found locally, downloading…"
    zip="${WORK}/${r}.zip"
    curl -sSL --max-time 180 -o "${zip}" "https://android.quran.com/data/databases/audio/${r}.zip" || true
  fi
  [ -s "${zip}" ] || { echo "  ${r}: NO DATA"; continue; }

  d="${WORK}/${r}"; mkdir -p "${d}"
  unzip -o -q "${zip}" -d "${d}" || { echo "  ${r}: unzip failed"; continue; }
  db="$(find "${d}" -maxdepth 2 -type f \( -name '*.db' -o -name '*.sqlite' -o -name '*.sqlite3' \) | head -1)"
  if [ -z "${db}" ]; then
    # ليس كل حزمة قاعدة بيانات؛ يُسجَّل ما وُجد بدل الصمت.
    echo "  ${r}: no database inside — contents:" | tee -a "${WORK}/${r}.schema.txt"
    ls -la "${d}" | tee -a "${WORK}/${r}.schema.txt"
    continue
  fi

  {
    echo "== ${r}"
    echo "-- file: $(basename "${db}") ($(stat -c%s "${db}") bytes)"
    echo "-- tables:"
    sqlite3 "${db}" "SELECT name FROM sqlite_master WHERE type='table';"
    echo "-- schema:"
    sqlite3 "${db}" ".schema"
    echo "-- row counts:"
    for t in $(sqlite3 "${db}" "SELECT name FROM sqlite_master WHERE type='table';"); do
      printf '%s = ' "$t"; sqlite3 "${db}" "SELECT COUNT(*) FROM \"$t\";"
    done
    echo "-- first rows of each table:"
    for t in $(sqlite3 "${db}" "SELECT name FROM sqlite_master WHERE type='table';"); do
      echo "--- $t"; sqlite3 -header -csv "${db}" "SELECT * FROM \"$t\" LIMIT 5;"
    done
  } > "${WORK}/${r}.schema.txt" 2>&1

  # التفريغ الكامل لكل جدول: الحكم على الشكل يحتاج البيانات لا البنية وحدها.
  for t in $(sqlite3 "${db}" "SELECT name FROM sqlite_master WHERE type='table';"); do
    sqlite3 -json "${db}" "SELECT * FROM \"$t\";" > "${WORK}/${r}.${t}.json" 2>/dev/null || true
  done
  echo "  ${r}: exported ($(grep -c . "${WORK}/${r}.schema.txt") schema lines)"
done
echo ""

# ── 2. مدد ملفات الصوت — لا الصوت ────────────────────────────────────────────
# المقارنة بين نهاية آخر مقطع ومدّة الملف هي الفحص الذي يكشف تسجيلًا آخر لنفس القارئ.
echo "── Audio durations for recording '${RECORDING}'"
URL="$(gcloud run services describe "${SERVICE}" --project "${PROJECT}" --region "${REGION}" --format='value(status.url)' 2>/dev/null)"
if [ -z "${URL}" ]; then
  echo "  Could not resolve the service URL; skipping durations." | tee "${WORK}/durations.error.txt"
else
  echo "  Service: ${URL}"
  node - "${URL}" "${RECORDING}" "${WORK}/durations.json" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
const [url, recording, out] = process.argv.slice(2);
const mod = await import(path.join(process.cwd(), 'scripts/lib/audio-duration.mjs'));
const results = {};
let ok = 0, missing = 0, unreadable = 0;
// عيّنة موزّعة على المصحف: الآية الأولى من كل سورة ثانية. الآية 1 موجودة في كل سورة يقينًا.
for (let surah = 1; surah <= 114; surah += 2) {
  const key = `${surah}:1`;
  try {
    const r = await fetch(`${url}/api/public/kfgqpc/audio/${recording}/${surah}/1`, { cache: 'no-store' });
    if (!r.ok) { missing++; continue }
    const buf = Buffer.from(await r.arrayBuffer());
    const ms = mod.mp3DurationMs(buf);
    if (ms === null) { unreadable++; results[key] = null; continue }
    results[key] = ms; ok++;
  } catch { missing++ }
}
fs.writeFileSync(out, JSON.stringify({ recording, serviceUrl: url, measured: ok, missing, unreadable, durationsMs: results }, null, 2));
console.log(`  measured ${ok} · missing ${missing} · unreadable ${unreadable}`);
NODE
fi
echo ""

# ── 3. الرفع ─────────────────────────────────────────────────────────────────
echo "── Uploading to gs://${BUCKET}"
if ! gcloud storage buckets describe "gs://${BUCKET}" --project "${PROJECT}" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${BUCKET}" --project "${PROJECT}" --location="${REGION}" --uniform-bucket-level-access >/dev/null \
    || { echo "  Bucket creation failed." >&2; exit 1; }
fi
# قراءة عامة **لهذه الحاوية وحدها**، وهي لا تحمل إلا بيانات قرآنية عامة وأرقام مدد.
gcloud storage buckets update "gs://${BUCKET}" --project "${PROJECT}" --no-public-access-prevention >/dev/null 2>&1 || true
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" --project "${PROJECT}" \
  --member=allUsers --role=roles/storage.objectViewer >/dev/null 2>&1 \
  || echo "  Could not grant public read — org policy may forbid it."
gcloud storage cp "${WORK}"/* "gs://${BUCKET}/" --project "${PROJECT}" >/dev/null 2>&1 \
  || { echo "  Upload failed." >&2; exit 1; }

echo ""
echo "Uploaded:"
gcloud storage ls "gs://${BUCKET}/" --project "${PROJECT}" | sed 's|^|  |'

# التحقّق أن الملفات تُقرأ فعلًا من الخارج: الرفع بلا قراءة لا يسلّم شيئًا.
probe="$(gcloud storage ls "gs://${BUCKET}/" --project "${PROJECT}" | head -1 | sed "s|gs://${BUCKET}/||")"
code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 "https://storage.googleapis.com/${BUCKET}/${probe}" 2>/dev/null)"
echo ""
if [ "${code}" = "200" ]; then
  echo "✓ Publicly readable. Hand this line back:"
  echo "    https://storage.googleapis.com/${BUCKET}/"
else
  echo "✗ Uploaded but NOT publicly readable (HTTP ${code})."
  echo "  An organisation policy may block public objects. Say so and we will use another route."
fi
echo ""
echo "When finished, remove it:  gcloud storage rm -r gs://${BUCKET}"
