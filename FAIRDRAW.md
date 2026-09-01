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
