# Audit master bug-list status — 2026-11-07

**Source:** `MASTER-BUG-LIST.md` shipped with the 2026-11-07 audit archive. **Master plan:** [full-audit-remediation-2026-11-07.md](full-audit-remediation-2026-11-07.md). This is the tracked status ledger; the archive itself stays read-only.

**Status legend:** `fixed` = implementation in this branch and verified; `verified` = existing fix proved by a runtime test; `open` = no fix yet; `deferred` = deliberately outside the current phase.

## Phase A1/A2 — calendar and gate

| ID | Status | Evidence |
|---|---|---|
| SIM-01, SIM-02, TEST-16 | fixed | PR #129; midnight owners and `gameTick` boundary regressions |
| TEST-01..05, TEST-08, TEST-11, TEST-12, TQ-01..03, TQ-06..08, TQ-14 | fixed | PR #130 required fast calendar gate and coverage floors |

## Phase A3 — save, schema and data integrity

| ID | Status | Evidence |
|---|---|---|
| SIM-15, Q-03 | fixed | Typed tick-field table scales every persisted group; event-log tick shares the festival repair time base. `tests/saveLoad.tickResolution.test.ts` |
| SIM-08 | fixed | Monotonic command id, worker echo and filtered replay. `tests/gameLoop.test.ts` |
| SIM-10 | fixed | `electionPromiseRecords` ships in the tick delta and the prep rollback. `tests/simDelta.storyRoundtrip.test.ts`, `tests/simPrep.rollbackFields.test.ts` |
| GAME-09 | verified | Compact-save terrain-seed round-trip and fishing-dock witness pass at runtime. `tests/saveWorldMap.terrainSeed.test.ts`, `tests/terrain.saveGenerationVersion.test.ts` |
| COV-G-03 | fixed | Gazette week 0 reports colony days 0–6. `tests/weeklyGazette.test.ts` |
| COV-G-04 | fixed | Birth genome uses a stream derived from the birth key. Typecheck and lint pass; dedicated replay test not added. |
| COV-G-05 | fixed | Rival growth cadence hashes the stable rival id. `tests/rivalProfiles.test.ts` |
| COV-I-03 | fixed | One hex parser; short colours no longer produce NaN. `tests/renderer.shared.hex.test.ts` |
| DNA-01 | fixed | A valid flat genome loads unchanged. `tests/settlerTraits.test.ts` |

## Remaining A3 verification debt

- GAME-05 was re-checked and needs no change: the negative founding-year sentinel is already in source.
- A dedicated single-birth replay test for COV-G-04 is not yet added; whole-simulation determinism remains covered by the existing parity suite.
