/** Wilderfolk audio entry — UI-facing audio controls and effects. */

import { soundDirector } from './director';
import { audioGraph } from './graph';
import type { VolumePreset } from './preferences';

export { soundDirector } from './director';

export {
  playBuildSound,
  playBirthSound,
  playMarriageSound,
  playUpgradeSound,
  playClickSound,
  playDisasterSound,
  playResearchCompleteSound,
} from './sfx';

export async function unlockAudio(): Promise<boolean> {
  return soundDirector.unlock();
}

/** Synchronous — call from click handlers before any await so Web Audio can start. */
export function primeAudioUnlock(): void {
  audioGraph.primeUnlock();
}

export async function beginIntroAudio(): Promise<void> {
  return soundDirector.beginIntroAudio();
}

export async function ensureIntroAudio(): Promise<void> {
  return soundDirector.ensureIntroAudio();
}

export async function beginAudio(): Promise<void> {
  return soundDirector.beginGameplayAudio();
}

export function stopIntroSong(): void {
  soundDirector.dismissIntroAudio();
}

export function stopAllAudio(): void {
  soundDirector.stopAll();
}

export function toggleMute(): boolean {
  return soundDirector.toggleMute();
}

export function getMuteState(): boolean {
  return soundDirector.getMuteState();
}

export type { VolumePreset } from './preferences';

export function getVolumePreset() {
  return soundDirector.getVolumePreset();
}

export function setVolumePreset(preset: VolumePreset) {
  soundDirector.setVolumePreset(preset);
}

export function setGameMood(isNight: boolean): void {
  soundDirector.setGameMood(isNight);
}
