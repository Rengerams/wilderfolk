# Bug: Auto-play counted the Leader's House beds as spare settler housing

- Bug: Once a Leader's House exists, Auto-play stops building houses for homeless settlers
- Status: resolved
- Date discovered: 2026-09-13
- Version/build: Wilderfolk 0.6.4.1 working tree
- Reporter: Developer (found while adding "build the free Leader's House first" to Auto-play)
- Area: Play | Truth
- Owner module: `src/game/virtualPlayer.ts` (`decideHousing`), counted by `populationGrowth.getOpenPlayerBeds`
- Cadence: One proposed command per in-game hour

## Status history

- 2026-09-13 — open: discovered by code review while making the bot build the free Leader's House; the housing guard would then stop building Houses for good.
- 2026-09-13 — resolved: the guard now counts only beds a settler may be assigned (`getOpenPlayerBeds`).

## Observed behavior

With a completed Leader's House standing, `decideHousing` returns `null` for as
long as any bed anywhere is free — and the Leader's House alone supplies 12. A
village of three homeless settlers therefore reads as "9 beds free" and the bot
never starts a House, even though none of those beds can be given to them.

## Expected behavior

Spare beds should suppress a new House only when they are housing a settler
*could actually be assigned to*. The Leader's House beds are reserved for the
leader's household.

## Reproduction steps

1. Build a Leader's House (free) in a colony that has homeless settlers.
2. `getOpenBeds(state)` reports `12 − population` open beds.
3. Enable Auto-play: no House is ever proposed while the settlers stay homeless.

## Evidence

- `populationGrowth.computePopulationSnapshot()` sums
  `getResidenceCapacity(building)` for every `isResidenceBuilding(building)`,
  and `isResidenceBuildingType` includes `LeaderHouse` → 12 beds at level 1.
- `residencySelection` skips leader houses in every pick path
  (`isLeaderHouseResidence` guards at `pickLeastCrowdedResidence`,
  `pickResidenceForHuman`, `pickResidenceForFamily`, …).
- `leaderHouse.syncLeaderHouseResidency()` evicts any occupant who is not part of
  the leader's household, sets `house.occupants = entitledIds`, and re-homes the
  evicted — so an ordinary settler cannot keep such a bed.

## Root cause

`decideHousing` asked "are there spare beds?" with `getOpenBeds`, which counts
*all* residence beds. The two available answers to that question are not the
same: `getOpenBeds` is the village-wide bed count (correct for population
reports), while the bot's rule needs assignable settler housing.

## Fix

- `src/game/populationGrowth.ts` — new `getOpenPlayerBeds(state)`, next to
  `getOpenBeds`, summing capacity minus residents for every completed residence
  that is **not** a Leader's House (uses the existing `isResidenceBuilding`,
  `isLeaderHouseResidence`, `getResidenceCapacity`, `countResidentsInBuilding`).
- `src/game/virtualPlayer.ts` — `decideHousing` uses it.

## Regression test

`tests/virtualPlayer.test.ts` — "keeps housing the homeless while only the
Leader's House has free beds": with three homeless settlers and a completed
Leader's House, the bot proposes a House, `getOpenBeds(world) > 0`, and
`getOpenPlayerBeds(world) === 0`.

## Invariants checked

- `getOpenBeds` itself is unchanged, so population growth, the citizen overview,
  and the housing diagnostics keep their existing meaning.
- No save field, no new tick layer, no simulation rule change: the bot simply
  reads a more precise number.

## Save/migration impact

None.

## Verification result

Automated: typecheck, lint, and the full local suite pass (see the task report).
The population growth and housing diagnostics tests are untouched and green.

## Related commits or files

- `src/game/populationGrowth.ts`
- `src/game/virtualPlayer.ts`
- `src/game/leaderHouse.ts`, `src/game/residencySelection.ts` (evidence)
- `tests/virtualPlayer.test.ts`
