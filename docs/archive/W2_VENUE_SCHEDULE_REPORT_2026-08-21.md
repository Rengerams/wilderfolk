# W2 Venue Service Schedules — Objective Report

**Status:** verified
**Date:** 2026-08-21
**Owner:** `workSchedule.ts` / `venueSchedule.ts` domain, typed worker commands, existing realtime movement owner
**Cadence:** player-command for schedule changes; realtime service-shift queries; existing festival override and daily systems remain unchanged

## Scope and player outcome

The first W2 slice adds independent, bounded service windows for the Tavern and Hotel. The existing Settings schedule panel now lets the player switch between Tavern and Hotel, choose whole-hour opening and closing times, and submit one typed worker command. Tavern defaults to 17:00–23:00 and retains its festival all-day override. Hotel defaults to 06:00–22:00 and has no festival override. School, Church, Town Hall, ordinary work, and hotel guests remain outside this schedule decision.

Venue staff use the configured window in the existing `humanTick.ts` movement owner. Innkeepers and Hoteliers commute at their venue’s configured start tick and are considered on duty only inside their own service window. No automatic staffing, guest-as-employee behavior, overnight wrapping, or new tick layer was introduced.

## Simulation Change Record

- Owner module: `venueSchedule.ts` for policy and validation; `simWorker/commands.ts` for command entry; `humanTick.ts` for realtime staff movement and service behavior.
- Decision changed: Tavern and Hotel staff service windows are now independently configurable.
- Cadence: Player command for changes; realtime hour query for staff; festival override remains existing festival state.
- State fields written: Optional `WorldState.tavernSchedule` and `WorldState.hotelSchedule` only through `applyWorkerCommand()` / `setVenueSchedule()`.
- Why the change is needed: W2 separates hospitality service from ordinary work while preserving the existing venue-specific role behavior.
- Player-visible behavior before: Tavern used a fixed 17:00–23:00 window; Hotel had no independent player-configurable service window.
- Player-visible behavior after: Settings exposes separate Tavern and Hotel windows with validation and worker-authoritative persistence.
- Performance impact: O(1) schedule reads per venue staff entity; no new global scan or tick layer.
- New or updated tests: `tests/venueSchedule.test.ts`, existing Tavern service tests, full worker command and regression suite.
- Invariants checked: no UI simulation mutation; typed command validation; no school/church/Town Hall schedule changes; guests are not assigned as employees; worker prep and save allow-list include the new fields.
- Save/migration impact: Backward-compatible optional fields; legacy saves resolve to canonical defaults, and new fields are included in the existing save allow-list. No version bump or migration label change.
- Rollback plan: Remove the venue command/UI and leave optional fields absent; `getVenueSchedule()` restores defaults and the existing fixed behavior can be reinstated without changing entity, building, or residence state.

## Validation

| Check | Result |
|---|---:|
| Focused venue + Tavern tests | 2 files, 9 tests passed |
| Full regression/type suite | 72 files, 416 tests passed |
| TypeScript | Passed |
| Production build | Passed; existing circular-chunk and large-chunk warnings remain |
| ESLint | Passed |
| `git diff --check` | Passed |

## Deferred non-goals

Longer service days requiring staff rotation, per-worker shift coverage, split or overnight windows, festival Hotel overrides, automatic staffing, and Q2 live browser-worker scenarios remain open roadmap work.
