# Inbound caravan cargo disappears when home storage fills during travel

- Bug: a trade caravan can count a delivery as complete although part of its imported cargo was rejected by the home storage cap.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-22
- Version/build: 0.6.5.2 development; PR #170 against main
- Reporter: source review of the existing trade lifecycle
- Area: trade caravans, resource capacity
- Owner module: `src/game/tradeCaravans.ts`
- Related PR/commit: [PR #170](https://github.com/Rengerams/wilderfolk/pull/170)

## Status history
- 2026-11-22 — investigating: reviewed `canStoreImports`, `tryAdvanceCaravanLeg` and `applyImports`; fix and regression committed in PR #170, final CI pending.

## Observed behavior
`tryAdvanceCaravanLeg` checked `canStoreImports` at the trading partner, then let the carrier travel home. Other production could fill storage during transit. On home arrival, `applyImports` used capped `addResource` but the route incremented `caravansCompleted` and despawned the carrier regardless of how much was accepted.

## Expected behavior
An inbound trip completes only after **all** advertised cargo fits and is stored. If the store fills in transit, the merchant waits at home and can retry instead of losing cargo.

## Reproduction steps
1. Seed a world with `trade_3` (Ironport) active and a carrier at the partner, with free iron/gold capacity.
2. Advance the carrier to `inbound`, move it to the home hub and fill iron storage before the arrival step.
3. Before the fix, `addResource` clamps the 15 iron but the trip completes; after the fix, the route remains inbound with a retry delay.
4. Free 20 iron capacity and retry: the advertised 15 iron and 30 gold are credited together.

## Evidence
- `src/game/tradeCaravans.ts`: `canStoreImports` originally ran before the inbound trip, not on delivery; `applyImports` accepted capped credits without rejecting the completion.
- Regression: `tests/tradeImports.iron.test.ts`, “keeps inbound cargo on the carrier when storage fills during the return trip”.
- The first PR #170 CI run reported one failed test from the fixture's missing `caravansCompleted` initialization (3,249 other tests passed). The fixture now calls canonical `enrichTradeRoute`; amended CI has not yet been verified in this report.

## Root cause
Capacity admission and delivery completion were separated by an entire travel leg; the destination could change in between.

## Fix / proposed fix
PR #170 rechecks `canStoreImports` at the home hub before `applyImports`. When blocked, the existing caravan systems tick manages the wait/retry; bounded deadline and route owner remain unchanged. No second unloading scheduler.

## Save/migration impact
No new field for this case: existing `caravanLeg`, `caravanWaitTicks` and `nextDepartureTick` persist. Existing saved caravans are handled by the same destination admission rule.

## Verification result
- Source cause and changed control path: **reviewed**.
- Original new regression: **FAIL** on optional counter fixture setup, not cargo logic.
- Corrected fixture and full PR CI after the correction: **NOT YET VERIFIED**.
