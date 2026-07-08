import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initGame } from '@/game/gameEngine';
import { createInitialView } from '@/game/viewState';
import { saveGame, loadGame } from '@/game/saveLoad';
import { ENTITY_PERSISTED_FIELDS } from '@/game/saveSchema';
import { EntityType, JobType } from '@/game/gameTypes';
import {
  isPlayerHuman,
  playerHumanCount,
  sendRivalGift,
  spawnVisitorGroup,
  tickVisitorGroups,
  tickRivalSettlements,
} from '@/game/groupEvents';
import { createEntity } from '@/game/worldGen';
import { transformToWerewolfForm } from '@/game/moonHowler';
import { gainSkill } from '@/game/skills';
import { freshState } from '@/test/fixtures/gameFixtures';
import { TICKS_PER_DAY } from '@/game/dayCycle';
import { getTradeHubCenter, tryAdvanceCaravanLeg } from '@/game/tradeCaravans';
import { initTradeRoutes } from '@/game/economy';

describe('Batch T — save/trade/groupEvents', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('T-H2/T-H17: trade caravan merchants are excluded from player population', () => {
    const state = initGame();
    const before = playerHumanCount(state.entities);
    const carrier = createEntity(EntityType.Human, 100, 100, 999, 300, false, {
      name: 'Trader',
      gender: 'male',
    });
    carrier.faction = 'trade_caravan';
    carrier.job = JobType.Merchant;
    carrier.residenceBuildingId = undefined;
    carrier.homeBuildingId = undefined;
    state.entities.push(carrier);

    expect(isPlayerHuman(carrier)).toBe(false);
    expect(playerHumanCount(state.entities)).toBe(before);
  });

  it('T-H15/T-M35: skills and moonHowlerSaved survive save/load', () => {
    const world = initGame();
    const human = world.entities.find((e) => e.type === EntityType.Human && isPlayerHuman(e))!;
    gainSkill(world, human.id, JobType.Farmer, 12);
    transformToWerewolfForm(human);
    expect(human.moonHowlerSaved).toBeDefined();

    const view = createInitialView(world.width, world.height);
    saveGame(world, view);
    const loaded = loadGame();
    expect(loaded).not.toBeNull();

    const reloaded = loaded!.world.entities.find((e) => e.id === human.id)!;
    expect(reloaded.skills[JobType.Farmer]).toBe(12);
    expect(reloaded.moonHowlerSaved?.job).toBeDefined();
    expect(ENTITY_PERSISTED_FIELDS).toContain('skills');
    expect(ENTITY_PERSISTED_FIELDS).toContain('moonHowlerSaved');
  });

  it('T-M23: totalBuildingsCompleted is recounted from completed player buildings on load', () => {
    const world = initGame();
    world.totalBuildingsCompleted = 999;
    const completed = world.buildings.filter((b) => b.completed && b.faction !== 'rival').length;
    const view = createInitialView(world.width, world.height);
    saveGame(world, view);
    const loaded = loadGame();
    expect(loaded!.world.totalBuildingsCompleted).toBe(completed);
    expect(loaded!.world.totalBuildingsCompleted).not.toBe(999);
  });

  it('T-M5: visitor daysLeft does not decrement on arrival day', () => {
    const state = freshState();
    state.tick = 5;
    const allAlive = [...state.entities.filter((e) => e.alive)];
    spawnVisitorGroup(state, allAlive, state.buildings, 'traders');
    const group = state.visitorGroups[0];
    const initialDays = group.daysLeft;

    state.tick = TICKS_PER_DAY;
    tickVisitorGroups(state, allAlive);
    expect(group.daysLeft).toBe(initialDays);

    state.tick = TICKS_PER_DAY * 2;
    tickVisitorGroups(state, allAlive);
    expect(group.daysLeft).toBe(initialDays - 1);
  });

  it('T-M7: caps tense rival reputation drain per calendar day', () => {
    const state = freshState();
    state.tick = TICKS_PER_DAY;
    state.villageReputation = 50;
    state.rivalSettlements = [
      {
        id: 'r1', name: 'A', campX: 10, campY: 10, population: 4, entityIds: [], buildingIds: [],
        relationship: 'tense', foundedYear: 0, daysUntilAction: 10, raidCooldownDays: 30, peaceTreatyDays: 0,
      },
      {
        id: 'r2', name: 'B', campX: 20, campY: 20, population: 4, entityIds: [], buildingIds: [],
        relationship: 'tense', foundedYear: 0, daysUntilAction: 10, raidCooldownDays: 30, peaceTreatyDays: 0,
      },
      {
        id: 'r3', name: 'C', campX: 30, campY: 30, population: 4, entityIds: [], buildingIds: [],
        relationship: 'tense', foundedYear: 0, daysUntilAction: 10, raidCooldownDays: 30, peaceTreatyDays: 0,
      },
    ];
    vi.spyOn(Math, 'random').mockReturnValue(0);

    tickRivalSettlements(state, state.entities);
    expect(state.villageReputation).toBeGreaterThanOrEqual(46);
  });

  it('T-M9: sendRivalGift is a no-op when rival is already friendly', () => {
    const state = freshState();
    state.resources.food = 100;
    state.rivalSettlements = [{
      id: 'r1', name: 'Friends', campX: 10, campY: 10, population: 4, entityIds: [], buildingIds: [],
      relationship: 'friendly', foundedYear: 0, daysUntilAction: 10, raidCooldownDays: 30, peaceTreatyDays: 0,
    }];

    const next = sendRivalGift(state, 'r1');
    expect(next.resources.food).toBe(100);
    expect(next.rivalSettlements[0].relationship).toBe('friendly');
    expect(next).not.toBe(state);
  });

  it('T-M28: removeCarrier prunes merchant from entities', () => {
    const state = initGame();
    state.tradeRoutes = initTradeRoutes().map((r) =>
      r.id === 'trade_1' ? { ...r, active: true, partnerX: 120, partnerY: 120, caravanLeg: 'inbound' as const } : r,
    );
    const route = state.tradeRoutes.find((r) => r.id === 'trade_1')!;
    const hub = getTradeHubCenter(state);
    const carrier = createEntity(EntityType.Human, hub.x, hub.y, 8001, 300, false, { gender: 'male' });
    carrier.faction = 'trade_caravan';
    carrier.groupId = 'trade_1';
    state.entities.push(carrier);
    route.caravanCarrierId = carrier.id;
    state.resources = { wood: 200, stone: 200, food: 200, gold: 0 };

    const beforeLen = state.entities.length;
    tryAdvanceCaravanLeg(state, carrier);

    expect(state.entities.some((e) => e.id === carrier.id)).toBe(false);
    expect(state.entities.length).toBe(beforeLen - 1);
    expect(route.caravanCarrierId).toBeUndefined();
  });
});