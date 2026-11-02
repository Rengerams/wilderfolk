# Render pool retains buffers larger than the schema

- Bug: An oversized returned ArrayBuffer is accepted and remains in the fixed-size transfer pool.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-02
- Version/build: main at 7d6a1b2da8570f079abad09613adf69f97778b47
- Reporter: code review and uploaded repair plan
- Area: worker transport and simulation recovery
- Owner module: `simBuffers/renderBufferPool.ts`
- Related PR/commit: branch `fix/worker-sync-buffer-safety-20261102`

## Status history
- 2026-11-02 — investigating: source defect confirmed and proposed repair committed; CI and runtime verification not yet completed.
- 2026-11-02 — resolved: merged into `main`; exact-length acceptance and the 200,000-cycle capacity regression pass.

## Observed behavior
An oversized returned ArrayBuffer is accepted and remains in the fixed-size transfer pool.

## Expected behavior
Only byteLength exactly equal to renderBufferByteLength() should be reused.

## Reproduction steps
1. Use the inspected version and the real worker/fallback code.
2. Acquire a buffer, release a new ArrayBuffer with one extra byte, then reacquire the same slot; pre-fix byteLength differs from the schema.
3. Compare the ordering, capacity, world tick and/or pending simulation debt against the expected contract.

## Evidence
RenderBufferPool.release previously treated every byteLength greater than or equal to the expected schema length as valid.

## Root cause
RenderBufferPool.release previously treated every byteLength greater than or equal to the expected schema length as valid.

## Fix / proposed fix
Release now replaces any mismatched buffer, including undersized and oversized returns. Added 200,000-cycle capacity and invalid-release regression.

## Save/migration impact
None. Existing saved world data is not migrated.

## Verification result
- `npx vitest run tests/renderBufferPool.stress.test.ts` — PASS (undersized, oversized, detached and invalid returns replaced; capacity survives 200,000 cycles).
- `npm run test:types` — PASS; `npm run lint` — PASS (0 errors); `npm run build` — PASS.
- CI: not run in this session.
