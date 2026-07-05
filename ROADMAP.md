# Wilderfolk Roadmap

*Last updated: **July 5, 2026** · playing **v0.4.2***

Newest version first. 🟢 done · 🟡 in progress · ⬜ open. Detail → [CHANGELOG.md](CHANGELOG.md) · [ROADMAP_0.5.0.md](ROADMAP_0.5.0.md)

---

## v0.5.0 — Scale + architecture

**Shipped (in code):** 2026-07-05 · **Tag target:** End July 2026 · `GAME_VERSION` still `0.4.2`

| | Feature |
|:--:|---------|
| 🟢 | Election ceremony — gather, gossip, tension, reveal, 3-day Election Revelry |
| 🟢 | Election buildup — year-before notify + settler gossip |
| 🟢 | Incumbent always in race |
| 🟢 | Incumbent record score — economy, scandals, village health (+8 positive cap) |
| 🟢 | Leadership panel, focus hints, contextual tutorial synced |
| 🟢 | Dead-entity compaction — alive-only entities each tick |
| 🟡 | Renderer cache — wire sim byType into render snapshot |
| 🟡 | buildingById go-home — drop commute `.find()` |
| 🟡 | Grass render spatial buckets |
| 🟡 | Benchmark gate — SIM_PROFILE village/town/city + p95 exit |
| 🟡 | simulate:20year — full 172800-tick PASS |
| 🟡 | Sim regression — simulate-30min exit on fail |
| 🟡 | App tab split + memo @ 300 population |
| ⬜ | Spatial grid — graze, hunt, flee, wolf-pack queries |
| ⬜ | Settler count denorm — working/idle on WorldState |
| ⬜ | Incremental entityById — update on birth/death only |
| ⬜ | buildingActions scan cleanup |
| ⬜ | Partner id map for relationship lines |
| ⬜ | Particle / floating-text pooling |
| ⬜ | Web Worker gameTick — sim off main thread |
| ⬜ | OffscreenCanvas layers — terrain vs entities |
| ⬜ | GAME_VERSION 0.5.0 + save migration |
| ⬜ | Big bug checkup after perf refactors |
| ⬜ | Logical invariant checks + full sim battery |
| ⬜ | Manual playtest matrix — large map, 10× |
| ⬜ | Outgoing counter-raid march line + militia sprites |
| ⬜ | Reputation milestone arc UI |
| ⬜ | One visitor multi-step quest chain (Scholars or Nomads) |
| ⬜ | Election Year 10/20 live playtest |
| ⬜ | Footstep / work SFX by surface |
| ⬜ | npm run benchmark:gate — CI wrapper |

---

## v0.4.2 — Craft, walls/guards, juice, UI/UX

**Shipped:** 2026-07-05 · tag `v0.4.2`

| | Feature |
|:--:|---------|
| 🟢 | 6-tab sidebar, alert strip, map build hotbar, tab hotkeys V/F/N/P/L/M |
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
| 🟢 | Frontier raids — defend, barricade, pay off, counter-raid |
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
| 🟢 | Sidebar → 6 tabs; alert strip; map hotbar |
| 🟢 | Focus hints; armament checklist |
| 🟢 | House expand (+2 slots); demolish always visible |
| 🟢 | `npm run simulate:30min` headless sim |

---

<p align="center"><em><strong>v0.4.2 shipped</strong> → <a href="ROADMAP_0.5.0.md">v0.5.0</a> (end July 2026)</em></p>