# Renffr omen rolls every night tick and can retrigger during its own gossip window

- Bug: the omen runs its rare roll at every nighttime simulation tick and, once its animation ends, does not exclude the three-day post-omen gossip period.
- Status: investigating (code fix committed; CI verification pending)
- Severity: low/medium (repetitive scripted events)
- Date discovered: 2026-11-22
- Version/build: 0.6.5.2 development
- Reporter: player request + source trace
- Area: scripted event cadence
- Owner module: `renffrStar.ts`
- Related branch: `fix/dialogue-hourly-rolls-and-cooldowns-20261122`

## Status history
- 2026-11-22 — investigating: reduced RNG checks to nighttime clock-hour boundaries, compensated chance per roll, and made the existing three-day gossip window a retrigger exclusion. Seeded regression added; CI pending.

## Observed behavior
`maybeTriggerRenffrOmen` rejected an active visual omen but not `isRenffrGossipActive(state)`. Every eligible nighttime tick rolled 0.00035, so a second omen was possible while inhabitants were still chatting about the first one.

## Expected behavior
Only one roll per eligible night-hour, using approximately 0.0042 chance per roll to preserve the earlier hourly odds. An active omen and the existing three-day gossip period both prevent retriggering; post-omen ambient dialogue remains supported by the canonical JSON bank.

## Reproduction steps
1. Inspect `maybeTriggerRenffrOmen` and its realtime caller in `tickLayerRealtime.ts`.
2. Confirm no hour-boundary or gossip window guard was applied before the roll.
3. Use the seeded test to find a trigger, clear the visual omen, and verify that subsequent hours remain ineligible until the gossip window ends.

## Evidence
Source trace: `renffrStar.ts` `maybeTriggerRenffrOmen`, `beginRenffrSettlerChatter`, and `tickLayerRealtime.ts`.

## Root cause
The triggering predicate only suppressed a currently visible `renffrOmen`, not its persisted `renffrChatterUntilTick` interval.

## Fix / proposed fix
Use the existing `isStartOfClockHour` helper to gate the seeded roll and `isRenffrGossipActive` to reject overlapping omens. Preserve visuals, the deterministic RNG, the three-day chatter state and the existing `dialogueTrees.ts` import.

## Save/migration impact
None. `renffrChatterUntilTick` is already persisted.

## Verification result
Seeded regression authored in `tests/dialogue.affairRenffrCadence.test.ts`; NOT RUN here because this runtime cannot access repository dependencies. CI pending.
