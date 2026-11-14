import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, JobType } from '../src/game/gameTypes';
import { ensureEntitySkills } from '../src/game/skills';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { estimateWorkshopGold } from '../src/game/workshopEconomy';
import { gameTick } from '../src/game/gameTick';
import { DEFAULT_WORKSHOP_RECIPE_ID, getWorkshopRecipe } from '../src/game/workshops';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { tickAtDailyPhase } from '../src/game/dayCycleClock';

/** `furniture` (baseGold 10) rather than the default `wooden_goods` (4), so the floors are not blunt. */
const RECIPE = 'furniture';
/** `getScheduleProductivityMultiplier` floors at 0.65, reached at fatigue 100. */
const MAX_FATIGUE = 100;

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
  worker.workerBuildingId = SHOP_ID;
  // A worker completed the actual scheduled shift; assignment alone earns no output.
  worker.scheduleLastWorkedHours = 9;
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
 * `estimateWorkshopGold` is the number the building panel prints as `→ ~N gold / 2 days`, so it must
 * track production's own assembly: workers, level, terrain, adjacency, festival, skill, fatigue and window.
 */
describe('the workshop gold estimate tracks production (L6)', () => {
  it('falls with schedule fatigue, and with a short work window', () => {
    const { state, shop, worker } = world();
    worker.scheduleFatigue = 0;
    const rested = estimateWorkshopGold(state, shop);
    expect(rested, 'the fixture must produce a positive baseline estimate').toBeGreaterThan(0);

    worker.scheduleFatigue = MAX_FATIGUE;
    const tired = estimateWorkshopGold(state, shop);
    // Schedule fatigue must lower the estimate, as it lowers production.
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
    worker.workerBuildingId = undefined;

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
  // Assigned to the shop the way production counts workers (`workerBuildingId`).
  worker.workerBuildingId = SHOP_ID;
  // A worker completed the actual scheduled shift; assignment alone earns no output.
  worker.scheduleLastWorkedHours = 9;
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
  state.tick = tickAtDailyPhase(2, 'production') - 1;
  return state;
}

function tickOnce(state: WorldState): void {
  gameTick(state);
  expect(state.tick, 'fixture premise: the noon economy layer ran').toBe(tickAtDailyPhase(2, 'production'));
}

/**
 * The workshop spends a recipe's inputs only when the gold headroom accepts the whole output: the cap
 * is tested before crediting, so every announced `+N gold · <recipe>` means one full recipe.
 */
describe('E-4 — the workshop does not spend a full recipe on a partial credit', () => {
  it('refuses the whole cycle at cap − 1 gold, consuming no inputs', () => {
    const state = workshopWorld(GOLD_CAP - 1);
    tickOnce(state);

    // At cap − 1 the whole cycle is refused: no gold credit and no inputs spent.
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
 * The workshop inspector must not advertise "~0 gold / 2 days" on a completed but unstaffed shop:
 * `estimateWorkshopGold` returns 0 unless the caller asks for the one-worker preview.
 */
describe('the estimate reads the attendance the production owner pays', () => {
  it('does not price a second assigned worker who never attended', () => {
    const { state, shop } = world();
    const baseline = estimateWorkshopGold(state, shop);
    expect(baseline).toBeGreaterThan(0);

    const master = createEntity(EntityType.Human, 300, 300, 2, 100, false, { name: 'Master' });
    master.alive = true;
    master.isJuvenile = false;
    master.age = 40;
    master.workerBuildingId = shop.id;
    // A master on the roster with no attendance sample: assigned, never at the post today.
    ensureEntitySkills(master).blacksmith = 100;
    state.entities.push(master);

    expect(estimateWorkshopGold(state, shop)).toBe(baseline);
  });

  it('pays nothing for a rest day, matching the production pass', () => {
    const state = workshopWorld(1_000);
    const worker = state.entities[0];
    // The rota credited a full scheduled shift, but no tick at the post was witnessed today.
    worker.scheduleWorkedTicksToday = 9 * 12;
    worker.schedulePresentTicksToday = 0;
    worker.scheduleLastWorkedHours = 9;

    expect(estimateWorkshopGold(state, state.buildings[0])).toBe(0);

    tickOnce(state);
    expect(state.resources.gold).toBe(1_000);
  });
});

describe('estimateWorkshopGold unstaffed preview', () => {
  it('returns 0 for an unstaffed workshop unless the preview is requested', () => {
    const { state, workshop } = worldWithWorkshop();

    expect(workshop.occupants).toHaveLength(0);
    expect(estimateWorkshopGold(state, workshop)).toBe(0);
    expect(estimateWorkshopGold(state, workshop, { previewUnstaffed: true })).toBeGreaterThan(0);
  });
});
