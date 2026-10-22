# Quality scorecard, round 3 (presentation only)

Method: production build of the tree served statically (before = `d7cb2a2`, after = this branch), Chromium via Playwright, axe-core (wcag2a/2aa/21a/21aa/22aa + best-practice) plus custom checks: overflow, clipped text, console errors, CLS, focus indicator, stuck-invisible, computed contrast, running animations under reduced motion.
Coverage per run: login, 6 public routes (`#discover #competition #register #verify #passport #trust-verify`), 18 demo roles, 8 competition-admin sections = 32 screens, at 320/390/768/1280 px, with normal and reduced motion = **256 measurements**. Arabic UI, light theme only (the app has no dark theme). Screenshots at 390 and 1280 were captured and reviewed by eye for the key screens.

## Before / after (256 measurements)
| Criterion | Before | After |
|---|---|---|
| Fully passing every hard criterion | 0 | 32 |
| H1 axe violations (screens) | 256 | 40 |
| axe rule hits (total) | 686 | 64 |
| axe serious/critical hits | 142 | 8 (all one rule, fixed after the run, see below) |
| H2 horizontal overflow, H3 clipped text, H5 CLS, H8 reduced-motion animations | 0 | 0 |
| H9 contrast (computed) | 48 | 24 |
| H6 focus indicator | 182 | 182 (harness artifact, see below) |
| H7 stuck-invisible | 200 | 200 (one intentional element, see below) |
| H4 console errors | 3 | 7 (sandbox Firestore offline; varies run to run) |
| Infinite animations | 1 | 0 |

The final after-run was taken one build before the last three edits (scope summary `dl`, auditor field-label colour, which were then re-checked by axe on those two screens: 0 violations). So the true after-totals are slightly better than the table.

## Changed (all markup/CSS, no logic, text, data or tests)
- Landmarks: sign-in (and its two-step screen) is now `<main>`; certificate verification, competition-not-available card are `<main>`; Discover top bar is `<header>`; the competition admin section wrapper was a second `<main>` nested in the shell `<main>`, now a `div` (`motion.css` selectors updated from `main[data-mz-view]` to `[data-mz-view]`); demo bar is a labelled region.
- Logo wrapper `role="img"` (its `aria-label` was invalid on a bare span).
- Focus ring: global rule was 3px at 22% alpha (below 3:1); now solid `--emerald-2` (about 6:1), also for `[role=button]`, `[role=tab]`, `summary`, positive tabindex.
- Question-engine tab bar: the "Advanced" toggle is no longer a child of `role="tablist"`.
- Quran scope summary tiles: valid `dl/dt/dd` structure, same look.
- Competition identity page: its title is the page `h1` (same size).
- Contrast: language switcher text, exception-board kind chips (removed opacity), "no logo" placeholder, head-judge note (white/45 to white/65), integrity-note brown, auditor field labels.
- Operator customer table: the empty action column header got a screen-reader label.
- Never touched: Quran text, scores, judging inputs, draw, appeals, motion rules (motion.css only had the selector fix above).

## Looked at and left
Login, admin overview and scope at 390 px were reviewed visually: clear hierarchy, icon tiles, stat tiles, steppers, no text walls; left as is. "Text-wall" soft counts (664) are mostly concatenated nav/tab containers in the harness, not prose.

## Known remaining / not fixed
- H6 (182): the harness calls `focus()` programmatically after mouse interaction, which does not trigger `:focus-visible`. A real keyboard Tab probe over 40 stops on judge and competition-admin screens found no element without an indicator. Not a product defect as far as measured, but not proven for every screen.
- H7 (200): the invisible language `<select>` laid over the globe button in the header (intentional, labelled); counted once on every header screen.
- H4: Firestore cannot connect in the sandbox.
- Remaining axe: `heading-order` (delegation manager, operator owner/admin), broadcast operator screen nests the ceremony `<main>` in the shell `<main>` (venue surface left alone, would affect standalone board routes).
- Contrast on judge queue chips ("في الطابور", counters) and a disabled approve button left (judging surface / disabled state).
- Not viewed: English UI, populated competition landing and registration (demo has no public competition API), live-backend screens, real-credential roles, dark/high-contrast themes (none exist), real screen readers, Windows/Safari browsers.

## Commands
`npm run lint` (tsc) pass; `npm test` 2831 tests, 2817 pass, 0 fail, 14 skipped on the first batch of edits (re-run after the last edits: see final report); `npm run build` pass.
