# MIZAN R2 — final cloud-only source closure

Date: 2026-09-03

This patch keeps all heavy Quran delivery bytes out of GitHub and the Cloud Run image. R2 remains the private delivery store.

## Warsh
KFGQPC institutional material confirms a Warsh recording by Dr. Ibrahim bin Saeed Al-Dawsari, but the current downloadable audio catalog checked for this patch does not expose Warsh as a current downloadable entry. MIZAN therefore keeps Warsh audio at `OFFICIAL_AUDIO_UNAVAILABLE`. The new discovery code can upgrade the evidence state only when the current official catalog itself exposes a direct candidate; historical evidence alone cannot do so.

## Al-Duri
KFGQPC currently lists Dr. Abdullah bin Awad Al-Juhani for Al-Duri. The official listing has a size inconsistency: the whole-Ayah package is displayed as 1.54 MB while the whole-Surah package is roughly 1.51 GB. MIZAN rejects an Ayah-package candidate below 100 MiB and requires direct-official provenance plus explicit anomaly resolution before Al-Duri can become `VERIFIED`.

## Code completed
- `scripts/kfgqpc-audio-discovery.ts` — live official-source discovery/report.
- `server/kfgqpc-audio-source-policy.ts` — official-host filtering and fail-closed Warsh/Duri classification.
- `server/kfgqpc-delivery.ts` — exact future verified key mappings for Warsh/Duri; no generic aliases or cross-reading fallback.
- `scripts/kfgqpc-ingest.ts` — dynamic Warsh/Duri states instead of permanent hard-coded blocking.
- `scripts/kfgqpc-init-stage.ts` — includes Warsh/Duri staging metadata.
- `server/kfgqpc-ingest-core.ts` — READY catalog accepts optional Warsh/Duri upgrade to VERIFIED while retaining fail-closed fallback states.
- `cloudbuild-assets.yaml` — cloud monitoring/source-audit build only; no heavy asset upload.

## Verification actually executed
- TypeScript check for modified server/scripts: PASS.
- Patch unit tests: 12 passed, 0 failed.
- Tests cover exact Warsh/Duri R2 mappings, generic-alias rejection, official-host-only source links, Warsh current-catalog absence classification, and rejection of the implausible 1.54 MB Al-Duri candidate.

## Not claimed
No current official downloadable Warsh Ayah archive was found, so none is fabricated or substituted. No Al-Duri package is declared verified until its actual official bytes and archive structure pass validation. No Quran/audio binaries were uploaded by the assistant.
