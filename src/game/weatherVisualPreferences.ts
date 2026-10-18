/** Client-only preferences: weather remains active in the simulation. */
export type WeatherVisual = 'rain' | 'snow';
const KEY = 'wilderfolk-weather-visuals';
type Prefs = Record<WeatherVisual, boolean>;
const defaults: Prefs = { rain: true, snow: true };
function load(): Prefs {
  try {
    if (typeof localStorage === 'undefined') return { ...defaults };
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      rain: saved?.rain !== false,
      snow: saved?.snow !== false,
    };
  } catch { return { ...defaults }; }
}
let prefs = load();
export function weatherVisualEnabled(kind: WeatherVisual): boolean { return prefs[kind]; }
export function setWeatherVisualEnabled(kind: WeatherVisual, enabled: boolean): void {
  prefs = { ...prefs, [kind]: enabled };
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
}
