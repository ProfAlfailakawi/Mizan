#!/usr/bin/env bash
# Start the local QA rig: Firestore emulator, mock Google identity/Firestore proxy, app server.
# Usage: scripts/qa/up.sh   (logs in $RIG_DIR/logs, pids in $RIG_DIR/pids)
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/qa/env.sh
mkdir -p "$QA_DIR/logs" "$QA_DIR/pids" "$QA_DIR/data"
node -e "import('./scripts/qa/common.mjs').then(m=>m.ensureKeys())"
start() { local name=$1; shift; if [[ -f "$QA_DIR/pids/$name" ]] && kill -0 "$(cat "$QA_DIR/pids/$name")" 2>/dev/null; then echo "$name already running"; return; fi; nohup "$@" >"$QA_DIR/logs/$name.log" 2>&1 & echo $! >"$QA_DIR/pids/$name"; echo "started $name"; }
start firestore npx firebase emulators:start --only firestore --project mizan-qa
for i in $(seq 1 60); do curl -s "http://127.0.0.1:8080/" >/dev/null 2>&1 && break; sleep 1; done
start mock node scripts/qa/mock-google.mjs
if [[ "${QA_MODE:-prod}" == "dev" ]]; then
  start app node --import tsx --import ./scripts/qa/server-preload.mjs server.ts
else
  # Production build (npm run build with these env vars) served by the real production server.
  [[ -f dist/server.cjs ]] || { echo "dist/ missing: run 'source scripts/qa/env.sh && npm run build' first"; exit 1; }
  NODE_ENV=production start app node --import ./scripts/qa/server-preload.mjs dist/server.cjs
fi
for i in $(seq 1 90); do curl -s "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 && { echo "app up on :${PORT}"; exit 0; }; sleep 1; done
echo "app did not come up; see $QA_DIR/logs/app.log"; exit 1
