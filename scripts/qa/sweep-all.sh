#!/usr/bin/env bash
# Sweep every role at the given widths, PAR roles in parallel. Output: /tmp/qa-sweep/*.json + summaries on stdout.
cd "$(dirname "$0")/../.."
ROLES=(${ROLES:-super_admin operator_owner operator_admin org_admin storage_admin billing_admin branch_admin comp_admin head_judge judge ops_manager exception_host delegation_manager participant broadcast_operator auditor guardian support_agent})
# The first competition of each organisation is "registration open"; the second is the live judging day.
# Sweeping the live one exercises queues, scores, appeals and results, so competition staff use their second competition.
idx_for() { case "$1" in comp_admin|broadcast_operator) echo 1;; head_judge|ops_manager|exception_host) echo 2;; judge) echo 8;; delegation_manager) echo 4;; participant) echo 48;; guardian) echo 24;; *) echo 0;; esac; }
run() { timeout ${TIMEOUT:-1500} node scripts/qa/sweep.mjs "$1" "$2" "${IDX:-$(idx_for "$1")}" "${MAXCLICKS:-150}" "${OUT:-/tmp/qa-sweep}" "${DEPTH:-3}" 2>&1 | tail -${TAIL:-40}; }
for w in ${WIDTHS:-1280 390}; do
  i=0
  for r in "${ROLES[@]}"; do run "$r" "$w" & i=$((i+1)); if (( i % ${PAR:-3} == 0 )); then wait; fi; done; wait
done
