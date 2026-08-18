import { TERRAIN_TILE_SIZE, WeatherType, Season } from '../gameTypes';
import { WEATHER_CONFIGS } from '../gameTypes';
import { isWaterTerrainType } from '../placementUtils';
import type { RenderSnapshot } from '../renderSnapshot';
import { renderTime } from './shared';

// ============ WEATHER PARTICLES (BATCHED) ============
interface WParticle { x: number; y: number; vx: number; vy: number; s: number; a: number }
let wParts: WParticle[] = [];
let lastWType: WeatherType | null = null;
let lastWeatherCw = 0;
let lastWeatherCh = 0;

export function resetWeatherCaches(): void {
  wParts = [];
  lastWType = null;
  lastWeatherCw = 0;
  lastWeatherCh = 0;
}

function updateWeatherParticles(w: WeatherType, cw: number, ch: number) {
  if (w === WeatherType.Clear) {
    wParts = [];
    lastWType = w;
    return;
  }
  if (w !== lastWType) {
    lastWType = w;
    wParts = [];
  }
  if (wParts.length === 0 || cw !== lastWeatherCw || ch !== lastWeatherCh) {
    wParts = [];
    const count = WEATHER_CONFIGS[w].particleCount;
    for (let i = 0; i < count; i++) {
      wParts.push({
        x: Math.random() * cw * 1.5 - cw * 0.25,
        y: Math.random() * ch * 1.5 - ch * 0.25,
        vx: w === WeatherType.Storm ? (Math.random() - 0.2) * 4 : (Math.random() - 0.5) * 1.2,
        vy: w === WeatherType.Snow ? 0.6 + Math.random() * 1.2 : 4 + Math.random() * 5,
        s: w === WeatherType.Snow ? 2 + Math.random() * 2.5 : 1.2 + Math.random() * 1.5,
        a: 0.45 + Math.random() * 0.45,
      });
    }
    lastWeatherCw = cw;
    lastWeatherCh = ch;
  }
  for (const p of wParts) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.y > ch * 1.3) {
      p.y = -10;
      p.x = Math.random() * cw * 1.5 - cw * 0.25;
    }
    if (p.x > cw * 1.3) p.x = -10;
    if (p.x < -cw * 0.3) p.x = cw * 1.3;
  }
}

function weatherOverlayStyle(color: string, alpha: number): string {
  if (!color) return `rgba(0, 0, 0, ${alpha})`;
  const hex = color.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Subtle animated shimmer on water tiles (rivers/lakes) — only close enough to read. */
export function drawWaterShimmer(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const map = state.worldMap;
  if (!map || state.camera.zoom < 0.75 || !state.juiceEffectsEnabled) return;
  const cam = state.camera;
  const ts = TERRAIN_TILE_SIZE;
  const z = cam.zoom;
  const tx0 = Math.max(0, Math.floor((cam.x - cw / (2 * z)) / ts));
  const tx1 = Math.min(map.width - 1, Math.floor((cam.x + cw / (2 * z)) / ts));
  const ty0 = Math.max(0, Math.floor((cam.y - ch / (2 * z)) / ts));
  const ty1 = Math.min(map.height - 1, Math.floor((cam.y + ch / (2 * z)) / ts));
  // Bounded cost: when zoomed out, sample a stride of tiles so the water keeps
  // its animated shimmer at any zoom without a full-map pass.
  const span = Math.max(tx1 - tx0, ty1 - ty0);
  if (span > 150) return;
  const stride = Math.ceil(span / 90);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let ty = ty0; ty <= ty1; ty += stride) {
    for (let tx = tx0; tx <= tx1; tx += stride) {
      const tile = map.tiles[ty]?.[tx];
      if (!tile || !isWaterTerrainType(tile.type)) continue;
      const sx = (tx * ts - cam.x) * z + cw / 2;
      const sy = (ty * ts - cam.y) * z + ch / 2;
      const sw = ts * z * stride;

      // Broad flowing wave bands — the water visibly moves (sine currents).
      const flow = renderTime * 0.16 + tx * 0.9 + ty * 1.35;
      for (let band = 0; band < 2; band++) {
        const bp = (flow + band * 0.5) % 1;
        const bandY = sy + sw * (0.12 + bp * 0.76);
        const waveH = Math.max(1, sw * (0.06 + 0.03 * Math.sin(renderTime * 1.3 + tx * 2.3 + ty * 1.7)));
        const bandAlpha = 0.05 + 0.03 * Math.sin(renderTime * 1.6 + tx * 1.3 + ty * 0.8);
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0.02, bandAlpha)})`;
        ctx.fillRect(sx - 2, bandY, sw + 4, waveH);
      }

      // Sparkle streaks (existing) — thin light lines sliding downstream.
      const phase = renderTime * 0.5 + (tx * 7 + ty * 13);
      const p1 = phase % 1;
      const p2 = (phase + 0.55) % 1;
      const alpha = 0.09 + Math.sin(renderTime * 2.1 + tx + ty * 0.7) * 0.04;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(sx + p1 * sw, sy + sw * 0.32, sw * 0.22, Math.max(1, sw * 0.045));
      ctx.fillRect(sx + p2 * sw, sy + sw * 0.66, sw * 0.16, Math.max(1, sw * 0.045));
    }
  }
  ctx.restore();
}

interface SeasonParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  sway: number;
}

let seasonParts: SeasonParticle[] = [];
let seasonPartsSeason: Season | null = null;

function newSeasonParticle(cw: number, ch: number, season: Season): SeasonParticle {
  const fall = season === Season.Fall;
  return {
    x: Math.random() * cw,
    y: Math.random() * ch,
    vx: (Math.random() - 0.25) * (fall ? 0.4 : 0.16),
    vy: fall ? 0.22 + Math.random() * 0.3 : 0.12 + Math.random() * 0.2,
    size: fall ? 1.6 + Math.random() * 2.2 : 1 + Math.random() * 1.2,
    sway: Math.random() * 10,
  };
}

/** Fall leaves + winter ambient snow-dust — season juice, independent of weather. */
export function drawSeasonParticles(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const active = state.season === Season.Fall
    || (state.season === Season.Winter && state.weather === WeatherType.Clear);
  if (!active) {
    seasonParts = [];
    seasonPartsSeason = null;
    return;
  }
  if (seasonPartsSeason !== state.season || seasonParts.length === 0) {
    const n = Math.min(110, Math.floor((cw * ch) / 9000));
    seasonParts = [];
    for (let i = 0; i < n; i++) seasonParts.push(newSeasonParticle(cw, ch, state.season));
    seasonPartsSeason = state.season;
  }
  if (!state.juiceEffectsEnabled) return;
  const fall = state.season === Season.Fall;
  for (const p of seasonParts) {
    p.y += p.vy;
    p.x += p.vx + Math.sin(renderTime * 1.4 + p.sway) * 0.35;
    if (p.y > ch + 8 || p.x < -8 || p.x > cw + 8) {
      p.y = -8 - Math.random() * 8;
      p.x = Math.random() * cw;
    }
  }
  ctx.save();
  if (fall) {
    ctx.fillStyle = '#e8a24c';
    for (const p of seasonParts) {
      ctx.globalAlpha = 0.45 + Math.sin(renderTime * 3 + p.sway) * 0.18;
      ctx.fillRect(p.x, p.y, p.size, p.size * 0.6);
    }
  } else {
    ctx.fillStyle = '#ffffff';
    for (const p of seasonParts) {
      ctx.globalAlpha = 0.22 + Math.sin(renderTime * 2 + p.sway) * 0.1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawWeather(ctx: CanvasRenderingContext2D, w: WeatherType, cw: number, ch: number) {
  updateWeatherParticles(w, cw, ch);
  const weatherCfg = WEATHER_CONFIGS[w];
  // Tint first, then particles (fog/drought are overlay-only; rain/snow/storm draw both)
  if (weatherCfg.overlayAlpha > 0) {
    ctx.fillStyle = weatherOverlayStyle(weatherCfg.color, weatherCfg.overlayAlpha);
    ctx.fillRect(0, 0, cw, ch);
  }
  if (wParts.length === 0) return;

  ctx.save();
  if (w === WeatherType.Snow) {
    ctx.fillStyle = weatherCfg.color || '#fff';
    for (const p of wParts) {
      ctx.globalAlpha = Math.min(1, p.a + 0.15);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s * 1.15, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (w === WeatherType.Rain || w === WeatherType.Storm) {
    // Longer streaks so rain is obvious at normal zoom
    ctx.strokeStyle = weatherCfg.color;
    ctx.lineWidth = w === WeatherType.Storm ? 1.75 : 1.45;
    ctx.lineCap = 'round';
    ctx.globalAlpha = w === WeatherType.Storm ? 0.78 : 0.68;
    ctx.beginPath();
    const len = w === WeatherType.Storm ? 3.5 : 2.9;
    for (const p of wParts) {
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.vx * len, p.y + p.vy * len);
    }
    ctx.stroke();
  }
  ctx.restore();

  if (w === WeatherType.Storm && Math.random() < 0.008) {
    ctx.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.35})`;
    ctx.fillRect(0, 0, cw, ch);
  }
}
