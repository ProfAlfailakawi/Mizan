# MIZAN — KFGQPC Complete Cloud Asset Pipeline

## Authority lock
MIZAN accepts Quran assets only from HTTPS URLs whose hostname is exactly `qurancomplex.gov.sa` or a real subdomain ending in `.qurancomplex.gov.sa`. This includes official services such as `download.qurancomplex.gov.sa`, `fonts.qurancomplex.gov.sa`, `qc-dev.qurancomplex.gov.sa`, and `dm.qurancomplex.gov.sa`. Lookalike domains are rejected.

## Covered datasets
The pipeline covers the agreed KFGQPC developer packages: Hafs v13, Warsh v6, Shu'bah v4, Qalun v5, Al-Duri from Abu Amr v3, Al-Susi from Abu Amr v3, Tafsir Muyassar, Ghareeb Muyassar, and Tajweed Muyassar. Published MD5 and SHA-1 values remain mandatory for these packages.

It also covers official Quran fonts for Hafs, Warsh, Shu'bah, Qalun, Al-Duri, and Al-Susi; the official 604-page Madinah Mushaf delivery set; and ayah audio targets for Hafs/Maher Al-Muaiqly, Shu'bah/Ali Al-Hudhaifi, Qalun/Ali Al-Hudhaifi, Al-Susi/Uthman Al-Siddiqi, with Al-Duri/Abdullah Al-Juhani and Warsh/Ibrahim Al-Dawsari handled fail-closed until a current direct official package passes structural validation.

## No app bloat
Heavy files are never added to GitHub, AI Studio source, Vite assets, or the Cloud Run image. Cloud Build uses an ephemeral staging directory and sends verified delivery files to the private Cloudflare R2 bucket. The browser receives assets through MIZAN server routes; the private R2 origin and credentials remain server-side.

## Validation gates
Developer packages: official source domain + exact MD5 + exact SHA-1 + safe ZIP extraction.

Mushaf pages: an official archive must yield exactly one identifiable source image for every page 001..604. The pipeline only renames/copies the exact image bytes to the delivery naming contract. It does not OCR, crop, rasterize a PDF, reconstruct, modify, or invent Quran pages.

Audio: an official archive must expose all 6,236 canonical Quran ayat in a parseable surah/ayah filename structure. Every canonical `(surah, ayah)` must exist exactly once. The pipeline copies the original audio bytes and only normalizes storage paths. No TTS, no cross-riwayah fallback, and no substitute reciter.

Fonts: only font files extracted from a direct official KFGQPC package are accepted. No third-party fonts are introduced by the cloud pipeline.

## Build modes
`cloudbuild-assets.yaml` is an audit build. It can discover official heavy candidates but contains no R2 upload command and no R2 secret binding.

`cloudbuild-assets-upload.yaml` is the explicit one-shot cloud acquisition/verification/upload build. It binds `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` from Google Secret Manager, downloads into ephemeral Cloud Build storage, verifies first, uploads verified objects using immutable versioned R2 keys, and finally runs the existing catalog publication path.

The upload build is never triggered by simply opening the application. It must be explicitly submitted by the operator after the audit is reviewed.

## Official URL overrides
If KFGQPC changes its page HTML so automatic discovery cannot identify a direct package, the heavy acquisition command accepts source URL environment overrides. Every override is still rejected unless it is HTTPS on `qurancomplex.gov.sa` or a real subdomain. Supported keys include `KFGQPC_MUSHAF_PAGES_URL`, six `KFGQPC_FONT_*_URL` keys, and six `KFGQPC_AUDIO_*_URL` keys. These are URLs, not credentials.

## Fail-closed exceptions
Warsh audio remains unavailable when the current official catalog exposes no verified direct ayah package. Al-Duri audio remains unverified under the existing MIZAN policy until the official listing anomaly is resolved by a direct package that passes archive-content validation. The pipeline does not weaken those states merely because historical evidence or a page title exists.
