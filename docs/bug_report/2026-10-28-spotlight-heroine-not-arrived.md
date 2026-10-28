# Spotlight starts before the heroine returns

- Bug: Spotlight starts before the heroine returns.
- Status: resolved
- Severity: medium
- Date discovered: 2026-10-28
- Version/build: PR #91, starting at f127f164
- Reporter: code audit and focused regressions
- Area: spotlight lore
- Owner module: `src/game/spotlightLore.ts`
- Related PR: https://github.com/Rengerams/wilderfolk/pull/91

## Status history
- 2026-10-28 — resolved: implemented the minimal correction; verification details below.

## Observed behavior
The phase became ready while the heroine remained off-stage.

## Expected behavior
A valid cast gathers completely, remains staged until completion, and presentation starts fresh after replacing a session.

## Reproduction steps
1. Move the heroine 50 units away after creating a gathering scene, place every chorus member at its slot, then call tickSpotlightGathering.
2. Run `npm test -- unit tests/spotlightLore.test.ts tests/spotlightReturnState.test.ts tests/simulation.decisionRegistry.test.ts` for simulation regressions. The reload issue additionally needs the existing browser harness.

## Evidence
The new heroine-arrival regression failed before the fix and passes afterward.

## Root cause
Arrival counted chorus slots only.

## Fix / proposed fix
Require the heroine within the same 11-unit arrival radius.

## Save/migration impact
No new persisted fields or version change. Invalid scenes are discarded without removing the cooldown; valid scenes and legacy saves remain supported. Session revision is UI-only.

## Verification result
Focused regression set: PASS, 23 tests. TypeScript and build: PASS. Browser: NOT RUN (missing Playwright and Chromium). See PR verification for final broad checks.
