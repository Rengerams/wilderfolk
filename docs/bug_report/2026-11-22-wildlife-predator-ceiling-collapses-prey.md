# Predator breeding ceiling collapses the prey base

- Bug: Wolf breeding capacity (25) and the prey replenishment floor live in two owners, and the pack settles on that ceiling while rabbits reach zero and deer nearly vanish.
- Status: open
- Severity: medium
- Date discovered: 2026-11-22
- Version/build: V.0.6.5.1 / `audit-simulation-logic` @ `ecd9866c`
- Reporter: simulation-logic audit 2026-11-22 (`docs/plans/simulation-logic-audit-2026-11-22.md`, F-01)
- Area: Wildlife and ecology
- Owner module: `src/game/tickLayerSystems.ts` (breeding capacity) and `src/game/worldGen.ts` (replenishment)
- Related PR/commit: none yet

## Status history
- 2026-11-22 — open: measured in two passive full-year harness runs; not yet assigned.

## Observed behavior

A passive 90-day run carries no rabbits and almost no deer while wolves sit exactly on their
breeding cap:

| Seed | Rabbits | Deer | Wolves | Foxes | Grass |
|---|---|---|---|---|---|
| 12345 | 0 | 7 | 25 | 1 | 136 |
| 777 | 0 | 1 | 25 | 2 | 127 |

The 360-day run at seed 12345 ends with the same pattern. Hunting spots therefore have no rabbits
to hunt for most of the year, and the ecology stage reads a collapsed prey base.

## Expected behavior

The predator population should track the prey the map can feed. The replenishment owner treats 10
wolves as a full pack, so a stable pack should settle near that number, not at 2.5× it, and rabbits
should persist on the map between replenishment pulses.

## Reproduction steps

1. `node_modules/.bin/tsx scripts/run-full-year.mts --days=90 --seed=12345`
2. Read the final `animals.wildlife` block of the completion line: rabbits 0, deer 7, wolves 25.
3. Repeat with `--seed=777`: rabbits 0, deer 1, wolves 25.

## Evidence

- `src/game/tickLayerSystems.ts:772-781` — breeding ceiling decided inline per species:
  rabbit 120, deer 60, wolf 25, all others 35.
- `src/game/worldGen.ts:359-367` — replenishment thresholds: rabbit target 150, deer 45,
  wolf target 10; `worldGen.ts:363` caps a pulse at 16 prey.
- `src/game/dailyWorldEvents.ts:181-182` — replenishment runs every third colony day at 18:00.
- Harness output above: both seeds reach wolf 25 with rabbits 0, invariant violations 0.

## Root cause

Two owners decide population limits. The inline wolf ceiling (25) is 2.5× the replenishment target
(10), so wolves breed up to a level the 16-rabbit-per-three-days floor cannot feed; the floor is
consumed within days and the prey population sits at zero between pulses. The rabbit target (150)
also sits above the rabbit breeding ceiling (120), so recovery overshoots the ceiling and breeding
stalls until attrition brings the herd back under it.

## Fix / proposed fix

Move both the ceiling and the replenishment target into `speciesConfig.ts` as named tuning values,
keep `target ≤ cap`, and gate predator breeding on the actual prey count (reuse the existing
`capacityFactor` shape against the food base) so a pack cannot saturate beyond what the map feeds.
No new scheduler; both callers keep their current cadence.

## Save/migration impact

None expected — both owners read existing entity state; no saved fields change.

## Verification result

- Reproduction: PASS — both harness seeds above show rabbits 0 / wolves 25.
- Fix: NOT IMPLEMENTED.
- Regression coverage: NOT RUN (no fix).
