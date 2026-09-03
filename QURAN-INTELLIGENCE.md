# MIZAN Quran Intelligence & Live Alignment Layer

## Authority boundary

MIZAN treats KFGQPC as the Quran authority whenever an official original exists. Runtime code is fail-closed: no OCR-based Quran extraction, no cross-riwayah fallback, no Quran TTS, no invented word/waqf/tajweed mapping, and no AI score mutation.

## Implemented runtime layers

1. **Canonical ayah spatial mapping** — strict `(reading, surah, ayah)` resolution from the certified KFGQPC package, including page/line validation and `page_end` support only when that field is present in the official imported metadata.
2. **Focus Lens** — a separate JudgeOS overlay. It does not rewrite, crop, blur, or redraw the official Mushaf image. Multi-page passage loci are rendered independently.
3. **Vector repository** — stores only derived metadata. A layer with no evidence-backed semantic binding remains `UNRESOLVED_VECTOR_LAYER`; it cannot become a verified word mapping by naming convention or geometry inference.
4. **Waqf & Ibtida printed-sign layer** — MIZAN v2 derives the printed waqf/sakt signs directly and deterministically from the certified KFGQPC `aya_text` for the exact reading. Every occurrence carries the original Unicode sign, code-point and UTF-16 offsets, source-text SHA-256, deterministic evidence ID, package/version provenance, and full-coverage accounting. The deriver never invents `wordIndex`; word-level binding remains unavailable until an official word mapping exists.
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
- `POST /api/enterprise/quran/intelligence/waqf/derive/:reading` to force deterministic regeneration from the already-certified KFGQPC source package.

All reader endpoints require an authenticated MIZAN role. Dataset registration remains server/enterprise controlled. Audio chunks are bounded and forwarded server-to-server; backend credentials never enter the browser.


## Waqf v2 automatic derivation

Waqf v2 is tied to the same certified KFGQPC package already used by canonical Quran mapping. After `POST /api/enterprise/science/quran/kfgqpc/ingest` succeeds, MIZAN immediately derives and registers the waqf artifact for that exact package. On server startup it also bootstraps any certified package whose waqf artifact is missing or stale.

The supported printed signs are represented by their official Unicode characters and controlled display labels: `م`, `لا`, `ج`, `صلى`, `قلى`, the paired/embracing stop sign, and `س` for saktah when the sign is actually present in the official text. MIZAN does not manufacture a sign that is absent from `aya_text`.

Each occurrence is verified again before registration against all of the following: exact reading/package identity, published package MD5/SHA-1 catalog identity, certified source state, normalized source-data SHA-256, exact verse-text SHA-256, Unicode code-point offset, UTF-16 offset, symbol definition registry, deterministic evidence ID, occurrence completeness, and the generated artifact SHA-256. A mismatch fails closed.

To regenerate manually after source ingestion:

```bash
npm run waqf:derive -- \
  --source-dir /secure/quran-source-vault \
  --intelligence-dir /secure/quran-intelligence \
  --reading hafs
```

Use `--reading all` to derive every currently ingested supported narration. Readings whose official package is not yet ingested remain unavailable; the command does not fall back to another narration.

### Word-level boundary

The KFGQPC developer rows used here expose ayah text and spatial metadata but not an official `wordIndex` for each waqf sign. Therefore the automatic deriver deliberately leaves `wordIndex` undefined. JudgeOS may show verified signs at the current ayah, but Streaming Alignment does **not** claim that an ayah-level sign belongs to the currently aligned word. Exact `waqfEvidence` at word level is returned only when a future official word mapping supplies that binding; otherwise the signs remain `waqfAyahContext`.

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

Code presence is not scientific completion. The Waqf printed-sign layer becomes `VERIFIED` automatically only after the exact KFGQPC reading package has been certified and the v2 derivation/coverage verification passes. Richer waqf/ibtida semantics beyond printed official signs, tajweed occurrences, word-vector mapping, and each reading-specific acoustic model remain unavailable/unverified until their actual official assets/evidence are imported and pass their gates. Do not relabel placeholders, inferred mappings, or generic rule lists as official occurrence data.
