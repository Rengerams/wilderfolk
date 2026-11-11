# The Apprentice's Terrible Invention Fair — specification-to-code audit

**Date:** 2026-11-11  
**Source design:** user-supplied *Scenario Analysis Report: The Apprentice's Terrible Invention Fair*  
**Code reviewed:** `Rengerams/wilderfolk` main `926eb5f`, pre-change `src/game/inventionFair.ts` and its story/worker/persistence callers.  
**Related change:** PR introducing guarded choices and regression tests, separate from the earlier CI audit.

## Executive assessment

The scenario **already exists** and is in the guided campaign. The supplied report is a *redesign*, not a description of current shipping mechanics. A wholesale copy of its example code would break established contracts. Existing functionality is preserved here; the one directly evidenced invalid-choice defect is fixed independently, while the redesign is captured as a bounded implementation plan rather than presented as already complete.

## Design claims versus actual code

| Report's proposed behavior | Actual Wilderfolk implementation | Verdict / required change |
|---|---|---|
| Unlock with >=15 living settlers, a Town Hall/Village Square, >=30 wood | `maybeOfferInventionFair` starts after seeded day 30–119; requires a completed Workshop or Blacksmith, an alive entity with `apprenticeOfId`, no pending story and no authored-story cooldown | **Different design.** `VillageSquare` is not a valid BuildingType; confirm an intended substitute before changing trigger |
| Low/standard/high-risk projects with wood **and gold** and 4-tier distributions | Current answers fund the Self-Counting Granary (15 wood), Polite Gate (10), Emergency Bell (12), safer redesign (23), or reject | **Different design.** Switching paths affects saved story flags, existing guided campaign chapter and tests |
| Demonstration lasts 24 ticks in the old scenario document | The document predates the 12-ticks-per-hour clock and assumes **1 tick = 1 in-game hour**: 24 legacy ticks = **24 in-game hours** = **288 current ticks**. The document's separate phrase “1 clock hour per 3 ticks” conflicts with that old convention. | **Migrate by in-game duration, not literal tick count.** Preserve the intended 24-hour event and its three 8-hour phases: each old 8-tick phase becomes 96 current ticks. The conflicting phrase needs correction in the source specification. |
| Every-tick activation → spin-up → climax and live gathered spectators | `tickInventionFair` runs on the **18:00 daily world-events pulse**, once when the seeded resolve day passes; it immediately queues a second card; no crowd AI or per-tick apparatus lifecycle | **Not implemented.** Requires a single realtime tick owner and one persisted, resumable phase |
| Four seeded outcome categories with real bonuses/damage | `seededRoll(mapSeed, salt)` picks binary success text only (safer 75%, experimental 55%); no award/accident effects at demonstration | **Not implemented.** Probabilities must be branch-specific and saved once; do not roll again at resolution |
| Reward / salvage / dismantle / repair concluding choices | Existing concluding choices are keep (+1 rep), improve (8 wood, +2 rep), dismantle (+4 wood capped) | **Different design**; preserve legacy choices for events already in old saves |
| `charcoal` as a resource and `addCappedResource` in `economy.ts` | `Resources` has wood, stone, food, gold, iron; **no charcoal**; `addCappedResource` is owned by `resourceUtils.ts` | **Invalid sample**; choose an existing material or explicitly design a resource+storage migration |
| Direct gold additions, spectator `energy -=25`, building HP mutation | Existing resource writer `addCappedResource` caps gains; `deductResource`/`consumeResources` handle payments. Human stamina is authoritative under `advanceHumanNeeds`/`adjustHumanStaminaFromEnergy` | **Avoid direct writes** that violate caps/needs authority; building damage must retain building maintenance / lifecycle invariants |
| Persist new root fields in `ENTITY_PERSISTED_FIELDS` | World fields are allow-listed by `WORLD_STATE_SAVE_KEYS` in `saveSchema.ts`; entity persistence list concerns *Entity*, not WorldState. `storyFlags` and `pendingStoryEvents` are already saved and transported in `simDelta` | **Invalid persistence guidance**; if adopting typed root state, update save allow-list, default/load guards and both worker transport directions |
| `StoryCardDialog.tsx` presents cards | Current story cards/disabled answers are wired in `src/App.tsx` through `getStoryChoiceEligibility`, and worker command `respondToStoryEvent` delegates to `storyEvents.ts` | **Incorrect UI path**. Reuse one existing card interface |
| `personDayRoll(entity, colonyDay, salt)` imported from `humanSchedule` | Existing owner is `simRng.ts`, signature `personDayRoll(entityId, tick, salt)`; it internally derives the absolute day from the tick | **Incorrect API**. Supplying `colonyDay` to the tick argument would group many days incorrectly |
| `crowdGatherPosition` guarantees non-overlapping spectator positions | Actual function maps each entity id to one of 192 deterministic ring/slot combinations and calls a terrain walkability fallback. IDs may collide modulo that mapping; fallback may move several positions onto one walkable cell | **Not guaranteed**; gather a bounded unique slot assignment and test blocked terrain/reload before promising no overlap |

## Confirmed defect fixed in this audit

**AUD-INV-01 — unknown or cross-stage answers can mutate the event.** Previously, `resolveStage1` treated any unrecognized `choiceId` like `reject`, permanently resolving the story, while `resolveStage2` treated any non-`keep`/`improve` choice like `dismantle`, awarding wood. `getInventionFairChoiceEligibility` also returned `ok: true` for unsupported choices, leaving forged/stale card IDs unguarded. This is independent of the proposed redesign.

**Change:** The same stage choice sets now govern both eligibility and command resolution. Unknown/wrong-stage answers are blocked; the story card's actual event id is passed to the gate. Valid existing stories, save formats, costs and demonstration timing are unchanged. Regressions: `tests/inventionFair.invalidChoices.test.ts`.

## Redesign implementation plan (not yet implemented)

**Phase A — compatibility and state-machine contract.** Keep `storyKey='invention_fair'` and `invention_fair_resolved` to preserve the guided campaign. Decide how old pending cards and legacy story flags migrate. Introduce a single typed state representation with phase, project, site, start/end tick, outcome, attendee ids and 'applied' latch; integrate with `saveSchema.WORLD_STATE_SAVE_KEYS`, `simDelta`, export/load, and deterministic init defaults. Do not register scenario *WorldState* fields as entity fields.

**Phase B — outcome ownership and economy.** Add a project table with exactly normalized distributions, input wood/gold and benefit/hazard policy. Use `consumeResources` for fully affordable atomic funding and `addCappedResource` for all rewards and refunds. The source report's “useful failure gives charcoal”, “input loss in addition to upfront funding”, and “-25 gold at failure” need one explicit economic interpretation to prevent double-charging or inventing unsupported resources. Use human-physiology owner for stamina, building-health domain owner for damage and existing `addReputation` clamp.

**Phase C — time and spectator integration.** Keep the 18:00 daily gate only to *schedule* a demonstration. Migrate the document's legacy **24 in-game-hour demonstration** from 24 old hourly ticks to **288 current ticks**, with activation (96 ticks), spin-up (96 ticks) and climax (96 ticks), advanced by exactly one realtime scenario owner. Keep the canonical `TICKS_PER_HOUR` / `TICKS_PER_DAY` as the sole time conversion. Reuse `humanTick`/leisure's scheduling precedence; spectators must never abandon prison/hospital duty, sleep, combat or essential shifts. Use `crowdGatherPosition` as candidate geometry but validate unique walkable slots for a bounded crowd. Avoid a second independent movement or pathfinding implementation.

**Phase D — story cards and proof.** Reuse the existing `App.tsx` story controls, `getStoryChoiceEligibility`, existing worker command, one-shot story queue and Chronicle. Required tests: each project's distribution boundaries and reward/damage, affordability and capped refund, source-of-truth saved phase on a mid-demonstration reload, worker/main parity with real terrain at a bounded horizon, crowd slots (including blocked geometry), expiry/decline/repeat-command idempotence, and absence of shift/sleep overrides that violate higher priority motives.

### Acceptance status

- Existing one-time story, capped dismantle recovery and guided campaign integration: **implemented previously**.
- Invalid choice/cross-stage command protection: **patched in this audit**; CI verification required.
- Four-stage animated demonstration, 3 new projects, tiered consequences and new recovery choices: **not implemented**.
- Mid-demonstration save/reload, spectator movement, building-health damage: **not implemented**.
- Current report is a design baseline; **not evidence of passed acceptance tests**.

**Scope decision:** The pasted document materially revises gameplay, economy, timing and serialized state. Preserve current behavior in this audit-only PR; implement the separate redesign with explicit compatibility decisions and a dedicated integration PR.
