# Render-enabled worker stress harness fails to return leases

- Bug: Render stress measurements can exhaust the pool because the harness never returns transferred render buffers.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-02
- Version/build: main at 7d6a1b2da8570f079abad09613adf69f97778b47
- Reporter: code review and uploaded repair plan
- Area: worker transport and simulation recovery
- Owner module: `scripts/repro-worker-stall.mts`
- Related PR/commit: branch `fix/worker-sync-buffer-safety-20261102`

## Status history
- 2026-11-02 — investigating: source defect confirmed and proposed repair committed; CI and runtime verification not yet completed.
- 2026-11-02 — resolved: merged into `main`; a 5,000-tick render-enabled run received and returned every lease with zero pool exhaustion.
- 2026-11-07 — resolved: the lease protocol added in commit c3eafff8 made the harness's index-only return stale, so every slot leaked again after five acquisitions; the harness now requires and echoes the lease.

## Observed behavior
Render stress measurements can exhaust the pool because the harness never returns transferred render buffers.
On the 2026-11-07 tree the pool exhausts again after five ticks: the harness still returns by index alone, while
`RenderBufferPool.release` now ignores a return whose lease does not match, so `acquire()` returns null and the
worker reports "Render buffer pool exhausted". The scripts type check also rejects the request (`bufferLease` required).

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
It also requires the response's `bufferLease` and echoes it, matching `GameWorkerHost.returnRenderBuffer`, which refuses a lease-less return.

## Save/migration impact
None. Existing saved world data is not migrated.

## Verification result
- `TICKS=5000 npx tsx scripts/repro-worker-stall.mts` — PASS: requested 5000, results 5000, errors 0, buffers received 5007 / returned 5007, failures 0, max outstanding 1, no pool-exhaustion error, p99 inter-result gap 27.6 ms, exit code 0.
- `npm run test:types` — PASS; `npm run lint` — PASS (0 errors); `npm run build` — PASS.
- CI: not run in this session.
- 2026-11-07 re-verification: `TICKS=200 npx tsx scripts/repro-worker-stall.mts` — PASS: 200/200 results,
  0 errors, 200 buffers received / 200 returned, 0 return failures, max outstanding 1, no pool-exhaustion
  error; `node scripts/test.mjs scripts-types`, `npm run test:types`, `npm run lint` and `npm run build` pass.
