/**
 * Wiring guards for the renderer fixes in audit `visuals-looks.md`.
 *
 * Several of these defects are not "a function returns the wrong number" but "the right code runs
 * in the wrong place" (or "the wrong code is still there"), so the honest assertion is on the
 * call site / expression rather than on a return value.
 *
 * A source guard is only evidence if it would have caught the defect, so every pattern here is
 * declared once and then fed **the pre-fix expression quoted by the audit** in
 * "guards are not vacuous" below. The same pattern is used for both halves, so the proof cannot
 * drift from the guard.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MapPreset, TerrainType, type Entity } from '../src/game/gameTypes';
import { testWorldMap } from '../src/test/worldMapFixtures';
import { getHumanSpriteMetrics, getJuvenileFigureScale, HUMAN_WORLD_HEIGHT } from '../src/game/humanSprites';
import { buildEntityLayerKey } from '../src/game/entityLayer';
import type { RenderSnapshot } from '../src/game/renderSnapshot';
import {
  pickAtlasTile,
  pickSandWaterOverlay,
  terrainPaletteHex,
  TERRAIN_PALETTE,
} from '../src/game/terrainAtlas';

function readSrc(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../src/${relative}`, import.meta.url)), 'utf8');
}

// ---- D5: hunt arrows belong in the per-frame overlay, not the tick-keyed entity layer ----
const HUNT_ARROW_IN_ENTITY_LAYER = /drawHuntVisuals\(/;
const HUNT_ARROW_IN_OVERLAY = /drawHuntVisuals\(ctx, state, cw, ch\)/;

// ---- D7 and D22 were deleted with the code they pinned (`pixiTerrain.ts`, 2026-09-25), and their
// patterns with them: an unread constant is the same dead surface the module was. ----

// ---- D8: the sand/water overlay is not nested inside the atlas branch ----
const OVERLAY_INSIDE_ATLAS_PICK = /if \(atlasPick\) \{\s*\n\s*const overlayPick/;

// ---- D12: the minimap reads the canonical palette instead of its own table ----
const MINIMAP_LOCAL_PALETTE = /#5f8a48/;

// ---- D14: one strip index per repaint, not one per road ----
const PER_ROAD_JUNCTION = /detectBuildingJunction\(/;

// ---- D17: the decor ghost takes the procedural draw, not a sprite that has no art on disk ----
const DECOR_PREVIEW_PROCEDURAL = /drawProceduralDecor\(ctx, state\.buildMode/;

// ---- D19: the pulsing leader aura lives only in the per-frame overlay pass ----
const UNGUARDED_LEADER_AURA = /if \(isLeader && cam\.zoom > 0\.22\) \{/;
const AURA_FROM_LAYER_PAINTER = /drawLeaderAura\(ctx, human/;
const AURA_OWNER = /export function drawLeaderAuraOverlay/;
const AURA_IN_LIVE_PASS = /drawLeaderAuraOverlay\(ctx, state, cw, ch\)/;

// ---- D22 was deleted with the code it pinned (`pixiTerrain.ts`, 2026-09-25) ----

describe('D5 — hunt arrows draw in the per-frame overlay', () => {
  it('is not painted into the tick-keyed entity layer', () => {
    // The arrow advances on a millisecond clock (`HUNT_ANIM_MS`) while the layer repaints on a
    // sim tick (≈1.5×/s at 1×), so a ~1 s flight was sampled once or twice and strobed.
    expect(readSrc('game/renderer/entityComposite.ts')).not.toMatch(HUNT_ARROW_IN_ENTITY_LAYER);
    expect(readSrc('game/renderer/overlay.ts')).toMatch(HUNT_ARROW_IN_OVERLAY);
  });
});

describe('D8 — the sand/water overlay is independent of the atlas pick', () => {
  it('is stamped outside the atlas branch', () => {
    const src = readSrc('game/terrainLayer.ts');
    expect(src).not.toMatch(OVERLAY_INSIDE_ATLAS_PICK);
    // Once per base-painter branch: atlas, flat fallback, stamped fill.
    expect((src.match(/drawSandWaterOverlay\(ctx/g) ?? []).length).toBe(3);
  });

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
  it('is defined once and imported by every consumer', () => {
    expect((readSrc('game/terrainAtlas.ts').match(/0x5e7a3a/g) ?? []).length).toBe(1);
    expect(readSrc('game/renderer/terrain.ts')).toContain('TERRAIN_PALETTE');
    // The dormant Pixi ground used to own a third copy of this table; it was deleted 2026-09-25, so
    // the bake and the minimap below are the only two consumers left.
    // The minimap used to carry its own third table, which is why it could not match the map.
    expect(readSrc('components/MiniMap.tsx')).toContain('terrainPaletteHex');
    expect(readSrc('components/MiniMap.tsx')).not.toMatch(MINIMAP_LOCAL_PALETTE);
  });

  it('covers every terrain type with a CSS colour', () => {
    for (const type of Object.values(TerrainType)) {
      expect(terrainPaletteHex(type)).toBe(`#${TERRAIN_PALETTE[type].toString(16).padStart(6, '0')}`);
    }
  });
});

describe('D14 — the road strip index is collected once per repaint', () => {
  it('does not re-derive the junction index per road', () => {
    const src = readSrc('game/renderer/buildings.ts');
    // A call, not the word: the doc comment above the loop names what it replaced.
    expect(src).not.toMatch(PER_ROAD_JUNCTION);
    expect((src.match(/collectStripCenters\(/g) ?? []).length).toBe(1);
  });
});

describe('D16 — every child sprite draws the same painted figure height', () => {
  // Painted-figure fraction of each shipped PNG's canvas, from its alpha bounding box (the Node
  // test tier has no PNG decoder, so these are measurements, not derivations). `child_*` art that
  // is re-cut must re-measure these *and* `JUVENILE_FIGURE_FRACTIONS`.
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
    // And the draw site is what applies it — otherwise the scale is computed and thrown away.
    expect(readSrc('game/renderer/humans.ts')).toMatch(/spriteH \* getJuvenileFigureScale\(human\)/);
  });

  it('leaves adults on the unnormalised world height', () => {
    const adult = { id: 8, gender: 'male', isJuvenile: false, size: 10, spriteVariant: 0 } as unknown as Entity;
    expect(getHumanSpriteMetrics(adult, 4).spriteH).toBeCloseTo(HUMAN_WORLD_HEIGHT * 4, 6);
  });
});

describe('D17 — the decor build preview draws the decor, not a rectangle', () => {
  it('routes decor types through the same procedural draw as the placed building', () => {
    const src = readSrc('game/renderer/buildPreview.ts');
    expect(src).toMatch(DECOR_PREVIEW_PROCEDURAL);
    expect(src).toContain('isDecorType(state.buildMode)');
    // The garden/statue/lamp `sprite:` paths have no art on disk, so the sprite lookup can only
    // ever return null for them — the ghost must not depend on it.
    expect(src).toMatch(/const previewFrame = isDecor \? null : getSpriteFrame\(cfg\.sprite\)/);
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
    // The field list the key carried before the fix (audit D18): no `selectedEntityIds`, no
    // `juiceEffectsEnabled`. Same snapshots, same string — which is why the cached bitmap stayed
    // stale until the next tick, and indefinitely while paused.
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

describe('D19 — the leader aura is drawn per frame, not into the cached layer', () => {
  it('has exactly one owner, in the overlay pass', () => {
    const humans = readSrc('game/renderer/humans.ts');
    // The aura pulses on `renderTime` (every frame) while `drawHumans` feeds the tick-keyed entity
    // bitmap (one repaint per sim tick, none while paused), and that painter's only caller passes
    // `forEntityLayerCache = true` — so an aura drawn from it either froze or vanished entirely.
    expect(humans).not.toMatch(AURA_FROM_LAYER_PAINTER);
    expect(humans).not.toMatch(UNGUARDED_LEADER_AURA);
    expect(humans).toMatch(AURA_OWNER);
    expect(readSrc('game/renderer/overlay.ts')).toMatch(AURA_IN_LIVE_PASS);
  });
});

// D20 (the Pixi seasonal animation clock) was deleted with the code it pinned: `pixiTerrain.ts`
// and its `animateSeasonalEffects` are gone (2026-09-25), so the render-clock claim has no owner
// left to guard.

// D21 (the prop-flip mirror) was deleted with the code it pinned: `stampPropSprite` and the
// whole tile-era `bakeTerrainDecor` ground pass it belonged to. The per-pixel Whittaker bake owns
// ground detail now, and a real `flipX` mirror for L3 decor is D24's business, not this one's.

// D22 (boundary tiles feathering every differing neighbour) was deleted with the code it pinned:
// `drawSoftTransition` lived in `pixiTerrain.ts`, deleted 2026-09-25.

describe('D23 — ghost and strip previews ride the terrain relief', () => {
  it('lifts the ghost sprite and both preview plates', () => {
    expect(readSrc('game/renderer/buildPreview.ts')).toContain('terrainRiseAt(state.worldMap');
    // Once for the strip segments, once for the ghost plate.
    expect((readSrc('game/renderer/grid.ts').match(/terrainRiseAt\(state\.worldMap/g) ?? []).length).toBe(2);
  });
});

describe('D27 — the build-grid plate is drawn where its verdict is computed', () => {
  it('positions the marker on the snapped centre', () => {
    const src = readSrc('game/renderer/grid.ts');
    expect(src).toContain('const px = worldToScreenX(cx, cam, cw);');
    expect(src).not.toContain('worldToScreenX(rawX,');
  });
});

describe('D25 — the progress-smoothing samples are bounded', () => {
  it('drops finished buildings and caps the map', () => {
    const src = readSrc('game/buildingProgressDisplay.ts');
    expect(src).toMatch(/if \(value >= 100\) \{\s*\n\s*samples\.delete\(building\.id\);/);
    expect(src).toMatch(/samples\.size >= MAX_PROGRESS_SAMPLES/);
  });
});

describe('D26 — one floating-text fade window', () => {
  it('is a named constant used by the alpha fade and the shrink ramp', () => {
    expect(readSrc('game/renderer/markers.ts')).toContain('FLOATING_TEXT_FADE_TICKS');
    expect(readSrc('game/renderer/markers.ts')).not.toMatch(/ft\.life < 7/);
    expect(readSrc('game/tickLayerRealtime.ts')).toContain('FLOATING_TEXT_FADE_TICKS');
    expect(readSrc('game/tickLayerRealtime.ts')).not.toMatch(/ft\.life < 6/);
  });
});

describe('guards are not vacuous', () => {
  // Each case feeds the pattern above the exact pre-fix source quoted by the audit, so a pattern
  // that could never fail is a test failure here rather than a silent non-guard.
  it('each pattern catches the defect it was written for', () => {
    // D5 — `entityComposite.ts:42` before the move.
    expect('  drawHuntVisuals(drawCtx, state, cw, ch);').toMatch(HUNT_ARROW_IN_ENTITY_LAYER);
    // D8 — `terrainLayer.ts:535-536` before the fix.
    expect('if (atlasPick) {\n      const overlayPick = overlayReady ? pickSandWaterOverlay(map, tx, ty) : null;')
      .toMatch(OVERLAY_INSIDE_ATLAS_PICK);
    // D12 — `MiniMap.tsx:19` before the fix.
    expect("  [TerrainType.Grassland]: '#5f8a48',").toMatch(MINIMAP_LOCAL_PALETTE);
    // D14 — `buildings.ts:49` before the fix.
    expect("const roadJunction = detectBuildingJunction(state.buildings, b, 'road');")
      .toMatch(PER_ROAD_JUNCTION);
  });

  it('the pre-fix terrain fill really did stamp twice', () => {
    const preFixBody = `
    ctx.drawImage(img as CanvasImageSource, 0, 0, iw, ih, x0, y0, fillW, fillH);
    if (sx > 0 || sy > 0) {
      ctx.globalAlpha = prev * alpha * 0.35;
      ctx.drawImage(img as CanvasImageSource, sx, sy, Math.max(1, iw - sx), Math.max(1, ih - sy), x0, y0, fillW, fillH);
    }`;
    expect((preFixBody.match(/drawImage\(/g) ?? []).length).toBe(2);
  });

  it('each D16–D27 pattern catches the pre-fix code the audit quoted', () => {
    // D17 — `buildPreview.ts:77-80` before the fix: the sprite lookup could only return null, so
    // the ghost was this validity-coloured rectangle and no procedural draw existed.
    expect("    ctx.fillStyle = valid ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)';")
      .not.toMatch(DECOR_PREVIEW_PROCEDURAL);
    // D19 — the aura call the layer painter used to make, verbatim.
    expect('      drawLeaderAura(ctx, human, sx, footY, headY, size, spriteH, bobY, cam.zoom);')
      .toMatch(AURA_FROM_LAYER_PAINTER);
    expect('    if (isLeader && cam.zoom > 0.22) {').toMatch(UNGUARDED_LEADER_AURA);
    // D27 — `grid.ts:272-273` before the fix: plate on the raw cell, verdict on the snapped one.
    expect('const px = worldToScreenX(rawX, cam, cw);').not.toContain('worldToScreenX(cx,');
  });

  it('the D21 flip is a transform, so identical draw calls are not a defect', () => {
    // Pre-fix (and current) `stampPropSprite`: the two `drawImage` calls are textually identical
    // inside `if (flipX)`, *after* `ctx.scale(-1, 1)`. That mirrors the content — the audit read it
    // as a no-op and its suggested re-positioning would have moved the prop a full width.
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
