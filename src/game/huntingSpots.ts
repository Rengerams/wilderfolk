export type HuntingSpotPrey = 'auto' | 'deer' | 'rabbit' | 'wolf';

export interface HuntingSpotPreyOption {
  readonly id: HuntingSpotPrey;
  readonly label: string;
  readonly emoji: string;
  readonly hint: string;
}

export const DEFAULT_HUNTING_SPOT_PREY: HuntingSpotPrey = 'auto';

export const HUNTING_SPOT_PREY_OPTIONS: readonly HuntingSpotPreyOption[] = [
  { id: 'auto', label: 'Auto', emoji: '🎯', hint: 'Nearest deer, rabbit, or wolf' },
  { id: 'deer', label: 'Deer', emoji: '🦌', hint: 'Biggest carcass — most meat' },
  { id: 'rabbit', label: 'Rabbit', emoji: '🐰', hint: 'Fast snack — small but safe' },
  { id: 'wolf', label: 'Wolf', emoji: '🐺', hint: 'Risky — wolves fight back' },
] as const;

/** Fast lookup map for hunting spot options by id. */
const PREY_OPTIONS_MAP: Readonly<Record<HuntingSpotPrey, HuntingSpotPreyOption>> = {
  auto: HUNTING_SPOT_PREY_OPTIONS[0],
  deer: HUNTING_SPOT_PREY_OPTIONS[1],
  rabbit: HUNTING_SPOT_PREY_OPTIONS[2],
  wolf: HUNTING_SPOT_PREY_OPTIONS[3],
};

/** Retrieves UI option details for a given prey selection. */
export function getHuntingSpotPreyOption(prey: HuntingSpotPrey = 'auto'): HuntingSpotPreyOption {
  return PREY_OPTIONS_MAP[prey] ?? PREY_OPTIONS_MAP.auto;
}

/** Type guard verifying if an unknown value is a valid HuntingSpotPrey target. */
export function isValidHuntingSpotPrey(value: unknown): value is HuntingSpotPrey {
  return typeof value === 'string' && value in PREY_OPTIONS_MAP;
}