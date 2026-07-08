/**
 * Wilderfolk audio system — modular procedural audio via Web Audio API.
 *
 * Modules:
 *   graph.ts           — shared context & buses (music / sfx / ambient)
 *   introMusic.ts      — intro screen theme
 *   backgroundMusic.ts — gameplay melody loop
 *   ambient.ts         — nature ambience
 *   sfx.ts             — one-shot game sounds
 *   director.ts        — public orchestration API
 */

import { ambientNature } from './ambient';
import { backgroundMusic } from './backgroundMusic';
import { soundDirector } from './director';
import { audioGraph } from './graph';
import { introMusic } from './introMusic';
import type { VolumePreset } from './preferences';

export { soundDirector } from './director';
export { TRACKS, TRACK_VOLUMES } from './tracks';
export { playFailSfx } from './interactionSfx';
export { VOLUMES, NOTES } from './constants';

export {
  playBuildSound,
  playBirthSound,
  playHuntSound,
  playDeathSound,
  playMarriageSound,
  playUpgradeSound,
  playErrorSound,
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

export function startIntroSong(): void {
  if (!soundDirector.getMuteState()) introMusic.start();
}

export function stopIntroSong(): void {
  introMusic.stop();
}

export function isIntroMusicPlaying(): boolean {
  return introMusic.isRunning;
}

export function startMusic(): void {
  soundDirector.startGameplay();
}

export function stopMusic(): void {
  backgroundMusic.stop();
  ambientNature.stop();
}

export function stopAllAudio(): void {
  soundDirector.stopAll();
}

export function toggleMute(): boolean {
  return soundDirector.toggleMute();
}

export function setMute(muted: boolean): void {
  soundDirector.setMute(muted);
}

export function getMuteState(): boolean {
  return soundDirector.getMuteState();
}

export type { VolumePreset } from './preferences';
export { VOLUME_PRESETS } from './preferences';

export function getVolumePreset() {
  return soundDirector.getVolumePreset();
}

export function setVolumePreset(preset: VolumePreset) {
  soundDirector.setVolumePreset(preset);
}

export function setGameMood(isNight: boolean): void {
  soundDirector.setGameMood(isNight);
}

export function initAudio(): void {
  soundDirector.initAudio();
}