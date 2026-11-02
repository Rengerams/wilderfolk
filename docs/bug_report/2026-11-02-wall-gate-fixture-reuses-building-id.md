# Wall-gate regression fixture reused an allocated building ID

- Bug: The gate replacement test manually inserts a wall with ID 1 but leaves nextBuildingId at 1, so the replacement gate reuses the removed wall's ID and falsely appears to be the original wall.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-02
- Version/build: PR #123, Node.js CI 41381201246
- Reporter: actual GitHub Actions Vitest failure
- Area: wall strip placement regression fixture
- Owner module: tests/medium-C2-story.test.ts (fixture); production identity allocation remains with worldGen and building placement
- Related PR/commit: PR #123, 9669360

## Status history
- 2026-11-02 — investigating: source inspection verified fixture identity collision; the fixture now advances its counter; targeted and full CI still pending.

## Observed behavior
The assertion that the old wall ID disappears fails after the new world starts at the save-safe positive building identity counter. The new gate has the same ID as the manually fabricated wall.

## Expected behavior
After fixture injection, the world's next ID exceeds every present building ID; replacement removes the original wall and creates a uniquely identified gate.

## Reproduction steps
1. Run the M29/M30 gate replacement test in tests/medium-C2-story.test.ts on the prior PR #123 head.
2. Observe that the fixture inserts wall ID 1 but nextBuildingId still equals 1.
3. A new gate replaces the wall but gets the stale ID 1; the old-ID absence assertion fails.

## Evidence
CI reported 338 passing test files and one failure at line 190; the gate-building assertion returned true where false was expected.

## Root cause
The test bypassed the real placement allocator while manually injecting a building.

## Fix / proposed fix
Advance nextBuildingId beyond the injected wall's ID before placing the replacement gate. Keep production positive-ID allocation intact.

## Save/migration impact
None.

## Verification result
- Prior affected tests: FAIL at this test, 2,382 others passed.
- Fixture correction committed.
- New-head targeted and standard CI: NOT RUN at report creation.
