import { describe, expect, it } from 'vitest';
import { ALL_TRACK_URLS, TRACKS } from '../src/audio/tracks';
import { SPOTLIGHT_MUSIC_URL } from '../src/audio/spotlightMusic';
import {
  SPOTLIGHT_APPLAUSE_START, SPOTLIGHT_CAMERA_FOCUS_MS, SPOTLIGHT_INTRO_MS,
  SPOTLIGHT_LIGHT_CUE_MS, SPOTLIGHT_MUSIC_CUE_MS, SPOTLIGHT_MUSIC_FADE_MS,
  SPOTLIGHT_REVEAL_START_MS, spotlightOpeningFrame, spotlightFrameAt,
} from '../src/components/spotlightChoreography';

describe('Spotlight opening and instrumental timing', () => {
  it('keeps a full-screen black interval while the camera relocates', () => {
    expect(spotlightOpeningFrame(0).blackoutOpacity).toBe(1);
    expect(spotlightOpeningFrame(SPOTLIGHT_CAMERA_FOCUS_MS).cameraShouldFocus).toBe(true);
    expect(spotlightOpeningFrame(SPOTLIGHT_CAMERA_FOCUS_MS).blackoutOpacity).toBe(1);
    expect(spotlightOpeningFrame(SPOTLIGHT_LIGHT_CUE_MS).spotlightVisible).toBe(true);
    expect(spotlightOpeningFrame(SPOTLIGHT_LIGHT_CUE_MS).musicShouldStart).toBe(false);
    expect(spotlightOpeningFrame(SPOTLIGHT_MUSIC_CUE_MS).musicShouldStart).toBe(true);
    expect(spotlightOpeningFrame(SPOTLIGHT_REVEAL_START_MS).blackoutOpacity).toBe(1);
    expect(spotlightOpeningFrame(SPOTLIGHT_INTRO_MS).blackoutOpacity).toBe(0);
    expect(spotlightFrameAt(SPOTLIGHT_INTRO_MS - 1).kind).toBe('intro');
    expect(spotlightFrameAt(SPOTLIGHT_INTRO_MS).kind).toBe('caption');
  });

  it('streams the full soundtrack only during this event, fading before the applause', () => {
    expect(SPOTLIGHT_MUSIC_URL).toBe(TRACKS.spotlightLore);
    expect(SPOTLIGHT_MUSIC_URL.endsWith('/audio/music/spotlight-lore.ogg')).toBe(true);
    expect(ALL_TRACK_URLS).not.toContain(TRACKS.spotlightLore);
    expect(SPOTLIGHT_MUSIC_FADE_MS).toBeGreaterThan(0);
    expect(SPOTLIGHT_APPLAUSE_START - SPOTLIGHT_MUSIC_FADE_MS).toBeGreaterThan(SPOTLIGHT_MUSIC_CUE_MS);
    expect(spotlightFrameAt(SPOTLIGHT_APPLAUSE_START - 1).kind).toBe('caption');
    expect(spotlightFrameAt(SPOTLIGHT_APPLAUSE_START).kind).toBe('applause');
  });
});
