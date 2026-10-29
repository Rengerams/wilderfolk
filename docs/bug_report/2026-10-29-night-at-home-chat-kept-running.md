# A settler at home for the night kept a running ambient chat

- Bug: after sleep detection moved to "actually indoors", a settler standing in their own home after dark no longer ended a chat that was already running, and could start one.
- Status: resolved
- Severity: medium
- Date discovered: 2026-10-29
- Version/build: 0.6.5.1, branch `node-beta-support`
- Reporter: failing test `tests/humanChat.sleepAtHome.test.ts > ambient chatter at home after dark`
- Area: simulation / ambient speech
- Owner module: `humanTick.ts` (speech gates), `humanChat.ts` (the session writer)
- Related PR/commit: this branch

## Status history
- 2026-10-29 — open: reproduced in the container with the failing test and a probe of the ticked entity.
- 2026-10-29 — resolved: speech gates read the schedule owner's predicate again; the test passes.

## Observed behavior
`npm run test:standard` failed with `expected 'Still talking.' to be undefined`: a settler at 23:00 with a running chat and their own house kept `chatPhrase` and `chatTicks` (6 → 5) after the tick. A probe of the same tick showed `indoorBuildingId: undefined` while `isAsleepAtHome(...)` was true.

## Expected behavior
An ambient chat ends when its speaker is home for the night, and no new ambient chatter starts there — the contract the test file states for the two behaviours that hang off the sleep predicate.

## Reproduction steps
1. Build a world at `TICKS_PER_DAY + 23 * TICKS_PER_HOUR` with one completed house.
2. Give one settler `residenceBuildingId` pointing at it and a running `chatPhrase` / `chatTicks`.
3. Run one `tickHumans` and read the settler: the phrase survives.

## Evidence
- Before: `chatTicks` 6 → 5 and `chatPhrase` still `'Still talking.'`; `indoorBuildingId` undefined, `isAsleepAtHome` true.
- The same fixture with `indoorBuildingId` set to the house cleared both fields, confirming the gate had moved to the indoor flag.

## Root cause
The sleep-for-needs change replaced the schedule's proximity predicate with `indoorBuildingId === home.id` inside `sleepingForNeeds`, and both speech gates read that flag. Speech therefore waited for the settler to be inside the building, while the schedule owner and the renderer's sleeper cull still treat "home for the night" as the proximity rule — a settler who is not drawn (indoors) could keep talking.

## Fix / proposed fix
Speech gates use the schedule owner's `isAsleepAtHome` beside `sleepingForNeeds`; needs recovery keeps the stricter indoor rule.

## Save/migration impact
None.

## Verification result
- PASS `npx vitest run tests/humanChat.sleepAtHome.test.ts` (6 tests).
- PASS `tests/simBatch.offscreenThrottle.test.ts`, `tests/low-8-humans.test.ts`, `tests/personality.defenseIntegration.test.ts`, `tests/personality.romanceContext.test.ts`, `tests/hotelSettlerLodging.night.test.ts`.
