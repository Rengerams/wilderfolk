import { ambientNature } from './ambient';
import { backgroundMusic } from './backgroundMusic';
import { audioGraph } from './graph';
import { introMusic } from './introMusic';
import type { VolumePreset } from './preferences';
import { preloadAllSamples } from './sampleLoader';

/** Orchestrates intro, gameplay music, ambient layers, and mute state. */
class SoundDirector {
  private gameplayActive = false;

  async unlock(): Promise<boolean> {
    return audioGraph.unlock();
  }

  async beginIntroAudio(): Promise<void> {
    await this.ensureIntroAudio();
  }

  /** Unlock the audio context and start or resume intro music (safe to call repeatedly). */
  async ensureIntroAudio(): Promise<void> {
    if (audioGraph.isMuted) return;
    introMusic.tryAutoplay();
    await this.unlock();
    await preloadAllSamples();
    if (introMusic.isRunning) {
      introMusic.restartPadIfNeeded();
    } else {
      await introMusic.start();
    }
  }

  async beginGameplayAudio(): Promise<void> {
    introMusic.stop();
    audioGraph.primeUnlock();
    await this.unlock();
    await preloadAllSamples();
    this.gameplayActive = true;
    await backgroundMusic.ensurePlaying();
    await ambientNature.ensurePlaying();
  }

  startGameplay() {
    void this.beginGameplayAudio();
  }

  stopAll() {
    this.gameplayActive = false;
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
    if (introMusic.isRunning) {
      introMusic.restartPadIfNeeded();
    } else if (this.gameplayActive) {
      void backgroundMusic.ensurePlaying();
      void ambientNature.ensurePlaying();
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