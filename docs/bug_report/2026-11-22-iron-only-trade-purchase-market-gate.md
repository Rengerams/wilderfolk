# Gold-for-iron purchase routes are incorrectly treated as Market-required

- Bug: the canonical `isMaterialPurchaseRoute` rule excludes iron when classifying a gold-for-materials route.
- Status: investigating
- Severity: low (latent route configuration)
- Date discovered: 2026-11-22
- Version/build: 0.6.5.2 development; PR #170 against main
- Reporter: source review of the route eligibility rule
- Area: trade route eligibility
- Owner module: `src/game/tradeCaravans.ts`
- Related PR/commit: [PR #170](https://github.com/Rengerams/wilderfolk/pull/170)
- Related historical report (separate UI/owner mismatch): [2026-09-16 material-purchase UI route gate](../BUG_REPORTS/2026-09-16-material-purchase-trade-routes-unreachable.md)

## Status history
- 2026-11-22 — investigating: source review identified missing fifth resource and added a targeted eligibility regression; CI pending.

## Observed behavior
`isMaterialPurchaseRoute` checked received wood, stone and food but not iron. Thus a route exporting only gold and importing only iron would incorrectly require a completed Market. The currently shipped default routes do **not** include an iron-only purchase route: this is an evidenced edge in the owner predicate, not a claim of a current default-route outage.

## Expected behavior
All actual material resources, including iron, have the same purchase-route exemption. Gold received on the trade still disqualifies the exemption.

## Reproduction steps
1. Construct a `TradeRoute` with gold-only exports and iron-only imports.
2. Ask `isMaterialPurchaseRoute` and `canEstablishTradeRoute` without a Market.
3. Before the fix, the first returns false and the route is blocked; after the fix, the route is eligible subject to reputation and other owner rules.

## Evidence
- `src/game/tradeCaravans.ts`: `receivesMaterials` omitted `route.resourcesReceived.iron > 0`.
- Regression: `tests/tradeRoutes.eligibility.test.ts`, “allows an iron-only purchase route without a Market”.

## Root cause
The owner predicate retained the pre-iron four-resource assumption.

## Fix / proposed fix
PR #170 includes iron in the existing predicate. The UI already reads `canEstablishTradeRoute`; no UI-side calculation or second eligibility owner was introduced.

## Save/migration impact
None. Saved or future routes with iron-only imports follow the updated predicate.

## Verification result
- Source defect established by inspection.
- Focused regression added; amended CI **NOT YET VERIFIED**.
