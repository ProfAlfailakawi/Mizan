MIZAN PRIVATE R2 PATCH
Baseline inspected: ProfAlfailakawi/Mizan main @ c694b7b26566395246bdfea990e6ecb9576ccc14

This ZIP is an overlay patch. Extract it directly at the MIZAN repository root.
There is no wrapper folder.

No deployment or upload was performed while producing this patch.
No R2 secret value is included.

After overlay, the normal project verification sequence is:
  npm install
  npm run lint
  npm test
  npm run arabic-ui-audit
  npm run source-audit
  npm run secret-scan
  npm run build

Private R2 health object only (when YOU decide to upload):
  npx tsx scripts/kfgqpc-ingest.ts --upload --resume --only health --root .mizan-ingest

Storage report only:
  npx tsx scripts/kfgqpc-ingest.ts --report --root .mizan-ingest

Do not make the R2 bucket public. Do not add VITE_R2_* variables.
