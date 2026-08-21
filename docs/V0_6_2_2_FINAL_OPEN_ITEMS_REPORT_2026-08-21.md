# v0.6.2.2 Final Open Items Report

**Date:** 2026-08-21
**Scope:** T1 build boundary, Q1 static audit, Q2 worker/schedule/rival verification
**Status:** T1 and Q2 remain open by acceptance criteria; Q1 safe cleanup batch verified

## Executive result

The final validation run is green for the current codebase: **76 test files and 432 tests passed**, TypeScript passed, ESLint passed, and `git diff --check` passed. The Q1 cleanup removed two obsolete Vite chunk-plugin dependencies after the repository had already migrated to direct Rollup `manualChunks`; no gameplay or simulation state was changed.

T1 was investigated and measured but is not marked complete because the required production acceptance condition is not met. The build still reports `game-render -> game -> game-render`, and the main `game` chunk remains approximately **580.49 kB** after minification. A lazy renderer experiment and candidate extra chunk splits were tested; the lazy experiment did not remove the warning, while simulation/asset/dialogue splits introduced additional cycles. Those experiments were rolled back. The safe current configuration therefore preserves the known baseline and does not claim a cosmetic fix.

Q2's authoritative worker/command/schedule/rival runtime regression slice passed: **10 files and 46 tests** covered worker startup, headless tick delivery, valid and invalid commands, authoritative export, command rejection/fallback, schedule transport, fatigue, venue schedules, and rival profiles/diplomacy. A browser UI session against the attached Windows desktop could not be executed from the sandbox browser because the remote desktop localhost was not reachable (`ERR_CONNECTION_REFUSED`); this is recorded as an environment limitation rather than falsely marked as live-browser verification.

## T1 — Build optimization

| Acceptance criterion | Result | Evidence |
|---|---|---|
| No `game-render → game → game-render` warning | **Not met** | `docs/_t1_final_build.txt` |
| No startup/render regression | Not claimed | No valid browser session available |
| Main game chunk below 500 kB | **Not met** | `game-xW1Ol7RY.js`, 580.49 kB |
| No silent threshold suppression | Met | `vite.config.ts` keeps 500 kB |
| No simulation owner/cadence mutation | Met | Renderer experiments were rolled back |

The direct Rollup `manualChunks` migration remains valid because it removed the empty `__commonjsHelpers__` chunk without post-build cleanup. The remaining circular chunk is a genuine module-boundary problem. The next safe T1 slice must extract renderer reads toward a leaf render-contract module, beginning with the highest-value runtime imports in the existing import trace, and must include worker-ready, first-render, and frame-behavior measurements before acceptance.

## Q1 — Static audit

Knip reported **34 unused files, 105 unused exports, and 25 unused exported types**. The 34 files are predominantly scripts, profiling tools, cycle-audit utilities, and one simulation-invariant helper; they were not mass-deleted because their audit/tooling role cannot be proven from production reachability alone. The 105 exports and 25 exported types were not mass-removed because several are public compatibility surfaces or cross-boundary types. This is the required evidence-led triage outcome.

The safe cleanup batch removed the now-obsolete `vite-plugin-auto-chunk` and `vite-plugin-chunk-split` devDependencies. `package.json` and `package-lock.json` remain consistent, and the direct Rollup policy is the single build-chunk owner.

## Q2 — Worker and schedule/rival verification

The focused runtime slice passed with 10 files and 46 tests. The worker test exercised startup, a headless tick, a valid command, an invalid command, and authoritative world export. GameLoop tests covered rejection rollback, stalled-worker fallback, tick-fault fallback, and optimistic-state reconciliation. Schedule and rival tests covered typed work schedules, venue windows, fatigue, feedback, rival ledgers/actions, and diplomacy expiry/idempotence.

The missing piece is a real browser session through the attached desktop. The devserver was started on the Windows desktop, but the sandbox browser could not reach desktop `127.0.0.1:5173`. No browser result is fabricated, and no authority claim is made beyond the passing worker/runtime regression suite.

## Simulation Change Record

- Owner module: build-time `vite.config.ts` and existing renderer loader boundary; Q1 package metadata; existing worker/domain owners for Q2 tests.
- Decision changed: no gameplay decision changed. The build now has one direct Rollup chunk policy; obsolete chunk plugins are removed.
- Cadence: build-time only; Q2 exercises existing command/daily/realtime owners without changing cadence.
- State fields written: none by T1/Q1. Q2 tests invoke existing authoritative commands and tick paths only.
- Why needed: remove the empty helper-chunk regression and verify worker/state parity for the completed roadmap features.
- Player-visible behavior before/after: no intended gameplay change; the failed T1 boundary experiments were rolled back.
- Performance impact: empty helper chunk remains removed; circular warning and 580.49 kB game chunk remain measured risks.
- New or updated tests: 76 files / 432 full regression tests; 10 files / 46 focused Q2 tests.
- Invariants checked: worker authority, command rollback, schedule ownership, rival ownership, no UI/render mutation path.
- Save/migration impact: none.
- Rollback plan: restore the previous `vite.config.ts` manual-chunk policy or revert package metadata; no simulation migration is required.

## Final disposition

The v0.6.2.2 feature roadmap is complete through R4, E1, and Q3. The technical finish line is not declared complete because T1's explicit no-warning/no-large-chunk acceptance and Q2's real browser-worker proof are still open. Q1 is complete for the safe cleanup batch, with the remaining Knip output classified rather than deleted.
