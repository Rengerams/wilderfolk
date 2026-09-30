/**
 * Regression for `BUG_REPORTS/2026-08-28-hunting-projectile-visual.md`.
 *
 * A staffed Hunting Spot resolves its kill in the daily economy layer, and that
 * used to emit the hunt visual from `building.x` / `building.y` with
 * `hunterId: building.id` — so the shot read as an automatic tower firing. The
 * shot must leave the live assigned hunter instead, and an unstaffed Hunting Spot
 * must not look like it fired at all.
 */
import { describe, expect, it } from 'vitest';
import { gameTick, initGame } from '../src/game/gameEngine';
import { BuildingType, EntityType, JobType, MapSize } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';

const SPOT_ID = 9001;
const HUNTER_ID = 90001;
const PREY_ID = 90002;
const SPOT_X = 1400;
const SPOT_Y = 900;
/** Far from the building centre, so "from the hunter" and "from the building" differ. */
const HUNTER_X = 1800;
const HUNTER_Y = 900;

type HuntVisual = NonNullable<WorldState['huntVisuals']>[number];

function hunter(id: number, workplaceId: number): Entity {
  return {
    id,
    type: EntityType.Human,
    x: HUNTER_X,
    y: HUNTER_Y,
    energy: 500,
    maxEnergy: 500,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    alive: true,
    size: 10,
    speed: 2,
    vx: 0,
    vy: 0,
    flash: 0,
    animFrame: 0,
    spriteAngle: 0,
    childrenIds: [],
    generation: 0,
    isJuvenile: false,
    job: JobType.Settler,
    homeBuildingId: workplaceId,
    name: `Hunter${id}`,
    gender: 'male',
  } as unknown as Entity;
}

function deer(id: number): Entity {
  return {
    id,
    type: EntityType.Deer,
    // Beside the *hunter*, not the building. This fixture used to park the prey 120 px from the spot's
    // centre and assert a shot anyway, which encoded the old rule that the structure did the killing at
    // range. A hunter now has to be next to the animal to take it (owner: *"to kil it you have stand
    // ne xt to it"*), so the prey is placed where the hunter actually is. The distance from the
    // **building** stays large, which is the whole point of the test: the shot originates at the
    // hunter, not at the spot.
    x: HUNTER_X + 20,
    y: HUNTER_Y,
    energy: 100,
    maxEnergy: 100,
    age: 2,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    alive: true,
    size: 10,
    speed: 2,
    vx: 0,
    vy: 0,
    flash: 0,
    animFrame: 0,
    spriteAngle: 0,
    childrenIds: [],
    generation: 0,
  } as unknown as Entity;
}

function huntingSpot(occupants: number[]): Building {
  return {
    id: SPOT_ID,
    type: BuildingType.HuntingSpot,
    x: SPOT_X,
    y: SPOT_Y,
    width: 53,
    height: 46,
    occupants,
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    // Manual staffing keeps the workforce layer from auto-assigning a founder, so
    // the only hunter on this spot is the one the test placed there.
    staffingMode: 'manual',
  } as Building;
}

function makeWorld(seed: number, extraEntities: Entity[], occupants: number[]): WorldState {
  const base = initGame({ size: MapSize.Medium, seed });
  return {
    ...base,
    tick: 0,
    paused: false,
    buildings: [...base.buildings, huntingSpot(occupants)],
    entities: [...base.entities, ...extraEntities],
  };
}

/** Advance up to two in-game days, returning the world at the tick the shot fired. */
function runUntilShot(world: WorldState, shooterId: number): { world: WorldState; visual: HuntVisual } | null {
  let current = world;
  for (let i = 0; i < 150; i++) {
    current = gameTick(current);
    const visual = (current.huntVisuals ?? []).find((candidate) => candidate.hunterId === shooterId);
    if (visual) return { world: current, visual };
  }
  return null;
}

describe('hunting spot shot origin', () => {
  it('fires from the assigned hunter, not from the building', () => {
    const world = makeWorld(777, [hunter(HUNTER_ID, SPOT_ID), deer(PREY_ID)], [HUNTER_ID]);

    const shot = runUntilShot(world, HUNTER_ID);

    expect(shot, 'a staffed Hunting Spot with prey in range emits a shot').not.toBeNull();
    const { world: after, visual } = shot!;
    const liveHunter = after.entities.find((entity) => entity.id === HUNTER_ID)!;

    // The shot belongs to the hunter, not to the building.
    expect(visual.hunterId).toBe(HUNTER_ID);
    // …and it leaves the hunter's position. The old code used `building.x` /
    // `building.y` and `hunterId: building.id`.
    expect({ x: visual.fromX, y: visual.fromY }).not.toEqual({ x: SPOT_X, y: SPOT_Y });
    expect(Math.hypot(visual.fromX - liveHunter.x, visual.fromY - liveHunter.y)).toBeLessThan(120);
  });

  it('never fires without an assigned hunter', () => {
    const world = makeWorld(778, [deer(PREY_ID)], []);

    let current = world;
    for (let i = 0; i < 150; i++) current = gameTick(current);

    // A Hunting Spot is a work location: unstaffed, it must not look like it fired
    // — neither as the shooter nor from the building's own corner.
    expect((current.huntVisuals ?? []).some((visual) => visual.hunterId === SPOT_ID)).toBe(false);
    expect(
      (current.huntVisuals ?? []).some((visual) => visual.fromX === SPOT_X && visual.fromY === SPOT_Y),
    ).toBe(false);
  });
});
