# Abandoned caravan loses exports when its return exceeds storage capacity

- Bug: cancelling an overdue caravan silently discards reserved exports that cannot fit in the village store, while reporting that all goods were returned.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-22
- Version/build: 0.6.5.2 development; PR #170 against main
- Reporter: source review of the existing caravan refund owner
- Area: trade caravans, refunds, storage and persistence
- Owner module: `src/game/tradeCaravans.ts`
- Related PR/commit: [PR #170](https://github.com/Rengerams/wilderfolk/pull/170)
- Related earlier work: [2026-11-11 economy/buildings audit](2026-11-11-audit-remediation-economy-buildings.md) established a **bounded** refund path (W-36); this report covers the separate storage-overflow loss inside that path.

## Status history
- 2026-11-22 — investigating: traced the storage cap in `refundExports`; pending-return accounting and regression committed in PR #170, final CI pending.

## Observed behavior
`abandonCaravan` invoked `refundExports` after a deadline. The refund called capped `addResource` for every reserved export and discarded the unaccepted difference. Its log said “reserved goods returned” even when goods vanished. This differs from the older W-36 case, where the trip had no bounded resolution at all.

## Expected behavior
Export cargo from an abandoned route is either credited up to available capacity or remains accounted for until capacity is available. A fresh trip must not overlap outstanding return cargo, and the log must describe the actual state.

## Reproduction steps
1. Depart a trade caravan with wood and food exports reserved.
2. Fill both stores and advance to the trip deadline so the carrier turns back.
3. Observe that the remaining exports exceed available capacity; previously they were lost.
4. After the fix, check `route.pendingRefund`; free storage, run the normal systems tick and verify the exact remainder is credited and cleared.

## Evidence
- `src/game/tradeCaravans.ts`: the old `refundExports` ignored the amount actually accepted by `addResource`; `abandonCaravan` unconditionally logged goods returned.
- Regression: `tests/tradeCaravan.carrierRetention.test.ts`, “retains over-cap exports after an abandoned trip and drains them before another departure”.

## Root cause
The refund path relied on a storage-capped writer without retaining its rejected quantity.

## Fix / proposed fix
PR #170 keeps outstanding returns on the existing route as optional `TradeRoute.pendingRefund` and settles them through the canonical resource owner on the **existing** systems tick. Subsequent departures wait until the debt is cleared; food ledger receives only accepted amounts and events report deferred cargo honestly.

## Save/migration impact
Adds optional `pendingRefund?: Partial<Resources>` to the already-persisted trade-route object. Existing saves default to no pending return; saved route objects retain the field through `ensureFullTradeRoutes`. No parallel state store or save-version bump.

## Verification result
- Defect confirmed from source and cap semantics.
- Existing 2026-11-11 bounded-deadline regression remains relevant; new overflow regression committed in PR #170.
- New regression/full PR CI after test fixture correction: **NOT YET VERIFIED**.
