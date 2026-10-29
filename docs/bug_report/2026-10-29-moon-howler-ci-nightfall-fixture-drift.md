# Moon Howler cadence fixtures still use ordinary village nightfall

- Bug: five Moon Howler regression assertions fail in PR #99 CI because their fixture clock is 23:00 instead of the system's now-authoritative 22:00 start.
- Status: investigating
- Severity: medium
- Date discovered: 2026-10-29
- Version/build: PR #99, CI run 40784093828 job 123152854998
- Reporter: Node.js CI and player
- Area: Moon Howler regression tests
- Owner module: `tests/low-3-moon-lifecycle.test.ts`, `tests/medium-persistence.test.ts` (test fixtures); production policy remains `src/game/daycycleconstants.ts` and `src/game/moonHowler.ts`
- Related PR/commit: #99, fixture correction 774760b5 / 357fc79a

## Status history
- 2026-10-29 — investigating: CI reproduced five assertions after Moon Howler nightfall moved earlier; corrected fixtures, new PR-head CI not yet verified.

## Observed behavior
The tests import `NIGHT_START` (ordinary village night at 23:00). Moon Howler transformations, full-moon news and rare replacement rolls begin at `MOON_HOWLER_NIGHT_START` (22:00), by design. The old tests find a cursed human not yet transformed by their 23:00 event gate, or find no 22:00 replacement decision and consume no injected RNG draw.

## Expected behavior
Tests must drive the actual Moon Howler nightfall hour. The ordinary village schedule remains at 23:00; no simulation rule or chance should be changed to satisfy a test fixture.

## Reproduction steps
1. On PR #99 before the fixture correction, run `npm run test:standard`.
2. Observe the five listed failures in `low-3-moon-lifecycle.test.ts` and `medium-persistence.test.ts`.
3. Compare the fixture's imported `NIGHT_START` with the existing 22:00 production constant, and with `moonHowler.test.ts` which already uses the correct event hour.

## Evidence
Run 40784093828: 419 test files passed, 2 files failed; 2764 tests passed, 5 failed, 2 skipped. The existing authoritative cadence is `MOON_HOWLER_NIGHT_START = 22`.

## Root cause
The two older fixtures were not migrated when Moon Howler nightfall became distinct from the ordinary village night start.

## Fix / proposed fix
Use the imported `MOON_HOWLER_NIGHT_START` for the clock, calls, and first-tick setup in both test suites. Leave production code, RNG consumption, saved data and actual night schedule untouched.

## Save/migration impact
None. Test fixtures only.

## Verification result
- CI before patch: FAIL (five assertions above).
- Cross-check against existing Moon Howler 22:00 fixtures: PASS (source inspection).
- Targeted tests, full Node CI, typecheck, lint and build after patch: PENDING.
