# W3 Fatigue, Recovery, and Productivity — Objective Report

**Status:** verified
**Date:** 2026-08-21
**Owner:** `scheduleFatigue.ts` policy, `humanTick.ts` realtime work-tick recording, `tickLayerDaily.ts` daily resolution and production multiplier
**Cadence:** realtime work-tick accounting; once per new calendar day fatigue resolution; existing daily production cadence

## Player outcome

Longer ordinary or venue service shifts now carry a bounded fatigue cost into the next day. Shorter workdays recover fatigue faster, while a neutral eight-hour day receives baseline recovery. Fatigue is visible in the existing Work hours panel as a colony average and is applied as a capped productivity multiplier to staffed production. The multiplier ranges from 1.00 at zero fatigue to a safety floor of 0.65 at maximum fatigue.

The first slice deliberately does not alter pregnancy, mortality, relationship formation, random catastrophes, staffing, or the 72-tick day. It also does not create a second exhaustion simulation or a new tick layer.

## Simulation Change Record

- Owner module: `scheduleFatigue.ts` defines policy; `humanTick.ts` records work ticks; `tickLayerDaily.ts` resolves fatigue and applies the existing production multiplier.
- Decision changed: Prior-day schedule load now affects bounded fatigue and staffed production reliability.
- Cadence: Work ticks are recorded in realtime; resolution happens once at the existing calendar-day boundary; output uses the existing daily production owner.
- State fields written: Optional `Entity.scheduleWorkedTicksToday` and `Entity.scheduleFatigue`, written only by simulation owners through existing tick boundaries.
- Why the change is needed: W3 requires schedule choices to have visible, bounded consequences instead of being cosmetic.
- Player-visible behavior before: Schedule windows changed work timing but had no carry-over fatigue or output consequence.
- Player-visible behavior after: Extended shifts increase fatigue; short/restful days recover it; high fatigue can reduce staffed production, with a visible average status.
- Performance impact: One O(1) counter increment per working human tick and one bounded player-human pass at the daily boundary. Production averages only assigned workers for each building.
- New or updated tests: `tests/scheduleFatigue.test.ts` plus the complete regression suite.
- Invariants checked: one fatigue owner, no UI mutation, no new tick layer, no pregnancy/mortality/relationship side effects, bounded fatigue [0,100], productivity floor [0.65,1.0], and unchanged 72-tick cadence.
- Save/migration impact: Optional entity fields are backward-compatible; absent legacy fields behave as zero fatigue and zero current-day work.
- Rollback plan: Remove the daily resolution and multiplier while retaining optional fields; legacy entities remain valid because the fields are optional.

## Constants

| Rule | Value |
|---|---:|
| Neutral work target | 8 hours |
| Excess-shift fatigue | 10 points per excess hour |
| Short-day recovery | 3 points per hour below target |
| Baseline daily recovery | 4 points |
| Fatigue cap | 100 |
| Production multiplier floor | 0.65 |

## Validation

| Check | Result |
|---|---:|
| Focused fatigue + venue tests | 2 files, 9 tests passed |
| Full regression/type suite | 73 files, 420 tests passed |
| Production build | Passed; existing circular-chunk and large-chunk warnings remain |
| ESLint | Passed |
| `git diff --check` | Passed |

## Deferred non-goals

W4 preview warnings, affected-workplace explanations, Chronicle feedback, staff coverage/rotation, per-human contracts, automatic staffing, overnight shifts, and direct fatigue changes to pregnancy, mortality, relationships, or random events remain out of scope.
