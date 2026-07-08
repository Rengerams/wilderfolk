import { FILTER_FREQ, STORAGE_KEYS, VOLUMES } from './constants';
import {
  levelsForPreset,
  loadVolumePreset,
  saveVolumePreset,
  type AudioLevels,
  type VolumePreset,
} from './preferences';

export type AudioBus = 'music' | 'sfx' | 'ambient';

function loadMutePreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.muted) === '1';
  } catch {
    return false;
  }
}

function saveMutePreference(muted: boolean) {
  try {
    localStorage.setItem(STORAGE_KEYS.muted, muted ? '1' : '0');
  } catch { /* ignore */ }
}

/** Shared Web Audio graph: master → music (filtered) | sfx | ambient */
class AudioGraph {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private muted = false;
  private volumePreset: VolumePreset = 'normal';
  private levels: AudioLevels = levelsForPreset('normal');
  private isNightMood = false;
  private visibilityHooked = false;

  ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0;
      this.masterGain.connect(this.ctx.destination);

      this.musicFilter = this.ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = FILTER_FREQ.musicDay;
      this.musicFilter.Q.value = 0.35;
      this.musicFilter.connect(this.masterGain);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = VOLUMES.music;
      this.musicGain.connect(this.musicFilter);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = VOLUMES.sfx;
      this.sfxGain.connect(this.masterGain);

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = VOLUMES.ambient;
      this.ambientGain.connect(this.masterGain);

      this.muted = loadMutePreference();
      this.volumePreset = loadVolumePreset();
      this.levels = levelsForPreset(this.volumePreset);
      this.applyBusVolumes();
      this.hookVisibilityResume();
    }
    return this.ctx;
  }

  get context(): AudioContext {
    return this.ensure();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get isUnlocked(): boolean {
    return this.ctx?.state === 'running';
  }

  getVolumePreset(): VolumePreset {
    this.ensure();
    return this.volumePreset;
  }

  setVolumePreset(preset: VolumePreset) {
    this.ensure();
    this.volumePreset = preset;
    this.levels = levelsForPreset(preset);
    saveVolumePreset(preset);
    this.applyBusVolumes();
  }

  bus(name: AudioBus): GainNode | null {
    this.ensure();
    if (name === 'music') return this.musicGain;
    if (name === 'sfx') return this.sfxGain;
    return this.ambientGain;
  }

  /** Call synchronously inside a click/key handler so resume() keeps user activation. */
  primeUnlock(): void {
    const ctx = this.ensure();
    if (ctx.state === 'suspended') {
      void ctx.resume().then(() => {
        if (ctx.state === 'running') this.applyBusVolumes();
      });
    } else if (ctx.state === 'running') {
      this.applyBusVolumes();
    }
  }

  async unlock(): Promise<boolean> {
    const ctx = this.ensure();
    try {
      if (ctx.state !== 'running') await ctx.resume();
    } catch {
      return false;
    }
    const ok = ctx.state === 'running';
    if (ok) this.applyBusVolumes();
    return ok;
  }

  setMusicBrightness(bright: boolean) {
    if (!this.musicFilter) return;
    const ctx = this.context;
    const target = bright ? FILTER_FREQ.musicIntro : FILTER_FREQ.musicDay;
    this.musicFilter.frequency.setTargetAtTime(target, ctx.currentTime, 0.6);
  }

  setGameMood(isNight: boolean) {
    this.isNightMood = isNight;
    if (!this.musicFilter) return;
    const ctx = this.context;
    const target = isNight ? FILTER_FREQ.musicNight : FILTER_FREQ.musicDay;
    this.musicFilter.frequency.setTargetAtTime(target, ctx.currentTime, 1.2);
    this.applyAmbientVolume();
  }

  duckMusic(durationSec = 0.28) {
    if (!this.musicGain || this.muted) return;
    const ctx = this.context;
    const t = ctx.currentTime;
    const g = this.musicGain.gain;
    const full = this.effectiveMusicGain();
    const ducked = full * VOLUMES.musicDuck;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(ducked, t, 0.03);
    g.setTargetAtTime(full, t + durationSec, 0.1);
  }

  private effectiveMasterGain(): number {
    return VOLUMES.master * this.levels.master;
  }

  private effectiveMusicGain(): number {
    return VOLUMES.music * this.levels.music;
  }

  private effectiveSfxGain(): number {
    return VOLUMES.sfx * this.levels.sfx;
  }

  private applyBusVolumes() {
    if (!this.masterGain || !this.musicGain || !this.sfxGain || !this.ambientGain) return;
    const ctx = this.context;
    const t = ctx.currentTime;

    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setTargetAtTime(
      this.muted ? 0 : this.effectiveMasterGain(),
      t,
      0.06,
    );

    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.setTargetAtTime(this.effectiveMusicGain(), t, 0.08);

    this.sfxGain.gain.cancelScheduledValues(t);
    this.sfxGain.gain.setTargetAtTime(this.effectiveSfxGain(), t, 0.08);

    this.applyAmbientVolume(t);
  }

  private applyAmbientVolume(atTime?: number) {
    if (!this.ambientGain) return;
    const ctx = this.context;
    const t = atTime ?? ctx.currentTime;
    const base = VOLUMES.ambient * this.levels.master;
    const ambientTarget = this.isNightMood ? base * 0.72 : base;
    this.ambientGain.gain.cancelScheduledValues(t);
    this.ambientGain.gain.setTargetAtTime(ambientTarget, t, 0.08);
  }

  private hookVisibilityResume() {
    if (this.visibilityHooked || typeof document === 'undefined') return;
    this.visibilityHooked = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.unlock();
    });
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    saveMutePreference(this.muted);
    this.applyBusVolumes();
    return this.muted;
  }

  setMute(muted: boolean) {
    this.muted = muted;
    saveMutePreference(muted);
    this.applyBusVolumes();
  }
}

export const audioGraph = new AudioGraph();