// src/game/speciesConfig.ts
import { EntityType } from './gameTypes';
import { PER_TICK_RATE_SCALE, TICKS_PER_HOUR } from './dayCycle';

/**
 * Configuration for a single species used by the simulation.
 */
export interface SpeciesConfig {
  /** Maximum energy storage capacity. */
  readonly maxEnergy: number;
  /** Energy drained per tick (scaled by per‑tick rate factor). */
  readonly energyLossPerTick: number;
  /** Energy gains keyed by prey/forage IDs. */
  readonly energyGain: Readonly<Record<string, number>>;
  /**
   * Maximum lifespan – simulation days for wildlife, calendar years for humans.
   */
  readonly maxAge: number;
  /** Base movement speed in pixels per tick. */
  readonly speed: number;
  /** Collision/visibility radius in pixels. */
  readonly size: number;
  /** Cooldown between mating attempts (ticks). */
  readonly reproductionCooldown: number;
  /** Energy threshold required before reproduction can be considered. */
  readonly reproductionEnergyThreshold: number;
  /** Base probability (0‑1) of attempting reproduction each eligible tick. */
  readonly reproductionChance: number;
  /** Pregnancy duration in ticks (0 if not applicable). */
  readonly pregnancyDuration: number;
  /** Litter size range – `[min, max]`. */
  readonly litterSize: [number, number];
  /** Energy given to a newborn at spawn. */
  readonly spawnEnergy: number;
  /** Color used for minimap icons and debug particles. */
  readonly color: string;
  /** Distance at which prey flees from predators. */
  readonly fleeRange: number;
  /** Distance at which predators detect prey. */
  readonly huntRange: number;
  /** Radius of autonomous wandering. */
  readonly wanderRadius: number;
  /** Path to the default sprite asset. */
  readonly sprite: string;
}

/** Convert legacy “hours per event” to internal tick units. */
function cd(legacyHours: number): number {
  return legacyHours * TICKS_PER_HOUR;
}

/**
 * Global species lookup indexed by `EntityType`.
 *
 * We use a two‑step cast (`as unknown as …`) to convince TypeScript that the
 * literal object is exactly the `Readonly<Record<EntityType, SpeciesConfig>>`
 * we need, bypassing its structural overlap check.
 */
export const SPECIES_CONFIG = Object.freeze({
  [EntityType.Grass]: {
    pregnancyDuration: 0,
    litterSize: [0, 0],
    maxEnergy: 100,
    energyLossPerTick: 0,
    energyGain: {},
    maxAge: 365 * 5,
    speed: 0,
    size: 4,
    reproductionCooldown: 0,
    reproductionEnergyThreshold: 40,
    reproductionChance: 0.00002,
    spawnEnergy: 30,
    color: '#22c55e',
    fleeRange: 0,
    huntRange: 0,
    wanderRadius: 30,
    sprite: '/sprites/grass.png',
  },

  [EntityType.Rabbit]: {
    pregnancyDuration: 1080,                // 30 real days → 15 game days
    litterSize: [4, 12],
    maxEnergy: 120,
    energyLossPerTick: 2.5 * PER_TICK_RATE_SCALE,
    energyGain: { grass: 25 },
    maxAge: 365 * 3,
    speed: 3.5,
    size: 7,
    reproductionCooldown: cd(720),          // 30 game days
    reproductionEnergyThreshold: 70,
    reproductionChance: 0.30,
    spawnEnergy: 60,
    color: '#c4875a',
    fleeRange: 40,
    huntRange: 0,
    wanderRadius: 60,
    sprite: '/sprites/rabbit.png',
  },

  [EntityType.Deer]: {
    pregnancyDuration: 7200,                // 200 real days → 100 game days
    litterSize: [1, 2],
    maxEnergy: 500,
    energyLossPerTick: 4.2 * PER_TICK_RATE_SCALE,
    energyGain: { grass: 55 },
    maxAge: 365 * 12,
    speed: 3.0,
    size: 11,
    reproductionCooldown: cd(720),          // 30 game days
    reproductionEnergyThreshold: 300,
    reproductionChance: 0.15,
    spawnEnergy: 250,
    color: '#926418',
    fleeRange: 50,
    huntRange: 0,
    wanderRadius: 210,
    sprite: '/sprites/deer.png',
  },

  [EntityType.Wolf]: {
    pregnancyDuration: 2268,                // 63 real days → 31.5 game days
    litterSize: [4, 6],
    maxEnergy: 900,
    energyLossPerTick: 5.5 * PER_TICK_RATE_SCALE,
    energyGain: { deer: 650, rabbit: 30 },
    maxAge: 365 * 8,
    speed: 4,
    size: 13,
    reproductionCooldown: cd(720),          // 30 game days
    reproductionEnergyThreshold: 450,
    reproductionChance: 0.15,
    spawnEnergy: 900,
    color: '#6b7280',
    fleeRange: 0,
    huntRange: 350,
    wanderRadius: 220,
    sprite: '/sprites/wolf.png',
  },

  [EntityType.Fox]: {
    pregnancyDuration: 1872,                // 52 real days → 26 game days
    litterSize: [4, 6],
    maxEnergy: 450,
    energyLossPerTick: 4.2 * PER_TICK_RATE_SCALE,
    energyGain: { rabbit: 450, grass: 150 },
    maxAge: 365 * 5,
    speed: 3.0,
    size: 9,
    reproductionCooldown: cd(720),          // 30 game days
    reproductionEnergyThreshold: 350,
    reproductionChance: 0.008,
    spawnEnergy: 90,
    color: '#ea580c',
    fleeRange: 0,
    huntRange: 100,
    wanderRadius: 100,
    sprite: '/sprites/fox.png',
  },

  [EntityType.Human]: {
    maxEnergy: 500,
    energyLossPerTick: 4.2 * PER_TICK_RATE_SCALE,
    energyGain: { deer: 350, rabbit: 150 },
    maxAge: 90,                               // human years
    speed: 3.0,
    size: 10,
    reproductionCooldown: cd(3600),           // ~150 game days
    reproductionEnergyThreshold: 180,
    reproductionChance: 0.02,
    spawnEnergy: 180,
    color: '#f5d0a9',
    fleeRange: 50,
    huntRange: 105,
    wanderRadius: 100,
    sprite: '/sprites/human_male.png',
  },

  [EntityType.Tree]: {
    maxEnergy: 500,
    energyLossPerTick: 0,
    energyGain: {},
    maxAge: 365 * 100,
    speed: 0,
    size: 12,
    reproductionCooldown: 0,
    reproductionEnergyThreshold: 300,
    reproductionChance: 0,
    spawnEnergy: 250,
    color: '#228B22',
    fleeRange: 0,
    huntRange: 0,
    wanderRadius: 0,
    sprite: '/sprites/tree.png',
  },

  [EntityType.Werewolf]: {
    maxEnergy: 700,
    energyLossPerTick: 6.0 * PER_TICK_RATE_SCALE,
    energyGain: { deer: 400, rabbit: 100 },
    maxAge: 365 * 35,
    speed: 3.4,
    size: 14,
    reproductionCooldown: cd(720),
    reproductionEnergyThreshold: 300,
    reproductionChance: 0.001,
    spawnEnergy: 350,
    color: '#7c6f9a',
    fleeRange: 0,
    huntRange: 150,
    wanderRadius: 150,
    sprite: '/sprites/wolf.png',
  },

  [EntityType.Wildkin]: {
    maxEnergy: 450,
    energyLossPerTick: 3.0 * PER_TICK_RATE_SCALE,
    energyGain: { grass: 45 },
    maxAge: 365 * 40,
    speed: 3.2,
    size: 12,
    reproductionCooldown: cd(288),
    reproductionEnergyThreshold: 200,
    reproductionChance: 0.008,
    spawnEnergy: 200,
    color: '#a3a35a',
    fleeRange: 100,
    huntRange: 0,
    wanderRadius: 90,
    sprite: '/sprites/deer.png',
  },
}) as unknown as Readonly<Record<EntityType, SpeciesConfig>>;

/** Lookup a species’ configuration by its type. */
export function getSpeciesConfig(type: EntityType): SpeciesConfig {
  return SPECIES_CONFIG[type];
}

/**
 * Resolve the energy a predator gains from consuming a specific prey type.
 */
function getPreyEnergyGain(predatorType: EntityType, preyKey: string): number {
  const cfg = SPECIES_CONFIG[predatorType];
  return cfg?.energyGain[preyKey] ?? 0;
}