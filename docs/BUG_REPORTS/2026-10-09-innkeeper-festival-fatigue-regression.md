# Innkeeper festival-fatigue regression — a festival day credited 24 h and pinned fatigue at 100: 2026-10-09

- Bug: the festival override re-added to `onTavernShift` credited all 24 hours of a festival day to every innkeeper and pinned `scheduleFatigue` at 100 — a regression of [2026-08-22-festival-override-extends-innkeeper-work.md](2026-08-22-festival-override-extends-innkeeper-work.md)
- Status: resolved
- Date discovered: 2026-10-08 / 2026-10-09
- Version/build: 0.6.5.0 (working tree)
- Reporter: found in the owner's own save `wilderfolk-New-Frontier-Y3-D183` (Year 3, day 903)
- Area: Truth | worker
- Owner module: `src/game/humanTick.ts` (innkeeper duty), `src/game/venueSchedule.ts` (visitor service hours), `src/game/scheduleFatigue.ts` (fatigue accounting)
- Cadence: realtime human tick — the same `onJobShift` result feeds `recordScheduleWorkTick`

## Status history

- 2026-10-08 — open (found in the owner's own save: `scheduleLastWorkedHours = 24.00` and `scheduleFatigue = 100.0` for all 20 innkeepers)
- 2026-10-09 — investigating (reproduced by loading the save and running in-game days: day 1 credited 6.00 h — the correct window — and day 2 onward credited 24.00 h; instrumented the realtime terms and found `fest=Harvest Festival` with `tavern=true` at 01:00)
- 2026-10-09 — resolved (the festival override removed from `onTavernShift`; the same save now credits 6.00 h per day and fatigue recovers; guards added in `tests/prisonFestivalWorkContinuity.test.ts` and `tests/dayCycle.tavern.test.ts`)

## Observed behavior

Reading the owner's own save `wilderfolk-New-Frontier-Y3-D183` (Year 3, day 903): 10 taverns, 20 innkeepers (2 per tavern), tavern window 17:00–23:00, `staffingMode: manual`. Saved data: `scheduleLastWorkedHours = 24.00` and `scheduleFatigue = 100.0` for all 20 innkeepers, while every other occupation was 0.0 h that day (that day was a Sunday, so the zeros are a rest-day reading, not a defect — do not re-chase them).

## Expected behavior

An innkeeper's duty is the configured tavern window, so a festival day can credit at most `getVenueScheduleHours(getVenueSchedule(state, 'tavern'))` — 6 hours for this 17:00–23:00 window. A festival still opens the tavern to visitors: that is a visitor-service fact expressed by `venueSchedule.isFestivalOverrideActive` / `isVenueServiceHour(..., true)`, and it never extends worker duty.

## Reproduction steps

1. Load `wilderfolk-New-Frontier-Y3-D183` and run in-game days. Day 1 credited 6.00 h (the correct window); day 2 onward credited 24.00 h, pinning fatigue at 100.
2. Instrument the realtime terms: `fest=Harvest Festival` with `tavern=true` at 01:00 — so `onTavernShift` was true for all 24 hours.
3. Trace it: the festival branch in `src/game/humanTick.ts` (`state.festival?.active === true ? isVenueServiceHour(state, 'tavern', hourOfDay, true) : …`) made the tavern service query true all day, and the same `onJobShift` result feeds `recordScheduleWorkTick`.

## Evidence

- The saved values above: `scheduleLastWorkedHours = 24.00`, `scheduleFatigue = 100.0` for all 20 innkeepers, every other occupation 0.0 h.
- The reproduction: day 1 credited 6.00 h, day 2 onward 24.00 h.
- The instrumented realtime terms: `fest=Harvest Festival`, `tavern=true` at 01:00.
- Regression provenance, read from the tree: the 2026-08-22 report documents exactly this and was marked resolved 2026-08-23 by removing the festival override from `onTavernShift`; the override (and the legacy `humanSchedule.isOnInnkeeperShift` festival behaviour) had been re-added, with `tests/dayCycle.tavern.test.ts` asserting "innkeeper works the festival around the clock".

## Root cause

The festival service override was present again in `onTavernShift` (`src/game/humanTick.ts`): while `state.festival?.active === true`, the tavern service-hour query was asked with the festival override flag, so it answered true for all 24 hours of the festival day. Duty and visitor opening are separate concepts, but the realtime human owner fed the visitor-service override into the worker-shift path, and the same `onJobShift` result is what `recordScheduleWorkTick` credits — so every festival hour was paid as work and fatigue climbed to, and stayed at, 100. This is the defect the 2026-08-22 report documents; its removal had been undone.

## Regression test

`tests/prisonFestivalWorkContinuity.test.ts` — the festival tavern case now asserts **no** credit at 15:00 (outside the window) plus a credit at 18:00 (inside it), and a new full-day case pins the credited hours to the configured window. `tests/dayCycle.tavern.test.ts` — the legacy helper case now asserts a festival does not extend the shift. The guard that keeps the visitor half honest sits in the same test file: `tests/prisonFestivalWorkContinuity.test.ts` asserts the *visitor* service verdict is still true all festival day.

## Invariants checked

- Venue availability is not worker assignment: visitor service may be true all festival day while duty is not.
- Credited hours never exceed the configured tavern window.
- Fatigue derives from credited work, not from venue visibility.

## Save/migration impact

None. Existing fatigue is not rewritten; it recovers at 13/day at a 6-hour window (87 → 74 → 61 over the three measured days).

## Verification result

The same save, 3 days → 6.00 / 6.00 / 6.00 h and fatigue 87 → 74 → 61 (recovering). A full festival day credits exactly `getVenueScheduleHours(getVenueSchedule(state, 'tavern'))`, not 24.

## Related commits or files

- `src/game/humanTick.ts` — `onTavernShift` no longer takes the festival override
- `src/game/venueSchedule.ts` — `isFestivalOverrideActive` / `isVenueServiceHour(..., true)` remain the visitor-service facts
- `src/game/humanSchedule.ts` — `isOnInnkeeperShift` no longer extends duty for a festival (`_festivalActive` retained in the signature for existing callers)
- `src/game/scheduleFatigue.ts` — fatigue accounting, unchanged
- `tests/prisonFestivalWorkContinuity.test.ts`, `tests/dayCycle.tavern.test.ts` — the guards
- [2026-08-22-festival-override-extends-innkeeper-work.md](2026-08-22-festival-override-extends-innkeeper-work.md) — the original report this one regresses

## Fix

The festival override was removed from `onTavernShift` in `src/game/humanTick.ts`: innkeeper duty is the configured tavern window, and festival opening remains a visitor-service fact expressed by `venueSchedule.isFestivalOverrideActive` / `isVenueServiceHour(..., true)`. `humanSchedule.isOnInnkeeperShift` no longer extends duty for a festival (`_festivalActive` retained in the signature for existing callers).
