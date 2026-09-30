import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { estimateWorkshopGold } from '../src/game/workshopEconomy';
import { gameTick } from '../src/game/gameTick';
import { DEFAULT_WORKSHOP_RECIPE_ID, getWorkshopRecipe } from '../src/game/workshops';
import { TICKS_PER_DAY } from '../src/game/dayCycle';

/** `furniture` (baseGold 10) rather than the default `wooden_goods` (4), so the floors are not blunt. */
const RECIPE = 'furniture';
/** `getScheduleProductivityMultiplier` floors at 0.65, reached at fatigue 100. */
const MAX_FATIGUE = 100;

// `FIXTURE_SEED` (20_260_917), `SHOP_ID` (10) and `WORKER_ID` (1) were declared identically at the top
// of all three original files, so the merged file declares each one once.
const FIXTURE_SEED = 20_260_917;
const SHOP_ID = 10;
const WORKER_ID = 1;

function world(): { state: WorldState; shop: Building; worker: Entity } {
  const state = initGame({ villageName: 'Shop', size: 'medium', seed: FIXTURE_SEED });
  const worker: Entity = createEntity(EntityType.Human, 300, 300, WORKER_ID, 100, false, { name: 'Mira' });
  worker.alive = true;
  worker.isJuvenile = false;
  worker.age = 30;
  // Assigned to the shop the way production counts it — occupation and occupancy both follow from this.
  worker.homeBuildingId = SHOP_ID;
  const shop: Building = {
    id: SHOP_ID, type: BuildingType.Workshop, x: 80, y: 80, width: 40, height: 40,
    occupants: [WORKER_ID], level: 1, constructionProgress: 100, completed: true, health: 100,
    maxHealth: 100, spriteScale: 1, buildAnimTimer: 0, workshopRecipeId: RECIPE,
  };
  state.entities = [worker];
  state.buildings = [shop];
  return { state, shop, worker };
}

/**
 * Audit L6 (`docs/private/audits/2026-09-16/sim-economy-leadership-combat.md`, tracked in
 * `LIVE-FINDINGS-STATUS.md`): `estimateWorkshopGold` is the number the building panel prints as
 * `→ ~N gold / 2 days`, and it drifted from what the workshop actually produces. Production's own
 * assembly is `(1 + workers×0.5) × totalMult × goldMult × globalEff` (`dailyBuildingEconomy.ts:742`),
 * where `totalMult` carries level · terrain · adjacency · festival · skill · **fatigue** ·
 * **work-window** and `globalEff` carries global efficiency · **Town-Hall governance**; the estimate
 * omitted the last three and counted workers by `occupants.length` rather than by `homeBuildingId`.
 *
 * These cases drive the two omitted factors that can be set up without a whole civic apparatus:
 * a tired crew and a short configured work day. Both are asserted as a *band* on the ratio rather than
 * an exact value, because both sides floor and `Math.max(1, …)` the result.
 */
describe('the workshop gold estimate tracks production (L6)', () => {
  it('falls with schedule fatigue, and with a short work window', () => {
    const { state, shop, worker } = world();
    worker.scheduleFatigue = 0;
    const rested = estimateWorkshopGold(state, shop);
    expect(rested, 'the fixture must produce a positive baseline estimate').toBeGreaterThan(0);

    worker.scheduleFatigue = MAX_FATIGUE;
    const tired = estimateWorkshopGold(state, shop);
    // Pre-fix these were equal: fatigue was not in the estimate at all.
    expect(tired).toBeLessThan(rested);
    expect(tired / rested).toBeGreaterThan(0.5); // the owner's floor is 0.65; floors round it down
    expect(tired / rested).toBeLessThan(0.8);

    // A 5-hour work day against the standard 9 → the owner's multiplier is 5/9 ≈ 0.56.
    worker.scheduleFatigue = 0;
    state.workSchedule = { startHour: 7, endHour: 12 };
    const shortDay = estimateWorkshopGold(state, shop);
    expect(shortDay).toBeLessThan(rested);
    expect(shortDay / rested).toBeGreaterThan(0.4);
    expect(shortDay / rested).toBeLessThan(0.7);
  });

  it('reports nothing for a workshop nobody is assigned to', () => {
    const { state, shop, worker } = world();
    // Listed as an occupant but not assigned: production reads `workers === 0` and says "Needs
    // worker", so the estimate must not predict output for it.
    worker.homeBuildingId = undefined;

    expect(estimateWorkshopGold(state, shop)).toBe(0);
    expect(estimateWorkshopGold(state, shop, { previewUnstaffed: true })).toBeGreaterThan(0);
  });
});

/** `furniture`: 10 wood + 2 stone → 10 gold base. */
const PARTIAL_GOLD_RECIPE = 'furniture';
/** `updateStorageCaps` fixes the gold cap at 20 000, so this is one below it. */
const GOLD_CAP = 20_000;

/** A colony whose only building is a staffed workshop, standing on the next production boundary. */
function workshopWorld(gold: number): WorldState {
  const state = initGame({ villageName: 'Shop', size: 'medium', seed: FIXTURE_SEED });
  const worker: Entity = createEntity(EntityType.Human, 300, 300, WORKER_ID, 100, false, { name: 'Mira' });
  worker.alive = true;
  worker.isJuvenile = false;
  worker.age = 30;
  // Assigned to the shop the way production counts workers (`homeBuildingId`).
  worker.homeBuildingId = SHOP_ID;
  const shop: Building = {
    id: SHOP_ID,
    type: BuildingType.Workshop,
    x: 80,
    y: 80,
    width: 40,
    height: 40,
    occupants: [WORKER_ID],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    workshopRecipeId: PARTIAL_GOLD_RECIPE,
  };
  state.entities = [worker];
  state.buildings = [shop];
  state.resources.gold = gold;
  state.resources.wood = 500;
  state.resources.stone = 200;
  // The workshop's interval is two days; land on the tick before a production boundary.
  state.tick = 2 * TICKS_PER_DAY - 1;
  return state;
}

function tickOnce(state: WorldState): void {
  gameTick(state);
  expect(state.tick, 'fixture premise: the daily layer ran').toBe(2 * TICKS_PER_DAY);
}

/**
 * E-4 (`docs/private/audits/2026-09-20/`): the workshop consumed a **full** recipe's inputs while the
 * gold cap accepted only part of the output.
 *
 * The guard was `added > 0`, not `added === amount`, so at gold 19 999 of a 20 000 cap a `furniture`
 * cycle deducted 10 wood + 2 stone, credited 1 gold and announced "+1 gold · Furniture (store full)".
 *
 * The cycle is now all-or-nothing on the gold headroom, tested **before** crediting — a partial
 * credit cannot simply be refused after the fact, because the gold `addResource` accepted would stay
 * in the store with nothing consumed. That keeps every announced string honest: `+N gold · <recipe>`
 * always means one full recipe. (The alternative — consuming inputs in proportion to the part that
 * fitted — would make a fraction of a cycle announce a whole one, and the recipe is priced per cycle.)
 *
 * The roomy case is asserted alongside, so the test cannot pass merely because the workshop stopped
 * producing: it is the cap that changes the outcome, and nothing else.
 */
describe('E-4 — the workshop does not spend a full recipe on a partial credit', () => {
  it('refuses the whole cycle at cap − 1 gold, consuming no inputs', () => {
    const state = workshopWorld(GOLD_CAP - 1);
    tickOnce(state);

    // Pre-fix: gold 20 000 (+1) with wood 490 and stone 198 — a full recipe spent on one gold.
    expect(state.resources.gold).toBe(GOLD_CAP - 1);
    expect(state.resources.wood).toBe(500);
    expect(state.resources.stone).toBe(200);
    expect(state.floatingTexts.some((f) => f.text === 'Stores full!')).toBe(true);
    expect(state.floatingTexts.some((f) => f.text.includes('gold \u00b7'))).toBe(false);
  });

  it('still runs a full cycle when the gold fits, and announces the whole output', () => {
    const state = workshopWorld(1_000);
    const recipe = getWorkshopRecipe(PARTIAL_GOLD_RECIPE);
    tickOnce(state);

    const produced = state.resources.gold - 1_000;
    expect(produced, 'the roomy case must actually produce, or the cap case proves nothing').toBeGreaterThan(1);
    expect(state.resources.wood).toBe(500 - (recipe.inputs.wood ?? 0));
    expect(state.resources.stone).toBe(200 - (recipe.inputs.stone ?? 0));
    expect(state.floatingTexts.some((f) => f.text === `+${produced} gold \u00b7 ${recipe.label}`)).toBe(true);
  });
});

function worldWithWorkshop(): { state: WorldState; workshop: Building } {
  const state = initGame({ villageName: 'Shop', size: 'medium', seed: FIXTURE_SEED });
  const workshop = {
    id: 9_001,
    type: BuildingType.Workshop,
    faction: 'player',
    x: state.width / 2,
    y: state.height / 2,
    completed: true,
    level: 1,
    occupants: [],
    workshopRecipeId: DEFAULT_WORKSHOP_RECIPE_ID,
  } as unknown as Building;
  state.buildings.push(workshop);
  return { state, workshop };
}

/**
 * The workshop inspector must not advertise "~0 gold / 2 days" on a completed but unstaffed shop
 * (ui-logic audit F27). `estimateWorkshopGold` deliberately returns 0 for an unstaffed building
 * unless the caller asks for the one-worker preview, which is what the inspector now passes.
 */
describe('estimateWorkshopGold unstaffed preview', () => {
  it('returns 0 for an unstaffed workshop unless the preview is requested', () => {
    const { state, workshop } = worldWithWorkshop();

    expect(workshop.occupants).toHaveLength(0);
    expect(estimateWorkshopGold(state, workshop)).toBe(0);
    expect(estimateWorkshopGold(state, workshop, { previewUnstaffed: true })).toBeGreaterThan(0);
  });
});
