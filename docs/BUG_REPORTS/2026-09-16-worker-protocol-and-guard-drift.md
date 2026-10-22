# Four worker-boundary drifts: two command ops nobody sends, a listener wipe on stop, a misleading test comment and an unguarded wire-code map

- **Bug:** four small drifts the 2026-09-16 worker-boundary audit found (F7, F8.1–F8.3). **(a)** the `assignResident` and `recordGuidedCampaignChoice` command variants are validated and dispatched by the worker but sent by nobody (`assignResident` is redundant — `assignWorker` already routes residences through `assignIdleWorkerToBuilding` → `assignResidentToBuilding`; the guided-campaign panel only exposes `onStart`), so they read as supported protocol that cannot be exercised. **(b)** `GameLoop.stop()` cleared its listener set while `BUG_TRACKER.md` records #9 as fixed with the proof "`stop()` does not clear listeners" — a `stop()` → `start()` reuse therefore left the UI unsubscribed and silently frozen. **(c)** the header of `tests/workerBoundary.closure.test.ts` listed `activeEvent`, `bigNews`, `floatingTexts` and `nextFloatingTextId` as "deliberately NOT compared" while its `HOST_OR_CACHE_KEYS` array does compare them — the wrong comment is part of why the missing `activeEvent` prep entry hid for so long. **(d)** `ENTITY_CODE_TO_TYPE` was hand-written as `Record<number, EntityTypeName>`, so a new `EntityType` compiles while having no wire code; `entityTypeToCode` then emits 255 and every entity of that species becomes invisible in the render SoA
- **Status:** resolved
- **Date discovered:** 2026-09-16
- **Version/build:** 0.6.4
- **Reporter:** 2026-09-16 worker-boundary audit, findings F7 and F8 (`docs/private/audits/2026-09-16/game-worker.md`)
- **Area:** worker (protocol surface, loop lifecycle, wire-code map) with a test-documentation defect
- **Owner module:** `src/game/simWorker/commands.ts`, `src/game/gameLoop.ts`, `src/game/simBuffers/entityTypeCodes.ts`, `tests/workerBoundary.closure.test.ts`
- **Cadence:** per command / per loop lifecycle / static

## Status history

- 2026-09-16 — open (audit findings F7 and F8.1–F8.3)
- 2026-09-16 — resolved (both dead ops deleted across all four protocol sites, `stop()` no longer clears listeners, the test comment corrected, the reverse wire-code map derived from the forward one)

## Observed behavior / Expected behavior

| Drift | Observed | Expected |
|---|---|---|
| F7 | `grep "op: 'assignResident'"` / `op: 'recordGuidedCampaignChoice'` → only `commands.ts` itself (union, OPS set, validator, dispatch) | the protocol carries only variants a caller can send, or marks reserved ones as reserved |
| F8.1 | `stop()` ran `this.listeners.clear()` (`gameLoop.ts:741`) | listeners survive a stop; the frame loop stops, the subscription does not |
| F8.2 | the test header claimed the presentation slices are excluded | the header matches `HOST_OR_CACHE_KEYS`, which compares them |
| F8.3 | `ENTITY_CODE_TO_TYPE` written out by hand | the reverse map cannot miss an `EntityType` the forward map has |

## Reproduction steps

1. F7: `npx grep -n "op: 'assignResident'" src tests scripts` → only the protocol file.
2. F8.1: `stop()` then `start()` on a `GameLoop` with a registered listener → before the fix the listener never fires again (the audit's latent-reuse case; `useGameSession` drops the ref, so no shipped path reused it).
3. F8.3: add a member to `EntityType` without touching `entityTypeCodes.ts` → before the fix it compiles and renders as code 255.

## Evidence

- `src/game/simWorker/commands.ts` — before: union lines 67/86, `WORKER_COMMAND_OPS` 108/127, validator 226/268, dispatch 332/369.
- `src/game/gameLoop.ts:741` (before) — `this.listeners.clear();` inside `stop()`; `BUG_TRACKER.md` #9 claims the opposite.
- `tests/workerBoundary.closure.test.ts:25-35` (before) vs `HOST_OR_CACHE_KEYS` (`:63-86`).
- `src/game/simBuffers/entityTypeCodes.ts` (before) — two independent literal maps; `entityTypeToCode` falls back to `UNKNOWN_ENTITY_TYPE_CODE = 255` and `isKnownEntityTypeCode(255)` is false.

## Root cause

Four unrelated small drifts rather than one design error, all invisible to the gates: unreachable protocol surface compiles and tests green; a `stop()` teardown detail has no test; a comment is not type-checked; and a hand-written reverse map is only as complete as the last edit.

## Regression test

- **F8.3** is now enforced by the type system: `ENTITY_CODE_TO_TYPE` is derived from `ENTITY_TYPE_CODE` with `Object.fromEntries`, so a new `EntityType` must be given a code before the forward map compiles, and the reverse map follows automatically. `tests/workerBoundary.closure.test.ts` and `tests/simBuffers.*` still cover the code round-trip.
- **F7** needs no test (the deleted surface had no sender); `tests/workerCommand.roundtrip.test.ts` (9) still exercises every remaining op end to end.
- **F8.1/F8.2** are covered by the corrected comment and by the audit's own reasoning; no test asserts listener survival yet — disclosed rather than implied.

## Invariants checked

`npm run check:source` (source integrity, now with the archive/zero-byte rules), `npm run lint` 0/0 on 322 files, `npm test`, `npm run test:full-year`, `npm run test:browser` — all green.

## Save/migration impact

None. No save field, key or format changed. Removing two command variants is a protocol-surface change only: both were unreachable, so no client can be sending them, and `workerBoundary.closure.test.ts`'s command-delta comparison still passes.

## Verification result

- `npx vitest run tests/workerBoundary.closure.test.ts tests/workerCommand.roundtrip.test.ts tests/guidedCampaign.test.ts tests/gameLoop.sessionSwapWorker.test.ts tests/simDelta.storyRoundtrip.test.ts tests/gameWorker.transport.test.ts` — passed (26 tests).
- `npm run check:source` — passed (with the new archive/zero-byte rules), `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.vitest.json --noEmit`, `npm run lint` (0 warnings / 0 errors) — passed.
- `npm test`, `npm run build`, `npm run test:full-year`, `npm run test:browser` — passed on this tree.

## Related commits or files

- `src/game/simWorker/commands.ts` — both variants removed from the union, the OPS set, the validator and the dispatch; `assignResidentToBuilding` and `recordGuidedCampaignChoice` / `GuidedCampaignChapterId` imports dropped
- `src/game/gameLoop.ts` — `stop()` no longer clears listeners (the instance owns them)
- `src/game/simBuffers/entityTypeCodes.ts` — reverse map derived from the forward map
- `tests/workerBoundary.closure.test.ts` — header comment corrected and the vacuous-`activeEvent` caveat recorded

## Fix

F7: `assignResident` and `recordGuidedCampaignChoice` are gone from all four protocol sites (the campaign *function* stays — it is used directly by tests and by nothing else). F8.1: the `listeners.clear()` line is removed from `stop()`. F8.2: the test header now states which fields are compared and why `activeEvent` is vacuous in a 240-tick fixture. F8.3: `ENTITY_CODE_TO_TYPE` is computed from `ENTITY_TYPE_CODE`.

The import-cycle gate also improved as a side effect: `gameTypes.ts` used an inline `import('./beautyGrid').BeautyGrid` type, which made the `beautyGrid ↔ gameTypes` pair look like a runtime cycle. Moving it to a top-level `import type` (the style every other type import in that file already used) removes the **2-module runtime cycle** — see `BUG_REPORTS/2026-09-16-runtime-import-cycles-in-the-game-module-graph.md`, where the remaining finding is the 9-module component.
