# Malformed worker deltas leave the replica stale

- Bug: The host applied worker deltas without validating the protocol or catching an application failure, after already decrementing in-flight counters and clearing request state.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-06
- Version/build: 0.6.5.1
- Reporter: Independent code review (user-supplied finding)
- Area: Simulation worker transport
- Owner module: `simWorker/GameWorkerHost.ts`; `simBuffers/simDelta.ts`
- Related PR/commit: none

## Status history
- 2026-11-06 — open: review found unchecked `applySimTickDelta` calls and bookkeeping before validation.
- 2026-11-06 — resolved: protocol guard added, application wrapped, faults settle the request and trigger recovery; types/lint/targeted tests pass.

## Observed behavior
`handleMessage` cast `msg.delta` and called `applySimTickDelta` directly. `applySimTickDelta` throws for a wrong protocol version. A throw inside the tick branch escaped after `ticksInFlight` had been decremented and before `onTickResult`; a throw in the command branch escaped after `pendingCommand` had been cleared. The host could stay marked ready while the display replica was stale, with no worker fault raised.

## Expected behavior
Validate the reply envelope before changing bookkeeping. If a delta still cannot be applied, settle the pending request and invoke the worker fault/recovery path instead of leaving the host silently unusable.

## Reproduction steps
1. Send a tick or command reply whose delta has an old/wrong `proto`.
2. Observe that the host has already cleared counters/request state and does not raise a fault; the replica is not advanced.

## Evidence
`applySimTickDelta` throws `Invalid SimTickDelta protocol` when `delta.proto !== SIM_DELTA_PROTO`. The tick branch decremented `ticksInFlight` first; the command branch nulled `pendingCommand` first.

## Root cause
The transport treated worker payloads as trusted TypeScript values and relied on bookkeeping being unconditional rather than on validation succeeding.

## Fix / proposed fix
Add `isSimTickDelta` as the boundary guard. Run it before counters/request state change. Wrap application and hydration in try/catch; on failure log the fault, settle/reject the pending request, reset tick accounting and call the worker fault handler. Also check the render `schemaVersion` before adopting a buffer and return rejected buffers to the pool.

## Save/migration impact
None.

## Verification result
PASS: new `tests/simDelta.guard.test.ts`; `npm run test:types`, `npm run lint`, targeted worker suites and build.
