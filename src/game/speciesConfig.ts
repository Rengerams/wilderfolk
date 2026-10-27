import { EntityType, MapSize, MAP_SIZE_DIMENSIONS } from './gameTypes';
import { PER_TICK_RATE_SCALE, TICKS_PER_HOUR } from './dayCycleClock';

export interface SpeciesConfig {
  /** Maximum energy storage capacity. */
  readonly maxEnergy: number;
  /** Basal energy drained per simulation tick. */
  readonly energyLossPerTick: number;
  /** Energy gained from consuming specific prey or forage items. */
  readonly energyGain: Readonly<Record<string, number>>;
  /**
   * Maximum natural lifespan.
   * Note: Wildlife, flora, and monsters are in simulation days (years * 365);
   * humans track integer calendar years directly.
   */
  readonly maxAge: number;
  /** Base movement speed in pixels per tick. */
  readonly speed: number;
  /** Bounding radius in pixels for spatial hashing and collision queries. */
  readonly size: number;
  /** Ticks required between successful mating/reproduction attempts. */
  readonly reproductionCooldown: number;
  /** Minimum energy required before reproduction can be considered. */
  readonly reproductionEnergyThreshold: number;
  /** Base probability per eligible tick of initiating reproduction. */
  readonly reproductionChance: number;
  /** Starting energy endowed to a newly spawned offspring. */
  readonly spawnEnergy: number;
  /** Minimap and debug particle color. */
  readonly color: string;
  /** Distance in pixels at which prey detects and flees from predators. */
  readonly fleeRange: number;
  /** Distance in pixels at which predators detect and pursue prey. */
  readonly huntRange: number;
  /** Radius in pixels for autonomous idle wandering. */
  readonly wanderRadius: number;
  /** Default sprite asset path. */
  readonly sprite: string;
}

/** Converts legacy 1-tick-per-hour durations into active simulation tick units. */
function cd(legacyHours: number): number {
  return legacyHours * TICKS_PER_HOUR;
}

/** Legacy Medium axis before the map grew to `MAP_SIZE_DIMENSIONS` — the denominator of `MAP_SCALE`. */
const LEGACY_MEDIUM_AXIS_PX = 1200;

/** Per-axis map enlargement: every mobile species' pace and absolute range scales with it. */
export const MAP_SCALE = MAP_SIZE_DIMENSIONS[MapSize.Medium].width / LEGACY_MEDIUM_AXIS_PX;

export const SPECIES_CONFIG: Readonly<Record<EntityType, SpeciesConfig>> = Object.freeze({
  [EntityType.Grass]: {
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
    maxEnergy: 120,
    energyLossPerTick: 2.5 * PER_TICK_RATE_SCALE,
    energyGain: { grass: 25 },
    maxAge: 365 * 3,
    speed: 3.5 * MAP_SCALE,
    size: 7,
    reproductionCooldown: cd(48),
    reproductionEnergyThreshold: 70,
    reproductionChance: 0.30,
    spawnEnergy: 60,
    color: '#c4875a',
    fleeRange: 40 * MAP_SCALE,
    huntRange: 0,
    wanderRadius: 60 * MAP_SCALE,
    sprite: '/sprites/rabbit.png',
  },
  [EntityType.Deer]: {
    maxEnergy: 500,
    energyLossPerTick: 4.2 * PER_TICK_RATE_SCALE,
    energyGain: { grass: 55 },
    maxAge: 365 * 12,
    speed: 3.0 * MAP_SCALE,
    size: 11,
    reproductionCooldown: cd(192),
    reproductionEnergyThreshold: 300,
    reproductionChance: 0.15,
    spawnEnergy: 250,
    color: '#926418',
    fleeRange: 50 * MAP_SCALE,
    huntRange: 0,
    wanderRadius: 210 * MAP_SCALE,
    sprite: '/sprites/deer.png',
  },
  [EntityType.Wolf]: {
    maxEnergy: 900,
    energyLossPerTick: 5.5 * PER_TICK_RATE_SCALE,
    energyGain: { deer: 650, rabbit: 30 },
    maxAge: 365 * 8,
    speed: 4 * MAP_SCALE,
    size: 13,
    reproductionCooldown: cd(360),
    reproductionEnergyThreshold: 450,
    reproductionChance: 0.15,
    spawnEnergy: 900,
    color: '#6b7280',
    fleeRange: 0,
    huntRange: 350 * MAP_SCALE,
    wanderRadius: 220 * MAP_SCALE,
    sprite: '/sprites/wolf.png',
  },
  [EntityType.Fox]: {
    maxEnergy: 450,
    energyLossPerTick: 4.2 * PER_TICK_RATE_SCALE,
    energyGain: { rabbit: 450, grass: 150 },
    maxAge: 365 * 5,
    speed: 3.0 * MAP_SCALE,
    size: 9,
    reproductionCooldown: cd(240),
    reproductionEnergyThreshold: 350,
    reproductionChance: 0.008,
    spawnEnergy: 90,
    color: '#ea580c',
    fleeRange: 90 * MAP_SCALE,
    huntRange: 100 * MAP_SCALE,
    wanderRadius: 100 * MAP_SCALE,
    sprite: '/sprites/fox.png',
  },
  [EntityType.Human]: {
    maxEnergy: 500,
    energyLossPerTick: 4.2 * PER_TICK_RATE_SCALE,
    energyGain: { deer: 350, rabbit: 150 },
    maxAge: 90, // Human years
    // Walking pace in world pixels per tick; commute timing uses the same speed.
    speed: 8,
    size: 10,
    reproductionCooldown: cd(3600),
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
    speed: 3.4 * MAP_SCALE,
    size: 14,
    reproductionCooldown: cd(720),
    reproductionEnergyThreshold: 300,
    reproductionChance: 0.001,
    spawnEnergy: 350,
    color: '#7c6f9a',
    fleeRange: 0,
    huntRange: 150 * MAP_SCALE,
    wanderRadius: 150 * MAP_SCALE,
    sprite: '/sprites/wolf.png',
  },
  [EntityType.Wildkin]: {
    maxEnergy: 450,
    energyLossPerTick: 3.0 * PER_TICK_RATE_SCALE,
    // Apex: meat, not grass — the same diet shape as the wolf. It is half human and born of the
    // colony, so it takes the deer and rabbits the colony also lives on.
    energyGain: { deer: 500, rabbit: 200 },
    maxAge: 365 * 40,
    speed: 3.2 * MAP_SCALE,
    size: 12,
    reproductionCooldown: cd(288),
    reproductionEnergyThreshold: 200,
    reproductionChance: 0.008,
    spawnEnergy: 200,
    color: '#a3a35a',
    // Apex predators do not flee (wolf and werewolf both sit at 0) and they do hunt — the range is
    // the wolf's own eyes, which is what makes the hunting block below reachable.
    fleeRange: 0,
    huntRange: 350 * MAP_SCALE,
    wanderRadius: 90 * MAP_SCALE,
    sprite: '/sprites/deer.png',
  },
});

/**
 * Retrieves the species configuration for an entity type.
 */
export function getSpeciesConfig(type: EntityType): SpeciesConfig {
  return SPECIES_CONFIG[type];
}

/**
 * Resolves the nutritional energy value gained when a predator consumes a specific prey type.
 */
export function getPreyEnergyGain(
  predatorType: EntityType,
  preyKey: string,
): number {
  const config = SPECIES_CONFIG[predatorType];
  return config?.energyGain[preyKey] ?? 0;
}