/** Shared audio session flags — avoids circular imports between director and players. */
/** False once the player leaves the intro screen — blocks gesture-driven intro restarts. */
let introAudioAllowed = true;

export function setIntroAudioAllowed(allowed: boolean): void {
  introAudioAllowed = allowed;
}

export function isIntroAudioAllowed(): boolean {
  return introAudioAllowed;
}
