# Bug: Long-run family references can point to removed entities

- Status: resolved — deterministic coverage still pending
- Date discovered: 2026-08-22
- Version/build: Wilderfolk v0.6.3 development working tree
- Reporter: Full simulation audit and repeated invariant harness
- Area: Truth | simulation | lifecycle
- Owner module: Human lifecycle and relationship cleanup
- Cadence: Pregnancy/lifecycle and daily relationship reconciliation

## Status history

- 2026-08-22 — open (full audit reported an orphaned `childrenIds` reference at tick 4,208)
- 2026-08-22 — investigating (current working tree produced a related missing `pregnantById` reference at tick 10,246 on one of three one-year repeats)
- 2026-08-22 — resolved — deterministic coverage still pending (authoritative removal cleanup applied; three post-fix one-year runs completed without family or index invariant violations)

## Observed behavior

The attached full audit reported `#440 childrenIds orphan 812` and `#441 childrenIds orphan 812` at tick 4,208 in a one-year invariant run. In the current working tree, three fresh one-year runs produced two clean runs and one failure at tick 10,246:

`tick 10246: #865 pregnantById 864 missing`

The exact failing field varies with the random simulation path, but the common failure class is a living entity retaining a relationship or genealogy reference to an entity that has already been removed from the authoritative entity collection.

## Expected behavior

When an entity dies or is permanently removed, every surviving entity must retain only valid relationship and genealogy references. Parent/child links, pregnancy parent references, partner links, affair links, custody links, and related family arrays must be reconciled through one authoritative lifecycle transition.

## Reproduction steps

1. From `C:\Wilderfolk`, run `$env:SIM_YEARS='1'; npx --no-install tsx scripts/sim-invariants.ts`.
2. Repeat the command several times because the harness currently uses `Math.random()` and is not seeded.
3. Observe that long runs may stop on a missing `childrenIds` or `pregnantById` reference.

## Evidence

External audit evidence:

`INVARIANT VIOLATION at tick 4208 (day 58): #440 childrenIds orphan 812; #441 childrenIds orphan 812`

Current working-tree repeat evidence:

`INVARIANT VIOLATION at tick 10246 (day 142): #865 pregnantById 864 missing`

Two other one-year repeats completed without invariant violations. The differing outcomes demonstrate that the current harness lacks deterministic replay control.

## Root cause

Not yet fully determined. `killHuman()` removes the dead entity from `entityById` before `finalizeHumanDeath()` and orphan reassignment. Existing cleanup handles partners, affairs, housing, and custody, but it does not yet perform a complete bidirectional sweep over all surviving relationship and genealogy fields after permanent removal. The current invariant checks all IDs against the entity map, so any removal path that skips a corresponding reference cleanup can surface later.

## Fix

`reconcileFamilyReferencesAfterRemoval()` now runs from the authoritative `killHuman()` transition after the removed entity leaves `entityById`. It clears surviving partner, affair, pregnancy-parent, and child-list references to the removed ID, while adoption and housing reassignment remain separate responsibilities.

## Regression test

Existing lifecycle, invariant, and relationship-diagnostic tests pass. Three post-fix one-year runs completed without family-reference or index invariant violations. A deterministic seeded long-run profile that exercises births, deaths, migration, raids, and save boundaries remains pending.

## Invariants checked

- Every surviving `partnerId` references an entity in the authoritative entity collection.
- Every surviving `pregnantById` references an entity in the authoritative entity collection.
- Every surviving `childrenIds` entry references an entity in the authoritative entity collection.
- Parent, adoptive-parent, pregnancy, custody, partner, and affair fields agree after removal.
- No second relationship owner or tick layer is introduced.

## Save/migration impact

Pending investigation. Save-load already contains relationship rebuilding logic; verify that it removes invalid references rather than only rebuilding residence data. Existing saves containing stale references must load into a valid state without inventing family relationships.

## Verification result

The current repair passed TypeScript checking, the selected lifecycle/invariant suite, and three one-year simulations with zero invariant violations. The harness remains nondeterministic, so seeded replay coverage is still pending.

## Related commits or files

- `src/game/dayCycle.ts`
- `src/game/simulation/humanLifecycle.ts`
- `src/game/simulation/humanRelationships.ts`
- `src/game/simulation/simInvariants.ts`
- `scripts/sim-invariants.ts`
- `tests/humanLifecycle.test.ts`
- `tests/simulation.invariants.test.ts`
- `tests/youthFertility.lifecycle.test.ts`
- `tests/youthLove.lifecycle.test.ts`
- Attached full game-design and code audit supplied on 2026-08-22

## Simulation Change Record

- Owner module: Human lifecycle relationship cleanup
- Decision changed: Pending; ensure removed entities cannot remain as referenced family/relationship targets
- Cadence: Lifecycle/pregnancy and daily reconciliation
- State fields written: Pending exact path analysis; likely parent/child, pregnancy, partner, affair, custody, and entity-map fields
- Why the change is needed: Long runs expose invalid references that can corrupt family identity, housing, pregnancy, social behavior, and story state
- Player-visible behavior before: Rare long-play family or pregnancy relationships may become inconsistent or fail later systems
- Player-visible behavior after: Pending repair
- Performance impact: Prefer cleanup of affected relationship fields during removal plus bounded reconciliation; no new tick layer
- New or updated tests: Pending focused death-path tests and deterministic long-run harness
- Invariants checked: Missing relationship/genealogy targets are rejected
- Save/migration impact: Pending save-load reconciliation confirmation
- Rollback plan: Revert the focused cleanup transition and preserve this report and regression tests
## Verification update — 2026-08-22

`reconcileFamilyReferencesAfterRemoval()` remains the single authoritative removal cleanup and is invoked by `killHuman()` immediately after the removed entity leaves `entityById`. The transition clears surviving `childrenIds`, `partnerId`, `affairPartnerId`, and `pregnantById` references without adding a second lifecycle owner or tick layer. Adoption and residence reassignment remain separate lifecycle responsibilities.

A new focused regression file, `tests/familyReferenceCleanup.test.ts`, covers the original failure mode directly: when a child is permanently removed through `killHuman()`, every surviving parent loses that child ID from `childrenIds`. It also covers cleanup of partner, affair, pregnancy-parent, and child-list references in the authoritative helper.

Current validation passed TypeScript, ESLint, the full suite (**82 test files / 448 tests**), and the deterministic one-year invariant harness (**seed 12345**, **0 invariant violations**). The default harness scenario completed with population zero, so the focused removal regression—not that empty-population run—is the direct proof for parent/child cleanup. A seeded high-population lifecycle profile remains follow-up coverage work.

**Save/migration impact:** No schema or migration change. Existing malformed relationship references are still handled by the existing save/load validation path; this repair prevents new stale references during the authoritative permanent-removal transition.
