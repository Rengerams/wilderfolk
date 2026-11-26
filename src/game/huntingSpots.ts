export type HuntingSpotPrey = 'auto' | 'deer' | 'rabbit' | 'fox' | 'wolf';

export interface HuntingSpotPreyOption {
  readonly id: HuntingSpotPrey;
  readonly label: string;
  readonly emoji: string;
  readonly hint: string;
}

export const HUNTING_SPOT_PREY_OPTIONS: readonly HuntingSpotPreyOption[] = [
  { id: 'auto', label: 'Auto', emoji: '🎯', hint: 'Nearest deer, rabbit, fox, or wolf' },
  { id: 'deer', label: 'Deer', emoji: '🦌', hint: 'Biggest carcass — most meat' },
  { id: 'rabbit', label: 'Rabbit', emoji: '🐰', hint: 'Fast snack — small but safe' },
  { id: 'fox', label: 'Fox', emoji: '🦊', hint: 'Small predator — hunt for meat' },
  { id: 'wolf', label: 'Wolf', emoji: '🐺', hint: 'Risky — wolves fight back' },
] as const;

/** Fast lookup map for hunting spot options by id. */
const PREY_OPTIONS_MAP: Readonly<Record<HuntingSpotPrey, HuntingSpotPreyOption>> = {
  auto: HUNTING_SPOT_PREY_OPTIONS[0],
  deer: HUNTING_SPOT_PREY_OPTIONS[1],
  rabbit: HUNTING_SPOT_PREY_OPTIONS[2],
  fox: HUNTING_SPOT_PREY_OPTIONS[3],
  wolf: HUNTING_SPOT_PREY_OPTIONS[4],
};

/** Type guard verifying if an unknown value is a valid HuntingSpotPrey target. */
export function isValidHuntingSpotPrey(value: unknown): value is HuntingSpotPrey {
  // Own-property check: `in` also accepts Object.prototype keys ('toString', '__proto__'),
  // which the command boundary would then store as a real prey id.
  return typeof value === 'string' && Object.hasOwn(PREY_OPTIONS_MAP, value);
}
