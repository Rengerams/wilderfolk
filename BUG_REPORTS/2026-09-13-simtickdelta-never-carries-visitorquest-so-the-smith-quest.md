# SimTickDelta never carries `visitorQuest`, so the smith quest is invisible to the main thread in worker mode

- **Bug:** SimTickDelta never carries `visitorQuest`, so the smith quest is invisible to the main thread in worker mode
- **Status:** resolved
- **Date discovered:** 2026-09-13
- **Version/build:** 0.6.4
- **Reporter:** full simulation-logic audit (audit agent A21-worker-persistence, A20-diplomacy-trade; adversarially verified) — audit id H9
- **Area:** save/migration
- **Owner module:** `src/game/simBuffers/simDelta.ts`
- **Cadence:** see fix; the owning cadence is stated in `docs/archive/SIMULATION_AUTHORITY.md` §3–4

## Status history

- 2026-09-13 — open (found by automated simulation-logic audit, confirmed by independent adversarial verification)
- 2026-09-13 — resolved (P1 batch: fix applied at the owning module with a regression test; see **Fix**, **Regression test** and **Verification result**)

## Observed behavior

`visitorQuest` is created/expired only inside the worker (`groupEvents.ts:416` → `maybeStartVisitorQuest`, `dailyWorldEvents.ts:99` → `tickVisitorQuest`, both called from the tick layers). With the worker active the display world's `visitorQuest` stays undefined forever, so App.tsx:1544-1546 (`getVisitorQuest(world)`) never renders the traveling-smith card, and virtualPlayer.ts:778 (`const quest = getVisitorQuest(state)`) never sees it, so auto-play's step 14 can never deliver the quest and always falls through to a trade. The feature only works in main-thread fallback mode.

## Expected behavior

Add `visitorQuest: WorldState['visitorQuest']` to `SimTickDelta`, emit `visitorQuest: deltaCloneOptional(world.visitorQuest, cloneMode)` in `extractSimTickDelta`, and restore `world.visitorQuest = deltaCloneOptional(delta.visitorQuest, cloneMode)` in `applySimTickDelta`.

## Reproduction steps

Static reproduction (no runtime repro was run during the audit):

1. Open `src/game/simBuffers/simDelta.ts` at lines 52-139 (SimTickDelta), 258-338 (extract), 441-523 (apply); anchor 92-94 | 34-39 (and the missing entries listed below) | 34-39, 46-49.
2. Note the offending code: `L92-94: `activeVillageRequest: WorldState['activeVillageRequest'];` / `villageRequestCooldownUntilDay: number;` / `villageRequestHistory: NonNullable<WorldState['villageRequestHistory']>;` — the sibling `WorldState.visitorQuest` (gameTypes.ts:741) appears nowhere in `SimTickDelta`, `extractSimTickDelta` or `applySimTickDelta`.`.
3. Follow the call path/guard described under **Root cause** — that path is reachable in normal play.

## Evidence

Adversarial verification note (an independent agent re-read the code and the call sites):

> WorldState.visitorQuest (gameTypes.ts:741) is written only inside the sim (visitorQuest.ts:34 and 47, driven by groupEvents.maybeStartVisitorQuest and dailyWorldEvents.tickVisitorQuest) and appears nowhere in SimTickDelta, extractSimTickDelta or applySimTickDelta (simDelta.ts:52-139, 258-338, 441-523) nor in SimPrepKeys, so the main-thread world never receives it; the worker is on by default in a browser (GameWorkerHost.isGameWorkerEnabled, lines 570-579, returns true unless VITE_USE_GAME_WORKER disables it). The display world therefore keeps visitorQuest undefined, so App.tsx:1544-1546 never renders the traveling-smith card and virtualPlayer.ts:795 never sees a quest to deliver (the cited line 778 is the talkToVisitorLeader branch; the getVisitorQuest call sits at 795) — the quest silently expires and only the 'smith moved on' news shows. Minimal fix: add visitorQuest to SimTickDelta with the deltaCloneOptional extract/apply entries exactly as suggested.

## Root cause

WorldState.visitorQuest (gameTypes.ts:741) is written only inside the sim (visitorQuest.ts:34 and 47, driven by groupEvents.maybeStartVisitorQuest and dailyWorldEvents.tickVisitorQuest) and appears nowhere in SimTickDelta, extractSimTickDelta or applySimTickDelta (simDelta.ts:52-139, 258-338, 441-523) nor in SimPrepKeys, so the main-thread world never receives it; the worker is on by default in a browser (GameWorkerHost.isGameWorkerEnabled, lines 570-579, returns true unless VITE_USE_GAME_WORKER disables it). The display world therefore keeps visitorQuest undefined, so App.tsx:1544-1546 never renders the traveling-smith card and virtualPlayer.ts:795 never sees a quest to deliver (the cited line 778 is the talkToVisitorLeader branch; the getVisitorQuest call sits at 795) — the quest silently expires and only the 'smith moved on' news shows. Minimal fix: add visitorQuest to SimTickDelta with the deltaCloneOptional extract/apply entries exactly as suggested.

## Fix

`visitorQuest` is now carried by the worker delta (`SimTickDelta` + extract + apply) **and** by the worker prep payload/rollback, and added to `WORLD_STATE_SAVE_KEYS`, so the traveling-smith quest reaches the display world and survives save/load instead of being created and expired only inside the worker.

## Regression test

Covered by `tests/simPrep.rollbackClosure.test.ts` (3, which poisons every payload key and fails if a claimed key is not restored), `tests/workerCommand.roundtrip.test.ts` (9) and `tests/saveMigration.roundtrip.test.ts`.

## Invariants checked

Relevant hard invariants: `docs/archive/SIMULATION_AUTHORITY.md` §5. After the fix, `simulation/simulationInvariants.ts` and `simulation/simInvariants.ts` must stay clean in the existing invariant tests.

## Save/migration impact

This finding is itself about state not surviving save/worker handoff; the fix must add the field to the save allow-list **and** the worker prep/delta paths, and must tolerate older saves that lack it.

## Verification result

`npm run test:all` passes.

## Related commits or files

- `src/game/simBuffers/simDelta.ts` (lines 52-139 (SimTickDelta), 258-338 (extract), 441-523 (apply); anchor 92-94 | 34-39 (and the missing entries listed below) | 34-39, 46-49)
- Same root cause also reported as: visitorQuest is written by ticks but omitted from the save allow-list, the worker delta and worker prep, so the smith quest is lost on load and never reaches the display world (A20-diplomacy-trade)
- Consolidated report: `BUG_REPORTS/2026-09-13-simulation-logic-audit.md` (audit id H9)
