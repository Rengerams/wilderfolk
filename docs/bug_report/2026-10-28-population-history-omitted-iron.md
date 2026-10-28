# Population history resource samples omitted iron

- Bug: The rolling population history sampled gold, food, wood and stone but never iron.
- Status: fix implemented; PR CI verification pending
- Severity: low
- Date discovered: 2026-10-28
- Version/build: 0.6.5.2
- Reporter: owner review of `PopulationHistoryEntry`
- Area: statistics / resource history
- Owner module: `src/game/tickLayerRealtime.ts`
- Related PR: follow-up refactor to PR #90

## Observed behavior
The `PopulationHistoryEntry` interface had optional snapshots for gold, food, wood and stone but no `iron` field. The ten-tick snapshot in `tickLayerRealtime` similarly omitted `state.resources.iron`. A resource trend based on saved history therefore cannot display past iron stock.

## Expected behavior
Future snapshots record iron alongside the existing resource metrics with no new per-tick scan or allocation beyond the existing one snapshot. Existing saves and older history entries without `iron` remain valid.

## Root cause
A missing field in both the history entry type and the single realtime sampling writer.

## Fix
Add optional `iron?: number` to the history entry type and `iron: state.resources.iron` to the existing ten-tick snapshot. Do not synthesize iron values for historical samples: doing so would invent old resource levels. No separate save field or migration is needed because history samples are persisted and cloned as complete objects.

## Regression test
`tests/populationHistory.iron.test.ts` checks the real `gameTick` sampling boundary, snapshots of all five resources, and backwards-compatible optional iron. Full CI status is tracked by the PR rather than assumed here.
