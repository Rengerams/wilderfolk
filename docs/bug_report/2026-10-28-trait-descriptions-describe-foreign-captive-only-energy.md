# Hardy, Greenthumb and Fierce descriptions describe an energy path only foreign captives take

- Bug: three trait descriptions promise an energy-loss benefit that the code applies only in the foreign-captive branch of the human tick, so a player settler never receives it.
- Status: resolved
- Severity: low
- Date discovered: 2026-10-28
- Version/build: 0.6.5.1 sources on branch `codebot-tasks` (personality/career 0.6.5.2, PR B)
- Reporter: trait integration audit of the existing `traitMultiplier` call sites
- Area: human needs / settler traits / inspector copy
- Owner module: `src/game/simulation/humanNeeds.ts` — `humanEnergyLoss`; labels in `src/game/settlerTraits.ts` (`TRAIT_DEFS`)
- Related PR/commit: PR B (branch `codebot-tasks`), no fix applied there

## Status history
- 2026-10-28 — open: `traitMultiplier` calls for these three traits exist only inside `humanEnergyLoss`, whose single live caller is guarded by `entity.warCaptive && !isPlayerHuman`.
- 2026-10-28 — resolved: the player physiology owner reads the catalog's physiology/labor factor on its work drain, so Hardy finally reaches a player settler, and Greenthumb and Fierce describe the effects they really carry. Typecheck, lint, build and the trait suites pass.

## Observed behavior
The inspector shows:
- Hardy — *"Loses energy 15% slower — works the frontier longer."*
- Greenthumb — *"Farms yield more and winters cost less."*
- Fierce — *"Passionate and determined — burns energy slower on the job."*

`humanEnergyLoss` (`src/game/simulation/humanNeeds.ts:123-171`) is the only place that reads `hardy`, `fierce` and the winter term of `greenthumb`. Its only caller is `src/game/humanTick.ts:652`, inside `if (entity.warCaptive && !isPlayerHuman)`. Player settlers instead run `advanceHumanNeeds` from `simulation/humanPhysiology.ts`, which contains no trait terms at all. Consequence: a player settler's energy drains identically with or without Hardy or Fierce, and winter costs the same with or without Greenthumb.

## Expected behavior
A trait description shown in the inspector must reflect an effect the player's own settlers actually receive, in a context the game can reach.

## Reproduction steps
1. Check out branch `codebot-tasks` at commit `f8c7b792`.
2. `grep -rn "humanEnergyLoss" src` — definition plus one call site in `humanTick.ts`.
3. Read that call site: it sits inside the `warCaptive && !isPlayerHuman` branch.
4. `grep -rn "hardy\|fierce\|greenthumb" src/game/simulation/humanPhysiology.ts` — no matches.
5. Observe in play that two settlers differing only in Hardy lose the same energy over a work day.

## Evidence
- `src/game/simulation/humanNeeds.ts:138,169,170` — the three `traitMultiplier` reads.
- `src/game/humanTick.ts:650-657` — the only invocation, foreign-captive-only.
- The `humanMeals` entry in `src/game/simulation/decisionRegistry.ts` records the same finding from the Phase B audit.

## Root cause
The energy model for player humans moved to `humanPhysiology.ts` while `humanEnergyLoss` kept its legacy trait terms for foreign captives; the descriptions were never updated to match which population the rule serves. A further gap: Hardy had no reachable effect for a player at all, because the catalog entry that describes its endurance was itself unconsumed.

## Fix / proposed fix
Fixed in two minimal parts, both inside the owners the report names.
1. `humanPhysiology.advanceHumanNeeds` divides a negative stamina rate by the catalog's `physiology`/`labor` factor. That is the first live consumer of Hardy's endurance entry, and it also makes Graceful's existing heavy-labor drawback reachable. No hand-written trait multiplier was added: the catalog stays the single source.
2. Copy now names live effects: Hardy "tires more slowly on hard work", Greenthumb "a patient hand with crops — farms yield more", Fierce "presses for severity over a captive and quarrels easily" (the war-reaction and feud-clash rules it really drives).
The captive `humanEnergyLoss` terms are untouched, so foreign-captive legacy behaviour is unchanged.

## Save/migration impact
None. Only derived stamina changes; no persisted field, save key or migration is touched.

## Verification result
- PASS: `tests/personality.physiologyIntegration.test.ts` drives the real mutator: after two hours of work a Hardy settler keeps more stamina than a plain one, a Graceful settler keeps less, and an untraited settler stays on the documented 9-per-hour drain.
- PASS: the same file asserts the Hardy, Fierce, Greenthumb and Nurturing descriptions no longer promise energy, winter or maturation effects.
- PASS: `npm run test:types`, `npm run lint`, `npm run build`, and the 22 changed-module suites (191 tests) plus the three personality suites (18 tests).
- PASS: `tests/humanNeeds.calibration.test.ts` and `tests/humanNeeds.mealRule.test.ts` still hold the untraited calibration and the captive meal rule.
- NOT RUN: a multi-day player-visible survival comparison of a Hardy colony; the balance delta is the catalog's own 6% labor factor, not a new tuned number.
