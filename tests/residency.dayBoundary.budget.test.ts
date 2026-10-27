/**
 * The residency assign pass must stay bounded on a colony of a thousand settlers, spread its
 * reassignment work across the day's pulses, and never leave a settler waiting for a bucket.
 *
 * The wall-clock ceiling is deliberately loose: a tight number would flake on a loaded machine while
 * still letting a minute-long regression through. The shape assertions are what actually pin
 * behaviour — every pulse owns one bucket, a settled colony's homes are untouched by the split,
 * nobody sleeps outside for a bucket, and the pass ends at a fixed point.
 */
import { describe, expect, it } from 'vitest';
import { EntityType, BuildingType, MapSize } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { createBuilding, createEntity, initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameEngine';
import { RESIDENCE_SWEEP_BUCKETS, assignMissingResidences } from '../src/game/residencyReconciliation';
import { LAYER_ASSIGN_INTERVAL, LAYER_ASSIGN_PHASE_TICK } from '../src/game/tickLayerAssign';
import {
  buildHousingUnits,
  buildResidenceTraits,
  housingUnitBucket,
  housingUnitNeedsReassignment,
} from '../src/game/residencySelection';
import {
  buildResidenceOccupancy,
  getResidenceCapacity,
  isImprisoned,
  isResidenceBuilding,
} from '../src/game/residencyOccupancy';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { resetSimRng } from '../src/game/simRng';

const SETTLERS = 600;
const HOUSES = 420;
const BOUNDARY_CEILING_MS = 5000;

/** One day of assignment pulses, in tick order. */
const DAY_PULSES = Array.from(
  { length: TICKS_PER_DAY / LAYER_ASSIGN_INTERVAL },
  (_, i) => LAYER_ASSIGN_PHASE_TICK + i * LAYER_ASSIGN_INTERVAL,
);

/** The pulse whose bucket one housing unit belongs to. */
function pulseForUnit(unit: Entity[]): number {
  const bucket = housingUnitBucket(unit, RESIDENCE_SWEEP_BUCKETS);
  return DAY_PULSES[bucket % DAY_PULSES.length];
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function largeColony(): WorldState {
  resetSimRng();
  const state = initGame({ seed: 4242, size: MapSize.Large });
  const rand = lcg(20261002);
  let nextBuildingId = state.buildings.reduce((m, b) => Math.max(m, b.id), 0) + 1;
  let nextEntityId = state.entities.reduce((m, e) => Math.max(m, e.id), 0) + 1;

  const houses: Building[] = [];
  const cols = Math.ceil(Math.sqrt(HOUSES));
  for (let i = 0; i < HOUSES; i++) {
    const house = createBuilding(
      BuildingType.House,
      state.width / 2 - cols * 8 + (i % cols) * 16,
      state.height / 2 - cols * 8 + Math.floor(i / cols) * 16,
      nextBuildingId++,
    );
    house.completed = true;
    houses.push(house);
    state.buildings.push(house);
  }

  const humans: Entity[] = [];
  for (let i = 0; i < SETTLERS; i++) {
    const human = createEntity(
      EntityType.Human,
      state.width / 2 - 300 + rand() * 600,
      state.height / 2 - 300 + rand() * 600,
      nextEntityId++,
      250,
    );
    human.alive = true;
    human.isJuvenile = false;
    human.age = 24 + Math.floor(rand() * 20);
    human.gender = i % 2 === 0 ? 'male' : 'female';
    human.faction = undefined;
    human.childrenIds = [];
    humans.push(human);
    state.entities.push(human);
  }
  for (let i = 0; i + 1 < humans.length; i += 2) {
    humans[i].partnerId = humans[i + 1].id;
    humans[i + 1].partnerId = humans[i].id;
  }

  // The picker's rules disagree with the world: partners split across houses, a quarter homeless.
  for (const [i, human] of humans.entries()) {
    if (i % 4 === 0) continue;
    human.residenceBuildingId = houses[Math.floor(rand() * houses.length)].id;
  }
  state.humanPopulation = humans.length;
  // The boundary tick spawns births and immigrants of its own; a stale allocator would collide.
  state.nextEntityId = nextEntityId;
  state.nextBuildingId = nextBuildingId;
  return state;
}

function playerSettlers(state: WorldState): Entity[] {
  return state.entities.filter((e) => e.type === EntityType.Human && e.alive && !e.faction);
}

function playerResidences(state: WorldState): Building[] {
  return state.buildings.filter((b) => isResidenceBuilding(b) && b.faction !== 'rival');
}

function assignment(state: WorldState): string {
  return playerSettlers(state)
    .map((h) => `${h.id}:${h.residenceBuildingId ?? -1}`)
    .sort()
    .join('|');
}

/** Illegal housing: a settler outside, in a non-residence, or in a home past its bed count. */
function housingViolations(state: WorldState): string[] {
  const bad: string[] = [];
  const byId = new Map(playerResidences(state).map((r) => [r.id, r]));
  const held = new Map<number, number>();
  for (const human of playerSettlers(state)) {
    if (isImprisoned(human)) continue;
    const home = human.residenceBuildingId;
    if (home == null) {
      bad.push(`homeless #${human.id}`);
      continue;
    }
    const residence = byId.get(home);
    if (!residence) bad.push(`#${human.id} in non-residence #${home}`);
    else held.set(home, (held.get(home) ?? 0) + 1);
  }
  for (const [home, count] of held) {
    const capacity = getResidenceCapacity(byId.get(home)!);
    if (count > capacity) bad.push(`#${home} holds ${count} of ${capacity}`);
  }
  return bad;
}

/** A colony the pass has already settled — what a running village looks like at a day boundary. */
function settled(state: WorldState): WorldState {
  assignMissingResidences(playerSettlers(state), state.buildings, state.entities);
  return state;
}

function runPulses(state: WorldState, pulses: number[] = DAY_PULSES): void {
  for (const tick of pulses) {
    assignMissingResidences(playerSettlers(state), state.buildings, state.entities, tick);
  }
}

function parkBeforeDayBoundary(state: WorldState): WorldState {
  let world = state;
  while (world.tick % TICKS_PER_DAY !== TICKS_PER_DAY - 1) world = gameTick(world);
  return world;
}

describe('the residency sweep is spread across the day', () => {
  it('pins the bucket count to the assignment layer cadence, so no bucket is unreachable', () => {
    expect(RESIDENCE_SWEEP_BUCKETS * LAYER_ASSIGN_INTERVAL).toBe(TICKS_PER_DAY);
  });

  it('leaves a settled colony in exactly the homes the unsplit pass would', () => {
    const unsplit = settled(structuredClone(largeColony()));
    const reference = assignment(unsplit);

    const split = settled(structuredClone(largeColony()));
    runPulses(split);

    expect(assignment(split)).toBe(reference);
  });

  it('houses a settler who loses a bed on the next pulse, whatever bucket is active', () => {
    const state = settled(structuredClone(largeColony()));
    const subject = playerSettlers(state).find((h) => h.residenceBuildingId != null)!;
    subject.residenceBuildingId = undefined;

    // The subject's own bucket cannot come round first, so only the global fill can seat them.
    const otherPulse = DAY_PULSES.find((tick) => tick !== pulseForUnit([subject]));
    expect(otherPulse).toBeDefined();
    assignMissingResidences(playerSettlers(state), state.buildings, state.entities, otherPulse);

    expect(subject.residenceBuildingId).toBeDefined();
    expect(playerResidences(state).some((r) => r.id === subject.residenceBuildingId)).toBe(true);
  });

  it('repairs every bucket on a churned colony and leaves nobody unhoused', () => {
    const state = settled(structuredClone(largeColony()));
    const players = playerSettlers(state);
    const residences = playerResidences(state);
    for (let i = 0; i < 8; i++) players[i].alive = false;
    for (let i = 8; i < 20; i++) players[i].residenceBuildingId = undefined;
    for (let i = 0; i < 3; i++) {
      for (const extra of players.slice(30 + i * 6, 36 + i * 6)) {
        extra.residenceBuildingId = residences[i].id;
      }
    }

    runPulses(state);

    expect(housingViolations(state)).toEqual([]);
    // The sweep must be complete: no settled unit is still waiting for a better home.
    const alive = playerSettlers(state).filter((h) => !isImprisoned(h));
    const occupancy = buildResidenceOccupancy(alive);
    const traits = buildResidenceTraits(alive);
    const stillWaiting = buildHousingUnits(alive).filter((unit) =>
      housingUnitNeedsReassignment(unit, alive, residences, occupancy, traits),
    );
    expect(stillWaiting.length).toBe(0);
  });
});

describe('the day-boundary residency pass on a large colony', () => {
  it('finishes inside the ceiling and leaves every settler in a lawful residence', () => {
    resetSimRng();
    const parked = parkBeforeDayBoundary(largeColony());

    const t0 = performance.now();
    const after = gameTick(parked);
    const boundaryMs = performance.now() - t0;

    expect(after.tick % TICKS_PER_DAY).toBe(0);
    expect(
      boundaryMs,
      `day-boundary tick took ${boundaryMs.toFixed(0)} ms on ${playerSettlers(after).length} settlers`,
    ).toBeLessThan(BOUNDARY_CEILING_MS);
    expect(housingViolations(after)).toEqual([]);
  }, 120_000);

  it('reaches a fixed point by the end of the day, not on the boundary tick alone', () => {
    resetSimRng();
    const after = gameTick(parkBeforeDayBoundary(largeColony()));
    // All four assignment pulses run at 03:00, 09:00, 15:00 and 21:00.
    // Midnight is a daily phase, not an assignment pulse.
    runPulses(after, DAY_PULSES.map((tick) => after.tick + tick));

    expect(housingViolations(after)).toEqual([]);
    const before = assignment(after);
    assignMissingResidences(playerSettlers(after), after.buildings, after.entities);
    expect(assignment(after)).toBe(before);
  }, 120_000);
});
