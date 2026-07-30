# Wilderfolk Roadmap

*Last updated: **July 30, 2026** · playing **v0.5.0** · *The valley scales — kin, beasts, and forge-steel.*

Newest version first. Detail → [CHANGELOG.md](CHANGELOG.md) · [ROADMAP_0.5.0.md](ROADMAP_0.5.0.md)

---

## v0.5.0 — The valley scales

**Shipped:** 2026-07-30 · `GAME_VERSION` **0.5.0** · continue **0.4 → 0.5** colonies

| | Feature |
|:--:|---------|
| 🟢 | **Scale** — spatial grids, Web Worker sim, OffscreenCanvas, alive-only entities |
| 🟢 | **Trust** — moon Howlers, housing, raids, immigration, hunt cadence |
| 🟢 | **Steel** — forge tier 5: swords, scale mail, tower ballistae |
| 🟢 | **Life** — elections, valley stages, hotel, painted map, 72 ticks/day |
| 🟢 | Custody mother → father → grandma · raids that matter · Armament checklist |
| 🟢 | Intro v0.5 ribbon · save continue from 0.4 |

### July 8, 2026 — Victory, trade & raid rewards (in code)

| Area | What shipped |
|------|----------------|
| **Raid XP** | `rewardRaidParticipants()` — Guard XP 0.3–1.1 by outcome; leader bonus; rep feeds `getIncumbentRecordAssessment()` at elections |
| **Eco-Utopia** | 250 humans + ecosystem ≥80% for 20 years |
| **Great City** | 400 humans + 60 completed player buildings |
| **Trade Empire** | All 7 routes active; 40 merchant round-trips; 50,000 gold from caravan trade (`goldFromTradeRoutes`) |
| **Harmony** | 8 **untamed** wolves (`tamedBy == null`) + 15 wildkin — taming via Taming Post does **not** count |
| **Caravans** | `establishTradeRoute` → walking merchant; export at partner, import at village; Progress → Trade shows leg status |

Detail → [CHANGELOG.md](CHANGELOG.md) `[0.5.0]` · [TECHNICAL.md](TECHNICAL.md)

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