# R4 Rival-camp Presence, Chronicle, and Map Readability — Objective Report

**Status:** verified
**Date:** 2026-08-21
**Owner:** `rivalPresence.ts` read-only selectors, `FrontierPanel.tsx` rival presentation, and `renderer/markers.ts` map presentation
**Cadence:** presentation reads authoritative snapshots; no new simulation cadence

## Player outcome

Rival camps now communicate more than a name and relationship. The Frontier panel shows stance, current activity, latest contact and a compact recent history derived from the existing event log. Map markers show population, relationship, treaty or latest daily activity when the map is sufficiently zoomed in. Existing camp focus, raid, diplomacy, gift, and peace interactions remain unchanged.

## Presence contract

| Signal | Source | Presentation |
|---|---|---|
| Stance | `rival.relationship` | Friendly neighbor, neutral neighbor, competitive neighbor, or tense border |
| Activity | bounded profile `lastAction` and treaty state | Trading, recovering, preparing, scouting, under treaty, or quiet |
| Latest contact | newest matching event-log entry or pending diplomacy title | Read-only summary |
| History | up to three newest matching event-log messages | Compact FrontierPanel history line |
| Map cue | profile action, treaty, relationship and population | Camp marker subtitle |

The selectors normalize legacy profiles without mutating state. The renderer reads snapshot values only and does not create events, alter relationships, or write profile fields.

## Simulation Change Record

- Owner boundary: `rivalPresence.ts` owns only pure/read-only derivation; existing `rivalEvents.ts`, `groupEvents.ts`, and `eventLog.ts` remain authoritative state owners.
- State and persistence: No new state field or save migration was added. R4 reads R1/R2/R3 fields and the existing bounded event log.
- Cadence: No new tick layer, realtime loop, or map-side simulation action was introduced.
- Presentation: FrontierPanel and rival map markers use read-only selectors and existing snapshot/camera pipelines.
- Invariants: No player-resource mutation, no relationship/treaty mutation, no worker command, no entity lifecycle change, no staffing change, and no change to School, Church, Town Hall, schedules, fatigue, or raid ownership.
- Non-goals: Full chronological per-rival history storage, new map entities, camp animation simulation, and browser-live Q2 verification remain separate follow-up work.

## Validation

| Check | Result |
|---|---:|
| Focused R4/profile/diplomacy/render tests | 3 files, 16 tests passed |
| TypeScript | Passed |
| Production build | Passed; known circular and >500 kB warnings remain |
| ESLint | Passed |
| `git diff --check` | Passed |

## Remaining quality work

Q2 live browser-worker scenarios remain open. T1 still tracks the renderer/game circular chunk and the large `game` chunk. R4 itself is complete for the bounded read-only presence/history slice.
