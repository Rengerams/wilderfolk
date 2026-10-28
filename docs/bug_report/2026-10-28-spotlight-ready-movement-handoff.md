# Ready spotlight loses movement priority before pause

- Bug: Ready spotlight loses movement priority before pause.
- Status: resolved
- Severity: medium
- Date discovered: 2026-10-28
- Version/build: PR #91, starting at f127f164
- Reporter: code audit and focused regressions
- Area: spotlight lore
- Owner module: `src/game/humanTick.ts and src/game/spotlightLore.ts`
- Related PR: https://github.com/Rengerams/wilderfolk/pull/91

## Status history
- 2026-10-28 — resolved: implemented the minimal correction; verification details below.

## Observed behavior
Actor x increased from 500 to 512.565878 instead of approaching the stage.

## Expected behavior
A valid cast gathers completely, remains staged until completion, and presentation starts fresh after replacing a session.

## Reproduction steps
1. Run the existing real-gameTick home-commute regression with phase ready and a home-preferring actor whose stage target is left and house is right.
2. Run `npm test -- unit tests/spotlightLore.test.ts tests/spotlightReturnState.test.ts tests/simulation.decisionRegistry.test.ts` for simulation regressions. The reload issue additionally needs the existing browser harness.

## Evidence
The ready-phase real-tick regression failed before the fix and passes afterward.

## Root cause
Participant protection and the target accessor only covered gathering; catch-up ticks can occur before React pauses.

## Fix / proposed fix
Keep stage targets active through ready; preserve emergency priority and the headless timeout.

## Save/migration impact
No new persisted fields or version change. Invalid scenes are discarded without removing the cooldown; valid scenes and legacy saves remain supported. Session revision is UI-only.

## Verification result
Focused regression set: PASS, 23 tests. TypeScript and build: PASS. Browser: NOT RUN (missing Playwright and Chromium). See PR verification for final broad checks.
