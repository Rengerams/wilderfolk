/**
 * Per-species sim parameters (energy, movement, reproduction, sprites).
 *
 * Energy loss / reproduction cooldowns are scaled for {@link TICKS_PER_HOUR}
 * so daily totals match the legacy 24-ticks-per-day balance.
 */
import { EntityType } from './gameTypes';
import { PER_TICK_RATE_SCALE, TICKS_PER_HOUR } from './dayCycle';

export interface SpeciesConfig {
  maxEnergy: number;
  energyLossPerTick: number;
  energyGain: Record<string, number>;
  maxAge: number;
  speed: number;
  size: number;
  reproductionCooldown: number;
  reproductionEnergyThreshold: number;
  reproductionChance: number;
  spawnEnergy: number;
  color: string;
  fleeRange: number;
  huntRange: number;
  wanderRadius: number;
  sprite: string;
}

/** Legacy cooldown (ticks when 1 tick = 1 hour) → current tick units. */
function cd(legacyTicks: number): number {
  return legacyTicks * TICKS_PER_HOUR;
}

export const SPECIES_CONFIG: Record<EntityType, SpeciesConfig> = {
  [EntityType.Grass]: {
    maxEnergy: 100, energyLossPerTick: 0, energyGain: {},
    maxAge: 365 * 5, speed: 0, size: 4,
    reproductionCooldown: 0, reproductionEnergyThreshold: 40, reproductionChance: 0.02, spawnEnergy: 30,
    color: '#22c55e', fleeRange: 0, huntRange: 0, wanderRadius: 30,
    sprite: '/sprites/grass.png',
  },
  [EntityType.Rabbit]: {
    maxEnergy: 120, energyLossPerTick: 2.5 * PER_TICK_RATE_SCALE, energyGain: { grass: 25 },
    maxAge: 365 * 3, speed: 3.5, size: 7,
    reproductionCooldown: cd(48), reproductionEnergyThreshold: 70, reproductionChance: 0.05, spawnEnergy: 60,
    color: '#c4875a', fleeRange: 70, huntRange: 0, wanderRadius: 60,
    sprite: '/sprites/rabbit.png',
  },
  [EntityType.Deer]: {
    maxEnergy: 500, energyLossPerTick: 4.2 * PER_TICK_RATE_SCALE, energyGain: { grass: 55 },
    maxAge: 365 * 12, speed: 3.0, size: 11,
    reproductionCooldown: cd(192), reproductionEnergyThreshold: 300, reproductionChance: 0.015, spawnEnergy: 250,
    color: '#926418', fleeRange: 90, huntRange: 0, wanderRadius: 80,
    sprite: '/sprites/deer.png',
  },
  [EntityType.Wolf]: {
    maxEnergy: 600, energyLossPerTick: 5.5 * PER_TICK_RATE_SCALE, energyGain: { deer: 450, rabbit: 80 },
    maxAge: 365 * 8, speed: 3.2, size: 13,
    reproductionCooldown: cd(360), reproductionEnergyThreshold: 450, reproductionChance: 0.005, spawnEnergy: 350,
    color: '#6b7280', fleeRange: 0, huntRange: 150, wanderRadius: 120,
    sprite: '/sprites/wolf.png',
  },
  [EntityType.Fox]: {
    maxEnergy: 150, energyLossPerTick: 2.2 * PER_TICK_RATE_SCALE, energyGain: { rabbit: 60, grass: 10 },
    maxAge: 365 * 5, speed: 3.4, size: 9,
    reproductionCooldown: cd(240), reproductionEnergyThreshold: 100, reproductionChance: 0.008, spawnEnergy: 90,
    color: '#ea580c', fleeRange: 0, huntRange: 100, wanderRadius: 100,
    sprite: '/sprites/fox.png',
  },
  [EntityType.Human]: {
    maxEnergy: 500, energyLossPerTick: 4.2 * PER_TICK_RATE_SCALE, energyGain: { deer: 350, rabbit: 150 },
    // Slightly faster walk so mid-village commutes fit a work morning
    maxAge: 90, speed: 2.55, size: 10,
    reproductionCooldown: cd(3600), reproductionEnergyThreshold: 180, reproductionChance: 0.02, spawnEnergy: 180,
    color: '#f5d0a9', fleeRange: 50, huntRange: 105, wanderRadius: 100,
    sprite: '/sprites/human_male.png',
  },
  // Trees are static map props — no sim tick (lumber mill uses proximity only).
  [EntityType.Tree]: {
    maxEnergy: 500, energyLossPerTick: 0, energyGain: {},
    maxAge: 365 * 100, speed: 0, size: 12,
    reproductionCooldown: 0, reproductionEnergyThreshold: 300, reproductionChance: 0, spawnEnergy: 250,
    color: '#228B22', fleeRange: 0, huntRange: 0, wanderRadius: 0,
    sprite: '/sprites/tree.png',
  },
  [EntityType.Werewolf]: {
    maxEnergy: 700, energyLossPerTick: 6 * PER_TICK_RATE_SCALE, energyGain: { deer: 400, rabbit: 100 },
    maxAge: 365 * 35, speed: 3.4, size: 14,
    reproductionCooldown: cd(720), reproductionEnergyThreshold: 300, reproductionChance: 0.001, spawnEnergy: 350,
    color: '#7c6f9a', fleeRange: 0, huntRange: 150, wanderRadius: 150,
    sprite: '/sprites/wolf.png',
  },
  [EntityType.Wildkin]: {
    maxEnergy: 450, energyLossPerTick: 3 * PER_TICK_RATE_SCALE, energyGain: { grass: 45 },
    maxAge: 365 * 40, speed: 3.2, size: 12,
    reproductionCooldown: cd(288), reproductionEnergyThreshold: 200, reproductionChance: 0.008, spawnEnergy: 200,
    color: '#a3a35a', fleeRange: 100, huntRange: 0, wanderRadius: 90,
    sprite: '/sprites/deer.png',
  },
};

