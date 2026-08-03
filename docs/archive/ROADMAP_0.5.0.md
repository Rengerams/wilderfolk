# Wilderfolk v0.5.0 — shipped archive

**Status:** **Shipped** 2026-07-30 · `GAME_VERSION = 0.5.0`  
**Player tagline:** *The valley scales — kin, beasts, and forge-steel.*

This file is the **developer archive** for the 0.5 milestone. It is **not** a live todo list.

| Audience | Read this |
|----------|-----------|
| Players / store page | [../../README.md](../../README.md) · [../MARKETING_v0.5.0.md](../MARKETING_v0.5.0.md) |
| Shipped features by version | [../../ROADMAP.md](../../ROADMAP.md) |
| Release notes | [../../CHANGELOG.md](../../CHANGELOG.md) `[0.5.0]` |
| In-game Progress → Roadmap | `src/game/roadmapContent.ts` (must stay in sync with ROADMAP.md) |
| Deep eng notes | `docs/private/TECHNICAL.md` (gitignored) |

---

## What 0.5 delivered

Four pillars (player-facing):

1. **Scale** — Spatial grids, opt-in Web Worker sim, OffscreenCanvas, alive-only entities; **render SoA** is transfer-only (TypedArray pack), sim stays object arrays  
2. **Trust** — Sim honesty + **save allow-list** (`saveSchema.ts`): domain state + `valleyStage` persist; grids/SoA buffers **rebuild**, not serialize  
3. **Steel** — Forge tier 5 (iron swords, scale mail, tower ballistae) + Armament checklist  
4. **Life** — Hotel, valley stages (Nature UI + toasts; Strained = gentle hunt yield + cues), elections, painted map, 72 ticks/day  

**Saves:** Continue colonies from **0.4 / 0.4.1 / 0.4.2** into **0.5.0**.  
**Precision deep-dive:** [PRECISION_NOTES_v0.5.md](./PRECISION_NOTES_v0.5.md)

---

## North star (kept for history)

Large maps with **100–300 settlers** should feel smooth; performance stays invisible; food chain and prep-focused combat stay the fantasy.

---

## Post-0.5 engineering (optional)

Further perf/UI polish lives in private trackers (`docs/private/OPEN_PROBLEMS.md`, `docs/private/BUGS_TRACKER.md`) — not duplicated here so this file does not fight [ROADMAP.md](../../ROADMAP.md).

---

*Supersedes the pre-ship P0 checklist (July 2026). Do not reopen “version bump” or “end of July tag” as open work.*
