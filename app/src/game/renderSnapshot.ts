import { BuildingType, type Building, type Camera, type Entity, type EntityByType, type ResearchNode, type WorldState } from './gameTypes';
import { buildEntityByType } from './gameEngine';
import { getHourOfDay } from './dayCycle';
import { loadJuiceEffectsEnabled } from './preferences';
import type { EntityCatalog } from './entityCatalog';
import type { EntityRenderMeta } from './simBuffers/entityRenderMeta';
import type { RenderSoAReaderV1 } from './simBuffers/renderSoAReader';
import type { ScentGrid, ScentGridReader } from './scentGrid';
import { syncGrassRenderGridFromSoA } from './simBuffers/renderSoAEntities';
import type { EntitySpatialGrid } from './spatialGrid';
import type { ViewState } from './viewState';
import { resolveBuilding, resolveEntity } from './viewState';

export interface RenderSnapshotOptions {
  renderSoA?: RenderSoAReaderV1 | null;
  renderMetaBySlot?: EntityRenderMeta[];
  catalog?: EntityCatalog;
  scentGrid?: ScentGrid | null;
  scentReader?: ScentGridReader | null;
}

/** Read-only bundle for the canvas renderer — simulation rules must not mutate this. */
export interface RenderSnapshot {
  readonly entities: Entity[];
  /** Alive entities by type — from sim tick buckets when available. */
  readonly entityByType: EntityByType;
  readonly buildings: Building[];
  readonly deathParticles: WorldState['deathParticles'];
  readonly floatingTexts: WorldState['floatingTexts'];
  readonly tick: number;
  readonly hourOfDay: number;
  readonly season: WorldState['season'];
  readonly year: number;
  readonly dayInYear: number;
  readonly width: number;
  readonly height: number;
  readonly weather: WorldState['weather'];
  readonly worldMap: WorldState['worldMap'];
  readonly disasters: WorldState['disasters'];
  readonly camera: Camera;
  readonly screenShake: number;
  readonly selectedEntity: Entity | null;
  readonly selectedBuilding: Building | null;
  readonly hoveredBuilding: Building | null;
  readonly buildMode: BuildingType | null;
  readonly buildGhost: ViewState['buildGhost'];
  readonly buildStripPreview: ViewState['buildStripPreview'];
  readonly buildRotation: ViewState['buildRotation'];
  readonly showGrid: boolean;
  readonly showPaths: boolean;
  readonly festival: WorldState['festival'];
  readonly visitorGroups: WorldState['visitorGroups'];
  readonly rivalSettlements: WorldState['rivalSettlements'];
  readonly highlightedCampKey: string | null;
  readonly ecosystemHealth: number;
  readonly pollutionLevel: number;
  readonly renffrOmen: WorldState['renffrOmen'];
  readonly unlockedTechs: readonly string[];
  readonly researchNodes: readonly ResearchNode[];
  readonly hasBlacksmith: boolean;
  readonly villageForge: WorldState['villageForge'];
  readonly villageLeaderId: number | null;
  readonly pendingRaidEvents: WorldState['pendingRaidEvents'];
  readonly pendingOutgoingRaidEvents: WorldState['pendingOutgoingRaidEvents'];
  readonly tradeRoutes: WorldState['tradeRoutes'];
  readonly juiceEffectsEnabled: boolean;
  /** Phase B — canvas reads kinematics from transferable buffer when set. */
  readonly renderSoA: RenderSoAReaderV1 | null;
  readonly renderMetaBySlot: EntityRenderMeta[] | null;
  readonly scentGrid: ScentGrid | null;
  readonly scentReader: ScentGridReader | null;
  /** Tick-persistent grass spatial index — sim path from world; worker path from render SoA. */
  readonly grassGrid: EntitySpatialGrid | null;
}

export function buildRenderSnapshot(
  world: WorldState,
  view: ViewState,
  options: RenderSnapshotOptions = {},
): RenderSnapshot {
  const catalog = options.catalog;
  const selectedEntity = resolveEntity(world, view.selectedEntityId)
    ?? catalog?.get(view.selectedEntityId)
    ?? null;
  const entities = catalog?.getAlive() ?? world.entities.filter((e) => e.alive);
  const entityByType = catalog?.getEntityByType()
    ?? world.entityByType
    ?? buildEntityByType(entities);

  let grassGrid: EntitySpatialGrid | null = world.grassGrid ?? null;
  if (options.renderSoA) {
    grassGrid = syncGrassRenderGridFromSoA(
      options.renderSoA,
      options.renderMetaBySlot,
      world.width,
      world.height,
      world.tick,
    ) ?? grassGrid;
  }

  return {
    entities,
    entityByType,
    buildings: world.buildings,
    deathParticles: world.deathParticles,
    floatingTexts: world.floatingTexts,
    tick: world.tick,
    hourOfDay: getHourOfDay(world.tick),
    season: world.season,
    year: world.year,
    dayInYear: world.dayInYear,
    width: world.width,
    height: world.height,
    weather: world.weather,
    worldMap: world.worldMap,
    disasters: world.disasters,
    camera: view.camera,
    screenShake: view.screenShake,
    selectedEntity,
    selectedBuilding: resolveBuilding(world, view.selectedBuildingId),
    hoveredBuilding: resolveBuilding(world, view.hoveredBuildingId),
    buildMode: view.buildMode,
    buildGhost: view.buildGhost,
    buildStripPreview: view.buildStripPreview,
    buildRotation: view.buildRotation,
    showGrid: view.showGrid,
    showPaths: view.showPaths,
    festival: world.festival,
    visitorGroups: world.visitorGroups,
    rivalSettlements: world.rivalSettlements,
    highlightedCampKey: view.highlightedCampKey,
    ecosystemHealth: world.ecosystemHealth,
    pollutionLevel: world.pollutionLevel,
    renffrOmen: world.renffrOmen ?? null,
    unlockedTechs: world.unlockedTechs,
    researchNodes: world.researchNodes,
    hasBlacksmith: world.buildings.some((b) => b.completed && b.type === BuildingType.Blacksmith),
    villageForge: world.villageForge,
    villageLeaderId: world.villageLeaderId,
    pendingRaidEvents: world.pendingRaidEvents ?? [],
    pendingOutgoingRaidEvents: world.pendingOutgoingRaidEvents ?? [],
    tradeRoutes: world.tradeRoutes ?? [],
    juiceEffectsEnabled: loadJuiceEffectsEnabled(),
    renderSoA: options.renderSoA ?? null,
    renderMetaBySlot: options.renderMetaBySlot ?? null,
    scentGrid: options.scentGrid ?? null,
    scentReader: options.scentReader ?? null,
    grassGrid,
  };
}