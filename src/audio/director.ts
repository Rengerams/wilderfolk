import { ambientNature } from './ambient';
import { backgroundMusic } from './backgroundMusic';
import { audioGraph } from './graph';
import { introMusic } from './introMusic';
import type { VolumePreset } from './preferences';
import { preloadAllSamples } from './sampleLoader';
import {
  isIntroAudioAllowed,
  setGameplayAudioActive,
  setIntroAudioAllowed,
} from './session';

/** Orchestrates intro, gameplay music, ambient layers, and mute state. */
class SoundDirector {
  private gameplayActive = false;

  isGameplayActive(): boolean {
    return this.gameplayActive;
  }

  async unlock(): Promise<boolean> {
    return audioGraph.unlock();
  }

  async beginIntroAudio(): Promise<void> {
    setIntroAudioAllowed(true);
    await this.ensureIntroAudio();
  }

  /** Unlock the audio context and start or resume intro music (safe to call repeatedly). */
  async ensureIntroAudio(): Promise<void> {
    if (audioGraph.isMuted || this.gameplayActive || !isIntroAudioAllowed()) return;
    introMusic.tryAutoplay();
    await this.unlock();
    if (this.gameplayActive || !isIntroAudioAllowed()) return;
    await preloadAllSamples();
    if (this.gameplayActive || !isIntroAudioAllowed()) return;
    if (introMusic.isRunning) {
      introMusic.restartPadIfNeeded();
    } else {
      await introMusic.start();
    }
  }

  /** Leave the intro screen — stop the theme and block gesture restarts until intro returns. */
  dismissIntroAudio(): void {
    setIntroAudioAllowed(false);
    introMusic.stop();
  }

  async beginGameplayAudio(): Promise<void> {
    this.gameplayActive = true;
    setGameplayAudioActive(true);
    setIntroAudioAllowed(false);
    introMusic.stop();
    audioGraph.primeUnlock();
    await this.unlock();
    await preloadAllSamples();
    await backgroundMusic.ensurePlaying();
    await ambientNature.ensurePlaying();
  }

  startGameplay() {
    void this.beginGameplayAudio();
  }

  stopAll() {
    this.gameplayActive = false;
    setGameplayAudioActive(false);
    setIntroAudioAllowed(true);
    introMusic.stop();
    backgroundMusic.stop();
    ambientNature.stop();
  }

  setGameMood(isNight: boolean) {
    audioGraph.setGameMood(isNight);
    ambientNature.setNightMode(isNight);
    void backgroundMusic.setNightMode(isNight);
  }

  private resumeAfterUnmute(): void {
    if (this.gameplayActive) {
      void backgroundMusic.ensurePlaying();
      void ambientNature.ensurePlaying();
      return;
    }
    if (isIntroAudioAllowed() && introMusic.isRunning) {
      introMusic.restartPadIfNeeded();
    }
  }

  toggleMute(): boolean {
    const muted = audioGraph.toggleMute();
    introMusic.syncMute(muted);
    backgroundMusic.syncMute(muted);
    if (!muted) this.resumeAfterUnmute();
    return muted;
  }

  setMute(muted: boolean) {
    audioGraph.setMute(muted);
    introMusic.syncMute(muted);
    backgroundMusic.syncMute(muted);
    if (!muted) this.resumeAfterUnmute();
  }

  getMuteState(): boolean {
    return audioGraph.isMuted;
  }

  getVolumePreset(): VolumePreset {
    return audioGraph.getVolumePreset();
  }

  setVolumePreset(preset: VolumePreset) {
    audioGraph.setVolumePreset(preset);
  }

  initAudio() {
    audioGraph.ensure();
    void preloadAllSamples();
  }
}

export const soundDirector = new SoundDirector();