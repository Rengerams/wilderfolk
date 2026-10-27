# Name of file: 2026-10-09

- Bug: The Wildkin is the apex creature by design but is configured, classified and chronicled as a large grazer, and nothing tells the player where it is
- Status: resolved
- Date discovered: 2026-10-09
- Version/build: 0.6.5.0 (working tree 2026-10-09)
- Reporter: owner (design intent: *"well it was ment to be at top of the ladder"*, *"and it shoult be logged where it is because its half human half animal"*)
- Area: Truth
- Owner module: `speciesConfig.ts` (data), `ecosystemPressure.ts`, `grassEcology.ts`, `humanLifecycle.ts`, `simulation/simulationEntities.ts`, `wildkinChronicle.ts` (new)
- Cadence: per wildlife pulse (diet), daily (sighting), on birth and on death (chronicle)

## Status history

- 2026-10-09 — open (found by reading `speciesConfig` against the owner's stated intent, then measured on the owner's own save)
- 2026-10-09 — resolved (role, ecology classification and the three chronicle lines corrected; regression tests fail before and pass after; long run green)

## Observed behavior

The Wildkin is meant to be the top of the wildlife ladder. In the shipping code it was a large grass
grazer that rendered as a deer, was billed as a grazer in the pasture's grass demand, counted as prey
by every predator's flee sense, and left exactly one trace anywhere: a birth line with no location.
On the owner's own save the creature itself is gone and nothing records what happened to it.

## Expected behavior

1. Its diet and ecology role are a predator's — the same shape the wolf uses, not a parallel system.
2. It is not counted as a grazer's grass demand.
3. Its birth, its first arrival at the settlement, and its death are chronicled, each line carrying
   where it is, because it is half human and once in a generation.

## Reproduction steps

1. Read `SPECIES_CONFIG[EntityType.Wildkin]` — `energyGain: { grass: 45 }`, `huntRange: 0`,
   `fleeRange: 100 * MAP_SCALE`.
2. `getGrazingPressureReport(state)` — a Wildkin moved `grazingDemandPerDay`, i.e. it was billed as
   grass eaten.
3. Take a delivery near a deer with the Wildkin branch winning (`tests/humanLifecycle.test.ts`) —
   the chronicle line was `Janet gave birth to a Wildkin`, with no place.
4. Kill the creature — nothing was written at all.

## Evidence

### The ladder, as the code actually expresses it (`path:line`)

| Step | Species | Diet (`energyGain`) | Hears/does | Flees | Combat/vulnerability | Sprite |
|---|---|---|---|---|---|---|
| Producer | Grass, Tree | — | immobile | — | `--` | `grass.png` / `tree.png` |
| Prey | Rabbit `speciesConfig.ts:73` | `{ grass: 25 }` | `huntRange 0` | 40 wu | eaten by Wolf, Fox, Moon Howler, tamed predators, settlers, Hunting Spot | `rabbit.png` |
| Prey | Deer `speciesConfig.ts:90` | `{ grass: 55 }` | `huntRange 0` | 50 wu | same as rabbit, + Moonslayer howler path | `deer.png` |
| Predator | Fox `speciesConfig.ts:124` | `{ rabbit: 450, grass: 150 }` | `huntRange 100` | 90 wu | prey to wolves/Moon Howlers (`SENSES_CANID_PREDATOR`, `tickLayerSystems.ts:117`) | `fox.png` |
| Apex | Wolf `speciesConfig.ts:107` | `{ deer: 650, rabbit: 30 }` | `huntRange 350`, pack range ×1.25/packmate, pack energy ×1.15 | 0 | kills deer/rabbit/fox (`HUNT_PREY_TYPES.canid`, `tickLayerSystems.ts:106`); fights back at the Hunting Spot (`dailyBuildingEconomy.ts:577`); killed by settlers, Hunting Spots, Moonslayer counter-attack | `wolf.png` |
| Apex (human form) | Moon Howler / Werewolf `speciesConfig.ts:177` | `{ deer: 400, rabbit: 100 }` | `huntRange 150`, ×1.15 when active | 0 | hunts **humans** on howler nights (`HUNT_PREY_TYPES.moonHowler`, `tickLayerSystems.ts:105`), blocked by `predator_block` / killed by `counter_attack` (`combat.ts`) | `wolf.png` |
| Apex by intent, grazer in code | Wildkin `speciesConfig.ts:191` | `{ grass: 45 }` → **grass** | `huntRange 0`, `fleeRange 100` | 100 wu | **none** — no hunt block, not in `isWildlifePredator`, not in any prey table | `deer.png` |

The trophic concept is real but is expressed as three ad-hoc lists, not a labelled ladder:
`isWildlifePredator` (`tickLayerSystems.ts:83`), `HUNT_PREY_TYPES` + `huntPreyKind` (`tickLayerSystems.ts:103-112`),
`SENSES_CANID_PREDATOR` (`tickLayerSystems.ts:117`), the prey sets in `huntingSpot.ts:77-145` and
`humanHuntingBehavior.ts:25-35`, plus `simQueries.REPRO_WILDLIFE_TYPES`. **The Wildkin appeared in none
of them**, while appearing in the *prey* side three times: `tickLayerSystems.ts:293` (metabolism ease),
`:327-330` (`isGrazer`, so it fled every predator and carried poison ivy for `WILDKIN_SCENT_SENSITIVITY`),
`:603` (grazing branch).

Combat/vulnerability of the Wildkin itself: it was killable — `markWildlifeDead` (`simulationEntities.ts:70`)
is reached for it from age, starvation, the Moonslayer counter-attack and tamed-predator assists
(`tickLayerSystems.ts:274-732`) — but it could not be the target of a Hunting Spot
(`huntingSpotPreyTypes`, `huntingSpot.ts:77` — only Deer/Rabbit/Wolf; `dailyBuildingEconomy.ts:408`
says the pool is "confined to the Deer/Rabbit/Wolf pools") nor of free-roam hunting
(`NORMAL_PREY_TYPES` / `FAMINE_PREY_TYPES`), and it was not in `HUNT_PREY_TYPES`, so no predator hunted it.

### The Wildkin config block in full

```
[EntityType.Wildkin]: {          // speciesConfig.ts:191, before the fix
  maxEnergy: 450, energyLossPerTick: 3.0 * PER_TICK_RATE_SCALE,
  energyGain: { grass: 45 }, maxAge: 365 * 40, speed: 3.2 * MAP_SCALE, size: 12,
  reproductionCooldown: cd(288), reproductionEnergyThreshold: 200,
  reproductionChance: 0.008, spawnEnergy: 200, color: '#a3a35a',
  fleeRange: 100 * MAP_SCALE, huntRange: 0, wanderRadius: 90 * MAP_SCALE,
  sprite: '/sprites/deer.png',
}
```

**The brief's sprite claim does not match the repository.** The brief says the Wildkin "renders as a
wolf"; the tree says `sprite: '/sprites/deer.png'` (`speciesConfig.ts:210`) and `ASSET_REGISTER.md:49`
records `deer.png` as loaded by `speciesConfig.ts`. `git log` shows no change to that line in the last
three commits, and `git status` shows `speciesConfig.ts` unmodified until this pass. What the code
actually does is give the apex creature **the deer's exact sprite and `HUMAN_WORLD_HEIGHT * 0.8`**
(`entitySprites.ts:11`), i.e. byte-for-byte the Deer's visual identity — a different mismatch from the
one reported, and the one fixed nowhere below because no replacement asset exists (see Follow-ups).

### Owner's save census — `wilderfolk-New-Frontier-Y3-D183.TXT` (6 486 347 bytes)

> Measurement taken on the 2026-10-09 file at `C:\Users\Admin\Downloads\wilderfolk-New-Frontier-Y3-D183.TXT`
> (last written 9-10-2026 01:43). It is a **different, later save** than the one the brief quotes: this
> one reports `tick 65016 / year 2 / dayInYear 183` and an 8 038-entry log, not "Year 3 day 903 / 544
> days". A later re-read of the same path must say which file it measured.

| Reading | Value |
|---|---|
| Header | `tick 65016`, `year 2`, `dayInYear 183` |
| `wildlifeCounts` | grass 386 · rabbits 55 · deer 18 · wolves 4 · foxes 3 · werewolves 0 · **wildkin 0** · trees 171 |
| Entities | 2 300 total: human 1 663 · grass 386 · tree 171 · rabbit 55 · deer 18 · wolf 4 · fox 3 — **0 Wildkin** |
| `eventLog` | 8 038 entries, ids 6 023–14 069, per year `{0: 1159, 1: 4544, 2: 2335}` |
| Wildkin lines in the whole 3-year chronicle | **1** — `[Y1 D79] [birth] "Janet gave birth to a Wildkin"` |
| Sighting line | none. Death line | none |
| Janet | `id 1336`, age 22, alive, `childrenIds: [1337,1338,1958,2534,6716,10460,16877,22312]` — **8 human children, the Wildkin is not among them** |
| Entities carrying any `childrenIds` | 526 of 2 300 |

So: the creature the owner is asking about has **no entity, no location, no death record and no family
link**. Its one line is 284 colony days old, and it will age out of the rolling 20 000-entry log.

### Family-tree gap (owner question 2, additional requirement)

The Wildkin is not and cannot be listed as a family member:
`familyTree.ts:222-224` (`livingHumans`) filters to `alive && type === Human && isPlayerHuman`, and
`familyTree.ts:863` repeats it for the full tree; `byId` (`familyTree.ts:226-229`) re-tests
`type === EntityType.Human`. Measured on a fixture where the mother's `childrenIds` *does* name the
Wildkin: the tree slice shows `[{"id":2,"relation":"mother"}]` — id 3 absent — and the full tree's
serialised JSON is 548 bytes with no `"id":3`. The link is also never written:
`humanLifecycle.ts:186-210` (the Wildkin branch) writes no `childrenIds` entry, so `tests/humanLifecycle.test.ts:211`
asserts `mother.childrenIds` is `[]` after the birth.

## Root cause

The Wildkin was added as "rare wildlife born to a settler mother" and inherited the nearest available
template — the deer (size 12, 100 wu flee, grass bite) — without being registered in any of the
predator owners. Everything downstream (the grazer demand entry in `GRAZING_METABOLISM.wildkin`, the
`isGrazer` branch, the deer sprite, the missing chronicle lines) follows from that one omission.

## Fix

`src/game/speciesConfig.ts` — `[EntityType.Wildkin]` now matches the wolf's *shape*: `energyGain: { deer: 500, rabbit: 200 }`
(no forage key), `fleeRange: 0`, `huntRange: 350 * MAP_SCALE`. Every other number is untouched.

`src/game/ecosystemPressure.ts` — removed `getGrazerDailyDemand('wildkin', …) * wildkinCount` from
`grazingDemandPerDay`. The report keeps `wildkinCount` so the Nature panel's count is unchanged.

`src/game/wildkinChronicle.ts` (new, registered in `OWNERSHIP_OVERVIEW.md`) — the place vocabulary and
the three lines, all through `eventLog.logEvent`:
- birth: `'birth'`, `<mother> gave birth to a Wildkin — half human — <place>` (called from
  `humanLifecycle.ts:120`, replacing the place-less line);
- sighting: `'milestone'` (existing type, its own Chronicle filter), one line the first day the
  creature is inside `WILDKIN_SETTLEMENT_RANGE_WU` of any colony settler, called once per day from
  `tickLayerDaily.ts`;
- death: `'death'`, `The Wildkin died — <place>`, emitted from `markWildlifeDead`
  (`simulationEntities.ts:70`), the one transition every wildlife death passes through; `markWildlifeDead`
  gained an optional trailing `state` parameter, passed by its five wildlife call sites
  (`tickLayerSystems.ts:274`, `:299`, `:477`, `:521`, `:732`) and the Hunting Spot
  (`dailyBuildingEconomy.ts:682`). **That is the only reason this pass touched
  `dailyBuildingEconomy.ts`** — and its own call site cannot in fact pass a Wildkin, because
  `huntingSpotPreyTypes` offers only Deer/Rabbit/Wolf, so the parameter is plumbing for the one
  transition, not a new behaviour there.

Place naming reuses owners rather than inventing one: the biome name the generator already classifies
(`terrain/biomes.BIOME_BY_IDX`, the 64 px lattice `terrainGrid.TERRAIN_CELL`), the first completed
player building as the settlement anchor, and one of two named bands plus a plain 8-way compass sector
("at the settlement, in the Meadow" / "out in the wilds to the north-west, in the Taiga"). No
coordinate is printed.

**Deliberately not done:**
- **No new AI.** The Wildkin is still absent from `isWildlifePredator`, `HUNT_PREY_TYPES`,
  `huntPreyKind` and the scent/predator set, so nothing flees from it and it does not hunt. Adding it
  to those existing owners is a small, coherent follow-up **but it is a behaviour change the brief
  ruled out of scope**, and it is now also the thing that decides whether the creature lives at all —
  see Consequence 1.
- **No new sprite.** No replacement asset exists in `public/sprites/` (searched by name for
  wildkin/stag/elk/moose/bear/beast/apex/lynx/boar/bison/tiger/lion/eagle/panther/wolverine/spirit;
  the only hits are `fox.png` and `wildlife_preserve.png`), and `ASSET_REGISTER.md` has no Wildkin row.
  The deer sprite therefore stays, and what the owner must drop in is listed under Follow-ups.

## Consequences the fix exposes (design decisions for the owner, not applied)

**1. With no hunt path the creature starves in about four days.** Measured on `initGame` seed 12345
with two Wildkin placed at the settlement edge, 6 days / 72 ticks each:
`day 1 energy 141/141 → day 2 82/82 → day 3 23/23 → day 4 dead` (two `death` chronicle lines, each
with a place, no invariant violations). Over 40 days with 4 invariant checkpoints: no failures. The
arithmetic agrees — `3.0 × 0.82 energy/tick × 72 ticks = 177/day` against a 200 spawn energy. Before
the diet change the same creature grazed grass and never starved; now nothing feeds it, because
removing the grazer role removed its only food and the apex role's hunting block is not wired.
Wire it the same way the wolf is wired (`isWildlifePredator` `tickLayerSystems.ts:83`, the
`entity.type === EntityType.Wolf || Fox || Werewolf` test at `:391`, `HUNT_PREY_TYPES`/`huntPreyKind`
`:103-112`) and it hunts with **zero new mechanic**. Not done here because it makes grazers and foxes
flee from it, which the brief explicitly put out of scope.

**2. It can still breed with its own kind.** The wildlife reproduction block
(`tickLayerSystems.ts:754-806`) is not gated by species role, so a Wildkin that reaches
`reproductionEnergyThreshold` with a same-species mate within 80 wu breeds, exactly like the wolf —
`wildkin` is in `simQueries.REPRO_WILDLIFE_TYPES` (`simQueries.ts:190-200`). With consequence 1 unfixed
this is unreachable in practice (nothing reaches the threshold), which is what kept "once in a
generation" true by accident.

**3. `reproductionThreshold / maxEnergy` is 200/450 = 0.44** — the easiest ratio of any predator, and
`spawnEnergy` 200 is *below* that threshold, so a newborn can never breed until it eats.

## Regression test

`tests/wildkin.apexRole.test.ts` (new, 8 cases): diet is meat and not grass with the wolf's exact key
shape; `fleeRange === 0` and `huntRange > 0`; 3 Wildkin add nothing to `grazingDemandPerDay` while
`wildkinCount` still reports them; the place descriptor uses the map vocabulary and prints no `px`; a
birth logs a place; a death logs a place; a sighting logs exactly once across three daily calls; a
creature that stays in the wilds logs nothing.

Extended: `tests/ecosystemPressure.winterDemand.test.ts` (demand is deer+rabbit only, `wildkinCount`
still travels), `tests/humanLifecycle.test.ts` (the Wildkin birth line carries a place and "half
human"), `tests/mapScale.pacing.test.ts` (Wildkin row now `fleeRange 0 / huntRange 350`),
`tests/huntingSpot.cleanup.test.ts` (the new fifth argument).

**Fails before / passes after, proved by temporary reversion** (backups taken, then restored):

| Reverted | Result |
|---|---|
| `speciesConfig` + `ecosystemPressure` back to the grazer config | `wildkin.apexRole` 3 failed (diet, flee/hunt, grass demand) + `ecosystemPressure.winterDemand` 1 failed — 4 failed / 6 passed |
| birth line without a place and the death call removed | `wildkin.apexRole` 2 failed (birth, death) + `humanLifecycle` 1 failed — 3 failed / 10 passed |
| Restored | 3 suites, **15/15 passed** |

## Invariants checked

`collectSimulationInvariantErrors` at 4 checkpoints across 40 days with Wildkin present: **no
failures**. 360-day seeded colony gate (`npx tsx scripts/run-full-year.mts --days=360 --verbose`,
seed 12345, restocked): `invariantViolations: 0`, `stalledTicks: 0`, `serializationSpikes: 0`,
`stall.stalled: false`, `colony=healthy`, 48 settlers, 23 buildings; `animals.wildkin: 0`;
the run's own event-log trace (`docs/log/event-log-restocked-seed12345-360d-…jsonl`, 670 entries)
contains **0 Wildkin lines** — no per-tick spam, and the ecology stage still walks
Strained ↔ Damaged on grazing pressure as before.

## Verification result

| Command | Result |
|---|---|
| `npx vitest run` on the 5 touched + 5 ecology/wildlife suites | passed — `wildkin.apexRole` 8/8, `humanLifecycle` 5/5, `ecosystemPressure.winterDemand` 2/2, `mapScale.pacing` 5/5, `huntingSpot.cleanup` 1/1, plus `low-5-combat-ecology` 15/15, `low-9-simdata` 6/6, `medium-C2-story` 8/8, `ecologyStoryDelta.survivesRecompute` 7/7, `singleOwner.predicates` 12/12 |
| `npx tsc -p tsconfig.app.json --noEmit` | passed, exit 0 |
| `node scripts/check-comments.mjs` | passed for every file in this diff — "no newly added comment carries history" when the pass's own files were the only new comments. Two later re-runs report ratchet failures in *other agents'* concurrently added files only: `workSkillAttribution.accrual.test.ts:4` ("used to be"), `dailyEvents.chronicleCopy.test.ts:2-3` (dates). None is in this diff; per the brief those agents own them. |
| `npm run lint` | passed — 0 warnings, 0 errors, 356 files |
| `npm run build` | passed — `tsc app` + `tsc node` + `vite build`, built in 4.20 s |
| `node scripts/check-import-cycles.mjs` | passed — 355 modules, the one runtime cycle is the pre-existing `dayCycle ↔ … ↔ workforce` one, not this module |
| `npx tsx scripts/run-full-year.mts --days=360 --verbose` | passed, outcome `colony=healthy`, invariants 0 (detail under Invariants checked) |
| `npx vitest run tests/duplicationA.remaining.test.ts` | **failed after the first draft and drove a fix**: the A12 guard ("one owner for world→cell coordinate clamping") flagged `wildkinChronicle.ts`, because `biomeNameAt` hand-rolled the clamp. It now calls the owner, `spatialGrid.gridCellAxis`; 15/15 pass. The duplication gate caught a real second owner here and nowhere else in this pass. |
| `npx vitest run tests/fullYear.integration.test.ts` | passed, 1/1 |
| `npm test -- unit` (whole suite) | 309–311 files, 1989+ tests: **all green except pre-existing/concurrent failures that move between runs and are not in this diff.** Run 1 failed in `huntingFightBack.fate.test.ts` (2) and `workSkillAttribution.accrual.test.ts` (1); run 2, minutes later with the same diff, failed in `duplicationA.remaining.test.ts` (my A12 case, now fixed) and `frontierCombat.raidGold.test.ts` (3). Re-running run 1's three suites in isolation: 15/15 green. The suite is not a stable signal while other agents commit mid-run; the per-suite runs above are. Unstable and untouched by this pass: `huntingFightBack.fate.test.ts`, `workSkillAttribution.accrual.test.ts`, `frontierCombat.raidGold.test.ts`. |
| `npm run test:types` | **blocked, pre-existing and not mine** — `tests/raids.cadence.test.ts(118,3): error TS2353 … 'createFactionHuman' does not exist in type 'RivalEventCallbacks'`. `src/game/rivalEvents.ts` is mid-edit by another agent (25 insertions / 31 deletions in the working tree, `createFactionHuman` removed from the interface at `rivalEvents.ts:21` in HEAD); it is on this pass's do-not-touch list. App sources and every file in this diff type-check clean. |

## Breeding: the owner's question, "and his breeding caps are high right ?"

Every value below is read from `speciesConfig.ts`; `cd(n)` is a legacy hours count converted by
`cd(legacyHours) = legacyHours * TICKS_PER_HOUR` (`speciesConfig.ts:42-44`), with
`TICKS_PER_HOUR = 3` (`gameConstants.ts:91`) and `TICKS_PER_DAY = 72`, so `cd(288)` = 864 ticks =
**12 colony days**.

| Species | line | `reproductionCooldown` | in days | `reproductionChance` | `threshold / maxEnergy` | `spawnEnergy` | `maxEnergy` | `maxAge` | `size` | `speed` |
|---|---|---|---|---|---|---|---|---|---|---|
| Rabbit | `:77-79` | `cd(48)` | 2 | 0.300 | 70/120 = 0.58 | 60 | 120 | 3 y | 7 | 3.5 |
| Deer | `:94-96` | `cd(192)` | 8 | 0.150 | 300/500 = 0.60 | 250 | 500 | 12 y | 11 | 3.0 |
| Wolf | `:111-113` | `cd(360)` | 15 | 0.150 | 450/900 = 0.50 | 900 | 900 | 8 y | 13 | 4.0 |
| Fox | `:128-130` | `cd(240)` | 10 | 0.008 | 350/450 = 0.78 | 90 | 450 | 5 y | 9 | 3.0 |
| Moon Howler | `:181-183` | `cd(720)` | 30 | 0.001 | 300/700 = 0.43 | 350 | 700 | 35 y | 14 | 3.4 |
| **Wildkin** | `:198-200` | `cd(288)` | **12** | **0.008** | **200/450 = 0.44** | 200 | 450 | 40 y | 12 | 3.2 |

**Per-year offspring, derived.** The gate is one roll per wildlife-layer pulse (`tickLayerSystems.ts:772-776`):
`breedChancePerTick = reproductionChance × reproMult(season) × capacityFactor × scarcityBoost`, then
`1 − (1 − min(1, breedChancePerTick))^step` with `step = WILDLIFE_LAYER_INTERVAL`, so there are
`6480 / 216` cooldown-limited breeding pulses a year for the Wildkin. With a single pair,
`capacityFactor = 1 − 1/35 = 0.971` and `scarcityBoost = 1.55`; season multipliers are
1.4 / 1.0 / 0.8 / 0.5 (`getReproductionMultiplier`). Ignoring the energy gate (all species sit at
44–78 % of max energy, so it moves the real figure but not the ranking):

| Species | per-pulse chance (summer) | cycles/year | **offspring/year (summer)** | winter |
|---|---|---|---|---|
| Rabbit | 7.60e-1 | 180 | ~137 | ~86 |
| Deer | 4.78e-1 | 45 | ~21.5 | ~12.1 |
| Wolf | 4.78e-1 | 24 | ~11.5 | ~6.4 |
| Fox | 3.16e-2 | 36 | ~1.14 | ~0.57 |
| **Wildkin** | **3.16e-2** | **30** | **~0.95** | **~0.48** |
| Moon Howler | 3.99e-3 | 12 | ~0.05 | ~0.02 |

**Answer: no — the caps are middle-to-low, and that is not what decides the creature's rarity.**
The Wildkin's 12-day cooldown is the second *shortest* of the six, but its `reproductionChance` of
0.008 is the second lowest, so the two cancel: **~0.95 offspring per year per pair**, almost exactly
the fox (~1.14) and roughly **1/12th of the wolf**, **1/22nd of the deer**, and **1/144th of the
rabbit**. It is also *not* the slowest — that is the Moon Howler (~0.05/year), whose 30-day cooldown is
undone by a chance 8× smaller still. Raising the cap cannot help, because the gate that actually binds
is the one the numbers above assume away:

**A lone Wildkin cannot reproduce at all.** The mating search requires a second entity of the same
type within 80 wu with energy above `reproductionEnergyThreshold × 0.3`
(`tickLayerSystems.ts:777-789`); `MAX_POPULATION` for the type is 35 (`:760-767`), applied as
`capacityFactor`. So the answer to *"are his breeding caps high?"* is that the caps are moot while
only one exists: in the owner's re-saved `wilderfolk-New-Frontier-Y3-D183` there are **0** Wildkin,
and a fresh world spawns **0** (`worldGen.ts:767-770` places rabbit 42 / deer 14 / fox 10 / wolf 4
and never a Wildkin; the only source is the 3 % delivery roll, `humanLifecycle.ts:31` +
`:85`). The single Wildkin in the save was born on Year 1 day 79 and is now unnamed, unlinked and
absent — it had no partner then and none can appear unless another settler gives birth near a deer.

## Save/migration impact

None. No save field was added or removed: the sighting flag lives in a module-scoped
`WeakMap<WorldState, Set<number>>`, so an old save loads unchanged and the worst case of a reload is
one repeated sighting line. The Wildkin's own numbers (energy, age, size, reproduction, sprite) are
untouched, so an existing creature keeps its state.

## Follow-ups (owner decisions)

1. **Give it the hunt path** — otherwise it dies within four days of being born. It is the same five
   edits the wolf already follows, with no new mechanic:
   (a) add it to `isWildlifePredator` (`tickLayerSystems.ts:83-93`), which is also what makes grazers
   and foxes flee it and what `rebuildPredators` feeds into the scent grid; (b) add
   `entity.type === EntityType.Wildkin` to the hungry-carnivore test (`tickLayerSystems.ts:391-393`);
   (c) give it a prey list in `HUNT_PREY_TYPES` + `huntPreyKind` (`tickLayerSystems.ts:103-112`) — the
   `canid` list is the wolf's own; (d) the pack bonus is a Wolf-only branch (`:405-424`) and the
   `:529`/`:563-568` energy and label branches are type-keyed, so both keep working unchanged once
   (a)–(c) are in; (e) nothing else — `tameAnimal`-style assist (`:712-714`) is optional. Alternatively
   leave it a non-hunter and give it another food source.
2. **The replacement sprite**: drop `wildkin.png` into `public/sprites/`, then change one string,
   `speciesConfig.ts:210`, from `/sprites/deer.png` to `/sprites/wildkin.png`. Everything else is
   already generic: `renderer/animals.ts:31` draws `SPECIES_CONFIG[type].sprite` at full image bounds
   scaled to `getAnimalSpriteMetrics` (`entitySprites.ts:32`), which for the Wildkin is
   `HUMAN_WORLD_HEIGHT * 0.8` with a 24 px minimum, anchored at `ANIMAL_SPRITE_ANCHOR_Y = 0.88`
   (feet near the image bottom). The shipped creature sprites are 32-bit ARGB PNGs from
   **64×39 (fox) to 72×42 (wolf)**, plus deer 67×80 — so a quadruped at roughly **64–96 px tall**
   matches the set, and the authored silhouette must sit on the bottom edge. Two more files need a
   line when it lands: `spriteLoader.preloadAllSprites` (the wildlife list, `spriteLoader.ts:116-147`,
   where `deer.png` is preloaded today) and a new `ASSET_REGISTER.md` row — the register is
   reconciled against the tree by `tests/renderer.overheadBadgeAndAssets.test.ts:164`, so it fails
   until the row exists.
3. **Should the family tree show it?** Today it cannot: the tree is human-only by construction
   (`familyTree.ts:222`, `:863`) and the birth writes no `childrenIds` link. A `KinRelation` for a
   half-human offspring would be a new relation type in a human UI, so it is proposed rather than done.
4. `GRAZER_METABOLISM.wildkin` (`grassEcology.ts:88`) now has no caller at all: `getGrazerDailyDemand`
   still runs for `deer` and `rabbit` (`ecosystemPressure.ts:72-73`), and the wildkin row is reached
   only by `getGrazerDailyDemand('wildkin', …)`, which the winter-demand test still calls solely as its
   "would have been billed" control (`tests/ecosystemPressure.winterDemand.test.ts:45`). It is left in
   place rather than deleted because dropping a key from that owner table is an owner call; note also
   that this pass's own diff has falsified the row — its `grassEnergyGain: 45` no longer mirrors
   `SPECIES_CONFIG[Wildkin].energyGain` — so it must be either repointed at the predator diet or retired.

## Related commits or files

`src/game/speciesConfig.ts`, `src/game/ecosystemPressure.ts`, `src/game/wildkinChronicle.ts`,
`src/game/tickLayerDaily.ts`, `src/game/tickLayerSystems.ts`,
`src/game/simulation/simulationEntities.ts`, `src/game/simulation/humanLifecycle.ts`,
`src/game/dailyBuildingEconomy.ts`, `OWNERSHIP_OVERVIEW.md`,
`tests/wildkin.apexRole.test.ts`, `tests/ecosystemPressure.winterDemand.test.ts`,
`tests/humanLifecycle.test.ts`, `tests/mapScale.pacing.test.ts`, `tests/huntingSpot.cleanup.test.ts`,
`BUG_REPORTS/2026-10-09-wildkin-apex-role-and-chronicle.md`.
