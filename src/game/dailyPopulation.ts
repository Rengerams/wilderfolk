/**
 * Daily population reconciliation owner called by tickLayerDaily — once per colony day.
 * Manages immigration rolls, housing capacities, dead entity pruning, and residence assignment.
 */
import type { WorldState, Entity, Building } from './gameTypes';
import type { PopulationCounts } from './entityCounts';
import { BuildingType } from './gameTypes';
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
import type { TickContext } from './simulation/simulationTypes';
import { pruneFactionWanderStates } from './factionWander';

function tickImmigration(
  state: WorldState,
  ctx: TickContext,
  allAlive: Entity[],
  counts: PopulationCounts,
): void {
  const { updatedBuildings, entityById, width, height } = ctx;

  // Single-pass scan for completed player housing
  let housingCap = 0;
  const homes: Building[] = [];

  for (let i = 0; i < updatedBuildings.length; i++) {
    const b = updatedBuildings[i];
    if (
      b.completed &&
      b.faction !== 'rival' &&
      (b.type === BuildingType.House || b.type === BuildingType.Mansion)
    ) {
      housingCap += getResidenceCapacity(b);
      homes.push(b);
    }
  }

  const reputation = state.villageReputation ?? 0;
  state.maxHumanPopulation = 5 + housingCap + Math.floor(reputation / 10);

  const completedHousingCount = homes.length;
  const festivalMultiplier = state.festival?.active ? 1.5 : 1.0;
  const townHallMultiplier = getTownHallImmigrationMultiplier(updatedBuildings);

  const immigrationChance = Math.min(
    0.95,
    (0.05 + reputation / 120 + completedHousingCount * 0.03) *
      festivalMultiplier *
      townHallMultiplier,
  );

  const openSlots = state.maxHumanPopulation - counts.humans;

  if (
    state.tick > 0 &&
    state.tick % IMMIGRATION_CHECK_TICKS === 0 &&
    openSlots > 0 &&
    Math.random() < immigrationChance
  ) {
    let spawnX = width / 2;
    let spawnY = height / 2;

    if (homes.length > 0) {
      const home = homes[Math.floor(Math.random() * homes.length)];
      spawnX = home.x + home.width / 2;
      spawnY = home.y + home.height / 2;
    }

    const rawSpawnX = spawnX + (Math.random() - 0.5) * 40;
    const rawSpawnY = spawnY + (Math.random() - 0.5) * 40;
    const spawn = findHumanSpawnNear(state, rawSpawnX, rawSpawnY);

    // Cap members so an incoming family cannot exceed maxHumanPopulation
    const newcomers = createImmigrantSettler(state, spawn.x, spawn.y, openSlots);
    let admitted = 0;

    for (let i = 0; i < newcomers.length; i++) {
      const newcomer = newcomers[i];
      if (counts.humans >= state.maxHumanPopulation) break;
      allAlive.push(newcomer);
      indexEntity(entityById, newcomer);
      counts.humans++;
      admitted++;
    }

    if (admitted > 0) {
      const villagers = allAlive.filter(isPlayerHuman);
      assignMissingResidences(villagers, updatedBuildings, allAlive);

      const label = admitted === 1 ? '+1 Settler arrived' : `+${admitted} Settlers arrived`;
      addFloatingText(state, spawnX, spawnY - 18, label, '#22c55e');
      addNotification(state, 'New Settler', label, 'success', { x: spawnX, y: spawnY });
    }
  }
}

export function tickDailyPopulation(
  state: WorldState,
  ctx: TickContext,
  allAlive: Entity[],
  counts: PopulationCounts,
): void {
  // Prune dead entities backwards
  for (let i = allAlive.length - 1; i >= 0; i--) {
    if (!allAlive[i].alive) {
      allAlive.splice(i, 1);
    }
  }

  const livingIds: number[] = new Array(allAlive.length);
  for (let i = 0; i < allAlive.length; i++) {
    livingIds[i] = allAlive[i].id;
  }
  pruneFactionWanderStates(livingIds);

  tickImmigration(state, ctx, allAlive, counts);
}