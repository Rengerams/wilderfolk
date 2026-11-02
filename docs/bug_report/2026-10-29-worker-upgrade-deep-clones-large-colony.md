# Worker-owned building upgrades clone the entire colony

- Bug: upgrading one structure deep-clones all simulation state even though the worker already owns that state.
- Status: investigating — targeted correction and regression authored, live verification pending
- Severity: high
- Date discovered: 2026-10-29
- Version/build: 0.6.5.2 development, main inspected 2026-10-29
- Reporter: owner 10× logs and source inspection
- Area: worker command and building maintenance
- Owner module: `src/game/buildingMaintenanceActions.ts` (`upgradeBuilding`); `src/game/simWorker/commands.ts` routes ownership
- Related: `docs/bug_report/2026-10-29-worker-timeout-replays-unconfirmed-command.md`, `docs/BUG_REPORTS/2026-10-02-high-speed-tick-rate-shortfall-and-fallback-freeze.md`

## Status history
- 2026-10-29 — open: owner logs repeatedly show `upgradeBuilding` timing out after 30 seconds, 0 ticks/s, and worker recovery.
- 2026-10-29 — investigating: static trace confirms unconditional `structuredClone(originalState)` in `upgradeBuilding`, including owned worker calls and missing/invalid buildings.
- 2026-10-29 — investigating: owned calls now skip the clone; isolated semantics retained. Tests written; large-save replay pending.

## Observed behavior
At 10×, pending `upgradeBuilding` commands hold the worker queue, stop tick dispatch and time out. The upgrade owner cloned the entire world before looking up or checking eligibility, regardless of command ownership. The broader stall may also involve housing reconciliation, worker delta serialization and main-thread work.

## Expected behavior
A worker-owned command changes its authoritative state without cloning all unrelated entities, buildings, maps and histories. An isolated command must not mutate its input. Unavailable upgrades must not clone the world to do nothing.

## Reproduction steps
1. On a large colony, issue an `upgradeBuilding` command through the worker.
2. Observe a 30-second timeout, no tick progress, and recovery in the supplied logs.
3. Trace `applyWorkerCommand(..., 'owned')` through `buildingMaintenanceActions.upgradeBuilding` to the unconditional deep clone.

## Evidence
The former `upgradeBuilding` began by cloning `originalState`; the owned `applyWorkerCommand` route did not pass ownership to it. Other maintenance actions already use worker ownership selectively.

## Root cause
Verified avoidable world-wide clone for every upgrade. Not verified as the sole cause of the observed 30-second command timeout; full housing reassignment on residential upgrades remains a potential expensive path.

## Fix / proposed fix
Pass the existing ownership mode through the command route. Use original state for `owned`, clone for `isolated` only on a meaningful command, and preserve refusal effects and the existing housing behavior. Do not modify timeout policy or replay failed commands.

## Save/migration impact
None; no persisted fields or gameplay rules changed.

## Verification result
- PASS (static): inspected source and control-flow changes.
- ADDED, NOT RUN: owned/isolation/no-op regressions in `tests/workerCommand.roundtrip.test.ts`.
- PENDING: typecheck, lint, build, CI and live 2,000+ settler latency and timeout measurements.
