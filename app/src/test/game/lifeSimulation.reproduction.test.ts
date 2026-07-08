import { describe, expect, it, vi, afterEach } from 'vitest';
import { withRandomSequence } from '@/test/helpers/seededRandom';
import { assertSimInvariants } from '@/test/helpers/simInvariants';
import { initGame, gameTick } from '@/game/gameEngine';
import { createEntity } from '@/game/worldGen';
import { EntityType } from '@/game/gameTypes';
import {
  assignMissingResidences,
  PREGNANCY_TICKS,
  REPRODUCTION_COOLDOWN_TICKS,
  TICKS_PER_DAY,
  ticksForDays,
} from '@/game/dayCycle';
import { tryDailyConception, type TickContext } from '@/game/lifeSimulation';
import { isPlayerHuman } from '@/game/groupEvents';
import { freshState, makeCompletedHouse } from '@/test/fixtures/gameFixtures';

function marriedCoupleInHouse(state: ReturnType<typeof initGame>) {
  const house = makeCompletedHouse(state, 1, state.width / 2);
  const father = createEntity(EntityType.Human, house.x + 10, house.y + 10, 101, 400, false, {
    gender: 'male',
    generation: 1,
    surname: 'Founder',
  });
  const mother = createEntity(EntityType.Human, house.x + 12, house.y + 10, 102, 400, false, {
    gender: 'female',
    generation: 1,
    surname: 'Founder',
  });
  father.relationshipStatus = 'married';
  mother.relationshipStatus = 'married';
  father.partnerId = mother.id;
  mother.partnerId = father.id;
  father.age = 30;
  mother.age = 28;
  father.isJuvenile = false;
  mother.isJuvenile = false;
  mother.pregnant = false;
  mother.pregnancyProgress = 0;
  mother.reproductionCooldown = 0;
  state.entities = [father, mother];
  assignMissingResidences(state.entities, state.buildings);
  return { father, mother, house };
}

function minimalTickCtx(state: ReturnType<typeof initGame>): TickContext {
  const alive = state.entities.filter((e) => e.alive);
  const byType = { [EntityType.Human]: alive } as TickContext['byType'];
  const playerHumans = alive.filter(isPlayerHuman);
  const entityById = new Map(alive.map((e) => [e.id, e]));
  const buildingById = new Map(state.buildings.map((b) => [b.id, b]));
  return {
    width: state.width,
    height: state.height,
    hourOfDay: 0,
    season: state.season,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 0,
    canHeat: true,
    byType,
    newEntities: [],
    updatedBuildings: state.buildings,
    roadBuildings: [],
    playerHumans,
    entityById,
    buildingById,
    predators: [],
  };
}

describe('human reproduction tuning', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses a ~60-day pregnancy and ~150-day postpartum cooldown', () => {
    expect(PREGNANCY_TICKS).toBe(ticksForDays(60));
    expect(REPRODUCTION_COOLDOWN_TICKS).toBe(ticksForDays(150));
  });

  it('tryDailyConception respects reproduction cooldown', () => {
    const state = freshState();
    const { mother } = marriedCoupleInHouse(state);
    mother.pregnant = false;
    mother.reproductionCooldown = 10;
    vi.spyOn(Math, 'random').mockReturnValue(0);
    tryDailyConception(state, minimalTickCtx(state), mother);
    expect(mother.pregnant).toBeFalsy();
  });

  it('tryDailyConception can start pregnancy once per day when housed together', () => {
    withRandomSequence([0.001], () => {
      const state = freshState();
      const { mother, father } = marriedCoupleInHouse(state);
      mother.pregnant = false;
      tryDailyConception(state, minimalTickCtx(state), mother);
      expect(mother.pregnant).toBe(true);
      expect(mother.relationshipStatus).toBe('expecting');
      expect(father.flash).toBeGreaterThan(0);
    });
  });

  it('delivers birth after final gestation day and keeps postpartum cooldown', () => {
    let state = freshState();
    state.resources.food = 20000;
    const { mother, father, house } = marriedCoupleInHouse(state);
    mother.pregnant = true;
    mother.pregnancyProgress = PREGNANCY_TICKS - TICKS_PER_DAY;
    mother.relationshipStatus = 'expecting';
    mother.energy = mother.maxEnergy;
    father.energy = father.maxEnergy;
    mother.x = house.x + house.width / 2;
    mother.y = house.y + house.height / 2;

    for (let t = 0; t < TICKS_PER_DAY; t++) {
      state = gameTick(state);
    }

    const motherAfter = state.entities.find((e) => e.id === mother.id);
    expect(motherAfter?.alive).toBe(true);
    expect(motherAfter?.pregnant).toBe(false);
    expect(motherAfter?.reproductionCooldown).toBeGreaterThan(0);
    expect(state.entities.some((e) => e.alive && isPlayerHuman(e) && e.isJuvenile)).toBe(true);
  });

  it('blocks a second conception during postpartum cooldown', () => {
    const state = freshState();
    const { mother } = marriedCoupleInHouse(state);
    mother.pregnant = false;
    mother.reproductionCooldown = REPRODUCTION_COOLDOWN_TICKS;
    vi.spyOn(Math, 'random').mockReturnValue(0);
    tryDailyConception(state, minimalTickCtx(state), mother);
    expect(mother.pregnant).toBeFalsy();
  });

  it('does not conceive with a visitor lover when ctx.playerHumans excludes visitors', () => {
    const state = freshState();
    const { mother, father } = marriedCoupleInHouse(state);
    const visitorLover = createEntity(EntityType.Human, mother.x + 10, mother.y + 10, 201, 400, false, {
      gender: 'male',
      generation: 1,
      surname: 'Visitor',
    });
    visitorLover.faction = 'visitor';
    visitorLover.isJuvenile = false;
    visitorLover.age = 30;
    state.entities.push(visitorLover);

    mother.affairPartnerId = visitorLover.id;
    visitorLover.affairPartnerId = mother.id;
    mother.affairProgress = 100;
    visitorLover.affairProgress = 100;
    mother.pregnant = false;
    mother.energy = mother.maxEnergy;
    mother.reproductionCooldown = 0;
    father.x = mother.x + 500;
    father.y = mother.y + 500;
    mother.residenceBuildingId = undefined;
    father.residenceBuildingId = undefined;

    vi.spyOn(Math, 'random').mockReturnValue(0);
    const ctx = minimalTickCtx(state);
    ctx.entityById.set(visitorLover.id, visitorLover);
    tryDailyConception(state, ctx, mother);

    expect(mother.pregnant).toBeFalsy();
  });

  it('married women can conceive from affairs when spousal conception fails', () => {
    const state = freshState();
    const { mother, father } = marriedCoupleInHouse(state);
    const lover = createEntity(EntityType.Human, mother.x + 10, mother.y + 10, 201, 400, false, {
      gender: 'male',
      generation: 1,
      surname: 'Lover',
    });
    lover.isJuvenile = false;
    lover.age = 30;
    lover.relationshipStatus = 'married';
    lover.partnerId = 999;
    state.entities.push(lover);

    mother.affairPartnerId = lover.id;
    lover.affairPartnerId = mother.id;
    mother.affairProgress = 100;
    lover.affairProgress = 100;
    mother.pregnant = false;
    mother.energy = mother.maxEnergy;
    mother.reproductionCooldown = 0;
    // Away from shared home so spousal conception does not win the daily roll.
    mother.x = state.width / 2 + 200;
    mother.y = state.height / 2 + 200;
    lover.x = mother.x + 10;
    lover.y = mother.y + 10;
    father.x = mother.x + 500;
    father.y = mother.y + 500;
    mother.residenceBuildingId = undefined;
    father.residenceBuildingId = undefined;

    vi.spyOn(Math, 'random').mockReturnValue(0);
    tryDailyConception(state, minimalTickCtx(state), mother);

    expect(mother.pregnant).toBe(true);
    expect(mother.pregnantById).toBe(lover.id);
    expect(mother.relationshipStatus).toBe('married');
  });

  it('delivers on the final pregnancy tick via gameTick', () => {
    let state = freshState();
    state.resources.food = 20_000;
    const { mother, house } = marriedCoupleInHouse(state);
    mother.pregnant = true;
    mother.pregnancyProgress = PREGNANCY_TICKS - 1;
    mother.x = house.x + house.width / 2;
    mother.y = house.y + house.height / 2;
    state.paused = false;
    state.tick = 1;

    const before = state.entities.length;
    state = gameTick(state);

    const motherAfter = state.entities.find((e) => e.id === mother.id)!;
    const juveniles = state.entities.filter((e) => e.alive && isPlayerHuman(e) && e.isJuvenile);

    expect(state.entities.length).toBeGreaterThan(before);
    expect(juveniles.length).toBe(1);
    expect(motherAfter.pregnant).toBe(false);
    expect(motherAfter.reproductionCooldown).toBe(REPRODUCTION_COOLDOWN_TICKS);
    assertSimInvariants(state);
  });
});