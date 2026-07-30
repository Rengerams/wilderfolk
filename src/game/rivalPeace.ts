import type { RivalSettlement } from './gameTypes';

/** True while a peace treaty still has days remaining. */
export function isRivalAtPeace(rival: RivalSettlement): boolean {
  return rival.peaceTreatyDays > 0;
}
