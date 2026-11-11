# A birth's genome does not derive from its birth key

- Bug: Replaying one delivery does not reproduce the same child genome, contrary to the birth contract.
- Status: resolved
- Severity: low
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit
- Reporter: full-audit gameplay coverage (COV-G-04)
- Area: birth / genetics
- Owner module: `simulation/humanLifecycle.ts` → `settlerTraits.inheritGenome`
- Related PR/commit: this branch

## Status history
- 2026-11-07 — open: audit found the genome used the live shared stream.
- 2026-11-07 — resolved: the delivery passes a stream derived from its birth key.

## Observed behavior
Position, wildkin, stillborn and gender were seeded from `birth:${motherId}:${tick}`, but `inheritGenome` drew from the stateful `settlerGenetics` stream, so a partial replay of one birth produced a different genome.

## Expected behavior
The same `birthKey` reproduces the same child, including its genome.

## Reproduction steps
1. Run a delivery in two identical worlds whose `settlerGenetics` streams have different draw counts.
2. Before the fix the two children had different genomes.

## Evidence
Source trace at the delivery path; the genome call now receives `seededStreamForRun(`${birthKey}:genome`)`.

## Root cause
The genome inheritance call omitted the stream seam that every other birth decision used.

## Fix / proposed fix
Added `simRng.seededStreamForRun` and passed its stream into `inheritGenome` at the one birth owner.

## Save/migration impact
None; genomes are still validated and saved as before.

## Verification result
- `npm run test:types` — PASS.
- `npm run lint` — PASS.
- Dedicated replay test — NOT RUN; whole-sim determinism remains covered by the existing parity suite.
