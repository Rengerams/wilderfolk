# Manual save rejected while simulation worker is busy

- Bug: saving an active colony can time out waiting for an idle worker and display "Save not written — simulation worker did not confirm the current world"
- Status: investigating — targeted code and regression tests committed; CI/browser confirmation pending
- Severity: critical (save availability; potential loss of in-session progress)
- Date discovered: 2026-10-29
- Version/build: 0.6.5.2 (source inspected on main at report time)
- Reporter: owner screenshot during a ~2,022-settler colony; related worker logs show repeated stalled commands and worker restart
- Area: GameLoop, simulation worker command queue, persistence
- Owner module: `src/game/gameLoop.ts` (save-export coordination); `src/hooks/useGamePersistence.ts` remains the sole persistence writer
- Related PR: `fix/worker-save-quiescence-20261029`
- Related historical reports: `docs/BUG_REPORTS/2026-10-01-save-crashes-after-worker-stall.md` (old host race); `docs/BUG_REPORTS/2026-10-20-command-preview-and-worker-recovery-freezes.md` (command/fallback stalls)

## Status history

- 2026-10-29 — open: screenshot shows a red save-refusal toast in a 2,000+ resident settlement; prior diagnostics show a long-running command, 0 ticks/s at 10×, and worker recovery
- 2026-10-29 — investigating: static trace found the save waits for `host.whenIdle()` while `frameBody` can still submit new worker ticks. It also doesn't explicitly await commands already queued on `commandChain`.
- 2026-10-29 — investigating: barrier and four regression cases committed; no claim that the live worker bottleneck is solved

## Observed behavior

A manual save refuses with: `Save not written — simulation worker did not confirm the current world. Please retry.` This originates from `persistGameOnce` when `loop.lastExportWasDegraded()` reports a failed worker snapshot; no storage write occurs. The specific screenshot does not distinguish a `whenIdle` timeout from an export timeout or an intervening worker restart.

## Expected behavior

On user save, stop scheduling new ticks, allow any command queued before save to complete, then export a genuinely worker-acknowledged world. If the worker stays stalled, times out or is replaced during the save, refuse the write and preserve the previous save instead of silently substituting the display world.

## Reproduction steps

1. In a large running settlement, queue a worker tick or an expensive staffing/demolition command.
2. Request a manual save before the worker becomes idle.
3. The old loop continues admitting worker ticks, and `exportAuthoritativeWorld` waits on `whenIdle`, potentially exhausting its limited budget; `persistGameOnce` refuses the stale snapshot.
4. Focused regressions instead hold an in-flight idle wait and assert zero new tick requests; queued command ordering and worker replacement/recovery refusal are also asserted.

## Evidence

- `src/hooks/useGamePersistence.ts`: calls `exportAuthoritativeWorld`, checks `lastExportWasDegraded`, and refuses the write with the exact toast.
- `src/game/gameLoop.ts`: worker save calls `whenIdle`; frame dispatch formerly had no save barrier; `commandChain` held previously requested worker commands.
- `src/game/simWorker/GameWorkerHost.ts`: `isIdle` requires no ticks or pending command/export; `exportSave` returns the worker's authoritative world.
- Prior console evidence includes `Worker command timed out — recovering simulation worker` with a command in flight for ~30 seconds. The command's specific identity at the save screenshot is unknown.

## Root cause

A verified concurrency hazard: the main-thread tick scheduler was not quiesced while waiting for save export, and the save did not explicitly serialize behind the pre-existing command chain. A second verified safety hazard reset the degraded flag if the worker was lost during an export; this could permit an unconfirmed display shadow to be written.

## Fix / proposed fix

`GameLoop.exportAuthoritativeWorld` now holds new tick submissions, waits for already queued commands before worker idle, and maintains the hold through confirmed export. It refuses to treat mid-export worker loss or ongoing recovery as valid authority. This preserves the existing `persistGameOnce` refusal for truly stalled workers. No new persistence writer or changed save format.

## Save/migration impact

None. Previously saved slots remain unchanged; failed exports do not overwrite them.

## Verification result

- PASS (static): source trace, handler ordering, ownership and refusal behavior.
- ADDED, NOT RUN LOCALLY: `tests/gameLoop.test.ts` includes tick-quiescence, queued-command, mid-export worker loss and recovery-in-progress cases.
- PENDING: Node CI, unit tests and large-colony browser replay; verify save succeeds after transient congestion but still refuses a truly unresponsive worker.
