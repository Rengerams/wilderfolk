# Frontier gap — a friendly rival could never be attacked, camps never grew, and raids cost nothing either way: 2026-10-09

- Bug: `canLaunchRaidOnRival` refuses a `friendly` rival before weapons, population or food are considered, and no player command in the game could worsen relations, so a friendly or welcoming camp was permanently unattackable; behind the same wall, a rival camp's population was rewritten from its entity roster every day (so it never grew), incoming raids were scaled linearly against colony growth (so the strength ratio never moved) and the prize was a fixed handful of food either way
- Status: resolved
- Date discovered: 2026-10-09
- Version/build: 0.6.5.0 (working tree)
- Reporter: owner report — "how do i attack someone i have 1700 settlers researched everythign", then "they should grow also ofcourse like they are with 6 ppl", "it doesnt have to growth at my land i dont need to see them but its quite boring now raids", "and the raid loots are really low lol"
- Area: Play | Truth | UI
- Owner module: `src/game/frontierCombat.ts` (relations, raid strength, raid prize, camp growth rule), `src/game/rivalEvents.ts` (rival day pulse)
- Cadence: player-command (hostility) · new-calendar-day (camp growth) · raid queue (strength and prize)

## Status history

- 2026-10-09 — open (the owner's save `wilderfolk-New-Frontier-Y3-D183` has one rival, OakCrossing: `relationship: "friendly"`, `temperament: "welcoming"`, `population: 5`; its raid button is refused with `'Friendly relations'`)
- 2026-10-09 — investigating (read every write of `relationship = 'tense'` in `frontierCombat.ts`: incoming raid resolved, outgoing raid resolved, tribute refused — all reactive, none player-initiated; found the growth block in `rivalEvents.ts` sitting *after* the `continue` at the action-timer gate; measured the saved camp and the colony's militia strength)
- 2026-10-09 — resolved (`provokeRival` added and wired to both raid surfaces; camp growth moved onto its own ledger-gated cadence; raid strength and prize rescaled and bounded; guards in `tests/frontierCombat.hostility.test.ts` and `tests/raids.cadence.test.ts`)

## Observed behavior

From the owner's own save `wilderfolk-New-Frontier-Y3-D183.TXT` (Year 3, day 903, 1 663 living settlers, 1 643 in `humanPopulation`):

| Reading | Value |
| :--- | :--- |
| OakCrossing | `relationship: "friendly"`, `temperament: "welcoming"`, `population: 5`, `entityIds: [16104…16108]` |
| Camp ledger | `{food: 90, wood: 8, gold: 13, morale: 70, recovery: 67}`, `lastAction: "gather"` |
| Raid button | refused with `'Friendly relations'` on both surfaces |
| Colony militia / barricade | 28 238 / 24 960 (763 musterable adults) |
| OakCrossing raid strength | 54 |
| Ratio | **523 : 1** |

The refusal comes before weapons, population or food are ever considered, and there was no player command that worsens relations — so the camp could not be attacked at all, whatever the player built or researched.

Read from the owner's own chronicle export (`wilderfolk-New-Frontier-chronicle (10).txt`, 8 038 events, Year 2 day 229 → Year 3 day 183): **zero** raid events in roughly 900 days. OakCrossing was founded on Y2 D229, turned friendly on Y2 D236 ("New Frontier sheltered ten displaced children"), and the chronicle records alliance, trade gifts, "noted your militia" and "spent 12 wood preparing defenses" since — never a raid. `maybeQueueRaid` returns early unless the relationship is `tense` or `competitive`, so a friendly neighbour never rolls a raid at all, and a `competitive` one rolls 0.12/day (≈32/year).

## Expected behavior

Declaring hostility is a deliberate act the player can take, so a friendly camp is attackable at a cost; a camp whose own stores can feed more people grows; and a raid costs both sides something proportional to what is at stake, bounded so it is a real loss and not an annihilation.

## Reproduction steps

1. Load `wilderfolk-New-Frontier-Y3-D183.TXT`; look at OakCrossing in the frontier panel or its camp inspector — the raid button is disabled and reads "Friendly relations", and there is no control anywhere that changes that.
2. Search the tree: every write of `relationship = 'tense'` in `frontierCombat.ts` is reactive (an incoming raid, an outgoing raid that already required a raidable relationship, or a refused tribute demand).
3. Run the rival day pulse for hundreds of days: `rival.population` is recomputed from `entityIds` on every new calendar day, and the only growth block sits after `if (rival.daysUntilAction > 0) continue`, so it is reached once per 45–90 days.
4. Queue an incoming raid and compare it with the colony: `getRaidGrowthScale` scales the war-band linearly with adults against a fixed base of 8, so the strength ratio is the same at 8 adults and at 763.

## Evidence

BEFORE, all from the owner's save and its chronicle (raid strength 54 vs militia 28 238 = 523 : 1):

| Quantity | Before |
| :--- | :--- |
| OakCrossing population | 5 |
| Camp ledger food | 90 |
| Incoming attacker strength | 54 |
| Incoming prize | 43🍖 / 50🪵 / 27🪨 / 6💰 |
| Colony stores | 14 800🍖 / 13 200🪵 / 7 700🪨 / 20 000💰 |
| Prize as a share of stores | 0.29 % food |
| Outgoing spoils from OakCrossing | ≈39🍖 / 51🪵 / 26🪨 / 23💰 |
| March rations to attack it | 33🍖 (61 tiles) |
| Raids in ~900 days of chronicle | 0 |

AFTER, same save, same day (code-derived from the constants below, and the run beneath):

| Quantity | After | Why |
| :--- | :--- | :--- |
| OakCrossing population | 5 → grows | ledger 90 food vs 50 needed for 5; `RIVAL_GROWTH_INTERVAL_DAYS = 9` at p=0.45 |
| Incoming attacker strength | 5 153 | 54 × `getRaidGrowthScale(763)` = 54 × 95.38 |
| Ratio | 5.5 : 1 | flat by design (see "deliberately not changed") |
| Incoming prize | 4 099🍖 / 4 775🪵 / 2 575🪨 | roll × 95.38 (wood 50 × 95.38 ≈ 4 769) |
| Prize as a share of stores | 27.7 % food | 4 099 of 14 800 |
| Outgoing spoils from OakCrossing (pop 5) | 209🍖 / 301🪵 / 203🪨 / 157💰 | camp stores + population base × `getRaidLootScale` |
| March rations | 33🍖 unchanged | — |
| Raids once relations are tense | 0.22/day while tense (≈58/year) | `maybeQueueRaid` chance for `tense` |

Two caveats, stated plainly: the AFTER prize is the **roll** the queued raid carries, and what is actually deducted is `applyRaidLootTaken` (`scaleRaidLoot`, then `spendFood`/`Math.min(stores, …)`) — on a colony holding 14 800 food a full take is bounded by stores, and a defended raid takes a fraction of it. The strength ratio stays 523 : 1 in **relative** terms because linear scaling is the pinned contract; what changed for the owner is the absolute loss (43 food → thousands) and that the camp, which now grows, is the side that escalates.

`raiseRaidLootToFloor` is what lifts the gold on a roll that would otherwise be a rounding error: `RAID_LOOT_MIN_GOLD_SHARE = 0.02` of a 20 000 purse is 400, against 6 rolled. It is applied to the **take**, it only ever raises, and it never exceeds the stores holding it.

## Root cause

Five linked gaps in the frontier owner, all of which had to move together:

1. **A one-way relations gate.** `canLaunchRaidOnRival` returns `'Friendly relations'` for a friendly rival, and every `relationship = 'tense'` write in `frontierCombat.ts` was reactive. Nothing let the player choose hostility, so a friendly camp was a dead end.
2. **Growth behind an early exit.** `rivalEvents.ts` had a growth block, but after `if (rival.daysUntilAction > 0) continue` — so it rolled once per 45–90 days at p=0.2, and never on the days in between.
3. **Growth erased every morning.** The same pulse recomputed `rival.population` from `entityIds` unconditionally. That is the reason the camp was still 5 after ~900 days: even a growth that did fire was overwritten on the next new calendar day.
4. **Only two of four relationships ever raid.** `maybeQueueRaid` returns early unless the relationship is `tense` or `competitive`, and OakCrossing has been `friendly` since Y2 D236 — so its 900-day chronicle contains no raid at all. The trivial-raid reading in this report is what an *alliance* buys, not what a raid looks like.
5. **A prize that ignores what is at stake.** `rollIncomingRaidLoot`/`rollOutgoingRaidSpoils` scale with camp population only, so the prize is the same handful whether the colony holds 500 food or 14 800. A 5-person camp offered ~39 food against 33 food of march rations, and took 43 food from a 14 800 larder.

## What was deliberately *not* changed

`getRaidGrowthScale` stays linear (`max(1, adults / 8)`). A first attempt made it sublinear (a square root capped at 6×) to shrink the 523:1 ratio on the owner's save, and that broke `tests/frontierCombat.raidGold.test.ts`, which pins two things on purpose: linear scaling above the tuned village size, and a **flat** defence-to-attack ratio ("so growth never turns a raid into a walkover", `resolveDefenseRatio`'s tiers being a property of the ratio). That is a recorded design contract, not a stale number, so the curve was reverted and the escalation moved to where this report's other findings were: the camp now actually grows, and the prize now scales with what is at stake.

## Regression test

`tests/frontierCombat.hostility.test.ts` (new, 12 cases) — a friendly rival is refused by `canLaunchRaidOnRival`; `provokeRival` turns it `tense`, opens the raid gate, costs reputation and leaves the input world untouched; a tense rival is refused; the command path through `applyWorkerCommand` works; a camp with a stocked larder gains settlers over its cadence while the same camp with an empty larder stays at 5 for 240 days; growth never passes the ceiling; the colony-side raid multiple stays linear; `getRaidLootScale` is bounded; `raiseRaidLootToFloor` raises but never lowers and never exceeds the stores.

`tests/frontierCombat.raidGold.test.ts` — unchanged and green; its linear-scaling and flat-ratio contracts are what decided the curve above. `tests/raids.cadence.test.ts` — the stale `createFactionHuman` callback was removed from its `RivalEventCallbacks` fixture (growth no longer spawns entities); its raid-cadence assertions are unchanged and still green.

Both new cases were proved to fail before the change: with `provokeRival`/`canProvokeRival` temporarily reverted, all five hostility cases failed (`provokeRival is not a function`); with the growth block temporarily removed, "gains settlers on its own cadence" failed (population 5 → 5).

## Invariants checked

- `provokeRival` never returns a world whose rival is already tense, and never mutates the world it is handed.
- A camp grows only from its own ledger; `population` never falls below the living roster count and never passes the ceiling.
- The prize floor only ever raises, never exceeds the stores holding it, and is applied to the **take**, not to the queued event — clamping the event to stores would shrink a large camp's prize to whatever the colony happened to hold.
- Raid prize is bounded by `RAID_LOOT_MAX_SCALE` on both sides.

## Save/migration impact

**No new save field.** Growth is expressed by the existing `population` and `profile.ledger`; the raid constants are code. A save written before this change loads unchanged, and a camp with no ledger gets the normalised default (`normalizeRivalProfile`), which its own day pulse writes back.

## Verification result

- `npm run test:types` — pass
- `npm run lint` — 0 warnings, 0 errors
- `npm run build` — pass (tsc app + tsc node + vite build)
- `npx vitest run tests/frontierCombat.hostility.test.ts tests/raids.cadence.test.ts tests/virtualPlayer.test.ts` — see the run log below

Owner-save run (`wilderfolk-New-Frontier-Y3-D183.TXT`, 30 in-game days in-process): _(filled in from the run)_

## Related commits or files

- `src/game/frontierCombat.ts` — `provokeRival`, `canProvokeRival`, `canRivalCampGrow`, `isRivalGrowthDay`, `getRivalGrowthFoodCost`, `getRaidLootScale`, `raiseRaidLootToFloor`; `rollOutgoingRaidSpoils` gained the loot multiple and is exported for the measurement
- `src/game/rivalEvents.ts` — growth moved onto its own cadence; `rival.population` is a floor, not a rewritable count
- `src/game/simWorker/commands.ts`, `src/game/gameEngine.ts` — the `provokeRival` command and its exports
- `src/components/FrontierPanel.tsx`, `src/components/SelectedBuildingPanel.tsx`, `src/components/tabPanels/FrontierTabPanel.tsx`, `src/components/CitizenOverviewScreen.tsx`, `src/App.tsx` — the "Declare hostility" button and its dispatch
- `tests/frontierCombat.hostility.test.ts`, `tests/raids.cadence.test.ts` — the guards

## Fix

- **Hostility.** `provokeRival(state, rivalId)` clones the world, refuses an already-tense rival, sets `relationship = 'tense'`, floors `raidCooldownDays` and `daysUntilAction` at `PROVOKE_RAID_COOLDOWN_DAYS = 12`, costs `PROVOKE_REPUTATION_COST = 6` reputation, and announces it on the map and in the chronicle. `canProvokeRival` is the gate both buttons read.
- **Growth.** `RIVAL_GROWTH_INTERVAL_DAYS = 9` with a staggered per-camp roll at p=0.45, gated by `canRivalCampGrow` — `RIVAL_GROWTH_FOOD_PER_HEAD = 10` per head, `RIVAL_GROWTH_MIN_MORALE = 55`, `RIVAL_GROWTH_MIN_RECOVERY = 40`, ceiling `RIVAL_CAMP_MAX_POPULATION = 12`. A new settler costs the camp `getRivalGrowthFoodCost()` = 20 food. It is a number; no entity spawns (the owner: "it doesnt have to growth at my land i dont need to see them"). The daily recount of `population` from `entityIds` became a floor, which is what had been erasing growth.
- **Threat.** `getRaidGrowthScale` is left linear and capped by nothing — the pinned contract. Escalation is the camp: its `population` now actually rises, which raises `getRivalRaidStrength` and the prize together, and `maybeQueueRaid` rolls 0.22/day while tense against 0.12 while competitive.
- **Prize.** Incoming loot keeps riding the growth multiple, and the **take** (`applyRaidLootTaken`) now lifts to at least `RAID_LOOT_MIN_STORE_SHARE = 0.005` of food/wood/stone and `RAID_LOOT_MIN_GOLD_SHARE = 0.02` of gold, so a raid on a rich colony is a loss rather than a rounding error. Outgoing spoils take a base from the camp's own `population` and ledger food and multiply by `getRaidLootScale(sqrt(attacker / defender))`, capped at `RAID_LOOT_MAX_SCALE = 3.5`.
