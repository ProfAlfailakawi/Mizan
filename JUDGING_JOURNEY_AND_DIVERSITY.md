# MIZAN Judging Journey & Question Diversity

## What the participant experiences

1. Participant is physically present.
2. Assigned judges approve reveal.
3. Server releases question plaintext only after quorum.
4. Official Mushaf surface appears.
5. If an approved exact-reading audio reference exists, the first ayah plays automatically once.
6. Participant recites.
7. When the passage ends, MIZAN says the configured cue (default: **حسبك، جزاك الله خيرًا**).
8. If another passage exists, MIZAN advances after a controlled delay. The next question remains sealed until its reveal conditions are satisfied.
9. After the final passage, MIZAN does not create another question; the judge submits and locks independently.

## How starts are chosen

- Never from an arbitrary character offset.
- Every start must exist as an ayah boundary in the exact certified Quran package selected for the reading.
- The server can generate a pool directly from the selected ajza' in that certified package.
- Page/surah openings are not the default visual pattern. The diversity ledger prefers least-used loci and reduces repeated page/surah openings when equivalent alternatives exist.
- A competition may require `SCIENTIFICALLY_APPROVED` start loci for stricter expert-governed ibtida policy.

## 100-participant example

If 100 participants each require 3 questions, full non-reuse requires at least **300 unique eligible start loci** for that reading/scope. MIZAN calculates this before claiming a guarantee. With 300 eligible loci, the automated test allocates all 300 exactly once across the 100 participants, producing 100 different question sets.

If only 220 eligible loci exist, MIZAN does **not** claim 300 unique questions. It reports the capacity gap and uses the least-used-locus algorithm to minimize reuse fairly.
