# v0.6.2.2 T2 — Five Additional Cycle Reductions

## Result

Five additional import-boundary reductions were completed after the original C03 `worldEvents.ts` reduction. The complete dependency graph moved from two SCCs—a 24-module primary SCC plus a 3-module economy/trade SCC—to one 21-module SCC.

| Reduction | Change | Preserved behavior |
|---|---|---|
| Economy/trade boundary | Removed trade-route compatibility re-exports from `economy.ts`; `gameEngine.ts` now exports canonical functions directly from `tradeCaravans.ts`. | Trade-route owner and public gameEngine exports. |
| Ecology type boundary | Moved `ValleyStage` to `ecologyTypes.ts`; ecologyStage retains a compatibility type re-export. | Ecology state shape and runtime owner. |
| Challenge catalog boundary | Removed `INITIAL_CHALLENGES` from the gameTypes compatibility barrel; saveLoad and worldGen import it directly from challenges. | Challenge initialization, save migration, and catalog contents. |
| Clock boundary | Moved pure tick/hour/weekday helpers to `dayCycleClock.ts`; workSchedule consumes the leaf. | 72-tick day, weekday semantics, and ordinary work schedule behavior. |
| Chat clock boundary | Routed humanChat rate constants through `dayCycleClock.ts`. | Dialogue duration and chat cadence. |

## Validation

The focused schedule/worker/layer tests passed with **3 files and 20 tests**. The full regression/type suite passed with **70 files and 404 tests**. The production build passed, with the existing `game-render → game → game-render` circular-chunk warning and large-chunk warning unchanged. Wilderfolk-only lint passed, the dependency-cycle command reported no focused violations due to its known zero-module invocation, and `git diff --check` passed with existing line-ending warnings only.

No gameplay owner, simulation cadence, worker/save field, release version, commit, push, tag, or publish action was changed by these structural cuts. The remaining 21-module SCC is still classified as a high-risk owner-boundary cluster and should not be reduced by bulk or speculative edits.
