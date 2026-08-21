# v0.6.2.2 Objective Report — T3 Rival Event Decomposition

- **Status:** verified
- **Date:** 2026-08-21
- **Objective:** Extract one cohesive rival-event domain from `groupEvents.ts` while preserving event order, daily cadence, state ownership, and existing behavior.

## Result

The rival daily settlement logic now lives in `src/game/rivalEvents.ts`. The extracted domain owns the existing bounded rival camp expansion and daily rival action sequence: treaty countdown, population reconciliation, camp growth, raid/diplomacy gates, relationship-specific outcomes, and rare rival-family growth. `groupEvents.ts` retains the public `tickRivalSettlements` function as a narrow orchestration wrapper, so the existing daily-layer call site and import surface remain unchanged.

The wrapper passes the existing presentation, logging, entity-creation, diplomacy, and poaching transitions into the extracted domain explicitly. This avoids a second event manager or a new simulation tick layer, while making the rival domain’s dependencies visible. Village Requests, visitor groups, visitor trade, refugee negotiation, and general world-event selection remain in `groupEvents.ts` as non-rival responsibilities.

| Evidence | Result |
|---|---|
| Extracted domain | `src/game/rivalEvents.ts`; `groupEvents.ts` reduced by 220 lines of rival-only implementation. |
| Public API | Existing `tickRivalSettlements(state, allAlive)` preserved. |
| Cadence/order | Existing new-calendar-day gate and daily-layer call position preserved. |
| Production build | Passed; existing T1 renderer chunk warning remains. |
| Focused parity tests | 4 files, 23 tests passed: frontier combat, game-tick layer order, simulation write ownership, and weather consequences. |
| Full regression/type validation | 69 files, 400 tests passed through `test:all`. |
| Root lint | Passed with `skills/` excluded. |
| Dependency audit command | Reports 0 modules because of the existing focused-command/config discrepancy; no new cycle was introduced by the extraction. |
| Save/worker impact | None; no state schema or worker transport changed. |

## Simulation Change Record

- **Owner module:** `src/game/rivalEvents.ts` owns rival daily decisions and bounded rival camp growth; `groupEvents.ts` retains visitor, request, diplomacy-resolution, and world-event orchestration responsibilities.
- **Decision changed:** No gameplay decision changed. The implementation moved behind an explicit callback boundary.
- **Cadence:** Existing new-calendar-day cadence unchanged.
- **State fields written:** Existing rival population, cooldown, treaty, building IDs, entity IDs, resources, pollution, reputation, event log, news, and floating-text fields only.
- **Why the change is needed:** Separate rival responsibilities from the `groupEvents.ts` crossroads to enable later rival-camp work without creating a second authority.
- **Player-visible behavior before:** Rival daily actions and camp growth were executed inside `groupEvents.ts`.
- **Player-visible behavior after:** The same actions, ordering, gates, messages, logs, and state writes execute through `rivalEvents.ts`.
- **Performance impact:** No new scan or cadence was introduced. The existing bounded rival-settlement loop remains daily and is still bounded by rival settlements and their entity IDs.
- **New or updated tests:** Existing focused parity and invariant tests passed; no new behavior test was required because the extraction preserved the public boundary and implementation order.
- **Invariants checked:** Worker-authoritative mutation path, daily-layer order, rival event ownership, frontier action gates, and simulation write ownership remained intact.
- **Save/migration impact:** None.
- **Rollback plan:** Restore the rival implementation block to `groupEvents.ts`, remove `rivalEvents.ts`, and remove the import/wrapper boundary; no save migration is needed.

## Remaining risks

The rival-facing command-resolution helpers remain in `groupEvents.ts` for the next decomposition slice; moving them now would require a broader dependency decision. The renderer/game chunk warning remains a separate T1 issue. No version bump, release note, commit, push, tag, or publish action was performed.
