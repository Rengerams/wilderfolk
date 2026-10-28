# Brave and Timid's danger strength was flattened silently by the trait catalog migration

- Bug: moving the danger multipliers onto `evaluateTraitInfluence` replaced Brave's ×1.25 hunt reach, ×1.20 closing speed and Timid's ×1.35 flight speed with values inside the new-effect band, and the branch's tests only asserted the direction of the effect, so the change went unnoticed.
- Status: resolved
- Severity: medium
- Date discovered: 2026-10-28
- Version/build: 0.6.5.1 sources on branch `codebot-tasks` at `971b23c6` (personality/career 0.6.5.2, PR #90)
- Reporter: independent review of PR #90 (found after the branch's own tests were green)
- Area: hunting, predator flight, settler traits
- Owner module: `src/game/personality/traitEffectCatalog.ts` (data) and `src/game/personality/traitEvaluation.ts` (combination); consuming sites `src/game/humanHuntingBehavior.ts` and `src/game/humanTick.ts`
- Related PR/commit: PR #90, fixes pushed on the same branch

## Status history
- 2026-10-28 — open: review compared the pre-catalog literals with the catalog deltas and found the established magnitudes were not carried over; the phase-B tests only asserted "greater than 1", so they passed.
- 2026-10-28 — investigating: first proposal carried the three old values as an `establishedFactor` applied outside the new-effect cap.
- 2026-10-28 — resolved (superseded by an approved balance change): the PR B cutover decision in `docs/plans/personality-career-codebot-tasks-0.6.5.2.md` §1.2 permits retiring legacy DNA multipliers. The catalog now prices all three sites as ordinary bounded deltas, the `establishedFactor` mechanism is gone, and the change is documented as a balance change rather than a restored legacy number.

## Observed behavior
On `971b23c6`, `evaluateTraitInfluence` returned ×1.0455 for a Brave settler in the `danger`/`hunting` context and ×1.0536 for a Timid settler in `danger`/`escape`. Before the migration the same settler multiplied the hunt range by ×1.25, the chase speed by ×1.2 and the flee speed by ×1.35 (`traitMultiplier(entity, 'brave', 1.25)`, `… , 'brave', 1.2)`, `… , 'timid', 1.35)`).

The cause is structural: the catalog's `factorDelta` values describe *new* effects, and the evaluator deliberately squeezes them with diminishing returns and a `0.85..1.15` cap. Nothing in that path can express an absolute multiplier above the cap, and nothing in the branch said the magnitudes were meant to change.

## Expected behavior
Two things, and the defect is the gap between them:
1. **No silent change.** Any player-visible strength change must be an explicit, documented decision — the original defect was that the migration shrank three live effects while every test stayed green.
2. **Under the approved cutover**, the single catalog factor is the sole trait rule at each migrated decision, inside the `0.85..1.15` band, with no second legacy multiplier beside it. Brave keeps two distinct contexts (reach and closing speed) and Timid keeps one, so each site is still priced once and each trait still has a real, measurable effect.

## Reproduction steps
1. `docker compose -f docker-compose.base44.yml exec -T web npx vitest run tests/personality.defenseIntegration.test.ts` on `971b23c6` — passes, because the flight test only asserted `factor > 1`.
2. Evaluate the same contexts directly: `evaluateTraitInfluence({ traits: ['brave'] }, { kind: 'danger', activity: 'hunting' }).factor`, `… { kind: 'danger', activity: 'escape' }` for Timid.
3. Compare with the literals the two consuming files multiplied in before the migration (1.25, 1.2, 1.35).

## Evidence
- `src/game/humanHuntingBehavior.ts` before the migration: `config.huntRange * (isJobHunter ? 1.2 : 0.75) * traitMultiplier(entity, 'brave', 1.25)` and `const chaseMult = (isJobHunter ? 0.72 : 0.5) * traitMultiplier(entity, 'brave', 1.2);`.
- `src/game/humanTick.ts` before the migration: `const fleeMult = humanFleeMult * traitMultiplier(entity, 'timid', 1.35);`.
- `src/game/personality/traitEvaluation.ts` clamps `1 + factorDelta` into `[0.85, 1.15]`, so no catalog delta can express 1.35.
- Both consuming sites also collapsed two different Brave values (reach 1.25, chase 1.2) onto one shared `hunting` context.

## Root cause
PR B replaced the literals with catalog deltas (+0.05, +0.06) that were designed for *new* situational effects, not for carrying established magnitudes, and the integration tests only asserted the sign of the effect. The magnitude change was real but undisclosed.

## Fix
The `danger` entries are ordinary bounded catalog effects: `brave.huntingResolve` +0.06, `brave.relentlessPursuit` +0.05 (Brave's second site, kept as its own context) and `timid.earlyRetreat` +0.07 factor delta, each with its existing tendency term. The optional `establishedFactor` field and its evaluator path were removed, so the catalog cannot carry a second, uncapped legacy multiplier.

`humanHuntingBehavior` reads `HUNT_CONTEXT` for reach and `PURSUIT_CONTEXT` for closing speed; `humanTick` reads `ESCAPE_CONTEXT` for flight. No raw `traitMultiplier` trait branch remains at either site. The tests now pin the catalog direction and bound, both source call sites, and the fact that Brave's reach still targets game a plain settler cannot see — they no longer assert the retired percentages.

## Intentional balance change
This closes as an accepted balance change, not a restoration: both traits remain clearly beneficial in their own context, but their strength is now the catalog's bounded factor rather than the pre-migration multiplier. The same PR retires the other legacy DNA terms (Resourceful crew bonus, Chivalrous militia share, Insightful research count and the captive Greenthumb/Hardy/Fierce energy multipliers).

## Save/migration impact
None. These factors are derived at evaluation time and nothing new is persisted; older saves carry the same `traits` array and get the catalog's factors immediately on load.

## Verification result
- `npm run test:types` — PASS
- `npm run lint` — PASS (0 warnings, 0 errors)
- `npm run build` — PASS
- `npx vitest run tests/personality.traitCatalog.test.ts tests/personality.traitEvaluation.test.ts tests/personality.defenseIntegration.test.ts` — PASS; the catalog suite checks every effect for direction and the `0.85..1.15` bound, and the defense suite drives the real hunt and pins both consuming call sites.
