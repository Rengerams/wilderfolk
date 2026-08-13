/**
 * Hunting Spot prey options. Leaf module (see buildings / gameTypes).
 */

export type HuntingSpotPrey = 'auto' | 'deer' | 'rabbit' | 'wolf';

export const HUNTING_SPOT_PREY_OPTIONS: { id: HuntingSpotPrey; label: string; emoji: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', emoji: '🎯', hint: 'Nearest deer, rabbit, or wolf' },
  { id: 'deer', label: 'Deer', emoji: '🦌', hint: 'Biggest carcass — most meat' },
  { id: 'rabbit', label: 'Rabbit', emoji: '🐰', hint: 'Fast snack — small but safe' },
  { id: 'wolf', label: 'Wolf', emoji: '🐺', hint: 'Risky — wolves fight back' },
];
