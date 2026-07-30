import { STORAGE_KEYS } from './constants';

export type VolumePreset = 'soft' | 'normal' | 'loud';

export interface AudioLevels {
  master: number;
  music: number;
  sfx: number;
}

export const VOLUME_PRESETS: Record<VolumePreset, AudioLevels> = {
  soft: { master: 0.72, music: 0.82, sfx: 0.78 },
  normal: { master: 1.0, music: 1.0, sfx: 1.0 },
  loud: { master: 1.28, music: 1.12, sfx: 1.18 },
};

const DEFAULT_PRESET: VolumePreset = 'normal';

export function loadVolumePreset(): VolumePreset {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.volumePreset);
    if (raw === 'soft' || raw === 'normal' || raw === 'loud') return raw;
  } catch { /* ignore */ }
  return DEFAULT_PRESET;
}

export function saveVolumePreset(preset: VolumePreset): void {
  try {
    localStorage.setItem(STORAGE_KEYS.volumePreset, preset);
  } catch { /* ignore */ }
}

export function levelsForPreset(preset: VolumePreset): AudioLevels {
  return { ...VOLUME_PRESETS[preset] };
}