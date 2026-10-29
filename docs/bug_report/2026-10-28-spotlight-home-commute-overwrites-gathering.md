# Spotlight home commute overwrites gathering movement

- Bug: Spotlight participants with a weekend stay-home preference can have their gathering velocity overridden by later independent home/hotel movement in humanTick.
- Status: resolved (code committed on PR #91; CI/browser confirmation pending)
- Severity: medium
- Date discovered: 2026-10-28
- Version/build: version 0.6.5.2 development, PR #91
- Reporter: Codex P2 review #4401308618
- Area: human movement / lore
- Owner module: `src/game/humanTick.ts`
- Related PR: https://github.com/Rengerams/wilderfolk/pull/91

## Status history
- 2026-10-28 — investigating: reviewed later independent home, hotel, work, school, child leisure, idle-stamina and social movement branches.
- 2026-10-28 — resolved in code: the `inSpotlightGathering` actor guard preserves gathering as the exclusive ordinary steering decision while existing emergency/fleeing logic keeps higher priority.

## Observed behavior
A selected performer assigned a spotlight slot also satisfies `prefersHomeTonightFor`, and a later independent home-commute clause sends them back home instead. The juvenile could likewise enter home from later movement and cause the scene to abort. This was reproduced by source-level code trace; the real-tick regression has been added but may still be awaiting CI.

## Expected behavior
All selected villagers continue walking to their stable slots until ready or a genuine safety/availability abort. Other villagers keep regular schedules. Spotlight must not alter work assignments or introduce new movement integration.

## Reproduction steps
1. Create an active `spotlightLore.phase='gathering'` state with an adult selected for the chorus at weekend 16:00.
2. Pick an actor whose deterministic stay-home preference is true, assign a residence opposite the spotlight slot, and advance a real `gameTick`.
3. Previously home commute overwrote `vx/vy`; after the fix their x-position should progress toward the spotlight slot.

## Evidence
Codex inline review comment #4401308618; existing `humanTick.ts` selects spotlight velocity first, then independently evaluates home commute. Regression: `tests/spotlightLore.test.ts`.

## Root cause
The earlier priority chain handled spotlight actors, but later independent commute and leisure branches excluded only elections/festivals, not spotlight.

## Fix / proposed fix
Use a per-actor `inSpotlightGathering` flag. Disable ordinary home/hotel, school/work, social/free-roam, hunting/foraging, child leisure, medical errand and needs-break movement while the scene owns an actor. Do not affect danger and emergency paths.

## Save/migration impact
No new fields; uses the existing optional `spotlightLore` state.

## Verification result
- Source-level condition and ownership review: code committed on PR #91.
- Full game-tick regression: added, CI result to be verified.
- Browser movement/worker validation: NOT RUN.
