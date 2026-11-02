# Nighttime chat regression fixture lacks real indoor arrival

- Bug: The sleep-chat fixture puts a resident near home without recording indoor presence, then incorrectly expects sleep to stop ongoing chat.
- Status: investigating
- Severity: low
- Date discovered: 2026-11-02
- Version/build: PR #119 Node.js CI run 41324964638
- Reporter: GitHub Actions CI
- Area: Nighttime sleep and ambient dialogue
- Owner module: `tests/humanChat.sleepAtHome.test.ts`; sleep observation remains `humanTick.ts`
- Related PR/commit: PR #119

## Status history
- 2026-11-02 — investigating: Corrected the fixture to represent confirmed indoor arrival; CI revalidation pending.

## Observed behavior
`tests/humanChat.sleepAtHome.test.ts:257` expected `chatPhrase` to be undefined; observed `"Still talking."`. The simulated person had `x/y` near home but no `indoorBuildingId`.

## Expected behavior
Chat ends only when `observeHumanSleep` confirms a resident actually occupies a valid sleep location. Someone merely near home is not automatically asleep.

## Reproduction steps
1. Run `npm run test:standard` on the PR head before this correction.
2. Find the case "stops a chat that is already running when the settler is home for the night".
3. Observe `chatPhrase` remains `"Still talking."`, since indoor presence was never set.

## Evidence
GitHub Actions run 41324964638; `humanTick.ts` samples `previousIndoorBuildingId` before resetting transient occupancy.

## Root cause
The legacy fixture modeled proximity rather than actual building entry, contrary to the updated single sleep-observation contract.

## Fix / proposed fix
Set `indoorBuildingId: 1` on sleeping residents in both nighttime ambient-chat fixture cases. Do not relax the production indoor requirement.

## Save/migration impact
None.

## Verification result
- CI run 41324964638: FAIL before correction.
- Revised CI: pending; local repository test commands NOT RUN.
