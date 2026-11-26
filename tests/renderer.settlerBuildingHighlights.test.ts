import { describe, expect, it, vi } from 'vitest';
import { BuildingType, EntityType, type WorldState } from '../src/game/gameTypes';
import { resolveSelectedSettlerBuildings, type RenderSnapshot } from '../src/game/renderSnapshot';
import { drawSelectedSettlerBuildingHighlights } from '../src/game/renderer/overlay';
import { building, human } from '../src/test/factories';
import { findHumanWorkplace } from '../src/game/workforce';

describe('selected settler building highlights', () => {
  const home = building(0, BuildingType.House);
  const work = building(2, BuildingType.Farm, { x: 70 });
  const site = building(3, BuildingType.House, { completed: false, occupants: [8] });
  const silo = building(4, BuildingType.Silo);
  const world = { buildings: [home, work, site, silo] } as WorldState;

  it('uses the real home and job assignments, including building id zero', () => {
    const person = human(7, { residenceBuildingId: 0, workerBuildingId: 2 });
    expect(resolveSelectedSettlerBuildings(world, person)).toEqual({ home, work });
    expect(resolveSelectedSettlerBuildings(world, { ...person, workerBuildingId: undefined }))
      .toEqual({ home, work: null });
    expect(resolveSelectedSettlerBuildings(world, { ...person, workerBuildingId: 999 }))
      .toEqual({ home, work: null });
    // Invalid legacy assignment references must not turn a finished residence into a workplace.
    expect(resolveSelectedSettlerBuildings(world, { ...person, workerBuildingId: 0 }))
      .toEqual({ home, work: null });
    expect(resolveSelectedSettlerBuildings(world, { ...person, residenceBuildingId: 2 }))
      .toEqual({ home: null, work });
  });

  it('uses the same workplace verdict as the simulation for non-job buildings and construction fallback', () => {
    const idle = human(7, { residenceBuildingId: 0, workerBuildingId: silo.id });
    const builder = human(8, { residenceBuildingId: 0, workerBuildingId: silo.id });
    expect(resolveSelectedSettlerBuildings(world, idle)).toEqual({ home, work: null });
    expect(resolveSelectedSettlerBuildings(world, builder)).toEqual({ home, work: site });
    for (const person of [idle, builder, { ...builder, workerBuildingId: work.id }]) {
      expect(resolveSelectedSettlerBuildings(world, person)?.work)
        .toBe(findHumanWorkplace(person, world.buildings) ?? null);
    }
  });

  it('includes unfinished construction crew assignments and ignores foreign or dead people', () => {
    expect(resolveSelectedSettlerBuildings(world, human(8))).toEqual({ home: null, work: site });
    expect(resolveSelectedSettlerBuildings(world, human(8, { faction: 'visitor' }))).toBeNull();
    expect(resolveSelectedSettlerBuildings(world, human(8, { alive: false }))).toBeNull();
    expect(resolveSelectedSettlerBuildings(world, human(8, { type: EntityType.Wolf }))).toBeNull();
    expect(resolveSelectedSettlerBuildings(world, null)).toBeNull();
  });

  it('draws separate labels and colours and no marker after deselection', () => {
    const fillText = vi.fn();
    const ctx = {
      save: vi.fn(), restore: vi.fn(), setLineDash: vi.fn(), strokeRect: vi.fn(),
      fillRect: vi.fn(), fillText, measureText: () => ({ width: 40 }),
    } as unknown as CanvasRenderingContext2D;
    const state = {
      camera: { x: 0, y: 0, zoom: 1 }, worldMap: null,
      selectedSettlerBuildings: { home, work },
    } as RenderSnapshot;
    drawSelectedSettlerBuildingHighlights(ctx, state, 800, 600);
    expect(fillText.mock.calls.map(call => call[0])).toEqual(['Home', 'Work']);
    expect(ctx.fillStyle).toBe('#7dd3fc');
    fillText.mockClear();
    drawSelectedSettlerBuildingHighlights(ctx, { ...state, selectedSettlerBuildings: null }, 800, 600);
    expect(fillText).not.toHaveBeenCalled();
  });
});
