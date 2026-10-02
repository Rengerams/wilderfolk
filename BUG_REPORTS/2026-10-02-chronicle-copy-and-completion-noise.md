# Name of file: 2026-10-02

- Bug: Chronicle copy defects and construction-completion noise, measured on a live export
- Status: open
- Date discovered: 2026-10-02
- Version/build: 0.6.5.0, live export (New Frontier, Y2 D185, population 976, 3433 events)
- Reporter: agent, scanning the owner's exported chronicle
- Area: UI (chronicle text)
- Owner module: `src/game/dailyWorldEvents.ts` (festival copy), `src/game/dailyScheduleFatigue.ts` (shift copy), the building-completion log writer (noise)
- Cadence: continuous

## Status history

- 2026-10-02 — open (measured from the export below; no fix applied)

## Observed behavior

Four separate text/noise defects, all counted in the 3433-event export:

**1 · Doubled word in the festival line** — `dailyWorldEvents.ts:77` and `:98` append `" festival began
in the village"` to a name that may already end in "Festival":

```text
[Y2 D183] [season] Harvest Festival festival began in the village
```

**2 · Missing preposition** — 31 occurrences, `dailyScheduleFatigue.ts:108`:

```text
[Y2 D185] [event] Short shifts spared 1 settler that output cost (1.0h shifts).
```
("spared 1 settler **from** that output cost")

**3 · An average presented as a shift length** — 29 occurrences, `dailyScheduleFatigue.ts:98`:

```text
[Y2 D184] [event] Longer shifts reduced work output for 10 settlers tomorrow (22.7h shifts).
```
The figure is `riseHours / rises` — the **average worked hours** of the affected settlers, not a single
shift. Measured range across the 29 lines: **11.3h to 24.0h**. The 24.0h case means the settlers
concerned worked the entire day, which is a balance signal independent of the wording.

**4 · One row per building completion** — 370 of the 3433 events (11 %) are `X completed`, with runs of
identical lines on one day:

| line | count | worst single day |
|---|---|---|
| `Wall completed` | 85 | **30× on Y2 D104** |
| `House completed` | 57 | 20× on Y2 D145 |
| `Road completed` | 39 | 13× on Y2 D11 |
| `Mansion completed` | 41 | 9× on Y2 D154 |

The busiest day in the export carries 88 events, most of them completions.

## Expected behavior

Text that reads as the writer intended (`Harvest Festival began…`, `spared 1 settler from that output
cost`), and either one line per *notable* completion or an aggregate (`12 walls completed`) so a build
spree does not spend the chronicle's retention on rows the player cannot distinguish.

## Reproduction steps

1. Play a multi-year colony and build in quantity (the export's Y2 D104 has 30 walls finishing at once).
2. Let a festival with "Festival" in its name start (`Harvest Festival`).
3. Let settlers run long shifts for a few days.
4. Export the chronicle and read it.

## Evidence

- The export file (`wilderfolk-New-Frontier-chronicle.txt`), scanned by normalised line shape; counts
  above are exact.
- `EVENT_LOG_MAX_ENTRIES = 6000` with `state.eventLog.pop()` beyond it (`src/game/eventLog.ts:15`, `:51`)
  — so 370 construction rows cost the player 11 % of a bounded history, and the retained window measured
  here is 233 days (oldest entry `Y1 D313`, newest `Y2 D185`).
- Writers: `dailyWorldEvents.ts:77` (`${seasonalName} festival began…`) and `:98` (`${name} festival
  began…`); `dailyScheduleFatigue.ts:98` and `:108` (both templates quoted above, with `riseHours`,
  `recoveries`, `recoveryHours` accumulated at `:76-90`).

## Root cause

Templates that append a noun (`festival`) to a value that can already contain it; a schedule line whose
parenthesised number is an average with no unit word to say so; and a per-completion log line with no
aggregation, on a chronicle whose history is bounded by an entry cap.

## Regression test

For (1) and (2) a copy assertion beside the existing copy tests is enough. For (4) the honest guard is a
harness/behavioural one (N completions in one day produce fewer rows), not a string test.

## Invariants checked

- *"One owner per rule"* — the festival string is built in two places with the same defect
  (`dailyWorldEvents.ts:77` and `:98`); they should share one line builder. `[verified]`
- *"The chronicle shows the player their history"* — weakened by (4): 11 % of a capped log is
  construction rows, and 30 identical rows on one day tell the player nothing they did not already know.

## Save/migration impact

None.

## Verification result

- Static: counts and shapes from the export; the four writers read in the tree.
- Not run: no fix, no test yet. No browser session was started.

## Related commits or files

- `src/game/dailyWorldEvents.ts:77`, `:98`
- `src/game/dailyScheduleFatigue.ts:76-110`
- `src/game/eventLog.ts:15`, `:51`
- `CHANGELOG.md` (2026-09-30) — "The chronicle can now show its whole history on request": it loads the
  rest of what is retained; retention itself is the cap above.

## Fix

Not applied — (1) and (2) are one-line copy fixes; (3) needs the owner to decide what the number should
say (average hours, or the worst settler's hours) and whether a 24.0h average is intended; (4) is a UX
decision (aggregate runs of the same completion within a day). All four are the owner's call.
