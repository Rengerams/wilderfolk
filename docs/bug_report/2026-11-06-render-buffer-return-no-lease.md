# Render-buffer returns are not lease-safe

- Bug: The worker released a render slot from a returned numeric `bufferIndex` without verifying that the returned buffer belonged to the current acquisition, so a delayed or duplicate return could free a slot already reused.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-06
- Version/build: 0.6.5.1
- Reporter: Independent code review (user-supplied finding)
- Area: Simulation worker render transfer
- Owner module: `simBuffers/renderBufferPool.ts`, `simWorker/gameWorker.ts`, `simWorker/GameWorkerHost.ts`, `simWorker/protocol.ts`
- Related PR/commit: none

## Status history
- 2026-11-06 — open: review found the unchecked return path.
- 2026-11-06 — resolved: every acquisition gets a lease; returns carry it and are ignored unless it matches.

## Observed behavior
`RenderBufferPool.release(index, buffer)` only checked `outbound[index]`. Because the slot is marked outbound again on the next acquisition, a duplicate return for the earlier lease was accepted and marked the slot free while main still held the reused buffer.

## Expected behavior
A return frees a slot only when it belongs to that slot's current acquisition.

## Reproduction steps
1. Acquire slot 0 (lease A), return it, then acquire slot 0 again (lease B).
2. Send the delayed return for lease A.
3. Before the fix the pool reported slot 0 free while lease B's buffer was still in use.

## Evidence
The protocol carried only `bufferIndex`; the pool had no per-acquisition identity.

## Root cause
Slot identity was treated as sufficient, but a fixed-size pool reuses slots and therefore needs generation/lease identity.

## Fix / proposed fix
Add a monotonic lease to `AcquiredRenderBuffer`, carry `bufferLease` on tick/command render responses and `returnBuffer`, and reject returns whose lease does not match the slot. Keep the existing size check and replacement behaviour.

## Save/migration impact
None; protocol shape only, same build on both sides.

## Verification result
PASS: new stale-lease regression in `tests/renderBufferPool.stress.test.ts`; `npm run test:types`, `npm run lint`, worker seed/transport suites and build.
