import { describe, expect, it } from 'vitest';
import { initGame } from '@/game/gameEngine';
import { assignIdleWorkerToBuilding } from '@/game/buildingActions';
import { BuildingType } from '@/game/gameTypes';
import { addCompletedBuilding } from '@/test/fixtures/gameFixtures';
import {
  dampScandalReputationLoss,
  getRefugeeWelcomeBonus,
  getTownHallGovernanceEfficiency,
  getTownHallImmigrationMultiplier,
  getTownHallTradeMultiplier,
  hostTownFestival,
  isTownHallStaffed,
  tickTownHallCivic,
} from '@/game/townHall';
import { isPlayerHuman } from '@/game/groupEvents';

function addStaffedTownHall(
  state: ReturnType<typeof initGame>,
  officialId: number,
): ReturnType<typeof initGame> {
  addCompletedBuilding(state, BuildingType.TownHall, 77, 200, 200);
  return assignIdleWorkerToBuilding(state, 77, officialId);
}

describe('townHall civic system', () => {
  it('detects staffed town hall', () => {
    let state = initGame();
    expect(isTownHallStaffed(state.buildings)).toBe(false);
    const official = state.entities.find((e) => e.alive && isPlayerHuman(e))!;
    state = addStaffedTownHall(state, official.id);
    expect(isTownHallStaffed(state.buildings)).toBe(true);
  });

  it('boosts trade and immigration when staffed', () => {
    let state = initGame();
    const official = state.entities.find((e) => e.alive && isPlayerHuman(e))!;
    state = addStaffedTownHall(state, official.id);
    expect(getTownHallTradeMultiplier(state, state.buildings)).toBeGreaterThan(1);
    expect(getTownHallImmigrationMultiplier(state.buildings)).toBeGreaterThan(1);
  });

  it('dampens scandal reputation loss when staffed', () => {
    let state = initGame();
    const official = state.entities.find((e) => e.alive && isPlayerHuman(e))!;
    state = addStaffedTownHall(state, official.id);
    expect(dampScandalReputationLoss(-8, state.buildings)).toBeGreaterThan(-8);
    expect(dampScandalReputationLoss(-8, [])).toBe(-8);
  });

  it('grants refugee welcome bonus when staffed', () => {
    let state = initGame();
    expect(getRefugeeWelcomeBonus(state.buildings)).toBe(0);
    const official = state.entities.find((e) => e.alive && isPlayerHuman(e))!;
    state = addStaffedTownHall(state, official.id);
    expect(getRefugeeWelcomeBonus(state.buildings)).toBe(1);
  });

  it('collects taxes and reputation on civic tick', () => {
    let state = initGame();
    const official = state.entities.find((e) => e.alive && isPlayerHuman(e))!;
    state = addStaffedTownHall(state, official.id);
    const hall = state.buildings.find((b) => b.type === BuildingType.TownHall)!;
    const humans = state.entities.filter((e) => e.alive && isPlayerHuman(e));
    const repBefore = state.villageReputation;
    const goldBefore = state.resources.gold;
    tickTownHallCivic(state, hall, humans);
    expect(state.villageReputation).toBeGreaterThan(repBefore);
    expect(state.resources.gold).toBeGreaterThan(goldBefore);
  });

  it('ignores dead village leader for governance bonus', () => {
    let state = initGame();
    const leader = state.entities.find((e) => e.alive && isPlayerHuman(e))!;
    state = addStaffedTownHall(state, leader.id);
    state.villageLeaderId = leader.id;
    const livingBonus = getTownHallGovernanceEfficiency(state, state.buildings);
    const leaderInState = state.entities.find((e) => e.id === leader.id)!;
    leaderInState.alive = false;
    const deadBonus = getTownHallGovernanceEfficiency(state, state.buildings);
    expect(deadBonus).toBeLessThan(livingBonus);
  });

  it('can host a town festival when staffed and stocked', () => {
    let state = initGame();
    const official = state.entities.find((e) => e.alive && isPlayerHuman(e))!;
    state = addStaffedTownHall(state, official.id);
    state.resources.food = 100;
    state.resources.gold = 100;
    state = hostTownFestival(state, 77);
    expect(state.festival?.active).toBe(true);
    expect(state.festival?.name).toContain('Town Hall');
  });

  it('does not materialize undefined skill keys when assigning an official', () => {
    let state = initGame();
    const official = state.entities.find((e) => e.alive && isPlayerHuman(e))!;
    delete official.skills;
    state = addStaffedTownHall(state, official.id);
    expect(official.skills).toBeUndefined();
  });
});