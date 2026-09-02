# MGIP-1.0 — MIZAN Global Integrity Protocol

MGIP-1.0 is the MIZAN protocol profile for proving the integrity of a Quran competition from source to result. It is not claimed to be an external international standard. It is designed so an organizer, auditor, federation or public verifier can verify defined evidence without receiving unnecessary private data.

Evidence layers:
1. Quran source provenance: authority, reading scope, version and package hash.
2. Competition Genome: immutable rule/policy version used by the event.
3. FairDraw proof: algorithm, pool, constraints, commitment and permitted reveal proof.
4. Silent Question Capsule: server-held encrypted questions; participant presence + judge quorum before plaintext exposure.
5. Judging independence: locked judge commitments before advisory AI review.
6. Continuity: checkpoints, offline recovery and device/queue changes without silent history rewriting.
7. Result integrity: result seal, quorum, Merkle proof and certificate proof.
8. Audit integrity: server evidence ledger and Competition Black Box timeline.
9. Scientific integrity: capability-scoped AI evidence, dataset/benchmark scope and circuit breakers.
10. Privacy: public proofs minimize participant, judge and raw-audio disclosure.
11. Appeals: privacy-scoped Appeal Capsule.
12. Public event proof: MIZAN Integrity Passport.

Principle: the protocol proves what happened and which approved sources/rules governed it; it does not claim that technology replaces human religious or judging authority.

## Evidence spine and visual operating model

The protocol is now executable as a compact MIZAN status spine rather than only a document. Each control resolves to `READY`, `REVIEW` or `BLOCKED`, and the complete assessment is canonically hashed.

Required foundational controls:
- certified Quran source provenance;
- immutable competition policy version;
- verified FairDraw evidence;
- server-held question custody;
- participant presence and configured judge quorum before reveal;
- independent locked human judgments;
- Competition Black Box evidence;
- result seal;
- portable certificate/result proof;
- advisory-only AI boundary.

Lifecycle/conditional evidence such as a recovery checkpoint, appeal capsule or already-issued Integrity Passport can remain in `REVIEW` when the corresponding incident/lifecycle event has not occurred; their absence does not falsely block an otherwise valid competition.

The public/administrative visual rule is Quiet Authority: one vertical evidence story, one state per control and one protocol hash — no security-dashboard clutter.

## MGIP 1.1 — Visible Integrity Layer

MGIP now includes eight operational evidence surfaces that remain outside the Quran text itself:

1. **Mushaf Focus Lens** — a side-only passage indicator on the imported official Mushaf page. It never alters Quran glyphs.
2. **Zero-Knowledge Question Corridor** — operations can see SEALED / PRESENCE / QUORUM / RELEASED without question plaintext.
3. **Witness Mode** — high-risk physical exceptions can require independent digital witnesses who have no authority over the question or score.
4. **Exposure Radius** — counts exactly how many authorized recipients received question plaintext and flags unexpected exposure.
5. **Cold Vault Appliance** — encrypted Edge continuity package that rejects private/master keys, passwords, tokens, and credentials.
6. **Integrity Cinema** — privacy-safe chronological evidence scenes derived from the audit/black-box ledger, not participant video.
7. **MIZAN Certified Venue** — binds acoustic, device, software, Edge, offline-pass, recovery, source, and fallback-print baselines into a venue seal.
8. **Question Leakage Canary** — per-reveal HMAC canary outside Quran content, traceable to the authorized reveal receipt without changing a Quran character or audio sample.

### Question diversity rule

Official question starts are never arbitrary text offsets. Every server question start must resolve to an exact ayah boundary in the certified Quran source. Pools generated from selected ajza' are built from those source ayah boundaries. MIZAN prefers least-used start loci and balances mid/late-page loci against page/surah openings. If the unique start capacity is at least `participants × questions per participant`, full-field non-reuse is provable; otherwise MIZAN reports the shortage and minimizes reuse rather than claiming an impossible guarantee.

### Participant passage journey

After authorized question reveal, JudgeOS may automatically play the first ayah only from an approved, reading-matched reference audio. At the end of a passage, MIZAN emits the configured transition cue (default Arabic: **حسبك، جزاك الله خيرًا**) and automatically advances to the next sealed question after the configured delay. The final passage stops without inventing a next question and leaves the judge at submission/lock.
