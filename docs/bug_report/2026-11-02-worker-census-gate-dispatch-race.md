# Worker census gate dispatch race

- Bug: An incoming init or tick can run while the full names census is still loading.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-02
- Version/build: main at 7d6a1b2da8570f079abad09613adf69f97778b47
- Reporter: code review and uploaded repair plan
- Area: worker transport and simulation recovery
- Owner module: `simWorker/gameWorker.ts`
- Related PR/commit: branch `fix/worker-sync-buffer-safety-20261102`

## Status history
- 2026-11-02 — investigating: source defect confirmed and proposed repair committed; CI and runtime verification not yet completed.
- 2026-11-02 — resolved: merged into `main` and verified with the gate regressions plus the standard typecheck, lint and build gates.

## Observed behavior
An incoming init or tick can run while the full names census is still loading.

## Expected behavior
Dispatch must await the shared census-load promise; rejected admission must not execute any worker action.

## Reproduction steps
1. Use the inspected version and the real worker/fallback code.
2. Send init and tick immediately after worker bootstrap with a deliberately delayed census-load promise. Before the change, the worker emits ready and can tick before the promise settles.
3. Compare the ordering, capacity, world tick and/or pending simulation debt against the expected contract.

## Evidence
The message receiver launches ensureNamePoolSettled() in an unawaited async closure and immediately enters the dispatch switch.

## Root cause
The message receiver launches ensureNamePoolSettled() in an unawaited async closure and immediately enters the dispatch switch.

## Fix / proposed fix
The onmessage receiver is now async and awaits ensureNamePoolSettled before dispatch. Existing seed, parity and profiling tests await the receiver; dedicated gate and rejected-load regressions were added.

## Save/migration impact
None. Existing saved world data is not migrated.

## Verification result
- `npx vitest run tests/gameWorker.namePool.dispatchGate.test.ts tests/gameWorker.seed.test.ts tests/gameWorker.profilerStop.test.ts tests/scentGrid.rollback.test.ts tests/saveLoad.workerRngSnapshot.test.ts` — PASS (gate: no dispatch while pending, arrival order kept, rejected load executes nothing).
- `npm run test:types` — PASS; `npm run lint` — PASS (0 errors); `npm run build` — PASS.
- `npx tsx scripts/worker-boundary-audit.mts` — unchanged from the pre-change `main` baseline (13 measured differences, 4 pre-existing unexplained, none admissibility-related).
- CI: not run in this session.
