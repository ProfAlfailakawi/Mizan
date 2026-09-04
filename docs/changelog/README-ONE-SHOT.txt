MIZAN — FINAL CLOUD-ONLY QURAN DELIVERY PATCH
Date: 2026-09-03

Overlay this ZIP directly on the MIZAN repository root. There is no wrapper directory.
This is a patch only; it does not contain Quran/audio/page binaries.

Architecture contract:
- GitHub / Cloud Run image: code only.
- Cloudflare R2 private bucket: all heavy Quran delivery assets only.
- Browser never receives R2 credentials or the private R2 origin.
- No health.txt dependency. READY is tied to delivery/_mizan/catalog.json.

Added closure for Warsh / Al-Duri:
- Current official-catalog discovery script.
- Official-host-only URL filter.
- Al-Duri 1.54 MB anomaly guard (fail closed).
- Warsh historical evidence never upgrades current availability.
- Exact future R2 key mappings for verified Warsh and Al-Duri audio; no cross-riwayah fallback.
- Optional audio states can upgrade to VERIFIED only after source.json records the required provenance checks.

Cloud source-audit build:
  gcloud builds submit --config cloudbuild-assets.yaml .

This build is MONITORING/AUDIT ONLY. It does not upload Quran assets. It creates the staging skeleton, checks current official Warsh/Duri evidence, and runs the full dry-run verifier.

Do not place gigabytes in the repository. Do not add any R2 secret to source files.
