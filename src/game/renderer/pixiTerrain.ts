import { Application, Assets, Container, Graphics, type Texture } from 'pixi.js';
import type { RenderSnapshot } from '../renderSnapshot';
import { TERRAIN_TILE_SIZE, TerrainType, type TerrainTile } from '../gameTypes';
import { worldToScreen } from '../viewState';

type PixiTerrainState = {
  app: Application;
  root: Container;
  base: Graphics;
  transitions: Graphics;
  water: Graphics;
  flow: Graphics;
  accents: Graphics;
  snow: Graphics;
  riverPoints: Array<{ x: number; y: number }>;
  snowflakes: Array<{ x: number; y: number; speed: number; size: number; phase: number }>;
  approvedTextures: Partial<Record<TerrainType, Texture>>;
  key: string;
  width: number;
  height: number;
  ready: boolean;
};

let terrainState: PixiTerrainState | null = null;
let initPromise: Promise<void> | null = null;

const APPROVED_TEXTURE_PATHS: Partial<Record<TerrainType, string>> = {
  [TerrainType.Grassland]: '/sprites/terrain/grass_fill.png',
  [TerrainType.Forest]: '/sprites/terrain/forest.png',
  [TerrainType.DarkForest]: '/sprites/terrain/forest.png',
  [TerrainType.Beach]: '/sprites/terrain/sand_fill.png',
  [TerrainType.RiverBank]: '/sprites/terrain/sand_fill.png',
  [TerrainType.ShallowWater]: '/sprites/terrain/water_shallow_fill.png',
  [TerrainType.River]: '/sprites/terrain/water_deep_fill.png', // <-- Rich, deep blue!
  [TerrainType.DeepWater]: '/sprites/terrain/water_deep_fill.png',
  [TerrainType.Hills]: '/sprites/terrain/dirt_fill.png',
  [TerrainType.Rocky]: '/sprites/terrain/dirt.png',
  [TerrainType.Mountains]: '/sprites/terrain/mountain.jpg',
  [TerrainType.Snow]: '/sprites/terrain/snow.png',
};

const ISOMETRIC_TEXTURE_TYPES = new Set<TerrainType>([
  TerrainType.Hills,
  TerrainType.Rocky,
  TerrainType.Mountains,
  TerrainType.Snow,
]);

const COLORS: Record<TerrainType, number> = {
  [TerrainType.DeepWater]: 0x163e68,
  [TerrainType.ShallowWater]: 0x2e78a5,
  [TerrainType.River]: 0x3e9bc4,
  [TerrainType.RiverBank]: 0xc7b273,
  [TerrainType.Beach]: 0xe0c98b,
  [TerrainType.Grassland]: 0x78a85d,
  [TerrainType.Forest]: 0x4f824d,
  // Legacy DarkForest/Hills/Rocky values are normalized to the active Forest/Mountain biomes.
  [TerrainType.DarkForest]: 0x4f824d,
  [TerrainType.Hills]: 0x706b67,
  [TerrainType.Mountains]: 0x706b67,
  [TerrainType.Rocky]: 0x706b67,
  [TerrainType.Snow]: 0xdbe8ed,
};

const FAMILY: Record<TerrainType, string> = {
  [TerrainType.DeepWater]: 'water',
  [TerrainType.ShallowWater]: 'water',
  [TerrainType.River]: 'water',
  // RiverBank and Beach are the active Sand biome around water.
  [TerrainType.RiverBank]: 'sand',
  [TerrainType.Beach]: 'sand',
  [TerrainType.Grassland]: 'grass',
  [TerrainType.Forest]: 'forest',
  [TerrainType.DarkForest]: 'forest',
  [TerrainType.Hills]: 'mountain',
  [TerrainType.Mountains]: 'mountain',
  [TerrainType.Rocky]: 'mountain',
  [TerrainType.Snow]: 'snow',
};

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function tint(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  return (clampByte(r + (target - r) * t) << 16)
    | (clampByte(g + (target - g) * t) << 8)
    | clampByte(b + (target - b) * t);
}

function hash01(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function tileAt(state: RenderSnapshot, tx: number, ty: number): TerrainTile | null {
  return state.worldMap?.tiles[ty]?.[tx] ?? null;
}

function createPixiState(): PixiTerrainState {
  const app = new Application();
  const root = new Container();
  root.label = 'wilderfolk-terrain';
  const base = new Graphics({ label: 'biome-bases' });
  const transitions = new Graphics({ label: 'soft-biome-transitions' });
  const water = new Graphics({ label: 'river-and-water-details' });
  const flow = new Graphics({ label: 'animated-river-flow' });
  const accents = new Graphics({ label: 'terrain-accents' });
  const snow = new Graphics({ label: 'winter-snowfall' });
  root.addChild(base, transitions, water, flow, accents, snow);
  terrainState = { app, root, base, transitions, water, flow, accents, snow, riverPoints: [], snowflakes: [], approvedTextures: {}, key: '', width: 0, height: 0, ready: false };
  return terrainState;
}

function ensurePixiReady(width: number, height: number): void {
  if (terrainState || initPromise) return;
  const current = terrainState ?? createPixiState();
  initPromise = current.app.init({
    width,
    height,
    backgroundAlpha: 0,
    antialias: true,
    autoStart: false,
    preference: 'webgl',
    resolution: 1,
  }).then(async () => {
    const loaded = await Promise.all(Object.entries(APPROVED_TEXTURE_PATHS).map(async ([type, path]) => {
      if (!path) return null;
      try {
        return [type, await Assets.load(path)] as const;
      } catch {
        return null;
      }
    }));
    for (const entry of loaded) {
      if (entry) current.approvedTextures[entry[0] as TerrainType] = entry[1];
    }
    current.ready = true;
  }).catch(() => {
    terrainState = null;
  }).finally(() => {
    initPromise = null;
  });
}

function drawSoftTransition(g: Graphics, x: number, y: number, w: number, h: number, color: number, alpha: number): void {
  const band = Math.max(1.5, Math.min(5, Math.min(w, h) * 0.22));
  g.rect(x, y, w, band).fill({ color, alpha: alpha * 0.55 });
  g.rect(x, y + h - band, w, band).fill({ color, alpha: alpha * 0.55 });
  g.rect(x, y, band, h).fill({ color, alpha: alpha * 0.55 });
  g.rect(x + w - band, y, band, h).fill({ color, alpha: alpha * 0.55 });
}

function rebuildTerrain(state: RenderSnapshot, cw: number, ch: number): void {
  const current = terrainState;
  const map = state.worldMap;
  if (!current || !map) return;
  const seed = map.seed ?? 1;
  const key = `${seed}:${map.preset}:${map.width}:${map.height}:${state.season ?? 'spring'}:procedural`;

  if (current.key === key && current.width === cw && current.height === ch) return;

  current.base.clear();
  current.transitions.clear();
  current.water.clear();
  current.flow.clear();
  current.accents.clear();
  current.snow.clear();
  current.key = key;
  current.width = cw;
  current.height = ch;

  const tileW = map.width;
  const tileH = map.height;
  const size = TERRAIN_TILE_SIZE;

  current.base.rect(0, 0, tileW * size, tileH * size).fill(0x294936);

  for (let ty = 0; ty < tileH; ty++) {
    for (let tx = 0; tx < tileW; tx++) {
      const tile = tileAt(state, tx, ty);
      if (!tile) continue;
      const x = tx * size;
      const y = ty * size;
      const variation = (hash01(tx, ty, seed) - 0.5) * 0.12;
      const color = tint(COLORS[tile.type], variation);
      const texture = current.approvedTextures[tile.type];
      if (texture) {
        const textureTint = tile.type === TerrainType.Forest || tile.type === TerrainType.DarkForest
          ? 0x285a32
          : 0xffffff;
        if (ISOMETRIC_TEXTURE_TYPES.has(tile.type)) {
          // rock.png and snow.png are 2:1 diamond tiles; preserve their aspect ratio.
          current.base.rect(x, y, size + 0.35, size + 0.35).fill(color);
          current.base.texture(texture, textureTint, x, y + size * 0.25, size + 0.35, size * 0.5);
        } else {
          current.base.texture(texture, textureTint, x, y, size + 0.35, size + 0.35);
        }
      } else {
        current.base.rect(x, y, size + 0.35, size + 0.35).fill(color);
      }

      const north = tileAt(state, tx, ty - 1);
      const east = tileAt(state, tx + 1, ty);
      const south = tileAt(state, tx, ty + 1);
      const west = tileAt(state, tx - 1, ty);
      const neighbours = [north, east, south, west];
      for (const neighbour of neighbours) {
        if (neighbour && FAMILY[neighbour.type] !== FAMILY[tile.type]) {
          drawSoftTransition(current.transitions, x, y, size, size, COLORS[neighbour.type], 0.42);
          break;
        }
      }

      if (tile.type === TerrainType.Hills || tile.type === TerrainType.Rocky || tile.type === TerrainType.Mountains) {
        const ridge = Math.max(0.12, Math.min(0.35, tile.elevation / 330));
        current.accents.ellipse(x + size * 0.5, y + size * 0.44, size * 0.42, size * 0.22).fill({ color: 0xffffff, alpha: ridge });
        current.accents.ellipse(x + size * 0.56, y + size * 0.76, size * 0.38, size * 0.12).fill({ color: 0x263126, alpha: ridge * 0.55 });
      } else if (tile.type === TerrainType.Grassland || tile.type === TerrainType.Forest || tile.type === TerrainType.DarkForest) {
        const blades = hash01(tx + 10, ty - 7, seed);
        if (blades > 0.58) {
          current.accents.moveTo(x + size * 0.28, y + size * 0.72)
            .lineTo(x + size * 0.42, y + size * (0.48 + blades * 0.12))
            .lineTo(x + size * 0.55, y + size * 0.72)
            .stroke({ color: tint(COLORS[tile.type], -0.34), alpha: 0.36, width: 0.8, cap: 'round' });
        }
      }
    }
  }

  const rows = new Map<number, number[]>();
  for (let ty = 0; ty < tileH; ty++) {
    for (let tx = 0; tx < tileW; tx++) {
      const tile = tileAt(state, tx, ty);
      if (tile?.type !== TerrainType.River) continue;
      const row = rows.get(ty) ?? [];
      row.push(tx);
      rows.set(ty, row);
    }
  }
  const riverPoints = [...rows.entries()].sort(([a], [b]) => a - b).map(([ty, xs]) => ({
    x: (xs.reduce((sum, value) => sum + value, 0) / xs.length + 0.5) * size,
    y: (ty + 0.5) * size,
  }));
  current.riverPoints = riverPoints;
  if (riverPoints.length > 1) {
    const drawRiver = (color: number, alpha: number, width: number): void => {
      const river = current.water;
      river.moveTo(riverPoints[0]!.x, riverPoints[0]!.y);
      for (let i = 1; i < riverPoints.length; i++) {
        const previous = riverPoints[i - 1]!;
        const point = riverPoints[i]!;
        const midY = (previous.y + point.y) * 0.5;
        river.quadraticCurveTo(previous.x, midY, point.x, point.y);
      }
      river.stroke({ color, alpha, width, cap: 'round', join: 'round' });
    };
    drawRiver(0x174a6d, 0.62, size * 2.9);
    drawRiver(0x47b7dc, 0.92, size * 1.9);
    drawRiver(0xb6eff4, 0.5, Math.max(0.8, size * 0.24));

    for (let i = 1; i < riverPoints.length - 1; i += 3) {
      const point = riverPoints[i]!;
      current.water.ellipse(point.x + (hash01(i, 2, seed) - 0.5) * size, point.y, size * 0.65, 0.55)
        .fill({ color: 0xd9fbff, alpha: 0.52 });
    }
  }

  for (const [ty, xs] of rows) {
    const centerX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
    const y = (ty + 0.5) * size;
    current.water.ellipse((centerX + 0.5) * size, y - size * 1.25, size * 1.8, size * 0.18)
      .fill({ color: 0xf0d89a, alpha: 0.16 });
  }

  current.snowflakes = [];
  const winter = state.season === 'winter';
  if (winter) {
    const count = Math.min(260, Math.max(90, Math.floor((tileW * tileH) / 55)));
    for (let i = 0; i < count; i++) {
      current.snowflakes.push({
        x: hash01(i, 17, seed) * tileW * size,
        y: hash01(i, 31, seed + 3) * tileH * size,
        speed: 4 + hash01(i, 47, seed + 7) * 10,
        size: 0.45 + hash01(i, 61, seed + 11) * 1.35,
        phase: hash01(i, 79, seed + 13) * Math.PI * 2,
      });
    }
  }
}

function animateSeasonalEffects(current: PixiTerrainState, state: RenderSnapshot, timeSeconds: number): void {
  const zoom = Math.max(1, state.camera.zoom);
  const intensity = Math.max(0.32, 1 / zoom);
  current.flow.clear();
  const points = current.riverPoints;
  if (points.length > 1) {
    const stride = zoom >= 1.75 ? 4 : zoom >= 1.25 ? 3 : 2;
    for (let i = 0; i < points.length - 1; i += stride) {
      const from = points[i]!;
      const to = points[i + 1]!;
      const phase = (timeSeconds * 20 + i * 3.7) % 24;
      const t = phase / 24;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      current.flow.ellipse(x, y, 2.2, 0.5).fill({ color: 0xe4fbff, alpha: 0.7 * intensity });
      current.flow.ellipse(x - 4, y + 1.2, 1.1, 0.35).fill({ color: 0xb8eff9, alpha: 0.42 * intensity });
    }
  }

  current.snow.clear();
  if (state.season !== 'winter') return;
  const mapHeight = state.worldMap ? state.worldMap.height * TERRAIN_TILE_SIZE : 0;
  for (const flake of current.snowflakes) {
    const y = (flake.y + timeSeconds * flake.speed) % Math.max(1, mapHeight);
    const x = flake.x + Math.sin(timeSeconds * 0.8 + flake.phase) * 3.5;
    current.snow.circle(x, y, flake.size / zoom).fill({ color: 0xf7fdff, alpha: 0.72 * intensity });
  }
}

export function renderPixiTerrain(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number): boolean {
  if (typeof window === 'undefined' || !state.worldMap) return false;
  ensurePixiReady(cw, ch);
  const current = terrainState;
  if (!current?.ready) return false;

  rebuildTerrain(state, cw, ch);
  animateSeasonalEffects(current, state, performance.now() * 0.001);
  const [offsetX, offsetY] = worldToScreen(0, 0, state.camera, cw, ch);
  current.root.position.set(offsetX, offsetY);
  current.root.scale.set(state.camera.zoom);
  current.app.renderer.resize(cw, ch);
  current.app.render();
  ctx.drawImage(current.app.canvas, 0, 0, cw, ch);
  return true;
}

export function resetPixiTerrain(): void {
  const current = terrainState;
  terrainState = null;
  initPromise = null;
  if (current) current.app.destroy({ removeView: true, releaseGlobalResources: false }, { children: true });
}
