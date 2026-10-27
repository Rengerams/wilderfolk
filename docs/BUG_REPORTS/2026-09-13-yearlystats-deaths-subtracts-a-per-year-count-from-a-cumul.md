# YearlyStats.deaths subtracts a per-year count from a cumulative dead-entity count

- **Bug:** YearlyStats.deaths subtracts a per-year count from a cumulative dead-entity count
- **Status:** resolved
- **Date discovered:** 2026-09-13
- **Version/build:** 0.6.4
- **Reporter:** full simulation-logic audit (audit agent A2-types-constants; adversarially verified) — audit id H11
- **Area:** Truth
- **Owner module:** `src/game/stats.ts`
- **Cadence:** see fix; the owning cadence is stated in `docs/archive/SIMULATION_AUTHORITY.md` §3–4

## Status history

- 2026-09-13 — open (found by automated simulation-logic audit, confirmed by independent adversarial verification, re-verified by the lead)
- 2026-09-13 — resolved (P1 batch: fix applied at the owning module with a regression test; see **Fix**, **Regression test** and **Verification result**)

## Observed behavior

gameTick rebuilds `state.entities` from alive entities only, so by the time `recordYearlyStats` runs at the year-rollover tick (gameTick.ts:83) the world array contains no `!alive` entity. `YearlyStats.deaths.humans`/`deaths.animals` are therefore always 0 and `lifetimeStats.totalHumansDied` is always 0, which is what StatisticsPanel.tsx:43 renders as "Humans Died" — the lifetime records panel reports 0 deaths forever. (Line 104 also subtracts the previous year's *delta* from a cumulative-looking count; both sides are 0 today, so the unit mismatch is currently masked.) The same alive-only snapshot makes `births.humans` (line 70) miss any child who died in its birth year.

## Expected behavior

Record deaths where they happen: increment a persistent counter at the death owner (e.g. in killHuman / the animal death helper) and derive both the per-year value and `totalHumansDied` from that counter (deltas), instead of scanning `state.entities` for `!e.alive`; e.g. in `updateLifetimeStats` replace line 132 with `s.totalHumansDied += latestYear?.deaths.humans ?? 0;` once the yearly value comes from the counter.

## Reproduction steps

Static reproduction (no runtime repro was run during the audit):

1. Open `src/game/stats.ts` at lines 104-107 | 104, 107, 132 | 132.
2. Note the offending code: `stats.ts:104 `humans: entities.filter(e => e.type === ET.Human && !e.alive && e.age > 0).length - (prevYearStats?.deaths.humans || 0),`
stats.ts:107 `).length - (prevYearStats?.deaths.animals || 0),`
stats.ts:132 `s.totalHumansDied = state.entities.filter(e => e.type === ET.Human && !e.alive).length;`
gameTick.ts:206-208 `const allAlive: Entity[] = [];` / `for (const e of aliveEntities) {` / `if (e.alive) allAlive.push(e);` then gameTick.ts:234 `state.entities = allAlive;``.
3. Follow the call path/guard described under **Root cause** — that path is reachable in normal play.

## Evidence

Adversarial verification note (an independent agent re-read the code and the call sites):

> The cited formula is exactly as reported, and the left operand is structurally always 0 because state.entities only ever holds living entities when recordYearlyStats runs: gameTick.ts:234 assigns allAlive, simDelta.ts:498 assigns aliveEntities, and saveLoad.ts:400 forces `alive: true` on load, so `deaths.humans` is 0 - previous = 0 in every year (inductively always 0). The impact narrative is overstated, though: a repo-wide grep finds no reader of YearlyStats.deaths (not even the UI), so the defect is a stored, always-zero stat rather than a visible wrong outcome — hence low. Minimal fix: own a cumulative death counter where deaths are recorded (killHuman/finalizeHumanDeath) and compute the per-year delta from it.

## Root cause

The cited formula is exactly as reported, and the left operand is structurally always 0 because state.entities only ever holds living entities when recordYearlyStats runs: gameTick.ts:234 assigns allAlive, simDelta.ts:498 assigns aliveEntities, and saveLoad.ts:400 forces `alive: true` on load, so `deaths.humans` is 0 - previous = 0 in every year (inductively always 0). The impact narrative is overstated, though: a repo-wide grep finds no reader of YearlyStats.deaths (not even the UI), so the defect is a stored, always-zero stat rather than a visible wrong outcome — hence low. Minimal fix: own a cumulative death counter where deaths are recorded (killHuman/finalizeHumanDeath) and compute the per-year delta from it.

## Fix

`gameTick` tallies deaths per tick from the entities that were alive at the start of the tick and are not alive at the end of it (exact, and independent of the end-of-tick `state.entities` rebuild), accumulating into the new world field `deathsThisYear`. `recordYearlyStats` reports that tally and `updateLifetimeStats` sums the yearly records for `totalHumansDied`, so the Statistics panel's "Humans Died" is real. The field round-trips through save, worker prep and the tick delta.

## Regression test

`tests/deathStatistics.test.ts` (3) — the per-tick tally equals the entities that actually died (with a deterministic wildlife death forced), the yearly record reports the accumulated deaths, and the lifetime total sums the yearly records across a reload.

## Invariants checked

Relevant hard invariants: `docs/archive/SIMULATION_AUTHORITY.md` §5. After the fix, `simulation/simulationInvariants.ts` and `simulation/simInvariants.ts` must stay clean in the existing invariant tests.

## Save/migration impact

None expected: the field(s) written here either already round-trip or are derived at load. Confirm with the save round-trip tests if state fields are touched.

## Verification result

`npm run test:all` and `npm run test:full-year` pass.

## Related commits or files

- `src/game/stats.ts` (lines 104-107 | 104, 107, 132 | 132)
- Same root cause also reported as: LifetimeStats.totalHumansDied counts dead entities in state.entities, which never contains dead entities (A2-types-constants)
- Consolidated report: `BUG_REPORTS/2026-09-13-simulation-logic-audit.md` (audit id H11)
