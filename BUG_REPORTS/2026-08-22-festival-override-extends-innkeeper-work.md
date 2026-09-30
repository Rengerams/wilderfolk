# Bug: Festival Tavern override extends Innkeeper work beyond the worker shift

- Status: resolved — focused validation passed; full suite green 2026-08-25 (85 files / 464 tests)
- Date discovered: 2026-08-22
- Version/build: Wilderfolk v0.6.3 development working tree
- Reporter: Simulation-role audit and updated Festivals en venues responsibility document
- Area: Truth | worker | Play
- Owner module: `src/game/humanTick.ts`, `src/game/venueSchedule.ts`, `src/game/scheduleFatigue.ts`
- Cadence: Realtime human tick, Tavern service schedule, and work/fatigue accounting

## Status history

- 2026-08-22 — open (PDF/code cross-check found a contradiction between venue opening and worker-shift accounting)
- 2026-08-23 — resolved with focused validation: removed the festival service override from `onTavernShift`; visitor opening remains independent while Innkeeper duty uses only the configured worker-shift query.
- 2026-08-23 — developer confirmed the existing automatic 9-hour coverage for longer normal venue hours is sufficient for now. Festival-wide staffing, Hotel economics, and broader Tavern mechanics are deferred rather than expanded.

## Observed behavior

The updated responsibility document requires the festival override to keep the Tavern open for visitors without extending the Innkeeper’s configured worker shift. In `humanTick.ts`, the festival-active Tavern service query can make `onTavernShift` true for the full day. The same `onJobShift` result is used before the festival movement branch to call `recordScheduleWorkTick(entity)`. This can cause an Innkeeper to accrue work ticks outside the configured worker shift when a festival is active.

## Expected behavior

Festival activity may make the Tavern accessible to visitors, but an Innkeeper should count as working only during `isVenueWorkerServiceHour(...)` for the configured Tavern worker shift. No hidden worker hours should be created by the visitor-service override. The existing automatic 9-hour coverage for longer **normal configured** venue windows remains intact; this repair does not invent Festival-wide staffing or a Hotel/Tavern economy.

## Reproduction steps

1. Build and staff a Tavern with an Innkeeper.
2. Configure the Innkeeper worker shift to exclude a daytime hour.
3. Activate a festival.
4. Run the simulation during the excluded hour.
5. Inspect the Innkeeper’s schedule-work/fatigue accounting and compare it with the configured worker shift.
6. Observe whether a work tick is recorded solely because the Tavern visitor override is active.

## Evidence

- Updated `Festivals en venues` PDF, Tavern section: visitor opening and Innkeeper worker shift are separate.
- `src/game/venueSchedule.ts`: service-hour and worker-service-hour functions.
- `src/game/humanTick.ts`: `onTavernShift`, `onJobShift`, `recordScheduleWorkTick`, and festival gathering ordering.
- Existing Tavern and festival tests cover venue behavior but do not prove the full work-tick accounting boundary.

## Root cause

Visitor venue availability and individual worker duty are represented by separate conceptual functions, but the realtime human owner combines the festival service override into the worker-shift path before recording work ticks.

## Fix

Removed the festival service override from the realtime `onTavernShift` decision. Festival activity still makes the Tavern accessible to visitors through the venue-service query, while Innkeeper movement, work-tick accounting, fatigue input, and social blocking use only the configured Tavern worker-shift query. Updated the legacy `isOnInnkeeperShift()` helper so it no longer claims festivals create around-the-clock worker duty.

## Regression test

`tests/dayCycle.tavern.test.ts` proves all-day festival visitor opening stays separate from the Innkeeper shift. `tests/festival.behavior.test.ts` runs the authoritative `gameTick()` path and proves a festival Innkeeper records no work tick at 09:00 outside the configured shift, then records the ordinary work tick at 18:00 inside it. Existing schedule-fatigue tests retain the downstream accounting contract.

## Invariants checked

- Venue opening is not worker assignment.
- Visitor access does not create hidden workers or hidden worker hours.
- Work ticks are recorded only for the worker’s actual configured shift.
- Festival gathering and Tavern service do not duplicate work accounting.
- Fatigue derives from recorded work, not venue visibility.

## Save/migration impact

No save change is expected. The fix changes realtime accounting only, but existing fatigue values should not be retroactively rewritten without an explicit migration decision.

## Verification result

Focused Festival/Tavern/venue/fatigue coverage passed after source-tree shadow artifacts were removed: **4 files / 18 tests**. TypeScript, ESLint for `src`, `tests`, and `scripts`, production build, and source-integrity guard passed. The full Vitest suite was started but did not complete after three bounded waits while repeatedly printing relationship diagnostics; it was stopped without a final pass/fail result. Full-suite completion remains pending.

## Simulation Change Record

- **Owner module:** `src/game/humanTick.ts` owns realtime Innkeeper duty; `src/game/venueSchedule.ts` owns visitor service-hour queries.
- **Decision changed:** Festival visitor opening no longer overrides Innkeeper worker-duty truth.
- **Cadence:** Existing realtime human tick only; no new tick layer.
- **State fields written:** Existing per-human `scheduleWorkedTicksToday`, movement, and social state only through their existing owners.
- **Player-visible behavior before:** A festival could make an Innkeeper appear to work and accrue fatigue outside the selected Tavern shift.
- **Player-visible behavior after:** The Tavern may remain open to visitors during a festival, but the Innkeeper only works during the selected shift.
- **Performance impact:** One removed conditional branch; no new scan, cache, or cadence.
- **Deferred scope:** Festival-wide coverage rosters, Hotel economics, and generalizing venue shifts to other building classes. The existing automatic 9-hour coverage remains the only normal long-window staffing behavior.
- **Save/migration impact:** None. Existing fatigue values are not rewritten.
- **Rollback plan:** Restore the festival condition in `onTavernShift` and legacy helper behavior; no data migration required.

## Related commits or files

- `src/game/humanTick.ts`
- `src/game/venueSchedule.ts`
- `src/game/scheduleFatigue.ts`
- `tests/dayCycle.tavern.test.ts`
- `tests/venueSchedule.test.ts`
- `tests/festival.behavior.test.ts`
- `docs/PRISON_FUNCTION_AUDIT.md`
- Updated `Festivals en venues` PDF
- `BUG_REPORTS/Readme.md`

## Unique ID

`2026-08-22-festival-override-extends-innkeeper-work`

## Audit change references

- Change 12: separate security/service duty from ordinary work-hour fatigue.
- Change 14: add named festival participation and venue policy selectors.
- Change 15: add the festival behavior matrix.

## Practical advice

Fix the accounting boundary before tuning festival bonuses or fatigue. The correct repair is small: retain the service override for visitors and remove it from the Innkeeper worker-duty calculation. Avoid moving all Tavern logic into the festival owner.

