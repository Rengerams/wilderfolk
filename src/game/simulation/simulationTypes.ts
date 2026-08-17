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
 * by gameTick and threaded through every sim layer. Owned here so all sim
 * subsystems can consume it without importing the orchestration layer.
 */
export interface TickContext {
  width: number;
  height: number;
  hourOfDay: number;
  season: Season;
  grassMult: number;
  reproMult: number;
  winterPenalty: number;
  canHeat: boolean;
  byType: Record<EntityType, Entity[]>;
  /** Alive entities at tick start — avoids re-filtering state.entities in each layer. */
  aliveEntities: Entity[];
  newEntities: Entity[];
  updatedBuildings: Building[];
  roadBuildings: Building[];
  playerHumans: Entity[];
  entityById: Map<number, Entity>;
  buildingById: Map<number, Building>;
  predators: Entity[];
  grassGrid?: EntitySpatialGrid;
  mobileGrid?: EntitySpatialGrid;
  treeGrid?: EntitySpatialGrid;
  residenceOccupants?: Map<number, Entity[]>;
  grassPopulation?: GrassPopulationSnapshot;
  roadAvoidance?: RoadAvoidanceIndex;
  huntTargetByPreyId?: Map<number, Set<number>>;
  wildlifePopulation?: WildlifePopulationSnapshot;
  scentGrid?: ScentGrid;
  focus?: SimulationFocus;
  /** Newborn wildlife id → parent id (same-tick population cap excludes self-spawns). */
  wildlifeSpawnParent?: Map<number, number>;
  hasWell?: boolean;
  hasHospital?: boolean;
  grassCap?: number;
}
