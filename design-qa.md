# Design QA — Competition judging workspace

- Result: **Passed**
- Reference: `/Users/prof.ahmadalfailakawi/Desktop/Screenshot 2026-09-09 at 6.42.00 AM.png`
- Implementation screenshot: `/Users/prof.ahmadalfailakawi/.codex/visualizations/2026/09/09/01a08437-664b-7973-bc5d-8760bcaa5fef/judging-tab-viewport.png`
- Side-by-side comparison: `/Users/prof.ahmadalfailakawi/.codex/visualizations/2026/09/09/01a08437-664b-7973-bc5d-8760bcaa5fef/judging-reference-comparison.png`
- Browser viewport: 1273 × 716
- Verified state: Arabic, competition manager, dedicated Judging tab selected, three real panels and two governed judges visible.

## Comparison history

1. Reference showed judging assignment embedded low in the Operations page, with available judges missing.
2. Implementation moves the same governed panel controls into a dedicated top-level Judging tab and keeps the existing visual system.
3. Live DOM verification confirmed both governed judge identities appear in every panel selector and the configured requirement can be one judge.
4. Password-reset deep link was opened directly and rendered its handled invalid-link state instead of a blank page.
5. The published competition card keeps a permanent `صفحة المسابقة` action beside `ضبط`; live DOM verification confirmed it remains visible after the status changes to `registration_open`.

No clipping, horizontal overflow, broken controls, or duplicate administration chrome was observed in the viewport capture.
