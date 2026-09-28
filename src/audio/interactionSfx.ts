import { audioGraph } from './graph';
import { TRACKS, TRACK_VOLUMES } from './tracks';
import { sfxPlayer } from './trackPlayer';
import {
  playHuntSound,
  playMarriageSound,
  playDeathSound,
  playErrorSound,
} from './sfx';

async function playSampleOr(
  url: string,
  volume: number,
  fallback: () => void,
  rate = 1,
) {
  if (audioGraph.isMuted) return;
  const ok = await sfxPlayer.playOneShot(url, 'sfx', volume, rate);
  if (!ok) fallback();
}

/** Settler caught prey. */
export function playHumanHuntSfx() {
  void playSampleOr(TRACKS.beastVoiceAlt, TRACK_VOLUMES.beastVoice, playHuntSound, 1.05);
}

/** Wolf or fox made a kill. */
export function playPredatorHuntSfx() {
  void playSampleOr(TRACKS.growl, TRACK_VOLUMES.growl, playHuntSound, 0.9);
}

/** Moon Howler snack run or howl moment. */
export function playMoonHowlerSfx() {
  void playSampleOr(TRACKS.wolfHowl, TRACK_VOLUMES.wolfHowl, playHuntSound, 0.95);
}

/** Animal successfully tamed / befriended. */
export function playTameSfx() {
  void playSampleOr(TRACKS.beastVoice, TRACK_VOLUMES.beastVoice * 0.9, playMarriageSound, 1.1);
}

/** Human became a Moon Howler. */
export function playTransformSfx() {
  void playSampleOr(TRACKS.growlAlt, TRACK_VOLUMES.growl, playHuntSound, 0.85);
}

/** Settler died (keeps procedural fallback). */
export function playSettlerDeathSfx() {
  playDeathSound();
}

/** Failed tame / not enough food (UI feedback). */
export function playFailSfx() {
  playErrorSound();
}