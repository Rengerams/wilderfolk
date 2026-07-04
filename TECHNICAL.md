# Wilderfolk — Technical README

**Early Alpha · v0.4.2 shipped** · React + TypeScript + Vite + Canvas 2D

Developer-facing overview of the playtest build.

| Doc | For |
|-----|-----|
| [app/README.md](app/README.md) | Players |
| [ROADMAP.md](ROADMAP.md) | Plan & half-done registry |
| [ROADMAP_0.4.3.md](ROADMAP_0.4.3.md) | v0.4.3 — scale & perf Phase 1 |
| [ROADMAP_0.4.4.md](ROADMAP_0.4.4.md) | v0.4.4 — perf Phase 2 + App tab split |
| [SESSION_SUMMARY.md](SESSION_SUMMARY.md) | What shipped, when |
| [app/CHANGELOG.md](app/CHANGELOG.md) | Detailed change log |

---

## Repository layout

```
wilderfolk/
├── package.json          # Root scripts → delegates to app/
├── README.md             # Short landing page
├── TECHNICAL.md          # This file
├── ROADMAP.md            # Release plan + backlog
├── SESSION_SUMMARY.md    # Consolidated dev log
└── app/
    ├── CHANGELOG.md      # Feature-level change log
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
| `RoadmapPanel.tsx` | In-game read-only roadmap (`roadmapContent.ts` — v0.4.2 shipped, targets v0.4.3) |
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

**Gaps (v0.4.2):** player militia march on counter-raid; real-time tactical battles deferred post-0.4.2. See [app/TODO.md](app/TODO.md#frontier-combat--polish--gaps).

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
| `ROADMAP_TARGET_VERSION` | `roadmapContent.ts` | `'0.4.3'` |
| `package.json` version | root + app | `0.4.2` |
| `COMPATIBLE_SAVE_VERSIONS` | `saveLoad.ts` | `['2.0', '2.1', '2.2', '0.4', '0.4.1', '0.4.2']` |

---

## Performance

**Shipped (v0.4.2):** off-screen sim throttles, per-tick `entityById` / `buildingById`, wildlife `byType` loop, `wildlifeCounts`, UI memoization. See [app/CHANGELOG.md](app/CHANGELOG.md) `[0.4.2]` → Performance.

**Benchmark:** `cd app && npm run simulate:30min` — env `SIM_MINUTES` (default 1200 ≈ 30 game-min), `PERF_SAMPLE_EVERY` (default 120). July 2026 sanity run (72k ticks, ~8 game years, ~557 entities): avg **1.81 ms/tick**, p50 **1.30 ms**, p95 **4.83 ms**, max **105 ms**. Informal budget: p95 &lt; 16 ms/tick @ ~700 alive entities.

**Future phases** (version + finish target) — full table in [app/TODO.md](app/TODO.md):

| Phase | Version | Finish by |
|-------|---------|-----------|
| 1 — spatial grid, compaction, render cache, benchmark gate | v0.4.3 | Sep 2026 |
| 2 — scan polish, render buckets, App tab split, pooling | v0.4.4 | Nov 2026 |
| 3 — Web Worker sim, adaptive catch-up, canvas layers | v0.5.0 | Q1 2027 |

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

## Bug fixes (July 4, 2026)

~40 fixes across four review rounds — full P0/P1/P2 table in [app/CHANGELOG.md](app/CHANGELOG.md) → **Bug fixes — comprehensive pass**. Summary in [app/TODO.md](app/TODO.md) and [SESSION_SUMMARY.md](SESSION_SUMMARY.md).

Key areas: `App.tsx` (loop/map setup, raid/diplomacy UI), `groupEvents.ts` (visitors, refugees, diplomacy, trade), `gameEngine.ts` (year rollover, economy, challenges), `frontierCombat.ts`, `saveLoad.ts`, `stats.ts`, `militiaBalance.ts`, `moonHowler.ts`, `forge.ts`.

Verified: `npm run build`, `npm run lint` (0 errors), `npm run simulate`, `npm run simulate:30min`.

---

## Debugging

- **Help tab** — Moon Howler debug spawn (`spawnMoonHowlerDebug` in `gameEngine.ts`)
- **Guide tab** — alpha notice, full control reference
- Saves: browser DevTools → Application → Local Storage → key from `gameEngine.ts`

---

## License / contribution

Early alpha playtest — internal/friends testing. No public license stated in repo; treat as private until release.

<p align="center">
  <em>Questions about the code? Start with <code>gameEngine.ts</code> and <code>App.tsx</code>.</em>
</p>