# Changelog

## [Unreleased]

**Targeting v0.5.0** (end July 2026) — see [ROADMAP_0.5.0.md](ROADMAP_0.5.0.md).

### Planned (v0.5.0 P0)
- Spatial grid, dead-entity compaction, renderer cache reuse, settler count denorm, benchmark gate
- Incremental `entityById`, `buildingActions` scan cleanup, grass buckets, App tab split, pooling
- Web Worker `gameTick`, OffscreenCanvas terrain/entity layers
- **Big bug checkup** — full-code audit after perf refactors (frontier, save, raids, forge, eco, UI)
- **Logical invariant checks** — entity lifecycle, maps consistency, migration `0.4.2`→`0.5.0`, peace vs raids
- **20-year simulation gatekeeper** — `npm run simulate:20year` (town profile) must PASS before v0.5 tag
- **Simulation battery** — `simulate`, `simulate:30min` (all profiles), `simulate:20year`, `simulate:10year` (regression), `balance:militia`; exit codes on fail
- `GAME_VERSION` **0.5.0** + save migration

### Planned (v0.5.0 P1)
- Counter-raid militia march visuals, large-map playtests, reputation arc UI
- Footstep SFX, one visitor quest chain, `npm run benchmark:gate`

## [0.4.2] - 2026-07-05

**Early Alpha v0.4.2** — 6-tab UI, Blacksmith forge, walls/towers/barracks, frontier raid prep UX, 10-year balance pass, 10-user beta playtest. `GAME_VERSION` and save format bumped; `0.4.1` saves migrate on load.

### Ship checklist (closed)
- [x] 10-year balance pass — town PASS 2026-07-04 (`npm run simulate:10year`, 9/9 gates)
- [x] Spear / militia balance review (`militiaBalance.ts`, `balance:militia`)
- [x] External playtests — 10 sessions ([TECHNICAL.md](TECHNICAL.md#playtest-report))
- [x] `GAME_VERSION` **0.4.2** + `COMPATIBLE_SAVE_VERSIONS` migration
- [x] Docs + in-game Roadmap sync

### Beta playtest follow-up (July 5, 2026)
- **Raid prep copy** — raids test preparation, not a battle screen (`RAID_PREPARATION_HINT`, Frontier readiness card, README)
- **Eco breakdown** — Nature tab “Why this score” (`ecoBreakdown.ts`)
- **Population growth report** — Village tab cap/food/rep messaging (`populationGrowth.ts`)
- **Rival labels** — “Distant camp” when on-map pop is 0 (`rivalDisplay.ts`)
- **Juice toggle** — Game menu ✨ Juice on/off (confetti, camera nudge, night glow)
- **Chronicle / combat log** — death filter hints; larger combat log text

### UI / UX overhaul (settlement-sim patterns)

Inspired by **RimWorld** (priority alerts, contextual inspector), **Banished** (bottom build hotbar), and **Frostpunk** (resource urgency). Goal: lower cognitive load, faster routing to urgent issues, map stays visible while building.

#### Added
- **`AlertBar`** — clickable priority strip under header (raids, diplomacy, low food, shelter warning, trade ready, active challenge); capped at 4 alerts (`priorityAlerts.ts`, `AlertBar.tsx`).
- **`BuildHotbar`** — Banished-style bottom map strip: House, Farm, Lumber Mill, Quarry, Well, Road with hotkey badges (`BuildHotbar.tsx`).
- **`GameMenu`** — ☰ header menu for save, load, auto-save, audio, reset (`GameMenu.tsx`).
- **`FrontierPanel`** — visitors, rivals, raids moved out of overcrowded Village tab (`FrontierPanel.tsx`).
- **`ChallengesPanel`** — daily challenges under Progress → Goals (`ChallengesPanel.tsx`).
- **`CollapsibleSection`** — reusable accordion for dense sidebar panels (`CollapsibleSection.tsx`).
- **Tab hotkeys** — `V` Village · `F` Frontier · `N` Nature · `P` Progress · `L` Log · `M` More.
- **Focus hint actions** — `Go →` buttons on key hints (open Goals, Frontier, Trade, Research, build house/farm) (`focusHints.ts`, `FocusPanel.tsx`).
- **Progress subnav badges** — amber dot when research active; cyan count when trade routes are ready to establish.
- **Frontier tab badge** — count of pending raids + diplomacy events on sidebar tab.

#### Changed
- **Sidebar tabs** — 8 → **6**: Village, Frontier, Nature, Progress (Research / Trade / Goals sub-tabs), Log, More (Guide / Roadmap sub-tabs).
- **Inspector** — collapsible; auto-expands when you click the map; slimmer when collapsed.
- **Header** — save/audio/reset moved into ☰ menu; food badge **pulses** when critically low.
- **Village tab** — decluttered: focus hints, population, leadership, armament only (frontier/diplomacy → Frontier; challenges → Progress → Goals).
- **Collapsed build rail** — duplicate quick-build buttons removed; bottom hotbar handles common placement; collapsed left rail = grid toggle, cancel (when placing), expand full catalog (`B`).
- **Right sidebar** — widened to `22rem` for readability.
- **In-game Guide** — Interface Overview and Controls updated for new layout, alert strip, hotbar, and tab hotkeys.

#### Blacksmith forge / visible crafting queue
- **`villageForge` state** — iron spears & shields require Defense research **and** a staffed Blacksmith forge run (`forge.ts`).
- **Forge orders** — Iron Spears (35🪵 25🪨 40💰) · Iron Shields (40🪵 30🪨 45💰); ~6 in-game days with staffed smith; progress bar + map float text.
- **`BlacksmithForgePanel`** — queue orders in Blacksmith inspector; armament checklist shows forge %.
- **Save migration** — existing saves with iron tech + Blacksmith keep forged status; new games must forge.
- **Combat** — `hasIronSpears` / `hasIronShields` now require `villageForge.spearsReady` / `shieldsReady`.
- **Forge UX polish** — `AlertBar` + focus hints jump to Blacksmith (`focus_building`); “Forge paused” when unstaffed; research complete notification says **queue forge** (not “armament upgraded”); Armament checklist **Open Blacksmith →** buttons; Defense/Iron copy updated.

#### UX polish (first-priority follow-up)
- **Quick Start tutorial** — 5 steps: bottom hotbar, alerts, tab hotkeys, `?` shortcuts overlay
- **Header ⭐ reputation badge** — clickable tooltip; opens Progress → Trade
- **Focus hints** — **Go →** on challenges, victory paths, visitors, rivals, elections, armament, research
- **Progress tab badge** — trade-ready count or research dot on main sidebar tab
- **Frontier raid button** — `🏹 Raid` on each rival card in Frontier tab (`canLaunchRaidOnRival`)
- **Pay-off vs counter-raid hint** — combat preview when tribute &lt; march provisions
- **Roads + armament copy** — Infra category hint in build catalog; armament explainer in Village tab
- **`?` keyboard overlay** — full shortcut reference (ESC to close)

#### Performance (simulation + UI)
- **Duplicate work removed** — `byType` built once per tick; entity array compacted in one pass (no triple `.filter()`).
- **Off-screen throttling** — humans every 8 ticks; wildlife AI every 8 ticks; grass growth/repro every 4 ticks off-screen. Viewport entities still run full sim every tick (`OFFSCREEN_HUMAN_THROTTLE`, `OFFSCREEN_WILDLIFE_THROTTLE`, `OFFSCREEN_GRASS_THROTTLE`).
- **O(1) lookups** — per-tick `entityById` and `buildingById` maps for hunt targets, prison, tamed-owner resolution.
- **Wildlife simulation** — `tickWildlife` iterates `byType` buckets instead of all `state.entities`; predator list hoisted once per tick for flee logic.
- **Denormalized counts** — `world.wildlifeCounts` updated each tick; Nature tab reads counts without scanning entities (`entityCounts.ts`).
- **React UI** — single-pass `villageStats`; narrowed `priorityAlerts` memo deps; `React.memo` on `WildlifeBar`, `StatBadge`, `FrontierPanel`, `ChallengesPanel`.
- **Headless benchmark** — `simulate:30min` logs avg/p50/p95/max ms per tick + entity samples (`SIM_MINUTES`, `PERF_SAMPLE_EVERY` env vars).
- **Module fix** — `combatTech.ts` extracts `COMBAT_TECH` to break forge ↔ combat circular import (headless sim runner).
- **Event log unchanged** — full chronicle kept in saves (no cap).

#### Technical (new / touched files)
- `app/src/game/priorityAlerts.ts` — alert derivation + click routing actions
- `app/src/components/AlertBar.tsx`, `BuildHotbar.tsx`, `GameMenu.tsx`, `FrontierPanel.tsx`, `ChallengesPanel.tsx`, `CollapsibleSection.tsx`
- `app/src/App.tsx`, `app/src/App.css` — shell wiring, sidebar tab grid, progress subnav styles
- `app/src/game/focusHints.ts`, `app/src/game/FocusPanel.tsx` — actionable hints
- `app/src/game/frontierCombat.ts` — `canLaunchRaidOnRival()`
- `app/src/game/entityCounts.ts`, `app/src/game/combatTech.ts` — wildlife counts helper; combat tech constants
- `app/src/game/gameEngine.ts`, `app/src/game/lifeSimulation.ts` — tick perf (maps, throttles, wildlife loop)
- `app/scripts/simulate-30min.ts` — perf metrics output
- `app/README.md`, `TECHNICAL.md`, `roadmapContent.ts` — player + dev docs

#### Future performance optimizations (not yet implemented)

| Phase | Version | Finish by |
|-------|---------|-----------|
| All open perf + UI + architecture | **v0.5.0** | End July 2026 |

- **v0.5.0 (consolidated):** spatial grid, compaction, benchmark gate, incremental maps, `buildingActions` cleanup, grass buckets, App tab split, pooling, Web Worker `gameTick`, OffscreenCanvas layers — see [ROADMAP_0.5.0.md](ROADMAP_0.5.0.md).

#### Frontier raid polish
- **Distance-scaled raid deadline** — incoming raids get **2–6 days** to respond based on camp distance (`expiresAtTick`, `marchDistanceTiles` on `RaidEvent`).
- **War-band march speed** — rival settlers march slower from farther camps (`lifeSimulation.ts`).
- **UI** — banner, alerts, Frontier/Village tabs show `formatRaidDeadline`; save migration backfills old raids.

#### Fixed / hygiene (July 2026)
- **Lint** — removed unused `countByType` in `simulate-30min.ts`; inspector auto-expand moved from `useEffect` into map selection handlers (`focusCampOnMap`, `handleCanvasClick`); `IntroScreen` `useRef` init — `npm run lint` → **0 errors** (3 pre-existing hook warnings in `App.tsx`).
- **Sanity check** — `npm run build` pass; headless 72k-tick sim (~8 game years, ~557 entities): avg **1.81 ms/tick**, p95 **4.83 ms/tick**; `simulate:30min` pass; `/check-work` PASS (July 4, 2026).
- **Docs sync** — all project `*.md` files + `roadmapContent.ts` aligned with v0.4.2 status (July 4, 2026).

#### P1 defense & combat log (July 2026)
- **Defense buildings** — Wall, Wall Corner, Wall Gate (+8 barricade/segment, cap +72), Watchtower (+15), Barracks (manual Guards, +12 militia each); unlocked via Fortification / Stone Spears research.
- **Guard patrols** — staffed Barracks guards orbit the village core during work hours; 🪖 icon on map.
- **Combat log panel** — Log tab **Combat** sub-tab with raid stats and .txt/.json/.csv export.
- **Raid map overlay** — dashed red march lines from rival camp to village when raids are pending.
- **Sprites** — `barracks`, `watchtower`, `wall_straight`, `wall_corner`, `wall_gate` processed to RGBA.
- **Spear tiers** — combat preview breakdown aligned with militia math: iron replaces stone (not stacked).

#### Juice pass (July 2026)
- **Night glow** — warm windows + chimney ember/smoke on houses/mansions when residents are home; staffed Church/Blacksmith/Hospital get door glow.
- **Build complete** — confetti burst (stars/sparkles), `✨ Built!` float text, sprite scale pop, screen shake.
- **Camera nudge** — clicking settlers/buildings gently pans the camera toward them (28% lerp).

#### Road rotation (July 2026)
- **R key** while placing rotates Road, Wall, and Wall Gate horizontal ↔ vertical.

#### Intro screen refine (July 2026)
- **`IntroScreen.tsx`** — ~20s unhurried timeline (aurora → logo → title → subtitle → hook → food chain → ready).
- **Skip** — click or press any key after the logo appears to jump to village setup.
- **Progress bar** — subtle fill along the bottom during the opening beat.
- **No hidden pops** — sections fade in on schedule instead of toggling `hidden` mid-animation.
- **`App.css`** — slower intro keyframes (`intro-*` classes) for logo float, chain reveal, aurora drift.

#### Spear / militia balance (July 2026)
- **`militiaBalance.ts`** — single source for militia & barricade strength; tuned constants (`MILITIA_BALANCE`).
- **Iron replaces stone** spears (×1.52, not stacked on ×1.3).
- **Iron replaces wooden** shields (+9/adult, not +9+4).
- **Barracks guards** — +14 per staffed guard (was +12).
- **Barricade fix** — `respondToRaidEvent` barricade now uses `getBarricadeStrength` (walls/towers were missing in resolve).
- **Combat preview** — armament label, tier hint, breakdown matches resolve math.
- **`npm run balance:militia`** — scenario table for playtest review.

#### Bug fixes — comprehensive pass (July 4, 2026)

Four code-review rounds (~40 fixes). Verified: `npm run build`, `npm run lint` (0 errors), `npm run simulate`, `npm run simulate:30min`, `/check-work` PASS.

##### P0 — Critical
| Fix | Files | What was wrong |
|-----|-------|----------------|
| Map setup / GameLoop desync | `App.tsx` | New game from map setup never called `setSession`; sim ran throwaway world while setup open |
| Faction human ages | `groupEvents.ts` | Visitors/rivals spawned at ~7k–14k “days”; died instantly vs 400-day lifespan cap |
| Welcomed refugees killed on departure | `groupEvents.ts` | Admitted settlers stayed in `group.entityIds`; camp leave set `alive = false` for all IDs |
| Eco Master 24× per year | `gameEngine.ts` | `ecoHealthYearsAbove80` incremented every tick of calendar day 0 (~24×/year) |

##### P1 — High
| Fix | Files | What was wrong |
|-----|-------|----------------|
| Off-screen double aging | `lifeSimulation.ts` | Inactive humans aged twice per calendar day |
| Winter heating | `gameEngine.ts` | Wood cost counted visitors/rivals, not player settlers only |
| Prison demolish | `buildingActions.ts` | Demolishing prison left `prisonBuildingId` / prisoners stuck |
| Challenge timing | `gameEngine.ts`, `challengeProgress.ts` | `eco_master` / year challenges evaluated before year rollover + eco streak update |
| `growing_village` UI | `challengeProgress.ts` | Progress showed year only, not building requirement |
| `great_city` challenge | `gameTypes.ts`, `saveLoad.ts` | Missing `targetBuildings: 20` — completed at 100 pop alone |
| Diplomacy event loss | `groupEvents.ts` | Failed choices (insufficient resources) still removed pending event |
| Peace vs active raids | `groupEvents.ts`, `frontierCombat.ts` | Peace treaty did not cancel in-flight `pendingRaidEvents` |
| Rival raid strength | `groupEvents.ts` | `rival.population` never decremented on deaths; strength stayed inflated |
| Workshop at gold cap | `gameEngine.ts` | Consumed inputs when gold storage full |
| Trade at storage cap | `economy.ts` | Deducted exports when receives added 0 |
| Raid deadline lag | `gameEngine.ts` | `tickPendingRaidEvents` only on calendar-day ticks (up to ~24 tick delay) |
| Save year desync | `saveLoad.ts` | `year` from save could disagree with `tick`-derived calendar |
| Save migrations | `saveLoad.ts` | Missing defaults for `challenges`, `yearlyStats`, `lifetimeStats` on old saves |
| Refugee food at cap | `groupEvents.ts`, `App.tsx` | Welcome charged 40🍖 even when nobody could join |

##### P2 — Medium (UI, stats, edge cases)
| Fix | Files | What was wrong |
|-----|-------|----------------|
| Placement footprint | `buildingActions.ts`, `placementUtils.ts` | Center could be on-map while footprint extended off-map |
| Build ghost stale | `App.tsx` | Placement preview used stale React `world` instead of loop world |
| Raid defend no-op | `App.tsx`, `frontierCombat.ts` | Defend/payoff/barricade failed silently; buttons now disabled + float text |
| Guard bonus constant | `defenseStructures.ts` | Hardcoded ×12 vs `militiaBalance` ×14 |
| Rival diplomacy silent | `groupEvents.ts` | Gift/pact/militia/peace returned unchanged state with no feedback |
| Diplomacy banner UX | `groupEvents.ts`, `App.tsx` | `getDiplomacyChoiceEligibility()` — disable + tooltips in banner and rival inspector |
| Visitor trade silent | `groupEvents.ts` | Insufficient gold/food returned with no float text |
| Victory Great City buildings | `victory.ts` | Counted rival camp structures toward 50-building leg |
| Eco health penalty | `gameEngine.ts` | Rival/incomplete buildings lowered player eco score |
| Prison ghost workers | `lifeSimulation.ts`, `gameEngine.ts` | Imprisoned settlers kept job assignments; still counted as staffed |
| Forge queue silent | `forge.ts` | Blocked queue returned state with no notification |
| Forge production tick | `forge.ts` | Local midnight tick vs shared `isProductionTick` (7am) |
| Moon howler hunt leak | `moonHowler.ts`, `gameTypes.ts` | `huntTargetId` / `combatTicks` not cleared on revert |
| Age display | `worldGen.ts` | `getAgeInYears` used wrong birth-year math; pioneers now age 30/28 |
| Leadership experience | `villageLeadership.ts` | Day-based age treated as years; all adults maxed by day 60 |
| Yearly stats humans | `stats.ts` | Population history counted visitors/rivals |
| Yearly births stat | `stats.ts` | Broken ternary; now `birthYear === state.year` |
| `disastersSurvived` stat | `stats.ts`, `worldEvents.ts` | Was set to `state.year`, not disaster count |
| FrontierPanel | `FrontierPanel.tsx` | Fragile non-null assertion on pending raid lookup |
| IntroScreen lint | `IntroScreen.tsx` | `useRef(Date.now())` → init in `useEffect` |

##### Intentional (not changed)
- **School juvenile `age++`** at staffed school — accelerates childhood; not the off-screen duplicate bug.

## [0.4.1] - 2026-07-04

**Early Alpha v0.4.1** — tribes, raids, diplomacy, four victory paths, village leadership. `GAME_VERSION` and save format bumped; `0.4` saves migrate on load.

### Highlights
- Tribe diplomacy v2, frontier raids + combat preview, peace treaties, visitor leader talk
- Trade Empire + Harmony victories active; Silkmarket trade route
- Village head merit elections (founding, decennial, succession)
- In-game Roadmap tab, Nature grazing warning, Prison + Guard, chronicle export

## [0.4.1] - Village leadership & merit elections (2026-07-04)

### Added
- **Village head elections** (`villageLeadership.ts`) — merit score from job skills (×2), experience, Town Hall service (+15), married (+5); ties break on age, then entity id.
- **Founding election** at game start; **decennial elections** every 10 years (years 10, 20, …); **succession** on leader death or imprisonment.
- **State fields** — `villageLeaderId`, `leaderSinceYear`, `lastElectionYear` on `WorldState`; save migration in `saveLoad.ts`.
- **Village Leadership panel** — Village tab shows 👑 leader, years until next election, ranked candidates (`VillageLeadershipPanel.tsx`).
- **Map & UI** — 👑 on leader in header, map icon, Population panel, and entity inspector; focus hints mention leadership.

### Technical
- `tickDecennialElection` / `trySuccessionElection` in `gameEngine.ts`; `validateVillageLeaderOnLoad` on load.

## [0.4.1] - Peace treaties, visitor leader talk & four victory paths (2026-07-04)

### Added
- **Peace treaties** — `signPeaceTreaty()` halts raids for 60 days (30💰 + 20🍖); `peaceTreatyDays` on rivals; `peace_treaty` diplomacy event choices; 🕊️ button in rival inspector; raids blocked while at peace (`isRivalAtPeace`, `frontierCombat.ts`).
- **Visitor leader talk** — `talkToVisitorLeader()` per caravan kind (traders, pilgrims, scholars, hunters, nomads, performers, refugees); `leaderTalked` on `VisitorGroup`; UI in visitor camp panel (`getVisitorLeaderTalkMeta`).
- **Trade Empire + Harmony victories** — moved to `ACTIVE_VICTORY_PATHS` (4 active paths in Goals tab); 5th trade route **Silkmarket** in `economy.ts`; `ensureFullTradeRoutes()` on load.

### Changed
- **Goals tab** — Eco-Utopia, Great City, Trade Empire, and Harmony all trackable; `COMING_SOON_VICTORY_PATHS` empty.

## [0.4.1] - Frontier raid balance & combat preview (2026-07-04)

### Added
- **Combat preview panel** (`CombatPreviewPanel.tsx`, `getCombatPreview()`) — militia breakdown, rival strength, defend/barricade/pay-off forecasts, and outgoing raid forecast in raid banner, Village tab, and rival inspector.
- **Distance to rival camps** — tiles from village anchor (Town Hall → House → settlers); shown in preview, Village tab rival list, incoming raid banner, and rival inspector.
- **Distance-scaled raid provisions** — `getOutgoingRaidFoodCost()` (22–50🍖 by march distance); raid button and preview show exact cost per rival.
- **Home-turf defense** — `getRivalDefenseStrength()` (+25% when you raid their camp); outgoing thresholds **≥135%** full spoils, **≥100%** meager, below = repelled (+15🍖 extra on fail).
- **Split ratio hints** — `DEFENSE_RATIO_HINT` vs `COUNTER_RAID_RATIO_HINT` in preview (no longer one misleading footer).

### Changed
- **Incoming vs outgoing clarity** — UI labels: “If they raid your village” vs “If you raid their camp”; pay-off tribute amount shown in preview; incoming banner does not show counter-raid section.
- **Counter-raid forecast gated** — preview shows outcome only when spears, 8+ pop, enough food, and non-friendly relations; otherwise a specific blocker message.
- **Stable village anchor** — `getPlayerCampCenter()` prefers Town Hall / House over wandering settler centroid (shared with `groupEvents.ts` spawn distance).
- **Focus hint** — counter-raid note mentions distance-scaled food (not flat 30🍖).

### Deferred to v0.4.2 (see [ROADMAP_0.5.0.md](ROADMAP_0.5.0.md))
- Village tab raid shortcut, distance-based raid deadline/march, spear tier stacking review, dedicated combat log panel, walls/guards, Blacksmith forge queue.

## [0.4.1] - Frontier raids & militia combat (2026-07-04)

### Added
- **Incoming raids** from tense/competitive rivals (`maybeQueueRaid` in `frontierCombat.ts`) — red banner + rival inspector with 3-day deadline.
- **Defend choices**: militia fight (stone/iron spears), barricade (20 wood + 10 stone), or pay food tribute.
- **Combat resolution** — militia vs raid strength (population, spears, shields); outcomes from decisive victory to defeat with loot, building damage, casualties.
- **Counter-raid** — `launchRaidOnRival()` from rival inspector (provisions + spears + 8+ pop); seize supplies or risk repelled raid + counter-attack.
- **Visible war-bands** — rival settlers march toward your village while a raid is pending; combat flashes on map.
- **Combat chronicle** — new `combat` event-log type + Log tab filter.

### Technical
- `pendingRaidEvents` on `WorldState`; `raidCooldownDays` on `RivalSettlement`.
- `frontierCombat.ts` — strength helpers, raid tick/expiry, response handlers.

## [0.4.1] - Docs: TODO + roadmap sync (2026-07-04)

### Added
- **`ROADMAP_0.5.0.md`** — open work checklist (frontier raid polish, perf, architecture).
- **In-game roadmap** — `ROADMAP_OPEN_FIXES` section in Roadmap tab (“Still to fix / implement”).

### Changed
- **`CHANGELOG.md`**, **`ROADMAP.md`**, **`roadmapContent.ts`**, **`TECHNICAL.md`** — frontier raids MVP + combat preview marked shipped; remaining combat/craft/polish items listed.

## [0.4.1] - In-game roadmap tab (2026-07-04)

### Added
- **Roadmap tab** — eighth sidebar tab with read-only v0.4.1 slice: shipped features, open/partial P0–P2 items, next dev priorities, deferred backlog (`RoadmapPanel.tsx`, `roadmapContent.ts`).
- **Guide → Roadmap** shortcut button at top of Guide tab.

### Technical
- `roadmapContent.ts` mirrors `ROADMAP.md` priorities; update when shipping v0.4.1 items.

## [0.4.1] - Tribe interaction v2 + Nature grazing warning (2026-07-04)

v0.4.1 partial — deeper frontier diplomacy and ecosystem coaching.

### Added
- **Rival diplomacy event cards**: `DiplomacyEvent` queue on `WorldState.pendingDiplomacyEvents` — tribute demands, border disputes, and alliance offers spawned from `tickRivalSettlements()`. Players respond via top-of-map banner (2–3 choices) or rival inspector panel (`respondToDiplomacyEvent()` in `groupEvents.ts`).
- **Rival map diplomacy panel**: Click a rival **camp marker** or **rival building** on the map to open the inspector with gifts, trade pact, militia, pending events, and **Ping camp on map** (camera focus + pulsing ring).
- **Visitor camp diplomacy**: Click visitor **camp markers** for trade UI (`tradeWithVisitors()` — buy food/wood, sell food) on traders, nomads, and hunters.
- **Refugee negotiate screen**: Refugee caravans no longer auto-join; player chooses welcome (40🍖), screen (20🍖), or turn away (`negotiateRefugees()`). Visitor entity inspector links to camp panel.
- **Camp hit-testing**: `hitTestCamp()` in `groupEvents.ts`; canvas click handler in `App.tsx` focuses camera and sets `highlightedCampKey` / `selectedCampKey` on `ViewState`.
- **Nature tab grazing pressure warning**: `ecosystemPressure.ts` computes deer grazing demand vs grass recovery (season/weather aware). Amber/rose alert card when pressure is **caution** or **critical**, with actionable advice (wolves, overgrazing, drought/winter).

### Changed
- **VisitorGroup** fields: `tradesCompleted`, `refugeeResolved` (save/load migrated in `saveLoad.ts`).
- **Frontier neighbors** (Village tab): Focus camp buttons; diplomacy hints when events are pending.
- **Guide tab**: Documents map-click diplomacy and visitor trade/refugee negotiate (no longer Village-tab-only).
- **Active event banner**: Yields to pending diplomacy cards when rivals need a response.

### Technical
- New types in `gameTypes.ts`: `DiplomacyEvent`, `DiplomacyChoice`, `DiplomacyEventKind`; `pendingDiplomacyEvents` on `WorldState`.
- `viewState.ts`: `highlightedCampKey`, `selectedCampKey` for camp selection and map ping.
- `renderSnapshot.ts` / `renderer.ts`: Pulsing highlight ring on focused rival/visitor camps.
- `gameEngine.ts` re-exports: `respondToDiplomacyEvent`, `tradeWithVisitors`, `negotiateRefugees`, `hitTestCamp`, `getGrazingPressureReport`.
- `worldGen.ts` initializes `pendingDiplomacyEvents: []`.
- Pending diplomacy events expire after 14 in-game days if unanswered (`tickPendingDiplomacyEvents`).

## [Unreleased] - Event log overhaul + Prison building + terrain fix (2026-06-25)

### Added
- **Event log no longer capped**: `eventLog.ts` removed the 500-entry storage cap. Saves keep every event forever.
- **In-game log display stays capped at 500**: `EventLogPanel.tsx` renders only the latest 500 events for performance, but shows the total stored count.
- **Raw data exports**: `eventLogExport.ts` adds `.json` and `.csv` exporters. All export formats include the full event history.
- **Prison building**: New `BuildingType.Prison` in Community tab, unlocked by Architecture research, using the custom `app/public/sprites/prison.png` sprite.
- **Guard job**: `JobType.Guard` assigned manually to staff the Prison (manual-staff building like the Church).
- **Arrest system**: When an affair is `caught`, staffed Prisons have a chance to arrest both the cheater and paramour.
- **Prisoner state**: `prisonBuildingId` and `prisonerUntilTick` on entities; prisoners are held 2.5–6 in-game days and released automatically.
- **Prison UI**: Prison panel lists prisoners and days remaining; entity panel shows imprisonment status; population badge/overview add a "jailed" count.
- **`isImprisoned()` helper** in `dayCycle.ts` to exclude prisoners from work assignment and population stats.

### Changed
- `App.tsx` build categories include Prison; population stats exclude prisoners from working/idle counts.
- `gameEngine.ts` work/builder assignment filters reject imprisoned settlers.
- `terrainGen.ts` preset modifiers widened so Verdant / Mountainous / Coastal / Arid / Harsh maps look visibly different.

### Fixed
- **Terrain rendering "mangled" maps**: `renderer.ts` `buildTerrainCache()` was sizing the cache to world pixel dimensions but drawing one pixel per tile, stretching the terrain 10×. Cache is now tile-sized (width/10 × height/10) so each tile renders at the correct scale.

## [Unreleased] - Audio credits (2026-06-24)

### Added
- **Audio credits** in [TECHNICAL.md](TECHNICAL.md#audio-credits): OpenGameArt sources, authors, and licenses for all music and ambient SFX.

## [Unreleased] - Terrain rendering restored (2026-06-24)

### Fixed
- **Flat green ground removed:** Maps now draw real terrain (water, beach, forest, hills, etc.) instead of the temporary solid-green backdrop.

### Changed
- Build-zone overlay: water no longer double-highlighted (visible on terrain); red tint only for non-obvious blockers (cliffs, river banks, snow).

## [Unreleased] - Coastal build fix (2026-06-24)

### Fixed
- **Coastal maps unbuildable:** Preset was mostly water/rivers with no contiguous dry land for a House footprint. Coastal terrain toned down slightly; maps now carve a grassland camp clearing at the start. Pioneers spawn on buildable ground.

## [Unreleased] - Code cleanup (2026-06-24)

Light hygiene pass — no intended gameplay changes. Build verified (`npm run build`).

### Added
- **`eventLog.ts`**: Shared `EVENT_LOG_MAX`, `logEvent()`, and `syncEventLogIdFromState()` for monotonic event-log ids after save load.

### Changed
- **`groupEvents.ts`**: Removed duplicate `pushLog` / `logSeq`; visitor and rival events now use `logEvent` from `eventLog.ts`.
- **`gameEngine.ts`**: Event-log helpers moved to `eventLog.ts` (re-exported for compatibility). Save load calls `syncEventLogIdFromState`. Re-exports `hasIronSpears`, `hasStoneSpears`, `hasCompletedBlacksmith` from `combat.ts`.
- **`victory.ts`**: Added `COMING_SOON_VICTORY_PATHS` alongside `ACTIVE_VICTORY_PATHS`.
- **`App.tsx`**: Imports victory-path and combat helpers from consolidated modules (`victory.ts`, `gameEngine.ts`).

### Deferred (not touched)
- Splitting `gameEngine.ts` (~3,700 lines) — larger refactor.
- Unifying `pushNews` (`groupEvents`) vs `addBigNews` (`gameEngine`).
- Removing unused shadcn `components/ui/*` scaffold.
- `soundEngine.ts` deprecated shim — kept for backward compat (no active imports).

## [Unreleased] - Building Background Colors Overhaul

### Added
- **Building foundation pads**: Every completed building now renders a category-colored foundation pad beneath its sprite, making districts readable on the terrain.
- **Per-building pad shapes**: Foundations now match the building's role:
  - `rect` for production, resources, and food buildings (Farm, Lumber Mill, Mine, etc.)
  - `round` for housing and community buildings (House, Mansion, School, Church, etc.)
  - `circle` for small standalone structures (Well)
  - `road` for Roads
- **Category color assignments**: Each building type has its own `backgroundColor` based on its category (Housing, Food, Resources, Industry, Community, Infrastructure).
- **Season tinting**: Foundation pad colors shift subtly with the current season (greener in spring, warmer in summer/fall, cooler/desaturated in winter).
- **Border outlines**: Each pad has a darker category-colored border for a foundation-like look.
- **Colorblind-friendly secondary cues**: Each building category uses a unique dashed-border pattern so the pad is identifiable even without relying on hue alone.
- **Hover highlighting**: Hovering over a building brightens its foundation pad and adds a soft white glow.
- **Category-colored selection**: The selection ring now uses the building's category color instead of a generic orange outline.
- **Road foundation strips**: Roads now render a subtle infrastructure-colored strip so road networks are visible from a distance.
- **Colored construction sites**: Buildings under construction show a faded category-colored pad with a clearer progress bar.
- **Colored build preview**: The placement ghost now shows the building's category-colored pad while keeping the green/red validity outline.
- **Minimap parity**: Buildings on the minimap are now rendered using their category background color instead of a single blue color.
- **Hover state tracking**: Added `hoveredBuilding` to `GameState` and wired mouse hover detection in the main canvas.

### Changed
- Reduced foundation pad opacity from 0.72 to 0.38 for completed buildings so sprites remain the focal point.
- Improved under-construction visuals with a category-tinted foundation and a clearer progress fill.
- Updated `BuildingConfig` interface to require `backgroundColor` and `padShape`.

### Technical
- Added color utility helpers in `renderer.ts`:
  - `hexToRgb` / `rgbToHex`
  - `darkerColor`
  - `applySeasonTint`
  - `categoryBorderDash`
  - `drawBuildingPad`
- Added `roundRect` helper for rounded foundation geometry.
- Updated `GameState` interface to include `hoveredBuilding`.
- Updated `initGame` and `loadGame` to initialize `hoveredBuilding: null`.

## [Unreleased] - Simulation Upgrade

### Added
- **Resource storage caps**: Wood, stone, and food now have maximum storage limits.
- **Storage buildings matter**: Barns, Silos, Stores, and Markets increase storage capacity.
- **Food spoilage**: Food decays over time, faster in summer and slower in winter. Silos reduce spoilage.
- **Terrain-based building efficiency**:
  - Farms and Greenhouses produce more on grassland, less on rocky/snow terrain.
  - Lumber Mills produce more in forests.
  - Mines and Quarries produce more on mountains and rocky hills.
  - Wells are more effective near water.
- **Adjacency bonuses**:
  - Farms near Barns get +35% yield.
  - Buildings near Roads get +15% efficiency.
  - Stores and Workshops near Markets get +25% gold production.
- **Wolf pack behavior**: Wolves near other wolves gain extended hunt range, faster movement, and shared energy from kills.
- **Production storage awareness**: Production buildings now display "storage full" warnings instead of wasting resources.

### Changed
- Resource header badges now show current / maximum storage and highlight when near capacity.
- Selected building panel now displays terrain efficiency, adjacency bonuses, and total efficiency percentage.

### Technical
- Added `storageMax` and `foodSpoilageRate` to `GameState`.
- Added helpers in `gameEngine.ts`:
  - `getTileAt`
  - `getTerrainEfficiencyMultiplier`
  - `getAdjacencyMultiplier`
  - `updateStorageCaps`
  - `addResource`
  - `applyFoodSpoilage`
- Exported `getTerrainEfficiencyMultiplier` and `getAdjacencyMultiplier` for UI use.

## [Unreleased] - Mystical Connections

### Added
- **New entity: Werewolf** — A cursed human that transforms under the full moon. Werewolves hunt deer, rabbits, and humans.
- **Werewolf taming** — Churches can soothe nearby werewolves, converting them back into humans with the surname "Moonborn".
- **New entity: Wildkin** — A rare half-human, half-deer hybrid born when a pregnant human lives close to deer. Wildkin graze on grass and farm food.
- **Big News banner** — Major events (werewolf transformations, taming, Wildkin births, and future epic events) now show a prominent dismissible banner at the top of the screen.
- Added Werewolf and Wildkin to the wildlife panel, entity selection panel, and minimap.

### Changed
- Updated food-chain info to include Werewolves and Wildkin.
- Wildlife bars now track Werewolves and Wildkin populations.

### Technical
- Added `Werewolf` and `Wildkin` to `EntityType` and `SPECIES_CONFIG`.
- Added `BigNewsItem` interface and `bigNews` array to `GameState`.
- Added `addBigNews` helper for major event announcements.
- Updated predator/prey and graze logic to include the new species.

## [Unreleased] - Taming, Visitors & Festivals

### Added
- **Animal taming** — Build a **Taming Post** and assign a settler to tame nearby wolves, foxes, deer, or rabbits.
- **Tamed animals follow their owner** and assist in hunting (wolves/foxes). Tamed animals are no longer hunted by villagers.
- **New building: Taming Post** — Community building that enables animal taming in its radius.
- **Visitor caravans** — Travelers from neighboring villages occasionally arrive with resource gifts and boost reputation.
- **Village festivals** — Random festivals (Harvest Festival, Moonlight Feast, etc.) boost production, courtship, and immigration for 20–40 days.
- Added `festival` state to `GameState`.

### Changed
- **Economic rebalance**:
  - Reduced human energy loss from 8.0 to 5.5 per tick (less food consumption).
  - Increased Farm output: 15 → 22 food per cycle.
  - Increased Greenhouse output: 12 → 18 food per cycle.
  - Increased Silo output: 5 → 8 food per cycle.
  - Increased Lumber Mill output: 8 → 12 wood per cycle.
  - Increased Quarry output: 5 → 8 stone per cycle.
  - Increased Mine output: 8 → 12 stone per cycle.
- Season/Year header now shows a 🎉 icon during festivals.
- Entity selection panel shows tamed status and a Tame button for eligible creatures.

### Technical
- Added `tamedBy` field to `Entity`.
- Added `tameEntity` action exported from `gameEngine.ts`.
- Added visitor and festival event logic to `gameTick`.
- Added `festival` to `initGame` and `loadGame` defaults.

### Fixed
- Reinstalled dependencies from a clean state to resolve the npm `Exit handler never called` issue.
- Verified full production build passes with `npm run build`.
