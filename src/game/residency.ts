

export { HUMAN_MOVE_OUT_MIN_AGE } from './residencyOccupancy';
export type { ResidenceOccupancy } from './residencyOccupancy';
export { isResidenceBuilding, isResidenceBuildingType, isLeaderHouseResidence, getResidenceCapacity, getResidenceUpgradeSlotGain, hasWorkAssignment, hasResidenceAssignment, isImprisoned, shareResidence, isNearResidence, buildResidenceOccupancy, occupancyMove, countResidentsInBuilding, residenceHasCapacity, residenceRoomFor } from './residencyOccupancy';
export { collectFamilyMembers, collectOwnHousehold, getChildCustodian, isAdultChildAtHome, isMinorChild } from './householdComposition';
export { listPlayerResidences, placeOrphanInHouse, ensureOrphanAdoption, pickResidenceFromChildCustodian, buildHousingUnits, canMoveOutOfFamilyHome, tryMoveOutOfFamilyHome, rebalanceAdultChildrenFromFamilyHomeWhenEmptyAvailable, buildFamilyGroups, isUnnecessarilySharingHousing, auditHousingSharingIssues, housingUnitNeedsReassignment, pickResidenceForFamily, pickResidenceForHumanExcluding, pickResidenceForHuman } from './residencySelection';
export { rebuildChildrenIds, rebalanceOvercrowdedResidences, isResidenceOccupantEntity, syncResidenceOccupants, assignMissingResidences, syncPartnerResidence } from './residencyReconciliation';
