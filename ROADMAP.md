# Wilderfolk Roadmap

*Last updated: **July 8, 2026** · playing **v0.4.2** (`GAME_VERSION`); v0.5.0 work in tree pre-tag*

Newest version first. 🟢 done · 🟡 in progress · ⬜ open. Detail → [CHANGELOG.md](CHANGELOG.md) · [ROADMAP_0.5.0.md](ROADMAP_0.5.0.md)

---

## v0.5.0 — Scale + architecture

**Shipped (in code):** 2026-07-05 · **Tag target:** End July 2026 · `GAME_VERSION` **0.4.2**

| | Feature |
|:--:|---------|
| 🟢 | Election & leadership — decennial ceremony (year-before buildup → 3-day Revelry), incumbent always in race with record score (+8 cap), panel + hints + tutorial synced |
| 🟢 | Housing logic — beds vs immigration cap in UI; singles share until marriage; child custodian chain (mother → father → grandma → adoption); 18+ move-out; families share when houses full |
| 🟢 | Dead-entity compaction — alive-only entities each tick |
| 🟢 | Spatial grid — grass **56px** + mobile **80px** + road index **128px**; graze→grass, flee/hunt/social→mobile (`spatialGrid.ts`, on by default) — [TECHNICAL.md](TECHNICAL.md#dual-layer-spatial-grid) |
| 🟢 | Web Worker gameTick — opt-in (`VITE_USE_GAME_WORKER=1`); render SoA + proto handshake |
| 🟢 | Big bug checkup — **429** tracker IDs (**391 fixed**, **24 info**, **0 open/partial**); Vitest **390** (71 files); lint **0**; build clean |
| 🟢 | **Raid Guard XP → elections** — fighters earn Guard skill XP; leader +0.45 XP + rep on wins; merit = all skills ×2; incumbent record from rep (+8 cap) |
| 🟢 | **Victory goals retuned** — Eco-Utopia **250** + 20yr eco; Great City **400** + **60** buildings; Trade Empire **7** routes + **40** caravan trips + **50k** trade gold; Harmony **8 wild** wolves + **15** wildkin (untamed only) |
| 🟢 | **Walking trade caravans** — merchants walk hub → partner → back; goods on arrival; map **🚚** lines; 7 routes (`tradeCaravans.ts`) |
| 🟢 | Dialogue-tree settler chat — `sim_dialogue_trees.json` (95 trees); legacy `wf_*` migration; election/marriage chat tests |
| 🟢 | Build catalog sidebar — `BuildCatalogPanel` (replaces hotbar) |
| 🟢 | Renderer cache — `world.entityByType` → `RenderSnapshot` → `updateCachedEntities`; viewport grass culling |
| 🟡 | buildingById go-home — drop commute `.find()` |
| 🟢 | Grass render spatial buckets — `byType[Grass]` + `buildGrassGrid` viewport query; `_cachedGrass` keyed by tick/camera |
| 🟡 | Benchmark gate — SIM_PROFILE village/town/city + p95 exit |
| 🟡 | simulate:20year — full 172800-tick PASS |
| 🟡 | Sim regression — simulate-30min exit on fail |
| 🟡 | App tab split + memo @ 300 population |
| ⬜ | Settler count denorm — working/idle on WorldState |
| ⬜ | Incremental entityById — update on birth/death only |
| ⬜ | buildingActions scan cleanup |
| ⬜ | Partner id map for relationship lines |
| ⬜ | Particle / floating-text pooling |
| 🟢 | OffscreenCanvas layers — terrain tiles + decor bake (`terrainLayer.ts`); dynamic entity bitmap cache (`entityLayer.ts`); flash overlay on main canvas |
| ⬜ | GAME_VERSION 0.5.0 + save migration |
| ⬜ | Logical invariant checks + full sim battery |
| ⬜ | Manual playtest matrix — large map, 10× |
| ⬜ | Outgoing counter-raid march line + militia sprites |
| ⬜ | Reputation milestone arc UI |
| ⬜ | One visitor multi-step quest chain (Scholars or Nomads) |
| ⬜ | Election Year 10/20 live playtest |
| ⬜ | Footstep / work SFX by surface |
| ⬜ | npm run benchmark:gate — CI wrapper |

### July 8, 2026 — Victory, trade & raid rewards (in code)

| Area | What shipped |
|------|----------------|
| **Raid XP** | `rewardRaidParticipants()` — Guard XP 0.3–1.1 by outcome; leader bonus; rep feeds `getIncumbentRecordAssessment()` at elections |
| **Eco-Utopia** | 250 humans + ecosystem ≥80% for 20 years |
| **Great City** | 400 humans + 60 completed player buildings |
| **Trade Empire** | All 7 routes active; 40 merchant round-trips; 50,000 gold from caravan trade (`goldFromTradeRoutes`) |
| **Harmony** | 8 **untamed** wolves (`tamedBy == null`) + 15 wildkin — taming via Taming Post does **not** count |
| **Caravans** | `establishTradeRoute` → walking merchant; export at partner, import at village; Progress → Trade shows leg status |

Detail → [CHANGELOG.md](CHANGELOG.md) `[Unreleased]` · [TECHNICAL.md](TECHNICAL.md) (Frontier combat · Victory paths · Trade caravans)

---

## v0.4.2 — Craft, walls/guards, juice, UI/UX

**Shipped:** 2026-07-05 · tag `v0.4.2`

| | Feature |
|:--:|---------|
| 🟢 | 6-tab sidebar, alert strip, left build catalog, tab hotkeys V/F/N/P/L/M |
| 🟢 | Focus Go → actions, Frontier/Progress badges, collapsible inspector |
| 🟢 | Blacksmith forge queue — iron spears & shields |
| 🟢 | Forge alerts + Open Blacksmith → |
| 🟢 | Frontier raid polish — 2–6 day deadline by distance, slower distant march |
| 🟢 | Village + Frontier raid respond UI; combat preview hints |
| 🟢 | Walls, watchtowers, barracks; guard patrols; combat log + export |
| 🟢 | Incoming raid march lines on map |
| 🟢 | Header ⭐ reputation badge → Trade |
| 🟢 | Simulation perf — throttles, entity maps, wildlifeCounts |
| 🟢 | Road / wall / gate rotation (R while placing) |
| 🟢 | Night glow, build confetti, camera nudge, intro screen |
| 🟢 | 10-year balance PASS — town 9/9 gates (2026-07-04) |
| 🟢 | 10 external playtests |
| 🟢 | ~40 bug fixes (July 4 comprehensive pass) |
| 🟢 | Worker commute snap (7am/7pm) |
| 🟢 | Roads benefit copy in Guide |
| 🟢 | Reputation — Village explainer + header ⭐ |
| 🟢 | Rival diplomacy — peace, raids, preview, show-militia parade |
| 🟢 | Visitor tribes — 7 kinds, caravan, refugee negotiate, leader talk |
| 🟢 | Spear / militia balance (`militiaBalance.ts`) |

---

## v0.4.1 — Tribes, raids, victories, leadership

**Shipped:** 2026-07-04

| | Feature |
|:--:|---------|
| 🟢 | Tribe diplomacy v2 — map camp panel, event cards, respond choices |
| 🟢 | Frontier raids — defend, barricade, pay off, raid / counter-raid, rival tribute on outgoing march |
| 🟢 | Combat preview — distance, provisions, defend & raid forecasts |
| 🟢 | Raid balance — home-turf +25%, distance food 22–50🍖 |
| 🟢 | Peace treaties — sign with rivals; raids blocked at peace |
| 🟢 | Visitor leader talk — per-kind rewards at camps |
| 🟢 | Visitor trade + refugee negotiate |
| 🟢 | Guaranteed first-week visitor (days 4–7) |
| 🟢 | Trade Empire + Harmony victories (4 active paths) |
| 🟢 | Village leadership — merit elections every 10 years |
| 🟢 | Population & families panel |
| 🟢 | Challenge progress bars + active 🎯 highlight |
| 🟢 | Nature tab grazing pressure warning |
| 🟢 | Chronicle export (.txt / .json / .csv) |
| 🟢 | Focus panel — what to do next |
| 🟢 | Reputation explainer (Village tab) |
| 🟢 | Combat status icons on settlers (map) |
| 🟢 | Prison + Guard job + prisoner UI |
| 🟢 | Building foundation pads (category colors) |
| 🟢 | Roads 1.5× walk speed; `road_bonus` → reputation |
| 🟢 | In-game Roadmap tab |
| 🟢 | Eco Master yearly tracking |

---

## v0.4 — Clarity, chronicle, housing, tutorial

**Shipped:** June 2026

| | Feature |
|:--:|---------|
| 🟢 | PNG walk-sheet settlers; Quick Start tutorial |
| 🟢 | Terrain-aware placement; seasons, weather, pollution, research |
| 🟢 | Food at meals (8am & 6pm); workshop recipes |
| 🟢 | Defense research tiers; visitors, rivals, festivals, Moon Howlers |
| 🟢 | Eco-Utopia + Great City victories |
| 🟢 | Village chronicle + export on save |
| 🟢 | Sidebar → 6 tabs; alert strip; build catalog |
| 🟢 | Focus hints; armament checklist |
| 🟢 | House expand (+2 slots); demolish always visible |
| 🟢 | `npm run simulate:30min` headless sim |

---

<p align="center"><em><strong>v0.4.2 shipped</strong> → <a href="ROADMAP_0.5.0.md">v0.5.0</a> (end July 2026)</em></p>