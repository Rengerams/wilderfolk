/**
 * PixiJS v8 GPU renderer — Fase B.
 *
 * Architecture: the existing Canvas 2D pipeline bakes the expensive layers
 * (terrain, decor, entity cache) into canvases once per change. Pixi uploads
 * those canvases as GPU textures (cheap — only on rebake) and renders them with
 * a camera transform, adding:
 *   - an animated water wave shader (tiling wave texture, 'screen' blended)
 *   - a subtle vibrance colour grade (ColorMatrixFilter)
 * The per-frame 2D overlay pass (weather, particles, night, glow, grid,
 * vignette) still runs on the ORIGINAL canvas — which stays transparent and on
 * top, so all existing pointer/keyboard input keeps working untouched.
 *
 * WebGL is feature-detected; if it is unavailable or init throws, the caller
 * falls back to the classic Canvas 2D renderer.
 */
import {
  Application,
  GlProgram,
  ColorMatrixFilter,
  Container,
  Filter,
  Sprite,
  Texture,
  TilingSprite,
} from 'pixi.js';
import type { RenderSnapshot } from './renderSnapshot';
import { drawGameOverlay, getBakedLayerCanvases } from './renderer';
import { TERRAIN_TILE_SIZE } from './gameTypes';
import type { CanvasSurface } from './canvasLayer';

/** Set VITE_USE_PIXI=0 to force the Canvas 2D renderer. */
const PIXI_DISABLED = typeof import.meta !== 'undefined' && import.meta.env?.VITE_USE_PIXI === '0';

let app: Application | null = null;
let world: Container | null = null;
let terrainSprite: Sprite | null = null;
let decorSprite: Sprite | null = null;
let entitySprite: Sprite | null = null;
let waterSprite: TilingSprite | null = null;
let colorFilter: ColorMatrixFilter | null = null;
let waterTex: Texture | null = null;
let lastTerrain: CanvasSurface | null = null;
let lastDecor: CanvasSurface | null = null;
let lastEntity: CanvasSurface | null = null;
let lastEntityKey = '';
let lastTime = 0;
let time = 0;

/** Flowing wave distortion + specular highlight — the animated water surface. */
const WATER_FRAGMENT = `
varying vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform float uTime;

void main(void) {
  vec2 uv = vTextureCoord;
  // flowing sine currents: bands drift downstream with a gentle lateral sway
  float flow = sin(uv.y * 40.0 + uTime * 1.3 + sin(uv.x * 24.0 + uTime * 0.8) * 2.1);
  // subtle refraction-like displacement
  vec2 off = vec2(sin(uv.y * 28.0 + uTime * 0.7) * 0.012, sin(uv.x * 22.0 - uTime * 0.5) * 0.006);
  vec4 c = texture2D(uTexture, uv + off);
  // moving specular glints ride the wave crests
  float glint = smoothstep(0.55, 1.0, flow) * 0.55;
  c.rgb += vec3(glint * 0.85, glint * 0.98, glint * 1.25);
  gl_FragColor = c;
}
`;

/** Filter vertex shader — the filter quad only has aPosition (0..1), so the
 * texture UV is simply the position. */
const DEFAULT_VERTEX = `
attribute vec2 aPosition;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
varying vec2 vTextureCoord;
void main(void) {
  gl_Position = vec4((uProjectionMatrix * uWorldTransformMatrix * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vTextureCoord = aPosition;
}
`;

/** OffscreenCanvas → HTMLCanvasElement (draw once; used for texture uploads). */
function toHtmlCanvas(canvas: CanvasSurface): HTMLCanvasElement {
  if (canvas instanceof HTMLCanvasElement) return canvas;
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  out.getContext('2d')?.drawImage(canvas, 0, 0);
  return out;
}

/**
 * Texture sync — only uploads when the baked canvas identity changes (the 2D
 * pipeline reuses the same canvas object while it is valid).
 */
function syncTexture(sprite: Sprite | null, canvas: CanvasSurface | null): boolean {
  if (!sprite) return false;
  if (canvas) {
    sprite.texture = Texture.from(toHtmlCanvas(canvas));
    sprite.visible = true;
    return true;
  }
  sprite.visible = false;
  return false;
}

/** World → screen placement, mirroring the Canvas 2D blits exactly. */
function placeWorldSprite(
  sprite: Sprite | null,
  worldX: number,
  worldY: number,
  sizeW: number,
  sizeH: number,
  cam: RenderSnapshot['camera'],
  cw: number,
  ch: number,
): void {
  if (!sprite || !sprite.visible) return;
  sprite.x = (worldX - cam.x) * cam.zoom + cw / 2;
  sprite.y = (worldY - cam.y) * cam.zoom + ch / 2;
  sprite.width = sizeW * cam.zoom;
  sprite.height = sizeH * cam.zoom;
}

/** Tileable water wave texture: light crest bands on transparent (GPU animated). */
function createWaterWaveTexture(): Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, size, size);
  // a few soft crest bands — the shader scrolls + distorts them
  for (let i = 0; i < 5; i++) {
    const y = (i * 25 + 6) % size;
    const grad = g.createLinearGradient(0, y - 5, 0, y + 5);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, `rgba(210,235,255,${0.16 + i * 0.015})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, y - 5, size, 10);
  }
  // fine ripple speckles
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 60; i++) {
    g.fillRect((i * 37) % size, (i * 53) % size, 2, 1);
  }
  const tex = Texture.from(canvas);
  tex.source.wrapMode = 'repeat';
  return tex;
}

export function pixiActive(): boolean {
  return app !== null && world !== null;
}

export async function initPixiRenderer(originalCanvas: HTMLCanvasElement): Promise<boolean> {
  if (PIXI_DISABLED) return false;
  try {
    const cssW = originalCanvas.clientWidth || originalCanvas.width || 800;
    const cssH = originalCanvas.clientHeight || originalCanvas.height || 600;
    const dpr = Math.max(1, Math.min(2, (originalCanvas.width || cssW) / Math.max(1, cssW) || (window.devicePixelRatio || 1)));
    app = new Application();
    await app.init({
      width: cssW,
      height: cssH,
      resolution: dpr,
      antialias: false,
      backgroundAlpha: 0,
      preference: 'webgl',
      autoStart: false,
      preserveDrawingBuffer: true,
    });
    app.canvas.style.width = `${cssW}px`;
    app.canvas.style.height = `${cssH}px`;
  } catch {
    if (app) {
      app.canvas?.remove();
      app = null;
    }
    return false;
  }

  world = new Container();
  app.stage.addChild(world);

  terrainSprite = new Sprite();
  decorSprite = new Sprite();
  entitySprite = new Sprite();
  world.addChild(terrainSprite, decorSprite, entitySprite);

  waterTex = createWaterWaveTexture();
  waterSprite = new TilingSprite({ texture: waterTex, width: 100, height: 100 });
  waterSprite.blendMode = 'screen';
  waterSprite.alpha = 0.6;
  const waterFilter = new Filter({
    glProgram: new GlProgram({ fragment: WATER_FRAGMENT, vertex: DEFAULT_VERTEX }),
    resources: {
      timeUniforms: {
        uTime: { value: 0, type: 'f32' },
      },
    },
  });
  waterSprite.filters = [waterFilter];
  world.addChildAt(waterSprite, 1); // between terrain and decor

  // subtle vibrance / lift — keeps the baked palette but gives it a gentle punch
  colorFilter = new ColorMatrixFilter();
  colorFilter.saturate(0.12);
  colorFilter.brightness(1.03, false);
  world.filters = [colorFilter];

  const host = originalCanvas.parentElement;
  if (!host) {
    disposePixiRenderer();
    return false;
  }
  app.canvas.style.position = 'absolute';
  app.canvas.style.inset = '0';
  app.canvas.style.pointerEvents = 'none';
  host.insertBefore(app.canvas, originalCanvas);
  return true;
}

export function disposePixiRenderer(): void {
  if (app) {
    app.destroy(true);
    app = null;
  }
  world = null;
  terrainSprite = decorSprite = entitySprite = null;
  waterSprite = null;
  colorFilter = null;
  waterTex = null;
  lastTerrain = lastDecor = lastEntity = null;
  lastEntityKey = '';
}

/**
 * Per-frame render: upload bakes when they change, apply the camera, draw the
 * 2D overlay pass on the original canvas (transparent top layer → input intact).
 */
export function renderGamePixi(
  ctx: CanvasRenderingContext2D,
  state: RenderSnapshot,
  cw: number,
  ch: number,
): void {
  if (!app || !world) return;

  // Keep the Pixi canvas in sync with the game canvas — init may have caught
  // the original canvas mid-layout at a small size (then we resize to match).
  const backingW = ctx.canvas.width;
  const backingH = ctx.canvas.height;
  if (app.canvas.width !== backingW || app.canvas.height !== backingH) {
    const dpr = Math.max(1, Math.min(2, backingW / Math.max(1, ctx.canvas.clientWidth || cw)));
    app.renderer.resize(cw, ch, dpr);
    app.canvas.style.width = `${cw}px`;
    app.canvas.style.height = `${ch}px`;
  }

  const now = performance.now();
  const dt = lastTime > 0 ? Math.min(0.1, (now - lastTime) / 1000) : 1 / 60;
  lastTime = now;
  time += dt;

  const layers = getBakedLayerCanvases(state, cw, ch);
  const cam = state.camera;
  const worldW = state.worldMap ? state.worldMap.width * TERRAIN_TILE_SIZE : 0;
  const worldH = state.worldMap ? state.worldMap.height * TERRAIN_TILE_SIZE : 0;

  // Textures only change when a bake is re-created; placement changes EVERY
  // frame (camera pan/zoom) and mirrors the 2D blits exactly.
  if (layers.terrain !== lastTerrain) {
    lastTerrain = layers.terrain;
    syncTexture(terrainSprite, layers.terrain);
  }
  if (layers.decor !== lastDecor) {
    lastDecor = layers.decor;
    syncTexture(decorSprite, layers.decor);
  }
  if (layers.entity !== lastEntity || layers.entityKey !== lastEntityKey) {
    lastEntity = layers.entity;
    lastEntityKey = layers.entityKey;
    syncTexture(entitySprite, layers.entity);
  }

  // world → screen placement every frame
  if (terrainSprite?.visible && layers.terrain) {
    placeWorldSprite(terrainSprite, 0, 0, layers.terrain.width, layers.terrain.height, cam, cw, ch);
  }
  if (decorSprite?.visible && layers.decor) {
    placeWorldSprite(decorSprite, 0, 0, layers.decor.width, layers.decor.height, cam, cw, ch);
  }
  if (entitySprite?.visible && layers.entity && layers.entityAnchor) {
    // entity surface is anchored with a margin and blitted at NATURAL size
    // (zoom is baked into the surface at the anchor) — matches paintEntityLayerTo
    entitySprite.x = (layers.entityAnchor.anchorX - cam.x) * cam.zoom - layers.entityAnchor.margin;
    entitySprite.y = (layers.entityAnchor.anchorY - cam.y) * cam.zoom - layers.entityAnchor.margin;
    entitySprite.width = layers.entity.width;
    entitySprite.height = layers.entity.height;
  }

  // water: world-sized tiling surface, animated by the shader + slow drift
  if (waterSprite && state.worldMap) {
    waterSprite.x = -cam.x * cam.zoom + cw / 2;
    waterSprite.y = -cam.y * cam.zoom + ch / 2;
    waterSprite.width = worldW * cam.zoom;
    waterSprite.height = worldH * cam.zoom;
    waterSprite.tilePosition.set(time * 10, time * 6);
    if (waterSprite.filters) {
      (waterSprite.filters[0] as unknown as {
        resources: { timeUniforms: { uniforms: { uTime: number } } };
      }).resources.timeUniforms.uniforms.uTime = time;
    }
  }

  // screen shake on the camera container (matches the 2D translate)
  const shake = state.screenShake ?? 0;
  if (shake > 0.1) {
    world.x = (Math.random() - 0.5) * shake * 2;
    world.y = (Math.random() - 0.5) * shake * 2;
  } else {
    world.x = 0;
    world.y = 0;
  }

  app.render();

  // 2D overlay on the original canvas (transparent, input surface)
  ctx.clearRect(0, 0, cw, ch);
  drawGameOverlay(ctx, state, cw, ch, { includeWaterShimmer: false });
}
