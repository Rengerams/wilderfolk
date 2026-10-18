/** Client-side global switch for visual weather only; simulation weather is unaffected. */
const KEY = 'wilderfolk-weather-visuals';
function load(): boolean {
  try {
    if (typeof localStorage === 'undefined') return true;
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'true');
    if (typeof saved === 'boolean') return saved;
    // Migrate the older per-weather settings to one global setting.
    if (saved && typeof saved === 'object') {
      const legacy = saved as { rain?: boolean; snow?: boolean };
      return legacy.rain !== false && legacy.snow !== false;
    }
  } catch { /* Missing or inaccessible browser storage. */ }
  return true;
}
let enabled = load();
export function weatherVisualEnabled(): boolean { return enabled; }
export function setWeatherVisualEnabled(value: boolean): void {
  enabled = value;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(enabled));
  } catch { /* Browser storage is optional. */ }
}
