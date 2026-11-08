# A valid flat genome is rewritten on load

- Bug: A legal saved genome with every allele pair at 50 loads as a 60/40 profile.
- Status: resolved
- Severity: low
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit
- Reporter: full-audit DNA pass (DNA-01)
- Area: save/load genetics
- Owner module: `settlerTraits.ts`
- Related PR/commit: this branch

## Status history
- 2026-11-07 — open: `normalizeGenome` called `ensureSpread`.
- 2026-11-07 — resolved: validation keeps the genome as written; creation paths still spread.

## Observed behavior
`normalizeGenome({version: 2, aptitudeAlleles: 14 × [50,50]})` returned one pair at 60 and one at 40. The genome architecture doc says a valid saved genome is kept as written.

## Expected behavior
A syntactically valid genome loads unchanged; spread enforcement belongs to founder, birth and backfill creation.

## Reproduction steps
1. Save a genome with all pairs at 50.
2. Load it through `normalizeGenome`.
3. Before the fix two dimensions moved.

## Evidence
`tests/settlerTraits.test.ts` — “keeps a valid flat genome exactly as written”.

## Root cause
The validator reused the creation-time spread guard.

## Fix / proposed fix
Removed `ensureSpread` from `normalizeGenome`; `inheritGenome` and founder/backfill creation still apply it.

## Save/migration impact
A flat genome that was previously rewritten now survives as saved. No schema change.

## Verification result
- `npx vitest run tests/settlerTraits.test.ts` — PASS (18 tests).
- `npm run test:types` — PASS.
