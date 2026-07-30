import { formatRaidDeadline } from './gameEngine';
import type { RaidEvent } from './frontierCombat';

export function formatRaidDeadlineSafe(
  evt: { createdAtTick?: number; expiresAtTick?: number },
  currentTick: number,
): string {
  if (typeof evt.createdAtTick !== 'number' || typeof evt.expiresAtTick !== 'number') {
    return 'deadline unknown';
  }
  return formatRaidDeadline(
    { createdAtTick: evt.createdAtTick, expiresAtTick: evt.expiresAtTick } as RaidEvent,
    currentTick,
  );
}
