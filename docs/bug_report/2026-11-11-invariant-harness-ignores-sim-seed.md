# Invariant harness ignores requested SIM_SEED when generating the world

- Bug: Invariant harness ignores requested SIM_SEED when generating the world.
- Status: resolved — explicit world seed verified by required calendar scheduler gate
- Severity: high
- Date discovered: 2026-11-11
- Version/build: V.0.6.5.2 development, main 926eb5f
- Reporter: supplemental simulation audit
- Area: simulation integration tests and determinism
- Owner module: `scripts/sim-invariants.ts — main`
- Related PR: https://github.com/Rengerams/wilderfolk/pull/141

## Status history
- 2026-11-11 — investigating: source-level contract mismatch confirmed; minimal test/harness correction committed.
- 2026-11-11 — resolved: required calendar gate 43005607966 passed with explicit seed and Year-2 invariant run.

## Observed behavior
The harness reads SIM_SEED and installs a seeded Math.random, but calls `initGame` without its `seed` option. `worldGen.initGame` obtains an unseeded map seed with `nativeRandom()`. `simRng.nativeRandom` uses Math.random captured before the harness changes it, so a repeated SIM_SEED run is not guaranteed to create the same map or event sequence.

## Expected behavior
The SIM_SEED option must select the actual simulation seed and map seed reproducibly.

## Reproduction steps
1. Read scripts/sim-invariants.ts before this fix: initGame({ villageName: 'Invariantville', size: MapSize.Medium }).
2. Follow worldGen.initGame: mapSeed = seed ?? floor(nativeRandom() * 1_000_000).
3. Follow simRng.nativeRandom: returns NATIVE_MATH_RANDOM, captured at module import.
4. The harness's Math.random reassignment does not change that captured function.

## Evidence
Inspected `main` at `926eb5f` and the source paths above. This is a deterministic source-level audit, not a claimed execution of the failing fixture.

## Root cause
A seeded global RNG override was mistaken for the explicit world/map seed required by worldGen.

## Fix / proposed fix
Pass `seed: SEED` directly to `initGame` without changing the simulation RNG or gameplay owners.

## Save/migration impact
None. Only test/harness logic changes; no gameplay state, persisted schema, or user-facing balance changes.

## Verification result
PASS: Required calendar scheduler workflow [43005607966](https://github.com/Rengerams/wilderfolk/actions/runs/43005607966) ran the corrected invariant harness through the Year-2 boundary. PASS: Node.js CI [43005608136](https://github.com/Rengerams/wilderfolk/actions/runs/43005608136). A repeated two-run seed comparison was not separately performed; the explicit seed source contract is now deterministic.
