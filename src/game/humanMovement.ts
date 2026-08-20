/**
 * Compatibility entry point for human movement.
 *
 * The authoritative implementation lives in `./simulation/humanMovement`.
 * Keep this path as a re-export for older imports; do not add movement logic here.
 */
export {
  COMMUTE_SNAP_DISTANCE,
  commutePathCacheKey,
  commuteHumanToBuilding,
  commuteDistanceToBuilding,
  humanBuildingTarget,
  homeStandPosition,
  nearestActiveMoonHowler,
  snapHumanToBuilding,
} from './simulation/humanMovement';
