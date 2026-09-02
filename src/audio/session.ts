/** Shared audio session flags — avoids circular imports between director and players. */
let gameplayAudioActive = false;

export function setGameplayAudioActive(active: boolean): void {
  gameplayAudioActive = active;
}

function isGameplayAudioActive(): boolean {
  return gameplayAudioActive;
}