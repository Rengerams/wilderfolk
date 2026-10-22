# The youth-love handoff was unreachable and courtships were neither exclusive nor cleaned up: 2026-09-16

- Bug: the youth-love → courtship promotion only fired for pairs whose 18th birthdays fall in the same in-game year, and courtship links were neither exclusive nor cleared when they ended
- Status: resolved
- Date discovered: 2026-09-16
- Version/build: 0.6.4
- Reporter: lifecycle/social audit (`docs/private/audits/2026-09-16/sim-lifecycle-social.md`, findings F3 and F5)
- Area: Truth
- Owner module: `simulation/humanRelationships.ts` (youth love, courtship), `humanTick.ts` (realtime courtship), `humanLifecycleCleanup.ts` / `nameLoader.ts` (death and divorce cleanup)
- Cadence: per colony day (youth love, courtship reconciliation) and per tick (courtship approach)

## Status history

- 2026-09-16 — open (found by the lifecycle/social audit; F3 runtime-reproduced, F5 runtime-reproduced for the validity gap and code-traced for the display consequence). Both were filed as needing an **owner ruling** because the governing documents were believed missing
- 2026-09-16 — resolved (both ruled from `docs/archive/YOUTH_LOVE_FEATURE.md`, which does exist: F3 is the documented "one is 18 and one is 17 → keep the link until the younger partner comes of age → hand off", and F5 follows the one-route-at-a-time rule youth love, affairs and marriage already enforce)

## Observed behavior

**F3.** `reconcileYouthLove` cleared a youth-love link when `Math.max(entity.age, partner.age) > HUMAN_MOVE_OUT_MIN_AGE`, and `advanceYouthLove` runs that reconciliation for every settler *before* its promotion loop. Ages advance in whole in-game years, so a pair one year apart reaches (19, 18) on the day the younger partner turns 18 — the reconciliation cleared the link first, so `promoteYouthLoveToCourtship` fired only for pairs whose 18th birthdays fall inside the same year. Every other pair was dropped silently: no "grew apart" event, no carried progress, and `advanceYouthLove` had no test to notice.

**F5.** `isCourtshipCandidate` tested eligibility but not availability, so a settler already in a mutual courtship stayed a legal target for a third settler — and `humanTick` then overwrote the target's link (`closest.courtshipPartnerId = entity.id`), orphaning the previous partner's half, which failed the mutuality test in `findCourtshipPartner` and was never repaired. `courtshipProgress` is a per-settler field, so the orphan kept its progress and the renderer's 💕 badge, a newly approached settler inherited the abandoned pair's progress, and nothing cleared either field when a courtship ended without marriage (death cleanup, divorce and the reference sweep all covered `partnerId` / `affairPartnerId` / `youthLove*` but not courtship).

## Expected behavior

`docs/archive/YOUTH_LOVE_FEATURE.md` (the feature's authority, and present in the tree):

- "**One is 18 and one is 17** | Keep the valid youth link temporarily. | The pair can wait for the younger partner to reach 18; adult courtship remains blocked for the already-18 partner while the link exists."
- "**Both reach 18** | Hand off to adult courtship."
- "**One reaches 19 before handoff** | Clear the stale youth link." — a link that can never promote is still cleared.
- Courtship is one of four relationship routes (youth love, courtship/marriage, affairs), each exclusive in the code: `isEligibleToCourt` refuses a settler with a `youthLovePartnerId`, marriage clears both courtship fields, and an affair is a single `affairPartnerId`. A mutual courtship being stealable was the only route without that rule.

## Reproduction steps

1. `npx vitest run tests/youthLove.handoff.test.ts` — with the old `Math.max(age) > HUMAN_MOVE_OUT_MIN_AGE` clause restored, the two handoff cases fail (`expected undefined to be 2`); they pass with the fix.
2. `npx vitest run tests/courtship.exclusivity.test.ts` — with the exclusivity clause removed, *does not offer a settler who is already in a mutual courtship to a third settler* fails (the third settler is offered the taken partner); with the survivor sweep removed, *clears the survivor's half of a courtship when the partner dies* fails.
3. Audit repro `tmp/audit-2026-09-16/repro-lifecycle.mts` §1/§1b/§5 recorded the original behaviour (ages 16/15: `CLEARED without promotion at colony day 1080 (ages 19/18)`; same-birthday pair: `PROMOTED`; `findCourtshipPartner(#3, …)` returning an already-courting partner).

## Evidence

- `src/game/simulation/humanRelationships.ts` — `reconcileYouthLove` (the removed cap), `promoteYouthLoveToCourtship` (the handoff it made unreachable), `isCourtshipCandidate`, `bindCourtship`, `reconcileCourtships`.
- `src/game/humanTick.ts` — the courtship approach (`bindCourtship` + shared progress) and the `activeCourtships` diagnostic.
- `src/game/humanLifecycleCleanup.ts`, `src/game/nameLoader.ts` — the death and divorce cleanup paths that missed courtship.
- Tests: `tests/youthLove.handoff.test.ts` (5), `tests/courtship.exclusivity.test.ts` (7).

## Root cause

**F3 — two rules that could not both be true.** The adult-age cap in `reconcileYouthLove` encoded "a youth state must never linger into adult life", and the promotion gate encoded "hand off when both are 18". With whole-year ages and different birthdays, the cap always won, so the promotion helper (and its documented carried progress of 25–70) was dead code for real age gaps. The feature document resolves the conflict: the link may persist while the younger partner is 12–17, the handoff happens when both are adults, and only a link that *cannot* promote is cleared — which is what the age-gap rule and the other eligibility clauses already decide.

**F5 — availability was never part of candidacy.** `isCourtshipCandidate` answered "may this settler court?" but not "is this settler free?", and the caller then wrote both sides of the link unconditionally. Nothing owned the *ending* of a courtship either: the death, divorce and removal paths each cleared the fields they knew about, and courtship fields were in none of the lists.

## Regression test

- `tests/youthLove.handoff.test.ts` (5) — a (18, 17) pair keeps its link and gains no courtship; a (19, 18) pair hands off with reciprocal `courtshipPartnerId`, progress 25–70 and no marriage; a retained pair at the age-gap bound hands off; a pair past the gap bound is cleared; a partner who is no longer single clears the link.
- `tests/courtship.exclusivity.test.ts` (7) — a third settler is never offered a settler in a mutual courtship; the caller's own mutual partner is still re-selected; `bindCourtship` starts a new pair at zero and leaves an existing pair's progress alone; `reconcileCourtships` dissolves a link whose partner moved on (both sides, progress reset) and keeps a valid one; death clears the survivor's half; divorce clears a stale link.

Sensitivity was verified by restoring each old behaviour one at a time: F3's cap → 2 of 5 fail; F5's exclusivity clause → 1 of 7 fails; F5's survivor sweep → 1 of 7 fails.

## Invariants checked

- `npm test` — 166 files / 898 tests passed (the two new files are 12 of them).
- `npm run test:full-year` (360 days / 25 920 ticks, seed 12345) — exit 0. Totals moved, as expected for a deliberate relationship-path change: marriages 48 → 54, divorces 33 → 40, scandal events 183 → 187, caught scandals 17 → 21, births 27 → 24, settlers 69 → 67, conceptions 22 → 19. The two findings share the `humanRelationships` stream, so one seed cannot attribute the movement between them.
- `npm run build`, `npm run test:types`, `npm run lint` (0/0) — all green.
- `npm run test:browser` — verdict pass, 0 console / page / request errors (courtship is realtime, so the browser tier covers the approach path).

## Owner confirmations (2026-09-16)

Both youth-love boundaries were confirmed by the owner while reviewing this fix, and both are the same
ruling shape — the constant is intended, the document was stale:

- **`YOUTH_LOVE_MIN_AGE = 12`, not the documented 14.** Ruled 2026-09-13 ("a nice function, but at 14–17
  it never happens in play") and re-confirmed today. The documents were corrected then
  (`docs/archive/YOUTH_LOVE_FEATURE.md`, `README.md`); the constant now carries the ruling in a comment
  so a later reader does not re-file it — a 2026-09-13 audit did report 14 as the correct value and the
  finding was withdrawn as intended behaviour.
- **`YOUTH_LOVE_MAX_AGE_GAP = 4`, not the documented 2.** The constant was right and the feature
  document said 2 in two places; it now says 4 in both, with the reason. This is also what bounds the
  F3 wait: at a 4-year gap, a pair whose older partner has come of age waits at most four years for the
  younger one to reach 18, and the handoff clears instead if the gap itself is exceeded.
- **`YOUTH_LOVE_MAX_AGE_EXCLUSIVE = HUMAN_MOVE_OUT_MIN_AGE` (18)** is unchanged: youth love may not
  *start* at 18+, which is what keeps the retention rule in this fix from creating a new youth link
  between adults.

## Save/migration impact

None. Both fixes only write existing optional fields (`courtshipPartnerId`, `courtshipProgress`, `youthLove*`) that already live in the save, the prep payload and the tick delta; no field, format or version change. A pre-fix save loads with whatever it stored and is repaired by the daily `reconcileCourtships` and the next `advanceYouthLove`.

## Verification result

- `npx vitest run tests/youthLove.handoff.test.ts tests/courtship.exclusivity.test.ts` — 12 passed.
- Each old behaviour restored one at a time to prove the guards fail first (2/5, 1/7, 1/7 as above), then reverted; `Select-String` for the temporary markers returns nothing.
- `npm test` — 166 files / 898 tests passed; `npm run test:full-year` — exit 0 with the totals above; `npm run build` / `npm run test:types` / `npm run lint` — green.
- `npm run test:full-year` re-run with `YOUTH_LOVE_MAX_AGE_GAP` temporarily set to the document's 2 produced **identical** totals — and the owner has since ruled the constant **4** is intended (the 2-year bound made youth love effectively never form in play), so the document was corrected to the code, exactly as with `YOUTH_LOVE_MIN_AGE = 12`. See "Owner confirmations" below.

## Related commits or files

- `docs/private/audits/2026-09-16/sim-lifecycle-social.md` — F3, F5
- `docs/archive/YOUTH_LOVE_FEATURE.md` — the ruling source (age timeline, handoff calculation, edge-case table)
- `src/game/simulation/humanRelationships.ts`, `src/game/humanTick.ts`, `src/game/tickLayerDaily.ts`, `src/game/humanLifecycleCleanup.ts`, `src/game/nameLoader.ts`

## Fix

**F3 — the documented handoff, not the accidental cap.** `reconcileYouthLove` no longer clears on `Math.max(age) > HUMAN_MOVE_OUT_MIN_AGE`. An existing youth-love link survives the older partner's 18th birthday while the younger is still 12–17 (the document's "one is 18 and one is 17 → keep"), and `advanceYouthLove` promotes the pair on the first daily pass where both are adults, carrying the documented 25–70 progress into mutual adult courtship. The wait is bounded by the same age gap that allowed the pair to form (`YOUTH_LOVE_MAX_AGE_GAP`), because the younger partner is then at most that many years from the adult floor; the other reconciliation clauses (death, one-sided link, prison, adult partner, non-`single` status, gap over the limit) still clear a link that cannot promote. New starts still require being under 18 (`isEligibleForYouthLove`), so nothing about the youth band's entry gate changed.

**F5 — one courtship at a time, and no leftover links.** `isCourtshipCandidate` now refuses a candidate who is courting someone other than the caller (`candidate.courtshipPartnerId == null || === entity.id`), which keeps the caller's own mutual partner re-selectable while closing the steal path. A new owner function `bindCourtship(entity, partner)` — called by `humanTick` — starts a **new** pair at zero progress instead of inheriting the abandoned pair's value. `reconcileCourtships(ctx)` (new, called daily from `tickLayerDaily`) dissolves a link whose pair is no longer mutually eligible, clearing both sides' link and progress so exclusivity cannot lock a settler out of courting. `finalizeHumanDeath` clears the dying settler's courtship fields and `reconcileFamilyReferencesAfterRemoval` clears the survivor's half; `clearMarriageLinks` (divorce) clears the partner id as well as the progress; and the nightly `activeCourtships` diagnostic counts only pairs whose two sides name each other.
