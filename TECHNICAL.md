# Wilderfolk — Technical README

**Early Alpha · v0.4.2 shipped** · React + TypeScript + Vite + Canvas 2D

Developer-facing overview of the playtest build.

| Doc | For |
|-----|-----|
| [README.md](README.md) | Repo landing — pitch, install, doc index |
| [app/README.md](app/README.md) | **Players** — full how-to-play guide |
| [ROADMAP.md](ROADMAP.md) | Plan & half-done registry |
| [ROADMAP_0.5.0.md](ROADMAP_0.5.0.md) | **v0.5.0** — scale + architecture (end July 2026) |
| [CHANGELOG.md](CHANGELOG.md) | Detailed change log |

---

## Repository layout

Git clone root (npm package name **wilderfolk**). All runnable code lives under `app/`.

```
<repo-root>/
├── package.json            # Root forwards → `npm --prefix app` (dev, build, test, lint, preview, sim, bench, dup); `sprites:humans` at root
├── README.md               # Short landing page
├── TECHNICAL.md            # This file
├── ROADMAP.md              # Release plan + backlog
├── ROADMAP_0.5.0.md        # v0.5.0 scale + architecture checklist
├── CHANGELOG.md            # Public change log
├── LICENSE                 # MIT
└── app/                    # Vite + React application
    ├── README.md           # Player guide
    ├── package.json
    ├── index.html
    ├── vite.config.ts      # Dev server port 5173 (3000 blocked on some Windows hosts)
    ├── vitest.config.ts
    ├── eslint.config.js
    ├── public/             # Static assets (sprites, logo, audio)
    ├── scripts/            # Headless sims (`sim-cli.mjs` → `simulate-*`), benchmarks, sprite tools, `logs/`
    └── src/
        ├── App.tsx         # Main UI shell, tabs, tutorial, inspector
        ├── main.tsx
        ├── components/     # React panels (BuildCatalog, Frontier, GameMenu, …)
        ├── hooks/          # UI hooks (contextual tutorial)
        ├── audio/          # Web Audio director, ambient, music
        ├── test/           # Vitest — `game/`, `helpers/`, `fixtures/`
        └── game/           # Simulation + canvas (see file map below)
            ├── simWorker/  # Web Worker host + `gameWorker.ts` (opt-in)
            ├── simBuffers/ # Render SoA pack/read, tick deltas, buffer pool
            └── data/       # Name lists, dialogue bank (`sim_dialogue_trees.json`)
```

Developer docs stay at repo root; `app/` holds the player README plus all source, tests, and sim scripts.

---

## Stack

| Layer | Choice |
|-------|--------|
| UI | React 19, Tailwind CSS (custom panels in `src/components/`) |
| Build | Vite 7, TypeScript 5.9 |
| Simulation | Custom tick-based engine (`gameEngine.ts`) |
| Rendering | Canvas 2D (`renderer.ts`) + OffscreenCanvas layers (`terrainLayer.ts`, `entityLayer.ts`); read-only `RenderSnapshot` |
| Persistence | `localStorage` JSON saves (`SAVE_KEY` in `gameEngine.ts`) |
| Audio | Web Audio + HTML `<audio>` fallback (`src/audio/` — `trackPlayer.ts`, `director.ts`, `htmlAudioSync.ts`) |

No backend. Single-player, client-only.

---

## Running & building

The runnable Vite app lives in **`app/`**. Root `package.json` **forwards** the main dev workflow via `npm --prefix app` (plus `sprites:humans`). **`app/package.json`** exposes **9 scripts** — no per-sim npm entries; headless profiles go through **`sim-cli.mjs`**.

Requires **Node.js 20+**.

### Repo root (`<repo-root>/` — git clone folder that contains `app/`)

```bash
npm install              # postinstall also runs npm install in app/
npm start                # same as npm run dev — Vite dev server (app/vite.config.ts)
npm run build            # tsc -b && vite build → app/dist/
npm run test             # vitest + vitest tsconfig typecheck (app/)
npm run preview          # serve production build (default http://127.0.0.1:4173)
npm run lint             # ESLint (app/)
npm run sprites:humans   # Python — regenerate human outfit PNGs in app/public/

# Headless sims & quality (forwarded to app/)
npm run sim              # list profiles; npm run sim -- <profile>
npm run sim -- 5min      # ~5 min smoke (default)
npm run sim -- 20year    # v0.5 ship gatekeeper; SIM_YEARS=20, exit 0 = PASS
npm run bench            # city benchmark gate (SIM_PROFILE=city + BENCHMARK_GATE=1)
npm run dup              # jscpd duplicate scan (0 clones target)
```

**Dev server:** `npm start` → **http://127.0.0.1:5173** (port 5173 chosen because 3000 is often blocked on Windows). Vite may pick the next free port if 5173 is taken — check the terminal URL.

**Optional browser flags** (`.env` in `app/` or shell before `npm start`):

| Variable | Effect |
|----------|--------|
| `VITE_USE_GAME_WORKER=1` | Run `gameTick` in a Web Worker (opt-in) |
| `VITE_USE_SPATIAL_GRID=0` | Disable spatial grid (falls back to scanning every entity per hunt/graze/flee query) |
| `VITE_USE_SCENT_GRID=0` | Disable scent grid |

### App package (`cd app` or `npm --prefix app <script>`)

```bash
cd app
npm run dev              # vite dev (alias: npm start from root)
npm run build            # tsc -b && vite build → dist/
npm run preview
npm test                 # vitest run && tsc -p tsconfig.vitest.json --noEmit
npm run test:watch       # vitest (watch mode)
npm run lint
npm run dup              # jscpd — min 8 lines / 60 tokens; ignores test/ + data/

# Headless sims (single dispatcher)
npm run sim              # print profile list
npm run sim -- 30min     # long playtest; env SIM_MINUTES (default 1200), PERF_SAMPLE_EVERY
npm run sim -- housing
npm run sim -- social
npm run sim -- militia   # alias: balance
npm run sim -- 10year    # balance regression; SIM_YEARS=10 default, SIM_PROFILE=town
npm run sim -- 20year    # v0.5 ship gatekeeper
npm run sim -- city      # city benchmark profile
npm run sim -- kill      # stop stuck sim (sim.lock)
npm run bench            # benchmark gate script
```

**Sim profiles** (full list in `app/scripts/sim-cli.mjs`): `5min`, `30min`, `housing`, `housing:ticks`, `family`, `social`, `militia`, `10year`, `10year:worker`, `20year`, `20year:worker`, `city`, `30min:city`, `kill`. Aliases: `simulate` → `5min`, `balance` → `militia`.

**Common sim env vars** (set in shell before `npm run sim -- <profile>`):

| Variable | Purpose |
|----------|---------|
| `SIM_YEARS` | In-game years for 10y/20y scripts (default 10 or 20) |
| `SIM_PROFILE` | `village` \| `town` (default) \| `eco` |
| `SIM_MINUTES` | Wall-clock cap for 30min sim (default 1200) |
| `SIM_USE_WORKER=0` | Main-thread `gameTick` instead of worker_threads |
| `SIM_LOG_LIFE=1` | Stream births/deaths to `-life.txt` |
| `PERF_SAMPLE_EVERY` | Perf sample interval in ticks (10year script) |

Most profiles launch through **`app/scripts/run-sim.mjs`** (tsx + localStorage shim). `sim-cli.mjs` routes profile names to `simulate-*.ts` or direct node scripts. See script headers in `app/scripts/` for full env lists.

### Code quality gates (July 2026)

| Command | What it checks |
|---------|----------------|
| `npm test` | **343** Vitest tests, **64** files, **0 skipped** + `tsconfig.vitest.json` typecheck (browser worker suites optional via `vitest.browser-worker.config.ts`) |
| `npm run lint` | ESLint — **0 errors** |
| `npm run build` | `tsc -b` + Vite production bundle |
| `npm run dup` | [jscpd](https://github.com/kucherenko/jscpd) clone detection on `app/src` — **0 clones** after July 8 dedup pass |

**Duplicate cleanup (July 8):** shared helpers in `stripRender.ts` (palisade draw), `trackPlayer.ts` (loop fade), `director.ts` (unmute resume), `htmlAudioSync.ts` (HTML audio mute), `worldGen.ts` → `createEmptyLifetimeStats()`.

---

## Architecture

### Simulation vs presentation

The game splits **world state** from **view state**:

| Module | Role |
|--------|------|
| `gameTypes.ts` | Types, enums, building/species configs |
| `gameEngine.ts` | `gameTick()`, init, save/load, building actions |
| `viewState.ts` | Camera, selection, camp highlight, build mode, `buildRotation`, `nudgeCameraToward()`, screen shake (UI-owned) |
| `gameLoop.ts` | `requestAnimationFrame` loop, tick accumulator, pause/speed; optional `GameWorkerHost` pipeline |
| `renderSnapshot.ts` | Immutable bundle passed to renderer each frame; includes `entityByType` buckets |
| `renderer.ts` | Pure draw pass; OffscreenCanvas terrain + entity layers; tick-keyed entity draw cache (`updateCachedEntities` / SoA path) |
| `canvasLayer.ts` | Shared OffscreenCanvas create/resize/dispose/clear helpers |
| `terrainLayer.ts` | Baked terrain tile layer (per season) + decor layer (rivers + map border at world resolution) |
| `entityLayer.ts` | Dynamic entity bitmap cache; invalidates on tick, camera, build/selection UI state |
| `spatialGrid.ts` | Dual-layer cell grid (grass + mobile); graze/hunt/flee queries (`USE_SPATIAL_GRID` on by default) |
| `entityCatalog.ts` | Indexed entity lookup for UI; lazy `alive` + `byType` index; `resolveAliveHumans()` |
| `simWorker/` | Web Worker host + `gameWorker.ts`; opt-in via `VITE_USE_GAME_WORKER=1` |
| `simBuffers/` | Render SoA pack/read, tick deltas, buffer pool for worker ↔ main transfer |

```
gameLoop → gameTick(world) [or worker tick]
         → world.entityByType rebuilt once per tick (end of gameTick)
         → buildRenderSnapshot(world, view, { catalog, renderSoA })
         → renderGame(ctx, snapshot)   // OffscreenCanvas terrain + entity layers; main: byType buckets; worker: render SoA slots
```

**Entity indexing (v0.5.0 — ready for shipment, `GAME_VERSION` still 0.4.2):**

| Layer | Source | Notes |
|-------|--------|-------|
| Sim tick | `world.entityByType` | Built at end of `gameTick()` via `buildEntityByType()`; not saved |
| Render snapshot | `RenderSnapshot.entityByType` | Prefers `world.entityByType` → `catalog.getEntityByType()` → fallback scan |
| UI catalog | `EntityCatalog.ensureAliveIndex()` | Single pass builds `getAlive()` + per-type buckets; invalidated on rebuild/delta |
| Canvas cache | `renderer.ts` `_cachedTrees/Animals/Humans/Grass` | Invalidates on tick change; grass also on viewport key |
| Offscreen layers | `terrainLayer.ts`, `entityLayer.ts` | Terrain tiles/decor baked until map or season changes; entity layer rebuilt on `buildEntityLayerKey()` mismatch |
| Worker path | `simBuffers/renderSoAEntities.ts` | Slot buckets via `getRenderEntityLayer()` — same taxonomy as main thread |

Shared helpers in `gameTypes.ts`: `emptyEntityByType()`, `getRenderEntityLayer()`, `UNCACHED_RENDER_TICK`. Draw-list builder: `buildEntityDrawBuckets()` in `gameEngine.ts`.

### Tick model

- Base rate: **1 tick/sec** at 1× speed (`BASE_TICKS_PER_SECOND` in `gameLoop.ts`); speed multiplier up to 10×
- **24 ticks = 1 calendar day** (`dayCycle.ts`, `TICKS_PER_DAY`)
- **360 days = 1 year**; season derived from `dayInYear`
- `hourOfDay = tick % 24` drives day/night visuals and settler schedules

Food spoilage and some daily logic use `tick % TICKS_PER_DAY`.

### Save format

- Version field: `_version` — current `'0.4.2'`; compatible saves: `'2.0'`, `'2.1'`, `'2.2'`, `'0.4'`, `'0.4.1'`, `'0.4.2'`
- Merges `WorldState` + serialized `ViewState` fields
- Entity load normalizes missing fields (`spriteVariant`, `residenceBuildingId`, etc.)
- Loading `2.0` / `2.1` / `2.2` saves triggers v0.4 calendar/housing migration + one-time log line
- Loading `0.4` saves logs v0.4.1 migration (diplomacy, leadership, trade routes, victory paths)
- `syncEventLogIdFromState()` restores monotonic event-log ids after load
- v0.4.1 fields default on load: `pendingDiplomacyEvents: []`, `pendingRaidEvents: []`; `pendingOutgoingRaidEvents: []` defaults on load (v0.5.0+); visitor groups get `tradesCompleted: 0`, `refugeeResolved`, `leaderTalked`; rivals get `peaceTreatyDays`, `raidCooldownDays`; leadership fields via `validateVillageLeaderOnLoad`

---

## Core systems (file map)

| File | Responsibility |
|------|----------------|
| `gameEngine.ts` | Tick orchestrator, `SPECIES_CONFIG`, shared helpers, re-exports |
| `lifeSimulation.ts` | Human AI (schedule, hunt, courtship, reproduction) and wildlife/grass AI |
| `buildingActions.ts` | Placement, construction, worker assignment, repair, upgrade, demolish, taming |
| `economy.ts` | Resources, storage caps, food spoilage, trade routes, workshop inputs |
| `research.ts` | Tech tree unlocks, active research, completion notifications |
| `worldGen.ts` | `initGame`, entity/building creation, wildlife spawning |
| `worldEvents.ts` | Weather and disaster systems |
| `saveLoad.ts` | `localStorage` save/load, version compatibility, migration |
| `skills.ts` | Job/skill helpers and worker skill multipliers |
| `version.ts` | `GAME_VERSION`, `GAME_PHASE`, title, ecological fact pool |
| `dayCycle.ts` | Hours, night/work windows, housing units, custodian chain, residence assignment |
| `populationGrowth.ts` | `getTotalBeds`, `getOpenBeds`, population growth report (cap vs beds messaging) |
| `groupEvents.ts` | Visitors, rivals, diplomacy events, trade/refugee negotiate, yearly world events |
| `militiaBalance.ts` | `MILITIA_BALANCE` constants, `computeMilitiaBreakdown` — iron replaces stone/wooden tiers |
| `frontierCombat.ts` | Militia/rival strength, `RaidEvent` queue, `respondToRaidEvent`, `launchRaidOnRival`, `getCombatPreview`, distance-scaled `expiresAtTick` |
| `defenseStructures.ts` | Wall/tower barricade bonuses, barracks guard count & militia bonus, patrol eligibility |
| `forge.ts` | `villageForge` state, iron spear/shield forge queue, save migration, outstanding-order alerts |
| `combatTech.ts` | `COMBAT_TECH` constants (breaks forge ↔ combat circular import) |
| `priorityAlerts.ts` | Clickable priority alerts (raids, diplomacy, food, forge, trade) |
| `buildCatalog.ts` | Build category rail, hotkey map, cost formatting |
| `spatialGrid.ts` | Dual-layer spatial index for graze/hunt/flee (grass + mobile cells) |
| `entityCatalog.ts` | Fast entity lookup for UI panels; `resolveAliveByType()` / `resolveAliveHumans()` |
| `simBuffers/renderSoAEntities.ts` | Worker render slot buckets (grass/tree/human/animal) + shim cache |
| `saveSchema.ts` | Allow-listed world fields for save (`pickWorldFieldsForSave`) |
| `simWorker/GameWorkerHost.ts` | Main-thread worker host, render buffer pool, command chain |
| `simBuffers/packRenderSoA.ts` | Top-k overflow entity selection for render SoA |
| `simBuffers/simDelta.ts` | Tick delta extraction + catalog entity merge |
| `citizenId.ts` | Citizen `#id` display and search helpers |
| `entityCounts.ts` | `computeWildlifeCounts`, denormalized `world.wildlifeCounts` |
| `CombatPreviewPanel.tsx` | UI for militia vs rival forecasts (defend, barricade, pay-off, outgoing raid) |
| `ecosystemPressure.ts` | Deer vs grass grazing pressure report for Nature tab warnings |
| `challengeProgress.ts` | Challenge progress bars and active-challenge highlight |
| `combat.ts` | Defense research, armament checklist, hunt/combat helpers |
| `eventLog.ts` | Shared `logEvent()`, `EVENT_LOG_MAX`, save-load id sync |
| `eventLogExport.ts` | Chronicle `.txt` export formatting |
| `focusHints.ts` | "What to do next" hint generation |
| `humanSprites.ts` | PNG human sprites, sizing, selection bounds; procedural fallback |
| `humanChat.ts` | 3-beat dialogue trees (`dialogueTrees.ts` JSON bank), session advance, speech bubbles |
| `dialogueTrees.ts` | Loads `data/sim_dialogue_trees.json`; context → category mapping, tree pick |
| `renffrStar.ts` | Rare night-sky easter egg (shooting star + “Renffr”) |
| `buildingRotation.ts` | Road/wall/gate rotation (`BuildingRotation` 0\|90), footprint swap on place/render |
| `stripRender.ts` | Procedural road/wall/corner/junction canvas draws (palisade posts, rails, cobble) |
| `tickQueries.ts` | Per-tick query indexes (residence, spatial closest, wildlife/grass snapshots) — avoids O(n²) scans |
| `juiceEffects.ts` | Night window/chimney glow, build-complete confetti particles, glow intensity helpers |
| `canvasLayer.ts` | OffscreenCanvas surface helpers (create, resize, dispose, clear) |
| `terrainLayer.ts` | Baked terrain tiles + decor (rivers, border); `terrainLayerNeedsRebuild` / `terrainDecorNeedsRebuild` |
| `entityLayer.ts` | Dynamic entity offscreen cache; `buildEntityLayerKey`, `beginEntityLayerPaint`, `paintEntityLayerTo` |
| `renderer.ts` | OffscreenCanvas compositing, tick-keyed entity draw lists, buildings, weather, night overlay + home glow, speech bubbles, raid march lines (`drawRaidMarchLines`) |
| `spriteLoader.ts` | PNG preload + alpha trim; calls `generateHumanSprites()` |
| `terrainGen.ts` | Procedural `WorldMap` from seed + preset |
| `victory.ts` | Four victory paths; `ACTIVE_VICTORY_PATHS` + `COMING_SOON_VICTORY_PATHS` |
| `EventLogPanel.tsx` | Scrollable chronicle log tab UI |
| `CombatLogPanel.tsx` | Combat-filtered log sub-tab (stats + export) |
| `FocusPanel.tsx` | Focus / next-step panel |
| `PopulationPanel.tsx` | Village population & family overview |
| `RoadmapPanel.tsx` | In-game read-only roadmap (`roadmapContent.ts` — v0.4.2 shipped, targets v0.5.0) |
| `stats.ts` | Yearly / lifetime statistics |
| `IntroScreen.tsx` | ~20s opening timeline (aurora → logo → title → food chain → ready); skip after logo; village setup form |

---

## Humans — data model

| Field | Meaning |
|-------|---------|
| `residenceBuildingId` | House/Mansion where settler sleeps |
| `homeBuildingId` | **Workplace** (farm, mill, etc.) when assigned via building occupants |
| `adoptiveMotherId` / `adoptiveFatherId` | Orphan placement when no living kin (`ensureOrphanAdoption`) |
| `isBastard` | Affects grandma custodian step in `getChildCustodian` |
| `spriteVariant` | Outfit index 0–3 (procedural sprite palette) |
| `chatPhrase` / `chatTicks` | Active speech bubble (newline-separated wrapped lines in `chatPhrase`) |
| `chatPartnerId` / `chatDialogueSessionKey` | Paired 3-beat dialogue session (`humanChat.ts`) |
| `faction` | `'visitor'` \| `'rival'` for non-player humans |

### Daily schedule (`gameEngine.ts` + `dayCycle.ts`)

| Hours | Behavior |
|-------|----------|
| 20:00–06:00 | Commute to **residence**, idle at home, reduced energy loss |
| 06:00–07:00 | At home (morning) |
| 07:00–19:00 | If `homeBuildingId` set → commute to **work** |
| 19:00–20:00 | Head home |

Hunting, courtship, and idle wandering only run during “free roam” hours.

### Housing — cap vs beds

| Metric | Source | Meaning |
|--------|--------|---------|
| **Population** | Live player humans | Headcount on map |
| **`maxHumanPopulation`** | `gameEngine.ts` each tick | Immigration/recruit cap: `5 + housingCap + floor(rep/10)` |
| **Beds** | `getTotalBeds()` in `populationGrowth.ts` | Sum of `getResidenceCapacity()` on completed House/Mansion |
| **Open beds** | `beds − population` | Empty slots (births can exceed cap/beds briefly) |

UI: header badge `🛏️N`, Village → Population (cap + beds columns), growth report in Families panel.

### Housing assignment (`dayCycle.ts`)

Orchestrated by `assignMissingResidences()` each tick and on build/recruit/demolish (`buildingActions.ts`). Uses **`buildHousingUnits()`** (custodian-led units, not full extended family tree).

**Custodian chain** (`getChildCustodian`) — minors follow for residence + map idle:

1. Living **mother**
2. **Bastard only:** maternal **grandmother** → paternal **grandmother** (via dead parent records in full entity list)
3. Living **father**
4. **Adoptive couple** (`adoptiveMotherId` / `adoptiveFatherId`) — `ensureOrphanAdoption()` picks stable-random married pair; if none, `placeOrphanInHouse()` uses `pickResidenceForFamily` / least crowded
5. Adults **18+** may use **`moveOutOfFamilyHome()`** (player action) into an empty house

**Singles:** `pickResidenceForFamily` allows sharing with couples or other singles; `alreadyHere` bonus keeps roommates in place until **`syncPartnerResidence`** on marriage (empty house preferred for the new couple).

**Shortage:** when `!anyEmptyHouse` or `!anyOpenBeds`, families use low outsider penalty (`outsiders × 10`) and `pickSharedResidenceForFamily()` fallback so households stay together in shared homes.

**Overcrowding:** `rebalanceOvercrowdedResidences()` evicts smallest family groups when count > capacity.

### Movement & visuals

- Idle behavior: explore, gather (nearest tree), socialize, patrol
- Velocity blending + friction; purposeful movement suppresses idle
- Renderer: PNG sprites (idle + moving); procedural sprites as fallback; multiline speech bubbles (`wrapChatLines`), mouth overlay
- Status badges: 🏠 home, 🔨 work, 💕 courtship, etc.

### Settler chat (dialogue trees)

Routine settler banter is driven by **`app/src/game/data/sim_dialogue_trees.json`** (v1.1 — **95** trees: 20 Sims-style `dt_*` + 75 migrated Wilderfolk `wf_*`). Each tree is a **3-line** call-and-response between two speaker roles.

| Module | Role |
|--------|------|
| `dialogueTrees.ts` | Load JSON; map `HumanChatContext` → `DialogueCategory`; `pickDialogueTree()` with season/weather/festival/`foodLow` hints |
| `humanChat.ts` | Session map (`chatDialogueSessionKey`); advance one line per bubble lifetime; `maybeDialogueChat` / `maybeHousemateChat`; `resetDialogueSessions()` on new game/load |
| `lifeSimulation.ts` | `settlerChat` / `settlerPairChat`; `tickHumanChat(entity, resolveChatPartner)` each active tick |

**Categories:** `work`, `needs`, `social`, `existential`, `chaos`, `environment`

**Context → category (examples):** `work`/`guard`/`hunt` → work; `home`/`sleep`/`food`/`pregnant` → needs; `social`/`courtship`/`festival`/`school`/`child` → social; `fear`/`affair` → chaos; `renffr`/`election` → existential; winter/rain/drought hints widen the pool.

**Pairing:** `settlerPairChat` lets the lower entity id initiate so both settlers share one session (courtship, affair, idle social, Renffr gossip pairs). Solo chat uses `solo:{id}` sessions (all three lines on one settler).

**Scripted exceptions** (not JSON trees — fixed or dynamic one-liners):

| Trigger | Source | Mechanism |
|---------|--------|-----------|
| Renffr omen night | `renffrStar.ts` | `sayHumanChatPhrase` — simultaneous scripted lines to multiple settlers |
| Election gossip | `villageLeadership.ts` | `tickElectionGossip` → `sayHumanChatPhrase` with candidate names in phrase |
| Election winner | `villageLeadership.ts` | `"I will serve the village!"` on reveal |
| Marriage | `lifeSimulation.ts` | Both partners get `chatPhrase: 'Yes!'`, `chatTicks: 120` on courtship completion |

**Tests:** `humanChat.test.ts` (tree pick, 3-beat advance, housemate child/food contexts); `villageLeadership.test.ts` (gossip + winner line); `lifeSimulation.courtship.test.ts` (marriage `Yes!`); `renffrStar.test.ts` (omen broadcast).

**Editing dialogue:** add trees to `sim_dialogue_trees.json` under a `category`; optional root copy `sim_dialogue_trees.json` kept in sync. Legacy one-liners were migrated via `app/scripts/migrate-legacy-dialogue.py` (`wf_*` ids).

---

## Wildlife & ecosystem

`SPECIES_CONFIG` in `gameEngine.ts` defines energy, speed, hunt/flee ranges, sprites.

Predator–prey loops affect `ecosystemHealth` and `pollutionLevel`. Prey flee humans (and rivals) when in range.

### Grazing pressure (v0.4.1)

`ecosystemPressure.ts` → `getGrazingPressureReport(world)`:

- Counts live deer, grass, rabbits, wolves
- Estimates daily **grazing demand** (deer + rabbit bite load) vs **grass recovery** (`2.5 × grassMult × TICKS_PER_DAY` per grass patch; season/weather multipliers inlined to avoid circular imports)
- Returns `stable` | `caution` | `critical` plus headline/advice strings
- **Nature tab** in `App.tsx` shows an amber/rose warning card when pressure is not stable

---

## Groups on the map

- **Visitors** (`VisitorGroup`): temporary camps, passive daily gifts, departure timer, `tradesCompleted`, `refugeeResolved`
- **Rivals** (`RivalSettlement`): persistent AI camps, own buildings (`faction: 'rival'`), relationship mood (`friendly` → `tense`)
- **Pending diplomacy** (`DiplomacyEvent[]` on `WorldState.pendingDiplomacyEvents`): tribute, border dispute, alliance — player must pick a response; expires after 14 days

Both spawn humans with `faction` set; simplified camp orbit AI.

### Map interaction (v0.4.1)

| Action | Entry point |
|--------|-------------|
| Rival gift / pact / militia | Inspector when rival building or camp selected; also Village → Frontier neighbors |
| Respond to rival event | Top banner **or** rival inspector (choices from `DiplomacyChoice[]`) |
| Visitor trade | Click cyan camp marker → `VisitorCampPanel` (`tradeWithVisitors`) |
| Refugee negotiate | Same camp panel (`negotiateRefugees` — welcome / screen / turn away) |
| Focus camp | Village tab **Focus camp**, inspector **Ping camp**, diplomacy banner **Show camp on map** |

**ViewState** camp fields:

- `highlightedCampKey` — `rival:<id>` or `visitor:<id>`; drives pulsing ring in `renderer.ts`
- `selectedCampKey` — visitor camp open in inspector (rivals use `selectedBuildingId` on first rival structure)

**Canvas click** (`App.tsx` `handleCanvasClick`): `hitTestCamp()` runs after building/entity checks; focuses camera via `focusCameraOn()`.

**Key exports** (`groupEvents.ts` via `gameEngine.ts`): `sendRivalGift`, `establishRivalTradePact`, `showStrengthToRival`, `respondToDiplomacyEvent`, `tradeWithVisitors`, `negotiateRefugees`, `hitTestCamp`.

---

## Frontier combat (abstract raids)

Combat is **strength-ratio resolution**, not tactical map battles. Key flow in `frontierCombat.ts`:

| Function | Role |
|----------|------|
| `maybeQueueRaid` | Tense/competitive rivals roll raid chance; sets `marchDistanceTiles`, `expiresAtTick` (2–6 days) |
| `respondToRaidEvent` | Player picks defend / barricade / payoff; `flashMilitia()` sets `combatTicks` on adults |
| `launchRaidOnRival` | Dispatches player war-band (provisions by distance); queues `pendingOutgoingRaidEvents` — does **not** resolve combat instantly |
| `rollRivalOutgoingRaidResponse` | Rival offers tribute or chooses to fight (fight always possible) |
| `respondToOutgoingRaidEvent` | Player accepts tribute, declines and attacks, or presses attack when rival fought |
| `getOutgoingRaidActionLabel` | **Raid** vs **Counter-raid** copy — counter only when `pendingRaidEvents` includes that rival |
| `getCombatPreview` | UI forecasts: militia count/strength, defend/barricade/outgoing ratios, payoff vs raid hint |
| `getRaidCasualtyBounds` | Population-scaled death tiers on fight outcomes (payoff = 0 deaths) |
| `getMilitiaStrength` | Adults × base + spears/shields + `getBarracksGuardBonus` + wall/tower from `defenseStructures.ts` |

**State:** `pendingRaidEvents` (incoming), `pendingOutgoingRaidEvents` (player war-band awaiting response). Peace treaties cancel both (`cancelPendingRaidsForRival`, `cancelPendingOutgoingRaidsForRival`).

**Map presentation:**

- `renderer.ts` `drawRaidMarchLines` — pending incoming raids only
- `lifeSimulation.ts` — rival `faction` settlers march toward `getPlayerCampCenter` when `isRaidMarchingForRival`
- Outgoing raids: orange map banner + rival inspector; abstract combat resolves on player choice (not at launch)

**UI:** `CombatPreviewPanel.tsx`, `CombatLogPanel.tsx` (filters `type === 'combat'`), incoming (rose) + outgoing (orange) raid banners + `FrontierPanel` in `App.tsx`. Player guide → [app/README.md](app/README.md#frontier-raids--militia).

---

## Rendering notes

### Entity draw cache (v0.5.0 — ready for shipment)

Main-thread rendering no longer full-scans `entities` on each tick change (lands in v0.5.0 release):

1. `gameTick` sets `world.entityByType` after all entity mutations (including wildlife replenish).
2. `buildRenderSnapshot()` passes `entityByType` into the snapshot.
3. `updateCachedEntities()` reads type buckets → `buildEntityDrawBuckets()` → y-sorted trees, animals, humans.
4. Grass uses viewport-keyed culling: `collectGrassInViewport()` over `byType[Grass]` → ephemeral `buildGrassGrid` + `forEachInRect` (not a full-entity filter). `_cachedGrass` invalidates on tick or `grassViewportKey` (camera/zoom/canvas). Worker SoA path scans `grassSlots` with AABB check (no grid rebuild).
5. Worker + `renderSoA` path uses `updateCachedEntitiesFromSoA()` — slot lists from `updateRenderSoABuckets()`.

Layer taxonomy is centralized in `getRenderEntityLayer(type)` (`grass` | `tree` | `human` | `animal`) — used by both `buildEntityDrawBuckets()` and `renderSoAEntities.ts`.

### OffscreenCanvas layers (v0.5.0 — ready for shipment)

Rendering splits **static ground** from **dynamic world content** so rivers, terrain tiles, and entity sprites are not redrawn from scratch every frame when the cache key is unchanged.

**Modules:**

| Module | Cache | Invalidates when |
|--------|-------|------------------|
| `terrainLayer.ts` `bakeTerrainLayer()` | 1×1 px per map tile (season-colored) | Map seed/preset/size or `season` changes |
| `terrainLayer.ts` `bakeTerrainDecor()` | World-resolution rivers + map border | Map seed/preset or world `width`/`height` changes |
| `entityLayer.ts` `beginEntityLayerPaint()` | Full canvas bitmap of entities + overlays | `buildEntityLayerKey()` — tick, camera, grid/paths, selection, build mode/ghost/strip, particle/text counts |

**Frame paint order** (`renderGame` in `renderer.ts`):

```
terrain blit → entity layer blit → flash overlay → season/weather/night → grid-top → renffr omen
```

- **Terrain:** `drawProceduralGround()` blits baked tile + decor surfaces scaled by camera zoom.
- **Entities:** `compositeCachedEntityLayer()` paints scent/grid/grass/trees/buildings/animals/humans/particles into an offscreen surface, then `drawImage` to the main canvas.
- **Flash effects:** `drawEntityFlashOverlay()` stays on the main canvas (uses `_time`); `drawAnimals` / `drawHumans` skip flash when `forEntityLayerCache` is true.

`resetRendererCaches()` (called from `gameLoop.ts` on new game / load) disposes terrain, decor, and entity offscreen surfaces.

**Tests:** `entityLayer.test.ts`, `terrainLayer.test.ts`; Vitest uses `src/test/canvasPolyfill.ts` (Node has no native `OffscreenCanvas`).

### Visuals

- `ENTITY_DRAW_SCALE` (animals/buildings) vs `HUMAN_DRAW_SCALE` (smaller settlers)
- Human sprites: preloaded PNGs (`human_male.png`, `human_female.png`); procedural canvas sheets as fallback
- Night: blue overlay when `isNightHour(hourOfDay)`; warm window/chimney glow on residences via `juiceEffects.ts` (`getNightGlowIntensity`, `NIGHT_HOME_GLOW_TYPES`)
- Rotatable buildings: `building.rotation` 0\|90; sprite draw rotated 90° in `renderer.ts` (`normalizeBuildingRotation`)
- `renffrOmen` drawn screen-space on top after night tint

---

## UI (`App.tsx`)

- **Alert strip** (`AlertBar`, `priorityAlerts.ts`) — priority clickable alerts under header (raids, diplomacy, food, shelter, trade, challenges)
- **Inspector** (collapsible; auto-expands in selection handlers — `handleCanvasClick`, `focusCampOnMap`, `focusBuildingOnMap` — not via `useEffect`) + **6 sidebar tabs**: Village, Frontier, Nature, Progress (Research / Trade / Goals), Log, More (Guide / Roadmap)
- Tab hotkeys: `V` / `F` / `N` / `P` / `L` / `M`
- **Inspector** supports player entities, buildings, **visitor camps** (`VisitorCampPanel`), and **rival diplomacy** (full actions + pending event cards on rival buildings)
- **Frontier tab** (`FrontierPanel`) — visitors, rivals, raids; badge when pending events
- **Diplomacy event banner** — up to two pending `DiplomacyEvent` cards at top of map (replaces passive `activeEvent` banner while unanswered)
- **Nature tab** — ecosystem health bars + **grazing pressure warning** when deer outpace grass recovery
- **Focus panel** — contextual next-step hints with **Go →** actions (`focusHints.ts`, `FocusPanel.tsx`)
- **Progress subnav** — Research / Trade / Goals with active-research dot and trade-ready count badges
- **Event log** — Chronicle + **Combat** sub-tabs; filterable chronicle with copy / download `.txt` / `.json` / `.csv`; optional export on save
- **Build UX** — left **Build catalog** (`BuildCatalogPanel`, `buildCatalog.ts`) with category rail; press **B** to collapse; grid toggle (`G`); rotation (`R`) for Road/Wall/Wall Gate; quick-build `1–9` when panel open
- **Intro** — `IntroScreen` before `initGame`; `ensureIntroAudio()` on first interaction; skip to setup after logo
- **Game menu** (`GameMenu`) — save, load, auto-save, audio, reset in ☰ header menu
- Header shows season, year, **day**, **time** (☀️/🌙), resources; food badge pulses when critical
- Quick Start tutorial (4 steps), replay from More → Guide tab

---

## Constants & versioning

| Symbol | Location | Value |
|--------|----------|-------|
| `GAME_VERSION` | `version.ts` | `'0.4.2'` |
| `GAME_PHASE` | `version.ts` | `'Early Alpha'` |
| `ROADMAP_TARGET_VERSION` | `roadmapContent.ts` | `'0.5.0'` |
| `package.json` version | root + app | `0.4.2` |
| `COMPATIBLE_SAVE_VERSIONS` | `saveLoad.ts` | `['2.0', '2.1', '2.2', '0.4', '0.4.1', '0.4.2']` |

---

## Performance

**Shipped (v0.4.2):** off-screen sim throttles, per-tick `entityById` / `buildingById`, wildlife `byType` loop, `wildlifeCounts`, UI memoization. See [CHANGELOG.md](CHANGELOG.md) `[0.4.2]` → Performance.

**v0.5.0 perf/render (in code):** renderer entity draw cache (`world.entityByType` → `RenderSnapshot` → `updateCachedEntities`); `EntityCatalog` combined alive/byType index; shared `getRenderEntityLayer()` for main + SoA paths; **OffscreenCanvas layers** (terrain tiles + decor bake, dynamic entity bitmap cache, flash overlay on main canvas).

**Benchmark:** `cd app && npm run sim -- 30min` — env `SIM_MINUTES` (default 1200 ≈ 30 game-min), `PERF_SAMPLE_EVERY` (default 120). July 2026 sanity run (72k ticks, ~8 game years, ~557 entities): avg **1.81 ms/tick**, p50 **1.30 ms**, p95 **4.83 ms**, max **105 ms**. **Real play (July 2026):** 200+ player humans, game still smooth — total alive **~850–1000**. **v0.5 design target:** **300 player + ~30 neighbor humans** (2 rival camps + visitors) → **~330 humans on map**, **~1250 alive**; p95 &lt; 16 ms/tick @ ~800 (town), &lt; 20 ms/tick @ **~1250** (city); headroom **~1500**.

**v0.5 ship gatekeeper:** `npm run sim -- 20year` — headless **20 in-game years** (172800 ticks, 20 winters). Env: `SIM_PROFILE=town|village|eco` (default `town`), `SIM_YEARS=20` (set by `simulate-20year.ts`), `SIM_MAX_TICKS` for smoke only. Logs → `app/scripts/logs/sim-20year-<profile>-<timestamp>.txt`. **Exit 0 required** before tagging v0.5.0. `npm run sim -- 10year` remains a faster regression check (`SIM_YEARS=10`). CI gate: `npm run bench`.

**Future phases** (version + finish target) — full table in [ROADMAP_0.5.0.md](ROADMAP_0.5.0.md):

| Phase | Version | Finish by |
|-------|---------|-----------|
| All open perf + UI + architecture (grid, compaction, App split, Worker, canvas) | v0.5.0 | End July 2026 |

Event log stays uncapped in saves; Phase 3 may add optional append-only indexing only if save size becomes a problem.

---

## Distribution

Current alpha runs in the browser via `npm start`. Packaging plans (desktop installer, Steam) → [ROADMAP.md](ROADMAP.md).

---

## Extension points

| Task | Where to start |
|------|----------------|
| New building | `gameTypes.ts` `BUILDING_CONFIGS`, sprite in `public/sprites/`, production block in `gameEngine.ts` |
| New species | `EntityType`, `SPECIES_CONFIG`, tick branch in `gameEngine.ts`, `renderer.ts`; `getRenderEntityLayer()` auto-buckets unknown wildlife as `animal` |
| New world event | `groupEvents.ts` `rollYearlyWorldEvent` |
| New rival diplomacy event | `DiplomacyEventKind`, `pickDiplomacyKind` / `maybeQueueDiplomacyEvent`, handler in `respondToDiplomacyEvent` |
| New visitor kind | `VisitorKind`, spawn tables in `groupEvents.ts` |
| Ecosystem UI warning | Thresholds in `ecosystemPressure.ts`, card in `App.tsx` Nature tab |
| UI panel | `App.tsx` tab + optional component under `src/game/` |
| Multiplayer (future) | `faction`, `groupId`, `ownerId` pattern on entities/buildings |

---

## Dev log

**North star:** Ship a cozy frontier eco-sim where settlers live on a schedule, the food chain matters, and the valley feels alive — without asking players to touch a terminal.

**Winning moment for a new player:** *"I built a house, assigned workers, didn't kill all the wolves, and everyone came home at night."*

### June 21 — Early alpha foundation

| Area | What shipped |
|------|----------------|
| **Branding** | `GAME_PHASE = 'Early Alpha'`; badges in header, intro, Guide |
| **Humans** | Movement fixes; procedural 4-frame walk sheets (`humanSprites.ts`) |
| **Social** | Speech bubbles via dialogue trees (`humanChat.ts` + `sim_dialogue_trees.json`); day/night schedule — 24 ticks = 1 day |
| **Housing** | `residenceBuildingId` for sleep; `homeBuildingId` = workplace |
| **World** | Visitor caravans + rival camps (`groupEvents.ts`); Moon Howlers + Church cure |
| **UX** | Collapsible build panel, Inspector, Guide tab, `IntroScreen.tsx` |
| **Audio** | Procedural music/SFX rewrite; `beginAudio()` unlock on user gesture |
| **Docs** | `README.md`, `app/README.md`, `TECHNICAL.md`, `ROADMAP.md` split |
| **Dev** | Root `package.json` — `npm start` / `npm run build` from repo root |

### June 24 — v2.2 playtest pass

First-night tutorial, save migration (`GAME_VERSION` → `2.2`), terrain placement rules, victory scope (Eco-Utopia + Great City active), balance tweaks, PNG human sprites, `desktop:note` stub.

### June 25 — Event log overhaul + Prison building

Uncapped event log in saves (UI still shows latest 500); `.json` / `.csv` exports; Prison building + arrests; terrain cache fix; stronger map presets.

### June 24 → v0.4 — Playtest & logic audit

~200-pop sims: building assignment guards, meal timing, workshop recipes, Town Hall unlock chain, housing cap/expand, commute snap, event log UI, focus hints, weapons/armament, rival diplomacy basics.

### July 4, 2026 — v0.4.1 shipped

Tribes diplomacy v2, frontier raids MVP, Trade Empire + Harmony victory paths, merit elections (ceremony + record score ready in code — ships with v0.5.0 tag), in-game Roadmap tab.

### July 2026 — v0.4.2 feature work (shipped July 5)

6-tab sidebar, `AlertBar`, `BuildHotbar` (v0.4.2; later replaced by `BuildCatalogPanel`), `FrontierPanel`, forge queue, raid deadlines, perf pass (`entityById`, off-screen throttles, `wildlifeCounts`), `sim -- 30min` benchmark. P1 defense buildings + `CombatLogPanel`; P2 rotation, juice pass, intro refine.

### July 5, 2026 — v0.4.2 shipped

`GAME_VERSION` 0.4.2, 10-year town PASS, 10-user beta playtests, docs synced; next target **v0.5.0** → [ROADMAP_0.5.0.md](ROADMAP_0.5.0.md).

### July 5, 2026 — Docs hygiene + v0.5.0 audit session

| Area | What changed |
|------|----------------|
| **Doc consolidation** | `SESSION_SUMMARY*.md` → `TECHNICAL.md` (dev log, fix history, playtest, audio credits); `app/*.md` → root (`CHANGELOG.md`) + `TECHNICAL.md`; **`app/README.md` only markdown in `app/`** |
| **Repo cleanup** | Deleted `terminals/`, `log.txt`; root `.gitignore` for both |
| **License** | `LICENSE` — MIT, Copyright **Renffr**; third-party audio notice |
| **Roadmap dates** | All v0.5.0 targets → **end July 2026**; removed stale `ex-Q1 2027`; `post-0.4.2` deferrals → `post-0.5.0` |
| **v0.5.0 code audit** | Compared roadmap to code: **1 P0 done** (compaction), **4 partial**, **16 P0 open** — see [ROADMAP_0.5.0.md](ROADMAP_0.5.0.md#code-audit-2026-07-05-vs-game_version--042) |
| **Next-action order** | **Finish partial first** in `ROADMAP_0.5.0.md` + in-game `roadmapContent.ts` (`v050-partial-first` section) |

**Partial-first todo (dev):** renderer `byType` cache **ready** · grass viewport buckets **ready** → `buildingById` go-home → `sim -- 30min` profiles/exit → full `sim -- 20year` → App tab split. Spatial grid + Worker + OffscreenCanvas **ready** July 7–8 (ship with v0.5.0 tag).

**Sim note:** `sim -- 20year` smoke PASS (8640 ticks); full 172800-tick run still required for v0.5 tag.

**Git (session):** `b69a865` … `4f157ca` on `main`.

### July 5, 2026 — Scale target revision (real play)

Playtest: **200+ citizens**, performance still good. Entity budget is higher than headless sims assumed (~557 @ ~70 humans). **v0.5 ship target: 300 player humans + neighbors / ~1250 alive** (headroom ~1500).

| Layer | Approx. count @ city scale |
|-------|----------------------------|
| Player humans | **300** |
| Rival humans (2 camps × up to 12) | **~24** |
| Visitor humans (one camp, 3–7) | **~7** |
| Grass (spawn cap) | ~500 |
| Wildlife + trees | 50–150+ |
| **Total alive** | **~1200–1250** |

**Sim note:** `tickHumans` runs on **all** `EntityType.Human` (player + rival + visitor). Flee `predators` includes **player + rival** humans (`gameEngine.ts`), not visitors.

**Optimization sizing:** dual-layer spatial grid; mobile layer must index all map humans; benchmark `SIM_PROFILE=city` spawns rivals + visitor wave and asserts **~1250 alive**. Private reference → `private/v0.5-scale-targets.md` (full budget + benchmark table + implementation order).

### July 5, 2026 — Election day ceremony (v0.5.0 P1 — ready for shipment)

**Implemented in `villageLeadership.ts`** — extends merit election (do not duplicate). Ships with v0.5.0 tag.

| Feature | Implementation |
|---------|----------------|
| Founding leader | First **male** pioneer via `appointFoundingLeader()` — no merit vote until Year 10 |
| Decennial elections | Every 10 years (`ELECTION_INTERVAL_YEARS`); ceremony on calendar day 0 |
| Vacancy | Leader death/jail → `pendingElectionYear = year + 2`; no instant succession |
| Buildup | `tickElectionBuildup` (year-before notify) + `tickElectionGossip` |
| Ceremony | `electionCeremony` phases: gathering → gossip → tension → reveal → 3-day *Election Revelry* |
| Gather site | Town Hall center, else map center (`getElectionGatherSite`) |
| Incumbent in race | `getElectionRaceCandidates()` — sitting head always listed when eligible |
| Record score | `getIncumbentRecordAssessment()` — economy (+4/−5), scandals (+3 clean / −5 each), village health (+3/−6); **+8 positive cap**; only incumbent gets `recordPoints` |
| UI | `VillageLeadershipPanel`, `focusHints`, `contextualTutorial` |
| Save | `electionCeremony`, `electionBuildupNotifiedYear`, `pendingElectionYear` via `saveLoad.ts` |

**Remaining:** live playtest at Year 10/20.

### July 7–8, 2026 — Bug tracker closure + scale infra (ready for v0.5.0)

Playtest build remains **`GAME_VERSION` 0.4.2** until the v0.5.0 tag. Items below are **implemented and tested**, not released.

| Area | Status |
|------|--------|
| **Bug pass** | **226** tracker items (batches A–J); `/check-work` PASS |
| **Spatial grid** | Ready — `spatialGrid.ts` grass + mobile layers; wired in `lifeSimulation.ts` graze/hunt/flee |
| **Worker sim** | Ready — `simWorker/GameWorkerHost.ts`, render SoA (`simBuffers/`), `WORKER_PROTO` negotiation; opt-in via env |
| **Renderer cache** | Ready — `world.entityByType` per sim tick; `RenderSnapshot.entityByType`; `buildEntityDrawBuckets()`; viewport grass culling from grass bucket only |
| **Grass render buckets** | Ready — `collectGrassInViewport()` spatial query over `byType[Grass]`; `_cachedGrass` + viewport key; batched `drawGrass` |
| **OffscreenCanvas** | Ready — `canvasLayer.ts`, `terrainLayer.ts` (tiles + decor), `entityLayer.ts` (dynamic bitmap); `renderer.ts` compositing; `resetRendererCaches()` on new game/load |
| **Entity indexing** | Ready — `EntityCatalog` combined alive/byType cache; `resolveAliveHumans()`; `getRenderEntityLayer()` shared with SoA buckets; `emptyEntityByType()` |
| **Save/UI** | Ready — `saveSchema.ts` allow-list saves; camera pan round-trip; `catalog` state in `App.tsx` from loop subscribe |
| **Settler chat** | Ready — `sim_dialogue_trees.json` (v1.1, **95** trees); `dialogueTrees.ts` + `humanChat.ts` 3-beat paired sessions; scripted election gossip, marriage `Yes!`, Renffr omen exceptions |
| **Tests** | Vitest **343** passed, **0 skipped**, **64** files (`npm test`); browser worker suites optional (`vitest.browser-worker.config.ts`); frontier raid tests in `frontierCombat.test.ts` (22); chat tests in `humanChat.test.ts`, `villageLeadership.test.ts`, `lifeSimulation.courtship.test.ts`; layer tests in `entityLayer.test.ts`, `terrainLayer.test.ts` |
| **Lint** | **70 → 0** ESLint errors — `useLayoutEffect` ref sync, `BuildCatalogPanel` derived category, test hygiene |
| **UI** | Ready — `BuildCatalogPanel` replaces deleted `BuildHotbar`; `ResourceBadge` / `resourceLabels.ts` |

### July 8, 2026 — Dialogue-tree settler chat

Routine settler banter no longer uses inline phrase pools in `humanChat.ts`. All context-driven chat routes through **`sim_dialogue_trees.json`** (95 trees: `dt_*` + migrated `wf_*`). Legacy one-liners were converted via `app/scripts/migrate-legacy-dialogue.py`. Election gossip, winner speech, marriage `Yes!`, and Renffr omen remain scripted one-offs.

### July 8, 2026 — npm scripts + test gate cleanup

| Area | Change |
|------|--------|
| **`npm test`** | `vitest run && tsc -p tsconfig.vitest.json --noEmit` — **343 passed**, **64** files, **0 skipped** |
| **`npm run` (app)** | **9 scripts**: `dev`, `build`, `test`, `test:watch`, `lint`, `preview`, `sim`, `bench`, `dup` |
| **`sim` CLI** | `scripts/sim-cli.mjs` replaces all `simulate:*` / `balance:*` / `benchmark:*` entries |
| **Vitest** | Browser worker tests excluded from default run; optional `vitest.browser-worker.config.ts` |

### July 8, 2026 — Batches I–J (sim integrity + check-work follow-ups)

| Batch | Theme |
|-------|-------|
| **I** | `killHuman` widow routing; `isSettlerRelationshipEntity` for Moon Howler marriages; `tickQueries.ts` pairwise hotspot elimination; collision-free social integration test ids |
| **J** | `isKillableSettlerEntity` + `markWildlifeDead` for werewolf-form deaths; test helper type fixes folded into `npm test` |

### July 8, 2026 — jscpd duplicate cleanup

`jscpd` scan found **8 clones** (93 lines, 0.4%) in `stripRender.ts`, `trackPlayer.ts`, `director.ts`, intro/background music mute sync, and inline `lifetimeStats` in `worldGen.ts`. Refactored to shared helpers; **`npm run dup`** now reports **0 clones**. Quality gates: `npm test` **320** passed, `npm run build` PASS.

---

## Fix history

### June 24, 2026 — Sprite & interaction fixes

**Tests:** `npm run build`, `npm run lint` (repo root or `app/`) — all pass.

| Problem | Fix | Files |
|---------|-----|-------|
| Humans looked like "only heads" | Full-body PNG for idle + moving; procedural fallback only | `spriteLoader.ts`, `renderer.ts` |
| Style switched while walking | Same PNG path for both states | `renderer.ts` |
| Settlers gigantic vs world | Reduced `HUMAN_DRAW_SCALE` (5.5→2.8), `HUMAN_SPRITE_HEIGHT_MULT` (3.2→2.5), `HUMAN_MIN_SCREEN_PX` (80→55) | `humanSprites.ts` |
| Clicks missed settlers | `getHumanSelectionBounds()` from real sprite bounds | `humanSprites.ts`, `App.tsx` |
| Houses showed "+ Worker" | Hidden for residences; guard in `assignIdleWorkerToBuilding()` | `App.tsx`, `gameEngine.ts` |
| Speed 3x/5x felt weak | Doubled `BASE_TICKS_PER_SECOND` (1→2); added 10× option | `gameLoop.ts`, `App.tsx` |
| Large populations lagged | `SimulationFocus`: off-screen humans skip pathfinding every 5th tick | `gameEngine.ts`, `gameLoop.ts` |
| Unchecked population growth | `getFemaleFertility()` — decline after 35, infertility after 50 | `dayCycle.ts`, `gameEngine.ts` |
| Everyone died at 200 days | `getOldAgeDeathChance()` — varied lifespans 60–95 | `dayCycle.ts`, `gameEngine.ts` |
| Everyone named John/Mary Smith | Sync name load via `?raw` imports; `fixDefaultNames()` on load | `nameLoader.ts`, `data/`, `App.tsx` |
| Trade routes gave free resources | `updateTradeRoutes()` now deducts `resourcesGiven` | `gameEngine.ts` |
| Reputation too hard to earn | +2 per building, +10 festival, +3 research | `gameEngine.ts` |

### June 24 — Code cleanup (hygiene only)

Shared `eventLog.ts`; deduped visitor/rival logging in `groupEvents.ts`; victory constants in `victory.ts`; consolidated `App.tsx` imports.

### July 4, 2026 — Lint hygiene

Removed unused `countByType` in `simulate-30min.ts`; inspector auto-expand moved from `useEffect` to selection handlers in `App.tsx`. Sanity sim: 72k ticks, avg **1.81 ms/tick**, p95 **4.83 ms/tick**.

### July 4, 2026 — P1 defense & combat log

Wall, Wall Corner, Wall Gate, Watchtower, Barracks; barricade + militia bonuses; guard patrols; `CombatLogPanel`; raid march lines; defense sprites in `public/sprites/`.

### July 4, 2026 — v0.4.2 polish

Road/wall/gate rotation (**R**), juice pass (night glow, build confetti, camera nudge), intro screen refine (~20s timeline).

### July 4, 2026 — Comprehensive bug-fix pass (~40 fixes)

Four review rounds — full P0/P1/P2 table in [CHANGELOG.md](CHANGELOG.md) → **Bug fixes — comprehensive pass**.

| Round | Focus | Highlights |
|-------|-------|------------|
| **1** | Core sim + loop | Map setup GameLoop sync; faction ages; double aging; winter heating; prison demolish; challenges/eco timing; placement; raid defend |
| **2** | Frontier + economy | Diplomacy event loss; peace vs raids; rival pop; workshop gold cap; `great_city`; victory buildings; prison ghost workers |
| **3** | Calendar + save | Eco 24×/year; age display; raid tick timing; save year sync; trade storage cap; forge tick; leadership XP |
| **4** | Visitors + stats | Refugees killed on departure; pop-cap food charge; save migrations; stats births/disasters; diplomacy/trade/forge UI; moon howler hunt leak |

**Verified:** `npm run build`, `npm run lint` (0 errors), `npm run sim -- 5min`, `npm run sim -- 30min`.

Key areas: `App.tsx`, `groupEvents.ts`, `gameEngine.ts`, `frontierCombat.ts`, `saveLoad.ts`, `stats.ts`, `militiaBalance.ts`, `moonHowler.ts`, `forge.ts`.

---

## Playtest report

**10 external beta sessions** (v0.4.2 ship gate, July 4–5, 2026). Large map (1600×1200), 75–120 min each, 1×/5×/10×. Balance reference: 10-year town PASS (`app/scripts/logs/sim-10year-town-2026-07-04T21-23-57-948Z.txt`).

**Design note:** Fighting is **not** the main goal — **preparation** is (walls, forge tier, militia, tribute math, winter stockpiles). No battle screen; abstract resolution + combat preview + Log → Combat is intentional.

### Session index

| # | Tester | Profile | Duration | Speed | Years |
|---|--------|---------|----------|-------|-------|
| 1 | Mara “Ledger” Okonkwo | Colony-sim veteran | 110 min | 5× | Y4 |
| 2 | Jesse “Rewild” Chen | Eco / Nature-tab | 95 min | 1×→10× | Y6 |
| 3 | Dmitri “Bulwark” Volkov | Defense / militia | 120 min | 10× | Y5 |
| 4 | Priya “TabFlow” Sharma | UI / hotkeys | 80 min | 5× | Y3 |
| 5 | Alex “FrameBudget” Nakamura | Perf stress | 90 min | 10× | Y4 |
| 6 | Elena “Treaty” Rossi | Diplomacy / trade | 100 min | 5× | Y5 |
| 7 | Tom “Dynasty” Bergström | Population / families | 105 min | 3× | Y4 |
| 8 | Kenji “Grid” Watanabe | Builder / layout | 115 min | 5× | Y5 |
| 9 | Sofia “Archive” Petrov | Chronicle / exports | 85 min | 1×+5× | Y4 |
| 10 | Ravi “Sprint” Malhotra | Efficiency runner | 75 min | 10× | Y5 |

### Cross-session synthesis

**Ship-ready:** winter/food loop (4.5), 6-tab UI + alerts (4.5), diplomacy (4.0), defense prep UX (4.0), large-map 10× perf (4.0), combat log/exports (4.5).

**Fixed before v0.4.2 ship (July 5):** eco breakdown on Nature tab; population growth report; rival “distant camp” label; Frontier readiness card; juice toggle; raid prep copy; death filter hints; combat log readability.

**Endorsement:** 7/10 would recommend to friends (eco/growth caveats); 3/10 wanted eco copy or mid-game goals first.

Per-session notes (10 testers) were archived in git history when `app/docs/PLAYTEST_BETA_10_USERS.md` was merged here (commit July 2026).

---

## Audio credits

Wilderfolk uses royalty-free music and sound effects from [OpenGameArt.org](https://opengameart.org). Files live under `app/public/audio/`. Track paths are defined in `src/audio/tracks.ts`.

If a sample fails to load, the game falls back to procedural Web Audio tones (`src/audio/introMusic.ts`, `src/audio/backgroundMusic.ts`). Loop playback and fade-out live in `trackPlayer.ts`; HTML `<audio>` mute sync in `htmlAudioSync.ts`; orchestration in `director.ts`.

### Music

| In-game file | Original title | Author | License | Source |
|---|---|---|---|---|
| `music/intro-frontier.mp3` | Settlement of the Frontier (Full) | [TAD](https://opengameart.org/users/tad) | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) | https://opengameart.org/content/settlement-of-the-frontier-full |
| `music/day-village-loop.mp3` | Abeth (*Peaceful village loop*) | [elerya](https://opengameart.org/users/elerya) | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | https://opengameart.org/content/peaceful-village-loop |
| `music/night-calm.ogg` | Slow Stride Loop | [isaiah658](https://opengameart.org/users/isaiah658) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | https://opengameart.org/content/slow-stride |

### Ambient & sound effects

| In-game file | Original title | Author | License | Source |
|---|---|---|---|---|
| `ambient/birds-loop.ogg` | Ambient Bird Sounds | [isaiah658](https://opengameart.org/users/isaiah658) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | https://opengameart.org/content/ambient-bird-sounds |
| `ambient/bird-chirp.mp3` | Bird chirping sounds | [syncopika](https://opengameart.org/users/syncopika) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | https://opengameart.org/content/bird-chirping-sounds |
| `ambient/cricket-frog-night.mp3` | Ambient Bird, Cricket and Frog | [Blender Foundation](http://apricot.blender.org) | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | https://opengameart.org/content/ambient-bird-cricket-and-frog |
| `ambient/wolf-howl.mp3` | Wolf Monster Sound | [CaveboyTup](https://opengameart.org/users/caveboytup) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | https://opengameart.org/content/wolf-monster-sound |
| `ambient/animals/*.wav` | Animal or beast sounds pack | [pauliuw](https://opengameart.org/users/pauliuw) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | https://opengameart.org/content/animal-or-beast-sounds |

### Attribution (CC-BY tracks)

When distributing or publishing Wilderfolk, include credit for CC-BY assets:

> **Music:** "Settlement of the Frontier (Full)" by Tad Miller (CC-BY 4.0); "Abeth" by Audibert jd / Eleryan Tales (CC-BY 3.0).  
> **Sound:** Ambient bird/cricket/frog audio from the Blender Foundation / *Yo Frankie!* project (CC-BY 3.0).

CC0 assets do not require attribution.

---

## Debugging

- **Help tab** — Moon Howler debug spawn (`spawnMoonHowlerDebug` in `gameEngine.ts`)
- **Guide tab** — alpha notice, full control reference
- Saves: browser DevTools → Application → Local Storage → key from `gameEngine.ts`

---

## License / contribution

Game source code: **[MIT License](LICENSE)** — Copyright (c) 2026 Renffr.

Bundled audio assets use separate CC-BY / CC0 terms → [Audio credits](#audio-credits).

Early alpha playtest — feedback welcome via [info@autosolid.nl](mailto:info@autosolid.nl) or [GitHub Issues](https://github.com/Rengerams/Wilderfolk/issues).

<p align="center">
  <em>Questions about the code? Start with <code>gameEngine.ts</code> and <code>App.tsx</code>.</em>
</p>