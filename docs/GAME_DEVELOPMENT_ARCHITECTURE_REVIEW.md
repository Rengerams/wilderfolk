# Game-development architecture review for Wilderfolk

- **Date:** 2026-08-20
- **Applied guidance:** `miles990/claude-software-skills@game-development`
- **Scope:** Audit integration only; no gameplay contract or tick cadence change

## Purpose

The installed game-development skill provides general patterns for game loops, fixed versus variable timesteps, entity/system separation, spatial hashing, A* pathfinding, rendering separation, and performance optimization. This review maps those patterns onto Wilderfolk’s existing authority rather than replacing the project’s documented architecture.

## Compatibility assessment

| Skill pattern | Wilderfolk implementation | Decision |
|---|---|---|
| Fixed or hybrid timestep | `gameTick()` advances the authoritative simulation at the documented 72 ticks per day; rendering and animation remain presentation concerns | **Keep.** This matches the authority’s fixed production cadence. Do not introduce a second accumulator or change tick cadence. |
| Input → update → render separation | Worker commands enter through `applyWorkerCommand`; `gameTick` runs the four fixed layers; the main thread renders worker-owned state | **Keep and enforce.** This is the project’s authoritative boundary. |
| ECS-style data/systems separation | `Entity` and `WorldState` are plain simulation data; domain modules and tick layers act as systems | **Use conceptually, not mechanically.** A full ECS rewrite would violate the authority’s smallest-change rule and create migration risk. |
| Spatial hash / broad-phase queries | `spatialGrid.ts` and adaptive spatial queries are already used for nearby social, movement, hunt, and proximity work | **Keep.** New realtime queries must use the grid or document an exception. |
| A* pathfinding | `pathfinding.ts` owns A* and `humanMovement.ts` requests cached paths | **Keep.** The connected runtime cache-key drift was repaired; duplicate movement owners remain a governance risk. |
| Fixed update plus variable render interpolation | Worker simulation state is authoritative and the renderer consumes snapshots/deltas | **Keep.** Do not move gameplay writes into React or render helpers. |
| Finite-state-machine AI | Human behavior is currently represented by schedule, relationship, needs, and cadence gates | **Do not introduce globally.** A broad FSM would duplicate existing decision ownership. Use named transitions only where a concrete bug requires them. |
| Object pooling | The game already has bounded visual/effect collections and transient caches | **Defer.** No measured allocation hotspot from this audit justifies a new pool abstraction. |

## Architectural strengths confirmed

`gameTick.ts` is a thin orchestrator and retains the documented four-layer order: realtime, systems, assignment, and daily. `decisionRegistry.ts` provides a static ownership table rather than a runtime manager or event bus. `simulationInvariants.ts` provides executable state checks. `spatialGrid.ts` and the pathfinding module apply the broad-phase and A* patterns in a manner compatible with the current Web Worker architecture.

The command path also matches an authoritative-client pattern: the worker-owned `WorldState` is authoritative, while optimistic main-thread feedback is temporary and reconciled by the worker command result. This should not be replaced with generic client prediction because Wilderfolk is a single-player simulation and its existing command contract is already explicit.

## Confirmed architectural risk

The connected project still contains both `src/game/humanMovement.ts` and `src/game/simulation/humanMovement.ts`. `humanTick.ts` executes the `simulation/` copy, which is now repaired, but two implementations remain a split-brain risk. The safe follow-up is to verify every import and then either remove the unused copy or convert it into a compatibility re-export. Do not make both files independently authoritative.

## Required audit rules derived from the skill and project authority

1. Preserve `gameTick` as the single fixed-update owner and keep rendering outside simulation mutation boundaries.
2. Keep one domain owner per decision; do not introduce an ECS manager, event bus, or new tick layer merely to organize code.
3. Route all realtime proximity work through the spatial grid where applicable.
4. Keep A* cache keys stable at terrain-tile granularity and invalidate them when terrain or destination identity changes.
5. Treat entity data as state and domain modules as systems, but do not mechanically rewrite the current object model without measured benefit.
6. Require focused behavior tests, invariant tests, TypeScript, full-suite validation, and a seeded/performance measurement for hot-path changes.

## Simulation Change Record

- **Owner module:** `gameTick.ts`, tick layers, domain helpers, and `decisionRegistry.ts`
- **Decision changed:** None; this is an architecture review and rule mapping
- **Cadence:** Existing 72-tick production cadence preserved
- **State fields written:** None by this review
- **Why the change is needed:** Apply external game-development patterns without creating a second architecture or violating project authority
- **Player-visible behavior before:** Existing authoritative worker simulation and renderer separation
- **Player-visible behavior after:** No gameplay change; clearer audit rules for future movement, lifecycle, and rendering changes
- **Performance impact:** No runtime impact
- **New or updated tests:** Existing full-suite, invariant, movement, and pathfinding tests remain required; no gameplay test changes in this review
- **Invariants checked:** Single worker authority, fixed tick-layer order, one owner per decision, spatial-grid use for realtime queries, pregnancy/birth ownership, and command reconciliation
- **Save/migration impact:** None
- **Rollback plan:** Remove this documentation review; no code rollback required

## Conclusion

The installed skill reinforces rather than replaces Wilderfolk’s current architecture. The correct application is **not** a full ECS rewrite or a new generic game engine loop. The highest-value architectural action remains eliminating duplicate movement ownership and adding direct lifecycle golden tests while preserving the documented worker authority and cadence.
