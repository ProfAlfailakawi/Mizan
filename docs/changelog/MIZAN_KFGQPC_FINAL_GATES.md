# MIZAN — Final KFGQPC Cloud Gates

This patch closes the final orchestration gaps before the one-shot cloud ingestion run.

- `--verify` now fails the build if any required dataset is not VERIFIED; Warsh and Al-Duri retain their explicit fail-closed optional states.
- All six official KFGQPC font sets are mandatory in the upload build. Ambiguous or missing primary fonts stop the build before any Quran dataset upload.
- Heavy source discovery now requires every identity token for the requested asset in the same local evidence window and rejects tied official candidates instead of guessing.
- Postflight validates the permanent READY catalog, nine Quran-data prefixes, exactly 604 Mushaf page objects, exactly 6,236 ayah audio objects for each of the four required recitations, one primary file + manifest for each of six font sets, and R2 storage safety limits.
- No browser, AI Studio, GitHub source tree, or Cloud Run image receives the heavy assets. The heavy acquisition workspace is ephemeral Cloud Build storage and verified delivery assets live in private R2 only.
