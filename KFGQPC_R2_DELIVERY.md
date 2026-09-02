# MIZAN · KFGQPC delivery architecture

MIZAN keeps Quran source authority separate from web delivery.

## Free-tier rule

Cloudflare R2 Standard is treated as a **delivery cache/object store**, not the archival master vault. The original KFGQPC print/vector masters stay in an offline archive (encrypted workstation/external disk plus backup). R2 contains only browser-ready assets.

Planned object layout:

```text
mushaf/
  kfgqpc-hafs-madinah/
    pages/1.webp ... 604.webp
    manifest.json
audio/
  hafs-muaiqly/ayah/{surah}/{ayah}.mp3
  shubah-hudhaifi/ayah/{surah}/{ayah}.mp3
  qalun-hudhaifi/ayah/{surah}/{ayah}.mp3
  susi-siddiqi/ayah/{surah}/{ayah}.mp3
fonts/
  primary.woff2
quran-data/
  ... verified developer packages ...
```

Do not upload duplicate Hafs reciters during the free-tier phase. Do not upload Al-Duri or Warsh audio until the exact official downloadable package and ayah mapping have been verified.

## Environment

```bash
MIZAN_KFGQPC_R2_DELIVERY_BASE_URL=https://quran-assets.example.com
# Optional only when the delivery origin is protected by a bearer-aware gateway:
MIZAN_KFGQPC_R2_BEARER_TOKEN=

# Local/venue fallback cache paths remain supported:
MIZAN_KFGQPC_PAGE_IMAGE_ROOT=/var/lib/mizan/kfgqpc/pages
MIZAN_KFGQPC_AUDIO_ROOT=/var/lib/mizan/kfgqpc/audio
MIZAN_KFGQPC_FONT_ROOT=/var/lib/mizan/kfgqpc/fonts
```

The browser does not need the R2 origin URL. JudgeOS requests same-origin MIZAN API routes, and the server resolves local cache first, then R2. This keeps the CSP small, allows venue/offline fallback, and lets the R2 hostname change without rebuilding the frontend.

## Storage budget

The executable budget in `server/kfgqpc-delivery.ts` reserves roughly:

- 724.25 MB — Hafs, Maher Al-Muaiqly
- 722 MB — Shu'bah, Ali Al-Hudhaifi
- 760.66 MB — Qalun, Ali Al-Hudhaifi
- 3.25 GB — Al-Susi, Uthman Al-Siddiqi
- 83 MB — Quran developer/scientific data allowance
- 180 MB — optimized Madinah Mushaf web pages + manifest allowance

This intentionally leaves several GB of the 10 GB-month Standard free tier uncommitted for verified additions, cache/version headroom, Al-Duri after validation, or a future Warsh audio package.

The 180 MB page figure is a **delivery engineering allowance**, not the size of the official KFGQPC vector master. The official developer platform describes the print Mushaf as high-quality vector files; MIZAN preserves those master bytes offline and publishes only verified web derivatives.
