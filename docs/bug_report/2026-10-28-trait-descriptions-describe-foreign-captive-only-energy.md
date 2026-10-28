# Hardy, Greenthumb and Fierce descriptions describe an energy path only foreign captives take

- Bug: three trait descriptions promise an energy-loss benefit that the code applies only in the foreign-captive branch of the human tick, so a player settler never receives it.
- Status: open
- Severity: low
- Date discovered: 2026-10-28
- Version/build: 0.6.5.1 sources on branch `codebot-tasks` (personality/career 0.6.5.2, PR B)
- Reporter: trait integration audit of the existing `traitMultiplier` call sites
- Area: human needs / settler traits / inspector copy
- Owner module: `src/game/simulation/humanNeeds.ts` — `humanEnergyLoss`; labels in `src/game/settlerTraits.ts` (`TRAIT_DEFS`)
- Related PR/commit: PR B (branch `codebot-tasks`), no fix applied there

## Status history
- 2026-10-28 — open: `traitMultiplier` calls for these three traits exist only inside `humanEnergyLoss`, whose single live caller is guarded by `entity.warCaptive && !isPlayerHuman`.

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
The energy model for player humans moved to `humanPhysiology.ts` while `humanEnergyLoss` kept its legacy trait terms for foreign captives; the descriptions were never updated to match which population the rule serves.

## Fix / proposed fix
Not fixed here: giving player settlers a Hardy/Fierce energy benefit changes survival balance and belongs to the physiology owner, not to the Phase B trait integration. The minimal safe change is to reword the three descriptions to the effect the owner really performs (Greenthumb's farm yield, Hardy's and Fierce's remaining live effects), and, separately, decide with the owner whether the energy term should be ported into `humanPhysiology.advanceHumanNeeds`.

## Save/migration impact
None for copy-only rewordings. A physiology port would need its own balance pass and no persisted field.

## Verification result
- PASS: static trace above (call site guarded to foreign captives).
- NOT RUN: an in-game energy comparison; no fix is in this PR.
