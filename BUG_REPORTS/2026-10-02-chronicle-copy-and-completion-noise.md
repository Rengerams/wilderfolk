# Name of file: 2026-10-02

- Bug: Chronicle copy defects and construction-completion noise, measured on a live export
- Status: resolved
- Date discovered: 2026-10-02
- Date resolved: 2026-10-09
- Version/build: 0.6.5.0, live export (New Frontier, Y3 D183, population 1643, 8038 events)
- Reporter: agent, scanning the owner's exported chronicle
- Area: UI (chronicle text)
- Owner module: `src/game/dailyWorldEvents.ts` (festival copy), `src/game/dailyScheduleFatigue.ts` (shift copy), `src/game/dailyBuildingEconomy.ts` (completion aggregation)
- Cadence: continuous

## Status history

- 2026-10-02 — open (measured from the export below; no fix applied)
- 2026-10-09 — investigating: re-measured all four against a larger export of the same colony
  (`wilderfolk-New-Frontier-chronicle (10).txt`, 8038 events, exported 9-10-2026 01:43). Items 1 and 2
  reproduce exactly. Item 3's *number* is what the report says it is, but its quoted tail no longer
  matches the tree (`h shifts` had already become `avg N h worked`), and item 4's counts have moved
  (734 rows, and the log cap had already gone 6000 → 20000). Both re-measured before any fix.
- 2026-10-09 — resolved (all four fixed in their owners, each with a regression test proven to fail
  before the fix and pass after; see Verification result)

## Observed behavior

Re-measured in the owner's later export (8038 events, retained window Y1 D313 → Y3 D183, 233 days).
Counts below are exact for that file.

**1 · Doubled word in the festival line** — both writers in `dailyWorldEvents.ts` appended
`" festival began in the village"` to a name that can already end in "Festival":

```text
[Y2 D183] [season] Harvest Festival festival began in the village
```

One occurrence of the doubled shape in this export (`Y2 D183`); the other seasonal starts read as the
writer intended — `Midsummer Feast festival began in the village` — which is exactly why the defect was
easy to miss. The same season rolls the same name, so the earlier export the report measured has the
same single occurrence per year it was exported in.

**2 · Missing preposition** — 100 occurrences in the export, all three generations of the same line
(`dailyScheduleFatigue.ts`, the `recoveries` writer):

```text
[Y3 D21] [event] Short shifts spared 1 settler that output cost (avg 0.3h worked).
[Y2 D185] [event] Short shifts spared 1 settler that output cost (1.0h shifts).
```

("spared 1 settler **from** that output cost".) Every one of the 100 rows carries the missing word —
the older `(N.Nh shifts)` tail and the current `(avg N.Nh worked)` tail alike.

**3 · An average presented as a shift length** — the report's reading of the *number* was right, and
the code agrees with it: the figure is `riseHours / rises` over the settlers whose fatigue changed
(`dailyScheduleFatigue.ts:82-92`), i.e. the mean hours each **affected settler** worked — not one
shift's length. But the wording had already moved on from the quoted tail:

```text
[Y2 D184] [event] Longer shifts reduced work output for 10 settlers tomorrow (avg 22.7h worked).
[Y3 D149] [event] Longer shifts reduced work output for 20 settlers tomorrow (avg 22.7h worked).
```

21 of the 64 longer-shift rows use this current template, measured **11.0h to 24.0h** — the report's
11.3h–24.0h range, reproduced. The tail was still misreadable, for a reason the report could not have
seen in its own copy: `worked` is a dangling participle, so the head of the sentence says the figure
describes *settlers* ("for 10 settlers … (avg 22.7h worked)"). The parenthetical is the one place in
the line where a number with an `h` could be a shift length instead.

**4 · One row per building completion** — 734 of the 8038 events (9.1 %) are `X completed`, from 33
labels:

| line | count | worst single day |
|---|---|---|
| `House completed` | 123 | — |
| `Wall completed` | 115 | **30× on Y2 D104** |
| `Mansion completed` | 72 | — |
| `Road completed` | 68 | — |
| `School completed` | 63 | — |

The busiest day in the export carries 44 completions (Y3 D14); Y2 D104 carries 32 completion rows, of
which 30 are the identical `Wall completed`. `EVENT_LOG_MAX_ENTRIES` is 20000 (`src/game/eventLog.ts:7`),
not the 6000 the report measured, and the trim is still `state.eventLog.pop()` (`:57`).

## Expected behavior

Text that reads as the writer intended (`Harvest Festival began…`, `spared 1 settler from that output
cost`, and a figure that names itself an average of the affected settlers), and one line per
*label* on a day that finishes a run of buildings (`Wall completed ×30`), so a build spree does not
spend the chronicle's retention on rows the player cannot tell apart.

## Reproduction steps

1. Play a multi-year colony and build in quantity (the export's Y2 D104 has 30 walls finishing at once).
2. Let a festival with "Festival" in its name start (`Harvest Festival`).
3. Let settlers run long shifts for a few days.
4. Export the chronicle and read it.

## Evidence

- The export files in the owner's Downloads folder: `wilderfolk-New-Frontier-chronicle (10).txt`
  (8038 events) and the earlier `wilderfolk-New-Frontier-chronicle.txt` (3433 events) the original
  report measured. Counts above are exact, by normalised line shape.
- `EVENT_LOG_MAX_ENTRIES = 20000` with `state.eventLog.pop()` beyond it (`src/game/eventLog.ts:7`,
  `:57`) — so 734 construction rows were 9.1 % of a bounded history, and 30 identical rows on one day
  told the player nothing they did not already know.
- Writers: `dailyWorldEvents.ts:92` (seasonal) and `:113` (seeded); `dailyScheduleFatigue.ts:98` and
  `:108` (both templates, with `riseHours`, `recoveries`, `recoveryHours` accumulated at `:82-92`);
  `dailyBuildingEconomy.ts:281` (completion, before the fix).

## Root cause

Templates that append a noun (`festival`) to a value that can already contain it; a schedule line whose
parenthesised number is an average of the people in the sentence but reads as a shift; and a
per-completion log line with no aggregation, on a chronicle whose history is bounded by an entry cap.

## Regression test

- `tests/dailyEvents.chronicleCopy.test.ts` — item 1 (a real seasonal start on all twelve seasonal
  writer days, plus a source assertion that both writers share one message shape) and item 4 (three
  Walls and one Leader's House finishing in one daily pass produce exactly two rows, `Wall completed ×3`
  and `Leader's House completed`, in completion order).
- `tests/dailyScheduleFatigue.test.ts` — item 2 (a short-shift recovery line reads
  `spared 1 settler from that output cost`) and item 3 (the longer-shift line reads
  `each worked 12.0h on average` and never `h shifts`).
- Each assertion was proven to fail before its fix by temporarily reverting the production change and
  re-running the suite (see Verification result).

## Invariants checked

- *"One owner per rule"* — the festival line was built in two places with the same defect
  (`dailyWorldEvents.ts:92` and `:113`); both now use one message shape, pinned by a test. `[verified]`
- *"One owner per function"* — the completion aggregation lives in `dailyBuildingEconomy.ts`
  (`logCompletedBuildings`, registered in `OWNERSHIP_OVERVIEW.md`). `[verified]`
- *"The chronicle shows the player their history"* — repaired for the completion writer: a day's run of
  one label is one row carrying its count. `[verified]`

## Save/migration impact

None. The aggregation adds no field to `GameEventLog`, so no save format changed.

## Verification result

Re-measured first, then fixed and verified on 2026-10-09.

- Reproduced: item 1 (`Harvest Festival festival began in the village`), item 2 (100 × `spared N
  settler(s) that output cost`). Partial: item 3 was already `avg N h worked` — the report's "what the
  number is" claim is correct, its quoted tail is not; reworded anyway. Item 4 re-measured at 734 rows.
- Fail-before / pass-after: each of the four fixes was reverted in turn and the new assertions failed
  (`Short shifts spared 1 settler that output cost`, `avg 6.0h worked`, three separate `Wall completed`
  rows instead of `×3`, `festival festival` in the seasonal line), then restored and passed.
- `npm run test:types` — PASS.
- `node scripts/check-comments.mjs` — mine pass; the gate still fails on another worker's in-flight test
  file (`tests/workSkillAttribution.accrual.test.ts:4`, a "used to be" clause). A second one
  (`tests/huntingFightBack.fate.test.ts:65`, a date) was present at first observation and cleared by its
  owner during this task. Both left untouched by instruction.
- `node scripts/check-docs.mjs` — PASS.
- `npm run lint` — PASS (0 warnings, 0 errors).
- `npx vitest run` on the touched and adjacent suites —
  `dailyEvents.chronicleCopy`, `dailyScheduleFatigue`, `buildingPlacement.chronicle`,
  `eventLog.duplicatesAndNotifications`, `festival.behavior`, `prisonFestivalWorkContinuity`,
  `low-4-save-worldgen`, `low-2-events-defense`, `gameTick.layerOrder`, `medium-C1-economy`,
  `storageCaps.dailyWiring`, `autoStaff.notify` — all pass.
- The whole suite (`npx vitest run`) — **309 files / 1989 tests passed, 2 skipped, 4 failures in 2
  files, none in a file this change touches:** `tests/duplicationA.remaining.test.ts` (A12, a second
  world→cell clamp under `src`) and `tests/frontierCombat.raidGold.test.ts` (3 cases, `getRaidGrowthScale`
  returns 3.16 where the test expects 10). Both reproduce on their own, in files outside this diff and
  outside my ownership; `tests/groundLook.bands.test.ts` also timed out once under the full parallel run
  and passes in isolation. Reported as pre-existing, not fixed.
- No browser session was started: all four defects are string/aggregation rules, and the harness
  cannot read the chronicle's retained window any better than the export does.

## Related commits or files

- `src/game/dailyWorldEvents.ts:92`, `:113`
- `src/game/dailyScheduleFatigue.ts:82-110`
- `src/game/dailyBuildingEconomy.ts` (`logCompletedBuildings`, `tickBuildingProgress`)
- `src/game/eventLog.ts:7`, `:57`
- `tests/dailyEvents.chronicleCopy.test.ts`, `tests/dailyScheduleFatigue.test.ts`
- `CHANGELOG.md` — the entry for these four fixes is owed; wording supplied to the owner (this report
  is not the changelog).

## Fix

All four applied, each in its owner:

1. **Festival copy** — dropped the appended noun from both writers: `${name} began in the village`. The
   name already carries "Festival" where the writer meant it, and every seasonal name reads correctly
   with the shorter template (`Spring Revel began in the village`, `Harvest Festival began in the
   village`). The `addBigNews` line beside each writer already read `${name} has begun!` and was left
   alone.
2. **Missing preposition** — `spared N settler(s) from that output cost`.
3. **The average** — reworded to `(each worked N.Nh on average)`, which can only describe the settlers
   in the sentence: the adverb is not a unit, and `each` scopes the figure to them. The number itself is
   unchanged — it is the correct mean over the settlers whose fatigue rose, and a 24.0h mean (settlers
   who worked the whole day) remains a balance signal for a separate report, not a copy defect.
4. **Completion noise** — `tickBuildingProgress` tallies completions by building type during the day's
   pass and `logCompletedBuildings` writes **one row per label**, with the count typed into the message
   when the day finished more than one (`Wall completed ×30`). Chosen over a `count` field beside the
   message because the worker's tick-delta merge only carries entries whose id is new
   (`src/game/simBuffers/simDelta.ts:569-586`), so a count on an existing entry could never reach the
   main thread's copy of the log; typing it into the text makes the entry that crosses the boundary the
   finished line. Nothing is dropped: a completion line remains the record that a build finished, and a
   single completion still reads exactly as before (`Wall completed`), so the count appears only where
   it has something to say. The trade-off is that a day's completion lines are written together at the
   end of the assignment pass rather than in mid-loop position; their order among themselves is the
   order the buildings finished, which the second test pins.

## Still open / follow-ups (not fixed here)

- **The same shape at the placement writer** (`buildingPlacementActions.ts:211`, `${label} placed`):
  251 placement rows in the same export, with runs of the identical line — **50 × `School placed`, 43 ×
  `House placed`, 22 × `Lumber Mill placed`**. That is the same defect class as item 4 (79 % of placement
  rows are duplicates of another row), but it is a different writer with its own tests, and the contract
  for this task was the completion writer, so it is reported and not changed. The identical repair fits.
- **`Andres Andres`** — a settler in the export whose first name and surname are the same, so eight lines
  read `Andres Andres` (or `Deedee Andres and Andres Andres`). That is the name-pool/name-assembly owner,
  not chronicle copy.
- **A 24.0h average** — measured on 5 rows; the report already flagged it as a balance signal, and it
  still is.
