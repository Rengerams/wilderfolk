# Affair exposure reason ignores its inputs and always rolls a flat 22% 'caught', which jails and always divorces

- **Bug:** Affair exposure reason ignores its inputs and always rolls a flat 22% 'caught', which jails and always divorces
- **Status:** resolved
- **Date discovered:** 2026-09-13
- **Version/build:** 0.6.4
- **Reporter:** full simulation-logic audit (audit agent A9-humanRelationships; adversarially verified) — audit id H10
- **Area:** Truth
- **Owner module:** `src/game/simulation/humanRelationships.ts`
- **Cadence:** see fix; the owning cadence is stated in `docs/archive/SIMULATION_AUTHORITY.md` §3–4

## Status history

- 2026-09-13 — open (found by automated simulation-logic audit, confirmed by independent adversarial verification, re-verified by the lead)
- 2026-09-13 — resolved (P1 batch: fix applied at the owning module with a regression test; see **Fix**, **Regression test** and **Verification result**)

## Observed behavior

isValidAffairTarget (line 622) admits targets from HUMAN_ADULT_MIN_AGE = 16, so a 16-17-year-old single settler can become an established affair partner through the daily owner. tryDailyConception is called for every non-prisoner player human (humanTick.ts:330), so that settler then rolls the full adult affair rate 0.14 x fertility (fertility = 1 up to age 35) - roughly 45x (age 17) to 60x (age 16) the youth-gate chance (0.0045 x 0.50 at 16) - with no mutual youth-love link and no age check, contradicting SIMULATION_AUTHORITY.md section 5: "At ages 14-17 it requires the documented mutual youth-love, nearby, energy, and reduced-probability gate".

## Expected behavior

Restrict the affair branch to adults, e.g. add `&& !(entity.age >= HUMAN_FERTILITY_START && entity.age < HUMAN_YOUTH_FERTILITY_END)` to the condition at line 789 (or require `entity.age >= HUMAN_YOUTH_FERTILITY_END`), so ages 14-17 can only conceive through the youth branch.

## Reproduction steps

Static reproduction (no runtime repro was run during the audit):

1. Open `src/game/simulation/humanRelationships.ts` at lines 1043-1053, 1149-1153 | 789-799.
2. Note the offending code: `lines 789-799: the affair branch gates only on `hasAffairPartner(entity, ctx.entityById) && entity.energy > ... && !isSpouseNearby(...)` and then rolls `if (Math.random() < HUMAN_DAILY_AFFAIR_PREGNANCY_CHANCE * fertility) {` (line 799). The youth branch directly above instead requires `entity.age >= HUMAN_FERTILITY_START && entity.age < HUMAN_YOUTH_FERTILITY_END` (lines 754-755).`.
3. Follow the call path/guard described under **Root cause** — that path is reachable in normal play.

## Evidence

Adversarial verification note (an independent agent re-read the code and the call sites):

> pickAffairExposureReason (1043-1053) discards `_cheater/_lover/_humans` and returns 'caught' on a flat 22% roll gated only by hasStaffedPrison (1036-1041, any completed prison with a guard anywhere), and both daily-gossip call sites (326, 342) feed that verdict to exposeAffair, where 'caught' arrests both partners (1149-1152) and calls tryDivorceOnCaughtCheater(..., true), whose caughtInAct=true skips the isSpouseNearby gate (982) and forces divorceChance = 1 (986). Because the gossip gate only needs affairProgress ≥ 45/85 and no witness check at all, a pair that is merely gossiped about can be jailed and forcibly divorced with no spouse or guard present while the log asserts they 'were caught'. Fix: make the reason evidence-based inside the helper (spouse/guard proximity from the arguments it already receives) or have the daily gossip path pass 'rumor'.

## Root cause

pickAffairExposureReason (1043-1053) discards `_cheater/_lover/_humans` and returns 'caught' on a flat 22% roll gated only by hasStaffedPrison (1036-1041, any completed prison with a guard anywhere), and both daily-gossip call sites (326, 342) feed that verdict to exposeAffair, where 'caught' arrests both partners (1149-1152) and calls tryDivorceOnCaughtCheater(..., true), whose caughtInAct=true skips the isSpouseNearby gate (982) and forces divorceChance = 1 (986). Because the gossip gate only needs affairProgress ≥ 45/85 and no witness check at all, a pair that is merely gossiped about can be jailed and forcibly divorced with no spouse or guard present while the log asserts they 'were caught'. Fix: make the reason evidence-based inside the helper (spouse/guard proximity from the arguments it already receives) or have the daily gossip path pass 'rumor'.

## Fix

The daily gossip path (`tryDailyAffairGossip`) now passes `'rumor'` unconditionally, and `pickAffairExposureReason` plus its `hasStaffedPrison` helper are deleted. `exposeAffair` treats `'caught'` as arrest + forced divorce, and the caught-in-the-act verdict is a spatial decision that `tryExposeCaughtAffair` already owns — it requires `isSpouseNearby(cheater) || isSpouseNearby(paramour) || walkInAtHome` before it can expose anything. A merely gossiped-about pair can no longer be jailed and divorced while the Chronicle claims they were caught, and the flat `Math.random()`-style roll disappears with the helper.

## Regression test

`tests/affairExposure.rumour.test.ts` (1) — with an established mutual affair, a staffed prison and both spouses far away, the scandal reads "Whispers spread about …" (never "was caught with"), neither partner is imprisoned, the marriage survives, reputation still drops, and the affair pair is cleared.

## Invariants checked

Relevant hard invariants: `docs/archive/SIMULATION_AUTHORITY.md` §5. After the fix, `simulation/simulationInvariants.ts` and `simulation/simInvariants.ts` must stay clean in the existing invariant tests.

## Save/migration impact

None expected: the field(s) written here either already round-trip or are derived at load. Confirm with the save round-trip tests if state fields are touched.

## Verification result

`npm run test:all` and `npm run test:full-year` pass. Expected behavioural shift: for the same amount of gossip the colony sees more rumours and fewer imprisonments/divorces, because "caught" now requires a witness.

## Related commits or files

- `src/game/simulation/humanRelationships.ts` (lines 1043-1053, 1149-1153 | 789-799)
- Consolidated report: `BUG_REPORTS/2026-09-13-simulation-logic-audit.md` (audit id H10)
