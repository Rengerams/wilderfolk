/** Central audio tuning — adjust volumes and timing here. */

export const STORAGE_KEYS = {
  muted: 'wilderfolk-muted',
  volumePreset: 'wilderfolk-volume',
} as const;

export const VOLUMES = {
  master: 0.4,
  music: 0.58,
  sfx: 0.72,
  ambient: 0.38,
  /** Brief ducking when SFX fires — keep music audible */
  musicDuck: 0.82,
} as const;

export const FILTER_FREQ = {
  musicDay: 1600,
  musicNight: 1500,
  musicIntro: 2800,
} as const;

export const NOTES = {
  C3: 130.81, D3: 146.83, E3: 164.81, G3: 196.0, A3: 220.0,
  C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0, A4: 440.0,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, C6: 1046.5,
} as const;

export const MELODY_SCALE = [NOTES.C4, NOTES.D4, NOTES.E4, NOTES.G4, NOTES.A4, NOTES.C5] as const;
export const BASS_SCALE = [NOTES.C3, NOTES.E3, NOTES.G3, NOTES.C4] as const;

export const PHRASE_GAP_MS = 2800;