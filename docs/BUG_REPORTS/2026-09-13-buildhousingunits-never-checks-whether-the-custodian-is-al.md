# buildHousingUnits never checks whether the custodian is already visited, so one settler can belong to two housing units in the same pass

- **Bug:** buildHousingUnits never checks whether the custodian is already visited, so one settler can belong to two housing units in the same pass
- **Status:** resolved
- **Date discovered:** 2026-09-13
- **Version/build:** 0.6.4
- **Reporter:** full simulation-logic audit (audit agent A3-daycycle-residency; adversarially verified) — audit id H7
- **Area:** Truth
- **Owner module:** `src/game/residencySelection.ts`
- **Cadence:** see fix; the owning cadence is stated in `docs/archive/SIMULATION_AUTHORITY.md` §3–4

## Status history

- 2026-09-13 — open (found by automated simulation-logic audit, confirmed by independent adversarial verification, re-verified by the lead)
- 2026-09-13 — resolved (P1 batch: fix applied at the owning module with a regression test; see **Fix**, **Regression test** and **Verification result**)

## Observed behavior

Concrete failure: mother M has minor child A (custodian M), father F has minor child B (custodian F, B's mother dead), and M and F are partners (a blended family created by remarriage — reachable through humanTick.ts:910/tryCompleteCourtshipMarriage). Bucket[M]=[A] builds unit [M,F,A] and marks F visited, but bucket[F]=[B] still builds unit [F,B] containing F again. In assignMissingResidences (residencyReconciliation.ts:230-239) every unit that needs reassignment clears and re-places ALL of its members, so F is moved twice per pass and the two units keep stealing him: [F,B] is placed in an empty house, then [M,F,A] (now invalid) is cleared and placed in another empty house, and the 24-pass loop never records `reassigned === 0`, so it runs all 24 passes on every assign pulse (4x/day). The stable end state leaves the minor child B alone in one house while F, M and A occupy another — the exact opposite of assignFamilyToResidence's contract ('keeps children with custodian'); ensureOrphanAdoption cannot repair it because B still has a living natural custodian, so the split persists across pulses.

## Expected behavior

Add the missing guard at the top of the bucket loop: `if (visited.has(custodianId)) continue;` (and attach that bucket's children to the custodian's existing unit, or rebuild the children buckets from the emitted units) so each settler belongs to exactly one housing unit; the child whose custodian is already in a unit must join that unit rather than fall through to the single-entity fallback at line 283.

## Reproduction steps

Static reproduction (no runtime repro was run during the audit):

1. Open `src/game/residencySelection.ts` at lines 263-268 | 263-281.
2. Note the offending code: `residencySelection.ts:267-268 `const unit: Entity[] = [custodian]; visited.add(custodian.id);` — the bucket loop never checks `visited.has(custodianId)` before building the unit (contrast the fallback loop at line 284: `if (visited.has(human.id)) continue;` and the partner guard at line 270 `if (partner && !visited.has(partner.id))`).`.
3. Follow the call path/guard described under **Root cause** — that path is reachable in normal play.

## Evidence

Adversarial verification note (an independent agent re-read the code and the call sites):

> Verified in buildHousingUnits: the custodian is pushed into `unit` and marked visited (267-268) without a `visited.has(custodian.id)` test, while the partner and child members are guarded (270, 275); getChildCustodian (householdComposition.ts:37-56) returns the living mother first and otherwise the father, so a widower's child and his new partner's child have different custodians, and a 14-17-year-old mother custodies her baby while she is herself a child in her own custodian's bucket. The second bucket re-adds the already-visited member, and because pickResidenceForFamily (600+) prefers an empty house the two units settle in different houses, so each pass moves the shared member, `reassigned` never reaches 0, and residencyReconciliation.ts:220-247 burns all 24 passes 4x/day (LAYER_ASSIGN_INTERVAL 18, tickLayerAssign.ts:17), leaving the shared settler with whichever unit ran last. Minimal fix: `if (visited.has(custodian.id)) continue;` after line 265.

## Root cause

Verified in buildHousingUnits: the custodian is pushed into `unit` and marked visited (267-268) without a `visited.has(custodian.id)` test, while the partner and child members are guarded (270, 275); getChildCustodian (householdComposition.ts:37-56) returns the living mother first and otherwise the father, so a widower's child and his new partner's child have different custodians, and a 14-17-year-old mother custodies her baby while she is herself a child in her own custodian's bucket. The second bucket re-adds the already-visited member, and because pickResidenceForFamily (600+) prefers an empty house the two units settle in different houses, so each pass moves the shared member, `reassigned` never reaches 0, and residencyReconciliation.ts:220-247 burns all 24 passes 4x/day (LAYER_ASSIGN_INTERVAL 18, tickLayerAssign.ts:17), leaving the shared settler with whichever unit ran last. Minimal fix: `if (visited.has(custodian.id)) continue;` after line 265.

## Fix

The custodian loop in `buildHousingUnits` now tracks which unit holds each member (`unitByMember`) and reuses that unit when the custodian is already housed, instead of creating a second unit that claims the same settler. The children of a second custodian join the household that already contains their parent, so they are neither duplicated nor orphaned (a bare `visited` guard would have dropped them into their own unit).

## Regression test

`tests/housingUnits.composition.test.ts` (3) — with both partners custodians of their own minor child, each settler and each child appears in exactly one unit.

## Invariants checked

Relevant hard invariants: `docs/archive/SIMULATION_AUTHORITY.md` §5. After the fix, `simulation/simulationInvariants.ts` and `simulation/simInvariants.ts` must stay clean in the existing invariant tests.

## Save/migration impact

None expected: the field(s) written here either already round-trip or are derived at load. Confirm with the save round-trip tests if state fields are touched.

## Verification result

`npm run test:all` and `npm run test:full-year` pass.

## Related commits or files

- `src/game/residencySelection.ts` (lines 263-268 | 263-281)
- Consolidated report: `BUG_REPORTS/2026-09-13-simulation-logic-audit.md` (audit id H7)
