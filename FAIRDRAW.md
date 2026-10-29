# FairDraw

FairDraw does not claim philosophical or absolute fairness. It proves that a draw satisfied the competition's configured constraints.

Current implementation (`src/lib/fairdraw.ts`) uses:
- approved question pool only;
- riwaya/scope filtering when data exists;
- configured question count;
- target difficulty and tolerance metadata;
- diversity across surahs/juz when requested;
- secure random tie-breaking when Web Crypto is available;
- SHA-256 commitment containing the selected set, participant, policy version and a random seed.

Production extensions:
- expert difficulty vectors beyond a single scalar;
- historical difficulty as supplemental evidence, never the only authority;
- explicit repeat exclusion per round;
- independent audit tool that validates the stored draw context without exposing future seeds.

## Live-draw seed scheme (versioned)

The in-hall draw seeds two things: the delivery-Mushaf question pool (`buildDeliveryQuestionPool` `seedBase`) and the allocation engine (`QuestionAllocationEngine` `seed`).

- **Scheme 1 (legacy, no `drawSeedScheme` field):** both seeds were `${competitionId}:${participantId}`. Anyone who knew the two ids could compute the pool, and through the public `GET /api/public/kfgqpc/fairdraw/:readingId` endpoint also the passages, before the draw. Records without the field are read with this scheme, exactly as before.
- **Scheme 2 (`drawSeedScheme: 'MIZAN-DRAW-SEED-2'`):** a fresh 256-bit secret is generated when the draw runs. It is mixed into both seeds (`${competitionId}:${participantId}:${secret}`, see `liveDrawSeedBase` in `src/lib/fairdraw.ts`) and is the same seed that the selection commits to (`seedCommitmentHash = SHA256(secret)`, inside `publicCommitmentHash`) and reveals in its receipt (`seedReveal`). A verifier rebuilds the engine with `liveDrawSeedBase({competitionId, participantId, drawSeedScheme, seedReveal})` and replays the draw.

Known limit: the secret is generated on the device that runs the draw, so it is unpredictable to participants but is not bound in advance to a server-side commitment (`/api/integrity/fairdraw/commit`). Pre-generated model batches use their own batch seed and are not changed by this scheme.
