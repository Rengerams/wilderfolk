/**
 * Weather effects — Teraforge's `weather.ts` registry, ported.
 *
 * Teraforge models weather as **plugins**: `registerWeather({ id, label, icon, create })`, where each
 * effect owns `tint(frame)`, `update(dt, frame)` and `draw(g, frame)` and paints in **screen space**
 * against a camera-aware `WeatherFrame`. This module is that architecture, with Wilderfolk's rules
 * applied to it — three deviations, each deliberate:
 *
 * 1. **Randomness comes from the seeded presentation stream.** Teraforge draws from `Math.random`;
 *    `src/` may not (the `raw Math.random guard` in `tests/simRng.test.ts` scans every source file), so
 *    every random here goes through `getPresentationRng('weatherFx')` — the stream the previous
 *    particle code already used, which keeps weather deterministic per seed and out of the simulation's
 *    streams (`docs/SIM_RNG_GUIDELINES.md`).
 * 2. **`WEATHER_CONFIGS` stays the owner of the numbers.** Colour, overlay alpha and particle count per
 *    state are read from `gameTypes.WEATHER_CONFIGS`; Teraforge's hard-coded tints and counts would be
 *    a second source of truth for the same thing (`AGENTS.md` §5.2).
 * 3. **Two states differ from Teraforge's list.** Teraforge registers `clouds`; Wilderfolk has no such
 *    `WeatherType`, so its puff layer is *composed* into the states that have clouds rather than
 *    registered as an unreachable plugin. Teraforge has no `drought`; Wilderfolk does, so one is
 *    authored in the same idiom.
 *
 * Teraforge's `daylightTint` is ported, and only its **daylight temperature cast** is applied here:
 * Wilderfolk's day/night *cycle* lighting is a deliberately disabled overlay (`renderer/overlay.ts`),
 * and this module does not re-enable it.
 *
 * The weather **state** is the simulation's (`worldEvents.updateWeather`); this module only paints it.
 */
import { PATH_CELL, WeatherType, Season } from '../gameTypes';
import { WEATHER_CONFIGS } from '../gameTypes';
import { isWaterTerrainType } from '../terrain/terrainTraits';
import { tileTypeAt } from '../terrain/terrainGrid';
import type { RenderSnapshot } from '../renderSnapshot';
import { renderTime } from './shared';
import { getPresentationRng } from '../simRng';

/* ========================= TERAFORGE'S REGISTRY CONTRACT ========================= */

/** One frame of camera state, handed to every effect (Teraforge's `WeatherFrame`). */
export interface WeatherFrame {
  width: number;
  height: number;
  zoom: number;
  camX: number;
  camY: number;
  /** Render-clock seconds — the same clock {@link renderTime} exposes. */
  time: number;
  /** Seconds since the previous frame, clamped, so a stalled tab cannot teleport particles. */
  dt: number;
}

/** A full-screen tint an effect asks the caller to lay down before it draws (Teraforge's shape). */
export interface WeatherTint {
  color: string;
  alpha: number;
  op: GlobalCompositeOperation;
}

/** What one weather state does, created once when that state becomes active. */
export interface WeatherEffect {
  tint?: (f: WeatherFrame) => WeatherTint | null;
  update?: (dt: number, f: WeatherFrame) => void;
  draw?: (g: CanvasRenderingContext2D, f: WeatherFrame) => void;
}

export interface WeatherPlugin {
  id: WeatherType;
  label: string;
  icon: string;
  create: () => WeatherEffect;
}

/** Every weather state's effect. One entry per `WeatherType` — see `tests/weatherConsequences.test.ts`. */
export const weatherRegistry = new Map<WeatherType, WeatherPlugin>();

export function registerWeather(plugin: WeatherPlugin): void {
  weatherRegistry.set(plugin.id, plugin);
}

export function listWeather(): WeatherPlugin[] {
  return [...weatherRegistry.values()];
}

/**
 * Seeded presentation randomness, in Teraforge's `rnd(a, b)` shape. Teraforge calls `Math.random`
 * here; the stream is Wilderfolk's contract and the guard test enforces it.
 */
function rnd(a: number, b: number): number {
  return a + getPresentationRng('weatherFx')() * (b - a);
}

/** Camera parallax factor for the cloud layer — Teraforge's `f.camX * 0.06`. */
const CLOUD_PARALLAX = 0.06;
/** Camera parallax factor for the fog bands — Teraforge's `f.camY * 0.04`. */
const FOG_PARALLAX = 0.04;
/** A frame longer than this (a backgrounded tab, a long GC) advances no further than this. */
const MAX_FRAME_DT = 0.1;

/* ========================= SHARED LAYERS ========================= */

interface CloudPuff { x: number; y: number; r: number; sp: number; a: number }

/**
 * Teraforge's cloud puffs: soft dark blobs drifting with the camera, drawn with `multiply` so they
 * read as cloud shadow rather than as grey discs. It is a *layer* here, not a plugin, because
 * Wilderfolk has no `Clouds` weather state to select it.
 */
function makeCloudLayer(count: number, color: string, alpha: number): {
  update: (dt: number, f: WeatherFrame) => void;
  draw: (g: CanvasRenderingContext2D, f: WeatherFrame) => void;
} {
  const puffs: CloudPuff[] = Array.from({ length: count }, () => ({
    x: rnd(-500, 2400),
    y: rnd(-200, 1400),
    r: rnd(130, 360),
    sp: rnd(6, 18),
    a: rnd(0.05, 0.14),
  }));
  return {
    update(dt, f) {
      for (const p of puffs) {
        p.x += p.sp * dt;
        if (p.x - p.r > f.width + 600) p.x = -600 - p.r;
      }
    },
    draw(g, f) {
      g.save();
      g.globalCompositeOperation = 'multiply';
      for (const p of puffs) {
        const x = p.x - f.camX * CLOUD_PARALLAX;
        const y = p.y - f.camY * CLOUD_PARALLAX;
        const grad = g.createRadialGradient(x, y, 0, x, y, p.r);
        grad.addColorStop(0, weatherOverlayStyle(color, Math.min(1, p.a * alpha * 2)));
        grad.addColorStop(1, weatherOverlayStyle(color, 0));
        g.fillStyle = grad;
        g.fillRect(x - p.r, y - p.r, p.r * 2, p.r * 2);
      }
      g.restore();
    },
  };
}

/* ========================= PLUGINS ========================= */

registerWeather({
  id: WeatherType.Clear,
  label: WEATHER_CONFIGS[WeatherType.Clear].label,
  icon: WEATHER_CONFIGS[WeatherType.Clear].emoji,
  create: () => ({}),
});

interface Drop { x: number; y: number; l: number; s: number }
interface Ripple { x: number; y: number; t: number }

/** Rain and storm share one effect, as they do in Teraforge (`makeRain(storm)`). */
function makeRain(storm: boolean): WeatherEffect {
  const id = storm ? WeatherType.Storm : WeatherType.Rain;
  const cfg = WEATHER_CONFIGS[id];
  let drops: Drop[] = [];
  let ripples: Ripple[] = [];
  let flash = 0;
  let nextFlash = rnd(3, 9);
  const clouds = makeCloudLayer(storm ? 16 : 10, '#414e64', storm ? 1.2 : 0.8);
  // Wilderfolk's own particle budget per state (Teraforge's 480/900 are its own tuning).
  const target = (): number => cfg.particleCount;
  const wind = storm ? 0.55 : 0.2;

  return {
    // Wilderfolk's veil colours were tuned as flat overlays (`overlayAlpha` 0.08–0.12), so this keeps
    // `source-over`; Teraforge's `multiply` at the same alpha is all but invisible on its darker art.
    tint: () => (cfg.overlayAlpha > 0
      ? { color: cfg.color, alpha: cfg.overlayAlpha, op: 'source-over' }
      : null),
    update(dt, f) {
      clouds.update(dt, f);
      const want = target();
      while (drops.length < want) drops.push({ x: rnd(0, f.width), y: rnd(0, f.height), l: rnd(10, 24), s: rnd(900, 1500) });
      if (drops.length > want) drops = drops.slice(0, want);
      for (const d of drops) {
        d.y += d.s * dt;
        d.x += d.s * dt * wind;
        if (d.y > f.height) {
          d.y = -20;
          d.x = rnd(-200, f.width + 200);
          // Rain ground ripples (Teraforge) — expanding rings where drops land.
          if (ripples.length < 60) ripples.push({ x: d.x, y: rnd(0, f.height), t: 0 });
        }
        if (d.x > f.width + 50) d.x = -50;
      }
      ripples = ripples.filter((r) => (r.t += dt) < 1);
      if (storm) {
        nextFlash -= dt;
        if (nextFlash <= 0) {
          flash = 0.85;
          nextFlash = rnd(4, 12);
        }
        flash = Math.max(0, flash - dt * 3);
      }
    },
    draw(g, f) {
      clouds.draw(g, f);
      g.save();
      g.strokeStyle = cfg.color;
      g.lineWidth = storm ? 1.75 : 1.45;
      g.lineCap = 'round';
      g.globalAlpha = storm ? 0.78 : 0.68;
      const len = storm ? 3.5 : 2.9;
      g.beginPath();
      for (const d of drops) {
        // The streak is the trail behind the drop, leaning with the wind (Teraforge's shape).
        g.moveTo(d.x, d.y);
        g.lineTo(d.x - d.l * len * wind, d.y - d.l * len);
      }
      g.stroke();
      g.restore();
      if (ripples.length > 0) {
        g.save();
        g.strokeStyle = 'rgba(220,240,255,0.22)';
        g.lineWidth = 1;
        for (const r of ripples) {
          g.beginPath();
          g.arc(r.x, r.y, r.t * 22, 0, Math.PI * 2);
          g.stroke();
        }
        g.restore();
      }
      if (storm && flash > 0.01) {
        g.fillStyle = `rgba(226,238,255,${(flash * 0.45).toFixed(3)})`;
        g.fillRect(0, 0, f.width, f.height);
      }
    },
  };
}

registerWeather({
  id: WeatherType.Rain,
  label: WEATHER_CONFIGS[WeatherType.Rain].label,
  icon: WEATHER_CONFIGS[WeatherType.Rain].emoji,
  create: () => makeRain(false),
});

registerWeather({
  id: WeatherType.Storm,
  label: WEATHER_CONFIGS[WeatherType.Storm].label,
  icon: WEATHER_CONFIGS[WeatherType.Storm].emoji,
  create: () => makeRain(true),
});

interface Flake { x: number; y: number; r: number; s: number; p: number }

/** Snow: Teraforge's flakes plus the accumulating ground cover Wilderfolk already drew. */
function makeSnow(): WeatherEffect {
  const cfg = WEATHER_CONFIGS[WeatherType.Snow];
  let flakes: Flake[] = [];
  let cover = 0;
  let t = 0;
  return {
    // Snow *brightens* (Teraforge's `screen`), unlike the veil states.
    tint: () => (cfg.overlayAlpha > 0 ? { color: cfg.color, alpha: cfg.overlayAlpha, op: 'screen' } : null),
    update(dt, f) {
      t += dt;
      const want = cfg.particleCount;
      while (flakes.length < want) flakes.push({ x: rnd(0, f.width), y: rnd(0, f.height), r: rnd(1, 3.2), s: rnd(25, 65), p: rnd(0, Math.PI * 2) });
      if (flakes.length > want) flakes = flakes.slice(0, want);
      for (const k of flakes) {
        k.y += k.s * dt;
        k.x += Math.sin(t * 0.8 + k.p) * 12 * dt;
        if (k.y > f.height + 5) {
          k.y = -5;
          k.x = rnd(0, f.width);
        }
      }
    },
    draw(g, f) {
      // Snow accumulates on the ground while it snows and melts once it stops (Teraforge).
      cover = Math.min(0.5, cover + 0.002 * (f.dt / 0.016));
      if (cover > 0.01) {
        g.fillStyle = `rgba(235, 243, 250, ${(cover * 0.42).toFixed(3)})`;
        g.fillRect(0, 0, f.width, f.height);
      }
      g.save();
      g.fillStyle = cfg.color || '#fff';
      for (const k of flakes) {
        g.globalAlpha = 0.75;
        g.beginPath();
        g.arc(k.x, k.y, k.r, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    },
  };
}

registerWeather({
  id: WeatherType.Snow,
  label: WEATHER_CONFIGS[WeatherType.Snow].label,
  icon: WEATHER_CONFIGS[WeatherType.Snow].emoji,
  create: () => makeSnow(),
});

interface FogBand { y: number; sp: number; x: number; h: number }

/** Fog: horizontal mist bands drifting across the viewport (Teraforge), plus Wilderfolk's density veil. */
function makeFog(): WeatherEffect {
  const cfg = WEATHER_CONFIGS[WeatherType.Fog];
  const bands: FogBand[] = Array.from({ length: 7 }, (_, i) => ({
    y: i * 140 + rnd(-40, 40),
    sp: rnd(7, 22),
    x: rnd(-800, 800),
    h: rnd(130, 280),
  }));
  return {
    // The table has always declared 0.28 for fog; until now the bands returned before it was laid down.
    tint: () => (cfg.overlayAlpha > 0 ? { color: cfg.color, alpha: cfg.overlayAlpha, op: 'source-over' } : null),
    update(dt) {
      for (const b of bands) b.x += b.sp * dt;
    },
    draw(g, f) {
      g.save();
      for (const b of bands) {
        const x = ((b.x % (f.width + 900)) + f.width + 900) % (f.width + 900) - 450;
        const y = (b.y - f.camY * FOG_PARALLAX) % (f.height + 200);
        const grad = g.createLinearGradient(0, y, 0, y + b.h);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.5, 'rgba(248,250,252,0.22)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(x - 500, y, 1400, b.h);
      }
      g.restore();
    },
  };
}

registerWeather({
  id: WeatherType.Fog,
  label: WEATHER_CONFIGS[WeatherType.Fog].label,
  icon: WEATHER_CONFIGS[WeatherType.Fog].emoji,
  create: () => makeFog(),
});

/**
 * Drought — **not** a Teraforge state; authored in its idiom: a warm dust haze drifting over dry
 * ground, plus the table's own brown veil.
 */
function makeDrought(): WeatherEffect {
  const cfg = WEATHER_CONFIGS[WeatherType.Drought];
  const dust = makeCloudLayer(8, '#b98a54', 0.9);
  return {
    tint: () => (cfg.overlayAlpha > 0 ? { color: cfg.color, alpha: cfg.overlayAlpha, op: 'source-over' } : null),
    update: (dt, f) => dust.update(dt, f),
    draw: (g, f) => dust.draw(g, f),
  };
}

registerWeather({
  id: WeatherType.Drought,
  label: WEATHER_CONFIGS[WeatherType.Drought].label,
  icon: WEATHER_CONFIGS[WeatherType.Drought].emoji,
  create: () => makeDrought(),
});

/* ========================= DAYLIGHT (Teraforge) ========================= */

/**
 * Teraforge's hour-based daylight tint, ported verbatim.
 *
 * **Only the daylight branch is applied by this module** (see {@link drawWeather}): the dusk and night
 * terms belong to Wilderfolk's day/night cycle, whose lighting overlay is disabled on purpose
 * (`renderer/overlay.ts`), and re-enabling it is an owner decision, not a side effect of a weather port.
 */
export function daylightTint(hour: number, tempShift = 0): WeatherTint | null {
  const h = hour;
  if (h >= 8 && h <= 16) {
    if (tempShift > 0.1) return { color: '#ffe8a0', alpha: tempShift * 0.25, op: 'multiply' }; // summer heat haze
    if (tempShift < -0.1) return { color: '#d0e8f8', alpha: Math.abs(tempShift) * 0.2, op: 'multiply' }; // winter cold
    return null;
  }
  if (h < 5 || h >= 21) return { color: '#0d1b3a', alpha: 0.55, op: 'multiply' };
  if (h < 7) return { color: '#3a3f6b', alpha: 0.36, op: 'multiply' };
  if (h < 8) return { color: '#ffc98a', alpha: 0.16, op: 'multiply' };
  if (h < 19) return null;
  if (h < 20) return { color: '#ff9c5b', alpha: 0.22, op: 'multiply' };
  return { color: '#26325c', alpha: 0.40, op: 'multiply' };
}

/**
 * The temperature cast a weather state contributes to {@link daylightTint}. Wilderfolk's simulation
 * carries no temperature anomaly, so this is the presentation mapping: a drought reads as heat, snow as
 * cold, everything else as neutral.
 */
function weatherTemperatureShift(w: WeatherType): number {
  if (w === WeatherType.Drought) return 1;
  if (w === WeatherType.Snow) return -1;
  return 0;
}

/* ========================= FRAME + ENTRY POINT ========================= */

let activeWeather: WeatherType | null = null;
let activeEffect: WeatherEffect | null = null;
let lastRenderTime = renderTime;

export function resetWeatherCaches(): void {
  activeWeather = null;
  activeEffect = null;
  lastRenderTime = renderTime;
}

/** Build one frame from the snapshot. The camera is what gives the cloud and fog layers their parallax. */
function weatherFrame(state: RenderSnapshot, cw: number, ch: number): WeatherFrame {
  const cam = state.camera;
  const dt = Math.min(MAX_FRAME_DT, Math.max(0, renderTime - lastRenderTime));
  lastRenderTime = renderTime;
  return {
    width: cw,
    height: ch,
    zoom: cam.zoom,
    camX: cam.x,
    camY: cam.y,
    time: renderTime,
    dt,
  };
}

function effectFor(w: WeatherType): WeatherEffect {
  if (activeWeather !== w || !activeEffect) {
    activeEffect = weatherRegistry.get(w)?.create() ?? {};
    activeWeather = w;
  }
  return activeEffect;
}

function weatherOverlayStyle(color: string, alpha: number): string {
  if (!color) return `rgba(0, 0, 0, ${alpha})`;
  const hex = color.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Lay down one tint, honouring the blend mode the effect asked for. */
function applyTint(ctx: CanvasRenderingContext2D, tint: WeatherTint, cw: number, ch: number): void {
  ctx.save();
  ctx.globalCompositeOperation = tint.op;
  ctx.fillStyle = weatherOverlayStyle(tint.color, tint.alpha);
  ctx.fillRect(0, 0, cw, ch);
  ctx.restore();
}

/**
 * Paint the current weather. Called from the per-frame overlay pass, after the entities and before the
 * water shimmer — the effect is created when the state changes and kept until it changes again.
 */
export function drawWeather(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number): void {
  const frame = weatherFrame(state, cw, ch);
  const effect = effectFor(state.weather);
  const tint = effect.tint?.(frame) ?? null;
  if (tint) applyTint(ctx, tint, cw, ch);
  effect.update?.(frame.dt, frame);
  effect.draw?.(ctx, frame);

  // Teraforge's daylight temperature cast — the day/night cycle's own dimming stays disabled.
  const hour = state.hourOfDay ?? 0;
  if (hour >= 8 && hour <= 16) {
    const daylight = daylightTint(hour, weatherTemperatureShift(state.weather));
    if (daylight) applyTint(ctx, daylight, cw, ch);
  }
}

/* ========================= SEASON + WATER (unchanged) ========================= */

/** Subtle animated shimmer on water tiles (rivers/lakes) — only close enough to read. */
export function drawWaterShimmer(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const map = state.worldMap;
  if (!map || state.camera.zoom < 0.75 || !state.juiceEffectsEnabled) return;
  const cam = state.camera;
  const ts = PATH_CELL;
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
      const type = tileTypeAt(map, tx, ty);
      if (type === null || !isWaterTerrainType(type)) continue;
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
    x: getPresentationRng('weatherFx')() * cw,
    y: getPresentationRng('weatherFx')() * ch,
    vx: (getPresentationRng('weatherFx')() - 0.25) * (fall ? 0.4 : 0.16),
    vy: fall ? 0.22 + getPresentationRng('weatherFx')() * 0.3 : 0.12 + getPresentationRng('weatherFx')() * 0.2,
    size: fall ? 1.6 + getPresentationRng('weatherFx')() * 2.2 : 1 + getPresentationRng('weatherFx')() * 1.2,
    sway: getPresentationRng('weatherFx')() * 10,
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
      p.y = -8 - getPresentationRng('weatherFx')() * 8;
      p.x = getPresentationRng('weatherFx')() * cw;
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
