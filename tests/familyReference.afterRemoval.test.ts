/**
 * P7 — family reference coverage after permanent removal (`Roadmap_V0_6.4.1.MD` line 29):
 * "dedicated coverage verifies parent, child, partner, affair, and pregnancy references after
 * permanent removal."
 *
 * The removal path is driven, not simulated by hand: `killHuman`
 * (`humanLifecycleCleanup.ts`, re-exported by `dayCycle.ts:403`) owns the death cleanup, and the
 * tick calls it with a living `entityById` map (`tickLayerSystems.ts:450`, `worldEvents.ts:69`).
 * Two owners run alongside it and are called here for the same reason the tick calls them:
 *
 *   - `clearHuntersTargetingPrey` — `tickLayerSystems.ts:450-460` clears hunter targets right after
 *     `killHuman`, so no survivor keeps `huntTargetId` at the settler that just left the world.
 *   - recompacting `state.entities` to the living — the tick's own post-pass (`gameTick.ts:209-255`
 *     assigns `state.entities = allAlive`).
 *
 * Nothing in this file clears a reference by hand; every reference is cleared by the code that owns
 * it. `collectSimulationInvariantErrors` (`simulationInvariants.ts`) is reused for the invariants it
 * already owns (residence/workplace mirrors, pregnancy progress, leadership) and
 * {@link collectRemovalReferenceLeaks} covers the family/social/pet/hunt references it does not.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { TICKS_PER_DAY, killHuman } from '../src/game/dayCycle';
import { ensureEntityByIdMap, invalidateEntityByIdMap } from '../src/game/entityIndex';
import { clearHuntersTargetingPrey } from '../src/game/simulation/simulationEntities';
import { collectSimulationInvariantErrors } from '../src/game/simulation/simulationInvariants';
import { initGame } from '../src/game/worldGen';
import { resetSimRng } from '../src/game/simRng';
import { finishedBuilding, human } from '../src/test/factories';

const REMOVED_ID = 1;
const SPOUSE_ID = 2;
const CHILD_ID = 3;
const AFFAIR_ID = 4;
const PREGNANT_ID = 5;
const MOTHER_ID = 6;
const PET_ID = 7;
const HUNTER_ID = 8;
const CONTROL_ID = 9;
const CONTROL_CHILD_ID = 12;
const CONTROL_PET_ID = 14;

const HOUSE_ID = 10;
const CONTROL_HOUSE_ID = 11;
const FARM_ID = 20;

/** Removal tick; a colony day boundary so the grief window is a plain `TICKS_PER_DAY` multiple. */
const REMOVAL_TICK = TICKS_PER_DAY;

afterEach(() => {
  resetSimRng();
});

/** A tamed animal fixture: the shared settler base minus the settler job. */
function deer(id: number, overrides: Partial<Entity> = {}): Entity {
  return human(id, { type: EntityType.Deer, job: undefined, ...overrides });
}

/**
 * The references a permanently removed settler must stop appearing in.
 *
 * These are the fields `collectSimulationInvariantErrors` does not check: it validates the
 * building mirrors (`homeBuildingId`/`residenceBuildingId`/`prisonBuildingId`), pregnancy
 * *progress*, youth-love mutuality and the leader's residency — not whether a surviving settler
 * still points at an id that is gone from the world.
 */
const REMOVAL_REFERENCE_FIELDS = [
  'partnerId',
  'affairPartnerId',
  'courtshipPartnerId',
  'youthLovePartnerId',
  'pregnantById',
  'adoptiveMotherId',
  'adoptiveFatherId',
  'tamedBy',
  'huntTargetId',
] as const;

/** `"<entityId> <field>"` for every surviving entity still referencing `removedId`. */
function collectRemovalReferenceLeaks(survivors: readonly Entity[], removedId: number): string[] {
  const leaks: string[] = [];
  for (const survivor of survivors) {
    for (const field of REMOVAL_REFERENCE_FIELDS) {
      if (survivor[field] === removedId) leaks.push(`entity ${survivor.id} ${field}`);
    }
    if (survivor.childrenIds?.includes(removedId)) leaks.push(`entity ${survivor.id} childrenIds`);
  }
  return leaks;
}

interface RemovalFixture {
  state: WorldState;
  entityById: Map<number, Entity>;
  removed: Entity;
  spouse: Entity;
  child: Entity;
  lover: Entity;
  pregnantPartner: Entity;
  mother: Entity;
  pet: Entity;
  hunter: Entity;
  control: Entity;
  controlChild: Entity;
  controlPet: Entity;
  house: Building;
  controlHouse: Building;
  farm: Building;
}

/**
 * One world holding every survivor kind the P7 row names — a spouse, a parent of a minor child, a
 * pregnant partner, an affair partner — plus a pet and a hunter that point at the settler who dies,
 * and an unrelated household as the negative control.
 */
function buildRemovalFixture(): RemovalFixture {
  const removed = human(REMOVED_ID, {
    gender: 'male',
    age: 41,
    partnerId: SPOUSE_ID,
    relationshipStatus: 'married',
    affairPartnerId: AFFAIR_ID,
    affairProgress: 55,
    lastAffairSiteDay: 12,
    lastAffairSiteX: 300,
    lastAffairSiteY: 400,
    homeBuildingId: FARM_ID,
    residenceBuildingId: HOUSE_ID,
  });
  const spouse = human(SPOUSE_ID, {
    gender: 'female',
    age: 38,
    partnerId: REMOVED_ID,
    relationshipStatus: 'married',
    residenceBuildingId: HOUSE_ID,
  });
  // A minor with a living natural mother: the removal path must drop the dead adoptive father
  // (`ensureOrphanAdoption`, called from `reassignOrphansAfterDeath`).
  const child = human(CHILD_ID, {
    gender: 'female',
    age: 6,
    isJuvenile: true,
    motherId: SPOUSE_ID,
    fatherId: REMOVED_ID,
    adoptiveFatherId: REMOVED_ID,
    residenceBuildingId: HOUSE_ID,
  });
  const lover = human(AFFAIR_ID, {
    gender: 'female',
    age: 29,
    affairPartnerId: REMOVED_ID,
    affairProgress: 40,
    lastAffairSiteDay: 12,
    lastAffairSiteX: 300,
    lastAffairSiteY: 400,
  });
  const pregnantPartner = human(PREGNANT_ID, {
    gender: 'female',
    age: 27,
    pregnant: true,
    pregnancyDueProgress: 9,
    pregnantById: REMOVED_ID,
    relationshipStatus: 'expecting',
  });
  const mother = human(MOTHER_ID, { gender: 'female', age: 63, childrenIds: [REMOVED_ID] });
  const pet = deer(PET_ID, { tamedBy: REMOVED_ID });
  const hunter = human(HUNTER_ID, { huntTargetId: REMOVED_ID });

  // Negative control: a household that shares no reference with the removed settler.
  const control = human(CONTROL_ID, {
    gender: 'male',
    age: 45,
    residenceBuildingId: CONTROL_HOUSE_ID,
    childrenIds: [CONTROL_CHILD_ID],
  });
  const controlChild = human(CONTROL_CHILD_ID, {
    gender: 'male',
    age: 8,
    isJuvenile: true,
    fatherId: CONTROL_ID,
    residenceBuildingId: CONTROL_HOUSE_ID,
  });
  const controlPet = deer(CONTROL_PET_ID, { tamedBy: CONTROL_ID });

  const house = finishedBuilding(HOUSE_ID, BuildingType.House, {
    occupants: [REMOVED_ID, SPOUSE_ID, CHILD_ID],
  });
  const farm = finishedBuilding(FARM_ID, BuildingType.Farm, { occupants: [REMOVED_ID] });
  const controlHouse = finishedBuilding(CONTROL_HOUSE_ID, BuildingType.House, {
    occupants: [CONTROL_ID, CONTROL_CHILD_ID],
  });

  const state = initGame({ seed: 20261005 });
  state.tick = REMOVAL_TICK;
  state.villageLeaderId = null;
  state.entities = [
    removed,
    spouse,
    child,
    lover,
    pregnantPartner,
    mother,
    pet,
    hunter,
    control,
    controlChild,
    controlPet,
  ];
  state.buildings = [house, farm, controlHouse];
  // The canonical id map was built for `initGame`'s own entities; rebuild it for this fixture so
  // `killHuman`'s `entityById.delete` is observable on `state.entityById`.
  invalidateEntityByIdMap(state);
  const entityById = ensureEntityByIdMap(state);

  return {
    state,
    entityById,
    removed,
    spouse,
    child,
    lover,
    pregnantPartner,
    mother,
    pet,
    hunter,
    control,
    controlChild,
    controlPet,
    house,
    controlHouse,
    farm,
  };
}

/** Drive the production removal path for `removed` and leave `state` holding only the living. */
function runRemovalPath(fixture: RemovalFixture): void {
  const { state, removed, entityById } = fixture;
  killHuman(removed, state.buildings, entityById, state.tick);
  // The tick's other half of a death: `tickLayerSystems.ts:450-460`.
  clearHuntersTargetingPrey(removed.id, entityById);
  // The tick's post-pass: `state.entities = allAlive` (`gameTick.ts:209-255`).
  state.entities = state.entities.filter((entity) => entity.alive);
}

describe('family references after permanent removal (P7)', () => {
  it('leaves no survivor referencing the removed settler in any family, social, pet or hunt field', () => {
    const fixture = buildRemovalFixture();
    runRemovalPath(fixture);

    const survivors = fixture.state.entities.filter((entity) => entity.alive);
    expect(collectRemovalReferenceLeaks(survivors, REMOVED_ID)).toEqual([]);
  });

  it('drops the removed settler from entityById, entities and every building occupants list', () => {
    const fixture = buildRemovalFixture();
    runRemovalPath(fixture);
    const { state, entityById, removed } = fixture;

    expect(entityById.has(REMOVED_ID)).toBe(false);
    expect(state.entityById?.has(REMOVED_ID)).toBe(false);
    expect(state.entities.some((entity) => entity.id === REMOVED_ID)).toBe(false);
    expect(removed.alive).toBe(false);
    for (const building of state.buildings) {
      expect(building.occupants).not.toContain(REMOVED_ID);
    }
    // Residence and workplace mirrors name the survivors, not the settler that left.
    expect(fixture.house.occupants).toEqual([SPOUSE_ID, CHILD_ID]);
    expect(fixture.farm.occupants).toEqual([]);
  });

  it('unlinks each survivor from the removed settler and keeps what belongs to the living', () => {
    const fixture = buildRemovalFixture();
    runRemovalPath(fixture);

    // Spouse — widowed, no partner.
    expect(fixture.spouse.partnerId).toBeUndefined();
    expect(fixture.spouse.relationshipStatus).toBe('single');

    // Parent of a minor child — the dead adoptive father goes, the living mother stays custodian
    // and the child keeps its biological lineage and its home.
    expect(fixture.child.adoptiveFatherId).toBeUndefined();
    expect(fixture.child.adoptiveMotherId).toBeUndefined();
    expect(fixture.child.motherId).toBe(SPOUSE_ID);
    expect(fixture.child.fatherId).toBe(REMOVED_ID);
    expect(fixture.child.residenceBuildingId).toBe(HOUSE_ID);

    // Affair partner — the secret link and its progress/site go with the affair.
    expect(fixture.lover.affairPartnerId).toBeUndefined();
    expect(fixture.lover.affairProgress).toBe(0);
    expect(fixture.lover.lastAffairSiteDay).toBeUndefined();
    expect(fixture.lover.lastAffairSiteX).toBeUndefined();
    expect(fixture.lover.lastAffairSiteY).toBeUndefined();

    // Pregnant partner — the pregnancy survives, the father reference does not.
    expect(fixture.pregnantPartner.pregnant).toBe(true);
    expect(fixture.pregnantPartner.pregnancyDueProgress).toBe(9);
    expect(fixture.pregnantPartner.pregnantById).toBeUndefined();

    // A surviving parent's child list drops the settler that left the world.
    expect(fixture.mother.childrenIds).toEqual([]);

    // The tamed animal is released and the hunter loses its target.
    expect(fixture.pet.tamedBy).toBeUndefined();
    expect(fixture.hunter.huntTargetId).toBeUndefined();
  });

  it('satisfies the simulation governance invariants after the removal', () => {
    const fixture = buildRemovalFixture();
    runRemovalPath(fixture);

    expect(collectSimulationInvariantErrors(fixture.state)).toEqual([]);
  });

  it('leaves an unrelated household untouched (negative control)', () => {
    const fixture = buildRemovalFixture();
    const controlBefore = structuredClone(fixture.control);
    const controlPetBefore = structuredClone(fixture.controlPet);
    const controlHouseBefore = [...fixture.controlHouse.occupants];

    runRemovalPath(fixture);

    expect(fixture.control).toEqual(controlBefore);
    expect(fixture.controlPet).toEqual(controlPetBefore);
    expect(fixture.control.childrenIds).toEqual([CONTROL_CHILD_ID]);
    expect(fixture.control.residenceBuildingId).toBe(CONTROL_HOUSE_ID);
    expect(fixture.controlChild.fatherId).toBe(CONTROL_ID);
    expect(fixture.controlPet.tamedBy).toBe(CONTROL_ID);
    expect(fixture.controlHouse.occupants).toEqual(controlHouseBefore);
    expect(fixture.state.entityById?.get(CONTROL_ID)).toBe(fixture.control);
  });
});
