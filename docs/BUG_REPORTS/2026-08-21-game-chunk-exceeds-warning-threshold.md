# Bug: Main game production chunk exceeds warning threshold

- Status: open — game chunk 667 kB (2026-08-25); circular warning resolved; manualChunks does not split static game modules on Vite 8/Rolldown; needs rolldownOptions.output.codeSplitting or dynamic-import strategy
- Date discovered: 2026-08-21
- Version/build: 0.6.2.2 unreleased, Vite 7.3.6 production build
- Reporter: Manus
- Area: performance
- Owner module: `vite.config.ts`, broad `src/game/` manual chunk boundary
- Cadence: build-time

## Status history

- 2026-08-21 — open (production build emitted a `game` chunk above the 500 kB threshold)

## Observed behavior

The production build creates a minified `game` chunk of approximately 578.64 kB and emits the Vite warning that some chunks exceed 500 kB after minification.

## Expected behavior

The main game bundle should remain below the configured 500 kB warning threshold, or the code should be split along proven runtime-safe boundaries without introducing startup, worker-ready, renderer, or first-frame regressions.

## Reproduction steps

1. Open a PowerShell prompt in `C:\Wilderfolk`.
2. Run `npm run build`.
3. Observe the `game` asset size and the Vite large-chunk warning.

## Evidence

The latest build output reports:

```text
dist/assets/game-qP44aFvP.js  578.64 kB  gzip: 191.58 kB
(!) Some chunks are larger than 500 kB after minification.
```

The T1 ledger identifies the broad `/src/game/` grouping as the main source of the large chunk. The empty `__commonjsHelpers__` asset has been removed separately and is not part of this bug.

## Root cause

The direct Rollup `manualChunks` policy groups most `src/game/` and `src/audio/` modules into one `game` chunk. This preserves the current application split but does not provide enough granularity to keep the main game asset below the warning threshold.

## Fix

Open. The next safe investigation should measure candidate leaf groups and dynamic boundaries against worker-ready latency, startup, first render, and normal-frame behavior. Raising `chunkSizeWarningLimit` is explicitly not considered a fix.

## Regression test

No automated regression test can mark this resolved yet. The production build size and warning output are the current regression signals. A future split must retain the full worker transport suite, renderer presentation tests, startup smoke test, and a checked chunk-size budget.

## Invariants checked

No simulation owner, worker authority, cadence, save field, entity lifecycle, pathfinding rule, or runtime game behavior was changed while recording this bug. Chunk splitting must not move worker-only modules into the browser entry or create a renderer/game cycle.

## Save/migration impact

None.

## Verification result

Open and reproducible. The 500 kB threshold remains visible by design; no cosmetic threshold increase was kept.

## Related commits or files

- `vite.config.ts`
- `docs/V0_6_2_2_T1_IMPORT_TRACE_AND_CYCLE_LEDGER.md`
- `docs/V0_6_2_2_ROADMAP.md`
- `BUG REPORTS/2026-08-21-renderer-game-circular-chunk.md`

## Status update — 2026-08-21 final open-items pass

Status remains **open**. The final production build reports `dist/assets/game-ZCiq-Cmu.js` at **580.11 kB** minified and still emits the configured 500 kB warning. Candidate simulation, asset, and dialogue manual-chunk splits were tested; they introduced additional circular chunk paths and were rolled back. No cosmetic increase to `chunkSizeWarningLimit` was made. The final validation nevertheless passed with **76 test files / 432 tests**, TypeScript, ESLint, and `git diff --check`.

The safe next step remains a measured leaf-boundary extraction with worker-ready, startup, first-render, and normal-frame comparisons. No simulation owner, cadence, worker protocol, save field, or runtime game behavior was changed in this pass.

Related evidence: `docs/_final_build.txt`, `docs/V0_6_2_2_FINAL_OPEN_ITEMS_REPORT_2026-08-21.md`, and `docs/V0_6_2_2_ROADMAP.md`.
