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
