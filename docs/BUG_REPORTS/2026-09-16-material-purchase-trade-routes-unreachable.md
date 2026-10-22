# The trade panel disables the Market-exempt coin→materials routes and tells the player "Need Market"

- **Bug:** `ProgressTabPanel` gates "Establish Route" on its own `marketOk && repOk` check and never
  consults the trade owner's `isMaterialPurchaseRoute` exemption (`tradeCaravans.ts:172`), so the three
  coin→materials rescue routes (`trade_8`/`trade_9`/`trade_10`: gold → wood, stone, food) are
  permanently disabled and labelled "Need Market" — while a Market costs the 50 wood + 20 stone the
  player is trying to obtain. `App.tsx:1061-1065` repeats the same gate for `tradeReadyCount`, so the
  HUD agrees with the wrong rule. A colony that still has gold but no wood/stone has no visible way out,
  and the AlertBar points players at this panel
- **Status:** resolved
- **Date discovered:** 2026-09-16
- **Version/build:** 0.6.4
- **Reporter:** autonomous full-audit pass — found independently by the UI-logic subagent and the playability/game-feel subagent, then re-verified by the lead against the owner
- **Area:** UI (gate logic) with a Play consequence (bootstrap trap)
- **Cadence:** player-command

## Status history

- 2026-09-16 — open (found twice, independently, in two audit areas)
- 2026-09-16 — resolved (both copies of the gate deleted: the panel and `App.tsx` now call `canEstablishTradeRoute`, and the disabled route shows the owner's own `blockReason`; regression test `tests/tradeRoutes.eligibility.test.ts`)

## Observed behavior

The panel computes its own eligibility instead of asking the owner:

```tsx
// src/components/tabPanels/ProgressTabPanel.tsx:226-228  (as reported by the UI agent)
const canEstablish = marketOk && repOk;
```

and renders the disabled button with the reason `Need Market`. But the trade owner explicitly exempts
the material-purchase routes from the Market requirement (`tradeCaravans.ts:172`), and those routes are
the documented rescue for a colony with no wood or stone.

`src/App.tsx:1061-1065` carries a second copy of the same gate for `tradeReadyCount`, which is why the
count in the HUD also reads as "nothing available".

## Expected behavior

Eligibility for each route comes from the trade owner (a single source of truth, `AGENTS.md` §5.2); a
material-purchase route is offered when its cost is affordable and reputation allows, with or without a
Market. If the owner really does block a route, the panel must show the owner's own reason, not a
restated one.

## Reproduction steps

1. Play to a state with gold but no wood and no stone and no Market (e.g. sell the starting stockpile / spend it on housing).
2. Open the Village/Progress panel and look at the trade routes: the three coin→materials entries are greyed out with "Need Market".
3. Read `tradeCaravans.ts:172` — the owner marks those routes `isMaterialPurchaseRoute` and does not require a Market.
4. Confirm the duplicate gate at `App.tsx:1061-1065` (`tradeReadyCount`).

## Evidence

- `src/components/tabPanels/ProgressTabPanel.tsx:226-228` — `canEstablish = marketOk && repOk` (restated gate).
- `src/components/tabPanels/ProgressTabPanel.tsx:226-261` — the disabled button and the `Need Market` copy (playability agent's citation range).
- `src/game/tradeCaravans.ts:172` — the owner's `isMaterialPurchaseRoute` exemption; the UI never calls it.
- `src/App.tsx:1061-1065` — the second copy of the gate used for `tradeReadyCount`.
- The AlertBar's "trade for materials" pointer sends the player to this panel (playability report §findings).
- No `BUG_REPORTS/` entry covers it (both agents enumerated the existing 52 reports before reporting).

## Root cause

The Market/route rule lives in the trade owner but the panel (and the App-level counter) re-derived a
simpler version of it — the "restated rule" pattern this audit found in five other places
(`SelectedBuildingPanel` manual staffing, `buildingStaffingActions` builder eligibility,
`residencySelection` best fit, `simHelpers` vs `combat` research effects, `huntLogic.test` vs the
hunt rules). The panel's copy lost the exemption the owner had added.

## Regression test

`tests/tradeRoutes.eligibility.test.ts` (6 tests):

- the owner rule an untested unit until now — a coin→materials rescue route (`gold` out, `wood` in) is
  establishable **without** a Market; a normal route is still blocked without one, with the owner's
  exact reason; the reputation requirement still binds a rescue route; an active route is refused;
- source-scan guards that `ProgressTabPanel` derives eligibility from
  `canEstablishTradeRoute(state, route.id)` and no longer contains `marketOk && repOk` or `'Need Market'`,
  and that `App` derives `tradeReadyCount` from `canEstablishTradeRoute(world, r.id)`.

The audit asked for a focused panel render test; this tier has no DOM environment (`vitest.config.ts`
is `environment: 'node'`, `include: tests/**/*.test.ts`), so the panel is guarded by its source
contract plus the owner-rule unit tests instead — disclosed rather than skipped silently.

## Invariants checked

Not a simulation invariant. The violated repository rule is "one decision, one owner, one definition"
(`OWNERSHIP_OVERVIEW.md`: trade caravans and routes are owned by `tradeCaravans.ts`).

## Save/migration impact

None.

## Verification result

- Static trace of both gates and the owner exemption (lead, reading the cited lines).
- Playability agent measured it against a live probe world (`tmp/audit-2026-09-16/probe-trade.mts`) and recorded it as its finding #1 (highest severity).
- UI agent reached the same conclusion from the component side and recorded it as one of its two HIGH findings.
- `npm run test:standard` (152 files / 840 tests) passes with the defect present — no test covers the panel gate.
- The lead did **not** modify `src/` during the audit (a concurrent session was editing the tree).

## Related commits or files

- `src/components/tabPanels/ProgressTabPanel.tsx:226-261`, `src/App.tsx:1061-1065`
- `src/game/tradeCaravans.ts:172` (the owner rule that is being restated)
- `docs/private/audits/2026-09-16/ui-logic.md`, `docs/private/audits/2026-09-16/playability-gamefeel.md`
- `docs/private/audits/2026-09-16/duplication-deadcode.md` (the restated-rule family)

## Fix

Both copies of the rule are gone; each call site now asks the owner.

`src/components/tabPanels/ProgressTabPanel.tsx`:

```tsx
const eligibility = canEstablishTradeRoute(state, route.id);
const canEstablish = eligibility.ok;
…
{route.active ? 'Active' : eligibility.blockReason ?? 'Unavailable'}
```

The disabled badge therefore shows the trade owner's own reason (`Build a Market before establishing
trade routes`, `Need N reputation`, `Route already established`) instead of the restated `Need Market`,
and the three coin→materials rescue routes are enabled again — they are exactly the routes
`isMaterialPurchaseRoute` exempts, so a colony with gold and no wood/stone can buy its way out. The
informational line above the list now says the exemption out loud, and only appears while no Market
stands.

`src/App.tsx`:

```tsx
const tradeReadyCount = useMemo(
  () => world.tradeRoutes.filter((r) => canEstablishTradeRoute(world, r.id).ok).length,
  [world],
);
```

The HUD count and the Progress-tab alert now agree with the panel and the owner. The dependency array
is `[world]` rather than the three fields the filter reads, because the owner function reads the world
as a whole (that also keeps oxlint's `react-hooks/exhaustive-deps` at 0 warnings).

## Verification result

- `npx vitest run tests/tradeRoutes.eligibility.test.ts` — passed (6 tests). The two source-scan cases fail against the old panel/App (they assert the owner call is present and that `marketOk && repOk` / `'Need Market'` are gone).
- `npm test` — passed: 161 files / 871 tests, 0 failures.
- `npm run build`, `npm run lint` (0 warnings / 0 errors on 322 files), `npm run test:types` — passed.
- `npm run test:full-year` and `npm run test:browser` — passed on this tree.
- Static trace of both call sites and of `canEstablishTradeRoute` / `isMaterialPurchaseRoute` before the change confirmed the defect (the owner's exemption was never called by the UI).
