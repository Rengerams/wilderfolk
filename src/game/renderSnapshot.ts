import { BuildingType, EntityType, emptyEntityByType, type Building, type Camera, type Entity, type EntityByType, type ResearchNode, type WorldState } from './gameTypes';
import { buildEntityByType } from './simFocus';
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
import { computeLogisticsOverlayCached, type LogisticsOverlayData } from './logisticsOverlayData';

/**
 * A shared, frozen by-type table for the SoA render path, which never reads `snapshot.entityByType`.
 *
 * `buildRenderSnapshot` is rebuilt every frame while the camera moves, and `EntityCatalog.getEntityByType`
 * allocates a fresh table plus nine fresh bucket arrays on every call. The only consumer of the
 * snapshot's `entityByType` is `renderer.ts`'s **non-SoA** branch (`updateCachedEntities`), so the
 * worker path was paying for those allocations while never reading them (2026-09-21 audit, R-3).
 */
const EMPTY_ENTITY_BY_TYPE: EntityByType = (() => {
  const table = emptyEntityByType();
  for (const key of Object.keys(table) as EntityType[]) Object.freeze(table[key]);
  return Object.freeze(table);
})();

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
  readonly huntVisuals: WorldState['huntVisuals'];
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
  /** Multi-selection (shift-click) — drives selection rings + multi-assign. */
  readonly selectedEntityIds: readonly number[];
  readonly selectedBuilding: Building | null;
  readonly hoveredBuilding: Building | null;
  readonly buildMode: BuildingType | null;
  readonly buildGhost: ViewState['buildGhost'];
  readonly buildStripPreview: ViewState['buildStripPreview'];
  readonly buildRotation: ViewState['buildRotation'];
  readonly showGrid: boolean;
  readonly showPaths: boolean;
  /**
   * F4 logistics projection — `null` while `ViewState.showLogistics` is off.
   *
   * The classification lives in `logisticsOverlayData` (game layer); the renderer only draws it.
   * `null` rather than an empty projection so the off state costs nothing to compute.
   */
  readonly logistics: LogisticsOverlayData | null;
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
  const selectedEntityIds = (view.selectedEntityIds ?? (view.selectedEntityId != null ? [view.selectedEntityId] : []))
    .filter((id) => (resolveEntity(world, id) ?? catalog?.get(id)) != null);
  // The SoA path hydrates its draw lists from the render buffer, not from these fields. `entities` is
  // still read for its `.length` by the entity-layer cache key, so it becomes the world's own alive
  // list (the same objects, already alive-only) instead of a fresh copy; `entityByType` is read by
  // nothing on this path and becomes the shared frozen table (see `EMPTY_ENTITY_BY_TYPE`).
  const usingSoA = options.renderSoA != null;
  const entities = usingSoA
    ? world.entities
    : (catalog?.getAlive() ?? world.entities.filter((e) => e.alive));
  const entityByType = usingSoA
    ? EMPTY_ENTITY_BY_TYPE
    : (catalog?.getEntityByType() ?? world.entityByType ?? buildEntityByType(entities));

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
    buildings: world.buildings ?? [],
    deathParticles: world.deathParticles ?? [],
    floatingTexts: world.floatingTexts ?? [],
    huntVisuals: world.huntVisuals ?? [],
    tick: world.tick,
    hourOfDay: getHourOfDay(world.tick),
    season: world.season,
    year: world.year,
    dayInYear: world.dayInYear,
    width: world.width,
    height: world.height,
    weather: world.weather,
    worldMap: world.worldMap,
    disasters: world.disasters ?? [],
    camera: view.camera,
    screenShake: view.screenShake,
    selectedEntity,
    selectedEntityIds,
    selectedBuilding: resolveBuilding(world, view.selectedBuildingId),
    hoveredBuilding: resolveBuilding(world, view.hoveredBuildingId),
    buildMode: view.buildMode,
    buildGhost: view.buildGhost,
    buildStripPreview: view.buildStripPreview,
    buildRotation: view.buildRotation,
    showGrid: view.showGrid,
    showPaths: view.showPaths,
    // Presentation-only and off by default: when the toggle is off the projection is not computed
    // at all, so an untouched session's render path and cost are unchanged (F4). When it *is* on, the
    // memoised accessor is what keeps panning from re-projecting the whole colony every frame — the
    // snapshot key includes the camera, which lerps at frame rate (`logisticsOverlayData`).
    logistics: view.showLogistics ? computeLogisticsOverlayCached(world) : null,
    festival: world.festival,
    visitorGroups: world.visitorGroups ?? [],
    rivalSettlements: world.rivalSettlements ?? [],
    highlightedCampKey: view.highlightedCampKey,
    ecosystemHealth: world.ecosystemHealth,
    pollutionLevel: world.pollutionLevel,
    renffrOmen: world.renffrOmen ?? null,
    unlockedTechs: world.unlockedTechs ?? [],
    researchNodes: world.researchNodes ?? [],
    hasBlacksmith: (world.buildings ?? []).some(
      (b) => b.completed && b.type === BuildingType.Blacksmith && b.faction !== 'rival',
    ),
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
