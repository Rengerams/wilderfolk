# Bug: Renderer/game circular production chunk

- Status: resolved — production build no longer emits the circular chunk warning (2026-08-25; Vite 8.2.2/Rolldown build)
- Date discovered: 2026-08-21
- Version/build: 0.6.2.2 unreleased, Vite 7.3.6 production build
- Reporter: Manus
- Area: performance
- Owner module: `vite.config.ts`, `rendererLoader.ts`, renderer import boundaries
- Cadence: build-time

## Status history

- 2026-08-21 — open (production build reproduced `Circular chunk: game-render -> game -> game-render`)

## Observed behavior

The production build emits a circular chunk warning between the configured `game-render` and `game` chunks:

```text
Circular chunk: game-render -> game -> game-render.
Please adjust the manual chunk logic for these chunks.
```

The current trace contains one `game → game-render` edge through `rendererLoader.ts` and many renderer-to-game runtime edges. The warning is a chunk-topology warning; no runtime crash has been reproduced.

## Expected behavior

The production build should have an acyclic renderer/game chunk boundary, or a documented boundary that is proven safe through startup, first-render, worker-ready, and normal-frame measurements. No simulation ownership or runtime behavior may be changed merely to silence the warning.

## Reproduction steps

1. Open a PowerShell prompt in `C:\Wilderfolk`.
2. Run `npm run build`.
3. Observe the `game-render → game → game-render` warning in the Vite/Rollup output.

## Evidence

The current build after the direct Rollup `manualChunks` correction still reports the warning. The latest output creates a `game-render` chunk of approximately 55.89 kB and a `game` chunk of approximately 578.64 kB. The T1 import ledger records the measured cross-boundary trace in `docs/V0_6_2_2_T1_IMPORT_TRACE_AND_CYCLE_LEDGER.md`.

## Root cause

The renderer chunk imports runtime game modules such as entity, snapshot, day-cycle, sprite, and state modules, while `rendererLoader.ts` imports the renderer entry from the game side. The current manual chunk boundary therefore contains a real two-way dependency topology.

## Fix

The empty CommonJS helper-chunk issue was fixed separately by removing `vite-plugin-chunk-split` and using direct Rollup `manualChunks`. The circular renderer/game boundary remains open. The safe fix requires extracting renderer-facing read-only contracts or otherwise reducing the runtime edge set, followed by startup and first-render regression measurements.

## Regression test

No automated regression test can mark this resolved yet. The production build warning is the current regression signal. A future fix must add or update a build/import-boundary check and retain worker/runtime smoke coverage.

## Invariants checked

No simulation owner, worker authority, cadence, save field, entity lifecycle, pathfinding rule, or runtime game behavior was changed while recording this bug. Raising the warning threshold or deleting generated warning output is not accepted as a fix.

## Save/migration impact

None.

## Verification result

Open and reproducible. The empty `__commonjsHelpers__` warning is resolved, but this independent circular-chunk warning remains.

## Related commits or files

- `vite.config.ts`
- `src/game/rendererLoader.ts`
- `src/game/renderer.ts`
- `docs/V0_6_2_2_T1_IMPORT_TRACE_AND_CYCLE_LEDGER.md`
- `docs/V0_6_2_2_ROADMAP.md`

## Status update — 2026-08-21 final open-items pass

Status remains **open**. A renderer-loader lazy-import experiment was evaluated against the existing import trace; the production build continued to report `game-render -> game -> game-render`, so the experiment was rolled back. Candidate manual chunk splits for simulation, asset, and dialogue clusters introduced additional cycles and were also rolled back. The direct Rollup `manualChunks` migration remains in place and continues to remove the empty `__commonjsHelpers__` chunk. No simulation owner, cadence, worker protocol, save field, or runtime game mutation was changed. Final full validation passed with 76 test files / 432 tests, TypeScript, and ESLint, but the named no-cycle acceptance criterion is not met.

Related evidence: `docs/_t1_final_build.txt` and `docs/V0_6_2_2_FINAL_OPEN_ITEMS_REPORT_2026-08-21.md`.

Planned next slice: extract renderer reads toward a leaf render-contract module, then measure worker-ready latency, first render, and normal frame behavior before changing the import boundary again.
