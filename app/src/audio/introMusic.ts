import { syncHtmlAudioMute } from './htmlAudioSync';
import { audioGraph } from './graph';
import { musicPlayer } from './trackPlayer';
import { TRACKS, TRACK_VOLUMES } from './tracks';
import { scheduleTone } from './scheduler';

/** Intro screen music — HTML autoplay first, Web Audio fallback. */
class IntroMusicPlayer {
  private running = false;
  private usingSamples = false;
  private usingHtmlAudio = false;
  private htmlAudio: HTMLAudioElement | null = null;
  private fallbackTimeout: ReturnType<typeof setTimeout> | null = null;
  private fallbackSection = 0;

  get isRunning() {
    return this.running;
  }

  /** Synchronous autoplay attempt — call before any await on page load. */
  tryAutoplay(): void {
    if (this.running || audioGraph.isMuted) return;
    const el = this.ensureHtmlAudio();
    const playPromise = el.play();
    if (!playPromise) return;
    void playPromise
      .then(() => {
        this.running = true;
        this.usingSamples = true;
        this.usingHtmlAudio = true;
        audioGraph.setMusicBrightness(true);
      })
      .catch(() => {
        /* blocked until user gesture — ensureIntroAudio will retry */
      });
  }

  syncMute(muted: boolean) {
    syncHtmlAudioMute(this.htmlAudio, muted, this.running && this.usingHtmlAudio);
  }

  async start() {
    if (this.running || audioGraph.isMuted) return;

    if (!this.usingHtmlAudio) {
      this.tryAutoplay();
      if (this.running) return;
    } else if (this.htmlAudio?.paused) {
      try {
        await this.htmlAudio.play();
        return;
      } catch {
        /* fall through to Web Audio */
      }
    }

    const unlocked = await audioGraph.unlock();
    if (!unlocked) return;

    this.stopHtmlAudio();
    this.running = true;
    audioGraph.setMusicBrightness(true);

    const ok = await musicPlayer.playLoop(TRACKS.intro, 'music', TRACK_VOLUMES.intro, 1.8);
    if (ok) {
      this.usingSamples = true;
      this.usingHtmlAudio = false;
      return;
    }

    this.usingSamples = false;
    this.usingHtmlAudio = false;
    this.startProceduralFallback();
  }

  stop() {
    this.running = false;
    if (this.fallbackTimeout) {
      clearTimeout(this.fallbackTimeout);
      this.fallbackTimeout = null;
    }
    this.stopHtmlAudio();
    if (this.usingSamples && !this.usingHtmlAudio) {
      musicPlayer.stop(0.8);
    }
    audioGraph.setMusicBrightness(false);
    this.usingSamples = false;
    this.usingHtmlAudio = false;
  }

  stopPadOnly() {
    /* legacy — sample-based intro has no separate pad */
  }

  restartPadIfNeeded() {
    if (!this.running || audioGraph.isMuted) return;
    if (this.usingHtmlAudio) {
      this.tryAutoplay();
      return;
    }
    if (!this.usingSamples) {
      this.startProceduralFallback();
    } else {
      void musicPlayer.playLoop(TRACKS.intro, 'music', TRACK_VOLUMES.intro, 0.6);
    }
  }

  private ensureHtmlAudio(): HTMLAudioElement {
    if (!this.htmlAudio) {
      this.htmlAudio = new Audio(TRACKS.intro);
      this.htmlAudio.loop = true;
      this.htmlAudio.preload = 'auto';
      this.applyHtmlVolume();
    }
    return this.htmlAudio;
  }

  private applyHtmlVolume() {
    if (!this.htmlAudio) return;
    this.htmlAudio.volume = TRACK_VOLUMES.intro;
  }

  private stopHtmlAudio() {
    if (!this.htmlAudio) return;
    this.htmlAudio.pause();
    this.htmlAudio.currentTime = 0;
  }

  private startProceduralFallback() {
    this.playProceduralFanfare();
    this.fallbackTimeout = setTimeout(() => {
      this.fallbackSection = 1;
      this.scheduleProceduralLoop();
    }, 9800);
  }

  private scheduleProceduralLoop() {
    if (!this.running) return;
    if (this.fallbackSection % 2 === 0) this.playProceduralFanfare();
    else this.playProceduralLift();
    this.fallbackTimeout = setTimeout(() => {
      this.fallbackSection++;
      this.scheduleProceduralLoop();
    }, this.fallbackSection % 2 === 0 ? 9800 : 8200);
  }

  private playProceduralFanfare() {
    const NOTES = { C3: 130.81, G3: 196, C4: 261.63, E4: 329.63, G4: 392, A4: 440, C5: 523.25, E5: 659.25, G5: 783.99 };
    [0, 0.85, 1.7].forEach((d) => {
      scheduleTone('music', NOTES.C3, 0.55, 0.14, 'triangle', d);
      scheduleTone('music', NOTES.G3, 0.35, 0.06, 'sine', d + 0.02);
    });
    [NOTES.G3, NOTES.C4, NOTES.E4, NOTES.G4, NOTES.C5].forEach((n, i) => {
      scheduleTone('music', n, 0.75, 0.13, 'triangle', 2.1 + i * 0.28);
    });
  }

  private playProceduralLift() {
    const NOTES = { C4: 261.63, D4: 293.66, E4: 329.63, G4: 392, A4: 440, C5: 523.25 };
    [NOTES.E4, NOTES.G4, NOTES.A4, NOTES.C5, NOTES.A4, NOTES.G4].forEach((n, i) => {
      scheduleTone('music', n, 0.9, 0.09, 'sine', 0.2 + i * 0.45);
    });
  }
}

export const introMusic = new IntroMusicPlayer();