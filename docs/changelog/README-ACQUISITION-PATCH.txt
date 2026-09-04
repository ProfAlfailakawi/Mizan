MIZAN KFGQPC OFFICIAL ACQUISITION PATCH

Overlay this ZIP at repository root. No wrapper directory.

Purpose:
- Add fail-closed acquisition of the nine small KFGQPC developer/data packages.
- Discover download links dynamically from the official KFGQPC developer page near each published checksum.
- Accept HTTPS qurancomplex.gov.sa subdomains only.
- Verify BOTH official MD5 and SHA-1 before extraction.
- Reject oversized, non-ZIP, unsafe-path, foreign-host, or checksum-mismatched downloads.
- Extract verified archives into the existing .mizan-ingest/<dataset>/payload staging contract.
- Keep Cloud Build in audit/dry-run mode. NO R2 upload is enabled.

Deliberately NOT automated in this audit build:
- 604 Mushaf pages: no current official 604-page delivery archive is selected automatically. MIZAN will not reconstruct/crop Quran pages.
- Heavy audio: not downloaded in the audit build and never substituted across readings.
- Warsh audio remains availability-gated; Al-Duri remains anomaly-gated.

Changed/new files:
- cloudbuild-assets.yaml
- scripts/kfgqpc-acquire.ts
- server/kfgqpc-acquisition-policy.ts
- tests/round14-kfgqpc-acquisition.test.ts
- README-ACQUISITION-PATCH.txt
