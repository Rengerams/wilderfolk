# Orphans are adopted into the Leader's House

- Bug: an orphan can be adopted by the village leader's couple and is then moved into the Leader's House by the household sync — the one residence the orphan-housing rule explicitly refuses
- Status: resolved
- Date discovered: 2026-09-20
- Version/build: Wilderfolk 0.6.4 (working tree)
- Reporter: Owner, from play ("in leadership house i noticed orphans are now adopted that should not be possible"); root cause traced and reproduced in a test the same day
- Area: Play
- Owner module: `src/game/residencySelection.ts` (`ensureOrphanAdoption`, `listVillageCouples`, `listVillageSingleAdults`, `leaderHouseholdIds`), reached from `residencyReconciliation.ts` and `humanLifecycleCleanup.reassignOrphansAfterDeath`; consequence applied by `src/game/leaderHouse.ts` (`syncLeaderHouseResidency`); the adoption surname rule lives with the other surname rules in `src/game/nameLoader.ts` (`applyAdoptionSurname`)
- Cadence: daily — `tickLayerDaily.ts` → `syncLeaderHouseResidency`; adoption runs from the same daily reconciliation and from the death path

## Status history

- 2026-09-20 — open (reported from play; mechanism identified by reading the adoption, household and leader-house owners, then reproduced by test)
- 2026-09-20 — resolved (narrow rule applied: the leader's household is not an adoptive family; adopted children also take the adoptive family's surname, per the owner's second instruction. `tests/adoption.leaderHouse.test.ts` 5/5 green)

## Observed behavior

An orphan (a minor with no living natural parent) is adopted by the **leader's** couple and ends up living in the Leader's House.

## Expected behavior

The orphan-housing rule states the opposite in its own code: `pickOrphanResidence` skips every Leader's House —

```ts
for (const residence of residences) {
  if (isLeaderHouseResidence(residence)) continue;
```

— so an orphan must never be *housed* in the manor. Adoption is a second path into the same household and does not consult that rule.

## Reproduction steps

1. One village with a Leader's House, a leader and a spouse (the only couple), and one parentless minor.
2. Call `ensureOrphanAdoption(orphan, humans, residences)`.
3. Call `syncLeaderHouseResidency(world)`.

`tests/adoption.leaderHouse.test.ts` does exactly this.

## Evidence

`npx vitest run tests/adoption.leaderHouse.test.ts` — **1 passed, 3 failed** before any fix:

```text
FAIL  orphans are not adopted into the Leader's House > does not offer the leader's couple as an adoptive home
AssertionError: expected 1 to be undefined
  expect(orphan.adoptiveFatherId).toBeUndefined()

FAIL  orphans are not adopted into the Leader's House > never moves an orphan into the Leader's House
AssertionError: expected 10 not to be 10 // Object.is equality
  expect(orphan.residenceBuildingId).not.toBe(LEADER_HOUSE_ID)
```

The control case passes, so ordinary adoption works and the defect is specific to the leader's household:

```text
PASS  control: a village couple still adopts a parentless minor
```

## Root cause

Three owners each behave correctly in isolation; the composition is wrong.

1. `listVillageCouples` (`residencySelection.ts`) filters only `h.alive && isPlayerHuman(h)` and pairs by `partnerId` — **no Leader's House or leader-household exclusion**. `pickRandomAdoptiveCouple` therefore offers the leader's couple like any other, and `ensureOrphanAdoption` writes `adoptiveMotherId` / `adoptiveFatherId` and appends the orphan to **both** adopters' `childrenIds`.
2. `collectMinorHousehold` (`householdComposition.ts`) builds the leader's household from `seed.childrenIds` and `partner.childrenIds`, so the adopted orphan is now a dependent of the leader.
3. `syncLeaderHouseResidency` (`leaderHouse.ts`) then **force-moves every household member into the manor** (`member.residenceBuildingId = house.id`), which is the move the orphan-housing rule had refused.

`listVillageSingleAdults` → `pickRandomAdoptiveGuardian` has the same gap: a single leader is an eligible guardian.

## Fix

**Applied 2026-09-20 — the narrow rule, plus the owner's naming requirement.**

1. `residencySelection.leaderHouseholdIds(humans, residences)` returns the leader's household, and `listVillageCouples` / `listVillageSingleAdults` take an `excluded` set so the pickers can never offer it. Two sources are read, because a residence test alone is not enough: `syncLeaderHouseResidency` is what *puts* the household in the manor, and adoption can run before it does (a fresh leader, a load, or the tick that appoints them) at which point nobody is a resident yet and the leader would still be offered. So the office itself is read too (`occupation === LEADER_OCCUPATION`, written by `leaderHouse.applyLeaderOccupation`), together with the leader's spouse, who is the other adopter.
2. The adult-floor tests and the ordinary path are untouched: an orphan is still adopted by any other couple or single adult, and still housed — just never in the manor.
3. **Owner follow-up, same day — the adopted child takes the adoptive family's surname.** `nameLoader.applyAdoptionSurname(child, first, second)` was added beside `syncMarriageSurnames` and `resolveChildSurname` (the other two surname rules), and is called on both the couple and the single-guardian branches. The pre-adoption name is deliberately not recorded: `maidenSurname` means "a wife's name before marriage" and overloading it would make the family tree lie.

The broad option (disable orphan adoption entirely) was **not** taken: it would contradict the deliberate existing implementation (couple → single guardian → house-only fallback) and the age-floor test that pins it.

## Regression test

`tests/adoption.leaderHouse.test.ts` — **five** cases: the ordinary-couple control (which also asserts the child takes the adopters' surname), "gives an orphan a single guardian's surname too", "does not offer the leader's couple as an adoptive home", "never moves an orphan into the Leader's House", and "still houses the orphan somewhere — adoption is refused, not the bed". The last is deliberate: the rule is *not the manor*, not *no bed*.

The fixture's leader deliberately **starts unhoused** and carries `LEADER_OCCUPATION`. A residence-only check passed on a pre-housed fixture and missed the defect — that is how the first version of this fix failed its own test.

## Invariants checked

Presentation-free: no save schema, worker delta or `WorldState` shape changes. The fix is confined to which candidates the adoption pickers may offer, and to `surname` (already durable — see below).

## Save/migration impact

None. `adoptiveMotherId`, `adoptiveFatherId`, `residenceBuildingId` and `surname` are all already carried: `surname` is in `simDelta`'s `CATALOG_PATCH_KEYS`, and the load path builds each entity from the saved partial (`saveLoad.ts` — `{ …defaults, ...e }`), so a set surname round-trips.

## Verification result

**Resolved 2026-09-20.** `npx vitest run tests/adoption.leaderHouse.test.ts` — **5/5 passed**. The pre-fix run of the same file was **1 passed / 3 failed**, with the decisive assertion `expected 10 not to be 10` on `orphan.residenceBuildingId` — the orphan sitting in the Leader's House. `tests/adultFloor.age18.test.ts` (5) still passes unchanged, so ordinary adoption and the age floor are intact.

## Related commits or files

- `src/game/residencySelection.ts` — `ensureOrphanAdoption`, `leaderHouseholdIds`, `listVillageCouples`, `listVillageSingleAdults`, `pickOrphanResidence`
- `src/game/nameLoader.ts` — `applyAdoptionSurname` (new), beside `syncMarriageSurnames` / `resolveChildSurname`
- `src/game/householdComposition.ts` — `collectMinorHousehold`
- `src/game/leaderHouse.ts` — `collectLeaderHousehold`, `syncLeaderHouseResidency`, `applyLeaderOccupation`
- `tests/adoption.leaderHouse.test.ts` (new)
- `tests/adultFloor.age18.test.ts` — the only prior adoption coverage (age floor only)

## Separate finding (not this defect)

While verifying, the import-cycle gate reports **1 runtime cycle** (`citizenId → dayCycle → humanLifecycleCleanup → moonHowlerForm → nameLoader → residencyReconciliation → residencySelection → workforce`). It is **pre-existing and not caused by this fix**: an A/B with the new `residencySelection → nameLoader` edge removed reports the identical cycle. Because the gate only warns, `audit:deps:cycles:strict` is currently red — which contradicts the roadmap's "0 runtime cycles" claim and is worth its own report.
