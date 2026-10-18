#!/usr/bin/env bash
# Sweep every role at desktop and phone widths. Output: /tmp/qa-sweep/*.json + summary on stdout.
cd "$(dirname "$0")/../.."
ROLES=(super_admin operator_owner operator_admin org_admin storage_admin billing_admin branch_admin comp_admin head_judge judge ops_manager exception_host delegation_manager participant broadcast_operator auditor guardian support_agent)
for w in ${WIDTHS:-1280 390}; do
  for r in "${ROLES[@]}"; do timeout 900 node scripts/qa/sweep.mjs "$r" "$w" 0 "${MAXCLICKS:-60}" 2>&1 | tail -${TAIL:-25}; done
done
