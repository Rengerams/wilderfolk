# Bug: Hunting Spot attack reads as a yellow paint streak rather than a hunter-fired arrow

- Status: resolved
- Date discovered: 2026-08-28
- Version/build: Wilderfolk 0.6.4
- Reporter: Developer gameplay observation
- Area: Play | UI
- Owner module: hunting behavior emits existing visual effects; renderer presents them
- Cadence: Realtime presentation only; hunting damage and target selection remain in their declared owner

## Status history

- 2026-08-28 — investigating: developer reported that Hunting Spot attacks appear as a yellow painted mark or automatic tower shot rather than an arrow fired by the assigned hunter.
- 2026-09-09 — still investigating: the arrow *shape* was fixed (de98bd6 — wooden shaft/head/fletching instead of a gold tracer), but the staffed Hunting Spot auto-kill still emits its effect from the building (`dailyBuildingEconomy.ts:384-401`), so it still reads as an automatic tower shot; the transient hunter-origin emission was removed at 07cc936.
- 2026-09-13 — resolved: the shot now leaves the live assigned hunter's position and is not emitted at all without one; regression test fails against the old building-anchored emission.

## Observed behavior

The visual origin or effect shape does not communicate that a human hunter at a Hunting Spot performs the hunt. It can look like the building/tower attacks automatically.

## Expected behavior

When an assigned hunter makes a ranged hunting attack, a short-lived arrow visibly travels from that hunter’s position toward the prey. A Hunting Spot is a work location, not an automatic attack tower. Towers remain non-automatic unless an explicitly separate combat system says otherwise.

## Reproduction steps

1. Complete and staff a Hunting Spot.
2. Allow an assigned hunter to acquire nearby valid prey.
3. Observe the attack visual and its origin.

## Evidence

Developer gameplay observation on 2026-08-28.

## Root cause

The Hunting Spot's kill is resolved by the **building's** daily economy path, not
by the assigned hunter's own realtime action, so the arrow it emits is anchored to
the building:

- `dailyBuildingEconomy.ts` (~lines 384–401) resolves the staffed Hunting Spot kill
  and emits the hunt visual from `building.x` / `building.y`.
- The earlier transient emission from the hunter's own position was removed at
  `07cc936`, which left the building-anchored emission as the only source.

Nothing is mechanically wrong with the kill itself — target selection, damage,
timing, food reward, and wildlife removal are all still owned by the hunting
owner and the daily economy owner. The defect is purely that the *presentation
origin* contradicts what the player is told the building is (a work location, not
an automatic tower).

## Fix

Implemented 2026-09-13 (presentation-anchored, exactly as scoped below):

1. When the daily Hunting Spot kill resolves, the existing hunt visual is emitted
   from the **live position of the assigned hunter** (`hunter.x` / `hunter.y`,
   `hunterId: hunter.id`) instead of `building.x` / `building.y`.
2. If no living hunter is assigned, **nothing** is emitted — an unstaffed Hunting
   Spot never looks like it fired.
3. The arrow art from `de98bd6` (wooden shaft, head, fletching) is unchanged.
4. Kill resolution, target selection, damage, food reward, and wildlife removal
   are untouched; no realtime combat owner and no second hunting path was added.

## Regression test

Local test: with a staffed Hunting Spot and a knockable prey in range, capture the
emitted hunt visual and assert its origin matches the assigned hunter's position
(within a small tolerance) and does **not** equal the building centre; add a
negative case asserting no visual is emitted when no hunter is assigned. Manual
play confirmation at normal zoom remains part of the evidence, since the defect was
reported visually.

## Invariants checked

Not applicable — presentation-only. Confirmed the emission reads hunter and
building state without writing any of it, so hunting damage, energy, food reward,
wildlife removal, and worker assignment stay with their current owners.

## Save/migration impact

Not applicable — the effect is ephemeral and is not persisted.

## Verification result

Verified fixed 2026-09-13. `dailyBuildingEconomy.ts` resolves the building's live
assigned worker (`findLiveAssignedWorker`) and emits `addHuntVisual` with
`hunterId: hunter.id`, `fromX: hunter.x`, `fromY: hunter.y`; with no living hunter
assigned, nothing is emitted, so an unstaffed Hunting Spot cannot look like it
fired. Kill resolution, damage, food reward, and wildlife removal are untouched.

Regression test `tests/huntVisuals.origin.test.ts` (2 cases), driving the real
`initGame` + `gameTick` path: a staffed spot fires from the hunter (the visual's
`hunterId` is the hunter entity, its origin is within 120 px of that hunter and is
**not** the building's corner), and an unstaffed spot never fires. Verified
load-bearing: restoring `hunterId: building.id` / `fromX: building.x` fails the
first case. `tsc -b`, `oxlint`, and the full local suite (99 files / 529 tests)
pass. The manual judgement of how the arrow *reads* at normal zoom on varied
terrain is still a human check.

## Related files

- hunting behavior owner
- `src/game/simEffects.ts`
- projectile/effect renderer
