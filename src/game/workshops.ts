/**
 * Workshop recipe catalog + helpers. Leaf module (imports only resourceTypes).
 */
import type { Resources } from './resourceTypes';

export interface WorkshopRecipe {
  id: string;
  label: string;
  emoji: string;
  description: string;
  inputs: Partial<Resources>;
  baseGold: number;
}
export const DEFAULT_WORKSHOP_RECIPE_ID = 'wooden_goods';

export const WORKSHOP_RECIPES: WorkshopRecipe[] = [
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
];
export function getWorkshopRecipe(recipeId?: string): WorkshopRecipe {
  return WORKSHOP_RECIPES.find((r) => r.id === recipeId) ?? WORKSHOP_RECIPES[0];
}

export function formatRecipeInputs(inputs: Partial<Resources>): string {
  const parts: string[] = [];
  if (inputs.wood) parts.push(`${inputs.wood} wood`);
  if (inputs.stone) parts.push(`${inputs.stone} stone`);
  if (inputs.food) parts.push(`${inputs.food} food`);
  if (inputs.gold) parts.push(`${inputs.gold} gold`);
  return parts.join(' + ') || '—';
}
