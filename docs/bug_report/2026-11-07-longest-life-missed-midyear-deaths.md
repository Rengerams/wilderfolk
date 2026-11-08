# The longest-lived settler record missed anyone who died mid-year

- Bug: `lifetimeStats.longestLivingHuman` was refreshed only at year end by scanning the survivors, so a settler who died in June never entered the record even at an advanced age.
- Status: resolved
- Severity: low
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit (SIM-16)
- Reporter: full-audit simulation review
- Area: simulation / lifetime statistics
- Owner module: `src/game/stats.ts` (`recordHumanDeath`, `tallyTickDeaths`)
- Related PR/commit: this branch (`master-approach-buglist`)

## Status history
- 2026-11-07 — open: audit found the year-end snapshot-only scan in `updateLifetimeStats`.
- 2026-11-07 — resolved: the age is recorded when the death commits.

## Observed behavior
The death scan updated the yearly counters but not the lifetime record; `state.entities` holds only the living, so `updateLifetimeStats` compared ages of survivors. A colony whose eldest died between year boundaries reported a younger "longest life" than it had actually seen.

## Expected behavior
The record holds the oldest age the colony ever reached, whether the settler is still alive or died mid-year.

## Reproduction steps
1. Start a world with an empty lifetime record.
2. Kill an 88-year-old settler during the year.
3. Close the year and read `longestLivingHuman` — it still shows the surviving cohort's best.

## Evidence
- `tests/stats.deathAccounting.test.ts` — "records the age of an elder who died before year end" and "keeps the older record when a younger settler dies".

## Root cause
The record was derived from a snapshot of survivors instead of the deaths themselves.

## Fix / proposed fix
`recordHumanDeath` writes the record at death time and is called by `tallyTickDeaths` and by the raid casualty path. The year-end scan is unchanged, so an elder still alive also competes for the record.

## Save/migration impact
None; the stored shape is unchanged.

## Verification result
- `npx vitest run tests/stats.deathAccounting.test.ts` — PASS (5/5).
- `npm run test:types`, `npm run lint`, `npm run build` — PASS.
