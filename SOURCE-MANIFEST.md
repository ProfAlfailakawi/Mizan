# Source manifest

Target repository: `ProfAlfailakawi/Mizan`

Main inspected: `4e234815a95ee6fa8d0b3a212898ad585251a463`

User-notes commit: `00ccc3a58165908127525a6852b3c8337f67ba27`

Base commit: `21eeacd7dc14f0bdd415a912b0fc032881d2482f`

Files intentionally included by the local apply helper:

- `server.ts` — server-authoritative empty-competition deletion gate.
- `server/firestore-rest.ts` — recursive Firestore cleanup helpers used by deletion.
- `server/public-registration.ts` — riwaya validation, fixed category scope, and approval policy enforcement.
- `src/components/admin/CompetitionOverview.tsx` — bulk participant selection/filtering, approval-mode UX, removal of organizer automation selector.
- `src/components/admin/QuestionEngineWorkspace.tsx` — removes participant-selected range UI.
- `src/components/admin/RolePortals.tsx` — conditional competition deletion UX and confirmation.
- `src/components/auth/AuthPortal.tsx` — LTR/BiDi-safe email rendering.
- `src/components/participant/ParticipantDashboard.tsx` — category-owned scope only.
- `src/components/public/RegistrationFlow.tsx` — explicit riwaya selection before progression and no participant scope picker.
- `src/lib/store.ts` — competition deletion client action and automatic internal default.
- `tests/firestore-rest-adapter.test.ts`
- `tests/public-registration-scope.test.ts`
- `tests/user-notes-2026-09-14-regression.test.ts`

Intentionally excluded from this focused handoff even though they also changed in commit `00ccc3a`:

- `package.json`
- `package-lock.json`
- `src/components/gate/KioskMode.tsx`

Those excluded files belong to the separate camera/QR work, not these seven notes.
