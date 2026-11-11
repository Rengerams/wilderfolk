# Wildkin grazer branch corrupts carnivore energy

- Bug: Wildkin with a meat-only diet still graze grass and gain undefined energy, leaving them NaN-energy and immune to starvation checks.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-11
- Version/build: main at f4564527452bf7a864c1d165096ef46a98acab10
- Reporter: owner
- Area: wildlife metabolism and hunting
- Owner module: tickLayerSystems.ts (behavior), speciesConfig.ts (diet), simulation/simulationEntities.ts (death and hunter tracking)
- Related historical report: docs/BUG_REPORTS/2026-10-09-wildkin-apex-role-and-chronicle.md

## Status history
- 2026-11-11 — open: live wildlife still treats Wildkin as grazer although the species diet is carnivorous.
- 2026-11-11 — investigating: proposed code and regression added; actual CI verification pending.

## Observed behavior
The wildlife grazer block calls `entity.energy + config.energyGain['grass']` for Wildkin, while the species defines only `deer` and `rabbit`. That sum becomes NaN, and the starvation check `energy <= 0` evaluates false. Wildkin are also absent from the hunt branch despite a nonzero hunt range, and from the predators collected by the game tick.

## Expected behavior
Wildkin hunt deer and rabbits through the existing wildlife predator path. They neither graze nor flee from predators. Dead/invalid fauna are cleaned up by the existing death transition, including the Wildkin Chronicle event.

## Reproduction steps
1. Create a hungry Wildkin beside live grass, with the main branch species config.
2. Run a wildlife systems pulse; the old grazing branch consumes grass, adds an undefined grass gain, and writes NaN to Wildkin energy.
3. Subsequent `energy <= 0` and hunger comparisons fail for NaN, preventing ordinary starvation.

## Evidence
`speciesConfig.ts` defines `energyGain: { deer: 500, rabbit: 200 }` for Wildkin. `tickLayerSystems.ts` includes Wildkin in the herbivore grazing predicate but omits it from the hunter predicate. `grassEcology.ts` retains an obsolete Wildkin grazer-metabolism row. `gameTick.ts` and the hunter-target index omit Wildkin as a predator.

## Root cause
An earlier apex-role data change updated the diet and ecology report, but not all runtime consumers of the old grazer role. No numeric validity guard existed at the starvation boundary.

## Fix / proposed fix
Reuse `tickWildlife` hunting with a Wildkin-only prey list of deer and rabbit. Register it in existing predator and hunter indexes, remove the obsolete grazer and scent configuration, and treat nonfinite energy as death in the same wildlife death path. Do not add a grass key or a second feeding system.

## Save/migration impact
No schema changes. Old saves with invalid Wildkin energy are resolved by the normal wildlife death transition on their next systems pulse, rather than carrying immortal entities indefinitely.

## Verification result
Code-path inspection: confirmed. Focused runtime regression: added in `tests/wildkin.apexRole.test.ts`. TypeScript, lint, build and CI: not yet run.
