/**
 * Wiring guards for the renderer: each pattern is declared once and checked against the source
 * expression it must catch.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MapPreset, TerrainType, BuildingType, type Entity } from '../src/game/gameTypes';
import { testWorldMap } from '../src/test/worldMapFixtures';
import { getHumanSpriteMetrics, getJuvenileFigureScale, HUMAN_WORLD_HEIGHT } from '../src/game/humanSprites';
import { buildEntityLayerKey } from '../src/game/entityLayer';
import { buildRenderSnapshot, type RenderSnapshot } from '../src/game/renderSnapshot';
import { drawBuildSnapOverlay } from '../src/game/renderer/grid';
import { initGame } from '../src/game/worldGen';
import { createBuildGhost, createInitialView, type ViewState } from '../src/game/viewState';
import {
  pickAtlasTile,
  pickSandWaterOverlay,
  terrainPaletteHex,
  TERRAIN_PALETTE,
} from '../src/game/terrainAtlas';

function readSrc(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../src/${relative}`, import.meta.url)), 'utf8');
}

describe('W-06 — placement verdict markers follow the live ghost', () => {
  /** Records each diamond's first point, which is one marker per candidate cell. */
  function recordingContext() {
    const markers: { x: number; y: number }[] = [];
    const ctx = {
      save() {},
      restore() {},
      beginPath() {},
      moveTo(x: number, y: number) { markers.push({ x, y }); },
      lineTo() {},
      closePath() {},
      fill() {},
      stroke() {},
      ellipse() {},
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, markers };
  }

  it('re-centres the verdict cloud when the ghost moves, with no cache-key term', () => {
    const world = initGame({ villageName: 'Ghost', seed: 20261111 });
    const view = createInitialView(world.width, world.height) as ViewState;
    const atGhost = (dx: number) => {
      const snapshot = buildRenderSnapshot(world, {
        ...view,
        buildMode: BuildingType.House,
        buildGhost: createBuildGhost(view.camera.x + dx, view.camera.y, null),
      });
      const { ctx, markers } = recordingContext();
      drawBuildSnapOverlay(ctx, snapshot, 800, 600);
      return markers.map((marker) => marker.x);
    };

    const left = atGhost(-100);
    const right = atGhost(100);
    expect(left.length).toBeGreaterThan(0);
    expect(Math.max(...right) - Math.max(...left)).toBeGreaterThan(100);
    expect(Math.min(...right) - Math.min(...left)).toBeGreaterThan(100);
  });


});





describe('D8 — the sand/water overlay is independent of the atlas pick', () => {


  it('has a material the atlas cannot paint, which is why the old gate was wrong', () => {
    // A coastal strip: open water across the top row, beach below it.
    const map = testWorldMap({
      tilesX: 3,
      tilesY: 3,
      seed: 5,
      preset: MapPreset.Coastal,
      tileType: (tx, ty) => (ty === 0 ? TerrainType.DeepWater : TerrainType.Beach),
    });

    // A beach tile has no atlas family, so it never receives an `atlasPick`…
    expect(pickAtlasTile(map, 1, 1)).toBeNull();
    // …while the mask it exists for is exactly what this tile wants.
    expect(pickSandWaterOverlay(map, 1, 1)).not.toBeNull();
  });
});

describe('D9 — a terrain fill is stamped once', () => {
  it('draws a single, unstretched copy of the texture', () => {
    const src = readSrc('game/terrainLayer.ts');
    const body = src.slice(src.indexOf('function drawTerrainFill('), src.indexOf('type Cardinal'));
    expect((body.match(/drawImage\(/g) ?? []).length).toBe(1);
  });
});

describe('D12 — one terrain palette owner', () => {


  it('covers every terrain type with a CSS colour', () => {
    for (const type of Object.values(TerrainType)) {
      expect(terrainPaletteHex(type)).toBe(`#${TERRAIN_PALETTE[type].toString(16).padStart(6, '0')}`);
    }
  });
});



describe('D16 — every child sprite draws the same painted figure height', () => {
  // Painted-figure fraction of each PNG's canvas from its alpha bounding box (this tier has no
  // PNG decoder). Re-cut `child_*` art must re-measure these and `JUVENILE_FIGURE_FRACTIONS`.
  const CHILD_ART = [
    { gender: 'male', variant: 0, path: 'child_boy_bakersboy.png', figure: 0.918 },
    { gender: 'male', variant: 1, path: 'child_boy_merchantson.png', figure: 0.880 },
    { gender: 'female', variant: 0, path: 'child_girl_doctorsdaughter.png', figure: 1.0 },
    { gender: 'female', variant: 1, path: 'child_girl_poorservant.png', figure: 0.970 },
  ] as const;

  const child = (gender: string, variant: number): Entity =>
    ({ id: 7, gender, isJuvenile: true, size: 10, spriteVariant: variant }) as unknown as Entity;

  it('pairs a shared figure height with a box grown by the art fraction', () => {
    const zoom = 4; // clear of the HUMAN_MIN_SCREEN_PX floor, which would clamp every child alike
    for (const { gender, variant, figure, path } of CHILD_ART) {
      const human = child(gender, variant);
      // `spriteH` is the *figure* height, and it is the same for every child…
      expect(getHumanSpriteMetrics(human, zoom).spriteH, path)
        .toBeCloseTo(HUMAN_WORLD_HEIGHT * 0.72 * zoom, 6);
      // …so the drawn box must be `spriteH / fraction` for the padded figure inside it to fill it.
      expect(getJuvenileFigureScale(human), path).toBeCloseTo(1 / figure, 6);
    }
  });

  it('leaves adults on the unnormalised world height', () => {
    const adult = { id: 8, gender: 'male', isJuvenile: false, size: 10, spriteVariant: 0 } as unknown as Entity;
    expect(getHumanSpriteMetrics(adult, 4).spriteH).toBeCloseTo(HUMAN_WORLD_HEIGHT * 4, 6);
  });
});



describe('D18 — the entity layer key covers what its painters read', () => {
  function snapshot(overrides: Record<string, unknown> = {}): RenderSnapshot {
    return {
      tick: 10,
      hourOfDay: 5,
      showGrid: false,
      showPaths: false,
      hoveredBuilding: null,
      selectedEntity: null,
      selectedBuilding: null,
      selectedEntityIds: [],
      juiceEffectsEnabled: true,
      villageLeaderId: null,
      highlightedCampKey: null,
      buildMode: null,
      buildRotation: 0,
      buildGhost: null,
      buildStripPreview: null,
      pendingRaidEvents: [],
      pendingOutgoingRaidEvents: [],
      visitorGroups: [],
      buildings: [],
      entities: [],
      ...overrides,
    } as unknown as RenderSnapshot;
  }

  it('changes when only a non-primary selection id changes', () => {
    // `humans.ts` / `animals.ts` draw a ring per id in `selectedEntityIds`, so dropping the second
    // id has to invalidate the cached bitmap even though `selectedEntity.id` is unchanged.
    const two = buildEntityLayerKey(snapshot({ selectedEntityIds: [1, 2], selectedEntity: { id: 1 } }), 800, 600);
    const one = buildEntityLayerKey(snapshot({ selectedEntityIds: [1], selectedEntity: { id: 1 } }), 800, 600);
    expect(two).not.toBe(one);
  });

  it('changes when the juice-effects preference flips', () => {
    expect(buildEntityLayerKey(snapshot({ juiceEffectsEnabled: true }), 800, 600))
      .not.toBe(buildEntityLayerKey(snapshot({ juiceEffectsEnabled: false }), 800, 600));
  });

  it('the pre-fix key could not tell those states apart', () => {
    // A key without `selectedEntityIds` and `juiceEffectsEnabled` collides on these snapshots,
    // so the cached bitmap stays stale.
    const preFixKey = (s: RenderSnapshot): string => [
      s.tick, s.hourOfDay, s.showGrid ? 1 : 0, s.showPaths ? 1 : 0,
      s.hoveredBuilding?.id ?? '', s.selectedEntity?.id ?? '', s.selectedBuilding?.id ?? '',
      s.villageLeaderId ?? '', s.highlightedCampKey ?? '', s.buildMode ?? '', s.buildRotation ?? 0,
      s.pendingRaidEvents?.length ?? 0, s.pendingOutgoingRaidEvents?.length ?? 0,
      s.visitorGroups.length, s.buildings.length, s.entities.length,
    ].join('|');
    const two = snapshot({ selectedEntityIds: [1, 2], selectedEntity: { id: 1 } });
    const one = snapshot({ selectedEntityIds: [1], selectedEntity: { id: 1 } });
    expect(preFixKey(two)).toBe(preFixKey(one));
    expect(preFixKey(snapshot({ juiceEffectsEnabled: true })))
      .toBe(preFixKey(snapshot({ juiceEffectsEnabled: false })));
  });
});





describe('guards are not vacuous', () => {
  // Each case feeds the pattern a source it must catch, so a vacuous pattern fails here rather
  // than sitting as a silent non-guard.


  it('the pre-fix terrain fill really did stamp twice', () => {
    const preFixBody = `
    ctx.drawImage(img as CanvasImageSource, 0, 0, iw, ih, x0, y0, fillW, fillH);
    if (sx > 0 || sy > 0) {
      ctx.globalAlpha = prev * alpha * 0.35;
      ctx.drawImage(img as CanvasImageSource, sx, sy, Math.max(1, iw - sx), Math.max(1, ih - sy), x0, y0, fillW, fillH);
    }`;
    expect((preFixBody.match(/drawImage\(/g) ?? []).length).toBe(2);
  });



  it('the D21 flip is a transform, so identical draw calls are not a defect', () => {
    // `stampPropSprite`'s two `drawImage` calls are identical inside `if (flipX)`, after
    // `ctx.scale(-1, 1)`, so the transform mirrors the content; this is not a defect.
    const preFixBody = `
  if (flipX) {
    ctx.scale(-1, 1);
    ctx.drawImage(img as CanvasImageSource, 0, 0, iw, ih, -drawW / 2, -drawH * 0.85, drawW, drawH);
  } else {
    ctx.drawImage(img as CanvasImageSource, 0, 0, iw, ih, -drawW / 2, -drawH * 0.85, drawW, drawH);
  }`;
    expect((preFixBody.match(/-drawW \/ 2, -drawH \* 0\.85/g) ?? []).length).toBe(2);
    expect(preFixBody).toContain('ctx.scale(-1, 1);');
  });
});
