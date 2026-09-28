# Trade-route imports silently dropped iron: Ironport never paid the iron it advertises

- Bug: `applyImports` credited only wood/stone/food/gold, so the Ironport round trip (`trade_3`, the only trade source of iron) took 30 stone + 10 gold from the colony and discarded the 15 iron it was supposed to bring back; `canStoreImports` had the same omission, so a full iron store let the trip complete into a clamp that silently ate the cargo
- Status: resolved
- Date discovered: 2026-09-16 (2026-09-16 economy audit, finding H1)
- Date resolved: 2026-09-17
- Version/build: 0.6.4
- Reporter: `docs/private/audits/2026-09-16/sim-economy-leadership-combat.md` H1 (agent A2), verified against the tree and fixed 2026-09-17
- Area: Truth (economy) with a Play consequence
- Owner module: `src/game/tradeCaravans.ts` (route table: `src/game/economy.ts`)
- Cadence: caravan round trip

## Status history

- 2026-09-16 — open (found by the economy audit; never filed, so it sat in the "live but unfiled" list)
- 2026-09-17 — verified against the tree (route data and both transfer functions) and resolved

## Observed behavior

The route advertises iron:

```ts
// src/game/economy.ts:50
{ id: 'trade_3', targetName: 'Ironport', resourcesGiven: { … stone: 30 … gold: 10 … },
  resourcesReceived: { … gold: 30, iron: 15 }, reputationRequired: 40, active: false }
```

The transfer never read it:

```ts
const receives = [ wood, stone, food, gold ];   // canStoreImports — no iron
…
const recvWood/recvStone/recvFood/recvGold = …; // applyImports — no recvIron
```

So the trip completed, `caravansCompleted` incremented, the notification fired — and iron never
moved. A colony could buy its way to 80 gold and still have no trade route to the resource the
late-game forge needs (15–40 iron per order), leaving a Mine as the only source.

## Expected behavior

A completed round trip credits every non-zero field of `resourcesReceived`, and refuses to
complete (waiting at the partner) when the receiving store has no room — for every resource,
not four of five.

## Reproduction steps

1. Open the Ironport route (`trade_3`) with 40+ reputation and a Market.
2. Note iron before the trip; let a caravan complete a round trip.
3. **Before the fix:** gold rises by 30, iron is unchanged.
4. **After the fix:** iron rises by 15 as well.

## Evidence

Audit repro (`tmp/audit-2026-09-16/probe-trade.mts`): `gold 80 → 110`, `iron 30 → 30`,
`caravansCompleted 1`. Re-verified here by reading both functions and the route table: `iron` is
the only fifth-resource field any route uses, and only on the receive side of `trade_3`.

## Root cause

The import list was written when there were four tradeable resources and was never extended; iron
exists in `Resources` and in the route data, but not in the two functions that move it. No test
covered resource transfer, only route eligibility.

## Regression test

`tests/tradeImports.iron.test.ts` (2):

- a completed inbound leg on `trade_3` credits iron — asserts gold `+30` and iron `+15` exactly
  (the gold figure also pins this fixture's multiplier at 1, so the iron figure is exact);
- with the iron store full, the caravan **stays at the partner** instead of advancing to a
  clamped, lossy homecoming.

Both fail against the old code (reverted both lines, 5/5 tests across this file and the militia
file failed, then the source was restored byte-identically — sha256 checked).

## Invariants checked

- `addResource` is generic over `keyof Resources` and clamps to `storageMax`, so no new cap path
  was needed; the fix is data, not mechanism.
- The **give** side has the same latent shape (`deductExports`/`canAffordExports` list four
  resources), but no route gives iron today, so it is left alone rather than made speculatively
  symmetric. Recorded here so the next person adding an iron-exporting route closes it.
- Nothing else consumes `resourcesReceived` in a way that assumed four keys.

## Save/migration impact

None. Route data is static (`initTradeRoutes` + `ensureFullTradeRoutes`), not saved state.

## Verification result

- `npx vitest run tests/tradeImports.iron.test.ts` — passed (2); failed (2) against the reverted code.
- `npx tsc -p tsconfig.vitest.json --noEmit` — passed.
- `npm run test:all` — passed, see the batch summary in `SUMMARY.md`.
- Not verified in a live caravan on screen (no browser tier for this): the assertion drives the
  real `tryAdvanceCaravanLeg` inbound path with the real route data.

## Related commits or files

- `src/game/tradeCaravans.ts` — `canStoreImports`, `applyImports`
- `src/game/economy.ts:50` — the `trade_3` route that advertises the iron
- `tests/tradeImports.iron.test.ts` — the guard
- `docs/private/audits/2026-09-16/sim-economy-leadership-combat.md` — finding H1

## Fix

`canStoreImports` gained `{ key: 'iron', amount: Math.floor(route.resourcesReceived.iron * mult) }`
and `applyImports` gained `recvIron` plus `if (recvIron > 0) addResource(state, 'iron', recvIron)`,
both with a comment naming the omitted resource.
