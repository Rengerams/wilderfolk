import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SPOTLIGHT_APPLAUSE_CLIP_MS, SPOTLIGHT_APPLAUSE_AUDIO_URL } from '../src/audio/spotlightApplause';
import {
  SPOTLIGHT_APPLAUSE_MS, SPOTLIGHT_APPLAUSE_START, SPOTLIGHT_TOTAL_MS,
  spotlightFrameAt,
} from '../src/components/spotlightChoreography';

describe('Spotlight crowd applause — provided real audio on the SFX bus', () => {
  it('uses the uploaded real cheering MP3 from the public asset folder', () => {
    expect(SPOTLIGHT_APPLAUSE_AUDIO_URL.endsWith('/audio/music/freesound_community-crowd-cheering-6229.mp3')).toBe(true);
    const bytes = readFileSync(new URL('../public/audio/music/freesound_community-crowd-cheering-6229.mp3', import.meta.url));
    expect(bytes.length).toBeGreaterThan(4000);
    const hasId3 = bytes.toString('ascii', 0, 3) === 'ID3';
    const hasMpegFrame = bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0;
    expect(hasId3 || hasMpegFrame).toBe(true);
  });

  it('does not finish the show until its real applause recording has had time to play', () => {
    expect(SPOTLIGHT_APPLAUSE_CLIP_MS).toBe(6100);
    expect(SPOTLIGHT_APPLAUSE_MS).toBeGreaterThanOrEqual(SPOTLIGHT_APPLAUSE_CLIP_MS);
    expect(spotlightFrameAt(SPOTLIGHT_APPLAUSE_START - 1).kind).toBe('caption');
    expect(spotlightFrameAt(SPOTLIGHT_APPLAUSE_START).kind).toBe('applause');
    expect(spotlightFrameAt(SPOTLIGHT_APPLAUSE_START + SPOTLIGHT_APPLAUSE_CLIP_MS).kind).toBe('applause');
    expect(spotlightFrameAt(SPOTLIGHT_TOTAL_MS).finished).toBe(true);
  });
});
