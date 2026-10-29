# Worker command timeout replays an unconfirmed operation after recovery

- Bug: a command that did not acknowledge before the worker timeout is automatically replayed on the recovered worker
- Status: investigating — minimal recovery patch and regression committed; CI and large-save browser verification pending
- Severity: high
- Date discovered: 2026-10-29
- Version/build: current `main` before this patch
- Reporter: owner, via live 10× SpeedDiag logs
- Area: simulation worker transport, command recovery, saving
- Owner module: `src/game/gameLoop.ts` (recovery queue), `src/game/simWorker/GameWorkerHost.ts` (timeout message)
- Related: `docs/BUG_REPORTS/2026-10-20-command-preview-and-worker-recovery-freezes.md`, `docs/BUG_REPORTS/2026-10-02-high-speed-tick-rate-shortfall-and-fallback-freeze.md`

## Status history

- 2026-10-29 — investigating: owner logs document no confirmed ticks, a pending command, timeout, automatic recovery and another pending command; source confirms that fallback enqueues all unconfirmed commands again
- 2026-10-29 — proposed patch: on a command-sourced worker fault do not automatically replay the first unconfirmed operation, but keep subsequent queued commands in order; include command operation in timeout message

## Observed behavior

On the owner's large settlement at 10×, SpeedDiag reports 0 achieved ticks/s, `cmd=1`, growing `silentMs`, and `Worker command timed out` after about 30 seconds. The worker restarts, but 0 ticks/s and `cmd=1` recur. The browser also refuses saving an unconfirmed world, correctly protecting authoritative state.

The previously supplied save contains approximately 2,009 settlers and 1,062 buildings. Neither the logs nor static inspection identify the exact slow operation.

## Expected behavior

A transport failure cannot prove whether the unacknowledged command ran on the old worker. The recovered worker must not blindly execute it again. Later commands already queued by the player should remain ordered. Diagnostics must name the failed operation. Worker-owned saves must still require authoritative confirmation.

## Reproduction steps

1. Start a worker-backed game and queue two commands.
2. Let the first command enter `sendCommand`, but withhold its result and fire a `command`-sourced worker fault.
3. Before the patch, `fallbackFromWorker` copies both optimistic commands into its retry queue.
4. After the patch, the unconfirmed first operation is omitted; the second remains queued and may execute after recovery.

## Evidence

`gameLoop.ts` previously copies all `optimisticCommands` into `deferredWorkerCommands` on any worker failure, including a command timeout; the next successful recovery calls `flushDeferredWorkerCommands`. `GameWorkerHost.sendCommand` times out after 30 seconds and signals a command-sourced fault. This proves a replay-loop risk, but not which expensive worker operation first caused the stall.

## Root cause

Confirmed: transport failure caused automatic replay of an operation whose completion was unknown. Not established: why the original command/worker message takes more than 30 seconds on the large settlement.

## Fix / proposed fix

On command-sourced worker faults, discard only the first unconfirmed operation from automatic replay and keep later pending commands in order. Roll the optimistic display back to the last worker-confirmed world as before. Include `cmd.op` in transport timeout messages. This intentionally requires the player to inspect the world before manually retrying the failed operation, to avoid double execution.

## Save/migration impact

None. Save formats and authoritative export safeguards remain unchanged.

## Verification result

- PASS (static): command fault path invokes `fallbackFromWorker`; prior implementation requeued all optimistic requests without distinguishing a failed command
- PENDING: focused `tests/gameLoop.test.ts` on the new head, typecheck, lint, build, and broad CI
- PENDING: owner large-save browser replay and profiling of the command named by the new timeout message
