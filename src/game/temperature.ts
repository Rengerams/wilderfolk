import { Season, WeatherType } from './gameTypes';

/** Midday baseline °C per season (gameplay calendar, not visuals). */
const SEASON_BASE_C: Record<Season, number> = {
  [Season.Spring]: 12,
  [Season.Summer]: 24,
  [Season.Fall]: 10,
  [Season.Winter]: -2,
};

/** Daily swing amplitude per season. */
const SEASON_SWING_C: Record<Season, number> = {
  [Season.Spring]: 6,
  [Season.Summer]: 5,
  [Season.Fall]: 7,
  [Season.Winter]: 8,
};

const WEATHER_OFFSET_C: Record<WeatherType, number> = {
  [WeatherType.Clear]: 0,
  [WeatherType.Rain]: -2,
  [WeatherType.Snow]: -7,
  [WeatherType.Storm]: -4,
  [WeatherType.Fog]: -3,
  [WeatherType.Drought]: 4,
};

export const SEASON_LABELS: Record<Season, string> = {
  [Season.Spring]: 'Spring',
  [Season.Summer]: 'Summer',
  [Season.Fall]: 'Fall',
  [Season.Winter]: 'Winter',
};

/** Deterministic daily temperature from calendar + weather (stable within a day). */
export function computeDailyTemperatureC(
  season: Season,
  weather: WeatherType,
  dayInYear: number,
  year: number,
): number {
  const seed = year * 360 + dayInYear;
  const noise = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  const unit = noise - Math.floor(noise);
  const centered = unit * 2 - 1;
  const raw = SEASON_BASE_C[season] + centered * SEASON_SWING_C[season] + WEATHER_OFFSET_C[weather];
  return Math.round(raw);
}

export function formatTemperatureC(celsius: number): string {
  if (celsius < 0) return `−${Math.abs(celsius)}°C`;
  return `${celsius}°C`;
}

export function seasonTextClass(season: Season): string {
  switch (season) {
    case Season.Spring: return 'text-emerald-400';
    case Season.Summer: return 'text-amber-300';
    case Season.Fall: return 'text-orange-400';
    case Season.Winter: return 'text-sky-300 font-semibold';
    default: return 'text-stone-300';
  }
}