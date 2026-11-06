# Node worker transfer fallback can reuse detached buffers

- Bug: The Node worker caught a failed `parentPort.postMessage()` with transfer and retried the same message without transfer, although the first attempt may have partially detached buffers.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-06
- Version/build: 0.6.5.1
- Reporter: Independent code review (user-supplied finding)
- Area: Node simulation worker transport
- Owner module: `simWorker/gameWorker.node.ts` (`postMessagePolyfill`)
- Related PR/commit: none

## Status history
- 2026-11-06 — open: review found the clone fallback after an ambiguous transfer failure.
- 2026-11-06 — resolved: the fallback was removed; failure now reports a worker fault.

## Observed behavior
The pool marks a buffer as outbound when acquired. If transfer threw after detaching an `ArrayBuffer`, the fallback posted the same graph by structured clone; the host could receive a detached/invalid render buffer while the worker-side pool still considered the transfer successful.

## Expected behavior
After an ambiguous transfer failure, never post the same graph again. Either rebuild from owned data or report a fatal worker fault so the host can recover and the pool is rebuilt.

## Reproduction steps
1. Force `parentPort.postMessage(message, transfer)` to throw after detaching a buffer.
2. Observe the old fallback calling `parentPort.postMessage(message)` with the detached buffer still referenced.

## Evidence
The catch block logged a warning and retried without transfer. `RenderBufferPool` had already marked the slot outbound before packing/transfer.

## Root cause
The fallback assumed a failed transfer left the object graph intact, which is not guaranteed.

## Fix / proposed fix
Do not retry. Report the failure through `postStartupError` so the host handles it as a worker fault; the worker session is rebuilt rather than fed a possibly invalid buffer.

## Save/migration impact
None.

## Verification result
PASS: `npm run test:types`, `npm run lint`, worker suites and build. The Node worker transport itself is exercised by the worker harness, not by a synthetic detachment unit test.
