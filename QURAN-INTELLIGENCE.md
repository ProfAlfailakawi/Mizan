# MIZAN Quran Intelligence & Live Alignment Layer

## Authority boundary

MIZAN treats KFGQPC as the Quran authority whenever an official original exists. Runtime code is fail-closed: no OCR-based Quran extraction, no cross-riwayah fallback, no Quran TTS, no invented word/waqf/tajweed mapping, and no AI score mutation.

## Implemented runtime layers

1. **Canonical ayah spatial mapping** — strict `(reading, surah, ayah)` resolution from the certified KFGQPC package, including page/line validation and `page_end` support only when that field is present in the official imported metadata.
2. **Focus Lens** — a separate JudgeOS overlay. It does not rewrite, crop, blur, or redraw the official Mushaf image. Multi-page passage loci are rendered independently.
3. **Vector repository** — stores only derived metadata. A layer with no evidence-backed semantic binding remains `UNRESOLVED_VECTOR_LAYER`; it cannot become a verified word mapping by naming convention or geometry inference.
4. **Waqf repository** — occurrence data must point to KFGQPC evidence and an exact reading. Missing official structured data is represented as `OFFICIAL_DATA_UNAVAILABLE`.
5. **Tajweed repository** — versioned rules/evidence/occurrences. Fine-grained human-derived loci require explicit human review; runtime never infers production occurrences from a generic tajweed rule list.
6. **Streaming forced-alignment state machine** — `LOCKED`, `PROBABLE`, `UNCERTAIN`, `LOST`, `REACQUIRING`, `REACQUIRED`; low confidence holds the last trusted pointer. Output is permanently `SHADOW_ONLY`, `HUMAN_ONLY`, `scoreDelta: 0`.
7. **Benchmark gate** — per-reading model use requires an approved report, overall thresholds, child/adult/noise slices, and two threshold approvers before JudgeOS live-shadow streaming is enabled.
8. **Provenance** — `VERIFIED`, `QUARANTINED`, `UNVERIFIED`, `OFFICIAL_DATA_UNAVAILABLE`, with source URL/version, local SHA-256, parser version, generated artifact hash, review/checksum evidence.

## APIs

- `GET /api/quran/intelligence/capabilities`
- `GET /api/quran/intelligence/status`
- `GET /api/quran/location/:reading/:surah/:ayah`
- `GET /api/quran/passage/:reading/:surah/:startAyah/:endAyah`
- `GET /api/quran/waqf/:reading/:surah/:ayah`
- `GET /api/quran/tajweed/:reading/:surah/:ayah`
- `POST /api/quran/alignment/shadow/audio`
- `POST /api/quran/alignment/shadow/reset`
- Enterprise registration endpoints for vector, waqf, tajweed, and benchmark artifacts.

All reader endpoints require an authenticated MIZAN role. Dataset registration remains server/enterprise controlled. Audio chunks are bounded and forwarded server-to-server; backend credentials never enter the browser.

## Vector master workflow

The Adobe/vector original must stay outside the Git worktree and should be kept in the offline master archive. Export only non-destructive layer metadata from an approved local Adobe/vector process, then run:

```bash
npx tsx scripts/kfgqpc-vector-derive.ts \
  --master /secure/offline/KFGQPC-master.ai \
  --layers /secure/offline/layers.json \
  --output /secure/derived/hafs-vector.json \
  --reading hafs \
  --source-url https://qurancomplex.gov.sa/... \
  --source-version <official-version> \
  --source-asset-id kfgqpc-madinah-print-vector
```

Without an official checksum, add two independent reviewers plus `--reviewed-at` before a derived artifact can be marked `VERIFIED`. Semantic word bindings are accepted only when each layer export already carries an evidence ID and an approved binding method. The script never derives a word identity from layer order/name/geometry.

## Alignment backend contract

Configure `MIZAN_QURAN_ALIGNMENT_URL` only for a Quran-specific acoustic aligner. MIZAN sends the exact reading, expected surah/ayah window, certified source package ID/hash, and an audio chunk. The backend response may contain a candidate `(surah, ayah, wordIndex, phonemeIndex?)`, confidence, alternatives, silence duration, acoustic quality, and model version.

MIZAN rejects cross-reading source packages and candidates outside the expected passage. A per-reading benchmark must be `VERIFIED` before JudgeOS can activate live shadow tracking. The backend can never submit a judging event or alter a score.

## Scientific activation rule

Code presence is not scientific completion. Waqf, tajweed occurrences, word-vector mapping, and each reading-specific acoustic model remain unavailable/unverified until their actual official assets/evidence are imported and pass their gates. Do not relabel placeholders, inferred mappings, or generic rule lists as official occurrence data.
