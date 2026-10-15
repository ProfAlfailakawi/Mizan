# Design QA — Competition judging workspace

- Result: **Passed**
- Reference: the owner's mock-up screenshot of the judging workspace (supplied in chat on 2026-09-09; not stored in the repository)
- Implementation screenshot: viewport capture of the Judging tab (taken during the session; not stored in the repository)
- Side-by-side comparison: reference vs. capture, reviewed in the session (not stored in the repository)
- Browser viewport: 1273 × 716
- Verified state: Arabic, competition manager, dedicated Judging tab selected, three real panels and two governed judges visible.

## Comparison history

1. Reference showed judging assignment embedded low in the Operations page, with available judges missing.
2. Implementation moves the same governed panel controls into a dedicated top-level Judging tab and keeps the existing visual system.
3. Live DOM verification confirmed both governed judge identities appear in every panel selector and the configured requirement can be one judge.
4. Password-reset deep link was opened directly and rendered its handled invalid-link state instead of a blank page.
5. The published competition card keeps a permanent `صفحة المسابقة` action beside `ضبط`; live DOM verification confirmed it remains visible after the status changes to `registration_open`.

No clipping, horizontal overflow, broken controls, or duplicate administration chrome was observed in the viewport capture.
