# MIZAN Streaming Quran Forced-Alignment Engine

A **real, streaming, Quran-specific forced-alignment engine** — not an STT wrapper, not a mock. It
answers one question continuously: *"where inside the EXPECTED passage has the reciter reached now?"*
and emits structured events `{ readingId, surah, ayah, wordIndex, confidence, state, audioTimeMs }`.

Location: `server/alignment/`. Tests: `tests/alignment-*.test.ts`. Mounted at `POST /api/align/*`.

---

## 1. What is real here (and what is honestly not yet)

**Real, measured, tested (this delivery):**
- Real DSP front-end from raw PCM bytes: pre-emphasis → Hamming → **radix-2 FFT** → **mel filterbank**
  → **MFCC** (+ causal deltas + running CMN). Proven by `alignment-features.test.ts` (FFT resolves a
  known tone; MFCC discriminates frequencies; VAD separates tone from silence).
- Real acoustic backend: **audio-to-audio forced alignment**. MIZAN already holds the certified
  reference recitation per ayah; the engine extracts its MFCC and matches the live reciter against
  it, constrained to the expected passage. Interface `AcousticBackend` — a neural CTC/embedding
  backend can replace it with **no change** to the decoder.
- Real constrained decoder: a **banded Viterbi over reference-frame index** with a penalized
  reset/jump transition (soft-monotonic → repeats/backtracks/recovery are representable). Proven to
  track word 0→N on real MFCC in `alignment-engine.test.ts`.
- Real confidence, state machine, temporal smoothing, repeat/backtrack detection, recovery.
- Real streaming HTTP API, session isolation, fail-closed guards, versioned manifests.
- Real benchmark harness with golden sessions, metrics, and production gates.

**Honestly NOT claimed:**
- No Quran-fine-tuned **neural** acoustic model ships here (none is available/trainable in this
  environment). The operational backend is reference-template matching.
- **Human-recitation accuracy is UNMEASURED.** The benchmark uses *synthetic* per-word acoustic
  signatures (labelled) to validate the **tracking algorithm**, not human voices. Therefore the
  engine is **SHADOW_ONLY** and the gate evaluator refuses to recommend `LIVE_ASSIST` on synthetic
  data alone. Promotion to `LIVE_ASSIST` requires a real-audio golden set that passes the gates.

This mirrors MIZAN's existing honesty rules (`AI_INTEGRITY.md`, `PROJECT_STATUS.md`): a capability
stays disabled/Beta until its evidence is real.

---

## 2. Architecture (layers)

```
PCM chunk (16k mono s16le)
  → StreamingFramer                 audio/pcm.ts        (bounded-memory framing)
  → VAD                             audio/vad.ts        (speech vs silence; never advance on silence)
  → FeatureFrontend (MFCC)          audio/frontend.ts   (identical for reference & live)
  → StreamingPositionDecoder        decoder/            (banded Viterbi + reset/jump = soft-monotonic)
      over AcousticBackend          acoustic/           (reference-template today; neural tomorrow)
  → TemporalSmoother                smoothing.ts
  → ConfidenceEngine                confidence.ts       (multi-signal, calibrated, EMA-smoothed)
  → RepeatBacktrackDetector         repeat-detect.ts    (evidence, never a verdict)
  → TrackingStateMachine            state-machine.ts    (INITIALIZING…LOCKED…LOST…REACQUIRED…)
  → RecoveryEngine                  recovery.ts         (progressive window widening + anchors)
  → EventEmitter                    events.ts           (scoreDelta:0, authority:HUMAN_ONLY)
```
Orchestrated by `engine.ts`; wrapped per-session by `session.ts`; exposed by `api.ts`.

### Why this decoder
A generic STT → fuzzy-text-search would guess a position from free text. Instead we do **constrained
forced alignment**: the search space is the known passage (± small margins), and the state is the
reference-frame index. Forward motion is a strong prior (cheap ADVANCE transitions); a flat-penalty
RESET/JUMP transition lets the path leave monotonicity exactly when the acoustics demand it (a
repeat, a backtrack, a self-correction, a recovery). This is the listed toolkit — Viterbi / DP /
monotonic alignment / constrained decoding — chosen because the passage is known up front (§6).

---

## 3. Reading isolation (red line, §5)

Every session is bound to one `readingId`. There is **no** cross-reading fallback, text merging, or
lexicon/model reuse. `reading.ts` fail-closes on unknown / non-operational / mismatched readings, and
`engine.ts` refuses a passage or backend whose reading disagrees. MVP operational reading: **Hafs**;
the architecture is multi-reading from day one (add a lexicon + reference set per reading).

## 4. Governance (the engine is never a judge, §11)

Every event carries `scoreDelta: 0` and `authority: 'HUMAN_ONLY'`, constructed in exactly one place
(`events.ts`). The engine produces tracking/timing/confidence **evidence**; it never deducts a score,
fails a contestant, or rules on tajwīd/memorization. Repeat/backtrack/self-correction are labelled
observations for a human judge.

## 5. Canonical representation & text safety (§4, §22, §23)

`canonical.ts` builds a reading-locked passage with per-word original text (never mutated), an
alignment-normalized form, graphemes, Hafs phonemes (`lexicon-hafs.ts`, developmental — no tajwīd
ruling), signatures, and prev/next links, plus a `canonicalTextHash`. Production sources words from
the **certified Quran Source Vault**; a clearly-labelled development passage (al-Baqarah 255–257)
serves the tests/benchmark only.

## 6. Streaming API (§34)

```
POST   /api/align/session                 { readingId, surah, startAyah, endAyah, expectedStartWordIndex?, canonicalTextHash?, canonicalPackageVersion? }
POST   /api/align/session/:id/audio       { seq, audioBase64, sourceRate }   → { events, metrics, state }
POST   /api/align/session/:id/complete    → { event: SESSION_COMPLETED, metrics }
GET    /api/align/session/:id             → status + manifest
DELETE /api/align/session/:id             → cancel
```
Ordered chunks (sequence numbers), malformed-audio rejection, idle-session reaping, optional Firebase
role auth. Fail-closed by default: **without an ingested acoustic reference the API refuses to align**
(`ACOUSTIC_REFERENCE_UNAVAILABLE`). Set `MIZAN_ALIGNMENT_DEV_SYNTH=true` for a clearly-synthetic dev
reference for local end-to-end trials (never production).

## 7. Benchmark & gates (§38–§41)

`benchmark/` runs golden sessions through a real engine and scores: ayah accuracy, word accuracy
(±0 and ±1), mean position error, lost rate, false-jump rate, median latency, and a
correct-vs-wrong confidence signal. `evaluateGates` applies thresholds and, on synthetic data, caps
the recommendation at `SHADOW_ONLY`.

**Measured on the synthetic algorithm-validation set (al-Baqarah 256, Hafs):**

| scenario     | ayah | word | ±1 word | pos err (words) | lost | false-jump |
|--------------|------|------|---------|-----------------|------|------------|
| normal       | 1.00 | 1.00 | 1.00    | 0.00            | 0.00 | 0.00       |
| slow         | 1.00 | 1.00 | 1.00    | 0.00            | 0.00 | 0.00       |
| fast         | 1.00 | 1.00 | 1.00    | 0.00            | 0.00 | 0.00       |
| pause        | 1.00 | 0.83 | 0.83    | 0.71            | 0.00 | 0.17       |
| backtrack    | 1.00 | 0.97 | 0.97    | 0.07            | 0.00 | 0.00       |
| from-middle  | 1.00 | 0.83 | 0.83    | 1.25            | 0.00 | 0.08       |

Aggregate: ayah 1.00, word 0.94, false-jump 0.042, lost 0.00, median latency 260 ms →
**gate passed (algorithmic), recommendation SHADOW_ONLY**. These numbers describe the *tracking
algorithm on synthetic audio*; they are **not** a claim about human recitation.

## 7a. Mutashābihāt early-warning (§29)

`mutashabihat.ts` warns the head judge exactly when a reciter enters a confusable stretch — where
deciding position on words alone is unsafe. It fuses two independent, honest sources into one
`MUTASHABIH_RISK` event (evidence only: `scoreDelta:0`, `authority:HUMAN_ONLY`, reading-locked):

- **Static** `MutashabihatMap`: precomputes, per word, a confusability risk from repeated/near-repeated
  word n-grams **within** the passage (rarity-weighted, with one-substitution matching), plus an
  optional **curated** cross-sūrah table supplied by scientific governance. High-risk words group into
  windows; entering a window is announced once.
- **Live** `liveNearTie`: uses the decoder's own `competingGap` + candidate — when a strong,
  **distant** competitor is near-tied with the best word, that is real-time acoustic evidence of a
  look-alike locus (it even catches reordered "mirror" phrases the static index cannot).

Each event names the confusable partner loci (`confusable: ConfusableRef[]`). Verified end-to-end
(`alignment-mutashabihat.test.ts`): on a passage repeating «رَبَّنَا آتِنَا فِي الدُّنْيَا», the engine
flags both occurrences statically (risk 1.00, paired) and live (near-ties, gap 0.01–0.12). This is the
first recitation tracker to warn about mutashābihāt *at the exact locus*, powered by the constrained
decoder's competing-hypothesis signal.

## 8. Versioning & reproducibility (§45, §46)

`manifest.ts` stamps every session/benchmark with engine version, model id/version, backend kind,
lexicon version, canonical package version + text hash, and a config hash.

## 9. Deployment seam (§32, §33)

`AcousticBackend` is the single swap point for Server-GPU / venue-local / on-device backends. The
transport is plain HTTP chunked (no dependency); a WebSocket transport can wrap the same session
manager later without touching the engine.

## 10. Roadmap to LIVE_ASSIST

1. Ingest certified reference recitation audio + word boundaries per passage (replaces the dev synth).
2. Collect a real-audio golden set (varied ages/voices/rooms, with independent ground truth, §21/§39).
3. Run the benchmark on real audio; only if the gates pass does a reading move to `LIVE_ASSIST`.
4. Optional: add a neural CTC/phoneme backend behind `AcousticBackend` for robustness; add readings
   (Warsh, Qālūn, …) each with its own lexicon + reference set (never merged).
