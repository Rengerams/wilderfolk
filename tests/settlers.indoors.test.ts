import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { building, human } from '../src/test/factories';
import { BuildingType, type WorldState } from '../src/game/gameTypes';
import { commuteDistanceToBuilding, commuteHumanToBuilding, enterHumanBuilding, humanBuildingTarget } from '../src/game/simulation/humanMovement';
import { tickHumanHospitalPatientCare } from '../src/game/humanHospitalBehavior';
import { packEntityRenderMeta, buildRenderEntityShim } from '../src/game/simBuffers/entityRenderMeta';
import { packRenderSoA } from '../src/game/simBuffers/packRenderSoA';
import { createRenderSoAReader } from '../src/game/simBuffers/renderSoAReader';
import { gameTick } from '../src/game/gameTick';
import { buildSaveData } from '../src/game/saveLoad';
import { initGame } from '../src/game/worldGen';
import { buildRenderSnapshot } from '../src/game/renderSnapshot';
import { createInitialView } from '../src/game/viewState';
import { _cachedHumans, resetEntityCaches, updateCachedEntitiesFromSoA } from '../src/game/renderer/entityCache';
import { observeIndoorPatients } from '../src/game/virtualPlayer';
import { TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { drawHumans, drawLeaderAuraOverlay } from '../src/game/renderer/humans';

describe('settlers inside buildings', () => {
  it.each([BuildingType.House, BuildingType.Hospital, BuildingType.School, BuildingType.Prison,
    BuildingType.Hotel, BuildingType.Tavern, BuildingType.Mill, BuildingType.Blacksmith,
    BuildingType.TownHall, BuildingType.Church, BuildingType.Greenhouse, BuildingType.Mine])('enters completed %s only after arriving', (type) => {
    const home = building(0, type, { x: 300, y: 300, occupants: [1] });
    const person = human(1, { x: -1000, y: -1000 });
    expect(commuteHumanToBuilding(person, home, 2, false)).toBe(false);
    expect(person.indoorBuildingId).toBeUndefined();
    Object.assign(person, humanBuildingTarget(home, person.id, false));
    expect(commuteHumanToBuilding(person, home, 2, false)).toBe(true);
    expect(person.indoorBuildingId).toBe(0);
    expect([person.vx, person.vy]).toEqual([0, 0]);
    commuteDistanceToBuilding(person, home, false);
    expect(person.indoorBuildingId).toBe(0);
    commuteHumanToBuilding(person, building(2, type, { x: 1000, y: 1000 }), 2, false);
    expect(person.indoorBuildingId).toBeUndefined();
  });

  it.each([BuildingType.Farm, BuildingType.Quarry, BuildingType.HuntingSpot, BuildingType.FishingSpot,
    BuildingType.Market, BuildingType.Graveyard, BuildingType.Well, BuildingType.Watchtower])('keeps outdoor %s workers visible', (type) => {
    const person = human(1);
    enterHumanBuilding(person, building(1, type));
    expect(person.indoorBuildingId).toBeUndefined();
  });

  it('keeps construction crews outside', () => {
    const person = human(1);
    enterHumanBuilding(person, building(1, BuildingType.Hospital, { completed: false }));
    expect(person.indoorBuildingId).toBeUndefined();
  });

  it('admits a pregnant patient already at the ward instead of leaving her outside', () => {
    const ward = building(0, BuildingType.Hospital, { x: 100, y: 100 });
    const person = human(1, { x: 110, y: 110, pregnant: true });
    tickHumanHospitalPatientCare({ state: { tick: 5 } as WorldState, entity: person, staffedHospitals: [ward], onJobShift: false, speed: 2 });
    expect(person.indoorBuildingId).toBe(0);
    person.x = 1000;
    tickHumanHospitalPatientCare({ state: { tick: 5 } as WorldState, entity: person, staffedHospitals: [ward], onJobShift: false, speed: 2 });
    expect(person.indoorBuildingId).toBeUndefined();
  });

  it('keeps a pregnant patient indoors across real simulation ticks and releases her when care ends', () => {
    const world = initGame({ seed: 622 });
    world.worldMap = null;
    world.entities = [human(1, { x: 110, y: 110, gender: 'female', pregnant: true, pregnancyProgress: 1 }),
      human(2, { x: 100, y: 120, job: 'doctor', workerBuildingId: 0 })];
    world.buildings = [building(0, BuildingType.Hospital, { x: 100, y: 100, occupants: [2], staffingMode: 'manual' })];
    world.entityByType = undefined;
    world.entityById = undefined;
    world.paused = false;
    world.tick = 0;
    for (let count = 0; count < 3; count++) gameTick(world);
    const patient = world.entities.find((entry) => entry.id === 1)!;
    expect(patient.indoorBuildingId).toBe(0);
    expect(patient.alive).toBe(true);
    expect(patient.pregnancyProgress).toBeGreaterThan(1);
    expect(observeIndoorPatients(world).patients).toContainEqual({ id: 1, indoorBuildingId: 0, hospitalId: 0 });
    const fixtureDirectory = process.env.INDOOR_SMOKE_FIXTURE_DIR;
    if (fixtureDirectory) {
      mkdirSync(fixtureDirectory, { recursive: true });
      world.paused = true;
      const view = createInitialView(world.width, world.height);
      view.camera.x = 100;
      view.camera.y = 100;
      view.camera.zoom = 1.5;
      writeFileSync(join(fixtureDirectory, 'indoors.json'), JSON.stringify(buildSaveData(world, view)));
    }
    patient.pregnant = false;
    patient.energy = patient.maxEnergy;
    world.paused = false;
    gameTick(world);
    expect(patient.indoorBuildingId).toBeUndefined();
  });


  it('observes missing, outdoor and dead patients without claiming admission', () => {
    const world = initGame({ seed: 623 });
    world.buildings = [building(0, BuildingType.Hospital)];
    world.entities = [];
    expect(observeIndoorPatients(world).patients).toEqual([]);
    world.entities = [human(1, { pregnant: true }), human(2, { pregnant: true, alive: false, indoorBuildingId: 0 })];
    expect(observeIndoorPatients(world).patients).toEqual([{ id: 1, indoorBuildingId: null, hospitalId: null }]);
    world.entities[0].indoorBuildingId = 0;
    world.buildings[0].completed = false;
    expect(observeIndoorPatients(world).patients[0].hospitalId).toBeNull();
  });

  it('lets an indoor worker leave for an established affair during work hours', () => {
    const world = initGame({ seed: 624 });
    world.worldMap = null;
    const workplace = building(0, BuildingType.Blacksmith, { x: 300, y: 300, occupants: [1], staffingMode: 'manual' });
    const person = human(1, { ...humanBuildingTarget(workplace, 1, false), gender: 'male',
      job: 'blacksmith', workerBuildingId: 0, relationshipStatus: 'married', partnerId: 2,
      affairPartnerId: 3, affairProgress: 30, residenceBuildingId: 4 });
    world.entities = [person,
      human(2, { x: 1500, y: 1500, gender: 'female', relationshipStatus: 'married', partnerId: 1, residenceBuildingId: 4 }),
      human(3, { x: 700, y: 700, gender: 'female', affairPartnerId: 1, affairProgress: 30, residenceBuildingId: 5 })];
    world.buildings = [workplace, building(4, BuildingType.House, { x: 1000, y: 1000, occupants: [1, 2] }),
      building(5, BuildingType.House, { x: 700, y: 700, occupants: [3] })];
    world.entityByType = undefined;
    world.entityById = undefined;
    world.paused = false;
    world.tick = 10 * TICKS_PER_HOUR + 1;
    world.lastProcessedCalendarDay = 0;
    const before = { x: person.x, y: person.y };
    gameTick(world);
    expect(person.indoorBuildingId).toBeUndefined();
    expect(Math.hypot(person.x - before.x, person.y - before.y)).toBeGreaterThan(0);
  });

  it('transports indoor presence through the actual worker render buffer and hides selected leaders too', () => {
    const world = initGame({ seed: 621 });
    const person = human(1, { x: 100, y: 100, indoorBuildingId: 0 });
    world.entities = [person];
    world.buildings = [building(0, BuildingType.Hospital)];
    world.villageLeaderId = person.id;
    const packed = packRenderSoA(world);
    const reader = createRenderSoAReader(packed.buffer)!;
    const shim = buildRenderEntityShim(reader, 0, packEntityRenderMeta(person))!;
    expect(shim.indoorBuildingId).toBe(0);
    const view = createInitialView(world.width, world.height);
    view.selectedEntityId = person.id;
    view.selectedEntityIds = [person.id];
    view.camera.x = 100;
    view.camera.y = 100;
    view.camera.zoom = 1;
    const snapshot = buildRenderSnapshot(world, view, { renderSoA: reader, renderMetaBySlot: [packEntityRenderMeta(person)] });
    resetEntityCaches();
    updateCachedEntitiesFromSoA(snapshot, 1000, 800);
    expect(_cachedHumans.map((entry) => entry.id)).toEqual([person.id]);
    const paint = vi.fn();
    const ctx = new Proxy({}, { get: () => paint, set: () => true }) as CanvasRenderingContext2D;
    drawHumans(ctx, snapshot, 1000, 800);
    drawLeaderAuraOverlay(ctx, snapshot, 1000, 800);
    expect(paint).not.toHaveBeenCalled();
  });
});
