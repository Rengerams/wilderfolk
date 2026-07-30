/** Licensed royalty-free tracks — see TECHNICAL.md#audio-credits */

function audioUrl(path: string): string {
  const base = import.meta.env.BASE_URL;
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}${path}`;
}

export const TRACKS = {
  intro: audioUrl('audio/music/intro-frontier.mp3'),
  /**
   * Single continuous gameplay bed — calm frontier loop (no day/night swaps).
   * Uses the softer night asset as the all-day village theme.
   */
  gameplay: audioUrl('audio/music/night-calm.ogg'),
  /** @deprecated Prefer TRACKS.gameplay — kept so old references resolve. */
  day: audioUrl('audio/music/night-calm.ogg'),
  /** @deprecated Prefer TRACKS.gameplay */
  night: audioUrl('audio/music/night-calm.ogg'),
  birdsLoop: audioUrl('audio/ambient/birds-loop.ogg'),
  birdChirp: audioUrl('audio/ambient/bird-chirp.mp3'),
  cricketFrog: audioUrl('audio/ambient/cricket-frog-night.mp3'),
  wolfHowl: audioUrl('audio/ambient/wolf-howl.mp3'),
  growl: audioUrl('audio/ambient/animals/growl.wav'),
  growlAlt: audioUrl('audio/ambient/animals/growl-1.wav'),
  beastVoice: audioUrl('audio/ambient/animals/voice.wav'),
  beastVoiceAlt: audioUrl('audio/ambient/animals/voice-1.wav'),
} as const;

export type TrackId = keyof typeof TRACKS;

export const TRACK_VOLUMES = {
  intro: 0.46,
  /** Soft enough to sit under ambience + SFX without fatigue. */
  gameplay: 0.40,
  day: 0.40,
  night: 0.40,
  birdsLoop: 0.14,
  birdChirp: 0.22,
  cricketFrog: 0.16,
  wolfHowl: 0.28,
  growl: 0.2,
  beastVoice: 0.18,
} as const;

export const ALL_TRACK_URLS = Object.values(TRACKS);