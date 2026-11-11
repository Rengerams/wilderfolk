# The Apprentice's Terrible Invention Fair — implementation audit

**Date:** 2026-11-11  
**Source design:** supplied scenario report (written before the clock migration when 1 tick = 1 game hour).  
**Base:** Wilderfolk main `926eb5f`. **Implementation:** PR #142.  
**Owner:** `src/game/inventionFair.ts` with the existing `storyEvents` command/card dispatcher.

## Clock and story identity

The original 24 legacy ticks represent **24 game hours**, not two game hours. Today's canonical clock is 12 ticks/hour and 288 ticks/day. The new demonstration therefore advances for **288 ticks**, logging activation at the beginning, spin-up at **96** ticks, maximum strain at **192** ticks and a one-shot outcome at **288** ticks. The report's old phrase about “one clock hour per three ticks” is inconsistent with its old 1-tick-per-hour baseline and has not been followed.

The game already had `storyKey='invention_fair'` and guided campaign completion flag `invention_fair_resolved`. The new version reuses both, the existing story card UI in `App.tsx`, the command path `respondToStoryEvent`, the Chronicle, economy utilities, and navigation/physiology owners. There is no second story pipeline.

## Implemented behavior for new fairs

| Stage | Contract |
|---|---|
| Notice | One-time seeded offer after the existing authored-story day gate and cooldown; requires ≥15 living player humans, ≥30 stored wood, a completed player Town Hall, and a living apprentice (an entity with `apprenticeOfId`). The proposed `VillageSquare` is not an existing building type and was not invented. |
| Financing | Low-budget: **10 wood**; standard: **25 wood + 10 gold**; high-risk: **50 wood + 25 gold**; or decline. Atomic affordability and deductions use `consumeResources`. The offered story is unique and can be declined or expire. |
| Preparation | The apprentice prepares for a seeded **4–6 colony days**. If the venue disappears before launch, the invested resources are refunded through capped resource additions and the event ends. |
| Demonstration | Starts on the 18:00 daily world-event pulse, then advances every realtime tick for 288 ticks. Up to 24 adult villagers receive deterministic, separated terrain-aware crowd positions. The leisure owner routes free, awake/off-duty spectators via existing pathfinding; work, medical/prison duties, combat and sleep take priority. |
| Outcome | Exactly one domain-isolated `getSimRng('invention-fair')` roll selects success, useful failure, comic malfunction or dangerous failure. Effects are applied once and logged; the resulting outcome and applied latch persist across saves, worker deltas and tick rollback. |
| Resolution | One-time card offers reward (10 gold for +5 reputation), salvage (25% of invested wood, capped), dismantle (50% invested wood, capped) or, only if the venue was damaged, repair (15 wood + 5 gold to restore event-inflicted HP). The card's ID, stage, affordability and choice identity are validated; an unanswered card defaults to dismantle on expiry. |

## Outcome probability table

| Project | Useful success | Useful failure | Comic malfunction | Dangerous failure |
|---|---:|---:|---:|---:|
| Low-budget | 10% | 40% | 50% | 0% |
| Standard | 20% | 40% | 30% | 10% |
| High-risk | 35% | 15% | 20% | 30% |

**Effect mapping:** Success grants up to 20 wood, up to 15 gold and +8 reputation. Useful failure grants up to 15 wood and +3 reputation. Comic malfunction grants +1 reputation. Dangerous failure removes up to 25 additional stored wood and 25 gold, reduces venue HP by up to 30 without reducing it below 1, penalizes physically present spectators by 25 energy via the physiology owner, and applies −10 reputation. Bonuses/refunds honor storage caps. All choices and effects are deterministic with identical seed, RNG state and event history.

**Intentional adaptations:** The report proposes a `charcoal` inventory field, which does not exist in `Resources`. Useful failure therefore yields **wood**, not an invented item. The initially funded wood/gold is paid **once upfront**; comic failure does not double-charge this commitment. The severe-failure resource losses are *additional*, bounded by available stores. Repair and salvage costs/rates are concrete game-policy values chosen for the implementation because the report did not fully specify them.

## Save/load, worker and legacy compatibility

- `InventionFairState` is a typed optional **WorldState** field. It is in `saveSchema.WORLD_STATE_SAVE_KEYS`, `simBuffers/simDelta.ts` (both directions), and `simWorker/simPrep.ts` (both rollback directions). New worlds initialize it to `null`.
- State includes project, site/apprentice, offered/ready/start ticks, current stage, elapsed-phase marker, outcome, application latch, finite story-card identity and spectator slot coordinates.
- Older saves have no `inventionFair` field. Their existing `invention_fair_status` flags and old pending stage-1/stage-2 cards continue through the unmodified **legacy** resolver/tick branch. No save rewrite, schema renaming, changed guided chapter identity or altered legacy costs.
- `ENTITY_PERSISTED_FIELDS` is **not** the correct place for WorldState fields; the source report's example registration was not applied.

## Decisions, tests and limits

Source functions and write scopes are registered in `OWNERSHIP_OVERVIEW.md` and `src/game/simulation/decisionRegistry.ts`. Relevant regressions: `tests/inventionFair.simulation.test.ts` (trigger, affordability, all four outcome bands, three temporal boundaries, hazards, capped resource handling, repeat-payout latch, scene expiry, typed save/worker delta), `tests/inventionFair.invalidChoices.test.ts` (forged/stale card choices), the existing storage-cap tests and `tests/medium-C2-story.test.ts` (legacy one-shot guards).

**Known constraints:** The fair has no new dedicated rendered machine sprite; event cards, Chronicle entries and actual moving villagers provide feedback. Spectators are not forced out of essential duties or sleep. Some candidate crowd slots may be unavailable on severely obstructed maps. A full 720-day or 2,500-settler multi-year run is separate from the bounded PR gates. The result is a gameplay implementation and regression suite, not a guarantee that every play-style is yet measured.

**Verification:** CI on the final PR head must pass before marking these behaviors as verified. Earlier failures in the development branch were TypeScript syntax/unused-import errors and a newly registered decision key absent from its fixed-key test; those were corrected.
