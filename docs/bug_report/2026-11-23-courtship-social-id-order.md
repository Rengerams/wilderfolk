# Courtship and social-life ID-order audit — 2026-11-23

## Reproduction

Source: user-supplied `wilderfolk-New-Frontier-Y1-D95.json` and village chronicle (game v0.6.5.1, year 1 day 95, tick 27414).

- 71 living human entities (58 adults), 6 existing married/expecting pairs.
- **16 reciprocal adult courtship pairs at 100% on both sides**, all still single.
- **Zero marriage events** in the chronicle (which does record conceptions, births, a divorce and scandals).
- None of the 16 couples were within 10 px at the snapshot; proximity remains required for a later real-time completion attempt.
- 67/71 humans have some stored friendship scores; 0 friendship scores reach the **60** close-friend threshold. Maximum observed score: 55.81.
- 453 retained dialogue-scene stamps across living humans; 28 different living humans have a stamp from the last colony day. These are *retained stamps*, not a complete count of historical conversations.

## Confirmed blocker A: courtship never transitions to marriage

`humanTick.tickHumans` stores observed courtship readiness as it loops through `allHumans`. A pair can progress only when the other person's observation exists; when human records are ID-ordered, that means the higher-ID partner processes the pair. The existing `tryCompleteCourtshipMarriage` guard, `if (entity.id >= partner.id) return false`, rejected precisely that participant. Progress capped at 100 and the couple remained single.

**Fix:** `tryCompleteCourtshipMarriage` checks reciprocal `courtshipPartnerId` instead of caller ID order; the existing symmetric adulthood, eligibility, 100% progress and ex-spouse-bar checks remain. Both parties are marked married and their courtships cleared in the same synchronous transition, which blocks a second marriage event even if called again. No saved fields or migration change. Regression covers both actor orders, one event only and rejecting one-way courtship.

## Confirmed blocker B: pair dialogue silently discarded based on caller order

`simSettlerPairChat` previously did nothing unless `entityA.id < entityB.id`. Many legitimate callers (including the higher-ID courtship participant) have no such guarantee; the resulting attempt was silently dropped. This is different from using IDs *only* for stable deterministic tie-breaks.

**Fix:** normalize speaker/partner order inside the existing `simSettlerPairChat` owner, then call the same `maybeDialogueChat` pipeline. It retains a stable seed for either caller order. A successful request activates the pair's dialogue session and makes both busy; unsuccessful same-tick calls get the same seeded chance instead of independent rerolls. No parallel chat pipeline, no new record fields. Regression covers both directions and duplicate busy-session prevention.

## Other social subsystems checked

| System | Save evidence and source trace | Conclusion |
| --- | --- | --- |
| Courtship | 16 mutual, full-progress adult pairs; caller-order rejection in completion | **Broken**, fixed above |
| Paired dialogue | Higher-ID initiators dropped by `simSettlerPairChat`; `dialogueTrees.requestDialogue` owns session and cadence | **Partially blocked**, fixed above |
| General conversations | Dialogue stamps remain active (28 humans in last day); neighbour greetings, workplace banter and ambient lines exist | **Active**, not globally disabled |
| Friendship | 67 humans have numeric friendship records; `advanceSocialRelationships` adds 0.6 base score per shared-context day, while `FRIEND_CLOSE_THRESHOLD=60`; max score 55.81 on day 95 | **Slow calibration**, not proved defective; reaching 60 requires at least 100 full base-rate group encounters from zero, before missed days/factors |
| Affairs/divorce | Recorded scandals on D52/D61/D62, divorce D52; affairs handled by `humanRelationships` and registered decision owner | **Active** in this run |
| Pregnancy/children | Conceptions (D88 among others) and births in chronicle | **Active** in this run |
| Youth/adoptive bonds | User noted siblings shown as sweethearts are adopted; these are separate stored relationship and family-tree fields | **Out of scope** at user's request; no change to family policy |

## Constraints / follow-up

- Validate with CI's `tests/courtship.exclusivity.test.ts` and `tests/dialogue.socialEvents.test.ts` plus full standard gate. Tests are committed, but this report does not assert local execution.
- The code fix does not instantly marry every 100% couple after loading the save; they must become awake/eligible and actually meet within 10 px under `canAdvanceCourtship`. A separate save-loaded integration test would be valuable.
- Evaluate the 60-point close-friend threshold as a **gameplay tuning** decision, not a hidden logic bug; do not introduce an additional friendship writer merely to raise it.
- `personDayRoll` low-resolution odds distortion was independently documented in `docs/plans/simulation-logic-audit-2026-11-22.md`. That broad RNG change is intentionally **not** mixed into the social bugfix because it alters seeded gameplay for existing saves.
