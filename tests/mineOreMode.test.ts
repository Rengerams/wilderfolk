/**
 * Mine ore modes — a Mine extracts **iron or gold** (chosen per mine) and stone
 * belongs to the Quarry, and the Mine is buildable from the first day (no
 * research gate). Both hazards are pinned here: a legacy save that stored the
 * removed `stone` mode, and a command that still sends it.
 */
import { describe, expect, it } from 'vitest';
import { BUILDING_CONFIGS, MINE_ORES, mineOreForMode } from '../src/game/buildings';
import { BuildingType } from '../src/game/gameTypes';
import { isWorkerCommand, WORKER_CMD_PROTO } from '../src/game/simWorker/commands';

describe('mine ore modes', () => {
  it('offers iron and gold only — stone is the Quarry', () => {
    expect([...MINE_ORES]).toEqual(['iron', 'gold']);
    expect(BUILDING_CONFIGS[BuildingType.Quarry].description).toBe('Produces stone.');
  });

  it('extracts iron unless gold was chosen, including a legacy stone save', () => {
    expect(mineOreForMode(undefined)).toBe('iron');
    expect(mineOreForMode('iron')).toBe('iron');
    expect(mineOreForMode('gold')).toBe('gold');
    // Saves written while the Mine still had a `stone` mode must not mint gold.
    expect(mineOreForMode('stone')).toBe('iron');
  });

  it('is buildable from the start, and only ore modes pass command validation', () => {
    expect(BUILDING_CONFIGS[BuildingType.Mine].unlockRequirement).toBeUndefined();
    // The research gate itself still exists for the buildings that keep one.
    expect(BUILDING_CONFIGS[BuildingType.Mill].unlockRequirement).toBe('agriculture_2');

    expect(isWorkerCommand({ proto: WORKER_CMD_PROTO, op: 'setMineMode', buildingId: 2, mode: 'gold' })).toBe(true);
    expect(isWorkerCommand({ proto: WORKER_CMD_PROTO, op: 'setMineMode', buildingId: 2, mode: 'iron' })).toBe(true);
    expect(isWorkerCommand({ proto: WORKER_CMD_PROTO, op: 'setMineMode', buildingId: 2, mode: 'stone' })).toBe(false);
  });
});
