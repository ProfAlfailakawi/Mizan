#!/usr/bin/env bash
set -euo pipefail

PATCH='Mizan-fix-392dbaa-direct.patch'
SELF="$(basename "$0")"
EXPECTED_STORE_BLOB='194e6865f9c521a35a1ff45c3ac880de18cb9ea8'

fail(){ echo "ERROR: $*" >&2; exit 1; }
command -v git >/dev/null 2>&1 || fail 'git is required'
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail 'run this from the Mizan repository root'
[[ -f "$PATCH" ]] || fail "$PATCH must be next to this script"
[[ -f src/lib/store.ts ]] || fail 'src/lib/store.ts is missing'

actual_store_blob="$(git hash-object src/lib/store.ts)"
if [[ "$actual_store_blob" != "$EXPECTED_STORE_BLOB" ]]; then
  fail "repository state changed (store blob=$actual_store_blob). This fix targets current main 392dbaa."
fi

# This package targets the bad commit where the old delivery patch was committed as data
# instead of being applied. Apply the real source changes now.
git apply --check "$PATCH"
git apply "$PATCH"

git diff --check
node scripts/production-runtime-audit.mjs
node scripts/scan-secrets.mjs
node scripts/source-audit.mjs

# Run the exact TypeScript gate when dependencies are already installed.
if [[ -x node_modules/.bin/tsc ]]; then
  npm run lint
else
  echo 'NOTE: node_modules is not installed; GitHub Actions will run npm ci + npm run lint.'
fi

# Delivery files must never be committed to the application repository.
rm -f "$PATCH" "$SELF"

echo 'OK: production fix applied to the working tree.'
echo 'Review with: git status --short && git diff --check'
echo 'Then commit/push normally. This script does not commit or push anything.'
