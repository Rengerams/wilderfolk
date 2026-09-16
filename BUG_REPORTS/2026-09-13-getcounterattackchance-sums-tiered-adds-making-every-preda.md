# getCounterAttackChance sums tiered adds, making every predator counter-attack a guaranteed kill (1.0 chance)

- **Bug:** getCounterAttackChance sums tiered adds, making every predator counter-attack a guaranteed kill (1.0 chance)
- **Status:** resolved
- **Date discovered:** 2026-09-13
- **Version/build:** 0.6.4
- **Reporter:** full simulation-logic audit (audit agent A17-combat; adversarially verified) — audit id H1
- **Area:** Truth
- **Owner module:** `src/game/combat.ts`
- **Cadence:** see fix; the owning cadence is stated in `docs/archive/SIMULATION_AUTHORITY.md` §3–4

## Status history

- 2026-09-13 — open (found by automated simulation-logic audit, confirmed by independent adversarial verification, re-verified by the lead)
- 2026-09-13 — resolved (P1 batch: fix applied at the owning module with a regression test; see **Fix**, **Regression test** and **Verification result**)

## Observed behavior

Whenever Iron Spears has been forged (or Iron Swords researched), both nodes are researched, so researchedEffect(...,'add') returns 0.45 + 0.55 = 1.0 and this function returns 1.0. rollCounterAttack (combat.ts:157-159) computes roll = (hash % 1000)/1000 in [0, 0.999] and returns roll < chance, so it is always true: in tickLayerSystems.ts:394-403 every predator contact (Wolf, Fox, and the cursed Moon Howler) kills the predator instead of the settler, making predator deaths of settlers impossible late game. The explicit 0.55 / 0.45 fallback on line 133 is unreachable. getPredatorBlockChance (117-122) accumulates the same way (0.35 + 0.6 + 0.72 = 1.67); its Math.min(0.85, chance) cap masks the sum and makes the tier Math.max chance,0.72/0.6/0.35 branches dead, so the applied block rate is the cap rather than the researched tier.

## Expected behavior

Treat these as tier effects, not additive stacks: resolve the highest researched tier (e.g. if (hasIronSwords(state)) return 0.55; if (hasIronSpears(state)) return 0.45;) and keep any researched-effect override capped, e.g. return Math.min(0.85, add). Re-check getPredatorBlockChance after the same change.

## Reproduction steps

Static reproduction (no runtime repro was run during the audit):

1. Open `src/game/combat.ts` at lines 129-134 (add lookup 131-132); researchedEffect 30-52 | 129-133 (accumulation at 44-47; effect data at gameTypes.ts:925,929).
2. Note the offending code: `131:   const add = researchedEffect(state, 'counter_attack', 'add');
132:   if (add !== undefined) return add;
133:   return hasIronSwords(state) ? 0.55 : 0.45;
--- helper (combat.ts:47): if (mode === 'add' && effect.add !== undefined) value += effect.add;
--- data: defense_4 has { target: 'counter_attack', add: 0.45 }; defense_8 has { target: 'counter_attack', add: 0.55 } and prerequisites: ['defense_4', 'defense_6'].`.
3. Follow the call path/guard described under **Root cause** — that path is reachable in normal play.

## Evidence

Adversarial verification note (an independent agent re-read the code and the call sites):

> researchedEffect accumulates every matching researched node with `value += effect.add` (combat.ts:47), so once defense_4 ({counter_attack, add:0.45}, gameTypes.ts:925) and defense_8 ({add:0.55}, 929) are both researched — defense_8 requires defense_4 and defense_6 — getCounterAttackChance returns 1.0 exactly (129-134, the `hasIronSwords ? 0.55 : 0.45` fallback and the declared 45%/55% tiers become unreachable). rollCounterAttack computes roll in [0, 0.999] and returns `roll < chance` (148-160), so every wolf/fox/werewolf that reaches a settler with a forged weapon dies, including the Moon Howler (tickLayerSystems.ts:391-426), contradicting the project's own tier law 'Weapon/armor tiers replace lower ones — do not stack' (frontierCombat.ts:248). Fix: `if (add !== undefined) return Math.min(hasIronSwords(state) ? 0.55 : 0.45, add);`. High: guaranteed predator kills are a clearly wrong, player-visible combat outcome, but no state corruption.

## Root cause

researchedEffect accumulates every matching researched node with `value += effect.add` (combat.ts:47), so once defense_4 ({counter_attack, add:0.45}, gameTypes.ts:925) and defense_8 ({add:0.55}, 929) are both researched — defense_8 requires defense_4 and defense_6 — getCounterAttackChance returns 1.0 exactly (129-134, the `hasIronSwords ? 0.55 : 0.45` fallback and the declared 45%/55% tiers become unreachable). rollCounterAttack computes roll in [0, 0.999] and returns `roll < chance` (148-160), so every wolf/fox/werewolf that reaches a settler with a forged weapon dies, including the Moon Howler (tickLayerSystems.ts:391-426), contradicting the project's own tier law 'Weapon/armor tiers replace lower ones — do not stack' (frontierCombat.ts:248). Fix: `if (add !== undefined) return Math.min(hasIronSwords(state) ? 0.55 : 0.45, add);`. High: guaranteed predator kills are a clearly wrong, player-visible combat outcome, but no state corruption.

## Fix

`researchedEffect(state, target, 'add')` now keeps the **strongest** matching researched tier instead of summing the tiers (`value = Math.max(value, effect.add)`), which is the project's own law in `frontierCombat.ts`: "Weapon/armor tiers replace lower ones — do not stack". `getCounterAttackChance` therefore returns 0.45 with Iron Spears and 0.55 with Iron Swords (never 1.0), and `getPredatorBlockChance` returns the 0.72 scale-mail tier instead of a 1.67 sum hidden by its 0.85 cap — which also re-arms its forged-tier `Math.max` branches.

## Regression test

`tests/combatTierEffects.test.ts` (3) — the strongest tier for counter-attack (0.55 both / 0.45 spears-only), that `rollCounterAttack` still refuses for some rolls (it returned true for every input at chance 1.0), and predator block at 0.72 instead of the capped sum.

## Invariants checked

Relevant hard invariants: `docs/archive/SIMULATION_AUTHORITY.md` §5. After the fix, `simulation/simulationInvariants.ts` and `simulation/simInvariants.ts` must stay clean in the existing invariant tests.

## Save/migration impact

None expected: the field(s) written here either already round-trip or are derived at load. Confirm with the save round-trip tests if state fields are touched.

## Verification result

`npm run test:all` passes (typecheck + Oxlint 0/0 + full suite); the same command fails on the pre-fix code because `getCounterAttackChance` returns 1.

## Related commits or files

- `src/game/combat.ts` (lines 129-134 (add lookup 131-132); researchedEffect 30-52 | 129-133 (accumulation at 44-47; effect data at gameTypes.ts:925,929))
- Same root cause also reported as: counter_attack research effects stack across tiers, so the chance reaches 1.0 and a counter-attack can never fail (A17-combat)
- Consolidated report: `BUG_REPORTS/2026-09-13-simulation-logic-audit.md` (audit id H1)
