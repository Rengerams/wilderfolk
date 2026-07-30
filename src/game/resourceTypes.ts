/** Resource keys used by economy, production, and costs. */
export type ResourceKey = 'wood' | 'stone' | 'food' | 'gold';

/** Standard resource purse. */
export interface Resources {
  wood: number;
  stone: number;
  food: number;
  gold: number;
}
