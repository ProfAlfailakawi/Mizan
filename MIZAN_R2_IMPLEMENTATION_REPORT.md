# MIZAN — Private R2 implementation report

Date: 2026-09-02
Baseline inspected: `ProfAlfailakawi/Mizan` main at commit `c694b7b26566395246bdfea990e6ecb9576ccc14`.

## Scope completed in this patch

- Preserved the existing Cloud Run deployment architecture; no Firebase Hosting assumption was introduced.
- Added a dependency-free server-side Cloudflare R2 S3 client using AWS Signature Version 4 and `region=auto`.
- `KfgqpcDeliveryRepository` now auto-detects the standard server-only environment contract:
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
  - `R2_ENDPOINT`
  - `R2_BUCKET`
- Existing same-origin JudgeOS/MIZAN routes remain the browser contract. The browser does not receive the R2 origin or credentials.
- Delivery remains local-cache-first, then private R2.
- Added versioned `delivery/` key contracts for Mushaf pages, selected ayah audio, Quran data and reading-scoped fonts.
- Added R2 readiness state using private List/Get plus `delivery/quran-data/health.txt` with expected value `MIZAN R2 OK`.
- Added immutable object SHA-256 metadata for ingestion/resume conflict detection.
- Added storage measurement/reporting and a default 9 GiB engineering safety ceiling below the 10 GiB project ceiling.
- Updated `cloudbuild.yaml` with `--update-env-vars` and Secret Manager `--update-secrets` references so future Cloud Build deployments do not silently lose the R2 contract.
- Added checksum/quarantine/manifest helpers and a resumable verified uploader.
- No new runtime npm dependency was added.

## Official-source verification used for the ingestion catalog

Primary official KFGQPC developer platform:
`https://qurancomplex.gov.sa/en/techquran/dev/`

The official page currently publishes the following package checksums used by MIZAN:

| Dataset | Version | MD5 | SHA-1 |
|---|---:|---|---|
| Hafs Uthmanic | 13.0 | CF6841AEA5B1D1FD70D032B43FF08278 | 36EA5AB0D7EA1702F17FF43F9B50924CCCD77EBF |
| Warsh Uthmanic | 6.0 | 4701E8BBF053098220CF2CF4CDA206A1 | 44ECEA8FEB23817FDC01A8EE2162A6A0CF08CAE7 |
| Shu'bah Uthmanic | 4.0 | 5CDA29121BF0D7234E039002E1FBF600 | 8D66BDF0CAB96DC7D1032792C19F77980CA6682A |
| Qalun Uthmanic | 5.0 | 964208FF04C8AADD3DDC1BE262D8CFD3 | 81733666BE17742E13C9FA4C7D26D42B1ADC67C8 |
| Al-Duri 'an Abi Amr | 3.0 | A60BDD18397B3E27E4617478968A35C8 | 8049482F04B4FF1053A7859F96B2B113B9771EFB |
| Al-Susi 'an Abi Amr | 3.0 | 1BF6023E29B7622A52B6171232C17096 | E52DBC6D8B43797A8FAA0FD1EC1D8E5000265674 |
| Tafseer Muyassar | — | 5601682965E32F4DD6992C7600FDCCC3 | 5F533113C2F54F32EDED734BB49E6A5837965722 |
| Muyassar Ghareeb | — | 7E22381EEDB152EE7ED6488F2395C6CD | 055A908C6EC7F06912C33BD00920406C665CC5F9 |
| Tajweed Muyassar | — | B4A265A810C0CE4A722019791910B67E | D2496382FC5E843CCB693B94DD19407EAA174BEA |

Official current audio catalog checked:
`https://qc-dev.qurancomplex.gov.sa/quran-audios/`

Current selected delivery recordings confirmed in the official catalog:

- Hafs — Sheikh Maher Al-Muaiqly.
- Shu'bah — Sheikh Ali Al-Hudhaifi.
- Qalun — Sheikh Ali Al-Hudhaifi.
- Al-Susi 'an Abi Amr — Dr. Uthman Al-Siddiqi.
- Al-Duri 'an Abi Amr — Dr. Abdullah bin Awad Al-Juhani is listed, but the KFGQPC recitation listing reports an implausible/inconsistent ayah-package size (1.54 MB while the surah package is about 1.51 GB). MIZAN therefore blocks Al-Duri delivery ingestion until the actual package is independently validated.

KFGQPC's institutional structure page confirms a historical Warsh audio Mushaf by Dr. Ibrahim bin Saeed Al-Dosari, but the current downloadable audio catalog inspected for this patch does not expose a verified Warsh ayah package/mapping. MIZAN therefore keeps Warsh delivery audio at `OFFICIAL_AUDIO_UNAVAILABLE` rather than substituting another narration.

## Tests actually executed on the patch

- Private R2 key builder / versioned prefixes — PASS.
- Mushaf page range 1..604 and missing-page rejection — PASS.
- Exact Hafs/Shu'bah/Qalun/Al-Susi audio mapping — PASS.
- No Warsh or Al-Duri audio fallback — PASS.
- Checksum mismatch quarantine — PASS.
- Planned storage below 9 GiB safety ceiling — PASS.
- Actual storage report category accounting — PASS.
- Projected safety overflow rejection — PASS.
- R2 environment contract remains server-side — PASS.
- Delivery status exposes no endpoint/access key/secret — PASS.
- SigV4 request construction test — PASS.
- Frontend source leak regression test — PASS in the patch test harness.

Patch-specific executable tests: **9 passed, 0 failed**.

Patch TypeScript check using Node type declarations available in the execution environment: **PASS**.

`cloudbuild.yaml` YAML parse: **PASS**.

No real secret value is present in this patch.

## Not claimed / still requires real assets or deployment

The following are deliberately **not** claimed as complete because they were not actually executed with production credentials/assets:

- No upload to R2 was performed.
- `delivery/quran-data/health.txt` was not created remotely by this patch author.
- Private R2 connectivity from the deployed Cloud Run revision was not exercised by the new code because this patch was not deployed.
- No KFGQPC source ZIP/audio archive was downloaded into the working environment.
- No official-package MD5/SHA-1 was recomputed against downloaded bytes in this working environment.
- No MIZAN SHA-256 exists yet for those not-yet-downloaded official packages.
- The 604 official Mushaf master pages were not downloaded or converted in this working environment.
- Selected audio packages were not downloaded/extracted/normalized in this working environment.
- Actual R2 object count and storage bytes were not measured because no R2 credentials were used here.
- Full repository `npm run build`, project-wide TypeScript, existing test suite, Arabic UI audit, source audit and secret scan must be rerun after this patch is overlaid on the complete repository. Patch-specific TypeScript/tests were run separately and passed.

This boundary is intentional: MIZAN must not claim source, checksum, audio, page, cache, or R2 readiness that has not been exercised against the real bytes and production service.
