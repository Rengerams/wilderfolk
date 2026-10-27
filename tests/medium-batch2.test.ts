/**
 * Medium-tier fixes, batch 2 (audit report, 2026-09-13).
 *
 * - M31 — the off-screen wildlife throttle counted raw ticks although `tickWildlife` only runs on
 *   wildlife-layer ticks, so the gate had no solution for most entity ids and ~75% of off-screen
 *   fauna never ran an AI step.
 * - M7 — `resolveCombatLogKind` classified any chronicle line, so an ordinary event mentioning a
 *   raid was counted as a raid or a defence.
 * - M11 — `needsMedicalCare` compared the grief deadline with 0, making grief permanent.
 * - M23 — the residence pickers accepted rival-camp houses as free player housing.
 * - M38 — storm damage "healed" a building that was already below the 20 HP floor.
 * - M1 — a continued food shortage re-notified the player every colony day.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BuildingType, EntityType, JobType } from '../src/game/gameTypes';
import type { Building, Entity, GameEventLog } from '../src/game/gameTypes';
import { BUILDING_CONFIGS } from '../src/game/buildings';
import {
  OFFSCREEN_WILDLIFE_THROTTLE,
  WILDLIFE_LAYER_INTERVAL,
  isOffscreenWildlifeActive,
} from '../src/game/simFocus';
import { resolveCombatLogKind } from '../src/game/eventLog';
import { needsMedicalCare } from '../src/game/hospitalCare';
import { pickResidenceForFamily } from '../src/game/residencySelection';
import { applyStormDamageToBuildings } from '../src/game/worldEvents';
import { tickAnimalCare } from '../src/game/animalCare';
import { getColonyDay, TICKS_PER_DAY } from '../src/game/dayCycle';

const FIXTURE_SEED = 20240913;

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 100,
    y: 100,
    energy: 200,
    maxEnergy: 200,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    maxAge: 90,
    speed: 2,
    size: 10,
    vx: 0,
    vy: 0,
    flash: 0,
    alive: true,
    gender: 'female',
    name: `H${id}`,
    surname: 'Vale',
    generation: 1,
    isJuvenile: false,
    job: JobType.Settler,
    childrenIds: [],
    reproductionCooldown: 0,
    relationshipStatus: 'single',
    ...overrides,
  } as Entity;
}

function residence(id: number, faction: string): Building {
  const cfg = BUILDING_CONFIGS[BuildingType.House];
  return {
    id,
    type: BuildingType.House,
    x: 0,
    y: 0,
    width: cfg.width,
    height: cfg.height,
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    faction,
  } as never;
}

describe('M31 — the off-screen wildlife throttle counts layer pulses', () => {
  it('lets every entity id act exactly once per throttle window', () => {
    for (let id = 0; id < OFFSCREEN_WILDLIFE_THROTTLE; id++) {
      let passes = 0;
      const basePulse = Math.floor(id / OFFSCREEN_WILDLIFE_THROTTLE) * OFFSCREEN_WILDLIFE_THROTTLE + 1;
      for (let pulse = basePulse; pulse < basePulse + OFFSCREEN_WILDLIFE_THROTTLE; pulse++) {
        if (isOffscreenWildlifeActive(pulse * WILDLIFE_LAYER_INTERVAL, id)) passes++;
      }
      expect(passes).toBe(1);
    }
  });

  it('is reachable for ids that the raw-tick formula never matched', () => {
    // tickWildlife only runs on multiples of WILDLIFE_LAYER_INTERVAL.
    for (const id of [1, 2, 3, 5, 6, 7]) {
      let reachable = false;
      for (let tick = 0; tick <= WILDLIFE_LAYER_INTERVAL * OFFSCREEN_WILDLIFE_THROTTLE * 2; tick += WILDLIFE_LAYER_INTERVAL) {
        if (isOffscreenWildlifeActive(tick, id)) reachable = true;
      }
      expect(reachable).toBe(true);
    }
  });
});

describe('M7 — only combat entries are classified', () => {
  const event = (over: Partial<GameEventLog>): GameEventLog =>
    ({ id: 1, tick: 0, year: 0, day: 0, type: 'event', message: '', ...over }) as GameEventLog;

  it('ignores a non-combat chronicle line that mentions a raid', () => {
    expect(resolveCombatLogKind(event({ type: 'event', message: 'A raid on the road delayed the caravan' }))).toBeNull();
    expect(resolveCombatLogKind(event({ type: 'scandal', message: 'A raid story spread through the tavern' }))).toBeNull();
  });

  it('still classifies combat entries, with and without a stored kind', () => {
    expect(resolveCombatLogKind(event({ type: 'combat', combatKind: 'repelled', message: 'x' }))).toBe('repelled');
    expect(
      resolveCombatLogKind(event({ type: 'combat', message: 'Barricade repelled the raid' })),
    ).toBe('repelled');
    expect(
      resolveCombatLogKind(event({ type: 'combat', message: 'Northgate launched a raid on the village' })),
    ).toBe('incoming_raid');
  });
});

describe('M11 — grief is a window, not a permanent state', () => {
  it('only seeks care while the grief deadline is in the future', () => {
    const mourner = human(1, { energy: 120, maxEnergy: 200, griefUntilTick: 500 });

    expect(needsMedicalCare(mourner, 100)).toBe(true);
    expect(needsMedicalCare(mourner, 500)).toBe(false);
    expect(needsMedicalCare(mourner, 900)).toBe(false);
  });
});

describe('M23 — rival-camp houses never house settlers', () => {
  it('never returns a rival residence', () => {
    const settler = human(1);
    const rivalHouse = residence(10, 'rival');
    const playerHouse = residence(11, 'player');

    expect(pickResidenceForFamily([settler], [settler], [rivalHouse])).toBeUndefined();
    expect(pickResidenceForFamily([settler], [settler], [rivalHouse, playerHouse])).toBe(playerHouse.id);
  });
});

describe('M38 — storm damage never heals a building', () => {
  it('leaves a building at or below the floor untouched and out of the report', () => {
    const atFloor = residence(1, 'player');
    atFloor.health = 20;
    const belowFloor = residence(2, 'player');
    belowFloor.health = 15;
    const healthy = residence(3, 'player');
    healthy.health = 100;

    const damaged = applyStormDamageToBuildings([atFloor, belowFloor, healthy], 1);

    expect(belowFloor.health).toBe(15);
    expect(atFloor.health).toBe(20);
    expect(healthy.health).toBe(94);
    expect(damaged.map((b) => b.id)).toEqual([3]);
  });
});

describe('M1 — the animal-shortage warning fires once per episode', () => {
  it('does not re-notify on the following days of the same shortage', () => {
    const state = initGame({ seed: FIXTURE_SEED });
    state.resources.food = 0;
    // Day 5 so the warning marker (day-2) is a real past day rather than a negative one.
    state.dayInYear = 5;
    state.tick = 5 * TICKS_PER_DAY;
    // One tamed animal whose owner is a real settler.
    const animal = state.entities.find((e) => e.type === EntityType.Rabbit)!;
    const owner = state.entities.find((e) => e.type === EntityType.Human)!;
    animal.tamedBy = owner.id;

    const firstDay = getColonyDay(state);
    state.storyFlags = { animal_care_warning_day: firstDay - 2 };
    state.notifications = [];

    tickAnimalCare(state);
    const afterFirst = state.notifications.filter((n) => n.title.includes('Animal shortage')).length;

    // Next colony day, still unfed: the shortage continues but must not re-announce.
    state.dayInYear += 1;
    state.tick += TICKS_PER_DAY;
    tickAnimalCare(state);
    const afterSecond = state.notifications.filter((n) => n.title.includes('Animal shortage')).length;

    expect(afterFirst).toBe(1);
    expect(afterSecond).toBe(1);
  });
});
