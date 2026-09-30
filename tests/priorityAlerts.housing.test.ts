/**
 * F10 — homelessness with a house standing was invisible on the priority strip
 * (`docs/private/audits/2026-09-16/playability-gamefeel.md`, tracked in `LIVE-FINDINGS-STATUS.md`).
 *
 * The strip spoke about housing only when **no** house existed (`need-shelter`, critical), so the
 * ordinary case was silent: immigration outruns housing by design, beds run out, and a settler with no
 * `residenceBuildingId` never gets the home-rest saving in `humanNeeds` while nothing on screen says so.
 * `housing-short` now fires whenever a player settler has no bed *and* a residence stands.
 *
 * Prisoners are excluded on purpose. Imprisonment clears `residenceBuildingId` (`residencyOccupancy`
 * `isImprisoned` → `prisonBuildingId != null`), so a jailed settler looks homeless to a naive
 * `residenceBuildingId == null` count — the same mistake `collectHousingDiagnostics` still makes in its
 * `unassignedPlayerHumans` figure (`housingDiagnostics.ts:39`), which is how the audit found this.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, MapSize } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { initGame } from '../src/game/gameEngine';
import { createEntity } from '../src/game/worldGen';
import { isPlayerHuman } from '../src/game/playerHuman';
import { getPriorityAlerts } from '../src/game/priorityAlerts';

function house(id: number) {
  return {
    id,
    type: BuildingType.House,
    x: 100,
    y: 100,
    width: 80,
    height: 60,
    completed: true,
    constructionProgress: 100,
    faction: 'player' as const,
    occupants: [],
    level: 1,
  } as never;
}

function settlers(state: WorldState): Entity[] {
  return state.entities.filter((e) => e.alive && isPlayerHuman(e));
}

function alert(state: WorldState, id: string) {
  return getPriorityAlerts(state).find((a) => a.id === id);
}

describe('priority strip housing alert', () => {
  it('nudges the player when a standing house is not enough beds', () => {
    const state = initGame({ villageName: 'BedShort', size: MapSize.Medium });
    state.buildings = [house(1)];
    const unhoused = settlers(state).filter((e) => e.residenceBuildingId == null);
    expect(unhoused.length, 'fixture premise: the colony starts with unhoused settlers').toBeGreaterThan(0);

    const housing = alert(state, 'housing-short');
    expect(housing, 'the strip stayed silent while settlers had no bed').toBeTruthy();
    expect(housing?.title).toBe('Build more housing');
    expect(housing?.detail).toContain(`${unhoused.length} settler`);
    expect(housing?.action).toEqual({ type: 'build', building: BuildingType.House });
  });

  it('does not count a prisoner as homeless', () => {
    const state = initGame({ villageName: 'JailVale', size: MapSize.Medium });
    state.buildings = [house(1)];
    const housed = settlers(state);
    for (const settler of housed) settler.residenceBuildingId = 1;
    const jailed = housed[0];
    jailed.residenceBuildingId = undefined;
    jailed.prisonBuildingId = 7;

    expect(alert(state, 'housing-short')).toBeUndefined();
  });

  it('escalates from info to warning at three homeless settlers', () => {
    const state = initGame({ villageName: 'Crowded', size: MapSize.Medium });
    state.buildings = [house(1)];
    const unhoused = settlers(state);
    while (unhoused.length < 3) {
      const extra = createEntity(EntityType.Human, 120, 120, state.nextEntityId++, 300);
      extra.age = 30;
      state.entities.push(extra);
      state.humanPopulation++;
      unhoused.push(extra);
    }
    for (const settler of unhoused) settler.residenceBuildingId = undefined;

    const housing = alert(state, 'housing-short');
    expect(housing?.severity).toBe('warning');
    expect(housing?.detail).toContain('3 settlers');
  });

  it('keeps the critical shelter alert when no residence stands at all', () => {
    const state = initGame({ villageName: 'NoRoof', size: MapSize.Medium });
    state.buildings = [];

    expect(alert(state, 'need-shelter')?.severity).toBe('critical');
    expect(alert(state, 'housing-short')).toBeUndefined();
  });
});
