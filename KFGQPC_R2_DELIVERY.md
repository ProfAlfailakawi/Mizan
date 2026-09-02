# MIZAN · KFGQPC private R2 delivery architecture

MIZAN keeps Quran source authority separate from web delivery. The Cloudflare R2 bucket is **private** and is accessed only by the MIZAN server through the R2 S3-compatible API.

## Production contract

Bucket: `mizan-quran-assets`

```text
delivery/
  mushaf-pages/
    madinah/
      v1/
        001.webp ... 604.webp
        manifest.json
  audio/
    hafs/maher-al-muaiqly/v1/NNN/NNN.mp3
    shubah/ali-al-hudhaifi/v1/NNN/NNN.mp3
    qalun/ali-al-hudhaifi/v1/NNN/NNN.mp3
    susi/uthman-al-siddiqi/v1/NNN/NNN.mp3
  quran-data/
    hafs/v13/
    warsh/v6/
    shubah/v4/
    qalun/v5/
    duri-abi-amr/v3/
    susi-abi-amr/v3/
    tafsir-muyassar/v1/
    ghareeb-muyassar/v1/
    tajweed-muyassar/v1/
  fonts/
    hafs/v13/primary.ttf
    warsh/v6/primary.ttf
    shubah/v4/primary.ttf
    qalun/v5/primary.ttf
    duri-abi-amr/v3/primary.ttf
    susi-abi-amr/v3/primary.ttf
```

`NNN/NNN` is zero-padded surah/ayah. MIZAN does not define a generic cross-reading audio key. Each accepted audio ID maps to exactly one narration/reciter prefix.

## Server-only environment

```bash
R2_ACCESS_KEY_ID=                  # Secret Manager reference in Cloud Run
R2_SECRET_ACCESS_KEY=              # Secret Manager reference in Cloud Run
R2_ENDPOINT=https://c5d74db879abf3d428e4abdd485d338a.r2.cloudflarestorage.com
R2_BUCKET=mizan-quran-assets
R2_REGION=auto
MIZAN_R2_SAFETY_LIMIT_BYTES=9663676416
```

Never use `VITE_R2_*`. The browser requests same-origin MIZAN API routes. The R2 endpoint, access key and secret are not required by React and are not returned by delivery status.

## Delivery order

1. Verified venue/local cache when configured.
2. Private R2 S3 object.
3. No fabricated fallback.

The server maintains a small ephemeral `/tmp` cache for immutable R2 delivery objects. This keeps the existing Express `sendFile` path efficient and allows normal HTTP range behavior for cached audio without exposing the R2 origin.

## Health/readiness

The authenticated KFGQPC delivery-status endpoint now reports only safe state values such as `READY`, `CHECKING`, `UNAVAILABLE`, or `NOT_CONFIGURED`.

Private-R2 readiness checks both the private bucket and the permanent control-plane catalog:

```text
delivery/_mizan/catalog.json
```

The catalog is published only after every required dataset is VERIFIED, the 604-page surface is complete, the four selected audio packages are verified, the storage safety ceiling is satisfied, Warsh audio is explicitly marked `OFFICIAL_AUDIO_UNAVAILABLE`, and Al-Duri audio remains `UNVERIFIED` until its official package discrepancy is resolved. No disposable `health.txt` object is required.

No credential, secret, authorization header, or private object URL is returned.

## Ingestion

Use:

```bash
npx tsx scripts/kfgqpc-ingest.ts --dry-run --only hafs --root .mizan-ingest
npx tsx scripts/kfgqpc-ingest.ts --verify --only hafs --root .mizan-ingest
npx tsx scripts/kfgqpc-ingest.ts --upload --resume --only hafs --root .mizan-ingest
npx tsx scripts/kfgqpc-ingest.ts --report --root .mizan-ingest
```

The uploader reads credentials only from environment variables, rejects checksum mismatches, refuses unverified datasets, rejects immutable-key conflicts, enforces the configured storage safety ceiling, and publishes the permanent READY catalog only after a complete successful ingest.

## Scientific guardrails

- Original KFGQPC vector/print masters remain offline archival assets and are not counted in R2 delivery storage.
- No Quran TTS.
- No Hafs audio fallback for Warsh, Qalun, Shu'bah, Al-Susi, or Al-Duri.
- Al-Duri audio remains blocked until the inconsistent official ayah-package listing is independently validated against the actual downloadable package.
- KFGQPC historically confirms a Warsh recording, but MIZAN does not expose Warsh delivery audio until a current downloadable official ayah package and exact mapping are verified.
- Optimized Mushaf pages are derivatives of verified official masters; the Quran is never reconstructed with OCR or retyped over page images.


## One-shot production ingest

For a full production push, stage all verified source archives and delivery payloads under `.mizan-ingest/`, then run exactly one full ingest command:

```bash
npx tsx scripts/kfgqpc-ingest.ts --upload --resume --report --root .mizan-ingest
```

The command is fail-closed: if even one required dataset is missing, unverified, quarantined, malformed, or would exceed the safety ceiling, MIZAN does not publish the READY catalog. Individual Quran/media objects remain immutable; `delivery/_mizan/catalog.json` is the only mutable readiness pointer and is accompanied by a timestamped immutable catalog snapshot.
