/** Shared audio session flags — avoids circular imports between director and players. */
let gameplayAudioActive = false;
/** False once the player leaves the intro screen — blocks gesture-driven intro restarts. */
let introAudioAllowed = true;

export function setGameplayAudioActive(active: boolean): void {
  gameplayAudioActive = active;
}

export function isGameplayAudioActive(): boolean {
  return gameplayAudioActive;
}

export function setIntroAudioAllowed(allowed: boolean): void {
  introAudioAllowed = allowed;
}

export function isIntroAudioAllowed(): boolean {
  return introAudioAllowed;
}