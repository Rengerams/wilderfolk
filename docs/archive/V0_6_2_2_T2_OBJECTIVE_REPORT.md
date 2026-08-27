# v0.6.2.2 Objective Report — T2 Cycle Reduction

- **Status:** verified
- **Date:** 2026-08-21
- **Objective:** Classify the measured dependency cycles and reduce one verified high-risk runtime cycle without changing gameplay cadence, save compatibility, or worker authority.
- **Related scope correction:** Exclude the independent `skills/` package from the root Wilderfolk ESLint scope.

## Result

The root ESLint configuration now ignores `skills/`, which is a separate CLI package with its own package scripts, TypeScript configuration, tests, and formatting workflow. Wilderfolk-only lint now passes with no output beyond the npm command banner. The 38 errors previously reported under `skills/` are no longer mixed into the game repository’s lint baseline.

The selected C03 cycle was the runtime edge `src/game/worldEvents.ts → src/game/gameEngine.ts`. `worldEvents.ts` imported presentation/effect and simulation helper functions through the compatibility barrel, even though their owning modules were already available directly. The import was replaced with direct imports from `simEffects.ts` and `simHelpers.ts`. The world-event owner, existing cadence, state writes, and gameplay behavior remain unchanged.

| Evidence | Result |
|---|---|
| Dependency SCCs | Reduced from 3 to 2 in the complete resolved source graph. |
| Removed edge | `worldEvents.ts → gameEngine.ts` in the C03 SCC. |
| Production build | Passed; the separate renderer chunk warning remains and belongs to T1. |
| Root Wilderfolk lint | Passed after excluding `skills/`. |
| Focused tests | 3 files, 20 tests passed: weather consequences, game-tick layer order, and simulation write ownership. |
| Full regression/type validation | 69 files, 400 tests passed through `test:all`. |
| Save/worker impact | None. |

## Cycle classification

The refreshed ledger contains two remaining SCCs. One is the large simulation-owner SCC involving shared game data and domain modules; the other is the economy/town-hall/trade-caravan SCC. The historical audit’s 43 warnings remain unreconciled with the current focused dependency-cruiser command, which reports zero modules and zero violations. That discrepancy is retained as an evidence issue and is not represented as a false numerical reduction.

## Simulation Change Record

- **Owner module:** `worldEvents.ts` remains the world-event owner; `simEffects.ts` and `simHelpers.ts` remain their existing domain owners.
- **Decision changed:** None. Only a compatibility-barrel import path was changed.
- **Cadence:** Existing systems/daily cadence unchanged.
- **State fields written:** None changed.
- **Why the change is needed:** Remove one measured high-risk runtime cycle and make module ownership explicit.
- **Player-visible behavior before:** World events run through the same implementation, with the game hub in the import path.
- **Player-visible behavior after:** No intended player-visible change; world events use the same functions directly.
- **Performance impact:** Production build passed; no gameplay loop or scan was added. The circular renderer chunk warning remains unchanged.
- **New or updated tests:** Existing weather, tick-layer-order, and simulation-write-ownership tests passed; no new behavior test was required for an import-only reduction.
- **Invariants checked:** Worker-authoritative state, existing tick-layer order, world-event ownership, and simulation write ownership remained intact.
- **Save/migration impact:** None.
- **Rollback plan:** Restore the original `worldEvents.ts` import block and remove the `skills` entry from `globalIgnores` if the scope decision is reversed.

## Remaining risks

The renderer/game circular chunk remains unresolved under T1. The 43-warning historical cycle count still needs command/configuration reconciliation before additional reductions are selected. No version bump, release note, commit, push, tag, or publish action was performed.
