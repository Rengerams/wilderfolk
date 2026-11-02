# An adult-child move drags independent adult descendants back home

- Bug: the adult-child phase builds the departing household with every living child, so an adult grandchild who already lives elsewhere is moved back in with the parent.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-02
- Version/build: V.0.6.5.1, fixed in `fd63ad00`
- Reporter: housing review and independent audits
- Area: housing assignment
- Owner module: src/game/housingPipeline.ts (`tryMoveOutOfFamilyHome`)
- Related PR/commit: none yet; fix scheduled with P3

## Status history

- 2026-11-02 — open: recorded from the code review and worker audits.
- 2026-11-02 — resolved: `tryMoveOutOfFamilyHome` uses `collectMinorHousehold` and plans through `planRelocation`; the L1 regression asserts an adult grandchild stays in their own home.

## Observed behavior

`tryMoveOutOfFamilyHome` forms the departing household with `collectOwnHousehold`, which adds every living `childrenIds` entry with no age or residence filter. A parent whose adult child has an adult child of their own therefore includes that grandchild in the moving household, and `relocateHousehold` writes every member into the new home.

## Expected behavior

Only the adult and their dependent children move; an adult descendant living in their own home is an independent housing unit (`HOUSING_ARCHITECTURE.md` §2 phase 6, §14).

## Reproduction / evidence

1. Parent #1 and adult child #2 live in home A; adult grandchild #3 (child of #2) lives in home B.
2. Provide an empty home C that fits the departing household.
3. Run the adult-child phase: #3 is written into C with #2, undoing the earlier move-out.

## Root cause

`collectOwnHousehold` has no age/residence filter, and the adult-child path uses it instead of `collectMinorHousehold`.

## Proposed fix

Use `collectMinorHousehold` (or filter `isMinorChild`) for the departing household. Add a regression with a grandchild already housed elsewhere.

## Regression coverage

- Scheduled with P3; no test pins it yet.

## Save compatibility

None: in-memory state only.

## Verification

Fixed: the 35-file housing suite passes (168 tests), including the new L1 regression.
