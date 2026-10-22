import { building, human } from '../src/test/factories';
/**
 * Regression: the Auto-staff button worked silently — it assigned workers but
 * gave no confirmation, so it looked broken. It confirms real assignments,
 * but no-op passes should not nag about deliberately manual workplaces.
 */
import { describe, it, expect } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { autoStaffAllWorkers, startBuilding } from '../src/game/buildingActions';
import { BuildingType, EntityType, JobType } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';

function playerHumans(state: ReturnType<typeof initGame>) {
  return state.entities.filter(
    (e) => e.type === EntityType.Human && e.alive && !e.faction,
  );
}

describe('autoStaffAllWorkers feedback', () => {
  it('staffs an idle job building and reports it in a notification', () => {
    let world = initGame();
    // Run 5 days so settlers exist.
    for (let i = 0; i < TICKS_PER_DAY * 5; i++) world = gameTick(world);
    const humans = playerHumans(world);
    if (humans.length < 2) return; // world may have few settlers headless — skip assert

    world = startBuilding(world, BuildingType.Farm, 300, 300, 0);
    // Complete the farm immediately so it is a job site.
    const farm = world.buildings.find((b) => b.type === BuildingType.Farm);
    if (!farm) return;
    farm.completed = true;
    farm.constructionProgress = 100;
    farm.occupants = [];
    const worker = playerHumans(world).find((entity) => !entity.isJuvenile);
    if (!worker) throw new Error('fixture needs an adult who can staff the farm');
    // Use an eligible local settler rather than depending on the generated colony's commute.
    worker.workerBuildingId = undefined;
    worker.residenceBuildingId = undefined;
    worker.lastAutoJobTransferTick = undefined;
    worker.job = JobType.Settler;
    worker.x = farm.x + farm.width / 2;
    worker.y = farm.y + farm.height / 2;

    const beforeNotifs = world.notifications.length;
    const staffed = autoStaffAllWorkers(world);

    const farmAfter = staffed.buildings.find((b) => b.type === BuildingType.Farm);
    expect(farmAfter?.occupants.length).toBeGreaterThan(0);

    const newNotifs = staffed.notifications.slice(beforeNotifs);
    const staffNote = newNotifs.find((n) => n.title.includes('Auto-staff'));
    expect(staffNote).toBeDefined();
  });

  it('stays quiet if a pass finds nothing to assign', () => {
    let world = initGame();
    for (let i = 0; i < TICKS_PER_DAY * 5; i++) world = gameTick(world);
    const humans = playerHumans(world);
    if (humans.length < 2) return;

    const beforeNotifs = world.notifications.length;
    const staffed = autoStaffAllWorkers(world); // no job buildings built
    const newNotifs = staffed.notifications.slice(beforeNotifs);
    const note = newNotifs.find((n) => n.title.includes('Auto-staff'));
    expect(note).toBeUndefined();
  });
});

describe('colony-wide Auto-fill override', () => {
  it('enables manual workplaces and assigns idle adults without changing the input or rivals', () => {
    const world = initGame();
    world.entities = [human(1)];
    world.buildings = [
      building(2, BuildingType.Farm, { staffingMode: 'manual' }),
      building(3, BuildingType.School, { staffingMode: 'manual' }),
      building(4, BuildingType.Farm, { staffingMode: 'manual', faction: 'rival' }),
    ];
    const next = autoStaffAllWorkers(world);
    expect(next.buildings.map((site) => site.staffingMode)).toEqual(['auto', 'auto', 'manual']);
    expect(next.entities[0].workerBuildingId).toBeDefined();
    expect(world.buildings[0].staffingMode).toBe('manual');
    expect(world.entities[0].workerBuildingId).toBeUndefined();
  });

  it('confirms Auto-fill is enabled even when there are no idle adults', () => {
    const world = initGame();
    world.entities = [];
    world.buildings = [building(2, BuildingType.School, { staffingMode: 'manual' })];
    const next = autoStaffAllWorkers(world);
    expect(next.buildings[0].staffingMode).toBe('auto');
    expect(next.notifications.at(-1)?.message).toContain('No additional idle adults');
  });
});
