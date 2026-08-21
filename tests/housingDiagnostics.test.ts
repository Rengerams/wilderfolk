import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, MapSize } from '../src/game/gameTypes';
import { initGame } from '../src/game/gameEngine';
import { collectHousingDiagnostics, isHousingDiagnosticsHealthy } from '../src/game/housingDiagnostics';

function house(id: number, occupants: number[] = []) {
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
    occupants,
    level: 1,
  } as never;
}

describe('housing diagnostics', () => {
  it('reports beds, open capacity and healthy references from authoritative state', () => {
    const state = initGame({ villageName: 'HousingVale', size: MapSize.Small });
    state.buildings = [house(1)];
    const snapshot = collectHousingDiagnostics(state);
    expect(snapshot.residences).toBe(1);
    expect(snapshot.totalBeds).toBeGreaterThan(0);
    expect(snapshot.openBeds).toBe(snapshot.totalBeds);
    expect(snapshot.overCapacityResidences).toBe(0);
    expect(isHousingDiagnosticsHealthy(snapshot)).toBe(true);
  });

  it('flags an occupant list that points at a missing or mismatched human', () => {
    const state = initGame({ villageName: 'HousingVale2', size: MapSize.Small });
    state.buildings = [house(1, [9999])];
    const snapshot = collectHousingDiagnostics(state);
    expect(snapshot.occupantListMismatches).toBe(1);
    expect(isHousingDiagnosticsHealthy(snapshot)).toBe(false);
  });

  it('separates unassigned player humans from residence-reference errors', () => {
    const state = initGame({ villageName: 'HousingVale3', size: MapSize.Small });
    const human = state.entities.find((entity) => entity.type === EntityType.Human && entity.alive && !entity.isJuvenile);
    expect(human).toBeTruthy();
    human!.residenceBuildingId = undefined;
    state.buildings = [house(1)];
    const snapshot = collectHousingDiagnostics(state);
    expect(snapshot.unassignedPlayerHumans).toBeGreaterThan(0);
    expect(snapshot.orphanedResidenceReferences).toBe(0);
  });
});
