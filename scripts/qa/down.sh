#!/usr/bin/env bash
cd "$(dirname "$0")/../.."
source scripts/qa/env.sh
for f in "$QA_DIR"/pids/*; do [[ -f $f ]] && { pkill -P "$(cat "$f")" 2>/dev/null; kill "$(cat "$f")" 2>/dev/null; rm -f "$f"; }; done
pkill -f "cloud-firestore-emulator" 2>/dev/null; true
