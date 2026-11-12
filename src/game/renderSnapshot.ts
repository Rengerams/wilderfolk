import { BuildingType, EntityType, emptyEntityByType, type Building, type Camera, type Entity, type EntityByType, type ResearchNode, type WorldState } from './gameTypes';
import { buildEntityByType } from './simFocus';
import { getHourOfDay } from './dayCycle';
import { getWorkSchedule } from './workSchedule';
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
import { getEcosystemHealth } from './dailyEcology';
import { getTerrainRevision } from './terrain/terrainGrid';

/**
 * A shared, frozen by-type table for the SoA render path, which never reads `snapshot.entityByType`;
 * the only consumer of that field is the renderer's non-SoA branch.
 */
const EMPTY_ENTITY_BY_TYPE: EntityByType = (() => {
  const table = emptyEntityByType();
  for (const key of Object.keys(table) as EntityType[]) Object.freeze(table[key]);
  return Object.freeze(table);
})();

/**
 * Cache identity for {@link buildRenderSnapshot}: every world and view input the snapshot reads must
 * appear here, including the F4 logistics and juice-effects preferences — a paused view never ticks.
 */
export function renderSnapshotDirtyKey(
  world: WorldState,
  view: ViewState,
  renderMode: 'soa' | 'obj',
): string {
  const ghost = view.buildGhost;
  const strip = view.buildStripPreview;

  return [
    world.tick,
    world.paused ? 1 : 0,
    world.season,
    world.floatingTexts.length,
    world.bigNews.length,
    world.deathParticles.length,
    world.pendingRaidEvents?.length ?? 0,
    world.pendingOutgoingRaidEvents?.length ?? 0,
    world.visitorGroups.length,
    world.buildings.length,
    world.entities.length,
    view.camera.x.toFixed(1),
    view.camera.y.toFixed(1),
    view.camera.zoom.toFixed(3),
    view.screenShake.toFixed(1),
    view.selectedEntityId ?? '',
    (view.selectedEntityIds ?? []).join(','),
    view.selectedBuildingId ?? '',
    view.hoveredBuildingId ?? '',
    view.buildMode ?? '',
    view.buildRotation ?? 0,
    view.favoriteEntityId ?? '',
    view.highlightedCampKey ?? '',
    view.selectedCampKey ?? '',
    view.showGrid ? 1 : 0,
    view.showPaths ? 1 : 0,
    view.showLogistics ? 1 : 0,
    loadJuiceEffectsEnabled() ? 1 : 0,
    ghost ? `${ghost.x.toFixed(0)},${ghost.y.toFixed(0)},${ghost.valid ? 1 : 0}` : '',
    strip?.segments.length
      ? `${strip.segments.length}|${strip.rotation}|${strip.segments[0].x},${strip.segments[0].y}|`
        + `${strip.segments[strip.segments.length - 1].x},${strip.segments[strip.segments.length - 1].y}|`
        + `${strip.segments[0].valid ? 1 : 0}`
      : '',
    renderMode,
  ].join('|');
}

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
  /** Static-layer cache identity — an advancing tick alone must not repaint the layer. */
  readonly staticLayerRevision: string;
  readonly hourOfDay: number;
  readonly workSchedule?: WorldState['workSchedule'];
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
   * F4 logistics projection — `null` while `ViewState.showLogistics` is off, so the off state costs
   * nothing. The classification lives in `logisticsOverlayData`; the renderer only draws it.
   */
  readonly logistics: LogisticsOverlayData | null;
  readonly festival: WorldState['festival'];
  readonly spotlightLore: WorldState['spotlightLore'];
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

/**
 * Identity of everything the cached static entity layer paints. Nothing time-only belongs here: a
 * construction-site ramp and the hour are drawn in the per-frame overlay pass.
 */
function staticEntityLayerRevision(world: WorldState): string {
  const buildings = world.buildings ?? [];
  const parts: (string | number)[] = [
    world.width,
    world.height,
    world.season,
    world.year,
    world.dayInYear,
    world.entities.length,
    buildings.length,
    getTerrainRevision(),
  ];
  for (const b of buildings) {
    parts.push(
      b.id,
      b.type,
      b.level,
      b.spriteScale,
      b.rotation ?? 0,
      b.faction ?? '',
      b.completed ? 1 : 0,
      b.gateClosed ? 1 : 0,
      b.health,
      b.occupants.length,
      // An incomplete site's baked figure scales with its authoritative progress; the smoothed bar
      // is painted per frame, so only the day's real step may re-bake the layer.
      b.completed ? 0 : b.constructionProgress,
    );
  }
  for (const group of world.visitorGroups ?? []) {
    parts.push(group.id, group.campX, group.campY, group.daysLeft);
  }
  return parts.join('|');
}

/**
 * The last built static revision. The snapshot rebuilds for every camera move; every simulation
 * hand-off either replaces these arrays (worker delta, isolated command) or advances the tick, so a
 * matching identity means nothing the static layer paints can have changed.
 */
let staticRevisionCache: {
  world: WorldState;
  tick: number;
  buildings: readonly Building[];
  entities: readonly Entity[];
  revision: string;
} | null = null;

/** Static-layer identity for this world revision, reused between camera-only snapshot rebuilds. */
function cachedStaticEntityLayerRevision(world: WorldState): string {
  const cached = staticRevisionCache;
  const buildings = world.buildings ?? [];
  const entities = world.entities ?? [];
  if (
    cached
    && cached.world === world
    && cached.tick === world.tick
    && cached.buildings === buildings
    && cached.entities === entities
  ) {
    return cached.revision;
  }
  const revision = staticEntityLayerRevision(world);
  staticRevisionCache = { world, tick: world.tick, buildings, entities, revision };
  return revision;
}

/** Last colony-wide blacksmith scan — this runs per frame, and the camera alone rebuilds the snapshot. */
let blacksmithScan: { buildings: readonly Building[]; length: number; tick: number } | null = null;
let blacksmithScanResult = false;

function colonyHasBlacksmith(buildings: readonly Building[], tick: number): boolean {
  // `completed` and `faction` only move inside a tick layer, so array identity, length and tick
  // together cover every change to the predicate; a camera-only rebuild then re-scans nothing.
  const cached = blacksmithScan;
  if (
    cached
    && cached.buildings === buildings
    && cached.length === buildings.length
    && cached.tick === tick
  ) {
    return blacksmithScanResult;
  }
  blacksmithScanResult = buildings.some(
    (b) => b.completed && b.type === BuildingType.Blacksmith && b.faction !== 'rival',
  );
  blacksmithScan = { buildings, length: buildings.length, tick };
  return blacksmithScanResult;
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
  // The SoA path hydrates its draw lists from the render buffer: `entities` is read only for its
  // `.length` (the world's own alive list), and `entityByType` becomes the shared frozen table.
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
    staticLayerRevision: cachedStaticEntityLayerRevision(world),
    hourOfDay: getHourOfDay(world.tick),
    workSchedule: getWorkSchedule(world),
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
    // Presentation-only and off by default: with the toggle off the projection is not computed, so
    // an untouched session's render path and cost are unchanged.
    logistics: view.showLogistics ? computeLogisticsOverlayCached(world) : null,
    festival: world.festival,
    spotlightLore: world.spotlightLore,
    visitorGroups: world.visitorGroups ?? [],
    rivalSettlements: world.rivalSettlements ?? [],
    highlightedCampKey: view.highlightedCampKey,
    ecosystemHealth: getEcosystemHealth(world),
    pollutionLevel: world.pollutionLevel,
    renffrOmen: world.renffrOmen ?? null,
    unlockedTechs: world.unlockedTechs ?? [],
    researchNodes: world.researchNodes ?? [],
    hasBlacksmith: colonyHasBlacksmith(world.buildings ?? [], world.tick),
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
