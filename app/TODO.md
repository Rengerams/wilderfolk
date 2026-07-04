# Wilderfolk — Open work (v0.5.0)

Living checklist for fixes and features **not yet done**.  
Shipped work → [CHANGELOG.md](CHANGELOG.md) · Priorities → [../ROADMAP.md](../ROADMAP.md) · Plan → [../ROADMAP_0.5.0.md](../ROADMAP_0.5.0.md) · In-game slice → `src/game/roadmapContent.ts`

*Last updated: July 5, 2026 · **v0.4.2 shipped** (`GAME_VERSION = 0.4.2`) · Next target **v0.5.0** (end July 2026)*

---

## v0.4.2 — ship checklist ✅ (closed 2026-07-05)

| # | Item | Priority | Status | Notes |
|---|------|----------|--------|-------|
| 1 | **Bump `GAME_VERSION` to `0.4.2`** + save migration | P0 | **Done** | `version.ts` `0.4.2`; `COMPATIBLE_SAVE_VERSIONS` includes `0.4.2`; load migration log for `0.4.1` |
| 2 | **10-year balance pass** | P0 | **Done** | **PASS** 2026-07-04 — town profile, 86400 ticks, 9/9 gates (`sim-10year-town-2026-07-04T21-23-57-948Z.txt`) |
| 3 | **External playtests (5–10 sessions)** | P0 | **Done** | [docs/PLAYTEST_BETA_10_USERS.md](docs/PLAYTEST_BETA_10_USERS.md) |
| 4 | **Spear / militia balance review** | P0 | **Done** | `militiaBalance.ts` · `npm run balance:militia` |
| 5 | **CHANGELOG + docs sync** on ship | P0 | **Done** | `[0.4.2]` in CHANGELOG; README, ROADMAP, `roadmapContent.ts` |
| 6 | **In-game Roadmap tab** | P0 | **Done** | `ROADMAP_TARGET_VERSION = '0.5.0'`; v0.4.2 slice under Shipped |

**Exit:** Tag `v0.4.2` · saves migrate · playtests signed off · balance pass documented.

---

## Shipped in v0.4.2 (in this build)

*Full notes → [CHANGELOG.md](CHANGELOG.md) `[0.4.2]`*

| Item | Status |
|------|--------|
| 6-tab sidebar + Progress/More sub-tabs | ✅ |
| Alert strip (`AlertBar` + `priorityAlerts`) | ✅ |
| 10-year balance pass |✅ |
| Map build hotbar + deduped collapsed left rail | ✅ |
| Collapsible inspector, GameMenu, Frontier/Challenges panels | ✅ |
| Tab hotkeys V/F/N/P/L/M, focus Go → actions | ✅ |
| Progress subnav badges, Frontier tab badge | ✅ |
| Guide + README + TECHNICAL docs updated | ✅ |
| Quick Start + ? shortcuts overlay | ✅ |
| Header ⭐ reputation badge (click → Trade) | ✅ |
| Focus Go → for challenges, visitors, rivals, elections | ✅ |
| Progress tab badge + Frontier raid button | ✅ |
| Pay-off vs counter-raid hint in combat preview | ✅ |
| Roads Infra hint + armament copy | ✅ |
| Blacksmith forge / visible crafting queue | ✅ |
| Simulation perf pass (entity maps, wildlife throttle, UI memo) | ✅ |
| Headless sim perf metrics (`simulate:30min`) | ✅ |
| Sanity check (build + 72k-tick sim + lint 0 errors) | ✅ |
| Lint hygiene (`countByType`, inspector `setState` in effect) | ✅ |
| Walls / Watchtowers / Barracks + guard patrols | ✅ |
| Combat log panel (Log → Combat sub-tab) | ✅ |
| Raid march lines on map | ✅ |
| Defense sprites (walls, tower, barracks) | ✅ |
| Road / wall / gate rotation (R while placing) | ✅ |
| Juice — night glow, build confetti, camera nudge | ✅ |
| Intro screen refine (~20s timeline, skip after logo) | ✅ |
| **Bug-fix pass (~40 fixes, 4 rounds)** | ✅ | See [CHANGELOG.md](CHANGELOG.md) → Bug fixes — comprehensive pass |

---

## Bug fixes — comprehensive pass (July 4, 2026) ✅

*Verified: build, lint (0 errors), 5-min + 30-min headless sim, `/check-work` PASS.*

| Area | Fixes |
|------|-------|
| **Session / loop** | Map setup `setSession`; loop paused during map setup |
| **Humans** | Faction ages; off-screen double aging; age display; pioneer ages; prison ghost workers |
| **Frontier** | Diplomacy event loss; peace cancels raids; rival pop sync; raid tick timing; silent raid/diplomacy/trade feedback; UI disables |
| **Economy** | Winter heating (player only); workshop/trade at storage cap |
| **Buildings** | Prison demolish; placement footprint; build ghost world; forge tick + notifications |
| **Challenges / victory** | `eco_master` timing; `growing_village` UI; `great_city` buildings; victory rival buildings |
| **Save / stats** | Year from tick; challenges/yearlyStats/lifetimeStats defaults; yearly pop filter; births; disastersSurvived |
| **Visitors** | Refugees not killed on departure; food not charged at pop cap |
| **Moon howler** | Hunt/combat state cleared on revert |
| **Eco** | Year rollover once; player-only building impact |

Full table → [CHANGELOG.md](CHANGELOG.md) `[Unreleased]` → Bug fixes.

---

## Frontier combat — polish & gaps

Player guide → [README.md](README.md#frontier-raids--militia) · Code → `frontierCombat.ts`, `defenseStructures.ts`, `CombatLogPanel.tsx`, `CombatPreviewPanel.tsx`

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
| **Weapon / status map icons** | Low | Partial | Settler badges: 🏹 hunt, 🛡️ shields, 🪖 guard, ⚔️ `combatTicks` ✅ · **Missing:** player militia march line/sprites on **outgoing** counter-raid → **v0.5.0 P1** |
| **Spear tier stacking** | — | Done | `militiaBalance.ts` — iron replaces stone; iron shields replace wooden |
| **Real-time map battles** | — | Deferred | Abstract `resolveDefenseRatio` / `launchRaidOnRival` — no tactical combat (post-0.4.2) |

---

## v0.4.2 — feature checklist (code in repo)

| Item | In repo | Shipped as v0.4.2 |
|------|---------|-------------------|
| Juice — night glow, build confetti, camera nudge | ✅ | ✅ |
| Road / wall / gate rotation (**R**) | ✅ | ✅ |
| Blacksmith forge queue | ✅ | ✅ |
| Walls / towers / barracks + guard patrols | ✅ | ✅ |
| Combat log, raid polish, 6-tab UI, intro | ✅ | ✅ |
| Header ⭐ → Trade | ✅ | ✅ |
| Perf throttles + entity maps | ✅ | ✅ |
| Perf at 500+ entities (spatial grid) | Partial | → **v0.5.0** P0 |

### Perf — version & finish targets

| Phase | Target version | Finish by | Goal |
|-------|----------------|-----------|------|
| **Shipped** | **v0.4.2** | July 2026 | Throttles, entity maps, UI memo, headless ms/tick metrics |
| **All open perf + UI + architecture** | **v0.5.0** | **End Jul 2026** | Spatial grid, compaction, benchmark gate, scan cleanup, App tab split, Worker, canvas layers |

*Former v0.4.3 / v0.4.4 schedules merged into **v0.5.0** — see [ROADMAP_0.5.0.md](../ROADMAP_0.5.0.md).*

**Informal budget (headless, ~700 alive entities):** p95 &lt; 16 ms/tick · avg &lt; 8 ms/tick. Gate in Phase 1.

**Event log:** uncapped in saves by design. Phase 3 may add append-only indexing *only if* save size becomes a problem — not a v0.4.x default.

### Perf — shipped (v0.4.2)

- Remove duplicate `byType` build per tick
- Wildlife iterates `byType` + off-screen AI throttle (8 ticks)
- Off-screen grass growth decimation (every 4 ticks)
- `entityById` / `buildingById` maps (O(1) lookups)
- Hoisted predator list for flee logic
- `world.wildlifeCounts` — no Nature-tab entity scans
- Single-pass `villageStats` + narrowed `priorityAlerts` deps
- `React.memo` on WildlifeBar, StatBadge, Frontier/Challenges panels
- `simulate:30min` reports ms/tick (avg/p50/p95/max)
- `combatTech.ts` — breaks forge ↔ combat circular import for headless sim

### v0.5.0 — open work (end July 2026)

Full plan → [../ROADMAP_0.5.0.md](../ROADMAP_0.5.0.md)

#### P0 — must ship

| Item | Hotspot |
|------|---------|
| Spatial grid for graze / hunt / flee / wolf pack | `lifeSimulation.ts` |
| Dead-entity compaction | `gameEngine.ts` |
| Renderer entity cache reuse | `renderer.ts` `updateCachedEntities()` |
| Denormalize settler working/idle counts | `WorldState`, `App.tsx` |
| Benchmark gate — 50 / 100 / 200 human profiles | `simulate-30min.ts` |
| Incremental `entityById` (birth/death only) | `gameEngine.ts` |
| `buildingActions.ts` entity scan cleanup | assign/recruit flows |
| `buildingById` for human go-home | `lifeSimulation.ts` |
| Grass render spatial buckets | `renderer.ts` `drawGrass` |
| Partner id map for relationship lines | `renderer.ts` |
| Particle / floating-text pooling | `gameEngine.ts` |
| App tab split + memo (Village / Nature / Progress) | `App.tsx` |
| Web Worker `gameTick` | `gameEngine.ts`, `gameLoop.ts` |
| OffscreenCanvas terrain vs entity layers | `renderer.ts` |
| `GAME_VERSION` **0.5.0** + save migration | `version.ts`, `saveLoad.ts` |
| **Big bug checkup** | Full audit after perf refactors — frontier, save, raids, forge, prison, visitors, eco, UI |
| **Logical invariant checks** | Entity maps, migration round-trip, peace vs raids, no ghost workers / orphaned state |
| **Headless simulation battery** | `simulate` · `simulate:30min` (village/town/city) · `simulate:10year` · `balance:militia` — all green |
| **Simulation regression gate** | Scripts exit non-zero on invariant fail; document in TECHNICAL.md |
| **Manual playtest matrix** | Large map, 10×, save/reload, raid/forge/peace/year-10 spot-check |

#### P1 — should ship

| Item | Notes |
|------|-------|
| Counter-raid militia march visuals | Prep-focused; no battle screen |
| Large-map playtests at 10× | After benchmark gate green |
| Spear tier balance validation | City-scale militia preview |
| Perf dev overlay | ms/tick, entity count, grid rebuild |
| Reputation arc UI | Milestones beyond ⭐ tooltip |
| Footstep / work SFX by surface | Juice deferred since v0.4.2 |
| One visitor multi-step quest chain | Scholars or Nomads |
| `npm run benchmark:gate` | CI-friendly wrapper |

#### P2 — stretch (mid-July green only)

| Item | Hotspot |
|------|---------|
| Adaptive catch-up at 10× | `gameLoop.ts` |
| Canvas LOD (trees, animals, sprites) | `renderer.ts` |
| Save-size report in Game menu | `saveLoad.ts` |
| Optional append-only event log index | only if save size forces it |

**Tooling:** `npm run simulate:30min` · env `SIM_MINUTES`, `PERF_SAMPLE_EVERY`

---

## Diplomacy & tribes — still open

| Item | Priority | Notes |
|------|----------|-------|
| Full war / embassy tree | Deferred | Peace treaties + raids MVP ✅; no embassies or sieges |
| Player caravans | Deferred | post-0.4.2 |

---

## Deferred (explicitly not v0.4.2)

- Hospital disease / heal loop
- Wardogs from tamed wolves
- Fog of war / map expansion
- Leader perks / government decisions beyond ceremonial head
- Multiplayer

---

## When closing an item

1. Mark done in this file (or delete the row).
2. Add a bullet under [CHANGELOG.md](CHANGELOG.md) `[Unreleased]` or the shipping version section.
3. Update [../ROADMAP.md](../ROADMAP.md) half-done registry + `roadmapContent.ts` if player-facing.