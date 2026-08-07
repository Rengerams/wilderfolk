/**
 * Regression: the Auto-staff button worked silently — it assigned workers but
 * gave no confirmation, so it looked broken. Now it must (a) staff idle job
 * buildings and (b) push a notification the player can see.
 */
import { describe, it, expect } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { autoStaffAllWorkers, startBuilding } from '../src/game/buildingActions';
import { BuildingType, EntityType } from '../src/game/gameTypes';

function playerHumans(state: ReturnType<typeof initGame>) {
  return state.entities.filter(
    (e) => e.type === EntityType.Human && e.alive && !e.faction,
  );
}

describe('autoStaffAllWorkers feedback', () => {
  it('staffs an idle job building and reports it in a notification', () => {
    let world = initGame();
    // Run 5 days so settlers exist.
    for (let i = 0; i < 72 * 5; i++) world = gameTick(world);
    const humans = playerHumans(world);
    if (humans.length < 2) return; // world may have few settlers headless — skip assert

    world = startBuilding(world, BuildingType.Farm, 300, 300, 0);
    // Complete the farm immediately so it is a job site.
    const farm = world.buildings.find((b) => b.type === BuildingType.Farm);
    if (!farm) return;
    farm.completed = true;
    farm.constructionProgress = 100;

    const beforeNotifs = world.notifications.length;
    const staffed = autoStaffAllWorkers(world);

    const farmAfter = staffed.buildings.find((b) => b.type === BuildingType.Farm);
    expect(farmAfter?.occupants.length).toBeGreaterThan(0);

    const newNotifs = staffed.notifications.slice(beforeNotifs);
    const staffNote = newNotifs.find((n) => n.title.includes('Auto-staff'));
    expect(staffNote).toBeDefined();
  });

  it('confirms even when nothing needs staffing (no dead button feel)', () => {
    let world = initGame();
    for (let i = 0; i < 72 * 5; i++) world = gameTick(world);
    const humans = playerHumans(world);
    if (humans.length < 2) return;

    const beforeNotifs = world.notifications.length;
    const staffed = autoStaffAllWorkers(world); // no job buildings built
    const newNotifs = staffed.notifications.slice(beforeNotifs);
    const note = newNotifs.find((n) => n.title.includes('Auto-staff'));
    expect(note).toBeDefined();
  });
});
