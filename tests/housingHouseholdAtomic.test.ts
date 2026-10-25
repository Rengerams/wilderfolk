/**
 * Two boundaries of the housing authority: a household relocation is all or nothing, and the manor
 * hold decides as the sweep's first phase rather than in a run of its own.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { building, human } from '../src/test/factories';
import {
  assignMissingResidences,
  relocateHousehold,
  standaloneMoveContext,
} from '../src/game/residencyReconciliation';
import { applyLeaderHousePhase, collectLeaderHousehold } from '../src/game/leaderHouse';

const MANOR_ID = 0;
const COTTAGE_ID = 1;
const SPARE_ID = 2;
const LEADER_ID = 1;

interface ManorWorld {
  state: WorldState;
  guest: Entity;
  leader: Entity;
  spouse: Entity;
  child: Entity;
}

/** A leader household waiting in a cottage, and — when `guestInManor` — an outsider squatting the manor. */
function manorWorld(guestInManor: boolean): ManorWorld {
  const leader = human(LEADER_ID, { partnerId: 2, childrenIds: [3], residenceBuildingId: COTTAGE_ID });
  const spouse = human(2, { partnerId: 1, childrenIds: [3], residenceBuildingId: COTTAGE_ID });
  const child = human(3, { motherId: 2, fatherId: 1, isJuvenile: true, age: 6, residenceBuildingId: COTTAGE_ID });
  const guest = human(4, { residenceBuildingId: guestInManor ? MANOR_ID : undefined });
  const manor = building(MANOR_ID, BuildingType.LeaderHouse, { occupants: guestInManor ? [guest.id] : [] });
  const cottage = building(COTTAGE_ID, BuildingType.House, { occupants: guestInManor ? [1, 2, 3] : [] });
  const state = {
    entities: [leader, spouse, child, guest],
    buildings: [manor, cottage],
    villageLeaderId: LEADER_ID,
    eventLog: [],
    tick: 0,
    year: 0,
    dayInYear: 1,
  } as unknown as WorldState;
  return { state, guest, leader, spouse, child };
}

/** One assignment pulse as the layer runs it: the sweep, with the manor hold as its first phase. */
function sweep(world: WorldState) {
  const protectedIds = new Set(collectLeaderHousehold(world).map((person) => person.id));
  const eligible = world.entities.filter((person) => person.alive && !protectedIds.has(person.id));
  return assignMissingResidences(
    eligible, world.buildings, world.entities, undefined, undefined,
    (ledger) => { applyLeaderHousePhase(world, ledger); },
  );
}

describe('a whole-household relocation is all or nothing', () => {
  it('cancels every move when one member may not leave the Leader\u2019s House', () => {
    const manor = building(MANOR_ID, BuildingType.LeaderHouse, { occupants: [1] });
    const cottage = building(COTTAGE_ID, BuildingType.House, { occupants: [2] });
    const spare = building(SPARE_ID, BuildingType.House);
    const guest = human(1, { residenceBuildingId: MANOR_ID });
    const host = human(2, { residenceBuildingId: COTTAGE_ID });
    const context = standaloneMoveContext([guest, host], [manor, cottage, spare]);

    const moved = relocateHousehold([guest, host], SPARE_ID, 'capacity', 'family', context);

    expect(moved).toBe(false);
    expect(guest.residenceBuildingId).toBe(MANOR_ID);
    expect(host.residenceBuildingId).toBe(COTTAGE_ID);
    expect(spare.occupants).toEqual([]);
    expect(context.occupancy.get(SPARE_ID) ?? 0).toBe(0);
    expect(context.ledger.report.relocations).toEqual([]);
  });

  it('still moves the whole household when nobody is protected', () => {
    const cottage = building(COTTAGE_ID, BuildingType.House, { occupants: [1, 2] });
    const spare = building(SPARE_ID, BuildingType.House);
    const first = human(1, { residenceBuildingId: COTTAGE_ID });
    const second = human(2, { residenceBuildingId: COTTAGE_ID });
    const context = standaloneMoveContext([first, second], [cottage, spare]);

    const moved = relocateHousehold([first, second], SPARE_ID, 'capacity', 'family', context);

    expect(moved).toBe(true);
    expect([first, second].every((member) => member.residenceBuildingId === SPARE_ID)).toBe(true);
    expect(context.ledger.report.relocations).toHaveLength(1);
  });
});

describe('the manor hold inside the assignment sweep', () => {
  it('moves the leader household into the manor as the first phase', () => {
    const { state, leader, spouse, child } = manorWorld(false);

    const report = sweep(state);

    expect([leader, spouse, child].every((member) => member.residenceBuildingId === MANOR_ID)).toBe(true);
    expect(report.relocations[0]?.phase).toBe('leader');
    expect(report.violations).toEqual([]);
  });

  it('evicts the outsider and seats them in the home the household left behind', () => {
    const { state, guest, leader } = manorWorld(true);

    const report = sweep(state);

    expect(leader.residenceBuildingId).toBe(MANOR_ID);
    expect(guest.residenceBuildingId).toBe(COTTAGE_ID);
    expect(report.relocations[0]?.phase).toBe('leader');
    expect(report.violations).toEqual([]);
  });

  it('repeats nothing on a second pulse', () => {
    const { state, leader, guest } = manorWorld(true);
    sweep(state);
    const settled = state.entities.map((person) => person.residenceBuildingId);

    const second = sweep(state);

    expect(second.relocations).toEqual([]);
    expect(state.entities.map((person) => person.residenceBuildingId)).toEqual(settled);
    expect(leader.residenceBuildingId).toBe(MANOR_ID);
    expect(guest.residenceBuildingId).toBe(COTTAGE_ID);
  });
});
