# Bug: Colony larder meal rule was implemented twice with different guards

- Status: resolved
- Date discovered: 2026-09-10
- Version/build: Wilderfolk 0.6.4
- Reporter: Coding assistant (jscpd duplicate scan of `src`, default sensitivity)
- Area: Truth | simulation
- Owner module: `src/game/simulation/humanNeeds.ts` (`tryEatColonyMeal`), called from `src/game/humanTick.ts`
- Cadence: Realtime human tick (meal check gate: every `MEAL_CHECK_INTERVAL_HOURS`)

## Status history

- 2026-09-10 — open: `npm run dup` is clean at its configured thresholds
  (`--min-lines 12 --min-tokens 60`), but the same scan at jscpd's default
  sensitivity reported `humanTick.ts [425:12-432:72]` duplicated at
  `[537:7-544:70]`: the colony meal rule written out twice.
- 2026-09-10 — resolved: one owner implements the rule; both tick paths call it
  (regression test `tests/humanNeeds.mealRule.test.ts`, 9 cases).

## Observed behavior

The colony-larder meal rule — drain 1 food, restore 65 energy, when a settler is
hungry at a meal-check hour — existed as two hand-written copies:

| Copy | Site | Player-settler gate |
|---|---|---|
| Idle/inactive path | `humanTick.ts` 425–432 | yes (`isPlayerHuman`) |
| Active path | `humanTick.ts` 537–544 | **no** |

The two copies also differed in shape: only the active copy reported whether a
meal was eaten (`ateMeal`), and the inactive copy commented on an "energy < 80%
max" threshold while the gate uses `HUNGER_MEAL_THRESHOLD` (0.9).

## Expected behavior

One rule, one place, one set of gates. Whenever the larder is involved, the rule
itself must refuse any non-player eater — the comment at the first copy already
states the intent: "Colony larder meals are player settlers only (visitors/rivals
must not drain food)".

## Reproduction steps

1. `npx jscpd src --format typescript,tsx --ignore "**/*.test.ts,**/data/**"`
   (jscpd defaults: 5 lines / 50 tokens).
2. Observe the `humanTick.ts` self-clone pair listed above.

## Evidence

jscpd at default sensitivity: 62 clones / 435 duplicated lines (0.62%) before the
fix, 57 clones / 410 lines (0.59%) after, with zero `humanTick.ts` hits. The
project's own `npm run dup` gate reported 0 clones both before and after, because
the 11-line blocks sit just under its `--min-lines 12` threshold.

## Root cause

Behaviour that must stay identical everywhere was written per tick path instead of
owned once. The active path relied on its callers to have excluded foreign
factions earlier in the same function (trade caravans, visitors, and rivals all
`continue` before it), so the missing gate was invisible in practice and would
have silently drained the larder if that control flow ever changed.

## Fix

- `src/game/simulation/humanNeeds.ts` — added `tryEatColonyMeal(entity, state,
  hourOfDay)`: the single owner of the meal gates (player settler, meal-check
  hour, start of a clock hour, food ≥ 1, energy below `HUNGER_MEAL_THRESHOLD`),
  returning whether a meal was eaten.
- The 65-energy restore is now `Human.MEAL_ENERGY_RESTORE` in
  `gameConstants.ts` with the tuning rationale recorded there.
- `src/game/humanTick.ts` — both sites call the owner; the inactive path keeps
  its existing `isPlayerHuman` prefix on the neighbouring exhaustion check.
- Same pass, same file: the exhaustion-death sequence (kill, death particles,
  cause log) was duplicated at 434–444 and 1601–1611 and became
  `killFromExhaustion()`; the map-boundary clamp duplicated into
  `tickLayerSystems.ts` became `clampToMapBounds()` in `src/game/mapBounds.ts`;
  the duplicated Market/Store leisure steer became one local `steerToShop()`.

Behaviour deltas, stated plainly:

- The larder gate is now enforced by the owner. No reachable behaviour changes,
  because only player settlers reach the active-path call site today; the rule is
  now correct even if that stops being true.
- `killFromExhaustion` deliberately does **not** gate on player-settler status,
  because its two call sites intentionally differ (the idle path checks it, the
  active path does not).
- Food, energy, death logging, and inventory arithmetic are unchanged.

## Regression test

`tests/humanNeeds.mealRule.test.ts` (local-only) — 9 cases: feeds a hungry player
settler for exactly 1 food and `MEAL_ENERGY_RESTORE` energy; refuses a visitor;
refuses outside a meal-check hour; refuses mid-hour; refuses an empty larder;
refuses a settler not yet hungry; never overfills the bar; records "meals" in the
economy ledger; honours the meal-check cadence.

## Invariants checked

- Colony food is still consumed only by player settlers.
- Meal cadence (`MEAL_CHECK_INTERVAL_HOURS`) and cadence ownership are unchanged.
- Death cleanup still runs through the same `killHuman` transition and the same
  `logDeath` cause string, so the chronicle text is unchanged.
- No new tick layer, no cadence change, no new authoritative state field.
- Entity map-bounds clamping remains an unconditional per-tick invariant.

## Save/migration impact

None — no state field, save schema, or worker delta shape changed.

## Verification result

`tsc -b` clean, `npm run lint` 0 warnings / 0 errors, full suite 91 files / 482
tests passing (482 includes the 9 new meal-rule cases). jscpd: 0 `humanTick.ts`
clones remaining.

## Related files

- `src/game/simulation/humanNeeds.ts`
- `src/game/humanTick.ts`
- `src/game/gameConstants.ts`
- `src/game/tickLayerSystems.ts`
- `src/game/mapBounds.ts`
- `tests/humanNeeds.mealRule.test.ts`
