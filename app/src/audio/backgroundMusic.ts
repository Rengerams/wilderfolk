import { BASS_SCALE, MELODY_SCALE, PHRASE_GAP_MS } from './constants';
import { syncHtmlAudioMute } from './htmlAudioSync';
import { audioGraph } from './graph';
import { scheduleTone } from './scheduler';
import { musicPlayer } from './trackPlayer';
import { TRACKS, TRACK_VOLUMES } from './tracks';

type PhraseFn = () => void;
const PHRASE_DURATIONS_MS = [5200, 4800, 3600];

function playMelodicPhrase() {
  const melody = [MELODY_SCALE[0], MELODY_SCALE[2], MELODY_SCALE[4], MELODY_SCALE[2], MELODY_SCALE[1], MELODY_SCALE[3], MELODY_SCALE[2], MELODY_SCALE[0]];
  melody.forEach((note, i) => scheduleTone('music', note, 1.1, 0.06, 'sine', i * 0.55));
  [BASS_SCALE[0], BASS_SCALE[2], BASS_SCALE[1], BASS_SCALE[0]].forEach((note, i) => {
    scheduleTone('music', note, 1.8, 0.035, 'triangle', i * 1.1);
  });
}

function playVariationPhrase() {
  const melody = [MELODY_SCALE[2], MELODY_SCALE[4], MELODY_SCALE[5], MELODY_SCALE[4], MELODY_SCALE[3], MELODY_SCALE[1], MELODY_SCALE[0], null];
  melody.forEach((note, i) => { if (note) scheduleTone('music', note, 1.0, 0.055, 'sine', i * 0.5); });
}

function playRestPhrase() {
  scheduleTone('music', MELODY_SCALE[0], 2.2, 0.055, 'sine', 0);
}

const PHRASES: PhraseFn[] = [playMelodicPhrase, playVariationPhrase, playRestPhrase];

class BackgroundMusicPlayer {
  private running = false;
  private usingSamples = false;
  private usingHtmlAudio = false;
  private htmlAudio: HTMLAudioElement | null = null;
  private htmlTrackUrl: string | null = null;
  private isNight = false;
  private phraseIndex = 0;
  private timeout: ReturnType<typeof setTimeout> | null = null;

  get isRunning() {
    return this.running;
  }

  private currentTrack(): { url: string; vol: number } {
    return this.isNight
      ? { url: TRACKS.night, vol: TRACK_VOLUMES.night }
      : { url: TRACKS.day, vol: TRACK_VOLUMES.day };
  }

  private isAudible(): boolean {
    if (!this.running || audioGraph.isMuted) return false;
    if (this.usingHtmlAudio) {
      return this.htmlAudio != null && !this.htmlAudio.paused;
    }
    if (this.usingSamples) {
      return audioGraph.isUnlocked && musicPlayer.currentUrl != null;
    }
    return this.timeout != null && audioGraph.isUnlocked;
  }

  syncMute(muted: boolean) {
    syncHtmlAudioMute(this.htmlAudio, muted, this.running && this.usingHtmlAudio);
  }

  /** Start or recover gameplay music after unlock, unmute, or entering the map. */
  async ensurePlaying(): Promise<void> {
    if (this.isAudible()) return;
    if (this.running) this.stop();
    await this.start();
  }

  private ensureHtmlAudio(url: string): HTMLAudioElement {
    if (!this.htmlAudio || this.htmlTrackUrl !== url) {
      this.stopHtmlAudio();
      this.htmlAudio = new Audio(url);
      this.htmlAudio.loop = true;
      this.htmlAudio.preload = 'auto';
      this.htmlTrackUrl = url;
    }
    return this.htmlAudio;
  }

  private stopHtmlAudio() {
    if (!this.htmlAudio) return;
    this.htmlAudio.pause();
    this.htmlAudio.currentTime = 0;
    this.htmlAudio = null;
    this.htmlTrackUrl = null;
  }

  private async tryHtmlPlayback(url: string, volume: number): Promise<boolean> {
    if (audioGraph.isMuted) return false;
    const el = this.ensureHtmlAudio(url);
    el.volume = volume;
    try {
      await el.play();
      this.usingHtmlAudio = true;
      this.usingSamples = false;
      return true;
    } catch {
      return false;
    }
  }

  async start() {
    if (this.running) return;
    this.running = true;
    audioGraph.setMusicBrightness(false);

    const { url, vol } = this.currentTrack();

    if (await this.tryHtmlPlayback(url, vol)) {
      return;
    }

    const unlocked = await audioGraph.unlock();
    if (unlocked) {
      const ok = await musicPlayer.playLoop(url, 'music', vol, 1.4);
      if (ok) {
        this.usingSamples = true;
        this.usingHtmlAudio = false;
        return;
      }
    }

    this.usingSamples = false;
    this.usingHtmlAudio = false;
    this.phraseIndex = 0;
    this.scheduleProcedural();
  }

  stop() {
    this.running = false;
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.stopHtmlAudio();
    if (this.usingSamples) musicPlayer.stop(0.8);
    this.usingSamples = false;
    this.usingHtmlAudio = false;
  }

  async setNightMode(isNight: boolean) {
    if (this.isNight === isNight) return;
    this.isNight = isNight;
    if (!this.running) return;

    const { url, vol } = this.currentTrack();

    if (this.usingHtmlAudio) {
      const el = this.ensureHtmlAudio(url);
      el.volume = vol;
      if (this.htmlTrackUrl !== url) {
        this.htmlTrackUrl = url;
        el.src = url;
        el.load();
      }
      try {
        await el.play();
      } catch { /* ignore */ }
      return;
    }

    if (this.usingSamples) {
      await musicPlayer.crossfadeLoop(url, 'music', vol, 3);
    }
  }

  private scheduleProcedural() {
    if (!this.running || this.usingSamples || this.usingHtmlAudio) return;
    const current = this.phraseIndex % PHRASES.length;
    if (!audioGraph.isMuted && audioGraph.isUnlocked) PHRASES[current]();
    this.phraseIndex++;
    this.timeout = setTimeout(() => this.scheduleProcedural(), PHRASE_DURATIONS_MS[current] + PHRASE_GAP_MS);
  }
}

export const backgroundMusic = new BackgroundMusicPlayer();