# Capacity surplus evicts a whole household for a one-bed excess

- Bug: when a residence is over capacity, the phase unhouses the whole selected unit instead of only the members above the cap, leaving empty beds and more homeless settlers than necessary.
- Status: resolved
- Severity: low
- Date discovered: 2026-11-02
- Version/build: V.0.6.5.1, working tree
- Reporter: housing audits (independent workers)
- Area: housing assignment
- Owner module: src/game/housingPipeline.ts (`rebalanceOvercrowdedResidences`, `selectSurplusMembers`)
- Related PR/commit: capacity-surplus fix, 2 November 2026

## Status history

- 2026-11-02 — open: recorded by the audit round.
- 2026-11-02 — resolved: the rebalance now sheds only the excess (`occupancy − capacity`), adults before partners, never a minor or the custodian a remaining minor needs; the regression fails on the old whole-unit rule and passes now.

## Observed behavior

Fixture: one 6-bed house with kin groups of 4 and 3 (7 occupants) ends with 3 unhoused and the house at 4/6 — two beds empty.

## Expected behavior

Evict only the excess (`occupancy − capacity`), least-disruptive members first, and let the homeless phase seat them.

## Reproduction / evidence

1. Put 7 related settlers in a 6-bed house with no spare.
2. Run `rebalanceOvercrowdedResidences`.
3. Before the fix: three are unhoused while the house keeps two free beds; after: six stay and one is unhoused.
4. The regression is `tests/residencyCapacity.writers.test.ts`, "an overfull home evicts only the settlers above its bed count" — on the old rule it failed with the house at 4 of 6 beds.

## Root cause

Both surplus paths in `rebalanceOvercrowdedResidences` offered the whole unit: the dependent-minor branch the whole outsider unit, the adult-only branch the whole kin group. No partial selection existed, so a group that no longer fit the remaining beds was unhoused entirely.

## Fix (applied)

`selectSurplusMembers` picks the excess members from the failing group: adults first, singles before partners, never a minor or the custodian a remaining minor still needs. When no custody-safe subset exists it returns undefined and the old whole-group behaviour is kept. The chosen subset is planned through `planRelocation` (capacity first, then surplus), so it is rehoused when a bed exists and unhoused only when no destination does. `kept` counts only members that actually stayed.

## Regression coverage

`tests/residencyCapacity.writers.test.ts`: one 6-bed house, kin groups of four and three, no spare home → the house ends full and exactly one settler is unhoused. It failed on the old rule (house at 4/6, three unhoused).

## Save compatibility

None: in-memory state only.

## Verification

- `npx vitest run tests/residencyCapacity.writers.test.ts` — passed (9 tests).
- housing suites (34 files / 167 tests) — passed.
- `npm run test:types` — passed; `npm run lint` — passed; `npm run build` — passed.
- full unit suite — 457 files / 2 960 passed; the only failure is the pre-existing `villageLeadership.test.ts` vacancy case, reproduced unchanged at the base commit `b2fe5dcf`.
