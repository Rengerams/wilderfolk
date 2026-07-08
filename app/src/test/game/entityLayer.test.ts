import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, Season } from '@/game/gameTypes';
import {
  beginEntityLayerPaint,
  buildEntityLayerKey,
  disposeEntityLayerCache,
  entityLayerNeedsRebuild,
  getEntityLayerCache,
} from '@/game/entityLayer';
import type { RenderSnapshot } from '@/game/renderSnapshot';
import { createInitialForgeState } from '@/game/forge';
import { createEntity } from '@/game/worldGen';

function minimalSnapshot(overrides: Partial<RenderSnapshot> = {}): RenderSnapshot {
  const human = createEntity(EntityType.Human, 0, 0, 1, 250);
  return {
    entities: [human],
    entityByType: {
      [EntityType.Grass]: [],
      [EntityType.Tree]: [],
      [EntityType.Rabbit]: [],
      [EntityType.Deer]: [],
      [EntityType.Wolf]: [],
      [EntityType.Fox]: [],
      [EntityType.Human]: [human],
      [EntityType.Werewolf]: [],
      [EntityType.Wildkin]: [],
    },
    buildings: [],
    deathParticles: [],
    floatingTexts: [],
    tick: 10,
    hourOfDay: 12,
    season: Season.Summer,
    year: 1,
    dayInYear: 1,
    width: 400,
    height: 300,
    weather: 'clear' as RenderSnapshot['weather'],
    worldMap: null,
    disasters: [],
    camera: { x: 200, y: 150, zoom: 1, targetX: 200, targetY: 150, targetZoom: 1 },
    screenShake: 0,
    selectedEntity: null,
    selectedBuilding: null,
    hoveredBuilding: null,
    buildMode: null,
    buildGhost: null,
    buildStripPreview: null,
    buildRotation: 0,
    showGrid: false,
    showPaths: false,
    festival: null,
    visitorGroups: [],
    rivalSettlements: [],
    highlightedCampKey: null,
    ecosystemHealth: 80,
    pollutionLevel: 0,
    renffrOmen: null,
    unlockedTechs: [],
    researchNodes: [],
    hasBlacksmith: false,
    villageForge: createInitialForgeState(),
    villageLeaderId: null,
    pendingRaidEvents: [],
    pendingOutgoingRaidEvents: [],
    juiceEffectsEnabled: true,
    renderSoA: null,
    renderMetaBySlot: null,
    scentGrid: null,
    scentReader: null,
    grassGrid: null,
    ...overrides,
  };
}

describe('entityLayer', () => {
  it('changes key when tick or camera moves', () => {
    const base = minimalSnapshot();
    const keyA = buildEntityLayerKey(base, 800, 600);
    const keyB = buildEntityLayerKey({ ...base, tick: 11 }, 800, 600);
    const keyC = buildEntityLayerKey(
      { ...base, camera: { x: 210, y: 150, zoom: 1, targetX: 210, targetY: 150, targetZoom: 1 } },
      800,
      600,
    );
    expect(keyB).not.toBe(keyA);
    expect(keyC).not.toBe(keyA);
  });

  it('reuses offscreen surface when dimensions match', () => {
    disposeEntityLayerCache();
    const state = minimalSnapshot();
    const key = buildEntityLayerKey(state, 320, 240);
    const first = beginEntityLayerPaint(key, 320, 240);
    first.ctx.fillStyle = '#ff0000';
    first.ctx.fillRect(0, 0, 4, 4);

    const secondKey = buildEntityLayerKey({ ...state, tick: 11 }, 320, 240);
    expect(entityLayerNeedsRebuild(getEntityLayerCache(), secondKey, 320, 240)).toBe(true);
    const second = beginEntityLayerPaint(secondKey, 320, 240);
    expect(second.surface).toBe(first.surface);
    expect(second.width).toBe(320);
  });

  it('invalidates when build mode changes', () => {
    const base = minimalSnapshot();
    const plain = buildEntityLayerKey(base, 640, 480);
    const building = buildEntityLayerKey({ ...base, buildMode: BuildingType.House }, 640, 480);
    expect(building).not.toBe(plain);
  });
});