# Worker-owned building upgrades unnecessarily copy the whole world

- Bug: upgrading one building deep-copies the authoritative world even when the worker already owns it
- Status: investigating
- Severity: high
- Date discovered: 2026-10-29
- Version/build: 0.6.5.1, node-beta-support
- Reporter: owner reports building upgrades time out
- Area: building upgrade commands
- Owner module: `src/game/buildingMaintenanceActions.ts` — `upgradeBuilding`; command routing in `src/game/simWorker/commands.ts`
- Related: [Unconfirmed command recovery](2026-10-29-worker-timeout-replays-unconfirmed-command.md), [Auto-fill copies the world](2026-10-29-auto-fill-worker-clones-authoritative-world.md)

## Status history

- 2026-10-29 — investigating: four focused regressions reproduce the unnecessary copy for farms, houses, silos and storehouses; the owner's exact 30-second timeout has not been reproduced with their large save.
- 2026-10-29 — implementation: thread the existing isolated/owned command contract into the upgrade owner; worker-owned upgrades update in place, direct calls remain isolated.

## Observed behavior

The owner reports an upgrade command timeout with approximately 40,000 of every resource, so insufficient resources do not explain their reported failure. The small fresh browser-test colony's earlier resource refusal is a separate, expected result. The worker calls `applyWorkerCommand` with `owned`, but the upgrade branch did not forward ownership. `upgradeBuilding` therefore calls `structuredClone(originalState)` for every upgrade, including terrain, all citizens, histories and runtime caches. Four identity regressions fail before the patch. This establishes redundant work, not that this copy alone explains a 30-second timeout.

## Expected behavior

The authoritative worker should upgrade its existing world without a second full-world allocation. Existing direct callers must retain isolation. Upgrade eligibility, price, level ceiling, housing reconciliation, capacity invalidation and storage gains must remain identical.

## Reproduction steps

1. Run `npx vitest run tests/workerCommand.roundtrip.test.ts` against the pre-fix implementation with the new owned-upgrade regressions.
2. Dispatch an `upgradeBuilding` command using `applyWorkerCommand(world, command, 'owned')`.
3. Observe that the returned world is a full copy and the worker input building still has level 1; the owned identity assertions fail for all four building types.

## Evidence

The pre-fix targeted run reports 4 failed and 13 passed tests. All four new failures are at the owned-world identity assertion. Existing upgrade tests confirm the level and resource rules, but previously did not exercise owned execution.

## Root cause

Confirmed avoidable cost: the upgrade command ignored the ownership argument already provided by the worker. Exact cause of the owner's long-running timeout remains unconfirmed without that settlement.

## Fix / proposed fix

Add the same default-isolated ownership argument already used by staffing commands to the existing upgrade owner. Forward ownership from the command router. Do not raise deadlines, blindly replay upgrades, or remove authoritative save checks: retrying a non-idempotent upgrade can charge for another level.

## Save/migration impact

None. The command and save wire formats do not change.

## Verification result

- FAIL before fix: `npx vitest run tests/workerCommand.roundtrip.test.ts` — 4 new owned-world regressions failed; 13 existing tests passed.
- PASS after fix: `npx vitest run tests/workerCommand.roundtrip.test.ts tests/commands.validation.test.ts tests/workerBoundary.closure.test.ts tests/gameLoop.test.ts` — 66 tests across four files.
- PASS: `npm run test:types`, `npm run lint`, `npm run build`; the build retains the existing large-chunk warning.
- PASS on screen: a fresh Huge-map colony advanced from day 0 to day 4 using the real 10x and Auto-play controls. After ordinary play made the upgrade affordable, clicking Expand on house ID 1 showed `House (Lv.2)`, 8 resident slots and the Home expanded notification. No browser console errors were returned.
- PASS on screen: an earlier unaffordable attempt displayed Need 50w 25s 50g and left wood, stone and gold unchanged; this was a resource refusal, not a timeout.
- NOT VERIFIED: saved-file contents after clicking Save game; no browser quick-save was observed in this Huge-map run.
- NOT VERIFIED: upgrade latency on the owner's original large settlement and two complete on-screen years. At the normal 10x ceiling two years require at least 20,736 seconds (5h 45m 36s), excluding stalls.
