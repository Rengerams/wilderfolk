# Bug: TypeScript build breakage after the big refactor commit (07cc936)

- Status: resolved
- Date discovered: 2026-09-08
- Version/build: 0.6.4 (workspace after commit 07cc936 "a")
- Reporter: coding agent (developer request: "check the app, fix the typescript errors")
- Area: worker | UI | Truth
- Owner module: multi-module (simDelta/simWorker commands, playerHuman, gameLoop, hooks/useCanvasInteractions, simulation/humanNeeds, rumourLedger, entityCounts/tickLayerSystems consumers)
- Cadence: Not applicable — compile-time regression, no cadence.

## Status history
- 2026-09-08 — open (found via `tsc -b`: 21 errors across 16 files)
- 2026-09-08 — resolved (`tsc -b --force` clean; vitest type project clean; 468/468 standard tests pass; oxlint 0 errors)

## Observed behavior
`tsc -b` failed with 21 type errors. Root clusters:

1. **Missing export after refactor** — `simWorker/commands.ts` imports `createFallbackSimTickDelta` from `simBuffers/simDelta.ts`, but the big commit removed the function while leaving the caller.
2. **Type-shape drift** — `simDelta.ts` filtered `notifications` on `n.dismissed`, but `GameNotification` (gameTypes.ts) has no such field (only `BigNewsItem` does).
3. **Dead `isPlayerHuman` type guard** — `playerHuman.ts` declared `e is Entity & { readonly type: EntityType.Human }`. `EntityType` is a string const-object + type alias, so `EntityType.Human` is invalid in type position (TS2702). Also `Entity` is a single flat interface, so the guard's false branch narrowed to `never`, breaking `e.faction` checks in `entityCounts.ts` and `tickLayerSystems.ts` (TS2339).
4. **Wrong map key** — `humanNeeds.ts` `HUNT_BASE_YIELD` used numeric key `[2]: 22` in a `Record<EntityType, number>`; EntityType is now string-valued, so the numeric key is invalid (TS2353) and the entry was dead at runtime (rabbit free-hunts fell back to the 18 default instead of the documented 22).
5. **Readonly mismatch** — strip-chain preview `segments` is `readonly StripSegment[]`, but `WorkerCommand['placeStripChain']` and `placeStripChain()` required mutable `StripSegment[]` (TS2345).
6. **`undefined` vs `null`** — `gameLoop.ts` assigned `render.metaBySlot` (`EntityRenderMeta[] | undefined`) to `renderMetaBySlot: EntityRenderMeta[] | null` (TS2322).
7. **Stale code** — unused imports (`VillageLeadershipPanel`, `gameTick`, `tickLayerRealtime`), unused local `squaredDistance` (`adaptiveSpatialQuery`), impossible comparisons against event-log literals that no longer exist (`rumourLedger` 'diplomacy'/'crime'), missing `hasWorkAssignment` import (`uiSimSummary`), and lost contextual typing in `villagePortrait.ts` trait array (TS2322).

## Expected behavior
`tsc -b` and the repo's type checks complete with zero errors; the app builds and runs.

## Reproduction steps
1. Open the workspace at commit 07cc936.
2. Run `tsc -b` (or `npm run build`).
3. Observe the 21 errors listed above.

## Evidence
- `tsc -b` output captured (21 errors) — see first run in session.
- After fixes: `tsc -b --force` exit 0, `tsc -p tsconfig.vitest.json --noEmit` exit 0, `oxlint --type-aware` 0 errors, `npm run test:standard` 87 files / 468 tests passed.

## Root cause
The large refactor commit (07cc936 "a") updated command/delta plumbing and type shapes but left inconsistent references and stale code behind. `Entity` being a single flat interface (not a discriminated union) makes object-refinement type predicates unsound on the false branch; the guard was written for an older union model.

## Fix
- Re-added `createFallbackSimTickDelta(world)` to `simDelta.ts` (identical implementation to the pre-refactor parent commit, headless + isolated clone).
- Removed `.dismissed` filtering for `GameNotification` (field never existed; the dismissal mechanism is `dismissedNotificationIds` on the main-thread side). Behavior-identical at runtime.
- Converted `isPlayerHuman` to a plain `boolean` predicate (runtime logic unchanged). This lets `entityCounts.ts` / `tickLayerSystems.ts` faction checks compile without `never` narrowing.
- `humanNeeds.ts`: `[2]: 22` → `[EntityType.Rabbit]: 22`, typed as `Partial<Record<EntityType, number>>` (matches the pre-existing "magic number for rabbit yield" intent). NOTE: this restores the documented rabbit base yield 22 instead of the dead-key fallback 18 for free-roam rabbit kills — a small balance correction, flagged for the developer.
- `WorkerCommand['placeStripChain']` and `placeStripChain()` now accept `readonly StripSegment[]` (no mutation occurs; both call sites pass a readonly preview).
- `gameLoop.ts`: `renderMetaBySlot = render.metaBySlot ?? null` (undefined → null).
- Removed unused imports/locals and impossible comparisons; added missing `hasWorkAssignment` import; gave the `villagePortrait.ts` trait list a typed binding before `.sort()` so `id` literals keep `PortraitTraitId`.

## Regression test
No new unit test added — regression protection is `tsc -b` (app project) + `tsc -p tsconfig.vitest.json --noEmit`, both in the repo's standard `npm run build` / `npm run test:all` flows. Full standard suite (468 tests) passes unchanged.

## Invariants checked
- No simulation cadence, owner, worker-authority, or save/migration boundary touched.
- Command wire shape unchanged apart from widened `readonly` segments (runtime JSON identical).
- Notification/big-news dismissal behavior preserved.
- Human classification runtime behavior unchanged (predicate body identical).

## Save/migration impact
None.

## Verification result
- `node node_modules/typescript/bin/tsc -b --force` → exit 0, no output.
- `tsc -p tsconfig.vitest.json --noEmit` → exit 0.
- `npm run lint` (oxlint type-aware) → 0 errors (55 pre-existing warnings, unrelated).
- `npm run test:standard` → 87 files / 468 tests passed.

## Related files
- src/game/simBuffers/simDelta.ts
- src/game/simWorker/commands.ts
- src/game/playerHuman.ts
- src/game/entityCounts.ts (consumer — fixed via guard change)
- src/game/tickLayerSystems.ts (consumer — fixed via guard change)
- src/game/simulation/humanNeeds.ts
- src/game/buildingPlacementActions.ts
- src/hooks/useCanvasInteractions.ts (consumer — fixed via command type)
- src/game/gameLoop.ts
- src/game/rumourLedger.ts
- src/game/uiSimSummary.ts
- src/game/villagePortrait.ts
- src/game/gameTick.ts, src/game/tickLayerRealtime.ts, src/game/adaptiveSpatialQuery.ts, src/game/VillageLeadershipPanel.tsx (stale-code cleanup)
