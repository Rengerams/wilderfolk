# Bug: Long-horizon simulation is not fully replayable from a world seed

- Status: resolved — same seed reproduces a 100-tick replay deterministically
- Date discovered: 2026-08-22
- Version/build: Wilderfolk v0.6.3 development working tree
- Area: simulation | determinism | invariant validation

## Status update — 2026-08-24

Implemented `src/game/simRng.ts` (per-owner seeded streams + stateless context rolls) and migrated the core world-building owners: `worldGen`, `terrainGen`, `entityFactory`, and `migration`. `initGame({ seed })` now seeds terrain and spawning.

The long-replay blocker was found and fixed: ambient/social chat draws consumed the shared global `Math.random` stream. Because chat call order can differ slightly between runs, the same random values shifted the stream and later changed wildlife movement. All chat/social flavor draws (`humanChat.ts`, `humanTick.ts`) now use `seededRandomForRun(salt)` — stateless rolls keyed by entity id + tick — so they cannot shift the simulation stream. `tests/deterministicSeed.test.ts` now proves **same seed → identical 100-tick replay** (previously diverged at tick ~20).

`nameLoader` intentionally stays on `Math.random` (worker-transform incompatibility); names are cosmetic and excluded from the replay snapshot.

## Observed behavior

The long-horizon invariant harness previously used ambient `Math.random()` for extra settler placement and for simulation paths reached during initialization and daily ticks. A seeded terrain map alone does not guarantee that the complete simulation run is reproducible.

## Impact

When a family, wildlife, combat, migration, or economy invariant fails after many ticks, the failure cannot be reliably replayed unless the same random sequence is restored. This increases debugging time and makes long-run balance measurements noisy.

## Implemented mitigation

`scripts/sim-invariants.ts` now accepts `SIM_SEED` and defaults to a documented fixed seed (`12345`). It installs a local deterministic PRNG for the duration of the harness run, includes the seed in success and invariant-failure output, and restores the original `Math.random` implementation in a `finally` block. This is deliberately harness-scoped and does not change Simulation Authority or production gameplay behavior.

Example:

```text
SIM_YEARS=3 SIM_SEED=12345 npx tsx scripts/sim-invariants.ts
```

## Remaining work

D1 is functionally complete: the production simulation now owns a seeded global `Math.random` fallback and per-owner streams for world building, plus context-seeded chat/social rolls. Optional future polish: include the run seed in save/replay metadata UI and migrate the remaining gameplay owners (combat, reproduction, economy) from the global fallback to named per-owner streams so subsystem isolation is explicit.

## Required verification

Run the harness twice with the same `SIM_YEARS`, `SIM_BUILD`, and `SIM_SEED` values and compare the reported outcome or first failure. Run a second seed to confirm that the seed is actually controlling the random sequence. Preserve first-failure reporting and fail immediately on invariant violations.

## Related files

- `scripts/sim-invariants.ts`
- `src/game/worldGen.ts`
- `src/game/terrainGen.ts`
- `src/game/nameLoader.ts`
- `BUG_REPORTS/2026-08-22-worker-transport-timeout.md`
