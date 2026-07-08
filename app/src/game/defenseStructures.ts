import { BuildingType, JobType } from './gameTypes';
import type { Building, WorldState } from './gameTypes';
import { isImprisoned } from './dayCycle';
import { ensureEntityByIdMap } from './entityIndex';
import { FORGE_BONUSES, isForgeOrderComplete, type VillageForgeState } from './forge';
import { MILITIA_BALANCE } from './militiaBalance';

const EMPTY_FORGE: VillageForgeState = {
  activeOrder: null,
  progress: 0,
  completed: {},
};

const WALL_TYPES = new Set<BuildingType>([
  BuildingType.Wall,
  BuildingType.WallCorner,
  BuildingType.WallGate,
]);

export function isWallBuildingType(type: BuildingType): boolean {
  return WALL_TYPES.has(type);
}

export function countCompletedDefenseBuildings(
  buildings: Building[],
  types: BuildingType | BuildingType[],
): number {
  if (!buildings?.length) return 0;
  const wanted = Array.isArray(types) ? new Set(types) : new Set([types]);
  return buildings.filter(
    (b) => b.completed && b.faction !== 'rival' && wanted.has(b.type),
  ).length;
}

export function getWallSegmentBonus(
  buildings: Building[],
  state?: Pick<WorldState, 'villageForge'>,
): number {
  if (!buildings?.length) return 0;
  const segments = countCompletedDefenseBuildings(buildings, [
    BuildingType.Wall,
    BuildingType.WallCorner,
    BuildingType.WallGate,
  ]);
  if (segments === 0) return 0;

  const hasPlates = state && isForgeOrderComplete(state.villageForge ?? EMPTY_FORGE, 'wall_plates');
  const perSegment = 8 + (hasPlates ? FORGE_BONUSES.wallPlatePerSegment : 0);
  const cap = hasPlates ? FORGE_BONUSES.wallPlateCap : 72;
  return Math.min(cap, segments * perSegment);
}

export function getWatchtowerBonus(buildings: Building[]): number {
  if (!buildings?.length) return 0;
  return countCompletedDefenseBuildings(buildings, BuildingType.Watchtower) * 15;
}

/**
 * Pure counter — returns how many live, non-imprisoned guards are stationed
 * in completed barracks. Does NOT mutate buildings.
 */
export function getBarracksGuardCount(state: WorldState, buildings: Building[]): number {
  if (!state?.entities || !buildings?.length) return 0;

  // O(1) lookup instead of O(n) find inside a nested loop
  const entityById = ensureEntityByIdMap(state);
  let guards = 0;

  for (const b of buildings) {
    if (!b.completed || b.type !== BuildingType.Barracks || b.faction === 'rival') continue;
    if (!b.occupants?.length) continue;

    for (const humanId of b.occupants) {
      const human = entityById.get(humanId);
      if (human && human.alive && human.job === JobType.Guard && !isImprisoned(human)) {
        guards += 1;
      }
    }
  }
  return guards;
}

/**
 * Removes dead / missing occupants from barracks. Call this during tick
 * or load — NOT inside a getter.
 */
export function pruneDeadBarracksOccupants(state: WorldState, buildings: Building[]): void {
  if (!state?.entities || !buildings?.length) return;

  const entityById = ensureEntityByIdMap(state);

  for (const b of buildings) {
    if (!b.completed || b.type !== BuildingType.Barracks || b.faction === 'rival') continue;
    if (!b.occupants?.length) continue;

    const liveOccupants: number[] = [];
    for (const humanId of b.occupants) {
      const human = entityById.get(humanId);
      if (human && human.alive && human.job === JobType.Guard && !isImprisoned(human)) {
        liveOccupants.push(humanId);
      }
    }
    if (liveOccupants.length !== b.occupants.length) {
      b.occupants = liveOccupants;
    }
  }
}

export function getBarracksGuardBonus(state: WorldState, buildings: Building[]): number {
  const guards = getBarracksGuardCount(state, buildings);
  if (guards === 0) return 0;

  const perGuard = MILITIA_BALANCE.guardBonusPerGuard + (
    isForgeOrderComplete(state.villageForge ?? EMPTY_FORGE, 'guard_halberds')
      ? FORGE_BONUSES.guardHalberdPerGuard
      : 0
  );
  return guards * perGuard;
}

export function getDefenseStructureBreakdown(state: WorldState, buildings: Building[]): string[] {
  const lines: string[] = [];
  const walls = countCompletedDefenseBuildings(buildings, [
    BuildingType.Wall,
    BuildingType.WallCorner,
    BuildingType.WallGate,
  ]);
  const wallBonus = getWallSegmentBonus(buildings, state);
  if (walls > 0) {
    lines.push(`+ ${wallBonus} wall segments (${walls} built, max +72)`);
  }
  const towers = countCompletedDefenseBuildings(buildings, BuildingType.Watchtower);
  const towerBonus = getWatchtowerBonus(buildings);
  if (towers > 0) {
    lines.push(`+ ${towerBonus} watchtowers (${towers})`);
  }
  const guards = getBarracksGuardCount(state, buildings);
  const guardBonus = getBarracksGuardBonus(state, buildings);
  if (guards > 0) {
    lines.push(`+ ${guardBonus} barracks guards (${guards} staffed)`);
  }
  return lines;
}

export function isBarracksGuard(
  humanId: number,
  homeBuildingId: number | null | undefined,
  buildings: Building[],
): boolean {
  if (homeBuildingId == null) return false;
  const workplace = buildings.find((b) => b.id === homeBuildingId);
  return !!workplace?.completed
    && workplace.type === BuildingType.Barracks
    && workplace.occupants?.includes(humanId) === true;
}