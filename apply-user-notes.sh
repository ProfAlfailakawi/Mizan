#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$PWD}"
ROOT="$(cd "$ROOT" && pwd)"
BASE="21eeacd7dc14f0bdd415a912b0fc032881d2482f"
FIX="00ccc3a58165908127525a6852b3c8337f67ba27"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FILES=(
  server.ts
  server/firestore-rest.ts
  server/public-registration.ts
  src/components/admin/CompetitionOverview.tsx
  src/components/admin/QuestionEngineWorkspace.tsx
  src/components/admin/RolePortals.tsx
  src/components/auth/AuthPortal.tsx
  src/components/participant/ParticipantDashboard.tsx
  src/components/public/RegistrationFlow.tsx
  src/lib/store.ts
  tests/firestore-rest-adapter.test.ts
  tests/public-registration-scope.test.ts
  tests/user-notes-2026-09-14-regression.test.ts
)

fail(){ printf 'ERROR: %s\n' "$*" >&2; exit 1; }

cd "$ROOT"
[[ -d .git ]] || fail "المسار ليس checkout لـ Git: $ROOT"

if git merge-base --is-ancestor "$FIX" HEAD 2>/dev/null; then
  echo "ملاحظات المستخدم موجودة أصلًا في تاريخ HEAD؛ لن أغيّر أي ملف."
  node "$SCRIPT_DIR/verify-user-notes.mjs" "$ROOT"
  exit 0
fi

git cat-file -e "$BASE^{commit}" 2>/dev/null || fail "لا يوجد base commit محليًا: $BASE"
git cat-file -e "$FIX^{commit}" 2>/dev/null || fail "لا يوجد fix commit محليًا: $FIX"

if [[ -n "$(git status --porcelain -- "${FILES[@]}")" ]]; then
  fail "هناك تعديلات محلية في ملفات الحزمة. احفظها/راجعها قبل التطبيق حتى لا نطغى عليها."
fi

TMP_PATCH="$(mktemp -t mizan-user-notes.XXXXXX.patch)"
trap 'rm -f "$TMP_PATCH"' EXIT

git diff --binary "$BASE" "$FIX" -- "${FILES[@]}" > "$TMP_PATCH"
[[ -s "$TMP_PATCH" ]] || fail "الفرق المحلي فارغ؛ تحقق من تاريخ Git."

git apply --check "$TMP_PATCH" || fail "فشل git apply --check؛ النسخة الحالية تختلف عن الأساس المتوقع، ولم يتم تعديل أي ملف."
git apply "$TMP_PATCH"

echo "تم تطبيق ملفات الملاحظات محليًا فقط. لم يتم commit أو push."
node "$SCRIPT_DIR/verify-user-notes.mjs" "$ROOT"
