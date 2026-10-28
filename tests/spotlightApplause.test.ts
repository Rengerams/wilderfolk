import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SPOTLIGHT_APPLAUSE_CLIP_MS, SPOTLIGHT_APPLAUSE_AUDIO_URL } from '../src/audio/spotlightApplause';
import {
  SPOTLIGHT_APPLAUSE_MS, SPOTLIGHT_APPLAUSE_START, SPOTLIGHT_TOTAL_MS,
  spotlightFrameAt,
} from '../src/components/spotlightChoreography';

describe('Spotlight crowd applause — provided real audio on the SFX bus', () => {
  it('contains the exact valid six-second Opus excerpt in its static audio asset', () => {
    expect(SPOTLIGHT_APPLAUSE_AUDIO_URL.endsWith('/audio/sfx/spotlight-applause.ogg')).toBe(true);
    const bytes = readFileSync(new URL('../public/audio/sfx/spotlight-applause.ogg', import.meta.url));
    expect(bytes).toHaveLength(8154);
    expect(bytes.toString('ascii', 0, 4)).toBe('OggS');
    expect(createHash('sha256').update(bytes).digest('hex'))
      .toBe('599d52172054f284572e88ecb713d5a53f53ed5f2bfaf8f4d19f6c65acbb0e0e');
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
