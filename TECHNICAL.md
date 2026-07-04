# Wilderfolk — Technical README

**Early Alpha · v0.4.2 shipped** · React + TypeScript + Vite + Canvas 2D

Developer-facing overview of the playtest build.

| Doc | For |
|-----|-----|
| [app/README.md](app/README.md) | Players |
| [ROADMAP.md](ROADMAP.md) | Plan & half-done registry |
| [ROADMAP_0.5.0.md](ROADMAP_0.5.0.md) | **v0.5.0** — scale + architecture (end July 2026) |
| [CHANGELOG.md](CHANGELOG.md) | Detailed change log |

---

## Repository layout

```
wilderfolk/
├── package.json          # Root scripts → delegates to app/
├── README.md             # Short landing page
├── TECHNICAL.md          # This file
├── ROADMAP.md            # Release plan + backlog
├── CHANGELOG.md          # Feature-level change log
└── app/
    ├── README.md         # Player guide (only markdown in app/)
    ├── package.json
    ├── vite.config.ts    # Dev server port 5173 (3000 blocked on some Windows hosts)
    ├── public/           # Static assets (sprites, logo)
    └── src/
        ├── App.tsx       # Main UI shell, tabs, tutorial, build panel
        ├── main.tsx
        └── game/         # Simulation + rendering (see below)
```

---

## Stack

| Layer | Choice |
|-------|--------|
| UI | React 19, Tailwind CSS, Radix UI primitives |
| Build | Vite 7, TypeScript 5.9 |
| Simulation | Custom tick-based engine (`gameEngine.ts`) |
| Rendering | Canvas 2D (`renderer.ts`), read-only `RenderSnapshot` |
| Persistence | `localStorage` JSON saves (`SAVE_KEY` in `gameEngine.ts`) |
| Audio | Web Audio procedural tones (`src/audio/`; `soundEngine.ts` is a deprecated re-export) |

No backend. Single-player, client-only.

---

## Running & building

From the **repo root** (folder containing `app/`):

```bash
npm install    # postinstall also installs app deps
npm start      # vite dev server → http://127.0.0.1:5173
npm run build  # tsc + production bundle → app/dist/
npm run lint   # ESLint (0 errors as of July 2026 sanity check)
npm run simulate:30min   # Headless playtest sim — env SIM_MINUTES (default 1200), PERF_SAMPLE_EVERY
npm run simulate:20year  # v0.5 ship gatekeeper — 20 in-game years (SIM_YEARS=20), town profile; exit 0 = PASS
npm run simulate:10year  # 10-year balance regression (SIM_YEARS=10 default)
```

Requires **Node.js 20+**.

---

## Architecture

### Simulation vs presentation

The game splits **world state** from **view state**:

| Module | Role |
|--------|------|
| `gameTypes.ts` | Types, enums, building/species configs |
| `gameEngine.ts` | `gameTick()`, init, save/load, building actions |
| `viewState.ts` | Camera, selection, camp highlight, build mode, `buildRotation`, `nudgeCameraToward()`, screen shake (UI-owned) |
| `gameLoop.ts` | `requestAnimationFrame` loop, tick accumulator, pause/speed |
| `renderSnapshot.ts` | Immutable bundle passed to renderer each frame |
| `renderer.ts` | Pure draw pass; must not mutate simulation |

```
gameLoop → gameTick(world) → buildRenderSnapshot(world, view) → renderGame(ctx, snapshot)
```

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
- v0.4.1 fields default on load: `pendingDiplomacyEvents: []`, `pendingRaidEvents: []`; visitor groups get `tradesCompleted: 0`, `refugeeResolved`, `leaderTalked`; rivals get `peaceTreatyDays`, `raidCooldownDays`; leadership fields via `validateVillageLeaderOnLoad`

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
| `dayCycle.ts` | Hours, night/work windows, residence assignment helpers |
| `groupEvents.ts` | Visitors, rivals, diplomacy events, trade/refugee negotiate, yearly world events |
| `militiaBalance.ts` | `MILITIA_BALANCE` constants, `computeMilitiaBreakdown` — iron replaces stone/wooden tiers |
| `frontierCombat.ts` | Militia/rival strength, `RaidEvent` queue, `respondToRaidEvent`, `launchRaidOnRival`, `getCombatPreview`, distance-scaled `expiresAtTick` |
| `defenseStructures.ts` | Wall/tower barricade bonuses, barracks guard count & militia bonus, patrol eligibility |
| `forge.ts` | `villageForge` state, iron spear/shield forge queue, save migration, outstanding-order alerts |
| `combatTech.ts` | `COMBAT_TECH` constants (breaks forge ↔ combat circular import) |
| `priorityAlerts.ts` | Clickable priority alerts (raids, diplomacy, food, forge, trade) |
| `entityCounts.ts` | `computeWildlifeCounts`, denormalized `world.wildlifeCounts` |
| `CombatPreviewPanel.tsx` | UI for militia vs rival forecasts (defend, barricade, pay-off, outgoing raid) |
| `ecosystemPressure.ts` | Deer vs grass grazing pressure report for Nature tab warnings |
| `challengeProgress.ts` | Challenge progress bars and active-challenge highlight |
| `combat.ts` | Defense research, armament checklist, hunt/combat helpers |
| `eventLog.ts` | Shared `logEvent()`, `EVENT_LOG_MAX`, save-load id sync |
| `eventLogExport.ts` | Chronicle `.txt` export formatting |
| `focusHints.ts` | "What to do next" hint generation |
| `humanSprites.ts` | PNG human sprites, sizing, selection bounds; procedural fallback |
| `humanChat.ts` | Speech-bubble phrase pools + chat tick decay |
| `renffrStar.ts` | Rare night-sky easter egg (shooting star + “Renffr”) |
| `buildingRotation.ts` | Road/wall/gate rotation (`BuildingRotation` 0\|90), footprint swap on place/render |
| `juiceEffects.ts` | Night window/chimney glow, build-complete confetti particles, glow intensity helpers |
| `renderer.ts` | Terrain cache, entities, buildings, weather, night overlay + home glow, speech bubbles, raid march lines (`drawRaidMarchLines`) |
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
| `spriteVariant` | Outfit index 0–3 (procedural sprite palette) |
| `chatPhrase` / `chatTicks` | Active speech bubble |
| `faction` | `'visitor'` \| `'rival'` for non-player humans |

### Daily schedule (`gameEngine.ts` + `dayCycle.ts`)

| Hours | Behavior |
|-------|----------|
| 20:00–06:00 | Commute to **residence**, idle at home, reduced energy loss |
| 06:00–07:00 | At home (morning) |
| 07:00–19:00 | If `homeBuildingId` set → commute to **work** |
| 19:00–20:00 | Head home |

Hunting, courtship, and idle wandering only run during “free roam” hours.

### Movement & visuals

- Idle behavior: explore, gather (nearest tree), socialize, patrol
- Velocity blending + friction; purposeful movement suppresses idle
- Renderer: PNG sprites (idle + moving); procedural sprites as fallback; speech bubbles, mouth overlay
- Status badges: 🏠 home, 🔨 work, 💕 courtship, etc.

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
| `launchRaidOnRival` | Counter-raid — provisions cost by distance, `OUTGOING_RAID_DEFENSE_MULT` (+25% rival defense) |
| `getCombatPreview` | UI forecasts: militia count/strength, defend/barricade/counter ratios, payoff vs raid hint |
| `getMilitiaStrength` | Adults × base + spears/shields + `getBarracksGuardBonus` + wall/tower from `defenseStructures.ts` |

**Map presentation:**

- `renderer.ts` `drawRaidMarchLines` — pending incoming raids only
- `lifeSimulation.ts` — rival `faction` settlers march toward `getPlayerCampCenter` when `isRaidMarchingForRival`
- Outgoing counter-raids resolve instantly (no player march animation yet)

**UI:** `CombatPreviewPanel.tsx`, `CombatLogPanel.tsx` (filters `type === 'combat'`), raid banner + `FrontierPanel` in `App.tsx`.

**Gaps (v0.4.2):** player militia march on counter-raid → **v0.5.0 P1**; real-time tactical battles deferred post-0.5.0. Full status → [Frontier combat — polish & gaps](#frontier-combat--polish--gaps).

---

## Rendering notes

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
- **Build UX** — bottom map **hotbar** (`BuildHotbar`) for common types; left **catalog** panel (`B`) for full list; collapsed rail has no duplicate quick-build (grid + cancel + expand only); grid toggle (`G`); rotation (`R`) for Road/Wall/Wall Gate; quick-build `1–9`
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

**Benchmark:** `cd app && npm run simulate:30min` — env `SIM_MINUTES` (default 1200 ≈ 30 game-min), `PERF_SAMPLE_EVERY` (default 120). July 2026 sanity run (72k ticks, ~8 game years, ~557 entities): avg **1.81 ms/tick**, p50 **1.30 ms**, p95 **4.83 ms**, max **105 ms**. Informal budget: p95 &lt; 16 ms/tick @ ~700 alive entities.

**v0.5 ship gatekeeper:** `npm run simulate:20year` — headless **20 in-game years** (172800 ticks, 20 winters). Env: `SIM_PROFILE=town|village|eco` (default `town`), `SIM_YEARS=20` (set by `simulate-20year.ts`), `SIM_MAX_TICKS` for smoke only. Logs → `app/scripts/logs/sim-20year-<profile>-<timestamp>.txt`. **Exit 0 required** before tagging v0.5.0. `npm run simulate:10year` remains a faster regression check (`SIM_YEARS=10`).

**Future phases** (version + finish target) — full table in [ROADMAP_0.5.0.md](ROADMAP_0.5.0.md):

| Phase | Version | Finish by |
|-------|---------|-----------|
| All open perf + UI + architecture (grid, compaction, App split, Worker, canvas) | v0.5.0 | End July 2026 |

Event log stays uncapped in saves; Phase 3 may add optional append-only indexing only if save size becomes a problem.

---

## Planned packaging (not implemented)

Target shipping paths documented for players:

- **Electron / Tauri** — desktop installer
- **Steam** — distribution + updates

Current alpha intentionally uses `npm start` + browser.

---

## Extension points

| Task | Where to start |
|------|----------------|
| New building | `gameTypes.ts` `BUILDING_CONFIGS`, sprite in `public/sprites/`, production block in `gameEngine.ts` |
| New species | `EntityType`, `SPECIES_CONFIG`, tick branch in `gameEngine.ts`, `renderer.ts` |
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
| **Social** | Speech bubbles (`humanChat.ts`); day/night schedule — 24 ticks = 1 day |
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

Tribes diplomacy v2, frontier raids MVP, Trade Empire + Harmony victory paths, merit elections, in-game Roadmap tab.

### July 2026 — v0.4.2 feature work (shipped July 5)

6-tab sidebar, `AlertBar`, `BuildHotbar`, `FrontierPanel`, forge queue, raid deadlines, perf pass (`entityById`, off-screen throttles, `wildlifeCounts`), `simulate:30min` benchmark. P1 defense buildings + `CombatLogPanel`; P2 rotation, juice pass, intro refine.

### July 5, 2026 — v0.4.2 shipped

`GAME_VERSION` 0.4.2, 10-year town PASS, 10-user beta playtests, docs synced; next target **v0.5.0** → [ROADMAP_0.5.0.md](ROADMAP_0.5.0.md).

---

## Fix history

### June 24, 2026 — Sprite & interaction fixes

**Tests:** `npm run build`, `npm run lint`, `npx tsc --noEmit` — all pass.

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

Shared `eventLog.ts`; deduped visitor/rival logging in `groupEvents.ts`; victory constants in `victory.ts`; consolidated `App.tsx` imports. Deferred: split `gameEngine.ts`, unify news helpers.

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

**Verified:** `npm run build`, `npm run lint` (0 errors), `npm run simulate`, `npm run simulate:30min`.

Key areas: `App.tsx`, `groupEvents.ts`, `gameEngine.ts`, `frontierCombat.ts`, `saveLoad.ts`, `stats.ts`, `militiaBalance.ts`, `moonHowler.ts`, `forge.ts`.

---

## Frontier combat — polish & gaps

Player guide → [app/README.md](app/README.md#frontier-raids--militia) · Code → `frontierCombat.ts`, `defenseStructures.ts`, `CombatLogPanel.tsx`, `CombatPreviewPanel.tsx`

| Item | Priority | Status | Notes |
|------|----------|--------|-------|
| **Village tab raid shortcut** | — | Done | Incoming raid card + Frontier `🏹 Raid` + map banner + alert strip |
| **Raid deadline vs distance** | — | Done | `expiresAtTick` 2–6 days; `marchDistanceTiles`; slower rival march in `lifeSimulation.ts` |
| **Pay-off vs raid tooltip** | — | Done | `CombatPreviewPanel` cyan hint when `incomingPayoffFood` &lt; `outgoingRaidFoodCost` |
| **Combat preview panel** | — | Done | Militia vs rival, defend/barricade/counter tiers, block reasons |
| **Dedicated combat log panel** | — | Done | Log → **Combat** — stats, scroll, .txt/.json/.csv export |
| **Walls / Watchtowers / Barracks** | — | Done | `defenseStructures.ts`; guard patrols in `lifeSimulation.ts` |
| **Raid march map overlay** | — | Done | `drawRaidMarchLines` — dashed red line + ⚔️ midpoint |
| **Rival war-band march** | — | Done | Rival settlers path to village while raid pending; ⚔️ badge when close |
| **Weapon / status map icons** | Low | Partial | Settler badges: 🏹 hunt, 🛡️ shields, 🪖 guard, ⚔️ `combatTicks` ✅ · **Missing:** player militia march on **outgoing** counter-raid → **v0.5.0 P1** |
| **Spear tier stacking** | — | Done | `militiaBalance.ts` — iron replaces stone; iron shields replace wooden |
| **Real-time map battles** | — | Deferred | Abstract `resolveDefenseRatio` / `launchRaidOnRival` — no tactical combat (post-0.5.0) |

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

**Out of scope:** tactical battle screen; outgoing counter-raid march spectacle (incoming march = warning only); counter-raid militia sprites → v0.5.0 P1.

**Endorsement:** 7/10 would recommend to friends (eco/growth caveats); 3/10 wanted eco copy or mid-game goals first.

Per-session notes (10 testers) were archived in git history when `app/docs/PLAYTEST_BETA_10_USERS.md` was merged here (commit July 2026).

---

## Audio credits

Wilderfolk uses royalty-free music and sound effects from [OpenGameArt.org](https://opengameart.org). Files live under `app/public/audio/`. Track paths are defined in `src/audio/tracks.ts`.

If a sample fails to load, the game falls back to procedural Web Audio tones (`src/audio/introMusic.ts`, `src/audio/backgroundMusic.ts`).

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