import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BUILDING_CONFIGS, BuildingType } from '../src/game/buildings';
import { EntityType, MapSize, type Building, type WorldState } from '../src/game/gameTypes';
import {
  INVENTION_FAIR_DEMONSTRATION_TICKS,
  inventionFairEligibleDay,
  maybeOfferInventionFair,
  rollInventionFairOutcome,
  resolveInventionFair,
  tickInventionFair,
  tickInventionFairRealtime,
  getInventionFairChoiceEligibility,
} from '../src/game/inventionFair';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { createSeededRng } from '../src/game/simRng';
import { pickWorldFieldsForSave } from '../src/game/saveSchema';
import { extractSimTickDelta, applySimTickDelta } from '../src/game/simBuffers/simDelta';
import { getStoryChoiceEligibility, respondToStoryEvent } from '../src/game/storyEvents';

function hall(): Building {
  const cfg = BUILDING_CONFIGS[BuildingType.TownHall];
  return {
    id: 9001, type: BuildingType.TownHall, x: 310, y: 270,
    width: cfg.width, height: cfg.height, occupants: [], level: 1,
    constructionProgress: 100, completed: true, health: 100, maxHealth: 100,
    spriteScale: 1, buildAnimTimer: 0,
  };
}

function world(seed = 20261111): WorldState {
  const state = initGame({ seed, size: MapSize.Medium });
  state.storyFlags = {};
  state.pendingStoryEvents = [];
  state.inventionFair = null;
  state.buildings = [hall()];
  state.storageMax.wood = Math.max(state.storageMax.wood, 1000);
  state.storageMax.gold = Math.max(state.storageMax.gold, 1000);
  state.resources.wood = 100;
  state.resources.gold = 100;
  const day = inventionFairEligibleDay(seed) + 1;
  state.year = 0;
  state.dayInYear = day;
  state.tick = day * TICKS_PER_DAY + 18 * TICKS_PER_HOUR;
  const original = state.entities.find((entity) => entity.alive && entity.type === EntityType.Human);
  if (!original) throw new Error('World has no settler');
  original.apprenticeOfId = 7;
  state.nextEntityId = Math.max(state.nextEntityId, ...state.entities.map((entity) => entity.id + 1));
  let count = state.entities.filter((entity) => entity.alive && entity.type === EntityType.Human).length;
  while (count++ < 15) {
    state.entities.push({
      ...structuredClone(original),
      id: state.nextEntityId++,
      apprenticeOfId: undefined,
      age: 25,
      isJuvenile: false,
    });
  }
  state.humanPopulation = 15;
  return state;
}

function fundAndStart(state: WorldState, project: 'fund_low_budget' | 'fund_standard' | 'fund_high_risk'): number {
  maybeOfferInventionFair(state);
  const offerId = state.inventionFair?.activeEventId;
  expect(offerId).toBeTruthy();
  expect(resolveInventionFair(state, project, offerId)).toBe(true);
  expect(state.inventionFair?.stage).toBe('preparation');
  const readyDay = state.inventionFair!.readyDay;
  state.tick = readyDay * TICKS_PER_DAY + 18 * TICKS_PER_HOUR;
  state.dayInYear = readyDay;
  tickInventionFair(state);
  expect(state.inventionFair?.stage).toBe('demonstration');
  return state.tick;
}

describe('The Apprentice’s Terrible Invention Fair — canonical simulation contract', () => {
  it('offers the authored event only with enough settlers, wood, a Hall and an apprentice', () => {
    const state = world();
    state.resources.wood = 29;
    maybeOfferInventionFair(state);
    expect(state.inventionFair).toBeNull();
    state.resources.wood = 100;
    const removed = state.entities.splice(-1, 1);
    maybeOfferInventionFair(state);
    expect(state.inventionFair).toBeNull();
    state.entities.push(...removed);
    state.buildings = [];
    maybeOfferInventionFair(state);
    expect(state.inventionFair).toBeNull();
    state.buildings = [hall()];
    maybeOfferInventionFair(state);
    expect(state.inventionFair?.stage).toBe('selection');
    expect(state.pendingStoryEvents?.filter((item) => item.storyKey === 'invention_fair')).toHaveLength(1);
    maybeOfferInventionFair(state);
    expect(state.pendingStoryEvents).toHaveLength(1);
  });

  it('charges the selected wood and gold exactly once and blocks unaffordable or forged choices', () => {
    const state = world();
    maybeOfferInventionFair(state);
    const offer = state.pendingStoryEvents![0];
    state.resources.gold = 5;
    expect(getStoryChoiceEligibility(state, offer, 'fund_standard').ok).toBe(false);
    expect(getStoryChoiceEligibility(state, offer, 'fund_low_budget').ok).toBe(true);
    expect(getStoryChoiceEligibility(state, offer, 'garbage').ok).toBe(false);
    expect(resolveInventionFair(state, 'fund_standard', offer.id)).toBe(false);
    expect(resolveInventionFair(state, 'fund_low_budget', 'other_event')).toBe(false);
    expect(resolveInventionFair(state, 'fund_low_budget', offer.id)).toBe(true);
    expect(state.resources.wood).toBe(90);
    expect(state.resources.gold).toBe(5);
    expect(resolveInventionFair(state, 'fund_low_budget', offer.id)).toBe(false);
    expect(state.resources.wood).toBe(90);
    expect(getStoryChoiceEligibility(state, offer, 'fund_standard').ok).toBe(false);
  });

  it('uses the exact specified four outcome bands for every project', () => {
    const cases = [
      ['low_budget', [['success', 0], ['failure', 0.1], ['malfunction', 0.5], ['malfunction', 0.9999]]],
      ['standard', [['success', 0.1999], ['failure', 0.2], ['malfunction', 0.6], ['dangerous', 0.9]]],
      ['high_risk', [['success', 0.3499], ['failure', 0.35], ['malfunction', 0.5], ['dangerous', 0.7]]],
    ] as const;
    for (const [project, rolls] of cases) {
      for (const [outcome, roll] of rolls) expect(rollInventionFairOutcome(project, roll)).toBe(outcome);
    }
  });

  it('advances the three eight-hour phases and resolves once after 288 ticks', () => {
    const state = world();
    const start = fundAndStart(state, 'fund_standard');
    expect(INVENTION_FAIR_DEMONSTRATION_TICKS).toBe(TICKS_PER_DAY);
    expect(state.inventionFair?.spectatorSlots.length).toBeGreaterThan(0);
    const slots = state.inventionFair!.spectatorSlots;
    expect(new Set(slots.map((slot) => slot.humanId)).size).toBe(slots.length);
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        expect(Math.hypot(slots[i].x - slots[j].x, slots[i].y - slots[j].y)).toBeGreaterThanOrEqual(10);
      }
    }
    state.tick = start + 8 * TICKS_PER_HOUR - 1;
    tickInventionFairRealtime(state);
    expect(state.inventionFair?.lastPhase).toBe(0);
    state.tick++;
    tickInventionFairRealtime(state);
    expect(state.inventionFair?.lastPhase).toBe(1);
    state.tick = start + 16 * TICKS_PER_HOUR;
    tickInventionFairRealtime(state);
    expect(state.inventionFair?.lastPhase).toBe(2);
    state.tick = start + TICKS_PER_DAY - 1;
    tickInventionFairRealtime(state);
    expect(state.inventionFair?.stage).toBe('demonstration');
    state.tick++;
    tickInventionFairRealtime(state);
    expect(state.inventionFair?.stage).toBe('resolution');
    const outcome = state.inventionFair?.outcome;
    const resources = { ...state.resources };
    const reputation = state.villageReputation;
    tickInventionFairRealtime(state);
    expect(state.inventionFair?.outcome).toBe(outcome);
    expect(state.resources).toEqual(resources);
    expect(state.villageReputation).toBe(reputation);
    expect(state.pendingStoryEvents?.filter((e) => e.id.startsWith('invention_resolution_'))).toHaveLength(1);
  });

  it('handles a seeded dangerous failure without bypassing stamina, health or resource caps', () => {
    const seed = Array.from({ length: 100 }, (_, i) => i + 1)
      .find((candidate) => createSeededRng(candidate, 'invention-fair')() >= 0.7);
    expect(seed).toBeDefined();
    const state = world(seed!);
    const start = fundAndStart(state, 'fund_high_risk');
    const slot = state.inventionFair?.spectatorSlots[0];
    expect(slot).toBeDefined();
    const spectator = state.entities.find((entity) => entity.id === slot?.humanId)!;
    spectator.x = slot!.x;
    spectator.y = slot!.y;
    const stamina = spectator.needs?.stamina ?? spectator.energy / spectator.maxEnergy * 100;
    const wood = state.resources.wood;
    const gold = state.resources.gold;
    state.tick = start + TICKS_PER_DAY;
    tickInventionFairRealtime(state);
    expect(state.inventionFair?.outcome).toBe('dangerous');
    expect(state.buildings[0].health).toBe(70);
    expect(state.inventionFair?.damagedHealth).toBe(30);
    expect(state.resources.wood).toBe(wood - 25);
    expect(state.resources.gold).toBe(gold - 25);
    expect(spectator.needs?.stamina).toBeLessThan(stamina);
    expect(state.resources.wood).toBeLessThanOrEqual(state.storageMax.wood);
    expect(state.resources.gold).toBeLessThanOrEqual(state.storageMax.gold);
    const event = state.pendingStoryEvents?.find((e) => e.id.startsWith('invention_resolution_'))!;
    expect(event.choices.some((choice) => choice.id === 'repair')).toBe(true);
    expect(getStoryChoiceEligibility(state, event, 'repair').ok).toBe(true);
    expect(resolveInventionFair(state, 'repair', event.id)).toBe(true);
    expect(state.buildings[0].health).toBe(100);
    expect(state.inventionFair).toBeNull();
  });

  it('saves and transports an active demonstration without losing the countdown or crowd', () => {
    const state = world();
    const start = fundAndStart(state, 'fund_low_budget');
    state.tick = start + 150;
    tickInventionFairRealtime(state);
    const fair = structuredClone(state.inventionFair);
    const saved = JSON.parse(JSON.stringify(pickWorldFieldsForSave(state)));
    expect(saved.inventionFair).toEqual(fair);
    const delta = extractSimTickDelta(state, undefined, { cloneMode: 'isolated' });
    const target = world();
    applySimTickDelta(target, delta, { cloneMode: 'isolated' });
    expect(target.inventionFair).toEqual(fair);
    expect(target.inventionFair).not.toBe(state.inventionFair);
  });

  it('resolves or expires each stage once and retains campaign completion flag', () => {
    const decline = world();
    maybeOfferInventionFair(decline);
    const id = decline.inventionFair!.activeEventId;
    const answer = respondToStoryEvent(decline, id, 'decline');
    expect(answer.inventionFair).toBeNull();
    expect(answer.storyFlags?.invention_fair_resolved).toBeGreaterThan(0);
    expect(resolveInventionFair(answer, 'decline')).toBe(true);

    const unattended = world();
    maybeOfferInventionFair(unattended);
    unattended.tick = unattended.inventionFair!.expiresAtTick;
    tickInventionFair(unattended);
    expect(unattended.inventionFair).toBeNull();
    expect(unattended.storyFlags?.invention_fair_resolved).toBeGreaterThan(0);

    const demonstrated = world();
    const start = fundAndStart(demonstrated, 'fund_low_budget');
    demonstrated.tick = start + TICKS_PER_DAY;
    tickInventionFairRealtime(demonstrated);
    const initial = demonstrated.resources.wood;
    const expiry = demonstrated.inventionFair!.expiresAtTick;
    demonstrated.tick = expiry;
    tickInventionFair(demonstrated);
    expect(demonstrated.inventionFair).toBeNull();
    expect(demonstrated.resources.wood).toBeGreaterThanOrEqual(initial);
    const after = demonstrated.resources.wood;
    tickInventionFair(demonstrated);
    expect(demonstrated.resources.wood).toBe(after);
  });
});
