# Affair chat is re-attempted every active tick instead of on a restrained conversation cadence

- Bug: once a leading affair pair reaches an intimate tryst site, the conversation gate is evaluated every active realtime tick with a 1% chance; multiple pairs can repeatedly show the same short "Not here." style lines.
- Status: investigating (code fix committed; CI verification pending)
- Severity: medium (frequent, repetitive speech)
- Date discovered: 2026-11-22
- Version/build: 0.6.5.2 development
- Reporter: gameplay observation + source trace
- Area: affair dialogue cadence and content selection
- Owner module: `humanTick.ts` (trigger), `dialogueTrees.ts` (cooldown / selection), `humanChat.ts` (unchanged session writer)
- Related branch: `fix/dialogue-hourly-rolls-and-cooldowns-20261122`

## Status history
- 2026-11-22 — investigating: replaced the tick-level conversation roll with one staggered opportunity per game hour and added a 48-hour cooldown after a successful pair scene. Regression added; CI pending.

## Observed behavior
`humanTick.ts` called `settlerPairChat(entity, paramour, 'affair', 0.01)` inside the realtime intimate-tryst branch. In-game chatter was dominated by short `ambient.affair` phrases such as "Not here." Ordinary same-day scene and per-line repetition rules helped individual actors but did not limit attempts by different pairs or give an affair-specific 48-hour rest.

## Expected behavior
A conversation opportunity at most once per game hour per leading eligible pair, with a roughly equivalent hourly probability and a 48-game-hour cooldown for both participants only after an accepted scene. Leave realtime affair movement/progress, heart particles, and the single dialogue pipeline unchanged.

## Reproduction steps
1. Reach an intimate eligible affair tryst between two player settlers.
2. Observe that the `humanTick` tryst branch is processed each active tick, whereas the call had no hourly guard.
3. Examine `ambient.affair` requests/scene history and the absence of an event-specific two-day cooldown.

## Evidence
Source: `humanTick.ts` intimate affair branch, `simulation/humanSocial.ts` pair dispatcher, `dialogueTrees.requestDialogue`, and `data/dialogue/ambient.json` `wf_affair_meet`.

## Root cause
The 1% probability was applied on every eligible active tick (12 per game hour). The scene router remembered recent lines but lacked a 48-hour affair-specific gate.

## Fix / proposed fix
On the initiating settler's ID-staggered hourly tick, roll 11.4% through the existing `simSettlerPairChat` → `maybeDialogueChat` → `requestDialogue` chain. The router rejects `ambient.affair` when either participant already has a successful `ambient.affair:pair` history entry newer than 48 game hours.

## Save/migration impact
None. The timer is derived from existing persisted `dialogueRecentScenes`, and no new field or chat owner is added.

## Verification result
Focused regression authored in `tests/dialogue.affairRenffrCadence.test.ts`; NOT RUN here because the execution environment cannot reach the GitHub repository or install the project dependencies. CI pending.
