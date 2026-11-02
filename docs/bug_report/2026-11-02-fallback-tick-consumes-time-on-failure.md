# Failed fallback tick consumes accumulated simulation time

- Bug: A failed local fallback tick reduces tickAccumulator despite rolling the world back.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-02
- Version/build: main at 7d6a1b2da8570f079abad09613adf69f97778b47
- Reporter: code review and uploaded repair plan
- Area: worker transport and simulation recovery
- Owner module: `gameLoop.ts`
- Related PR/commit: branch `fix/worker-sync-buffer-safety-20261102`

## Status history
- 2026-11-02 — investigating: source defect confirmed and proposed repair committed; CI and runtime verification not yet completed.
- 2026-11-02 — resolved: merged into `main`; the fallback regression proves retained debt, one attempt per frame and one successful recovery tick.

## Observed behavior
A failed local fallback tick reduces tickAccumulator despite rolling the world back.

## Expected behavior
Only a successful fallback tick may consume the accumulated time; no unbounded same-frame retry.

## Reproduction steps
1. Use the inspected version and the real worker/fallback code.
2. Inject a gameTick that mutates resources then throws, force the unsupported-worker fallback and inspect tickAccumulator after multiple frames.
3. Compare the ordering, capacity, world tick and/or pending simulation debt against the expected contract.

## Evidence
GameLoop.frameBody debits msPerTick before inspecting stepFallbackTick's boolean success result.

## Root cause
GameLoop.frameBody debits msPerTick before inspecting stepFallbackTick's boolean success result.

## Fix / proposed fix
The accumulator debit now follows the success guard. The rollback test checks retained debt, one retry per frame and one successful recovery tick.

## Save/migration impact
None. Existing saved world data is not migrated.

## Verification result
- `npx vitest run tests/gameLoop.fallbackTickRollback.test.ts` — PASS (failed tick keeps the world and accumulator unchanged; the next success spends exactly one slot).
- `npm run test:types` — PASS; `npm run lint` — PASS (0 errors); `npm run build` — PASS.
- CI: not run in this session.
