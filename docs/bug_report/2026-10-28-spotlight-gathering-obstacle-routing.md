# Spotlight gathering does not route around walls or water

- **Bug:** Spotlight participants could get stuck walking directly into a completed wall or water cell rather than reaching a walkable stage slot.
- **Status:** resolved in PR #91 code; CI and browser verification pending
- **Severity:** medium (Codex P2, feature-breaking)
- **Date discovered:** 2026-10-28
- **Version/build:** development PR #91, head 56805a147675264e1f4174dae6512aea853222fd at review
- **Reporter:** [Codex review #4404687464](https://github.com/Rengerams/wilderfolk/pull/91#discussion_r4404687464)
- **Area:** Spotlight lore gathering / realtime human movement
- **Owner module:** `src/game/humanTick.ts` (movement); existing `src/game/pathfinding.ts` (shared route calculation)
- **Related PR:** [#91](https://github.com/Rengerams/wilderfolk/pull/91)

## Status history

- 2026-10-28 — open: Review found direct-only velocity toward a spotlight slot, with no waypoint detour.
- 2026-10-28 — resolved in code: Reused `steerWithPath` for stage travel, preserving the one-step movement integrator; added wall and water real-tick regressions. Tests and browser verification still pending.

## Observed behavior

In the review snapshot, `humanTick.ts` computed `vx/vy` from the straight-line vector toward each slot. When a wall or water cell crossed the line, `applyHumanWalkStep` correctly refused collision but could not invent a route. The actor could stall and the scene's 65-tick gathering timeout could expire, leaving the 90-day cooldown consumed without a performance.

## Expected behavior

A selected actor must use the shared route planner to bypass a passability obstacle if a legal route exists; no actor may cross a blocked cell. Scene attendance, emergency priority, the 9-pixel steering stop and 11-pixel ready radius remain unchanged. Nonparticipant movement must not change.

## Reproduction steps

1. Create a flat test map with a single blocked path cell at (50, 35), either from a completed Wall footprint or a River tile.
2. Start an active spotlight scene with one adult performer at (485, 355) and a valid stage slot at (525, 355); position the heroine and other seven adults at their own slots.
3. Execute successive `gameTick(world)` pulses. Previously, the straight vector pointed into the obstacle; the actor could not reach the slot.

## Evidence

The original PR #91 line 890-891 wrote direct `vx/vy` without calling `steerWithPath`; only the regular movement integrator collision-checked steps. `src/game/pathfinding.ts` already contains cached bounded A* and `steerWithPath` that returns `'path'`, `'direct'`, `'blocked'` or `'arrived'` while writing velocity but never position.

## Root cause

Only destination walkability was considered when selecting the spotlight slots. The actor's later movement branch lacked a route search across blocked intervening cells.

## Fix

For selected spotlight participants, `humanTick` now calls `steerWithPath` with a scene-and-actor-stable cache key. `'path'` keeps its routed velocity; `'direct'` preserves the original straight-line vector; `'blocked'` leaves velocity zero. The existing `applyHumanWalkStep` still integrates exactly once per tick. This uses the shared path cache and limits the new path work to an active cast of at most eleven actors.

## Save / migration impact

None. Spotlight scene schema, cooldown, RNG, script, stage slots and progress/finish rules are unchanged.

## Verification result

- Source trace/review: confirmed direct movement lacked detours.
- Added `tests/spotlightLore.test.ts` real-`gameTick` wall and water regression cases asserting reachability, no blocked-cell crossing and one movement step.
- `npm run test:types`, `npm run lint`, `npm run build`, targeted Vitest, GitHub Actions and live browser: **NOT RUN / not yet confirmed** at time of report.
