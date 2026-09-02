# MIZAN — KFGQPC Asset Storage Plan

## Demo fixture
- Default demo panel requirement: 1 judge.
- Active demo committee: `comm-1` with `usr-judge-1` only.
- Other demo committees remain offline/empty until explicitly configured.
- Production Competition Genome / runtime quorum logic is unchanged.

## Recommended storage topology

### 1) Private authoritative originals — Cloudflare R2
Bucket suggestion: `mizan-quran-source-vault`

Store immutable originals by authority/version, for example:

```
kfgqpc/
  developer/
    hafs/v13/
    warsh/v6/
    shubah/v4/
    qalun/v5/
    duri-abi-amr/v3/
    susi/v3/
  knowledge/
    tafsir-muyassar/
    ghareeb-muyassar/
    tajweed-muyassar/
  mushaf-masters/
  audio/
```

Keep source ZIP/AI/font/audio objects versioned. Do not overwrite an existing certified object key.

### 2) Public/streaming derivatives — separate R2 bucket
Bucket suggestion: `mizan-quran-delivery`
Custom domain suggestion: `quran-assets.<your-domain>`

Use only approved derivatives needed by browsers: optimized page images, fonts when permitted, and audio files/segments. Keep master/source packages private.

### 3) Database / Firestore
Store metadata only: package ID, authority, qira'ah/rawi/tariq, hashes, object key, byte size, approval/certification state, version, and provenance. Do not store large binaries in Firestore.

### 4) Venue Edge
Before an event, sync only the competition-required source version(s), page assets, audio reference(s), public keys, and continuity data to an encrypted local Edge cache. Edge is a continuity replica, not the source of truth.

## Verified public package sizes from KFGQPC developer platform
Known developer/text/knowledge packages total approximately **82.342 MB**:
- Hafs smart Unicode: 21.6 MB
- Hafs Uthmani: 10 MB
- Warsh: 8.62 MB
- Shu'bah: 8.33 MB
- Qalun: 8.35 MB
- Al-Duri 'an Abi Amr: 8.38 MB
- Al-Susi: 8.44 MB
- Tafsir Muyassar: 7.51 MB
- Ghareeb Muyassar: 934 KB
- Tajweed Muyassar: 178 KB

## Verified public audio sizes (ayah-split packages currently listed by KFGQPC)
Approximately **10.94 GB** for the currently listed set used in the estimate. This includes several Hafs reciters plus Qalun, Shu'bah, Al-Duri 'an Abi Amr and Al-Susi. The current public audio index should be rechecked before bulk ingestion because the catalog can change.

## Mushaf master/page images
The KFGQPC developer page confirms a digital vector copy of Mushaf al-Madinah for printing works, but the page reviewed did not publish a reliable downloadable total byte size for that master package. Do not invent a certified size. Record the actual byte size after download and hash verification.

## Practical initial capacity
- Text/data only: < 0.1 GB.
- Current official audio set + text data: about 11.1 GB.
- With Mushaf masters / optimized page delivery assets: provision **20 GB initially** for MIZAN-required assets, then grow from measured ingestion.
- Do not ingest the complete KFGQPC publication-photo/book/translation universe unless MIZAN actually needs it.
