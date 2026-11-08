import { describe, expect, it } from 'vitest';
import { hexToRgb, parseHexRgb } from '../src/game/renderer/shared';

describe('renderer colour parsing has one rule', () => {
  it('reads long and short hex through the same parser', () => {
    expect(hexToRgb('#aabbcc')).toEqual({ r: 170, g: 187, b: 204 });
    expect(hexToRgb('#abc')).toEqual({ r: 170, g: 187, b: 204 });
    expect(hexToRgb('#abc')).toEqual(parseHexRgb('#abc'));
  });

  it('uses the documented fallback for an unusable colour instead of NaN', () => {
    expect(hexToRgb('not-a-colour')).toEqual({ r: 80, g: 90, b: 70 });
  });
});
