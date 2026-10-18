#!/usr/bin/env bash
# Rebuild the production bundle with the QA env and restart ONLY the app server (emulator data stays).
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/qa/env.sh
NODE_ENV=production npm run build >"$QA_DIR/logs/build.log" 2>&1 || { tail -30 "$QA_DIR/logs/build.log"; exit 1; }
if [[ -f "$QA_DIR/pids/app" ]]; then kill "$(cat "$QA_DIR/pids/app")" 2>/dev/null || true; rm -f "$QA_DIR/pids/app"; sleep 1; fi
NODE_ENV=production nohup node --import ./scripts/qa/server-preload.mjs dist/server.cjs >"$QA_DIR/logs/app.log" 2>&1 &
echo $! >"$QA_DIR/pids/app"
for i in $(seq 1 60); do curl -s "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 && { echo "app up"; exit 0; }; sleep 1; done
echo "app failed"; tail -20 "$QA_DIR/logs/app.log"; exit 1
