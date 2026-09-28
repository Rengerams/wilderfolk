import type { Entity, Building, EntityType, Season } from '../gameTypes';
import type { EntitySpatialGrid, RoadAvoidanceIndex } from '../spatialGrid';
import type {
  GrassPopulationSnapshot,
  WildlifePopulationSnapshot,
} from '../simQueries';
import type { ScentGrid } from '../scentGrid';
import type { SimulationFocus } from '../simFocus';

/**
 * TickContext — the tick-local simulation context assembled once per game tick
 * by `gameTick` and threaded through every simulation layer.
 */
export interface TickContext {
  readonly width: number;
  readonly height: number;
  readonly hourOfDay: number;
  readonly season: Season;
  readonly grassMult: number;
  readonly reproMult: number;
  readonly winterPenalty: number;
  readonly canHeat: boolean;

  /** Alive entity buckets segregated by EntityType. */
  byType: Partial<Record<EntityType, Entity[]>> & Record<EntityType, Entity[]>;

  /** Alive entities at tick start — avoids re-filtering state.entities in each layer. */
  aliveEntities: Entity[];

  /** Entities queued to be added to WorldState at tick end. */
  newEntities: Entity[];

  /** Active building references for the current tick. */
  updatedBuildings: Building[];
  roadBuildings: Building[];

  /** Village settlers (non-rival, non-visitor player humans). */
  playerHumans: Entity[];

  /** Fast $O(1)$ entity lookup map by entity id. */
  entityById: Map<number, Entity>;

  /** Fast $O(1)$ building lookup map by building id. */
  buildingById: Map<number, Building>;

  /** Active predators (wolves, foxes, active werewolves, hostile humans). */
  predators: Entity[];

  // ── Spatial Grids (Partitioned for query performance) ──
  grassGrid?: EntitySpatialGrid;
  mobileGrid?: EntitySpatialGrid;
  /** Living humans only — social, greeting, and courtship queries avoid wildlife. */
  humanSocialGrid?: EntitySpatialGrid;
  treeGrid?: EntitySpatialGrid;

  // ── Indices & Cached Lookups ──
  residenceOccupants?: Map<number, Entity[]>;
  grassPopulation?: GrassPopulationSnapshot;
  roadAvoidance?: RoadAvoidanceIndex;
  huntTargetByPreyId?: Map<number, Set<number>>;
  wildlifePopulation?: WildlifePopulationSnapshot;
  scentGrid?: ScentGrid;
  focus?: SimulationFocus;

  /** Newborn wildlife id → parent id (same-tick population cap excludes self-spawns). */
  wildlifeSpawnParent?: Map<number, number>;

  // ── Village Infrastructure Flags ──
  hasWell?: boolean;
  hasHospital?: boolean;
  grassCap?: number;
}