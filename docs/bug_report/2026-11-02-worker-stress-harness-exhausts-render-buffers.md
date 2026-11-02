# Render-enabled worker stress harness fails to return leases

- Bug: Render stress measurements can exhaust the pool because the harness never returns transferred render buffers.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-02
- Version/build: main at 7d6a1b2da8570f079abad09613adf69f97778b47
- Reporter: code review and uploaded repair plan
- Area: worker transport and simulation recovery
- Owner module: `scripts/repro-worker-stall.mts`
- Related PR/commit: branch `fix/worker-sync-buffer-safety-20261102`

## Status history
- 2026-11-02 — investigating: source defect confirmed and proposed repair committed; CI and runtime verification not yet completed.

## Observed behavior
Render stress measurements can exhaust the pool because the harness never returns transferred render buffers.

## Expected behavior
Every received buffer must be returned with a transferable and the harness must report failed or outstanding returns.

## Reproduction steps
1. Use the inspected version and the real worker/fallback code.
2. Start the real render-enabled worker and send more ticks than available pool slots; without returns, subsequent worker ticks fail with pool exhaustion.
3. Compare the ordering, capacity, world tick and/or pending simulation debt against the expected contract.

## Evidence
Both tickResult and commandResult paths discard the bufferIndex and renderBuffer without sending returnBuffer.

## Root cause
Both tickResult and commandResult paths discard the bufferIndex and renderBuffer without sending returnBuffer.

## Fix / proposed fix
The harness now returns tick and command buffers, counts arrivals/returns/failures, validates real export acknowledgement, and avoids repeated same-tick command submission.

## Save/migration impact
None. Existing saved world data is not migrated.

## Verification result
- Code inspection: completed.
- Regression source: `scripts/repro-worker-stall.mts`.
- Types, lint, build, runtime stress, and CI: NOT RUN as of report creation.
