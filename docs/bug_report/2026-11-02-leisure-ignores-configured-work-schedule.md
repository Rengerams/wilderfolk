# Leisure home preference ignored the configured work schedule

- Bug: a parent's home preference in child leisure (and `isActiveFreeDay`) used the legacy 07–16 window while the shift check beside it used the player-configured schedule.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-02
- Version/build: V.0.6.5.1, fixed in `1b3adaac`
- Reporter: file review (humanSchedule / humanLeisureBehavior)
- Area: daily schedule
- Owner module: src/game/humanSchedule.ts, src/game/humanLeisureBehavior.ts
- Related PR/commit: `1b3adaac`

## Status history

- 2026-11-02 — open: found while reviewing the schedule files; the registry claimed the configured window was read.
- 2026-11-02 — resolved: leisure uses `prefersHomeTonightFor(getWorkSchedule(state), …)` beside the configured shift check.

## Observed behavior

`prefersHomeTonight` defaulted to `DEFAULT_WORK_SCHEDULE` (07–16) even when `world.workSchedule` said otherwise; `freeParent` combined it with `isOnWorkScheduleShift(state)`, so the two halves of the same decision used different windows.

## Expected behavior

Every schedule predicate that has the world state reads `getWorkSchedule(state)`.

## Reproduction / evidence

Set `state.workSchedule` to 06–14; `prefersHomeTonight(parent, …)` still used 07–16. The decision-registry cadence note already claimed the configured window was used.

## Root cause

A legacy no-schedule wrapper was used next to a configured-schedule function.

## Proposed fix

Use `prefersHomeTonightFor(getWorkSchedule(state), …)` in leisure. Done.

## Regression coverage

The leisure suite stays green; no dedicated configured-window test yet. `humanSchedule.isActiveFreeDay` still calls the legacy wrapper because it has no state parameter.

## Save compatibility

None: derived behaviour only.

## Verification

Types, lint, build, audit and the eight schedule-related suites (62 tests) pass.
