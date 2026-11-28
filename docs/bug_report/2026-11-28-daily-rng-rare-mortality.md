# Daily RNG rounds up rare mortality

- Bug: four-decimal daily rolls inflate non-aligned rare probability thresholds.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-28
- Version/build: 0.6.5.2 development, base 8dd5190
- Reporter: player observation and code trace
- Area: daily mortality and shared random decisions
- Owner module: `src/game/simRng.ts` (`mixDayRoll`)

## Status history
- 2026-11-28 — investigating: reproduced quantization and implemented owner-level correction; CI pending.

## Observed behavior
Sudden illness uses strict comparisons against 0.00012, 0.0002 and 0.00032. The former four-decimal roll turns these into approximately 0.0002, 0.0002 and 0.0004 respectively.

## Expected behavior
Rare probability thresholds should resolve at approximately 32-bit precision, while preserving historical aligned strict threshold decisions and daily determinism.

## Reproduction steps and evidence
Enumerate IDs 1–1000 and absolute days 0–999 using salt 607. Standalone execution of the inspected old mixer returned 214/214/392 hits; the proposed mixer returned 126/214/329 hits at the three thresholds. The intended expectations are 120/200/320 per million. The player's specific save was not inspected.

## Root cause and fix
The existing hash remainder discarded its quotient. Use that quotient to resolve positions within the same historical bucket in `mixDayRoll`, shared by single-person and pair calls. No new RNG, state writer or mortality rule.

## Save/migration impact
No schema or stream-state migration. Future fractional and inclusive threshold comparisons can differ; exact stateless numeric rolls change, but historical aligned strict gates remain stable. Existing outcomes are not replayed.

## Verification result
Standalone mixer comparison executed; regression added to `tests/personDayRoll.simRng.test.ts`. Repository build and Vitest not run; CI pending.
