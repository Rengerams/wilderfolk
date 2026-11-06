# Worker feature and render-schema headers were carried but not checked

- Bug: `init.features` was never compared with the features the worker actually offers, and the host adopted render data without checking the response-level `schemaVersion`.
- Status: resolved
- Severity: low
- Date discovered: 2026-11-06
- Version/build: 0.6.5.1
- Reporter: Independent code review (user-supplied finding)
- Area: Simulation worker handshake / render compatibility
- Owner module: `simWorker/gameWorker.ts`, `simWorker/GameWorkerHost.ts`
- Related PR/commit: none

## Status history
- 2026-11-06 — open: review identified both compatibility gaps.
- 2026-11-06 — resolved: both guards implemented.

## Observed behavior
The host sends `features: ['renderSoA_v1']`, and the worker emitted a `ready` list, but the worker never validated the request against what it could provide. The `schemaVersion` field on tick/command responses was likewise ignored by the host before creating the render reader.

## Expected behavior
A worker must reject a request for a feature it does not offer, and the host must not interpret render bytes written under a different schema.

## Reproduction steps
1. Send `init` with a feature the worker does not offer; before the fix the worker still answered `ready`.
2. Send a render buffer with a mismatched `schemaVersion`; before the fix the host still adopted it.

## Evidence
`assertWorkerFeatures` existed but had no worker-side caller. `RENDER_SOA_VERSION` was available to the host but not compared with `msg.schemaVersion`.

## Root cause
The handshake fields were defined for forward compatibility but only partly enforced.

## Fix / proposed fix
Validate `msg.features` against the worker's offered list before resetting the session. On the host, compare `schemaVersion` with `RENDER_SOA_VERSION`; on mismatch, log a fault, return the buffer to the pool and continue without render data.

## Save/migration impact
None.

## Verification result
PASS: `tests/gameWorker.transport.test.ts`, `tests/gameWorker.seed.test.ts`, `npm run test:types`, `npm run lint` and build.
