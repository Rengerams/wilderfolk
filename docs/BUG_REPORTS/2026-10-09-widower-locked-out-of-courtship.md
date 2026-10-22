# Widower locked out of courtship — the surviving spouse kept `expecting` after the pregnant partner died: 2026-10-09

- Bug: a settler whose pregnant spouse died kept `relationshipStatus: 'expecting'` for the rest of their life, and the courtship gate accepts only `'single'` — so that widow or widower could never court or marry again (the owner's Landon #1272)
- Status: resolved
- Date discovered: 2026-10-09
- Version/build: 0.6.5.0 (the `_version` both of the owner's saves carry; fixed in the working tree)
- Reporter: owner — *"check the remarriages if dont happen"*
- Area: Truth
- Owner module: `src/game/humanLifecycleCleanup.ts` (death/removal cleanup and the per-tick marriage-link repair); the gate is `src/game/simulation/humanRelationships.ts` (`isEligibleToCourt`), and the writer that strands the status is `startMarriedPregnancy` in that same module
- Cadence: death cleanup (`killHuman` → `finalizeHumanDeath`), plus every tick (`reconcileOrphanedMarriages`)

## Status history

- 2026-10-09 — open (measured on the owner's own saves: the colony remarries normally, but one settler — Landon #1272 — was permanently `'expecting'` with no partner and no pregnancy)
- 2026-10-09 — resolved (the survivor's status is now derived from their own pregnancy instead of from `'married'`; the owner's own save repairs him on the first tick after load)

## Observed behavior

**The owner's suspicion is mostly wrong, and the measurement says so.** Loading `wilderfolk-New-Frontier-Y3-D183` (tick 65016, Year 3 day 903, 1643 living player settlers) and ticking it forward 8 in-game days (tick 65016 → 65592):

- **16 new marriages**, of which **8 involve a settler who was previously widowed or divorced** — 2 of the 28 reconstructed widows and 6 of the 65 divorced settlers married again inside 8 days.
- **44 new courtship pairs**, of which 9 involve a previously widowed or divorced settler.
- The eligible pool at load was 292 adults: 28 widowed (all with `partnerId == null`, all passing the gate), 65 divorced (all passing the gate), 199 never-married. 52 of the 65 divorced and 22 of the 28 widows were already in an active courtship at load, so they were in the pipeline, not frozen out of it.
- Day-by-day: day 1 = 3 marriages / 0 remarriages, day 2 = 8 / 2, day 3 = 11 / 5, day 4 = 12 / 6, day 5 = 12 / 6, day 6 = 15 / 7, day 7 = 16 / 8, day 8 = 16 / 8.

**Against that, exactly one settler in the same save can never marry again — and he is a widower.** `#1272 Landon`, male, age 25, generation 2:

```
relationshipStatus: "expecting"
pregnant:            absent (not pregnant, ever)
partnerId:           absent (no spouse)
pastPartnerTicks:    {} (never divorced)
griefUntilTick:      50112  — long expired at tick 65016
childrenIds:         [2976, 3113, 9217, 14122]
```

Three of his children (#3113, #9217, #14122) name mother `#1356`, and `#1356` is **absent from the save** — she died while she was the pregnant one. Because `isEligibleToCourt` requires `relationshipStatus === 'single'`, Landon fails the courtship gate on that single field and can never be offered a partner again. The gate's own verdict, printed from the shipped predicate: `isEligibleToCourt(Landon) = false`, blockers `[status=expecting]`.

The second owner save, `wilderfolk-New-Frontier-Y3-D3` (tick 52086, day 723, 1318 living humans), carries **the same settler in the same state** — the corruption is durable, survives save/load, and was already 120 in-game days old when the newer save was written.

## Expected behavior

- A marriage ends when a partner dies, so the survivor's civil status must describe the survivor: `'single'`, or `'expecting'` **only while the survivor's own pregnancy is still running**.
- `isEligibleToCourt` (`simulation/humanRelationships.ts`) is the one rule that decides whether a settler may start a courtship, and it accepts `relationshipStatus === 'single'` only. Nothing may leave a settler in a marriage status that no living relationship can ever resolve.
- Conception marks **both** spouses `'expecting'` (`startMarriedPregnancy`), and only the birth clears the father (`clearExpectingStatus`, called from the delivering mother's tick). So the status must be re-derived from `pregnant` — not from the old status string — wherever a marriage is torn down.

## Reproduction steps

1. Load the owner's save and tick it once. On `wilderfolk-New-Frontier-Y3-D183`:
   `npx tsx <probe loading saveLoad.parseSaveJson + loadGameFromParsed, world.paused = false>`
   — before any tick `#1272` reads `status=expecting pregnant=undefined partnerId=undefined` and `isEligibleToCourt=false`; one `gameTick(world)` gives `status=single` and `isEligibleToCourt=true`.
2. Unit level, no save needed (`tests/courtship.exclusivity.test.ts`): give a couple `relationshipStatus: 'expecting'` on both sides with `pregnant: true` on the wife, call `killHuman(wife, [], entityById, TICKS_PER_DAY)`, and read the husband: before the fix he stays `'expecting'`; after it he is `'single'` and `isEligibleToCourt` is true. In-game, the same sequence is a pregnant wife dying before delivery (illness, old age, raid, accident).
3. The durable half: build a settler with `relationshipStatus: 'expecting'`, no `partnerId` and `pregnant` unset, and call `reconcileOrphanedMarriages([...])` — the per-tick pass `gameTick` runs over `allAlive` (`gameTick.ts:289`). Before the fix it was skipped (`relationshipStatus !== 'married'`), so the state could never be repaired in an existing save.

## Evidence

- **Landon #1272's exact fields**, read from the raw save and from the loaded world: `relationshipStatus "expecting"`, `pregnant` absent, `partnerId` absent, `pastPartnerTicks {}`, `griefUntilTick 50112`, `childrenIds [2976,3113,9217,14122]`; the mother of three of those children (`#1356`) is not in the save. The child record (`children[].motherId` / `fatherId`) is the only surviving witness of a dead spouse — `relationshipStatus` never says `'widowed'` (that union member is declared in `gameTypes.ts` and assigned nowhere in `src/`).
- **The gate verdict**, from the exported predicate on the owner's loaded world: `isEligibleToCourt=false`, blockers `[status=expecting]` before; `isEligibleToCourt=true`, blockers `[]` after one tick.
- **The colony measures**: 1643 living player settlers at load; statuses `single 1172 / married 422 / expecting 49`; 28 reconstructed widows and 65 divorced settlers, all `partnerId == null`, all gate-eligible; 8-day run over tick 65016 → 65592 with 16 new marriages (8 involving a previously widowed or divorced settler) and 44 new courtship pairs (9 involving them).
- **The same defected settler in both saves** (`Y3-D183` day 903 and `Y3-D3` day 723), which is what makes this a durable state rather than a transient one.
- **Origin of the state**: `startMarriedPregnancy` sets `'expecting'` on both partners; `clearExpectingStatus` runs only from the delivering mother; `finalizeHumanDeath` converted the survivor only `if (partner.relationshipStatus === 'married')`. A dying pregnant wife therefore leaves a husband whose `'expecting'` nothing in the codebase can clear.

## Root cause

`relationshipStatus: 'expecting'` is a *pair* status: conception writes it to both spouses, but only the **mother's** delivery clears the father's half (`humanLifecycle.tickPregnancyAndBirth` → `clearExpectingStatus(husband)`). `finalizeHumanDeath` re-derived the surviving partner's status only from `'married'`, so when the pregnant partner died first the survivor was left `'expecting'` with `partnerId` cleared — a status that names a marriage that no longer exists and a pregnancy that was never his. `reconcileOrphanedMarriages`, the per-tick safety net for exactly this class of broken link, skipped it too: its guard was `relationshipStatus !== 'married'`, and it required a non-null `partnerId`, which the death path had already cleared. Nothing could ever reach the settler again: no birth, no divorce, no death. Since the only courtship gate (`isEligibleToCourt`) accepts `'single'`, he was permanently out of the marriage pool, and every save wrote the state back.

## Regression test

`tests/courtship.exclusivity.test.ts` — a new `describe('a widowed settler may court again (owner, 2026-10-09)')` with four cases:

- `frees a widower whose wife died before the birth — the expecting status was hers, not his` — **failed before** (`expected 'single', received 'expecting'`), passes now; asserts `partnerId` cleared, `relationshipStatus === 'single'`, `isEligibleToCourt(...) === true`, and that `findCourtshipPartner` now offers him a free settler.
- `repairs a status left expecting with no partner and no pregnancy of its own` — **failed before**, passes now; the durable-state half (`reconcileOrphanedMarriages`).
- `leaves a pregnant widow expecting, because that pregnancy is still hers` — guard: the fix must not clear a pregnancy the survivor actually has.
- `still frees a widow whose marriage ended without a pregnancy` — guard: the ordinary widowing path is unchanged.

Before the fix: `2 failed | 14 passed (16)`. After: `16 passed (16)`.

## Invariants checked

- A status that names a marriage (`'married'`, or `'expecting'` without a pregnancy of the settler's own) requires a resolvable partner; `reconcileOrphanedMarriages` now enforces that for `'expecting'` exactly as it already did for `'married'`.
- A pregnancy survives its partner: a pregnant widow keeps `'expecting'` until she delivers, and the birth path then puts her at `'single'`.
- `collectSimulationInvariantErrors` is unaffected (`tests/familyReference.afterRemoval.test.ts` still green). Note for a follow-up, not done here: that collector has no rule for a marriage status without a marriage, which is why this state could sit in a save for 120 days.

## Save/migration impact

None — no version bump, no migration marker, nothing rewritten at load. The repair is idempotent and runs on the first tick after load (`reconcileOrphanedMarriages` is called with `allAlive` at the end of every `gameTick`), so existing saves heal themselves without touching anything else: on the owner's save the 93 watched widowed/divorced settlers had **0** status changes across two ticks, and the only status change in the first tick was Landon's own.

## Verification result

On the owner's save `wilderfolk-New-Frontier-Y3-D183`, loaded fresh (`parseSaveJson` + `loadGameFromParsed`, `world.paused = false`), with the shipped code:

- before any tick: `#1272 Landon status=expecting pregnant=undefined partnerId=undefined age=25.0 | isEligibleToCourt=false blockers=[status=expecting]`
- after the load (no tick): still `expecting` — the load path does not touch him; the tick repair does
- after tick 1: `#1272 Landon status=single pregnant=undefined partnerId=undefined | isEligibleToCourt=true blockers=[]`
- after tick 2: byte-identical to tick 1 (idempotent: `true`)
- watched group (28 widowed + 65 divorced = 93 settlers): statuses changed by tick 1 = 0, changed after two ticks = 0

Commands:

- `npx vitest run tests/courtship.exclusivity.test.ts` — before the fix `2 failed | 14 passed (16)`; after `16 passed (16)`
- `npx vitest run tests/courtship.exclusivity.test.ts tests/familyReference.afterRemoval.test.ts tests/humanLifecycle.test.ts tests/low-3-moon-lifecycle.test.ts tests/animalCare.orphanRelease.test.ts tests/pairDialogue.orphanReclaim.test.ts` — 6 files / 41 tests passed (the death-cleanup blast radius)
- `npm run test:types` — PASS (`tsc -p tsconfig.vitest.json --noEmit`, exit 0)
- `npx oxlint --type-aware src/game/humanLifecycleCleanup.ts tests/courtship.exclusivity.test.ts` — 0 warnings, 0 errors
- `node scripts/check-comments.mjs` — **failed on a file this change does not touch** (`tests/immigration.composition.test.ts:4`, another agent's in-flight edit); my two files add no violation (the report names the one file it found)
- `npm run lint` — **failed on files this change does not touch** (`src/game/rivalEvents.ts:203` unused `ctx`, `src/components/tabPanels/MoreTabPanel.tsx:154/156`, both another agent's in-flight edits). Scoped to my two files the same linter is clean: `npx oxlint --type-aware src/game/humanLifecycleCleanup.ts tests/courtship.exclusivity.test.ts` → 0 warnings, 0 errors

## Related commits or files

- `src/game/humanLifecycleCleanup.ts` — `statusAfterMarriageEnd`, `finalizeHumanDeath`, `reconcileFamilyReferencesAfterRemoval`, `reconcileOrphanedMarriages`
- `src/game/simulation/humanRelationships.ts` — `isEligibleToCourt` (the one courtship rule), `startMarriedPregnancy` (the writer of the pair status), `tryCompleteCourtshipMarriage`
- `src/game/simulation/humanLifecycle.ts` — `clearExpectingStatus` / `tickPregnancyAndBirth` (the only other clearer)
- `tests/courtship.exclusivity.test.ts` — the four regression cases
- No commit was made (the task forbids it); the change is in the working tree

## Fix

In `src/game/humanLifecycleCleanup.ts` the status a settler holds once a marriage ends is now derived from the settler's own pregnancy in one place, `statusAfterMarriageEnd(entity) → entity.pregnant ? 'expecting' : 'single'`, and it is applied wherever a marriage link is torn down:

- `finalizeHumanDeath` — the surviving partner's status is reset when it is `'married'` **or** `'expecting'`, so a father's `'expecting'` cannot outlive the pregnancy that set it.
- `reconcileFamilyReferencesAfterRemoval` — the same extension on the survivor branch, which the load path (`reconcileDanglingReferencesOnLoad`) also calls.
- `reconcileOrphanedMarriages` — the per-tick repair now asks the status-first question ("does this settler hold a status that names a marriage with no resolvable partner?") instead of the partner-first one, so a status left over with `partnerId` already cleared — Landon's exact shape — is repaired too, and an existing save heals on its next tick.
