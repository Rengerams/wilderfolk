/**
 * Daily population reconciliation owner called by tickLayerDaily. — once per colony day (`tick % TICKS_PER_DAY === 0`).
 *
 * Grass ecology (growth/spread), static bookkeeping, building production,
 * frontier systems, and daily-gated world events. Trees have no sim tick.
 */
import type {
  WorldState,
  Entity,
} from './gameTypes';
import type {
  PopulationCounts,
} from './entityCounts';
import {
  BuildingType,
} from './gameTypes';
import { indexEntity } from './entityIndex';
import {
  IMMIGRATION_CHECK_TICKS,
  getResidenceCapacity,
} from './dayCycle';
import { assignMissingResidences } from './residency';
import { createImmigrantSettler } from './worldGen';
import { findHumanSpawnNear } from './terrainSystems';
import { isPlayerHuman } from './playerHuman';
import { getTownHallImmigrationMultiplier } from './townHall';
import { addFloatingText, addNotification } from './simEffects';

import type {
  TickContext,
} from './simulation/simulationTypes';
import {
  pruneFactionWanderStates,
} from './factionWander';
/**
 * Winter heating — burns wood once per colony day, stores result on state for the whole day.
 * Call from gameTick only (not from daily layer again).
 */

function tickImmigration(
  state: WorldState,
  ctx: TickContext,
  allAlive: Entity[],
  counts: PopulationCounts,
): void {
  const { updatedBuildings, entityById, width, height } = ctx;

  const housingCap = updatedBuildings
    .filter((b) => b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion))
    .reduce((sum, b) => sum + getResidenceCapacity(b), 0);
  state.maxHumanPopulation = 5 + housingCap + Math.floor(state.villageReputation / 10);

  const completedHousing = updatedBuildings.filter(
    (b) => b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion),
  ).length;
  const immigrationChance = Math.min(
    0.95,
    (0.05 + state.villageReputation / 120 + completedHousing * 0.03)
      * (state.festival?.active ? 1.5 : 1)
      * getTownHallImmigrationMultiplier(updatedBuildings),
  );

  const openSlots = state.maxHumanPopulation - counts.humans;
  if (
    state.tick > 0
    && state.tick % IMMIGRATION_CHECK_TICKS === 0
    && openSlots > 0
    && Math.random() < immigrationChance
  ) {
    let spawnX = width / 2;
    let spawnY = height / 2;
    const homes = updatedBuildings.filter(
      (b) => b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion),
    );
    if (homes.length > 0) {
      const home = homes[Math.floor(Math.random() * homes.length)];
      spawnX = home.x + home.width / 2;
      spawnY = home.y + home.height / 2;
    }
    const rawSpawnX = spawnX + (Math.random() - 0.5) * 40;
    const rawSpawnY = spawnY + (Math.random() - 0.5) * 40;
    const spawn = findHumanSpawnNear(state, rawSpawnX, rawSpawnY);
    // Cap members so a couple cannot overshoot maxHumanPopulation
    const newcomers = createImmigrantSettler(state, spawn.x, spawn.y, openSlots);
    let admitted = 0;
    for (const newcomer of newcomers) {
      if (counts.humans >= state.maxHumanPopulation) break;
      allAlive.push(newcomer);
      indexEntity(entityById, newcomer);
      counts.humans++;
      admitted++;
    }
    if (admitted > 0) {
      assignMissingResidences(allAlive.filter(isPlayerHuman), updatedBuildings, allAlive);
      const label = admitted === 1 ? '+1 Settler arrived' : `+${admitted} Settlers arrived`;
      addFloatingText(state, spawnX, spawnY - 18, label, '#22c55e');
      addNotification(
        state,
        'New Settler',
        label,
        'success',
        { x: spawnX, y: spawnY },
      );
    }
  }
}

export function tickDailyPopulation(
  state: WorldState,
  ctx: TickContext,
  allAlive: Entity[],
  counts: PopulationCounts,
): void {
  
  for (let i = allAlive.length - 1; i >= 0; i--) {
    if (!allAlive[i].alive) allAlive.splice(i, 1);
  }
  pruneFactionWanderStates(allAlive.map((e) => e.id));
  tickImmigration(state, ctx, allAlive, counts);
}
