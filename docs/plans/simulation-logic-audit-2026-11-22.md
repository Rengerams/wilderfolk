# Simulation-logic audit — 2026-11-22

- **Branch / commit:** `audit-simulation-logic` @ `5722a330`
- **Build inspected:** package `0.6.5.1` (development target `0.6.5.2`)
- **Scope:** the simulation pipeline only — `gameTick` orchestration, the four tick layers, the
  calendar/day-phase gates, wildlife and ecology, daily life-event odds, housing/workforce
  assignment, raids, save/load compatibility, and the gates that guard them.
- **Method:** code trace of every scheduled lane, the local gates in `scripts/test.mjs` that fit the
  environment, the targeted simulation suite, the full-year harness on two seeds, and a 7.2-million
  draw measurement of the day-roll distribution (Appendix A).
- **Verdict:** the pipeline is structurally sound — fixed layer order, one owner per scheduled
  decision, deterministic rolls, clean invariants across 360 simulated days — but three defects need
  work: a retired subsystem is still documented as live, the day-roll resolution distorts every
  small daily probability, and predator capacity and prey replenishment are owned by two modules that
  settle into a **prey-collapse** equilibrium.

## Headline findings

| ID | Finding | Severity | Status | Report |
|---|---|---|---|---|
| F-01 | Predator ceiling (25) is 2.5× the prey floor's pack target (10); prey collapses by day 90 | medium | open | [`2026-11-22-wildlife-predator-ceiling-collapses-prey`](../bug_report/2026-11-22-wildlife-predator-ceiling-collapses-prey.md) |
| F-02 | Day rolls quantize to 1/10,000, inflating illness, divorce and old-age mortality | medium | open | [`2026-11-22-daily-odds-quantized-to-ten-thousandths`](../bug_report/2026-11-22-daily-odds-quantized-to-ten-thousandths.md) |
| F-03 | Visitor camps were retired, but their tick, spawners, dead reads and docs remain | low | open | [`2026-11-22-architecture-doc-still-schedules-retired-visitors`](../bug_report/2026-11-22-architecture-doc-still-schedules-retired-visitors.md) |
| F-04 | `npm run audit` is red on `knip` (225 unused exports, 1 false-positive import) | medium | resolved 2026-11-22 | — |
| F-05 | Tick-layer cadence descriptions contradict `gameTick` | low | open | — |
| F-06 | The weekly full-year gate is demographically inert | info | open | — |
| F-07 | Committed call-graph artifacts lag the source | info | resolved 2026-11-22 | — |

---

## 1. The visitor camp bug — a retired subsystem that still looks live

### What the subsystem did

Visitor camps were an on-map feature: a group of travellers (`performers`, `traders`,
`pilgrims`, …) arrived at a camp, stayed a counted number of days, gave a food-ledger `gift` on
inflow, hosted festival performers, and could be courted. The lifecycle lives in
`src/game/groupEvents.ts`:

| Function | Line | Responsibility |
|---|---|---|
| `spawnVisitorGroup` | 257 | Create a group at a camp site |
| `tickVisitorGroups` | 336 | Advance `daysLeft`, fire departure, apply gifts |
| `tryMidYearVisitorEvent` | 1000 | Mid-year arrival roll |
| `tryFirstWeekVisitor` | 1014 | First-week arrival roll |

### The defect

None of the four has a caller anywhere in `src/`. The feature is not "broken"; it is **unreachable**,
and the surrounding system has not been told:

- **No scheduler.** `tickLayerDaily` no longer calls `tickVisitorGroups`
  (`OWNERSHIP_OVERVIEW.md:28`), and no alternative visitor scheduler exists.
- **No spawner.** The decision registry states it outright: *"No visitor camps or actors are
  spawned"* (`src/game/simulation/decisionRegistry.ts:449`).
- **No data.** Save loading replaces the array with `visitorGroups: []`
  (`src/game/saveLoad.ts:1529`) and filters visitor actors out (`saveLoad.ts:1549`), so even a save
  written by an older build loads with the subsystem empty.
- **Two unreachable reads.** `src/game/humanTick.ts:481` looks for festival performers in
  `state.visitorGroups`, and `humanTick.ts:1355` checks for performers before courtship. Both
  branches are dead: the array is always empty.

The countdown arithmetic itself is correct — arrival day is a grace day, `daysLeft` decrements at
each following midnight, and the departure block runs on the tick the counter reaches zero
(`groupEvents.ts:348-411`). That is exactly the problem: the code *reads* as a working lifecycle, so
every reader (and every future agent) assumes it runs.

### Documentation drift it left behind

| Document | Claim | Reality |
|---|---|---|
| `ARCHITECTURE.md:114` | daily layer runs "00:00 visitors" | no such call since the retirement |
| `OWNERSHIP_OVERVIEW.md:910` | `tickVisitorGroups` writes the food ledger `gift` "on each inflow" | no caller, no inflow |
| `docs/bug_report/2026-11-07-visitor-groups-never-depart.md` | **resolved** by moving the lifecycle to 00:00 | that call has since been deleted; the report describes a fix that no longer exists |

### Why it matters beyond tidiness

1. **The architecture register is wrong about a live decision.** `OWNERSHIP_OVERVIEW.md` is the
   document agents are told to consult before adding a function; an entry describing a phantom
   ledger writer is worse than no entry.
2. **Festival-performer paths can never fire.** The performer reports
   (`2026-08-22-performer-revelry-shortens-active-festival`,
   `2026-08-21-festival-participants-keep-working`) guard behaviour that the shipped build cannot
   reach, so their regressions prove nothing about the game.
3. **A whole RNG stream and a group of spawn helpers** stay in the decision surface, inviting a
   future agent to "fix" a feature that is deliberately gone.

### Recommended fix

Delete the retired surface (`tickVisitorGroups`, `spawnVisitorGroup`, `tryMidYearVisitorEvent`,
`tryFirstWeekVisitor`, the two `state.visitorGroups` reads) and keep only the load-time strip as
explicit legacy save-compatibility code with a comment saying so. Then correct the layer table, the
ledger row and the 2026-11-07 report's verification section. If the camps are planned to return,
mark them as such in the roadmap instead of leaving them registered as live.

---

## 2. Daily event odds — every small probability is rounded up to a 1/10,000 step

### The mechanism

Daily life decisions are day-keyed, not tick-keyed: each one draws a stable value from
`personDayRoll(entityId, tick, salt)` (`src/game/simRng.ts:109-111`), which mixes the entity id, the
absolute calendar day and a per-decision salt, avalanches the result and then **reduces it to a
10,000-bucket grid**:

```ts
// src/game/simRng.ts:99-105
return (hash % 10000) / 10000;
```

So a roll can only be `0.0000, 0.0001, 0.0002, … 0.9999`, and any threshold is effectively

```
P(roll < p) = ceil(p · 10⁴) / 10⁴
```

That is harmless for a 20% or 18% chance. It is not harmless for the small rates the life cycle
depends on: rounding up to the next bucket inflates them, and the smallest documented chance
(age-60 old-age mortality) is *smaller than one bucket*, so it can only fire on the single value
`0.0000`.

### Measured effect (7.2 M draws, Appendix A)

| Decision | Documented | Effective | Distortion |
|---|---|---|---|
| Illness / accident death (`HUMAN_DAILY_ILLNESS_CHANCE`) | 0.00012/day → **4.32%/yr** | 0.0002/day → **7.15%/yr** | ×1.66 |
| Amicable divorce (`0.075/360`) | 0.000208/day → **7.50%/yr** | 0.0003/day → **11.34%/yr** | ×1.51 |
| Old-age death, age 60 | **2.00%/yr** | **3.65%/yr** | ×1.83 |
| Old-age death, age 61 | 5.27%/yr | 7.22%/yr | ×1.37 |
| Old-age death, age 62 | 8.53%/yr | 10.84%/yr | ×1.27 |
| Old-age death, age 63 | 11.80%/yr | 14.85%/yr | ×1.26 |
| Old-age death, age 65 | 18.33%/yr | 21.99%/yr | ×1.20 |
| Old-age death, age 70 | 34.67%/yr | 35.96%/yr | ×1.04 |
| Old-age death, age 85 | 83.67%/yr | 86.00%/yr | ×1.03 |

The old-age curve is documented as a smooth ramp — *"2% at age 60, scaling to 100% at age 90"*
(`src/game/dayCycle.ts:243-255`) — but on a 10,000-bucket grid each additional bucket is worth
**3.6 percentage points a year**, so the shipped curve is a staircase that starts 83% above its
documented rate and only converges near the top. Because it is a mortality curve applied every day
to every venerable settler, the distortion compounds across the whole population.

### The consequence that is easiest to see in play

`getValleyIllnessChanceBonus` (`src/game/ecologyStage.ts:336-345`) is supposed to make a degraded
valley deadlier:

| Valley stage | Bonus | Combined daily chance | Effective |
|---|---|---|---|
| stable | 0 | 0.00012 | **0.0002** |
| damaged | +0.00008 | 0.00020 | **0.0002** |
| collapse | +0.00020 | 0.00032 | **0.0004** |

The `damaged` stage's penalty is **exactly inert**: it lands on the same bucket as `stable`. The
valley can visibly degrade and the illness rate does not move until the stage falls to `collapse`.

### What is *not* affected

Every hand-authored threshold is already a multiple of 0.0001 and therefore exact: conception
(0.18 home / 0.0045 near / 0.14 affair), affair gossip (0.06 / 0.12 / 0.22), affair tryst
(0.10 / 0.07), youth love (0.0015 start, 0.0004 breakup), hospital treatment (0.2), leisure
(0.34 / 0.55), town-hall petitions (0.18 / 0.2 / 0.25 / 0.35 / 0.4 / 0.45 / 0.55) and hunting
(0.012 / 0.02). The defect is confined to rates that are **derived** — divided by the 360-day year
(old age, divorce) or composed with a bonus (illness) — which is why it survived review.

### Secondary observation — order-coupled streams

Most daily decisions use the salted, day-keyed roll, which is the right shape. Two still use the
sequential `getSimRng('humanRelationships')` stream: amicable divorce
(`simulation/humanRelationships.ts:911`) and the whole youth-love pass
(`humanRelationships.ts:580, 619`). Those draws advance once per settler in iteration order, and the
youth-love pass draws a *variable* number of times depending on whether a candidate is found. The
result is deterministic for a fixed state sequence, but it is not a stable per-person lane: adding a
building or changing candidate selection can change an unrelated settler's marriage luck that day.
Low severity, worth folding into the same cleanup.

### Daily world-event cadence (for completeness)

- **Seasonal festivals** are guaranteed: the first eligible day of each season, 5 days, 20 festival
  days a year (`dailyWorldEvents.ts:85-107`).
- **Random festivals** are checked every 50 days (`FESTIVAL_CHECK_TICKS = ticksForDays(50)`,
  `dayCycle.ts:288`), 25% (35% with a staffed town hall), village ≥ 6, honouring the cooldown, and
  run 20–39 days (`dailyWorldEvents.ts:109-124`). Expected: roughly one random festival every
  143–200 days, so a mid-sized village spends a quarter to a third of the year in festival.
- **Wildlife replenishment** runs every third colony day at 18:00 (`dailyWorldEvents.ts:181-183`) —
  the cadence behind F-01.
- **Yearly world events** roll once per year, not per day (`dailyWorldEvents.ts:215-232`).

### Recommended fix

Raise the roll resolution so the grid stops rounding real rates up — either `hash / 2 ** 32` (full
resolution) or `% 1_000_000 / 1_000_000` — and add one test that measures the effective rate of a
sub-bucket probability (the illness constant is enough) rather than restating the threshold. Note
the trade-off honestly: **every seeded run re-rolls** because the value of each roll changes, so the
fix belongs in a release that accepts a new deterministic baseline, not in a hotfix. Save data is
unaffected; only future rolls change.

---

## 3. Wildlife population discrepancy — two owners, one prey collapse

### Two owners decide population limits

| Owner | What it decides | Values |
|---|---|---|
| `src/game/tickLayerSystems.ts:772-781` | breeding ceiling, decided inline per species | rabbit **120**, deer **60**, wolf **25**, all others **35** |
| `src/game/worldGen.ts:357-367` | replenishment floors and targets | rabbit min 35 → target **150**, deer min 12 → target **45**, wolf min 5 → target **10**, fox min 8 → target 20, pulse cap **16** prey |

Breeding is damped by `capacityFactor = 1 - count / maxPop` plus a `scarcityBoost` of 1.55 below 25%
of the ceiling and 1.25 below 45% (`tickLayerSystems.ts:783-790`). Replenishment tops up to the
target only while the count is below the *minimum*, at most 16 prey every third day
(`worldGen.ts:363, 402`).

### Why the numbers disagree

1. **Wolves: ceiling 25 vs pack target 10.** Replenishment considers a pack of 10 full, so it stops
   feeding the pack at 10 — while breeding happily pushes to 25. The pack settles at **2.5×** the
   population the map was designed to carry, and it eats the prey base the floor is trying to
   rebuild.
2. **Rabbits: target 150 above ceiling 120.** The floor refills *past* the breeding ceiling, so
   recovery overshoots, breeding stalls at 120, and the herd has to fall back under the ceiling
   before it breeds again.
3. **Foxes are gated on rabbits** (`sufficientPreyForFoxes = rabbits >= 20`) and wolves on
   `deer + foxes + rabbits >= 30`, so the collapse cascades down the chain instead of correcting.

### Measured outcome

Passive 90-day harness (no hunters, restocked food), seed 12345 and 777:

| Seed | Rabbits | Deer | Wolves | Foxes | Grass |
|---|---|---|---|---|---|
| 12345 | **0** | 7 | **25** (cap) | 1 | 136 |
| 777 | **0** | 1 | **25** (cap) | 2 | 127 |

The 16-rabbit floor every three days is consumed faster than it is replenished, so the map carries
no rabbits for most of the year while the wolf pack sits exactly on its ceiling. Hunting spots then
have nothing to hunt and the ecology stage reads a collapsed prey base — the state that also feeds
the `collapse` illness bonus from F-02.

These numbers were produced by `scripts/run-full-year.mts` at `ecd9866c`; the only commits since
are documentation, so they describe the current source.

### Recommended fix

Move both the ceiling and the replenishment target into `speciesConfig.ts` as one owner, enforce
`target ≤ cap` for every species, and gate predator breeding on the prey base rather than only on
the pack's own count — reuse the existing `capacityFactor` shape against the food supply so a pack
cannot saturate beyond what the map feeds. No new scheduler: both callers keep their cadence.

---

## 4. Other findings

### F-04 — `npm run audit` is red on `knip` (medium)

`knip` exits 1 with **225 unused exports across 120 files** plus one unresolved import. The
unresolved import (`/tests/browser/villagePortraitUI.tsx` from `scripts/browser-smoke.mjs:351`) is a
false positive — the browser imports a URL path knip cannot resolve; the file exists.

The unused-export surface is real drift, not noise: `src/game/rivalDiplomacy.ts` (13),
`scentGrid.ts` (10), `dashboardData.ts` (10), `economy.ts` (9), `housingPipeline.ts` (8),
`hotelStay.ts` (8) head the list. `knip.ts` carries a hand-maintained `ignoreIssues` baseline with
`[A]/[B]/[C]` labels per file, so the accepted set is documented — but it no longer covers the
current tree. The gate ordering itself is correct (`audit` = `cycles → owners → knip`), so a knip
finding no longer masks the cycle check.

Suggested fix: prune the dead exports or regenerate the `ignoreIssues` baseline in one mechanical
pass, and ignore the browser URL import so `npm run audit` is meaningful again.

**Resolved 2026-11-22.** Pruned rather than baselined: 293 symbols that were only referenced inside
their own module are module-private again, `isWalkingToward`, `tickVisitorQuest` and
`FrontierPanelView` (no reference anywhere) are deleted, and the browser URL import is declared as
`ignoreUnresolved`. Two documented exceptions remain: the `VOLUME_PRESETS` re-export that only the
ignored audio barrel consumes. `node scripts/test.mjs audit` now passes all three steps.

The pass also pulled 130 files into the overlap gate's changed set, which surfaced real duplications
and one accepted pattern. `offerStoryEvent` duplicated `pushStoryCard` and is folded into it; the
four copies of the env-flag spelling reader became the `envFlags.ts` owner, which the pathfinder and
spatial-query predicates now read their flag through; the two copies of the village-name slug became
`fileNames.ts`. The five per-story `*EligibleDay` adapters — one-line bindings of each story's own
`STORY_KEY`/`MIN_DAY`/`WINDOW_DAYS` to the shared `eligibleDayForStory` — and the two authored story
offers are recorded as reviewed approvals. `npm test -- semantic` and `npm test -- semantic-dup` are
green.

### F-05 — Tick-layer documentation drift (low)

- `tickLayerAssign.ts:52` documents the layer as called when
  `world.tick % LAYER_ASSIGN_INTERVAL === 0`. `gameTick.ts:256` calls it when
  `world.tick % LAYER_ASSIGN_INTERVAL === LAYER_ASSIGN_PHASE_TICK`, i.e. 03:00, 09:00, 15:00 and
  21:00 — never at 00:00.
- `ARCHITECTURE.md:114` lists the daily phases 00:00 / 06:00 / 12:00 / 18:00 and omits the 23:00
  construction close that `tickLayerDaily.ts:119-123` and `gameTick.ts:283` both implement.

### F-06 — The weekly full-year gate is demographically inert (info)

At the default seed the 360-day gate runs a colony that never changes shape: 3 settlers from day 30
to day 360, `marriedPairs=0`, `conceptions=0`, `births=0`, `deaths=0`, `producedToday=0`. Seed 777
over 90 days does form one marriage but still logs 0 conceptions. The gate therefore proves
invariants and stall-freedom on movement/ecology/calendar paths, but exercises **no** family,
pregnancy, birth, mortality or housing-churn path. A non-vacuity assertion (a seeded household that
must marry and conceive, or the existing `--bot` run) would give the gate teeth for those
subsystems — and would have caught F-02's mortality distortion.

### F-07 — Committed call-graph artifacts lag the source (info)

`docs/tools/call-graph.json` still indexes the deleted `src/game/factionWander.ts`, so running
`node scripts/check-function-overlap.mjs` on its own aborts with
`ENOENT: /app/src/game/factionWander.ts`. `npm run build` and `test:standard` regenerate the graph
first and pass; only the standalone invocation fails. Regenerate the two tracked artifacts, or
document that the graph must be rebuilt first.

**Resolved 2026-11-22.** Both artifacts were regenerated by `npm run build`; the standalone
`check-function-overlap.mjs` invocation now runs against the current tree.

---

## Verified clean

- **Same-stroke placement overlap** — accepted footprints are pushed into `budgetState.buildings`
  and carried into the next segment's authoritative check
  (`buildingPlacementActions.ts:265-283`), so two pieces of one stroke cannot overlap.
- **Visitor day count and departure** — arrival day is a grace day, `daysLeft` decrements at each
  following midnight, and the departure block runs on the tick the counter reaches 0
  (`groupEvents.ts:348-411`). The arithmetic is correct; the function is simply unreachable (F-03).
- **Roll lanes** — one `personDayRoll(id, tick, salt)` per decision with a distinct salt per
  decision (`simRng.ts:82-118`), so no two decisions share a lane. The lanes are sound; their
  *resolution* is not (F-02). The earlier note in this audit that the "coarse RNG" concern no longer
  applied was incomplete — it is correct about lane independence and wrong about quantization.
- **Raid casualty application** — guarded by `event.battleCasualtiesApplied`
  (`frontierCombat.ts:1219-1224`), so the half-battle and battle-end passes cannot apply losses
  twice.
- **Determinism** — no `Math.random` in simulation code; `Date.now`/`performance.now` appear only in
  presentation (hunt visuals, profiler, worker host), and `huntVisuals` is not saved.
- **Counts** — `countWorkingAndIdleSettlers` filters dead and imprisoned settlers, so a settler who
  dies mid-tick cannot linger in the workforce numbers; population counts are recomputed after the
  daily layer when it can change the roster.
- **Save compatibility** — retired visitor groups, visitor actors and visitor-sourced village
  requests are stripped on load; the legacy `spawnedAtCalendarDay` backfill remains for older saves.

## Gate results

Recorded at `ecd9866c`. Rows marked † were re-run on 2026-11-22 after the F-04/F-07 cleanup; the
remaining rows still describe `ecd9866c`.

| Gate | Result | Evidence |
|---|---|---|
| `node scripts/test.mjs check` | **PASS** | docs, comments, dialogue and shadow-file checks clean (4 dialogue cue WARNs, exit 0) |
| `build-call-graph.mjs --verify-owners` † | **PASS** | 399 files, 3,420 functions, 481 decisions, 0 without recorded owner |
| `check-function-overlap.mjs` † | **PASS** | 0 modified functions / 3,420 indexed / 0 unresolved — only after regenerating the graph (F-07) |
| `check-import-cycles.mjs` † | **PASS** | 399 modules, 2,401 runtime edges, no runtime cycle |
| `check-duplicate-code.mjs` | **PASS** | 4 clones / 4 groups, 0 new |
| `test.mjs lint` † | **PASS** | 0 warnings, 0 errors, 400 files |
| `tsc -p tsconfig.app.json` † | **PASS** | no diagnostics |
| `npm run build` † | **PASS** | exit 0; lint + dup + `vite build` all green |
| `node scripts/test.mjs audit` † | **PASS** | cycles → owners → knip, 3/3 steps |
| `knip` † | **PASS** | 0 unused exports, 0 unresolved imports (F-04 resolved 2026-11-22) |
| Unit suite (all files) | **NOT COMPLETED** | exceeded the 260 s command budget in this environment |
| Targeted simulation suite | **PASS** | 14 files / 120 tests: layer order, dedupe, decision registry, sim invariants, commute/herd, calendar phase, 4 raid suites, housing pipeline, workforce, herd migration, immigration grid |
| 360-day full-year harness | **PASS** | seed 12345, 103,680 ticks, `invariantViolations=0`, `stalledTicks=0`, 234 event-log entries |
| 90-day harness, seeds 12345 and 777 | **PASS** | `invariantViolations=0`, `stalledTicks=0` on both |
| Day-roll distribution measurement | **PASS** | 7.2 M draws, 10,000 distinct values (F-02, Appendix A) |

† Re-run on 2026-11-22 after the export cleanup. That change was also covered by 45 passing tests in
the five suites that exercise the touched modules (movement, frontier panel, UI residuals, event
defence, deterministic triggers). The unit-suite and harness rows still describe `ecd9866c`.

## Recommended order of work

1. **F-01** — designer decision on the predator/prey numbers, then one owner in `speciesConfig.ts`.
   This is the only finding that visibly degrades a played game.
2. **F-02** — raise the day-roll resolution in a release that accepts a new deterministic baseline,
   with one effective-rate test.
3. **F-03 / F-05** — delete the retired visitor surface or mark it legacy; fix the two cadence
   descriptions.
4. ~~**F-04** — restore a green `npm run audit`.~~ Done 2026-11-22.
5. **F-06** — add a non-vacuity assertion to the weekly gate. F-07 (call-graph artifacts) is done.

---

## Appendix A — reproducing the day-roll measurement

The distribution claim in §2 is exact from the source (`hash % 10000 / 10000`); the table was
measured by replicating `mixDayRoll` and `personDayRoll` verbatim and counting passing draws over
20,000 entity ids × 360 days per decision:

```js
const SINGLE=[374761393,668265263,1274126177];
const roll=(id,day,salt)=>{let h=0;const l=[id,day,salt];
  for(let i=0;i<3;i++)h^=Math.imul(l[i]|0,SINGLE[i]);
  h=Math.imul(h^(h>>>16),2246822519)>>>0;return (h%10000)/10000;};
// P(roll < p) over 7.2M draws:
//   0.00012 -> 0.000199   (illness: 7.15%/yr vs 4.32%)
//   0.000208 -> 0.000315  (divorce: 11.34%/yr vs 7.50%)
//   0.0000556 -> 0.000101 (old age 60: 3.65%/yr vs 2.00%)
```

The measured values sit within sampling noise of the closed form `ceil(p · 10⁴) / 10⁴`, which is the
rule to reason with.

## Appendix B — reproduction commands

```bash
# F-01 wildlife collapse
node_modules/.bin/tsx scripts/run-full-year.mts --days=90 --seed=12345
node_modules/.bin/tsx scripts/run-full-year.mts --days=90 --seed=777

# F-03 retired visitor surface has no caller
rg -n "tickVisitorGroups|spawnVisitorGroup|tryMidYearVisitorEvent|tryFirstWeekVisitor" src/

# F-04 audit gate
npm run audit
```
