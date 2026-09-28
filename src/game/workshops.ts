import type { Resources } from './resourceTypes';

export type WorkshopRecipeId =
  | 'wooden_goods'
  | 'stone_tools'
  | 'furniture'
  | 'trade_trinkets';

export interface WorkshopRecipe {
  readonly id: WorkshopRecipeId;
  readonly label: string;
  readonly emoji: string;
  readonly description: string;
  readonly inputs: Readonly<Partial<Resources>>;
  readonly baseGold: number;
}

export const DEFAULT_WORKSHOP_RECIPE_ID: WorkshopRecipeId = 'wooden_goods';

export const WORKSHOP_RECIPES: readonly WorkshopRecipe[] = [
  {
    id: 'wooden_goods',
    label: 'Wooden goods',
    emoji: '🪵',
    description: 'Carved bowls, spoons, and simple trade goods.',
    inputs: { wood: 5 },
    baseGold: 4,
  },
  {
    id: 'stone_tools',
    label: 'Stone tools',
    emoji: '⛏️',
    description: 'Axes, hammers, and frontier hardware.',
    inputs: { wood: 3, stone: 2 },
    baseGold: 6,
  },
  {
    id: 'furniture',
    label: 'Furniture',
    emoji: '🪑',
    description: 'Sturdy chairs, tables, and cabin fittings.',
    inputs: { wood: 10, stone: 2 },
    baseGold: 10,
  },
  {
    id: 'trade_trinkets',
    label: 'Trade trinkets',
    emoji: '✨',
    description: 'Quick carved charms when wood is tight.',
    inputs: { wood: 2 },
    baseGold: 2,
  },
] as const;

/** O(1) fast lookup index by recipe ID. */
const RECIPES_BY_ID = new Map<string, WorkshopRecipe>(
  WORKSHOP_RECIPES.map((r) => [r.id, r]),
);

/**
 * Retrieves a workshop recipe by ID with a guaranteed default fallback.
 */
export function getWorkshopRecipe(recipeId?: string): WorkshopRecipe {
  if (!recipeId) return WORKSHOP_RECIPES[0];
  return RECIPES_BY_ID.get(recipeId) ?? WORKSHOP_RECIPES[0];
}

const RESOURCE_LABELS: Record<keyof Resources, string> = {
  wood: '🪵 wood',
  stone: '🪨 stone',
  food: '🍖 food',
  gold: '💰 gold',
  iron: '🔩 iron',
};

/**
 * Formats a recipe's input requirements into a human-readable string (e.g., "5 🪵 wood + 2 🪨 stone").
 */
export function formatRecipeInputs(inputs: Readonly<Partial<Resources>>): string {
  const parts: string[] = [];

  if (inputs.wood && inputs.wood > 0) parts.push(`${inputs.wood} ${RESOURCE_LABELS.wood}`);
  if (inputs.stone && inputs.stone > 0) parts.push(`${inputs.stone} ${RESOURCE_LABELS.stone}`);
  if (inputs.iron && inputs.iron > 0) parts.push(`${inputs.iron} ${RESOURCE_LABELS.iron}`);
  if (inputs.food && inputs.food > 0) parts.push(`${inputs.food} ${RESOURCE_LABELS.food}`);
  if (inputs.gold && inputs.gold > 0) parts.push(`${inputs.gold} ${RESOURCE_LABELS.gold}`);

  return parts.join(' + ') || '—';
}

/**
 * Checks whether the colony currently possesses sufficient input materials to produce a recipe.
 */
export function canAffordWorkshopRecipe(
  available: Readonly<Resources>,
  recipe: WorkshopRecipe,
): boolean {
  for (const [key, amount] of Object.entries(recipe.inputs)) {
    const resKey = key as keyof Resources;
    if (amount && (available[resKey] ?? 0) < amount) {
      return false;
    }
  }
  return true;
}