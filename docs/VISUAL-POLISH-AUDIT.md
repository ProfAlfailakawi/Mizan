# Visual polish audit

Scope: visual layer only. No logic, routes, data, tests or guards were touched.
Method: ran the app in demo mode (port 4871), captured Chromium screenshots at 390px and 1280px, and checked horizontal overflow (0px everywhere captured).

## Screens examined (rendered)
- Login (AuthPortal): calm, single primary action. No change.
- Competition admin: overview, identity, scope and questions, participants, operations, judging, results, advanced. Already stat tiles, icon cards and a stepper. Findings below.
- Roles rendered in demo: head judge, judge, ops manager, exception host, delegation manager, participant, guardian, broadcast operator, auditor, support agent, org admin, branch admin, super admin, operator owner, storage admin, billing admin. No overflow; no clipping.
- Public: competition landing, register, discover, passport, verify, hall board, trust verify (mobile 390px; landing and board reviewed visually).

## Findings and actions
| Where | Finding | Action |
|---|---|---|
| src/components/admin/EnterpriseWorkspace.tsx (page intro) | Two-clause explanatory paragraph under a heading that already says it | Shortened to one line |
| src/components/admin/EnterpriseWorkspace.tsx (Channels intro) | Three-sentence paragraph repeating what the cards show | Shortened to two short sentences; the secrets warning is kept |
| src/components/admin/CompetitionOverview.tsx (certificate verification tile) | Long caveat sentence inside a small tile | Shortened to one line; link kept |
| Delegation, operator-owner, super-admin dashboards | Already icon tiles and tabs; legacy-unit note is data-driven text in commercial-i18n | Left alone |
| Auditor view | Long audit-log list (about 45k characters) is real data | Left alone |
| Judging, Mushaf, scoring, fair-draw, audio and ASR surfaces | Protected | Not touched |

## Not verified
Screens needing a live backend or real credentials were not rendered. Roles were checked in demo mode only.

---

# Round 2: motion system and wider coverage

Scope: presentation only. New layer `src/motion.css` (loaded last, after `elevation.css`); three one-attribute markup additions (`data-mz-role` on the shell `<main>` in `src/App.tsx`, `data-mz-view` on the admin `<main>` in `CompetitionOverview.tsx`, `data-empty-state` on `EmptyState`). No logic, route, data, test or guard changed.

## Coverage (demo mode, Chromium, dev server)
- All 18 demo roles at 1280px and 390px (full-page screenshots), plus the 7 admin tabs of the competition manager at both widths; login at both widths. Horizontal overflow measured: 0px on every one, before and after.
- Public routes `#discover`, `#competition`, `#register`, `#verify`, `#passport`, `#trust-verify` at both widths: 0px overflow. `#competition` and `#register` render the "competition not available" card because demo mode has no public competition API; the populated landing and registration steps were therefore not viewed.
- Dark theme: the app has no dark theme (no `prefers-color-scheme` or `data-theme` switch), so there was nothing to polish or view.
- Roles whose lazy chunk had not finished loading within the capture delay (auditor, support, org admin at 390px) showed the loading fallback in some captures; they were reviewed through the 1280px captures and the earlier round.

## Findings
The existing identity layers already present the admin and role screens as icon tiles, stat tiles, steppers and ring meters; the remaining text is real data or protected. I found no screen where redesigning markup was justified without touching text that tests or logic depend on, so this round invests in the motion system rather than churning markup.

## Motion inventory (`src/motion.css`)
Tokens: `--mz-ease: cubic-bezier(.2,.7,.2,1)`, `--mz-d1/d2/d3: 120/180/260ms`, `--mz-step: 40ms`. Everything lives in `@media (prefers-reduced-motion: no-preference)` and is also off under `html[data-mizan-motion="reduced"]`; a reduce block sets `animation:none; transition:none` explicitly. Only `transform` and `opacity` (plus a soft `box-shadow` on card hover) change. No loops. Fill mode is `backwards` with no final keyframe, so the end state is the element's own static style and nothing is left overriding hover transforms.

| What | Trigger | Duration |
|---|---|---|
| Metric tiles (`.mz-bp-metric`) rise 8px + fade, staggered up to 8 items at 40ms | on mount, once | 260ms |
| Tab panel and admin section content fade + 6px rise | on mount of the new panel | 260ms |
| Card hover lift (translateY -1px, soft shadow) on clickable `a/button.mizan-surface` and metric tiles | hover | 180ms |
| Button press scale .98, tab press .98, mobile-nav press .97 | active | 120ms |
| Sidebar icon nudge | hover on inactive item | 180ms |
| Dialog scrim fade (dialog itself keeps its existing entrance) | on open | 180ms |
| Empty state fade-in | on mount | 260ms |

Scoped to calm roles only (competition admin, org/branch admin, super admin, operator, storage/billing, support, delegation, auditor) for tile stagger and lift. Not animated anywhere: judge and head-judge shells (including button press), any element containing `.font-quran` (a hard `animation:none` guard), the admin Results and Judging views, scores, draw results, timers, forms while typing, tables.

## Verified
- Animations: with `reducedMotion: no-preference`, switching the admin tab started `mzMFade` and finished with 0 running animations and 0 elements left at opacity below 1; with `reduce`, 0 animations started.
- A first version also animated the active nav item. Playwright full-page captures replayed it mid-fade (a capture artifact, since reduced motion rendered identical), which could destabilise visual tests, so active-state animations (nav, tab, mobile nav) were removed.

## Not done / not verified
- No dark theme exists, so none was polished.
- Per-item progress ring and bar fills are already animated by the existing DNA kit (`dna-drawx`); not duplicated.
- Skeleton shimmer: no genuinely loading skeleton blocks exist beyond the existing loader; none added.
- Accordion and toast exit animations: components unmount immediately, so exit motion would need logic changes; left alone.
- Live-backend screens, populated public landing/registration, and real-credential roles were not rendered.
