/**
 * Human needs — energy loss, meals, and free-roam hunting food.
 * Extracted verbatim from humanTick.ts (humanTick-split plan, Task 2) — behavior unchanged.
 */
import type { Building, Entity, WorldState } from '../gameTypes';
import { EntityType } from '../gameTypes';
import { getValleyHuntYieldMultiplier } from '../ecologyStage';
import { getHuntFoodMultiplier } from '../combat';
import { traitMultiplier } from '../settlerTraits';
import { prefersHomeTonight, hasResidenceAssignment } from '../dayCycle';
import type { SpeciesConfig } from '../speciesConfig';

export function isMealWindow(hourOfDay: number): boolean {
  return (hourOfDay >= 8 && hourOfDay <= 10) || (hourOfDay >= 18 && hourOfDay <= 20);
}

export function fract(value: number): number {
  return value - Math.floor(value);
}

/** Food from a free-roam kill — deer is a proper carcass, rabbit a snack. */
export function freeHuntFoodGain(preyType: EntityType, state: WorldState): number {
  const base = preyType === EntityType.Deer ? 52 : preyType === EntityType.Rabbit ? 22 : 18;
  return Math.max(
    1,
    Math.round(base * getHuntFoodMultiplier(state) * getValleyHuntYieldMultiplier(state)),
  );
}

/**
 * Per-tick energy loss — the exact expression from tickHumans: base, winter cold
 * (greenthumb shrugs it off), resting near home, hospital, hardy + fierce traits.
 */
export function humanEnergyLoss(
  entity: Entity,
  config: SpeciesConfig,
  opts: {
    hasWell: boolean;
    isWinter: boolean;
    canHeat: boolean;
    hasHospital: boolean;
    tick: number;
    hourOfDay: number;
    buildingById: Map<number, Building>;
  },
): number {
  const { hasWell, isWinter, canHeat, hasHospital, tick, hourOfDay, buildingById } = opts;
  let energyLoss = hasWell ? config.energyLossPerTick * 0.8 : config.energyLossPerTick;
  if (isWinter && !canHeat) {
    // Greenthumb settlers shrug off the winter cold.
    energyLoss *= 1.5 * traitMultiplier(entity, 'greenthumb', 0.7);
  }

  // Resting near home (evening/night or quiet day) costs less energy.
  if (
    hasResidenceAssignment(entity)
    && prefersHomeTonight(entity.id, tick, hourOfDay)
  ) {
    const residence = buildingById.get(entity.residenceBuildingId!);
    if (residence?.completed) {
      const hdx = residence.x + residence.width / 2 - entity.x;
      const hdy = residence.y + residence.height / 2 - entity.y;
      if (Math.hypot(hdx, hdy) < 14) energyLoss *= 0.5;
    }
  }

  // Hospital reduces energy loss
  if (hasHospital) energyLoss *= 0.9;
  // Hardy settlers burn energy slower; fierce ones push through the shift.
  energyLoss *= traitMultiplier(entity, 'hardy', 0.85);
  energyLoss *= traitMultiplier(entity, 'fierce', 0.9);
  return energyLoss;
}
