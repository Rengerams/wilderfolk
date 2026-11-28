# Settled ecology creates a type-only dependency cycle

- Bug: shared state imports its ecology metrics contract from its simulation consumer.
- Status: investigating
- Severity: high (required architecture gate)
- Date discovered: 2026-11-28
- Version/build: main dee009c6, PR #240
- Reporter: player CI output
- Area: module architecture
- Owner module: `ecologyTypes.ts` (shared contract); `dailyEcology.ts` (calculation)

## Status history
- 2026-11-28 — investigating: reported 3,801 tests passing and one failing import-cycle assertion; move the interface to the existing dependency-free type module.

## Observed behavior
`tests/importCycleTypes.test.ts` reports a type-only cycle through dailyEcology, entityCounts and gameTypes, while runtime imports are acyclic.

## Expected behavior
Neither runtime nor type-only imports form a cycle.

## Reproduction and evidence
Run the existing import-cycle architecture test against the reported build. WorldState imports EcosystemMetrics from dailyEcology, which imports WorldState and PopulationCounts; entityCounts also imports gameTypes.

## Fix
Move the single unchanged EcosystemMetrics interface to ecologyTypes and import it directly from both consumers. No new implementation or exception; leave the architecture test intact.

## Save/migration impact
None. The interface layout and all runtime state, calculation and settlement behavior are unchanged.

## Verification
Source dependency direction checked. Existing import-cycle regression and full CI pending.
