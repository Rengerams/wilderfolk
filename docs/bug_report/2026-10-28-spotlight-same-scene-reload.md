# Same-scene reload retains spotlight presentation state

- Bug: Same-scene reload retains spotlight presentation state.
- Status: investigating
- Severity: medium
- Date discovered: 2026-10-28
- Version/build: PR #91, starting at f127f164
- Reporter: code audit and focused regressions
- Area: spotlight lore
- Owner module: `src/hooks/useGameSession.ts and src/App.tsx`
- Related PR: https://github.com/Rengerams/wilderfolk/pull/91

## Status history
- 2026-10-28 — investigating: implemented the minimal correction; verification details below.

## Observed behavior
Source trace: React receives the same overlay key and unchanged scene-effect dependencies, retaining caption state and initially skipping return-state recapture. Browser reproduction is not available in this environment.

## Expected behavior
A valid cast gathers completely, remains staged until completion, and presentation starts fresh after replacing a session.

## Reproduction steps
1. Load a save of the current ready scene at the same tick while its captions have advanced.
2. Run `npm test -- unit tests/spotlightLore.test.ts tests/spotlightReturnState.test.ts tests/simulation.decisionRegistry.test.ts` for simulation regressions. The reload issue additionally needs the existing browser harness.

## Evidence
TypeScript and build verification performed; browser lifecycle verification remains blocked because Playwright and Chromium are unavailable. Save loading explicitly resumes the simulation, so permanent pause is not claimed.

## Root cause
Scene ID is stable across save reloads but was used as presentation identity.

## Fix / proposed fix
Increment a presentation revision in replaceSession; include it in the effect dependencies and overlay key.

## Save/migration impact
No new persisted fields or version change. Invalid scenes are discarded without removing the cooldown; valid scenes and legacy saves remain supported. Session revision is UI-only.

## Verification result
Focused regression set: PASS, 23 tests. TypeScript and build: PASS. Browser: NOT RUN (missing Playwright and Chromium). See PR verification for final broad checks.
