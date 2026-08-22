import { describe, expect, it } from 'vitest';
import { moonHowlerRiteWeights } from '../src/game/moonHowler';

describe('Moon Howler cure chance', () => {
  it('scales to 71% at four priests', () => {
    expect(moonHowlerRiteWeights(1).cure).toBeCloseTo(0.35);
    expect(moonHowlerRiteWeights(2).cure).toBeCloseTo(0.47);
    expect(moonHowlerRiteWeights(3).cure).toBeCloseTo(0.59);
    expect(moonHowlerRiteWeights(4).cure).toBeCloseTo(0.71);
  });

  it('does not exceed the four-priest cap', () => {
    expect(moonHowlerRiteWeights(5).cure).toBeCloseTo(0.71);
    expect(moonHowlerRiteWeights(12).cure).toBeCloseTo(0.71);
  });
});
