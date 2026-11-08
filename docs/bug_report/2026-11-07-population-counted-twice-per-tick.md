# Population was counted twice per tick and the first result thrown away

- Bug: `gameTick` scanned the full living roster before the daily layer and scanned it again at the end of the tick, even on the three ticks in four where no daily layer ran.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit build (RED-01)
- Reporter: 2026-11-07 full audit, redundant-compute pass
- Area: simulation tick orchestration
- Owner module: `gameTick.ts`
- Related PR/commit: this branch

## Status history
- 2026-11-07 — open: audit found the discarded pre-daily scan.
- 2026-11-07 — resolved: the pre-daily counts are reused whenever nothing changed after the snapshot.

## Observed behavior
`computePopulationCounts` ran once before the daily layer and once after the final dedupe. On non-daily ticks the second scan walked the same entities and produced the same numbers.

## Expected behavior
Count once where the roster is final; rescan only when a daily pass or a dropped entity can have changed it.

## Reproduction steps
1. Run any non-daily `gameTick` on a live colony.
2. Count invocations of the population owner for that tick.
3. Before: two full scans; the first result was overwritten.

## Evidence
`src/game/gameTick.ts`: the pre-daily counts feed `state.wildlifeCounts` and `state.humanPopulation`, then `finalCounts` recomputed the same set; the daily-layer flag only gated the layer itself.

## Root cause
The daily layer can spawn and kill entities after the pre-daily snapshot, so the final count had to be recomputed — but the recompute was unconditional.

## Fix / proposed fix
The final dedupe loop now records whether it dropped anything. The pre-daily counts are reused when the daily layer did not run and the dedupe dropped nothing; otherwise the owner recomputes exactly as before.

## Save/migration impact
None.

## Verification result
- `npx vitest run tests/gameTick.dedupe.test.ts tests/gameTick.layerOrder.test.ts tests/dailyPopulation.cadence.test.ts tests/workerMainThread.parity.test.ts` — PASS.
- `npx tsc -p tsconfig.app.json --noEmit` — PASS; `npm run lint` — PASS.
- Not measured: a before/after tick-time profile; the change removes one O(n) scan without altering output.
