# Builder DNA bypassed on build sites without a production job

- Bug: A Resourceful builder raising a house, wall, well or silo received no construction trait factor, because the crew multiplier returned 1 before it reached the construction branch.
- Status: resolved
- Severity: medium
- Date discovered: 2026-10-28
- Version/build: 0.6.5.2 branch `codebot-tasks`, commit `c5c81c5e`
- Reporter: owner code review on PR #90
- Area: construction crews / crew trait multiplier
- Owner module: `src/game/skills.ts` (`getWorkerSkillMultiplier`)
- Related PR/commit: PR #90

## Status history
- 2026-10-28 — open: reported by review as a P1/P2 gap missed by the new integration test, which only exercised an unfinished Farm.
- 2026-10-28 — resolved: construction now resolves its own trade and a house-site regression passes.

## Observed behavior
`getWorkerSkillMultiplier` read `getJobForBuilding(building.type)` first and returned 1 when the site had no job mapping. `BUILDING_JOB_TYPES` has no entry for House, Wall, Well or Silo, so every unfinished site of those types ignored the catalog's `work`/`builder`/`construction` effect, while `dailyBuildingEconomy.tickBuildingProduction` still called the helper with `'construction'` for them.

## Expected behavior
The construction action prices any build crew with the catalog's builder/construction context, independent of whether the finished site will staff a production job. Non-DNA skill baselines stay as before: the site's own trade when it has one, the Builder trade otherwise.

## Reproduction steps
1. Take an unfinished House with one occupant whose traits are `['resourceful']`.
2. Call `getWorkerSkillMultiplier(state, house, crewMap, 'construction')`.
3. Before the fix it returned 1 instead of the catalog factor (>1).

## Evidence
Review trace on `src/game/skills.ts:113` together with `src/game/dailyBuildingEconomy.ts:256`; `BUILDING_JOB_TYPES[BuildingType.House]` is `undefined`, which the new test asserts as its fixture premise.

## Root cause
The construction branch was reached only after the production-job guard, so a jobless site short-circuited before the trait context was selected.

## Fix / proposed fix
`getWorkerSkillMultiplier` now resolves `skillJob = siteJob ?? JobType.Builder` for construction, keeps the production guard for production crews, and always uses the `work`/builder/construction context for build work.

## Save/migration impact
None.

## Verification result
`tests/personality.workIntegration.test.ts` — PASS: a House site prices Resourceful at the catalog factor, a trait-free crew stays at 1, and a Builder at skill 100 reaches the documented 3x ceiling before DNA.
