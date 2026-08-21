# v0.6.2.2 W1 / T4 Objective Report

## Objective

Implement the smallest safe player-set standard weekday work-hours slice. The schedule is one authoritative global field used by ordinary adult workplace movement, ordinary social daylight gating, and construction throughput. The slice must preserve the existing simulation cadence, worker authority, save compatibility, and special venue schedules.

## Scope completed

A new `src/game/workSchedule.ts` module owns the standard ordinary-work schedule. New worlds default to **07:00–18:00**. Legacy and malformed saves normalize to that same default. The accepted schedule is a non-wrapping whole-hour interval with a six-to-twelve-hour duration.

The typed `setWorkSchedule` worker command validates the proposed window before application. Valid commands clone and update the authoritative `WorldState`; invalid windows are rejected by the command validator. The schedule is transported through worker preparation, tick deltas, command results, and the existing save-field allowlist. No save-version bump was required because the field is optional and legacy hydration supplies a safe default.

The sidebar now contains an **Hours** panel with start and close selectors, inline validation, the current effective window, and an explicit note about schedules intentionally excluded from W1. The UI sends only the typed worker command and does not mutate simulation state directly.

Ordinary work movement and ordinary workplace social blocking use the schedule query. Construction progress scales from the effective ordinary-work duration instead of the fixed default duration. The implementation preserves the existing day boundary and daily-layer cadence.

## Explicitly preserved schedules

| System | W1 behavior |
|---|---|
| School attendance and school-day credit | **Unchanged fixed logic.** School continues to use the existing `isOnWorkShift` / `isWorkHour` behavior and fixed school-day threshold. |
| Church and Moon-Howler priest duty | **Unchanged.** Church staffing and priest exorcism/night-shift rules remain on their existing authorities. |
| Town Hall audiences and civic activity | **Unchanged.** Town Hall logic remains owned by `townHall.ts` and its existing audience/civic predicates. |
| Tavern and hotel service | **Unchanged and deferred to W2.** Innkeeper service continues to use the existing tavern shift; hotel checkout/stay rules are untouched. |
| Weekends | **Unchanged free-day behavior** for ordinary work. |

## Validation

| Check | Result |
|---|---|
| Focused W1 tests | **4 tests passed** in `tests/workSchedule.test.ts`. |
| Full regression/type suite | **70 test files and 404 tests passed** through `npm run test:all`. |
| Production build | **Passed.** The pre-existing `game-render → game → game-render` circular-chunk warning remains and is outside W1 scope. |
| Wilderfolk lint | **Passed** with the independent `skills/` package excluded from root scope. |
| Dependency-cycle command | **No dependency violations found** by the existing focused command; the complete-graph discrepancy is already documented in T1/T2 records. |
| Diff check | Passed, with existing line-ending warnings only. |

## Simulation Change Record

**Change:** Added a player-configurable global ordinary weekday work window and routed ordinary workplace movement, ordinary social gating, construction throughput, worker synchronization, and save/load hydration through the new schedule owner.

**Owner:** `src/game/workSchedule.ts` for schedule definition, normalization, validation, and query semantics. `src/game/simWorker/commands.ts` remains the typed command authority. `humanTick.ts` and `tickLayerDaily.ts` consume the query but do not own schedule state.

**Cadence:** No new tick layer, timer, scheduler, or background process was introduced. The schedule is read during existing realtime human ticks and the existing daily construction batch.

**State and persistence:** `WorldState.workSchedule` is optional for backward compatibility. New saves include it through `WORLD_STATE_SAVE_KEYS`; old saves normalize to 07:00–18:00. Worker prep and deltas carry the effective schedule so the worker remains authoritative.

**Invariants protected:** School, church, Town Hall, tavern, hotel, weekend, save-version, and worker-authority behavior remains unchanged. No version bump, release, commit, push, tag, or publish action was performed.

**Known follow-up:** W2 may introduce separate venue/service schedules. That work must not reuse the W1 global field to override tavern or hotel behavior.
