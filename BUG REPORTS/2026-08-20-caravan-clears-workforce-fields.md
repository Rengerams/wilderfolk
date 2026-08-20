# Bug: tradeCaravans clears workforce fields outside the workforce owner

- Status: won't-fix
- Date discovered: 2026-08-20
- Version/build: 0.6.1
- Reporter: Deep Code (Objective 2 full-code ownership audit)
- Area: Truth
- Owner module: tradeCaravans.ts (writer) — workforce.ts (declared owner)
- Cadence: player-command / caravan system tick

## Status history
- 2026-08-20 — open (discovered in the Objective 2 full-code ownership audit)
- 2026-08-20 — won't-fix (false positive: caravan carriers are always spawned
  `trade_caravan`-faction entities, excluded from village job systems; the
  flagged writes are entity creation/cleanup, not workforce mutations)

## Observed behavior

`tradeCaravans.ts` sets `entity.residenceBuildingId = undefined` and
`entity.homeBuildingId = undefined` for caravan carriers (tradeCaravans.ts:115–116
and 197–198). These fields belong to the workforce decision, whose declared
owner is `workforce.ts`.

## Expected behavior

Assignment changes should go through the workforce owner's named transitions
(or be explicitly documented as sanctioned delegation).

## Reproduction steps

1. Send a trade caravan (or let a route depart).
2. Observe `homeBuildingId` / `residenceBuildingId` cleared by
   `tradeCaravans.ts` for the carrier entity.

## Evidence

- `src/game/tradeCaravans.ts:112–122` (`removeCarrier`) and 188–200
  (`spawnCaravan`)
- `src/game/playerHuman.ts` — `isPlayerHuman` excludes `faction === 'trade_caravan'`
  with the comment: "trade_caravan carriers are real humans on the map but must
  not count toward population, housing, or village job systems"

## Root cause

**Not a workforce mutation.** Caravan carriers are never village settlers:
`spawnCaravan` creates a fresh entity with `faction: 'trade_caravan'`
(tradeCaravans.ts:188–200), and the writes at 115–116 / 197–198 are creation
and death-cleanup of that transient trade entity. `playerHuman.ts` explicitly
excludes trade_caravan entities from the village job systems, so these fields
never carried a village assignment. The initial audit flagged the write sites
without checking the entity's faction; the follow-up read showed the writes
are on a spawned non-villager.

## Fix

None required. The writes are entity creation/cleanup on a transient
trade-faction entity, not an assignment decision owned by `workforce.ts`.
No code change was made (Objective 4 re-verified this while consolidating the
workforce transitions).

## Regression test

Not applicable — no behavior change. The Objective 1 invariant collector
(`tests/simulation.invariants.test.ts`) already ignores non-player entities
via `isSettlerEntity` (faction entities are skipped).

## Invariants checked

- Workforce fields written only by the workforce owner — confirmed for all
  **player settlers**; trade_caravan entities are outside the workforce domain.
- `homeBuildingId` ↔ workplace occupants consistency for player settlers.

## Save/migration impact

None.

## Verification result

Verified as not-a-bug on 2026-08-20: full-code audit of every
`caravanCarrierId` write site (saveLoad.ts, tradeCaravans.ts) shows carriers
are always spawned `trade_caravan`-faction entities; no path assigns a village
settler as a caravan carrier.

## Related commits or files

- `src/game/tradeCaravans.ts`
- `src/game/playerHuman.ts`
- `src/game/workforce.ts` (Objective 4 named transitions)
