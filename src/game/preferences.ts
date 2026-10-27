const AUTOSAVE_KEY = 'wilderfolk-autosave';
const TUTORIALS_ENABLED_KEY = 'wilderfolk-tutorials-enabled';
const JUICE_EFFECTS_KEY = 'wilderfolk-juice-effects';
const FIRST_NIGHT_WARNING_KEY = 'wilderfolk-first-night-warning-dismissed';
const SHOW_SIM_TICK_KEY = 'wilderfolk-show-sim-tick';
const SHOW_FPS_KEY = 'wilderfolk-show-fps';
const HUD_NOTIFICATIONS_KEY = 'wilderfolk-hud-notifications';
const VALLEY_STAGE_WARNINGS_KEY = 'wilderfolk-valley-stage-warnings';
const TUTORIAL_CHOICE_KEY = 'wilderfolk-tutorial-choice';
const INTRO_SEEN_KEY = 'wilderfolk-intro-seen';

let cachedJuiceEffects: boolean | null = null;

/** Safely resolves the storage API across browser, private browsing, and headless runtimes. */
function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function readBoolPreference(key: string, defaultValue: boolean): boolean {
  try {
    const storage = getStorage();
    if (!storage) return defaultValue;
    const raw = storage.getItem(key);
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
    if (raw == null) return defaultValue;
  } catch {
    return defaultValue;
  }
  return defaultValue;
}

function writeBoolPreference(key: string, enabled: boolean): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    storage.setItem(key, enabled ? '1' : '0');
  } catch {
    /* ignore storage quotas / private mode errors */
  }
}

export function loadAutoSavePreference(): boolean {
  return readBoolPreference(AUTOSAVE_KEY, true);
}

export function saveAutoSavePreference(enabled: boolean): void {
  writeBoolPreference(AUTOSAVE_KEY, enabled);
}

export function loadTutorialsEnabled(): boolean {
  return readBoolPreference(TUTORIALS_ENABLED_KEY, true);
}

export function saveTutorialsEnabled(enabled: boolean): void {
  writeBoolPreference(TUTORIALS_ENABLED_KEY, enabled);
}

/** Per-new-game choice: play the first-spring guide or start free. */
export function loadTutorialChoice(): boolean {
  return readBoolPreference(TUTORIAL_CHOICE_KEY, true);
}

export function saveTutorialChoice(enabled: boolean): void {
  writeBoolPreference(TUTORIAL_CHOICE_KEY, enabled);
}

export function loadJuiceEffectsEnabled(): boolean {
  if (cachedJuiceEffects !== null) return cachedJuiceEffects;
  cachedJuiceEffects = readBoolPreference(JUICE_EFFECTS_KEY, true);
  return cachedJuiceEffects;
}

export function saveJuiceEffectsEnabled(enabled: boolean): void {
  cachedJuiceEffects = enabled;
  writeBoolPreference(JUICE_EFFECTS_KEY, enabled);
}

export function loadFirstNightWarningDismissed(): boolean {
  return readBoolPreference(FIRST_NIGHT_WARNING_KEY, false);
}

export function saveFirstNightWarningDismissed(dismissed: boolean): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    if (dismissed) {
      storage.setItem(FIRST_NIGHT_WARNING_KEY, '1');
    } else {
      storage.removeItem(FIRST_NIGHT_WARNING_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function loadShowSimTick(): boolean {
  return readBoolPreference(SHOW_SIM_TICK_KEY, false);
}

export function saveShowSimTick(enabled: boolean): void {
  writeBoolPreference(SHOW_SIM_TICK_KEY, enabled);
}

export function loadShowFps(): boolean {
  return readBoolPreference(SHOW_FPS_KEY, false);
}

export function loadHudNotificationsEnabled(): boolean {
  return readBoolPreference(HUD_NOTIFICATIONS_KEY, true);
}

export function saveHudNotificationsEnabled(enabled: boolean): void {
  writeBoolPreference(HUD_NOTIFICATIONS_KEY, enabled);
}

/** Valley stage warnings: notification + big news when the ladder moves. Default on. */
export function loadValleyStageWarnings(): boolean {
  return readBoolPreference(VALLEY_STAGE_WARNINGS_KEY, true);
}

export function saveValleyStageWarnings(enabled: boolean): void {
  writeBoolPreference(VALLEY_STAGE_WARNINGS_KEY, enabled);
}

export function saveShowFps(enabled: boolean): void {
  writeBoolPreference(SHOW_FPS_KEY, enabled);
}

/** Resets in-memory preference caches (primarily for unit tests and session resets). */
export function resetPreferencesCache(): void {
  cachedJuiceEffects = null;
}

/**
 * Whether this browser has already watched the opening cinematic.
 *
 * The intro is a 23.6-second timed reveal, so gating every load on it made a returning player wait
 * that long to reach "Load saved game". This is the flag that lets the game skip straight to the
 * map-setup screen instead; the cinematic stays reachable from the menu.
 */
export function loadIntroSeen(): boolean {
  return readBoolPreference(INTRO_SEEN_KEY, false);
}

export function saveIntroSeen(seen: boolean): void {
  writeBoolPreference(INTRO_SEEN_KEY, seen);
}