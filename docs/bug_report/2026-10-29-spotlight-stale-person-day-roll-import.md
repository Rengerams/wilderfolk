# Spotlight imports removed humanSchedule day-roll export

- Bug: the Spotlight feature imports `personDayRoll` from `humanSchedule`, but the canonical function moved to `simRng`; the ESM loader aborts before simulation.
- Status: investigating
- Severity: high
- Date discovered: 2026-10-29
- Version/build: PR #91, Actions run 40810702752, commit 2843d32
- Reporter: 120-day producer bot CI
- Area: seeded Spotlight event selection and simulation module linking
- Owner module: `src/game/spotlightLore.ts` (event caller), `src/game/simRng.ts` (sole day-roll implementation)
- Related PR: #91

## Status history
- 2026-10-29 — investigating: run 40810702752 failed during module evaluation. A direct owner import was committed; fresh CI validation pending.

## Observed behavior
The 120-day producer gate fails immediately with:
`SyntaxError: The requested module './humanSchedule' does not provide an export named 'personDayRoll'`.

## Expected behavior
Spotlight imports the canonical `simRng.personDayRoll` directly and executes the existing deterministic 19:00 event gate without changing draws, seeds or probability.

## Reproduction steps
1. Check out the PR #91 head before the import correction, with `humanSchedule.ts` importing rather than re-exporting `personDayRoll`.
2. Run `npx tsx scripts/run-full-year.mts --scenario=producers --days=120 --bot --verbose`.
3. Observe the ESM import failure before the simulation starts.

## Evidence
[Failed run 40810702752](https://github.com/Rengerams/wilderfolk/actions/runs/40810702752); the two files' actual exports/imports, and unchanged usage of salt values 3919 and 3920.

## Root cause
An outdated import path survived the RNG ownership migration; `humanSchedule` is no longer a re-export door.

## Fix
Change the Spotlight module's direct import source to `./simRng`. No redundant alias, wrapper, new RNG stream or behavioral change.

## Save/migration impact
None.

## Verification result
- Source export ownership checked: PASS.
- Earlier 120-day Actions run: FAIL (import exception).
- Current-head CI/build: PENDING.
