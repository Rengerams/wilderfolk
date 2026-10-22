# Prison watch gaps on weekends and outside camera focus

- Bug: prison watch assignments changed before guards could complete long commutes, with additional delays from the colony workweek, home routine, and off-screen throttle
- Status: resolved — live verification pending
- Date discovered: 2026-10-17
- Version/build: 0.6.5.0
- Reporter: owner, savegame and chronicle
- Area: Play
- Owner module: `humanTick.ts`
- Cadence: every tick while a guard is assigned to a watch

## Status history

- 2026-10-17 — open (owner save reports six escapes across days 203–206)
- 2026-10-17 — investigating (reproduced a rostered weekend guard whose home routine can preempt the watch commute)
- 2026-10-17 — resolved — live verification pending (targeted tests pass; the restored save has zero uncovered hours and zero escape rolls on days 2–3; the owner’s live game still needs a check)

## Observed behavior

The chronicle records repeated escapes, including Eloi Mcneal, Reyna Fulmer, Jay Buckner, Tarah Gass, Trinidad Box, and Erica Poole. Each event says the duty guard was away from the post. The save's prison rosters include guards whose home locations are far from their assigned posts. A restored-save watch simulation recorded 59 unguarded prison-hours in one day before the rotation change.

## Expected behavior

A guard assigned to a prison shift must keep the same assignment long enough to reach the post, regardless of the colony's weekday schedule or camera location. A home preference must not preempt that commute.

## Reproduction steps

1. Assign a guard to a Prison and give the guard a residence away from it.
2. Move the camera away from both buildings and advance to the pre-shift hours on a weekend.
3. Observe whether the guard walks toward the Prison before the watch begins.

## Evidence

- Owner save: `wilderfolk-New-Frontier-Y3-D206.txt`, tick 66721, version 0.6.5.0.
- Chronicle: escapes on days 203–206 report that the on-duty guard was away from the post.
- Regression fixture: `tests/prisonGuardOnDuty.postStay.test.ts`, weekend at 05:00 with the guard outside camera focus.

## Root cause

Prison guards used the ordinary workday gate to decide when to leave, although prison shifts run every day. Before the shift, the home commute branch could win over the prison commute. Guards outside camera focus also used the normal 24-tick human throttle, so their route updates could be hours apart. The commute estimate assumed a movement step each game tick, while the movement layer advances every four ticks. The roster changed the active crew every calendar day, and hourly presence was sampled before movement. Legacy saves could contain more guards than the current post limit, and the roster selected them by id instead of proximity.

## Regression test

`tests/prisonShifts.test.ts` verifies that the active crew stays stable for a full week. `tests/prisonGuardOnDuty.postStay.test.ts` verifies weekend/off-screen commute and nearest-guard selection for legacy crews. The existing presence tests in `tests/low-2-events-defense.test.ts` continue to cover stationed guards and uncovered posts.

## Verification result

- Restored-save prison watch, 3 days from tick 66721: day 1 recorded 11 uncovered hours while the legacy guards reached their posts, with 0 escapes; days 2 and 3 recorded 0 uncovered hours and 0 escape rolls.
- `tests/prisonShifts.test.ts`: 11 passed.
- `tests/gameTick.layerOrder.test.ts`: 8 passed.
- Weekend commute and legacy roster selection cases: 2 passed.
- `npm test -- types`: passed; changed-file Oxlint: passed.
- Full lint/build remains blocked by the pre-existing unused `LOW_GOLD_STOCK` in `src/game/virtualPlayer.ts:603`.

## Save/migration impact

No save fields or schema changes. Existing guard assignments are retained; the active crew and shift now remain stable for a week, and rostered guards update and route to their assigned post every tick.

## Fix

The duty rotation now advances by week rather than day. Overfull legacy crews use the three guards nearest the post; legal four-guard crews keep the weekly relief rotation. Rostered guards are simulated each tick, commute estimates account for the movement cadence, and their commute can start on weekends and take priority over the home routine. Hourly presence sampling now runs after movement.
