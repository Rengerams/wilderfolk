# Saved spotlight accepts invalid participant references

- Bug: Saved spotlight accepts invalid participant references.
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
Structurally valid scenes survived normalization despite an invalid cast.

## Expected behavior
A valid cast gathers completely, remains staged until completion, and presentation starts fresh after replacing a session.

## Reproduction steps
1. Normalize a scene referencing missing heroine 999999, an adult heroine overlapping the chorus, or a dead singer.
2. Run `npm test -- unit tests/spotlightLore.test.ts tests/spotlightReturnState.test.ts tests/simulation.decisionRegistry.test.ts` for simulation regressions. The reload issue additionally needs the existing browser harness.

## Evidence
The missing-heroine regression failed before the fix; all three cases and valid save roundtrip pass afterward. The fixture now uses births relative to day 120, matching its saved calendar.

## Root cause
Save normalization checked shape but not entity references or eligibility.

## Fix / proposed fix
Validate references and eligibility in one population scan; reject empty IDs and overlapping roles.

## Save/migration impact
No new persisted fields or version change. Invalid scenes are discarded without removing the cooldown; valid scenes and legacy saves remain supported. Session revision is UI-only.

## Verification result
Focused regression set: PASS, 23 tests. TypeScript and build: PASS. Browser: NOT RUN (missing Playwright and Chromium). See PR verification for final broad checks.
