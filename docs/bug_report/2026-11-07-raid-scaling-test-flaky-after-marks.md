# Raid-scaling test became flaky after personal marks entered defence

- Bug: The raid-pressure test compared three village sizes but built each village from a random map seed, so the settlers' personal marks and the juvenile count differed between the three, and the defence-to-attack spread crossed its 0.01 threshold in about two of five runs.
- Status: resolved
- Severity: low (test-only flake; no player-facing behaviour)
- Date discovered: 2026-11-07
- Version/build: 0.6.5.1
- Reporter: owner-supplied unit-suite output
- Area: test suite — frontier raid scaling
- Owner module: `tests/frontierCombat.raidGold.test.ts` (`raidFixture`)
- Related PR/commit: 1d3bfe12 gave the `defense` activity mark weights; the fixture still normalised only genomes

## Status history
- 2026-11-07 — open: full-suite run failed one assertion; the same file failed 5 of 12 isolated runs.
- 2026-11-07 — resolved: the fixture seeds `initGame` and normalises marks and juvenile status; 20/20 isolated runs pass.

## Observed behavior
`a raid scales with the village it is aimed at > keeps the defence-to-attack ratio flat` fails at
`expect(Math.max(...ratios) - Math.min(...ratios)).toBeLessThan(0.01)` with a spread of 0.0231.
The failure is intermittent: 5 failures in 12 isolated runs of the same file on unchanged source.

## Expected behavior
The test's own contract: with the same seed, only the number of mustered adults changes between the
three villages, so the defence-to-attack ratio stays flat and population growth never makes a raid a
walkover.

## Reproduction steps
1. Run `npx vitest run tests/frontierCombat.raidGold.test.ts` repeatedly on the unfixed source.
2. Roughly 40% of runs fail the spread assertion with values around 0.023 versus the 0.01 threshold.

## Evidence
- `worldGen.initGame` computes `seed ?? Math.floor(nativeRandom() * 1_000_000)`, so the fixture's
  `initGame({ skipTerrain: true })` reseeds every world from native randomness — the test's
  `setSimSeed(11)` is overwritten inside `initGame`.
- `personalMarks.rollBornMarks` draws from that map seed's `settlerMarks` stream, and the `defense`
  activity carries mark weights (`lucky` +0.20, `scarred` +0.30, `sickly` −0.25) that
  `militiaBalance.computeMilitiaBreakdown` applies per soldier.
- World generation creates juvenile settlers; `canBeMustered` excludes them, yet the fixture counted
  them toward `adults`.
- The fixture normalised `genomeV2` only, so both inputs above still varied between the three worlds.

## Root cause
The fixture assumed "same seed ⇒ same settlers" but never seeded `initGame`, and after personal marks
became a defence input it normalised only one of the three per-person inputs.

## Fix / proposed fix
`raidFixture` passes a fixed `FIXTURE_SEED` to `initGame`, and normalises `marks` to none and
`isJuvenile` to false alongside the neutral genome and Soldier job. Defence then depends only on the
mustered count, which is exactly what the test measures.

## Save/migration impact
None; test-only change.

## Verification result
- `npx vitest run tests/frontierCombat.raidGold.test.ts` ×20 after the fix — PASS, 0 failures
  (5/12 failed before).
- Full unit suite after the fix — the raid file passes inside the run; the run's single failure was the unrelated
  full-year marriage assertion in `tests/fullYear.integration.test.ts`, handled separately.
- `npm run test:types` — PASS; `npm run lint` — PASS.
