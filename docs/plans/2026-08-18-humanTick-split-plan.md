# humanTick.ts → simulation/ domain modules — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink `src/game/humanTick.ts` (2,211 lines) by extracting the four remaining domain modules the review target lists — `humanMovement.ts`, `humanNeeds.ts`, `humanSocial.ts`, `humanLifecycle.ts` — keeping `tickHumans` as the orchestrator with **zero behavior change**.

**Architecture:** The `simulation/` module group already owns relationships (`humanRelationships.ts`) and entity bookkeeping (`simulationEntities.ts`). This plan finishes the job: move the still-local helpers in `humanTick.ts` into sibling modules, import them back, and leave the tick loop's control flow untouched. Pure moves first (safe), inline-phase extraction last (birth).

**Tech Stack:** TypeScript strict (`verbatimModuleSyntax`, `noUnusedLocals`), Vitest (222 tests), no new deps.

**Spec:** Target structure from the v0.6 review (lifeSimulation extraction plan, pasted 2026-08-18): `humanLifecycle` (pregnancy/birth/aging/death/children/residence), `humanMovement` (schedules/commute/flee/hunting/pathing), `humanSocial` (greetings/banter/dialogue/schoolyard), `humanNeeds` (hunger/illness/hospital/education). `humanRelationships.ts` + `simulationEntities.ts` already exist.

## Global Constraints

- **Zero behavior change** — extraction only; no reordering, no logic edits. The plan's own rule: "Do not optimize or redesign while extracting; first preserve behavior, then optimize in separate commits."
- **No circular imports** — new modules import types/utilities from leaves (`simulationTypes`, `simulationEntities`, `dayCycle`, `hospitalCare`), never from `humanTick.ts`. `humanTick.ts` imports FROM the modules.
- **Gates after every task:** `npx tsc -b` → `npm run lint` → `npx vitest run` (222 must stay green) → `npm run build`.
- **Commit per task**, conventional `refactor(sim): …`.
- **Do not rebuild `allHumans`/grids inside extracted functions** — pass them in via parameters.
- Module path: `src/game/simulation/<Module>.ts`, imported by `humanTick.ts` as `./simulation/<Module>`.

---

### Task 1: `simulation/humanMovement.ts` — the commute helpers (pure move)

**Files:**
- Create: `src/game/simulation/humanMovement.ts`
- Modify: `src/game/humanTick.ts` (remove lines 237–330 block; import the module)

**Interfaces:**
- Consumes: `Entity`, `Building`, `WorldState` (`../gameTypes`), `config`/speed constants, `steerWithPath` (`../pathfinding`), `isEntityOnBuilding`, `queryIsNearRoad` (as today).
- Produces (all exported, same signatures as today):
  ```ts
  export function homeStandPosition(building: Building, entityId: number): { x: number; y: number }
  export const COMMUTE_SNAP_DISTANCE = 130;
  export function humanBuildingTarget(building: Building, arrivingHome: boolean, entityId: number): { x: number; y: number }
  export function commuteDistanceToBuilding(entity: Entity, building: Building): number
  export function snapHumanToBuilding(entity: Entity, building: Building, arrivingHome: boolean): void
  export function commuteHumanToBuilding(entity: Entity, building: Building, config: SpeciesConfig, roadAvoidance: RoadAvoidanceIndex, roadBuildings: Building[], width: number, height: number): boolean
  export function nearestActiveMoonHowler(e: Entity, werewolves: Entity[] | undefined): Entity | undefined
  ```

- [ ] **Step 1: Read the exact block**

Run: `sed -n '237,331p' src/game/humanTick.ts`
Expected: the `// ============ COMMUTE HELPERS ============` block through the end of `nearestActiveMoonHowler` — self-contained functions using only their parameters + `steerWithPath`, `isEntityOnBuilding`, `queryIsNearRoad`, `TERRAIN_TILE_SIZE` (in `steerWithPath`), `MOBILE_CELL_SIZE`.

- [ ] **Step 2: Create the module**

Create `src/game/simulation/humanMovement.ts`:
```ts
/**
 * Human movement — commuting to home/work, snapping, and Moon Howler proximity.
 * Extracted from humanTick.ts (Task 1, humanTick-split plan) — behavior unchanged.
 */
import type { Building, Entity, WorldState } from '../gameTypes';
import type { RoadAvoidanceIndex } from '../spatialGrid';
import { isEntityOnBuilding } from '../placementUtils';
import { steerWithPath } from '../pathfinding';
import { queryIsNearRoad } from '../simQueries';
// (copy the block EXACTLY — same bodies, same local constants, export each function)
```

- [ ] **Step 3: Cut the block from humanTick.ts**

Replace lines 237–330 (the `// ============ COMMUTE HELPERS ============` comment through the blank line after `nearestActiveMoonHowler`) with nothing, then add to the humanTick import header:
```ts
import { COMMUTE_SNAP_DISTANCE, commuteDistanceToBuilding, commuteHumanToBuilding, homeStandPosition, humanBuildingTarget, nearestActiveMoonHowler, snapHumanToBuilding } from './simulation/humanMovement';
```
Remove any now-unused imports from humanTick.ts (`steerWithPath`, `isEntityOnBuilding`, `queryIsNearRoad` if no longer referenced elsewhere — verify with `npx tsc -b`, `noUnusedLocals` will flag).

- [ ] **Step 4: Verify**

Run: `npx tsc -b && npm run lint && npx vitest run && npm run build`
Expected: all 222 tests pass, lint 0, build ✓. `grep -c "COMMUTE_SNAP_DISTANCE" src/game/humanTick.ts` = 1 (import only).

- [ ] **Step 5: Commit**

```bash
git add src/game/simulation/humanMovement.ts src/game/humanTick.ts
git commit -m "refactor(sim): extract humanMovement.ts (commute/snap/moon-howler helpers) from humanTick.ts — pure move, no behavior change"
```

---

### Task 2: `simulation/humanNeeds.ts` — energy, meals, hunting food

**Files:**
- Create: `src/game/simulation/humanNeeds.ts`
- Modify: `src/game/humanTick.ts` (remove lines 95–111 block + the energy/meal section 737–810 → call the new functions)

**Interfaces:**
- Consumes: `Entity`, `WorldState`, `EntityType`, `Building`, `Season`, `config`.
- Produces:
  ```ts
  export function isMealWindow(hourOfDay: number): boolean          // moved as-is
  export function fract(value: number): number                        // moved as-is
  export function freeHuntFoodGain(preyType: EntityType, state: WorldState): number  // moved as-is
  export function humanEnergyLoss(entity: Entity, opts: { isWinter: boolean; canHeat: boolean; hasWell: boolean; hasHospital: boolean; nearHome: boolean }): number
  ```
  `humanEnergyLoss` is the inline `energyLoss` computation (lines ~737–765: base `config.energyLossPerTick`, winter penalty ×1.5, near-home ×0.75, hospital ×0.9, well ×0.8, `traitMultiplier(entity,'hardy',0.85)`). **Copy the expression exactly** — do not re-derive it.

- [ ] **Step 1: Read the energy section**

Run: `sed -n '735,812p' src/game/humanTick.ts`
Expected: `energyLoss` base → winter/near-home/hospital/well/hardy multipliers, then meals block (`isMealWindow`, `isStartOfClockHour`, food −1, energy +65).

- [ ] **Step 2: Create the module** — move `isMealWindow`, `fract`, `freeHuntFoodGain` verbatim; add `humanEnergyLoss` with the exact inline expression; import `traitMultiplier` from `./personality` (check its current import path in humanTick).

- [ ] **Step 3: Rewire humanTick.ts**
- Remove the three moved helpers from their top-of-file position.
- Replace the inline `energyLoss` computation (base through the `traitMultiplier` line) with:
  ```ts
  const energyLoss = humanEnergyLoss(entity, { isWinter, canHeat, hasWell, hasHospital, nearHome });
  ```
  where `nearHome` is the existing `shouldBeAtHome(hourOfDay) && isNearResidence(entity, buildingById)` expression from the `atHome` const already computed earlier in the loop (verify it is in scope; if not, compute it inline the same way it is today).
- Import the three helpers from `./simulation/humanNeeds`.
- Remove now-unused imports (tsc `noUnusedLocals` flags them).

- [ ] **Step 4: Verify** — gates green, 222 tests. Sanity: `grep -n "humanEnergyLoss" src/game/humanTick.ts` shows 1 import + 1 call.

- [ ] **Step 5: Commit** — `refactor(sim): extract humanNeeds.ts (meals/energy/hunt-food) from humanTick.ts — pure move, no behavior change`

---

### Task 3: `simulation/humanSocial.ts` — chat & banter

**Files:**
- Create: `src/game/simulation/humanSocial.ts`
- Modify: `src/game/humanTick.ts` (remove the chat closures ~440–490; call the module)

**Interfaces:**
- Consumes: `Entity`, `WorldState`, `TickContext`-local values, `maybeDialogueChat` (`./humanChat`), `forEachInEntityGrid` (`../spatialGrid`), `MOBILE_CELL_SIZE`.
- Produces:
  ```ts
  export function settlerChat(entity: Entity, partner: Entity | null, context: HumanChatContext, chance: number, tick: number, chatHints: HumanChatHints, state: WorldState): void
  export function settlerPairChat(a: Entity, b: Entity, context: HumanChatContext, chance: number, tick: number, chatHints: HumanChatHints, state: WorldState): void
  export function ambientChatNeighbors(self: Entity, mobileGrid: EntitySpatialGrid, socialScanRadius: number, allHumans: Entity[]): Entity[]
  ```
  **Mechanical conversion:** the current closures capture `state`, `chatHints`, `mobileGrid`, `allHumans`, `socialScanRadius` from the loop — turn those captured values into parameters. Bodies identical.

- [ ] **Step 1: Read the closures** — `sed -n '440,492p' src/game/humanTick.ts` (settlerChat, settlerPairChat, ambientChatNeighbors).
- [ ] **Step 2: Create the module** with the three functions (captured values → params; `forEachInEntityGrid` + `isPlayerHuman` + `allHumans` passed as today).
- [ ] **Step 3: Rewire** — delete the closures; at the loop top keep the `chatHints`/`socialScanRadius` construction, then call `settlerChat(...)` / `ambientChatNeighbors(entity, mobileGrid, socialScanRadius, allHumans)` at the same call sites (lines ~450, 1835 area). Verify `maybeDialogueChat` import moves to the module.
- [ ] **Step 4: Verify** — gates green, 222 tests. Dialogue rate unchanged (same calls, same chance args).
- [ ] **Step 5: Commit** — `refactor(sim): extract humanSocial.ts (chat/banter helpers) from humanTick.ts — pure move, no behavior change`

---

### Task 4: `simulation/humanLifecycle.ts` — pregnancy & birth (inline phase → function)

**Files:**
- Create: `src/game/simulation/humanLifecycle.ts`
- Modify: `src/game/humanTick.ts` (replace the inline pregnancy/birth block with a call)

**Interfaces:**
- Consumes: the full set the inline block uses today (see the read): `state`, `ctx`, `entity`, `width`, `height`, `byType`, `entityById`, `newEntities`, `livingHumanAt`, `updatedBuildings`, `PREGNANCY_TICKS`, `REPRODUCTION_COOLDOWN_TICKS`, `resolveChildSurname`, `inheritSettlerTraits`, `createEntity`, `pushNewEntity`, `rebuildChildrenIds`, `logEvent`, `addBigNews`, `addNotification`, `addFloatingText`, `createDeathParticles`, `dampScandalReputationLoss`, `allLivingHumans`, `getRandomName`, `setHumanBirthFromAge`, `getColonyDay`, `humanDisplayName`.
- Produces:
  ```ts
  export function tickPregnancyAndBirth(state: WorldState, ctx: TickContext, entity: Entity, opts: { width: number; height: number; livingHumanAt: (id: number | null | undefined) => Entity | undefined }): boolean
  // returns true when a child was born (caller keeps its flash/particle side effects? NO — ALL side effects move into the module; returns nothing meaningful, void)
  ```
  **This is a pure cut:** take the entire `if (isPlayerHuman(entity) && entity.gender === 'female' && entity.pregnant && !conceivedToday && entity.pregnancyProgress !== undefined) { … }` block (pregnancy progress + the full birth body, ending at the closing brace before the loop continues) and move it verbatim into the module as a function; replace it in the loop with:
  ```ts
  if (isPlayerHuman(entity) && entity.gender === 'female' && entity.pregnant && !conceivedToday && entity.pregnancyProgress !== undefined) {
    tickPregnancyAndBirth(state, ctx, entity, { width, height, livingHumanAt });
  }
  ```
  Do NOT touch the surrounding loop flow (the block currently has no `continue` — verify; if it does, keep the caller's `continue` in the loop).

- [ ] **Step 1: Read the full block** — `sed -n '1079,1200p' src/game/humanTick.ts` (it ends at the first blank line after the birth else-branch). List every free variable the block references (grep the block for identifiers; compare against loop-locals) — those become parameters (pass `opts` object for the big ones).
- [ ] **Step 2: Create the module** with `tickPregnancyAndBirth` — the block moved verbatim; imports for every helper it uses (`./entityFactory` `createEntity`, `./simulation/simulationEntities` `pushNewEntity`/`allLivingHumans`, `./dayCycle`, `./simEffects`, `./eventLog`, `./citizenId` `humanDisplayName`, `./humanTick` **NOT allowed** — if the block calls a humanTick-local helper, move that helper into `simulationEntities.ts` or `citizenId.ts` first and import it).
- [ ] **Step 3: Rewire** the loop call + delete the inline block. `npx tsc -b` will enumerate every missed parameter/import — fix each (this is the point of the task; take as many tsc iterations as needed, do NOT change behavior).
- [ ] **Step 4: Verify** — gates green; **222 tests** must stay green (birth/pregnancy tests in `lifeSimulation.*.test.ts`-style suites cover this). Then run a 3-year headless sim smoke: `npx tsx scripts/simulate-10year.ts` (or the shortest sim script) — expected: births occur, no crash.
- [ ] **Step 5: Commit** — `refactor(sim): extract humanLifecycle.ts (pregnancy/birth) from humanTick.ts — pure move, no behavior change`

---

### Task 5: Final sweep — file size + gate lock

**Files:**
- Modify: none required unless tsc flags unused imports.

- [ ] **Step 1: Size check**

Run: `wc -l src/game/humanTick.ts src/game/simulation/*.ts`
Expected: `humanTick.ts` < ~1,600 lines (the four modules absorbed ~600+); `simulation/` holds the domains. (Exact numbers vary; the gate is behavior, not line count.)

- [ ] **Step 2: Cycle check**

Run: `npm run audit` (dependency-cruiser)
Expected: no NEW circular dependency involving `simulation/*` or `humanTick` (existing 65 warnings unchanged — compare `npm run audit` output before/after if noisy; the gate is "no new cycles").

- [ ] **Step 3: Full gates + commit**

```bash
npx tsc -b && npm run lint && npx vitest run && npm run build
git add -A
git commit -m "refactor(sim): humanTick.ts split complete — movement/needs/social/lifecycle modules; tickHumans remains the orchestrator"
```

---

## Self-review notes (checked)

- **Spec coverage:** all four target modules map to Tasks 1–4; `humanRelationships.ts`/`simulationEntities.ts` already exist (out of scope). ✓
- **Placeholder scan:** every task has exact function lists, file paths, move instructions, and gate/commit steps; no "TBD". ✓
- **Type consistency:** exported names in Tasks 1–4 match the import lines given in each task's Steps. `humanEnergyLoss` opts shape matches the inline expression's inputs (isWinter/canHeat/hasWell/hasHospital/nearHome). ✓
- **Risk note:** Task 4 (birth) is the only high-risk step — it is a *pure move* of one contiguous block; if the block calls humanTick-local helpers, the plan says relocate those helpers to leaf modules first (never import `humanTick` from `simulation/*`).
