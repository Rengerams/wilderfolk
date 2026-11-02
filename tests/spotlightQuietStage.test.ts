/**
 * A running Spotlight performance owns the frame: name plates and the gold building level
 * frames, pennants and level text are gameplay markers, and they were burying the cast.
 */
import { describe, expect, it } from 'vitest';
import { createBuilding } from '../src/game/worldGen';
import { BuildingType, EntityType, type SpotlightLoreState } from '../src/game/gameTypes';
import { createEntity } from '../src/game/entityFactory';
import { buildEntityByType } from '../src/game/simFocus';
import { resetEntityCaches, updateCachedEntities } from '../src/game/renderer/entityCache';
import { drawHumans } from '../src/game/renderer/humans';
import { drawBuildings } from '../src/game/renderer/buildings';
import { buildEntityLayerKey } from '../src/game/entityLayer';
import type { RenderSnapshot } from '../src/game/renderSnapshot';

interface Recorder {
  ctx: CanvasRenderingContext2D;
  fillStyles: string[];
  strokeStyles: string[];
  texts: string[];
}

/** One no-op context that remembers the colours and strings a painter chose. */
function recorder(): Recorder {
  const fillStyles: string[] = [];
  const strokeStyles: string[] = [];
  const texts: string[] = [];
  const gradient = { addColorStop: () => {} };
  const ctx = {
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    shadowBlur: 0,
    shadowColor: '',
    get fillStyle() {
      return '';
    },
    set fillStyle(value: string) {
      fillStyles.push(String(value));
    },
    get strokeStyle() {
      return '';
    },
    set strokeStyle(value: string) {
      strokeStyles.push(String(value));
    },
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
    rotate: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    quadraticCurveTo: () => {},
    arc: () => {},
    ellipse: () => {},
    rect: () => {},
    fill: () => {},
    stroke: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    clearRect: () => {},
    drawImage: () => {},
    fillText: (text: string) => {
      texts.push(String(text));
    },
    measureText: () => ({ width: 10 }),
    setLineDash: () => {},
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
  } as unknown as CanvasRenderingContext2D;
  return { ctx, fillStyles, strokeStyles, texts };
}

const CAMERA = { x: 100, y: 100, zoom: 1, targetX: 100, targetY: 100, targetZoom: 1 };

function snapshot(overrides: Record<string, unknown>): RenderSnapshot {
  return {
    camera: CAMERA,
    buildings: [],
    entities: [],
    visitorGroups: [],
    pendingRaidEvents: [],
    pendingOutgoingRaidEvents: [],
    hoveredBuilding: null,
    selectedBuilding: null,
    selectedEntity: null,
    selectedEntityIds: [],
    villageLeaderId: null,
    highlightedCampKey: null,
    buildMode: null,
    buildRotation: 0,
    showGrid: false,
    showPaths: false,
    juiceEffectsEnabled: true,
    tick: 1,
    hourOfDay: 12,
    worldMap: null,
    spotlightLore: null,
    unlockedTechs: [],
    hasBlacksmith: false,
    villageForge: null,
    workSchedule: undefined,
    ...overrides,
  } as unknown as RenderSnapshot;
}

function readyScene(heroineId: number): SpotlightLoreState {
  return {
    id: 'quiet-stage',
    heroineId,
    performerIds: [],
    phase: 'ready',
    startedAtTick: 0,
    readyAtTick: 1,
    gatherX: 100,
    gatherY: 100,
    slots: [],
  };
}

describe('Spotlight performance hides gameplay markers for its duration', () => {
  it('draws no settler name plate while the scene is ready, and restores it afterwards', () => {
    const person = createEntity(EntityType.Human, 100, 100, 7, undefined, true, {
      name: 'Ada', surname: 'Hale', gender: 'female', ageYears: 30, colonyDay: 3,
    });
    const paint = (spotlightLore: SpotlightLoreState | null, tick: number): string[] => {
      resetEntityCaches();
      updateCachedEntities(buildEntityByType([person]), null, tick, CAMERA, 960, 720, 800, 600);
      const { ctx, texts } = recorder();
      drawHumans(ctx, snapshot({ tick, spotlightLore }), 800, 600);
      return texts;
    };
    expect(paint(null, 1).join('|')).toContain('Ada');
    expect(paint(readyScene(person.id), 2).join('|')).not.toContain('Ada');
  });

  it('draws no gold level frame, pennant or level text while the scene is ready', () => {
    const house = createBuilding(BuildingType.House, 100, 100, 31);
    house.completed = true;
    house.constructionProgress = 100;
    house.level = 3;
    const paint = (spotlightLore: SpotlightLoreState | null, tick: number) => {
      const { ctx, fillStyles, strokeStyles, texts } = recorder();
      drawBuildings(ctx, snapshot({ buildings: [house], tick, spotlightLore }), 800, 600);
      return { fillStyles, strokeStyles, texts };
    };
    const shown = paint(null, 1);
    expect(shown.strokeStyles).toContain('rgba(250,204,21,0.85)');
    expect(shown.texts).toContain('Lv3');

    const hidden = paint(readyScene(99), 2);
    expect(hidden.strokeStyles).not.toContain('rgba(250,204,21,0.85)');
    expect(hidden.texts).not.toContain('Lv3');
    // The building itself still paints, so the stage is not blank.
    expect(hidden.fillStyles.length).toBeGreaterThan(0);
  });

  it('repaints the baked building layer when the performance starts', () => {
    expect(buildEntityLayerKey(snapshot({ spotlightLore: readyScene(7) }), 800, 600))
      .not.toBe(buildEntityLayerKey(snapshot({ spotlightLore: null }), 800, 600));
  });
});
