# Ready spotlight ignores invalid participants

- Bug: Ready spotlight ignores invalid participants.
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
The scene continued with a dead singer or conflicting festival.

## Expected behavior
A valid cast gathers completely, remains staged until completion, and presentation starts fresh after replacing a session.

## Reproduction steps
1. Create a ready scene and mark one singer dead, then tick. Independently start a festival during a valid scene.
2. Run `npm test -- unit tests/spotlightLore.test.ts tests/spotlightReturnState.test.ts tests/simulation.decisionRegistry.test.ts` for simulation regressions. The reload issue additionally needs the existing browser harness.

## Evidence
The dead-singer regression failed before the fix; both cases pass afterward.

## Root cause
The ready-phase early return skipped chorus eligibility; the active-scene guard omitted festivals.

## Fix / proposed fix
Check participant eligibility before the ready return and abort for an active festival.

## Save/migration impact
No new persisted fields or version change. Invalid scenes are discarded without removing the cooldown; valid scenes and legacy saves remain supported. Session revision is UI-only.

## Verification result
Focused regression set: PASS, 23 tests. TypeScript and build: PASS. Browser: NOT RUN (missing Playwright and Chromium). See PR verification for final broad checks.
