# HUD notifications expire before presentation

- Bug: Ordinary notifications can disappear before the player sees them; acknowledged worker notifications also consume pending capacity.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-26
- Version/build: 0.6.5.2 development, base `6567228c45babb3455da654d89d1b3f1b4d7956e`
- Reporter: player report; source investigation
- Area: HUD / transient feedback / worker boundary
- Owner module: `src/hooks/useTransientGameFeedback.ts` (presentation), `src/game/simEffects.ts` (producer queue), `src/game/simWorker/uiPatch.ts` (acknowledgement)
- Related PR: [#216](https://github.com/Rengerams/wilderfolk/pull/216)

## Status history
- 2026-11-26 — CI verified: head `31d6957` passed all five workflows, including 3,418 tests across 479 files. Browser/live-save reproduction remains pending.
- 2026-11-26 — investigating: player reports events in the Chronicle without corresponding HUD pop-ups; source confirms a concrete loss path.
- 2026-11-26 — implementation committed: FIFO presentation, visible-time expiry, bounded overflow summary and worker acknowledgement. Final CI and browser reproduction pending.

## Observed behavior
Only the newest four of the pending notifications are displayed. Older cards can be hidden for their entire 12-second lifetime. The producer's 20-entry cap evicts the oldest card, even when it is on screen. Worker-side acknowledged entries occupy slots until overwritten. Chronicle-only events are separate and are not assumed to be missing notifications.

## Expected behavior
Every admitted ordinary notification gets a visible slot and a full display interval unless the player dismisses or mutes it. Extreme bursts must not evict the visible head silently. Worker acknowledgement removes only explicitly dismissed IDs and preserves newer notices.

## Reproduction steps
1. Enable HUD pop-ups and generate seven ordinary notifications in one short burst.
2. Before the fix, the newest four are rendered by App; the expiry sweep still considers all seven based on creation time.
3. Wait at least 12 seconds without additional user actions; the earlier hidden notices may disappear unseen.
4. Generate more than 20 notices before acknowledgement; the original producer shifts the oldest card. The focused regression fixtures encode these queue conditions without requiring a particular save.

## Evidence
- Pre-fix `App.tsx`: `world.notifications.slice(-4)`.
- Pre-fix `useTransientGameFeedback.ts`: creation-time cleanup plus timers for all live IDs.
- Pre-fix `simEffects.addNotification`: push then shift past 20.
- Pre-fix `applyWorkerUiPatch`: stores dismissed IDs but leaves the worker notification array untouched.

## Root cause
The presentation batch, lifetime and producer retention were independent policies. None guaranteed a pending card had been displayed before expiry. The worker did not reclaim acknowledged slots.

## Fix
Use the existing queue in FIFO order, start expiry at presentation, share ID-based dismissal, and prune acknowledged worker entries. Bound pending capacity at 64; group extreme overflow explicitly instead of dropping the visible head. Intentionally Chronicle-only records remain separate.

## Save/migration impact
No persisted schema change; notifications and their overflow summary are transient. Existing dismissal IDs retain their meaning.

## Verification result
- Source trace: confirmed the pre-fix failure path; implementation and branch diff inspected.
- `tests/toastExpiry.ledger.test.ts`, `tests/uiSingleOwner.test.ts`, `tests/workerUiPatch.merge.test.ts`: regressions added; local execution NOT RUN.
- GitHub Actions on `e3ee1d5b64`: calendar, medium and large population gates PASS; Node.js CI and small population gate pending at inspection.
- GitHub Actions on `31d6957`: [Node.js CI](https://github.com/Rengerams/wilderfolk/actions/runs/45873094639) PASS (3,418/3,418 tests in 479 files; standard, lint and duplicate checks PASS). Focused suites: toastExpiry.ledger 8/8, uiSingleOwner 45/45, workerUiPatch.merge 4/4. Calendar and all three population performance workflows PASS.
- Browser/live-save reproduction: NOT RUN. Status remains investigating for that verification; automated regression coverage passed on `31d6957`. This documentation-only follow-up does not alter runtime code; latest-head CI pending.
