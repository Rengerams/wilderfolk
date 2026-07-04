# Wilderfolk Roadmap

**Early Alpha v0.4.2 shipped (July 5, 2026) → [v0.4.3](ROADMAP_0.4.3.md) → [v0.4.4](ROADMAP_0.4.4.md)**

Living document for where the game is and where it's going.

## Documentation map (single source of truth)

| File | Purpose |
|------|---------|
| **[ROADMAP.md](ROADMAP.md)** | **This file** — master plan, phases, half-done registry |
| **[ROADMAP_0.4.3.md](ROADMAP_0.4.3.md)** | v0.4.3 release plan (scale & perf) |
| **[ROADMAP_0.4.4.md](ROADMAP_0.4.4.md)** | v0.4.4 release plan (perf Phase 2 + UI) |
| **[app/TODO.md](app/TODO.md)** | Open ship blockers & dev checklist |
| **`app/src/game/roadmapContent.ts`** | In-game More → Roadmap tab |

Also: [app/README.md](app/README.md) (players) · [TECHNICAL.md](TECHNICAL.md) (devs) · [SESSION_SUMMARY.md](SESSION_SUMMARY.md) (dev log)

*Last updated: July 5, 2026 — **v0.4.2 shipped** (`GAME_VERSION = 0.4.2`). Next: [v0.4.3](ROADMAP_0.4.3.md) (Sep 2026).*

---

## Rule: no forgotten half-features

Every **🟡 Partial** item must stay on this list until we pick one:

| Decision | Meaning |
|----------|---------|
| **FINISH** | Complete for **v0.4.2** — assigned a phase & next action |
| **CUT** | Remove UI/code; stop advertising it |
| **DEFER** | Explicit later version + hidden or "coming soon" only |

**Do not ship new 🟡 without adding a row to the registry below.**

---

## 🟡 Half-done registry (do not forget)

| Feature | What works today | What's missing | Decision | Target |
|---------|------------------|----------------|----------|--------|
| **Rival diplomacy** | Map camp panel, event cards, gift/pact/militia; raids + preview; **peace treaties**; Village/Frontier raid UI; distance-scaled deadline; raid march lines | Real-time map battles; full war/embassy tree | **DEFER** tactical combat | post-0.4.2 |
| **Weapons / Blacksmith** | Research buffs; **forge queue** (`villageForge`); armament checklist; alerts + Go → Blacksmith; walls/towers/barracks; combat log panel | Militia-on-march map icons | **FINISH** balance pass | v0.4.2 |
| **Visitor tribes** | 7 kinds, first-week caravan, camp trade, refugee negotiate, **talk to leader** (per-kind rewards) | Deeper per-kind quest chains | **DEFER** depth | post-0.4.2 |
| **Village leadership** | Founding + decennial merit elections; succession; 👑 UI (Village tab, map, inspector) | Leader perks/decisions beyond ceremonial role | **DEFER** perks | post-0.4.2 |
| **Roads** | 1.5× walk + 15% adjacency; `road_bonus` rep; **R** rotation for roads/walls/gates | Pathing still snap-based (no road-following AI) | **CUT** pathing; rotation **FINISH** ✅ | v0.4.2 |
| **Reputation / honor** | ⭐ header badge (click → Trade) + Village tab explainer; roads rep | Reputation arc UI beyond tooltip | **FINISH** arc or defer | v0.4.2 |
| **Worker commute** | Snap at 7am/7pm if far | No real pathing along roads | **CUT** snap is enough **or FINISH** roads pathing | v0.4.2 |
| **Taming** | Post + food cost + follow + hunt assist | No wardogs, no UI on map for tamed pack | **DEFER** wardogs | post-0.4.2 |
| **Hospital** | Rep + energy tweak | No disease/heal loop | **DEFER** | post-0.4.2 |
| **Performers / festival hook** | Performers boost courtship | Festival system shallow | **DEFER** | post-0.4.2 |
| **Rival "show militia"** | Parade eases tension; **raids** use abstract militia strength + war-band march; walls/towers/barracks bonuses; guard patrols | No tactical map battle | **DEFER** tactical combat | post-0.4.2 |

When a row hits **FINISH**, delete it from this table and move a one-liner to *Shipped in v0.4.2*.

---

## North star

Ship a cozy frontier eco-sim where settlers live on a schedule, the food chain matters, the valley feels alive with **other people and tribes** — and players always know **what to do next**.

**Winning moment for a new player:** *"I built a house, assigned workers, met a neighbor tribe, armed my village, and everyone came home at night."*

---

## Version roadmaps (0.4.3 → 0.4.4)

Detailed release plans live in dedicated docs — this file stays the **parent index**. Update those docs when scope changes; keep the version table below in sync.

| Version | Theme | Target | Plan |
|---------|-------|--------|------|
| **0.4.2** | Craft, walls/guards, juice, UI/UX | **Shipped** Jul 2026 | [app/CHANGELOG.md](app/CHANGELOG.md) `[0.4.2]` |
| **0.4.3** | Scale & perf Phase 1 | Sep 2026 | **[ROADMAP_0.4.3.md](ROADMAP_0.4.3.md)** |
| **0.4.4** | Perf Phase 2 + App tab split | Nov 2026 | **[ROADMAP_0.4.4.md](ROADMAP_0.4.4.md)** |
| **0.5.0** | Web Worker + canvas layers | Q1 2027 | [app/TODO.md](app/TODO.md) Phase 3 |

**Release chain:** 0.4.2 ship → [0.4.3 spatial grid + benchmark gate](ROADMAP_0.4.3.md) → [0.4.4 incremental maps + UI split](ROADMAP_0.4.4.md) → 0.5.0 architecture.

---

## Current state (early alpha v0.4.2 shipped)

| Strength | Next focus |
|----------|------------|
| PNG human walk sheets + 4 outfit variants | Hand-painted outfit art (recolors are programmatic) |
| Food chain + **Blacksmith forge queue** + raid **preparation** UX (no battle screen) | Real-time tactical battles (deferred) |
| Tribe diplomacy v2 + raids (2–6d deadline, preview, peace, march lines) | [v0.4.3](ROADMAP_0.4.3.md) spatial grid |
| **Walls / towers / barracks** + guards + combat log | Counter-raid march polish (optional) |
| **6-tab UI**, alert strip, hotbar, focus Go → | [v0.4.4](ROADMAP_0.4.4.md) UI split at city scale |
| **10-year balance PASS** + **10-user beta** ([playtest doc](app/docs/PLAYTEST_BETA_10_USERS.md)) | Mid-game goals past year 4–5 |
| Sim perf (~1.8 ms/tick avg @ ~550 entities; 10-year p95 5.46ms) | 100+ entity benchmark gate (v0.4.3) |

**Rough rating:** promising alpha (~8/10 shipped v0.4.2, ~8.5/10 vision).

---

## Feature roadmap (Top 10)

Status: ✅ Shipped · 🟡 Partial · ❌ Not started / deferred

| # | Track | Status | Notes |
|---|-------|--------|-------|
| 1 | **Defense & combat** | ✅ v0.4.2 | Stone/wood/iron gear, frontier raids, walls/towers/barracks, combat log. Tactical map battles → post-0.4.2 |
| 2 | **Health & medicine** | ❌ post-0.4.2 | Hospital rep boost today; disease loop later |
| 3 | **Farming overhaul** | ❌ post-0.4.2 | Flat daily farms today; crops/soil/rotation later |
| 4 | **Production & crafting** | ✅ v0.4.2 | Workshop recipes + Blacksmith forge queue. Full chains later |
| 5 | **Skills & apprentices** | 🟡 | Job skills shipped; apprentice hook optional for v0.4.2 |
| 6 | **Diplomacy & tribes** | ✅ v0.4.1+ | Visitors, rivals, raids, peace, leader talk. Player caravans later |
| 7 | **Map expansion** | ❌ post-0.4.2 | Map sizes/presets today; fog of war / scouts later |
| 8 | **Wildlife ecology** | 🟡 | Food chain + Nature tab pressure warning. Herds/migration later |
| 9 | **Culture & events** | 🟡 | Church, festivals, Renffr. Traditions/monuments later |
| 10 | **Victory & endgame** | ✅ v0.4.1 | Four victory paths, challenges, chronicle, in-game Roadmap tab |

---

## Shipped in v0.4 (cumulative)

### Core & balance
- PNG walk-sheet settlers (`humanSprites.ts`, 8 variant atlases)
- Quick Start tutorial — build a house before first night
- Terrain-aware placement (blocks water, mountains, snow)
- Balance: starting food 530, lighter early wolves, spoilage 0.03
- Slower pregnancy (5 days) / reproduction cooldown (8 days)
- Workshop recipe picker, staffing matters (Church/School/Blacksmith)
- Challenge AND logic, calendar timers, food at meals only (8am & 6pm)
- `npm run simulate:30min` headless sim + `run-sim.mjs` wrapper

### UI / clarity (recent playtest pass)
- **Sidebar reorganized (v0.4.2)** — 8 tabs → 6 (Village, Frontier, Nature, Progress, Log, More); Research/Trade/Goals under Progress; Guide/Roadmap under More
- **Alert strip** — RimWorld-style priority alerts under header (click to jump: raids, diplomacy, food, trade ready)
- **Map build hotbar** — Banished-style bottom strip (House, Farm, Lumber, Quarry, Well, Road); collapsed left rail deduped (catalog only via `B`)
- **Focus hints** — actionable **Go →** buttons; tab hotkeys `V/F/N/P/L/M`; Frontier tab badge for pending events
- **Inspector** — collapsible, auto-expands on map click; ☰ game menu for save/audio/reset
- **Goals:** Eco-Utopia + Great City active (v0.4); Trade Empire + Harmony added v0.4.1
- **Village Chronicle:** Log tab — scroll, filters, copy, **Download .txt**, export on 💾 Save (optional)
- **What to do next** focus panel (Village tab)
- **Village armament** checklist (Defense research + Blacksmith for iron)
- **Frontier neighbors** diplomacy: food gift, trade pact, show militia
- Town Hall: research sync fix, Community tab prominence, unlock notifications
- House **Expand** upgrade (+2 slots), families stay together (6 base / 10 max)
- Worker commute snap at 7am/7pm (far jobs no longer walk forever)
- Demolish always visible; married-to label; guide updates

### Systems
- Visitors, rival settlements, festivals, Moon Howlers
- Hunting & combat juice; Defense research (stone/wood/iron tiers)
- Iron weapons require **completed Blacksmith** (passive village-wide gear)
- Inspector: outfit label, village armament, hunt status

---

## Shipped in v0.4.1 ✅

### Gameplay
- **Guaranteed first-week visitor** — pilgrims or performers on days 4–7 once a house exists (`groupEvents.ts`, `firstWeekVisitorSpawned`)
- **`road_bonus` wired** — Urban Planning research; completed roads grant reputation + `+rep (roads)` float text (`gameEngine.ts`)
- **Roads in sim** — 1.5× walk speed on roads (`lifeSimulation.ts`); adjacency bonuses in placement — *not yet explained in-game UI*
- **Prison + Guard job** — adultery arrests, prisoner sentences, prison panel UI (`gameTypes.ts`, `lifeSimulation.ts`, `App.tsx`)
- **Eco Master tracking** — `ecoHealthYearsAbove80` yearly counter (`gameEngine.ts`)

### UI / clarity
- **Challenge progress bars** — all challenges; Eco Master shows `years eco ≥80%` (`challengeProgress.ts`, `App.tsx`)
- **Active challenge highlight** — 🎯 badge + amber border on first incomplete challenge
- **Reputation explainer** — Village tab “How reputation grows” block (`App.tsx`); header ⭐ → Trade added in v0.4.2
- **Population & families panel** — scrollable family units (`PopulationPanel.tsx`)
- **Focus panel** — “What to do next” hints (`FocusPanel.tsx`, `focusHints.ts`)
- **Armament checklist** — Village tab steps for stone/wood/iron gear (`combat.ts`)
- **Chronicle export** — `.txt`, `.json`, `.csv` (`eventLogExport.ts`, `EventLogPanel.tsx`)
- **Combat status on settlers** — hunt/shield/guard icons on map via `getHumanStatusCombatIcon` (`combat.ts`, `renderer.ts`); Log → Combat panel in v0.4.2
- **Building foundation pads** — category-colored pads under buildings (`gameTypes.ts` `padShape`/`backgroundColor`, `renderer.ts`)

### Tech / polish
- **Intro audio bootstrap** — early `ensureIntroAudio()` + HTML autoplay fallback (`audio/bootstrap.ts`, `main.tsx`)
- **Intro screen layout** — overlap fixes (z-index, hidden-until-reveal sections)
- **Dev server** — Vite port `5173` (Windows blocks port 3000)
- **Tribe interaction v2** — rival diplomacy event cards (`pendingDiplomacyEvents`), map camp inspector, camp click + camera ping (`hitTestCamp`, `highlightedCampKey`)
- **Visitor trade UI** — buy food/wood, sell food at visitor camps (`tradeWithVisitors`)
- **Refugee negotiate** — welcome / screen / turn away; no auto-join (`negotiateRefugees`)
- **Nature tab grazing warning** — deer vs grass pressure card (`ecosystemPressure.ts`, `getGrazingPressureReport`)
- **In-game roadmap tab** — read-only v0.4.1 slice (`RoadmapPanel.tsx`, `roadmapContent.ts`)
- **Frontier raids MVP** — incoming raids, defend/barricade/pay off, counter-raid, war-band march (`frontierCombat.ts`)
- **Combat preview panel** — militia vs rival forecasts, distance, provisions cost (`CombatPreviewPanel.tsx`, `getCombatPreview()`)
- **Raid balance pass** — home-turf +25% on outgoing raids; distance-scaled provisions (22–50🍖); gated counter-raid forecast; split defense/raid ratio hints
- **Peace treaties** — `signPeaceTreaty()`, `peace_treaty` diplomacy events, `peaceTreatyDays` blocks raids (`groupEvents.ts`, rival inspector)
- **Visitor leader talk** — per-kind rewards via `talkToVisitorLeader()` in visitor camp panel
- **Trade Empire + Harmony victories** — active in Goals tab; 5th route Silkmarket (`victory.ts`, `economy.ts`)
- **Village leadership** — merit elections every 10 years, founding + succession (`villageLeadership.ts`, `VillageLeadershipPanel.tsx`)

## Shipped in v0.4.2 ✅

*`GAME_VERSION = 0.4.2` · tagged `v0.4.2` · see [app/CHANGELOG.md](app/CHANGELOG.md) `[0.4.2]`.*

### UI / UX
- 6-tab sidebar (Village, Frontier, Nature, Progress, Log, More) + sub-tabs
- `AlertBar` priority strip, `BuildHotbar`, `GameMenu`, collapsible inspector
- Tab hotkeys `V/F/N/P/L/M`, focus **Go →** actions, Frontier/Progress badges
- Quick Start + `?` shortcuts overlay; header ⭐ → Trade

### Combat / craft
- **Blacksmith forge queue** — `villageForge`, iron spears/shields after research + staffed smith
- **Frontier raid polish** — 2–6 day deadline by distance, slower distant march, UI deadline copy
- **Defense buildings** — Wall/Corner/Gate (+8 barricade/segment, cap +72), Watchtower (+15), Barracks (manual Guards, +12 militia each)
- **Guard patrols** — staffed Barracks guards orbit village core during work hours
- **Combat log panel** — Log → Combat sub-tab with stats + .txt/.json/.csv export
- **Raid map overlay** — dashed march lines rival camp → village when raids pending
- Forge + raid alerts in `priorityAlerts.ts`; Armament **Open Blacksmith →**

### Performance
- Off-screen throttles (human 8, wildlife 8, grass 4 ticks)
- Per-tick `entityById` / `buildingById`; wildlife iterates `byType`
- `world.wildlifeCounts`; React memo on heavy panels; `simulate:30min` perf metrics
- `combatTech.ts` — circular import fix for headless sim

### Polish & juice
- **Road / wall / gate rotation** — **R** while placing (`buildingRotation.ts`)
- **Night glow** — window/chimney embers on homes; door glow on staffed Church/Blacksmith/Hospital (`juiceEffects.ts`, `renderer.ts`)
- **Build complete** — confetti, `✨ Built!` float, sprite pop, screen shake
- **Camera nudge** — `nudgeCameraToward()` pans 28% toward map selection
- **Intro screen** — ~20s timeline, skip after logo (`IntroScreen.tsx`, `App.css` intro-*)

### Hygiene (July 4, 2026)
- Sanity check pass; lint **0 errors**; inspector expand via selection handlers

### Bug-fix pass (July 4, 2026) — ~40 fixes ✅

Four code-review rounds; verified build, lint (0 errors), 5-min + 30-min sim, `/check-work` PASS. Full categorized table → [app/CHANGELOG.md](app/CHANGELOG.md) → **Bug fixes — comprehensive pass**.

**Critical:** map setup GameLoop sync; faction human ages; welcomed refugees killed on camp departure; eco streak 24×/year.

**High:** diplomacy event loss; peace vs active raids; rival pop sync; workshop/trade at storage cap; challenges (`eco_master`, `great_city`); save year + migrations; raid tick timing; refugee food at pop cap.

**Medium:** placement footprint; raid/diplomacy/trade/forge UI feedback; prison ghost workers; moon howler hunt leak; stats (yearly pop, births, disasters); age display; victory rival buildings.

---

### Code audit — implemented but **not** v0.4.1 goals (do not mark open)

| Feature | Files | Roadmap note |
|---------|-------|----------------|
| Workshop recipe picker | `App.tsx`, `gameEngine.ts` | Real crafting exists for Workshop only, not Blacksmith weapons |
| Rival diplomacy v1 (Village tab only) | `groupEvents.ts`, `App.tsx` | Superseded by v2 map inspector — keep Village tab as shortcut |
| Event log unlimited storage | `eventLog.ts` | Shipped v0.4; UI still shows latest 500 |

---

## v0.4.2 — ship checklist ✅ (closed 2026-07-05)

| # | Ship blocker | Status |
|---|--------------|--------|
| 1 | 10-year balance pass | **Done** — town PASS 2026-07-04, 9/9 gates |
| 2 | Spear / militia balance review | **Done** (`militiaBalance.ts`) |
| 3 | External playtests (5–10 sessions) | **Done** — [PLAYTEST_BETA_10_USERS.md](app/docs/PLAYTEST_BETA_10_USERS.md) |
| 4 | Bump to `0.4.2` + save migration | **Done** |
| 5 | CHANGELOG, README, `roadmapContent.ts` on release | **Done** |

**Tagged `v0.4.2`.** Next: [v0.4.3](ROADMAP_0.4.3.md) spatial grid (Sep 2026).

---

## v0.4.2 scope — feature target (code largely in repo)

Everything below was the **v0.4.2** build target. Most rows are implemented locally; release blockers are in the table above.

### P0 — Purpose & tribes *(v0.4.1 — complete)*

| Item | Status | Notes |
|------|--------|-------|
| Surface goals in first hour (focus panel) | ✅ Done | Shipped v0.4 |
| Chronicle readable outside game (.txt) | ✅ Done | Shipped v0.4 |
| Explain weapons (research + Blacksmith, not crafting) | ✅ Done | Shipped v0.4 |
| **Deeper tribe interaction** — trade UI, refugee negotiate, rival map ping, visitor leader talk | ✅ Done | Per-kind quest depth deferred |
| **Peace treaties** — player sign + diplomacy events; raids blocked at peace | ✅ Done | Full war/embassy tree deferred |
| **Village leadership** — merit elections every 10 years | ✅ Done | Leader perks/decisions deferred |
| **Trade Empire + Harmony victories** — active in Goals tab | ✅ Done | |
| **Frontier raids MVP** — defend, barricade, pay off, counter-raid | ✅ Done | Raid polish + walls/guards + combat log — see `app/TODO.md` |
| **Guaranteed first-week visitor** | ✅ Done | Days 4–7 after first house |
| **Rival events player can respond to** (tribute, border dispute, alliance) | ✅ Done | `pendingDiplomacyEvents` + banner/inspector choices |
| Click rival camp → diplomacy panel (not buried in Village tab) | ✅ Done | Camp marker + rival building inspector |

### P1 — Combat & weapons *(v0.4.2)*

| Item | Status | Notes |
|------|--------|-------|
| Defense research passive buffs | ✅ Done | Shipped v0.4 |
| **Actual crafting queue** at Blacksmith (iron spears & shields) | ✅ v0.4.2 | `villageForge`, `BlacksmithForgePanel`, save migration |
| Guards / patrol / Walls / Watchtowers / Barracks | ✅ v0.4.2 | `defenseStructures.ts`, guard patrol in `lifeSimulation.ts` |
| Weapon icon on map + combat log entries | ⚠️ v0.4.2 | Hunt/shield/guard icons ✅; raid march lines ✅; militia-on-march ❌ |
| PvP / raid combat with rival tribes | ✅ v0.4.2 | Abstract raids + preview + walls/towers/barracks bonuses; tactical map battles deferred |
| Frontier raid polish (Village tab button, deadline vs distance) | ✅ v0.4.2 | `expiresAtTick`, `formatRaidDeadline`, slower distant march |

### P1 — Village life & scale *(v0.4.2)*

| Item | Status | Notes |
|------|--------|-------|
| Family housing split bug | ✅ Fixed | Shipped v0.4 |
| **Population / family overview panel** | ✅ Done | `PopulationPanel` in Village tab |
| **Honor / reputation explainer** | ✅ v0.4.2 | Village tab + header ⭐ click → Trade |
| Township (Town Hall + Urban Planning) | ✅ Unlocked | Shipped v0.4.1 |

### P2 — World, juice & quality *(v0.4.2)*

| Item | Status | Notes |
|------|--------|-------|
| Vertical roads / road rotation | ✅ v0.4.2 | **R** key — Road, Wall, Wall Gate (`buildingRotation.ts`) |
| Wire `road_bonus` research → reputation | ✅ Done | Rep tick + `+rep (roads)` float text |
| Roads: UI explains 1.5× walk + 15% adjacency | ✅ v0.4.2 | Infra category hint in build catalog + Guide |
| More visitor kinds polished | ⚠️ v0.4.2 | 7 kinds exist; shallow |
| Chimney glow, build-complete particles | ✅ v0.4.2 | `juiceEffects.ts` — night glow + confetti on build complete |
| Intro screen refine (~20s, skip after logo) | ✅ v0.4.2 | `IntroScreen.tsx` timeline + `App.css` intro-* classes |
| Optional footstep or work SFX by surface | ❌ [v0.4.4](ROADMAP_0.4.4.md) | P1 in v0.4.4 roadmap |
| Smooth camera nudge on select | ✅ v0.4.2 | `nudgeCameraToward()` — 28% lerp on map click |
| Nature tab warning when deer pressure > grass recovery | ✅ Done | `ecosystemPressure.ts` caution/critical card |
| **Eco Master challenge** UI progress bar | ✅ Done | `challengeProgress.ts` |
| **Active challenge** highlight in UI | ✅ Done | 🎯 on first incomplete |
| 5–10 external playtests with notes | ✅ v0.4.2 | [PLAYTEST_BETA_10_USERS.md](app/docs/PLAYTEST_BETA_10_USERS.md) |
| 10 full in-game year balance pass | ✅ v0.4.2 | Town PASS 2026-07-04, 9/9 gates |
| Perf check: 500+ entities, large map | ⚠️ v0.4.2 | Throttles shipped (~1.8 ms/tick avg); → [ROADMAP_0.4.3.md](ROADMAP_0.4.3.md) Phase 1 · [ROADMAP_0.4.4.md](ROADMAP_0.4.4.md) Phase 2 |
| **In-game roadmap tab** (read-only slice of this doc) | ✅ Done | `RoadmapPanel.tsx`, `roadmapContent.ts` |

### Deferred (not v0.4.2)

| Item | Target |
|------|--------|
| Leader perks / government decisions beyond ceremonial head | post-0.4.2 |
| Fog of war / exploration | post-0.4.2 |
| Hospital disease/heal loop | post-0.4.2 |
| Wardogs, deep festival/culture | post-0.4.2 |
| Multiplayer, Wildkin expansion | post-0.4.2 |

---

## Phase 0 — Playtest alpha ✅ *mostly complete*

**Goal:** Friends can run the game and understand it without you in the room.

- [x] Core sim: grass → prey → predators → village
- [x] Seasons, weather, pollution, research
- [x] Day/night cycle (24 ticks = 1 day)
- [x] Residence vs workplace (home at night, work by day)
- [x] Visitor caravans + rival camps
- [x] Moon Howlers, festivals, disasters
- [x] Quick Start tutorial + Guide tab
- [x] README (player) + TECHNICAL.md
- [x] Save migration 2.0/2.1/2.2 → 0.4 (in `loadGame`)
- [x] Chronicle log + file export
- [x] Focus hints + armament checklist
- [x] 5–10 external playtests with notes → **v0.4.2** ([PLAYTEST_BETA_10_USERS.md](app/docs/PLAYTEST_BETA_10_USERS.md))
- [x] Save migration story fully documented in TECHNICAL.md

**Exit:** Testers play 2+ hours unaided and can name their current goal.

---

## Phase 1 — v0.4.1: feel alive ✅ *shipped*

**Goal:** The map feels populated. Players interact with neighbors, not just watch them.

### 1A — Sprite pipeline ✅ *complete*

Path B — extend existing PNG humans.

### 1B — Juice → **v0.4.2** *(mostly complete)*

- [x] Chimney / window glow when settlers are home at night
- [x] Particles for birth and marriage
- [x] Particles for build complete (confetti + sprite pop + screen shake)
- [x] Hunt/combat feedback (chase lines, floating text, combat burst, hunt SFX)
- [ ] Optional footstep or work SFX by surface → post-0.4.2
- [x] Smooth camera nudge on select
- [x] Intro screen refine (~20s timeline, skip after logo)

### 1C — First-hour hook & purpose → **v0.4.1** ✅

- [x] Tutorial beat: **build a house before first night**
- [x] **What to do next** panel + Goals link
- [x] Guaranteed friendly visitor in first in-game week
- [x] Nature tab warning when deer pressure > grass recovery
- [ ] Optional: pick a **legacy path** at game start (Eco vs Great City)

**Exit:** New player names one active goal within 15 minutes.

---

## Phase 2 — v0.4.2: craft, combat polish & juice ✅ *shipped*

**Goal:** Clear combat/craft fantasy and production polish after v0.4.1 neighbor/diplomacy ship.

### Must ship in v0.4.2

1. ~~**Blacksmith crafting**~~ ✅ — forge queue for iron spears & shields
2. ~~**Road rotation**~~ ✅ — **R** key for roads, walls, gates
3. ~~**Reputation / honor** explainer~~ ✅ — header ⭐ + Village tab
4. ~~**Frontier raid polish**~~ ✅ — deadline vs distance, Village/Frontier respond UI
5. ~~**Walls / guards / combat log**~~ ✅ — defense buildings, guard patrols, Log → Combat panel, raid march lines
6. ~~**Juice pass**~~ ✅ — night glow, build confetti, camera nudge; intro screen refine
7. ~~10-year balance pass~~ **Done** (2026-07-04) · external playtests (5–10 sessions)
8. Bump `GAME_VERSION` to `0.4.2` + save migration on ship
9. Perf Phase 1 → **[ROADMAP_0.4.3.md](ROADMAP_0.4.3.md)** (Sep 2026) — not a v0.4.2 ship blocker

### Balance & stability → **v0.4.2**

- [x] 10 full in-game year playtest pass (town PASS 2026-07-04)
- [ ] Winter food curve
- [x] Save version `0.4` / `0.4.1` with migration from legacy `2.x` and `0.4` saves
- [x] Perf check: 500+ entities — partial (throttles + maps shipped; → [ROADMAP_0.4.3.md](ROADMAP_0.4.3.md))
- [x] Bump save/game version to `0.4.2` on ship

**Exit:** Founding couple → town that trades or fights with neighbors — player chose which.

---

## Phase 3 — v0.4.3 & v0.4.4 *(planned releases)*

| Phase | Doc | P0 focus |
|-------|-----|----------|
| **v0.4.3** Sep 2026 | **[ROADMAP_0.4.3.md](ROADMAP_0.4.3.md)** | Spatial grid, dead-entity compaction, renderer cache reuse, benchmark gate |
| **v0.4.4** Nov 2026 | **[ROADMAP_0.4.4.md](ROADMAP_0.4.4.md)** | Incremental `entityById`, grass buckets, App tab split, particle pooling |

See also [app/TODO.md](app/TODO.md) — v0.4.3 / v0.4.4 preview tables.

---

## Phase 4 — After v0.4.4 *(ongoing backlog)*

| Track | Examples | Target |
|-------|----------|--------|
| **Architecture** | Web Worker `gameTick`, OffscreenCanvas layers | **v0.5.0** Q1 2027 |
| **Victory paths** | Legacy system, endless scaling challenges | post-0.4.4 |
| **Tribes & diplomacy** | Full wars, sieges, embassies, player caravans | post-0.4.4 |
| **Crafting** | Full production chains (ore → iron → tools) | post-0.4.4 |
| Content | Fog of war, new biomes, building tiers | post-0.4.4 |
| Social | Multiplayer, async rival ghosts | post-1.0 |
| Art | Hand-painted outfits, animal walk cycles | ongoing |
| Systems | Hospital disease loop, disasters v2, moddable JSON | post-0.4.4 |

---

## Timeline (solo, part-time)

| Month | Focus | Status |
|-------|--------|--------|
| 1 | Walk sprites + tutorial + v0.4 clarity pass | **✅ done** |
| 2 | **v0.4.1** — tribes, diplomacy, raids, victories, leadership | **✅ done** |
| 3 | **v0.4.2** — craft, walls/guards, juice, balance | **✅ done** |
| 4 | **v0.4.3** — scale & perf Phase 1 | [ROADMAP_0.4.3.md](ROADMAP_0.4.3.md) · Sep 2026 |
| 5 | **v0.4.4** — perf Phase 2 + UI split | [ROADMAP_0.4.4.md](ROADMAP_0.4.4.md) · Nov 2026 |

---

## Metrics *(v0.4.2 exit)*

| Metric | Target |
|--------|--------|
| Avg session | 45+ minutes |
| Tester can name current goal | 80%+ after 20 min |
| "How do I make weapons?" | Rare after armament + forge UI |
| "Feels like playing alone" | < 30% of playtesters |
| Crashes per 10h | 0 |

---

## Next actions (v0.4.2, ordered)

1. [x] **Blacksmith crafting UX** — forge queue (`forge.ts`, `BlacksmithForgePanel`)
2. [x] **Frontier raid polish** — distance-scaled deadline, Village/Frontier UI (`frontierCombat.ts`)
3. [x] **Walls / Watchtowers / Barracks** + guard patrols
4. [x] **Dedicated combat log panel** — Log → Combat sub-tab
5. [x] **External playtests** — 10 sessions ([PLAYTEST_BETA_10_USERS.md](app/docs/PLAYTEST_BETA_10_USERS.md))
6. [x] **10-year balance pass** — town PASS 2026-07-04 (`simulate:10year`, 86400 ticks)
7. [x] **Road rotation** — **R** key (`buildingRotation.ts`)
8. [x] **Juice pass** — chimney glow, build-complete particles, camera nudge
9. [x] **Intro screen refine** — ~20s timeline, skip after logo
10. [x] **Header reputation tooltip** — ⭐ click → Trade
11. [x] **Bump version** to `0.4.2` in `version.ts` + save migration on ship
12. [ ] **Perf Phase 1** → [ROADMAP_0.4.3.md](ROADMAP_0.4.3.md) (Sep 2026) — **next**

## Next actions (v0.4.3 → v0.4.4)

*Full checklists live in the version roadmaps — not duplicated here.*

| Version | Doc | Start when |
|---------|-----|------------|
| **0.4.3** | [ROADMAP_0.4.3.md](ROADMAP_0.4.3.md) | v0.4.2 tagged and shipped |
| **0.4.4** | [ROADMAP_0.4.4.md](ROADMAP_0.4.4.md) | v0.4.3 benchmark gate green |

---

## Version targets

| Milestone | Version | Signal | Status |
|-----------|---------|--------|--------|
| Clarity + chronicle + housing | 0.4 | Playtest feedback addressed | **✅ Shipped** |
| Tribes + diplomacy + raids + victories + leadership | 0.4.1 | Tribe diplomacy v2, raids, peace, 4 victories, leadership, roadmap tab | **✅ Shipped** |
| Craft + walls/guards + juice + balance | 0.4.2 | 10-year PASS, beta playtests, version bump | **✅ Shipped** Jul 2026 |
| Scale & perf Phase 1 (spatial grid, benchmark gate) | 0.4.3 | Large-map / 100+ settler stability | **Planned** — [ROADMAP_0.4.3.md](ROADMAP_0.4.3.md) |
| Perf Phase 2 + App tab split (incremental maps, pooling) | 0.4.4 | City-scale UI + render polish | **Planned** — [ROADMAP_0.4.4.md](ROADMAP_0.4.4.md) |

---

<p align="center">
  <em><strong>v0.4.2 shipped</strong> → <a href="ROADMAP_0.4.3.md">v0.4.3</a> → <a href="ROADMAP_0.4.4.md">v0.4.4</a>.</em>
</p>