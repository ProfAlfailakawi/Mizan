#!/usr/bin/env bash
set -euo pipefail

PATCH_NAME="Mizan-build-fix-103b289.patch"
SCRIPT_NAME="$(basename "$0")"

if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git is required to apply this production fix." >&2
  exit 1
fi
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: run this script from the Mizan repository root." >&2
  exit 1
fi
if [[ ! -f "$PATCH_NAME" ]]; then
  echo "ERROR: $PATCH_NAME must be next to this script in the repository root." >&2
  exit 1
fi

if git apply --check "$PATCH_NAME"; then
  git apply "$PATCH_NAME"
elif git apply --reverse --check "$PATCH_NAME"; then
  echo "Mizan production build fix is already applied."
else
  echo "ERROR: patch does not match this repository state. Expected the tree around commit 103b289." >&2
  exit 1
fi

# Temporary delivery artifacts are not part of the application source.
rm -f "$PATCH_NAME"
rm -f "$SCRIPT_NAME"

echo "Mizan production build fix applied."
echo "Removed retired demo/seed source files and fixed QuestionPoolItem typing."
