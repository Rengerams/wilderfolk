# Worker fault replays commands the worker already applied

- Bug: A worker fault can replay an unconfirmed command on the main thread, double-debiting resources or starting the same building twice.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit
- Reporter: full-audit simulation pass (SIM-08)
- Area: simulation worker transport
- Owner module: `gameLoop.ts`, `simWorker/GameWorkerHost.ts`, `simWorker/gameWorker.ts`, `simWorker/protocol.ts`
- Related PR/commit: this branch

## Status history
- 2026-11-07 — open: audit traced the replay of all optimistic commands on a non-command fault.
- 2026-11-07 — resolved: monotonic command ids, worker echo and filtered replay.

## Observed behavior
`fallbackFromWorker` re-queued every optimistic command unless the fault came from a command. A worker that applied a command but did not post its result left the host replaying work the authoritative world already contained.

## Expected behavior
A fault replays only commands the worker proves it never applied.

## Reproduction steps
1. Queue two demolitions while the worker is busy.
2. Fire a general fault with the first command's id as the worker's last applied id.
3. Before the fix both commands were re-queued; after the fix only the second is.

## Evidence
`tests/gameLoop.test.ts` — “replays only commands the worker did not prove it applied”.

## Root cause
No command identity crossed the protocol, so the host could not distinguish applied from merely optimistic work.

## Fix / proposed fix
`WorkerCommand` carries a host-assigned monotonic `commandId`; the worker records the last applied id and echoes it on tick results, command results and faults; the host forwards it and the fallback keeps only ids above it. Command faults still discard the in-flight command.

## Save/migration impact
None; ids are transport-only and never persisted.

## Verification result
- `npx vitest run tests/gameLoop.test.ts` — PASS.
- `npm run test:types` — PASS.
- `npm run lint` — PASS.
