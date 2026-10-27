# buildHousingUnits merges adult children into the parents' housing unit, so the adult-child move-out is undone inside the same assignMissingResidences call

- **Bug:** buildHousingUnits merges adult children into the parents' housing unit, so the adult-child move-out is undone inside the same assignMissingResidences call
- **Status:** resolved
- **Date discovered:** 2026-09-13
- **Version/build:** 0.6.4
- **Reporter:** full simulation-logic audit (audit agent A3-daycycle-residency; adversarially verified) — audit id H6
- **Area:** Truth
- **Owner module:** `src/game/residencySelection.ts`
- **Cadence:** see fix; the owning cadence is stated in `docs/archive/SIMULATION_AUTHORITY.md` §3–4

## Status history

- 2026-09-13 — open (found by automated simulation-logic audit, confirmed by independent adversarial verification)
- 2026-09-13 — resolved (P1 batch: fix applied at the owning module with a regression test; see **Fix**, **Regression test** and **Verification result**)

## Observed behavior

Concrete failure: mother M has minor child A (custodian M), father F has minor child B (custodian F, B's mother dead), and M and F are partners (a blended family created by remarriage — reachable through humanTick.ts:910/tryCompleteCourtshipMarriage). Bucket[M]=[A] builds unit [M,F,A] and marks F visited, but bucket[F]=[B] still builds unit [F,B] containing F again. In assignMissingResidences (residencyReconciliation.ts:230-239) every unit that needs reassignment clears and re-places ALL of its members, so F is moved twice per pass and the two units keep stealing him: [F,B] is placed in an empty house, then [M,F,A] (now invalid) is cleared and placed in another empty house, and the 24-pass loop never records `reassigned === 0`, so it runs all 24 passes on every assign pulse (4x/day). The stable end state leaves the minor child B alone in one house while F, M and A occupy another — the exact opposite of assignFamilyToResidence's contract ('keeps children with custodian'); ensureOrphanAdoption cannot repair it because B still has a living natural custodian, so the split persists across pulses.

## Expected behavior

Add the missing guard at the top of the bucket loop: `if (visited.has(custodianId)) continue;` (and attach that bucket's children to the custodian's existing unit, or rebuild the children buckets from the emitted units) so each settler belongs to exactly one housing unit; the child whose custodian is already in a unit must join that unit rather than fall through to the single-entity fallback at line 283.

## Reproduction steps

Static reproduction (no runtime repro was run during the audit):

1. Open `src/game/residencySelection.ts` at lines 283-288; householdComposition.ts:19 | 263-281.
2. Note the offending code: `residencySelection.ts:267-268 `const unit: Entity[] = [custodian]; visited.add(custodian.id);` — the bucket loop never checks `visited.has(custodianId)` before building the unit (contrast the fallback loop at line 284: `if (visited.has(human.id)) continue;` and the partner guard at line 270 `if (partner && !visited.has(partner.id))`).`.
3. Follow the call path/guard described under **Root cause** — that path is reachable in normal play.

## Evidence

Adversarial verification note (an independent agent re-read the code and the call sites):

> The mechanism is real: buildHousingUnits' second loop (residencySelection.ts:283-288) calls collectOwnHousehold, which appends every alive childrenIds entry with no age filter (householdComposition.ts:19), and rebuildChildrenIds (residencyReconciliation.ts:48-54) rebuilds those links for adults too. For a parent with no minor children the unit spans both houses, isFamilyHousingValid fails, and the convergence loop (residencyReconciliation.ts:220-247) unassigns and re-homes the whole unit together, so a lone adult child's move-out never persists; I traced that an adult child who heads their own unit (partner/minor children) does end up split, but only after every call runs all 24 passes. This is exactly the root cause left unresolved in BUG_REPORTS/2026-09-13-move-out-reverted-by-residency-reconciliation.md. Minimal fix: build the second-loop unit as seed + living partner + isMinorChild members only.

## Root cause

The mechanism is real: buildHousingUnits' second loop (residencySelection.ts:283-288) calls collectOwnHousehold, which appends every alive childrenIds entry with no age filter (householdComposition.ts:19), and rebuildChildrenIds (residencyReconciliation.ts:48-54) rebuilds those links for adults too. For a parent with no minor children the unit spans both houses, isFamilyHousingValid fails, and the convergence loop (residencyReconciliation.ts:220-247) unassigns and re-homes the whole unit together, so a lone adult child's move-out never persists; I traced that an adult child who heads their own unit (partner/minor children) does end up split, but only after every call runs all 24 passes. This is exactly the root cause left unresolved in BUG_REPORTS/2026-09-13-move-out-reverted-by-residency-reconciliation.md. Minimal fix: build the second-loop unit as seed + living partner + isMinorChild members only.

## Fix

`buildHousingUnits`' fallback unit uses the new `collectMinorHousehold` (settler + living partner + **dependent** children) instead of `collectOwnHousehold`, whose `childrenIds` walk has no age filter. A parent whose children had all grown up no longer forms a unit spanning two houses, so the convergence loop can no longer re-home the whole unit together and undo the adult-child move-out.

## Regression test

`tests/housingUnits.composition.test.ts` (3) — an adult child forms their own unit while a minor child stays with the parent, and each settler appears exactly once.

## Invariants checked

Relevant hard invariants: `docs/archive/SIMULATION_AUTHORITY.md` §5. After the fix, `simulation/simulationInvariants.ts` and `simulation/simInvariants.ts` must stay clean in the existing invariant tests.

## Save/migration impact

None expected: the field(s) written here either already round-trip or are derived at load. Confirm with the save round-trip tests if state fields are touched.

## Verification result

`npm run test:all` and `npm run test:full-year` pass; `tests/housingDiagnostics.test.ts`, `tests/leaderRemarriage.residency.test.ts` and `tests/demolition.adjacencyHydration.test.ts` still pass.

## Related commits or files

- `src/game/residencySelection.ts` (lines 283-288; householdComposition.ts:19 | 263-281)
- Consolidated report: `BUG_REPORTS/2026-09-13-simulation-logic-audit.md` (audit id H6)
