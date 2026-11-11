# Blueberry world-generation test requires an exact count from random terrain

- Bug: Randomly seeded terrain can reject blueberry candidates, yet the test expects the maximum count on every map.
- Status: investigating — seed and assertions corrected in PR #141, CI pending
- Severity: medium
- Date discovered: 2026-11-11
- Version/build: 0.6.5.2 development, PR #141 (base 926eb5f)
- Reporter: Node.js CI run 42997393594
- Area: world-generation regression tests
- Owner module: `tests/blueberryForaging.test.ts` (the test); gameplay owner `src/game/blueberryForaging.ts`
- Related PR: https://github.com/Rengerams/wilderfolk/pull/141

## Status history
- 2026-11-11 — investigating: full standard Vitest run failed on an unseeded Large map with two blueberry trees rather than the asserted three; test corrected, fresh CI pending.

## Observed behavior
`initGame({size: MapSize.Large})` generates a random seed. `spawnBlueberryTrees` tries to place at most three trees, but rejects unpassable terrain and candidate positions closer than 165 px to an existing blueberry tree. The test assumed the full maximum could always be placed.

## Expected behavior
The test should verify the scarcity cap and ripe yield for valid spawns, not require a precise count independent of terrain. Reproducibility requires a fixed seed.

## Reproduction steps
1. Inspect `tests/blueberryForaging.test.ts` on main 926eb5f, which calls three unseeded `initGame` initializers.
2. Inspect the bounded attempts and terrain/spacing rejections in `blueberryForaging.spawnBlueberryTrees`.
3. Node.js CI run 42997393594, job 130444782583 fails at line 68: expected Large 3 trees, observed 2. Overall suite: 3,275 passed, one failed.

## Evidence
`tests/blueberryForaging.test.ts:68` asserted `toHaveLength(3)`; `src/game/worldGen.ts` chooses `mapSeed = seed ?? Math.floor(nativeRandom() * 1_000_000)`, and the spawn owner allows fewer than its target.

## Root cause
A probabilistic spawn maximum was asserted as an unconditional exact count using a random world seed.

## Fix / proposed fix
Use a fixed test seed, require at least one spawned tree per tested map, assert Medium <= 2 and Large/Huge <= 3, and keep all spawned trees' full-yield check. Production spawn and gameplay balance are unchanged.

## Save/migration impact
None. Test-only correction.

## Verification result
FAIL on unpatched test: Node.js CI 42997393594. NOT RUN on patched test yet; GitHub Actions rerun is pending.
