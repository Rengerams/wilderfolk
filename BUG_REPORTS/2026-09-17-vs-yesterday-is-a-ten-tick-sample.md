# "vs yesterday" in the council report is a 3.3-hour comparison

- Bug: the Settlers council line is labelled "vs yesterday" but compares the last two `populationHistory` samples, and those are taken every 10 ticks — about 3.3 in-game hours at 72 ticks per day; the "Food stored" and "Wildlife" lines use the same sample as their baseline
- Status: resolved — owner ruling: recompute to a real previous day, not the 10-tick sample
- Date discovered: 2026-09-16 (UI-logic audit, finding F10)
- Version/build: 0.6.4
- Reporter: UI-logic audit (`docs/private/audits/2026-09-16/ui-logic.md` F10), verified against the tree 2026-09-17
- Area: UI (council report)
- Owner module: `src/game/dashboardData.ts` (sampling: `src/game/tickLayerRealtime.ts`)

## Status history

- 2026-09-16 — open (found by the UI-logic audit pass; never filed as a report)
- 2026-09-17 — verified against the tree; held open pending an owner decision
- 2026-09-17 — **resolved.** Owner ruling: the label must be true — recompute to a real previous day
  rather than relabel. See "## Fix".

## Observed behavior

```ts
const prev = pop.length >= 2 ? pop[pop.length - 2] : undefined;
const cur = pop[pop.length - 1];
const delta = prev && cur ? (cur.humans ?? 0) - (prev.humans ?? 0) : 0;
lines.push({ label: 'Settlers',
  value: delta === 0 ? `${humans}` : `${humans} (${delta > 0 ? `+${delta}` : delta} vs yesterday)` });
```

`populationHistory` is appended by `tickLayerRealtime.ts` on
`state.tick % STATS_SAMPLE_INTERVAL_TICKS === 0` with `STATS_SAMPLE_INTERVAL_TICKS = 10`; a day is
72 ticks, so the previous entry is 10/72 of a day ≈ 3.3 in-game hours. The same `prev` is used for
the "Food stored" delta and the "Wildlife" delta, which carry no label at all.

## Expected behavior

Two options were considered (the ruling is recorded at the end of this section):

1. **Recompute** — pick the last sample whose `Math.floor(tick / TICKS_PER_DAY)` is one less than
   the current day's, so "vs yesterday" means yesterday (and the food/wildlife deltas become daily
   too); or
2. **Relabel** — call it what it is ("since the last sample", or show the interval), leaving the
   arithmetic alone.

**Decided 2026-09-17 — option 1** (recompute to a real day). Option 2 was rejected: the label was the
part that was false, and relabelling to a 3.3-hour window would have made a trend line that is noise at
that scale. Options as recorded:

Option 1 changes what the player reads as a trend; option 2 changes only wording.

## Reproduction steps

1. Play with the population changing slowly.
2. Watch the Settlers line in the dashboard council report.
3. **Before the fix:** "+1 vs yesterday" appeared and disappeared several times within one in-game day
   (the last two `populationHistory` entries are 10 ticks apart, not a day). **After:** the delta is
   against the most recent earlier-day sample.

## Evidence

Static trace of the three uses of `prev` in `deriveCouncil`, the sampling constant and its cadence
comment ("300 samples × STATS_SAMPLE_INTERVAL_TICKS (≈42 game days at 72 ticks/day)"), and
`TICKS_PER_DAY`.

## Root cause

The council report treats the sampling buffer as a daily series, but it is a rolling metric buffer
shared with other charts — the buffer carries a `day` field, which is what a daily comparison would
have to key on. Note this is a *second* copy of that assumption: `dashboardData.ts:411` already maps
history points with `day: p.day ?? Math.floor(p.tick / TICKS_PER_DAY)`, so the data needed for the
correct comparison is present.

## Regression test

`tests/dashboardData.prisonAndCouncil.test.ts` constructs the buffer and pins the chosen baseline: a
day-4 sample is placed behind two day-5 samples, and the Settlers line must read "+2 vs yesterday"
(20 − 18) instead of the −10 the ten-tick baseline produced. It fails against the old
`pop[pop.length - 2]` comparison, and the source was restored byte-identically afterwards (sha256
unchanged).

## Invariants checked

- `populationHistory` is capped and shared (`POPULATION_HISTORY_MAX`), so the fix must not assume the
  entry one day back is still in the buffer. It searches backwards for the most recent earlier-day
  sample and falls back to `tick <= cur.tick - TICKS_PER_DAY` when `day` is absent, so an empty result
  simply yields no delta rather than a wrong one.
- The "Food today" line is driven by `economyLedger`, not by this buffer, and is unaffected.

## Save/migration impact

None.

## Verification result

Resolved 2026-09-17. `test:types` exit 0 · `lint` 0 warnings / 0 errors · `build` exit 0 ·
`npm test` 172 files / 923 tests passed · `audit:deps:cycles:strict` exit 0.
`tests/dashboardData.prisonAndCouncil.test.ts` fails against the ten-tick baseline and passes with the
day-based one.

## Related commits or files

- `src/game/dashboardData.ts` — `deriveCouncil` (`:260`, `:265`, and the food/wildlife deltas)
- `src/game/tickLayerRealtime.ts` — `STATS_SAMPLE_INTERVAL_TICKS`, the sampling push
- `docs/private/audits/2026-09-16/ui-logic.md` — finding F10

## Fix

**Applied 2026-09-17** under the owner ruling "recompute to a real day". `deriveCouncil` now selects the
most recent sample from an earlier `day`:

```ts
const prev = cur
  ? [...pop].reverse().find((s) =>
      s !== cur
      && (s.day != null && cur.day != null ? s.day < cur.day : s.tick <= cur.tick - TICKS_PER_DAY))
  : undefined;
```

Because Settlers, "Food stored" and "Wildlife" all read that one `prev`, all three lines now compare a
real day instead of the previous 10-tick sample.
