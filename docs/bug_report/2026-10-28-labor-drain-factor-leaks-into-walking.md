# Endurance DNA also priced ordinary walking, not just work

- Bug: `advanceHumanNeeds` divided every negative stamina rate by the catalog's `physiology`/`labor` factor, so Hardy and Graceful changed how fast a settler tired while merely walking around the village.
- Status: resolved
- Severity: low
- Date discovered: 2026-10-28
- Version/build: 0.6.5.1 sources on branch `codebot-tasks` at `971b23c6` (personality/career 0.6.5.2, PR #90)
- Reporter: independent review of PR #90 (energy-drain scope question)
- Area: human physiology, settler traits
- Owner module: `src/game/simulation/humanPhysiology.ts` — `advanceHumanNeeds`
- Related PR/commit: PR #90, fixed on the same branch

## Status history
- 2026-10-28 — open: review asked whether the labor context was meant to cover walking; the code applied it to both drain branches.
- 2026-10-28 — resolved: the factor now applies only to the work-shift drain, and a walking-vs-working regression covers both directions.

## Observed behavior
The drain term is chosen from `sleeping | working | moving | idle`, and the trait division sat in the shared `if (staminaRate < 0)` block, so it applied to `moving` as well as `working`. A Hardy settler therefore tired ~6% slower while walking, and a Graceful settler ~5% faster, on a context the catalog names `labor`.

## Expected behavior
The context is named `labor`, and the trait copy promises endurance "on hard work" / a Graceful drawback "on heavy labor". Walking is travel, not labor: it keeps the documented base drain, and only a worked shift is scaled by the settler's DNA. Nothing in the plan asks for a travel-time trait effect.

## Reproduction steps
1. `advanceHumanNeeds(entity, { sleeping: false, working: false, moving: true, … })` for two hours with a Hardy settler and with a plain one.
2. On `971b23c6` the Hardy settler keeps more stamina than the plain settler.
3. The same comparison while `working: true` must still differ.

## Evidence
- `src/game/simulation/humanPhysiology.ts`: `if (staminaRate < 0) { staminaRate /= evaluateTraitInfluence(entity, LABOR_CONTEXT).factor; … }` covers the `moving` branch.
- The new case `prices the labor context on a shift only, not while walking` fails on that code and passes after the fix.

## Root cause
The integration added the factor to the shared drain block instead of the work branch, because both branches produce a negative rate. No test distinguished walking from working, so both directions of the leak were invisible.

## Fix / proposed fix
The division is now gated on `obs.working`; walking, idling, sleep, the well and hospital multipliers are unchanged. The `physiology`/`labor` context therefore prices exactly the shift it names.

## Save/migration impact
None. Stamina is derived each tick and no new field or stored multiplier exists.

## Verification result
- `npx vitest run tests/personality.physiologyIntegration.test.ts` — **PASS** (5 tests); the new walking case **FAILS** with the fix reverted.
- The existing work-drain case (Hardy above plain, Graceful below) and the documented base drain — **PASS**.
- `npm run test:types` — **PASS**.
