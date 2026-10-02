/**
 * Simulation-invariants golden master — the TypeScript oracle for the Godot port.
 *
 * Emits `WorldState` snapshots together with the exact string list
 * `collectSimulationInvariantErrors` produces for each one. The GDScript port
 * asserts on the **strings**, not on a boolean: a collector that reports the
 * right number of violations for the wrong reasons is a port that is wrong, and
 * a boolean cannot tell the two apart.
 *
 * The scenarios are built from a real `initGame` world (seed 4242, Medium map)
 * rather than from hand-written literals, so the baseline exercises the same
 * record shape the live game produces — including the fields this collector
 * reads but that a hand-written fixture would forget to include.
 *
 * Each scenario deep-clones the baseline and applies exactly the mutation it is
 * named for. The expected error list is whatever the real collector says
 * afterwards, which is the point: this file never guesses what the rule does.
 *
 * Every world is round-tripped through `JSON.parse(JSON.stringify(...))` before
 * it is measured and emitted, so the recorded errors are the errors the port
 * will see after Godot's JSON parser has had its way with the same bytes — in
 * particular, every number becomes a float on the GDScript side, and an
 * `undefined` field disappears entirely.
 *
 * Run:  npx tsx scripts/dump-sim-invariants.mts [outputPath]
 */
import { writeFileSync } from 'node:fs';
import { initGame } from '../src/game/worldGen';
import { collectSimulationInvariantErrors } from '../src/game/simulation/simulationInvariants';
import { BuildingType } from '../src/game/buildings';
import { EntityType, MapSize } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';

/** A `WorldState` that has been through JSON, which is what the port receives. */
type JsonWorld = WorldState;

interface Case {
  name: string;
  note: string;
  world: JsonWorld;
}

function roundTrip(world: WorldState): JsonWorld {
  return JSON.parse(JSON.stringify(world)) as JsonWorld;
}

function clone(world: JsonWorld): JsonWorld {
  return JSON.parse(JSON.stringify(world)) as JsonWorld;
}

function human(world: JsonWorld, id: number): Entity {
  const found = world.entities.find((e) => e.id === id);
  if (!found) throw new Error(`scenario fixture error: no entity ${id}`);
  return found;
}

function building(world: JsonWorld, id: number): Building {
  const found = world.buildings.find((b) => b.id === id);
  if (!found) throw new Error(`scenario fixture error: no building ${id}`);
  return found;
}

/** The founders `initGame` seeds — the only humans a fresh world owns. */
function founders(world: JsonWorld): Entity[] {
  return world.entities.filter((e) => e.type === EntityType.Human && e.alive);
}

// ---------------------------------------------------------------------------
// Projection — trim a world to exactly the fields the collector reads.
// ---------------------------------------------------------------------------
//
// The raw baseline is ~230 MB of JSON: a Medium map carries a `worldMap` with two
// 1 200-cell terrain grids, and 434 entities of which all but two are trees,
// grass and wildlife. None of it reaches the collector. Shipping it would make
// the gate unreadable and slow for no signal.
//
// The projection is a *claim*, so it is checked rather than trusted:
// `projectWorld` is asserted to leave `collectSimulationInvariantErrors`
// unchanged, case by case, before anything is written. A field the collector
// needs but this list omits is therefore a build failure, not a silent
// divergence in the port.

/** Entity fields `simulationInvariants` reads. Adding one here is a deliberate act. */
const ENTITY_FIELDS = [
  'id', 'type', 'alive', 'faction', 'isJuvenile', 'age', 'birthYear', 'birthDay',
  // assignment fields (both directions)
  'homeBuildingId', 'residenceBuildingId', 'prisonBuildingId',
  // settler-relationship identity
  'moonHowlerCursed',
  // youth love
  'youthLovePartnerId', 'partnerId',
  // pregnancy
  'pregnant', 'pregnancyDueProgress', 'pregnantById',
  // leader
  'occupation',
] as const;

/** Building fields `simulationInvariants` reads. */
const BUILDING_FIELDS = ['id', 'type', 'completed', 'occupants', 'faction'] as const;

/** WorldState fields `simulationInvariants` reads. */
const WORLD_FIELDS = ['entities', 'buildings', 'year', 'dayInYear', 'tick', 'villageLeaderId'] as const;

function pick<T extends object>(source: T, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = (source as Record<string, unknown>)[field];
    // `undefined` is dropped: on the GDScript side the key is then simply absent,
    // which is what `entity.homeBuildingId == null` already covers.
    if (value !== undefined) out[field] = value;
  }
  return out;
}

/**
 * Entities worth keeping: a settler-relationship entity, or one referenced by a
 * settler. Everything else — trees, grass, wildlife — cannot appear in a
 * violation message, because the collector only ever iterates settlers it
 * already found and the ids their own fields point at.
 */
function keepEntity(entity: Record<string, unknown>): boolean {
  if (entity.type === EntityType.Human) return true;
  return entity.type === EntityType.Werewolf && entity.moonHowlerCursed === true;
}

function projectWorld(world: JsonWorld): JsonWorld {
  const kept = new Set<unknown>();
  for (const entity of world.entities) {
    const record = entity as unknown as Record<string, unknown>;
    if (keepEntity(record)) kept.add(record.id);
  }
  // Closure over references: a violation message can name an id that is not a
  // settler (a Rabbit sweetheart, a dead cursed settler), and that entity must
  // stay resolvable or the port would report "missing entity" where the oracle
  // reported something else.
  const byId = new Map<unknown, Record<string, unknown>>();
  for (const entity of world.entities) {
    byId.set((entity as unknown as Record<string, unknown>).id, entity as unknown as Record<string, unknown>);
  }
  const referenceFields = [
    'youthLovePartnerId', 'partnerId', 'homeBuildingId', 'residenceBuildingId', 'prisonBuildingId',
  ];
  let grew = true;
  while (grew) {
    grew = false;
    for (const entity of world.entities) {
      const record = entity as unknown as Record<string, unknown>;
      if (!kept.has(record.id)) continue;
      for (const field of referenceFields) {
        const target = record[field];
        if (target == null || kept.has(target)) continue;
        if (!byId.has(target)) continue;
        kept.add(target);
        grew = true;
      }
    }
  }

  const projected = pick(world, WORLD_FIELDS) as unknown as JsonWorld;
  projected.entities = world.entities
    .filter((e) => kept.has((e as unknown as Record<string, unknown>).id))
    .map((e) => pick(e as unknown as object, ENTITY_FIELDS) as unknown as Entity);
  projected.buildings = world.buildings.map(
    (b) => pick(b as unknown as object, BUILDING_FIELDS) as unknown as Building,
  );
  return projected;
}

// ---------------------------------------------------------------------------
// Baseline: a real fresh colony.
// ---------------------------------------------------------------------------

const baseline = roundTrip(initGame({ size: MapSize.Medium, seed: 4242 }));
const baselineFounders = founders(baseline);

if (baselineFounders.length === 0) {
  throw new Error('baseline world has no living founders — the fixture is meaningless');
}

// A completed House is appended so residence rules have an owner to point at.
// `initGame` starts with `buildings: []` (generation never adds one), so there is
// no house to borrow.
function withHouse(world: JsonWorld, id: number, x = 10, y = 10): Building {
  const house: Building = {
    id,
    type: BuildingType.House,
    x,
    y,
    width: 2,
    height: 2,
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
  };
  world.buildings.push(house);
  return house;
}

// A completed Farm, for the workplace rules.
function withFarm(world: JsonWorld, id: number, x = 30, y = 30): Building {
  const farm: Building = {
    id,
    type: BuildingType.Farm,
    x,
    y,
    width: 3,
    height: 2,
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
  };
  world.buildings.push(farm);
  return farm;
}

// ---------------------------------------------------------------------------
// Scenarios.
// ---------------------------------------------------------------------------

const cases: Case[] = [];

function add(name: string, note: string, build: (world: JsonWorld) => void): void {
  const world = clone(baseline);
  build(world);
  cases.push({ name, note, world: roundTrip(world) });
}

// ---- clean --------------------------------------------------------------

cases.push({
  name: 'baseline_clean',
  note: 'A real fresh colony, untouched. Expect zero violations.',
  world: baseline,
});

// ---- occupants references ----------------------------------------------

add('occupants_missing_entity', 'A workplace lists an entity id that does not exist.', (w) => {
  const farm = withFarm(w, 9000);
  farm.occupants.push(999999);
});

add('occupants_dead_entity', 'A workplace lists a dead entity.', (w) => {
  const victim = baselineFounders[0];
  human(w, victim.id).alive = false;
  const farm = withFarm(w, 9000);
  farm.occupants.push(victim.id);
});

// ---- workplace ----------------------------------------------------------

add('workplace_home_mismatch', 'Listed in a workplace but homeBuildingId points elsewhere.', (w) => {
  const worker = baselineFounders[0];
  const farm = withFarm(w, 9000);
  farm.occupants.push(worker.id);
  human(w, worker.id).homeBuildingId = 12345;
});

add('workplace_two_workplaces', 'One human listed in two different workplaces.', (w) => {
  const worker = baselineFounders[0];
  const farmA = withFarm(w, 9000, 30, 30);
  const farmB = withFarm(w, 9001, 60, 60);
  farmA.occupants.push(worker.id);
  farmB.occupants.push(worker.id);
  human(w, worker.id).homeBuildingId = farmA.id;
});

add('workplace_same_id_twice', 'The same human listed twice in ONE workplace — the oracle accepts this.', (w) => {
  const worker = baselineFounders[0];
  const farm = withFarm(w, 9000);
  farm.occupants.push(worker.id);
  farm.occupants.push(worker.id);
  human(w, worker.id).homeBuildingId = farm.id;
});

// ---- crew ---------------------------------------------------------------

add('crew_holds_workplace', 'On a construction crew while also holding a workplace.', (w) => {
  const worker = baselineFounders[0];
  const farm = withFarm(w, 9000);
  const site: Building = {
    id: 9001, type: BuildingType.TownHall, x: 50, y: 50, width: 4, height: 4,
    occupants: [worker.id], level: 1, constructionProgress: 40, completed: false,
    health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
  };
  w.buildings.push(site);
  human(w, worker.id).homeBuildingId = farm.id;
});

add('crew_two_crews', 'On two different construction crews.', (w) => {
  const worker = baselineFounders[0];
  const siteA: Building = {
    id: 9001, type: BuildingType.TownHall, x: 50, y: 50, width: 4, height: 4,
    occupants: [worker.id], level: 1, constructionProgress: 40, completed: false,
    health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
  };
  const siteB: Building = {
    id: 9002, type: BuildingType.Market, x: 70, y: 70, width: 4, height: 4,
    occupants: [worker.id], level: 1, constructionProgress: 10, completed: false,
    health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
  };
  w.buildings.push(siteA);
  w.buildings.push(siteB);
});

// ---- residence ----------------------------------------------------------

add('residence_mismatch', 'Listed in a residence but residenceBuildingId points elsewhere.', (w) => {
  const resident = baselineFounders[0];
  const house = withHouse(w, 9000);
  house.occupants.push(resident.id);
  human(w, resident.id).residenceBuildingId = 12345;
});

add('residence_two_residences', 'One human listed in two different residences.', (w) => {
  const resident = baselineFounders[0];
  const houseA = withHouse(w, 9000, 10, 10);
  const houseB = withHouse(w, 9001, 20, 20);
  houseA.occupants.push(resident.id);
  houseB.occupants.push(resident.id);
  human(w, resident.id).residenceBuildingId = houseA.id;
});

// ---- prison -------------------------------------------------------------

add('prison_neither', 'In a prison occupants list as neither prisoner nor guard.', (w) => {
  const person = baselineFounders[0];
  const prison: Building = {
    id: 9000, type: BuildingType.Prison, x: 90, y: 90, width: 3, height: 3,
    occupants: [person.id], level: 1, constructionProgress: 100, completed: true,
    health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
  };
  w.buildings.push(prison);
});

add('prison_valid_prisoner_and_guard', 'A valid prisoner and a valid guard — expect no violation.', (w) => {
  const prisoner = baselineFounders[0];
  const guard = baselineFounders[1];
  const prison: Building = {
    id: 9000, type: BuildingType.Prison, x: 90, y: 90, width: 3, height: 3,
    occupants: [prisoner.id, guard.id], level: 1, constructionProgress: 100, completed: true,
    health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
  };
  w.buildings.push(prison);
  human(w, prisoner.id).prisonBuildingId = prison.id;
  human(w, guard.id).homeBuildingId = prison.id;
});

// ---- no-occupant buildings ---------------------------------------------

add('none_role_has_occupant', 'A road lists an occupant; roads must be empty.', (w) => {
  const person = baselineFounders[0];
  const road: Building = {
    id: 9000, type: BuildingType.Road, x: 5, y: 5, width: 1, height: 1,
    occupants: [person.id], level: 1, constructionProgress: 100, completed: true,
    health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
  };
  w.buildings.push(road);
});

// ---- reverse references -------------------------------------------------

add('home_missing_building', 'homeBuildingId references a demolished/missing building.', (w) => {
  human(w, baselineFounders[0].id).homeBuildingId = 987654;
});

add('home_not_a_workplace', 'homeBuildingId points at a completed House — not a workplace.', (w) => {
  const person = baselineFounders[0];
  const house = withHouse(w, 9000);
  human(w, person.id).homeBuildingId = house.id;
});

add('home_incomplete_workplace', 'homeBuildingId points at an incomplete Farm.', (w) => {
  const person = baselineFounders[0];
  const site: Building = {
    id: 9000, type: BuildingType.Farm, x: 30, y: 30, width: 3, height: 2,
    occupants: [person.id], level: 1, constructionProgress: 50, completed: false,
    health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
  };
  w.buildings.push(site);
  human(w, person.id).homeBuildingId = site.id;
});

add('home_missing_from_occupants', 'homeBuildingId is a real workplace that does not list the worker.', (w) => {
  const person = baselineFounders[0];
  const farm = withFarm(w, 9000);
  human(w, person.id).homeBuildingId = farm.id;
});

add('residence_missing_building', 'residenceBuildingId references a demolished/missing building.', (w) => {
  human(w, baselineFounders[0].id).residenceBuildingId = 987654;
});

add('residence_not_a_residence', 'residenceBuildingId points at a completed Farm.', (w) => {
  const person = baselineFounders[0];
  const farm = withFarm(w, 9000);
  human(w, person.id).residenceBuildingId = farm.id;
});

add('residence_missing_from_occupants', 'residenceBuildingId is a real house that does not list the resident.', (w) => {
  const person = baselineFounders[0];
  const house = withHouse(w, 9000);
  human(w, person.id).residenceBuildingId = house.id;
});

add('prison_missing_building', 'prisonBuildingId references a demolished/missing building.', (w) => {
  human(w, baselineFounders[0].id).prisonBuildingId = 987654;
});

add('prison_not_a_prison', 'prisonBuildingId points at a completed Farm.', (w) => {
  const person = baselineFounders[0];
  const farm = withFarm(w, 9000);
  human(w, person.id).prisonBuildingId = farm.id;
});

add('prison_missing_from_occupants', 'prisonBuildingId is a real prison that does not list the prisoner.', (w) => {
  const person = baselineFounders[0];
  const prison: Building = {
    id: 9000, type: BuildingType.Prison, x: 90, y: 90, width: 3, height: 3,
    occupants: [], level: 1, constructionProgress: 100, completed: true,
    health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
  };
  w.buildings.push(prison);
  human(w, person.id).prisonBuildingId = prison.id;
});

// ---- youth love --------------------------------------------------------

add('youth_love_missing_partner', 'youthLovePartnerId references a missing entity.', (w) => {
  human(w, baselineFounders[0].id).youthLovePartnerId = 987654;
});

add('youth_love_not_mutual', 'The sweetheart does not point back.', (w) => {
  const a = human(w, baselineFounders[0].id);
  const b = human(w, baselineFounders[1].id);
  a.youthLovePartnerId = b.id;
  b.youthLovePartnerId = undefined;
});

add('youth_love_partner_is_an_animal', 'The sweetheart is a living Rabbit — not a settler relationship entity.', (w) => {
  const a = human(w, baselineFounders[0].id);
  const rabbit: Entity = {
    id: 9000, type: EntityType.Rabbit, x: 5, y: 5, energy: 10, maxEnergy: 10,
    age: 1, birthYear: 0, birthMonth: 0, birthDay: 0, maxAge: 10, speed: 1, size: 4,
    vx: 0, vy: 0, reproductionCooldown: 0, alive: true, flash: 0, isJuvenile: false,
  };
  w.entities.push(rabbit);
  a.youthLovePartnerId = rabbit.id;
});

add('youth_love_and_adult_partner', 'Both a youth-love partner and an adult partner.', (w) => {
  const a = human(w, baselineFounders[0].id);
  const b = human(w, baselineFounders[1].id);
  a.youthLovePartnerId = b.id;
  b.youthLovePartnerId = a.id;
  a.partnerId = b.id;
});

// ---- pregnancy ----------------------------------------------------------

add('pregnant_without_due', 'Pregnant with no pregnancyDueProgress at all.', (w) => {
  const person = human(w, baselineFounders[0].id);
  person.pregnant = true;
  person.pregnancyDueProgress = undefined;
});

add('pregnant_with_zero_due', 'Pregnant with pregnancyDueProgress 0.', (w) => {
  const person = human(w, baselineFounders[0].id);
  person.pregnant = true;
  person.pregnancyDueProgress = 0;
});

add('pregnant_valid', 'Pregnant with a valid due progress — expect no violation.', (w) => {
  const person = human(w, baselineFounders[0].id);
  person.pregnant = true;
  person.pregnancyDueProgress = 12;
});

add('not_pregnant_retains_due', 'Not pregnant but retains pregnancyDueProgress.', (w) => {
  const person = human(w, baselineFounders[0].id);
  person.pregnant = false;
  person.pregnancyDueProgress = 12;
});

add('not_pregnant_retains_father', 'Not pregnant but retains pregnantById.', (w) => {
  const person = human(w, baselineFounders[0].id);
  person.pregnant = false;
  person.pregnantById = baselineFounders[1].id;
});

// ---- moon howler --------------------------------------------------------

add('two_moon_howlers', 'Two living cursed entities — at most one is allowed.', (w) => {
  const a = human(w, baselineFounders[0].id);
  const b = human(w, baselineFounders[1].id);
  a.moonHowlerCursed = true;
  b.moonHowlerCursed = true;
});

add('one_moon_howler_is_fine', 'One living cursed entity — expect no violation.', (w) => {
  human(w, baselineFounders[0].id).moonHowlerCursed = true;
});

add('cursed_but_dead_is_fine', 'Two cursed entities, one of them dead — expect no violation.', (w) => {
  const a = human(w, baselineFounders[0].id);
  const b = human(w, baselineFounders[1].id);
  a.moonHowlerCursed = true;
  b.moonHowlerCursed = true;
  b.alive = false;
});

// ---- leader -------------------------------------------------------------

add('leader_missing_entity', 'villageLeaderId references a missing entity.', (w) => {
  w.villageLeaderId = 987654;
});

add('leader_is_dead', 'villageLeaderId references a dead settler.', (w) => {
  const person = human(w, baselineFounders[0].id);
  person.alive = false;
  w.villageLeaderId = person.id;
});

add('leader_is_juvenile', 'villageLeaderId references a juvenile.', (w) => {
  const person = human(w, baselineFounders[0].id);
  person.isJuvenile = true;
  w.villageLeaderId = person.id;
});

add('leader_is_foreign', 'villageLeaderId references an entity of a foreign faction.', (w) => {
  const person = human(w, baselineFounders[0].id);
  person.faction = 'visitor';
  w.villageLeaderId = person.id;
});

add('leader_wrong_occupation', 'A valid acting head that does not hold the leader occupation.', (w) => {
  const person = human(w, baselineFounders[0].id);
  person.occupation = 'farmer';
  w.villageLeaderId = person.id;
});

add('leader_occupation_only', 'Valid head, leader occupation, but no Leader House exists — expect no manor violation.', (w) => {
  const person = human(w, baselineFounders[0].id);
  person.occupation = 'leader';
  w.villageLeaderId = person.id;
});

add('leader_not_in_manor', "A completed Leader House exists and the leader does not live in it.", (w) => {
  const person = human(w, baselineFounders[0].id);
  person.occupation = 'leader';
  person.residenceBuildingId = undefined;
  w.villageLeaderId = person.id;
  const manor: Building = {
    id: 9000, type: BuildingType.LeaderHouse, x: 12, y: 12, width: 3, height: 3,
    occupants: [], level: 1, constructionProgress: 100, completed: true,
    health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
  };
  w.buildings.push(manor);
});

add('leader_resident_in_manor_is_fine', 'Leader housed in the completed Leader House — expect no violation.', (w) => {
  const person = human(w, baselineFounders[0].id);
  person.occupation = 'leader';
  w.villageLeaderId = person.id;
  const manor: Building = {
    id: 9000, type: BuildingType.LeaderHouse, x: 12, y: 12, width: 3, height: 3,
    occupants: [person.id], level: 1, constructionProgress: 100, completed: true,
    health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
  };
  w.buildings.push(manor);
  person.residenceBuildingId = manor.id;
});

add('leader_manor_is_rivals', "The only Leader House belongs to a rival, so the manor rule does not fire.", (w) => {
  const person = human(w, baselineFounders[0].id);
  person.occupation = 'leader';
  person.residenceBuildingId = undefined;
  w.villageLeaderId = person.id;
  const manor: Building = {
    id: 9000, type: BuildingType.LeaderHouse, x: 12, y: 12, width: 3, height: 3,
    occupants: [], level: 1, constructionProgress: 100, completed: true,
    health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0, faction: 'rival',
  };
  w.buildings.push(manor);
});

add('leader_manor_unfinished', 'The only Leader House is incomplete, so the manor rule does not fire.', (w) => {
  const person = human(w, baselineFounders[0].id);
  person.occupation = 'leader';
  person.residenceBuildingId = undefined;
  w.villageLeaderId = person.id;
  const manor: Building = {
    id: 9000, type: BuildingType.LeaderHouse, x: 12, y: 12, width: 3, height: 3,
    occupants: [], level: 1, constructionProgress: 30, completed: false,
    health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
  };
  w.buildings.push(manor);
});

add('leader_imprisoned_is_exempt', 'An imprisoned leader is exempt from the manor residency rule.', (w) => {
  const person = human(w, baselineFounders[0].id);
  person.occupation = 'leader';
  w.villageLeaderId = person.id;
  const prison: Building = {
    id: 9001, type: BuildingType.Prison, x: 90, y: 90, width: 3, height: 3,
    occupants: [person.id], level: 1, constructionProgress: 100, completed: true,
    health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
  };
  const manor: Building = {
    id: 9000, type: BuildingType.LeaderHouse, x: 12, y: 12, width: 3, height: 3,
    occupants: [], level: 1, constructionProgress: 100, completed: true,
    health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
  };
  w.buildings.push(prison);
  w.buildings.push(manor);
  person.prisonBuildingId = prison.id;
  person.residenceBuildingId = undefined;
});

add('leader_vacant_office', 'villageLeaderId is an explicit null — a vacant office, not a violation.', (w) => {
  w.villageLeaderId = null;
});

add('leader_key_absent', 'The villageLeaderId key is removed entirely — the caller cannot say.', (w) => {
  delete (w as Partial<WorldState>).villageLeaderId;
});

add('leader_werewolf_form', 'The leader is a cursed Werewolf in form — acting head, but no residence check.', (w) => {
  // `transformToWerewolfForm` parks the live residency in `moonHowlerSaved`; the
  // collector must exempt the form, exactly as `isActingVillageHead` exempts the office.
  const person = human(w, baselineFounders[0].id);
  person.type = EntityType.Werewolf;
  person.moonHowlerCursed = true;
  person.occupation = 'leader';
  person.residenceBuildingId = undefined;
  w.villageLeaderId = person.id;
  const manor: Building = {
    id: 9000, type: BuildingType.LeaderHouse, x: 12, y: 12, width: 3, height: 3,
    occupants: [], level: 1, constructionProgress: 100, completed: true,
    health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
  };
  w.buildings.push(manor);
});

// ---- one world, many violations (order matters) -------------------------

add('stacked_violations', 'Several unrelated violations at once, to pin the report ORDER.', (w) => {
  const a = human(w, baselineFounders[0].id);
  const b = human(w, baselineFounders[1].id);
  const house = withHouse(w, 9000);
  const farm = withFarm(w, 9001);
  house.occupants.push(a.id);
  a.residenceBuildingId = 987654;
  farm.occupants.push(b.id);
  a.homeBuildingId = 987655;
  a.pregnant = true;
  a.pregnancyDueProgress = undefined;
  a.moonHowlerCursed = true;
  b.moonHowlerCursed = true;
  w.villageLeaderId = 987656;
  const road: Building = {
    id: 9002, type: BuildingType.Road, x: 5, y: 5, width: 1, height: 1,
    occupants: [a.id], level: 1, constructionProgress: 100, completed: true,
    health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
  };
  w.buildings.push(road);
});

// ---------------------------------------------------------------------------
// Emit.
// ---------------------------------------------------------------------------

/**
 * Project every case and prove the projection is lossless for this collector.
 *
 * The assertion runs against the real collector, on every case: if a field the
 * rules read is missing from `ENTITY_FIELDS` / `BUILDING_FIELDS` / `WORLD_FIELDS`,
 * the projected world reports a different error list and this throws before a
 * fixture is written. A fixture that silently disagrees with the oracle is worse
 * than no fixture.
 */
const projectedCases = cases.map((entry) => {
  const before = collectSimulationInvariantErrors(entry.world);
  const world = projectWorld(entry.world);
  const after = collectSimulationInvariantErrors(world);
  if (before.length !== after.length || before.some((message, index) => message !== after[index])) {
    throw new Error(
      `projection changed the verdict for case "${entry.name}".\n` +
        `  before (${before.length}):\n    ${before.join('\n    ')}\n` +
        `  after  (${after.length}):\n    ${after.join('\n    ')}`,
    );
  }
  return { name: entry.name, note: entry.note, world, errors: after };
});

const fixture = {
  note:
    'Generated by scripts/dump-sim-invariants.mts from ' +
    'src/game/simulation/simulationInvariants.ts. Each case carries the world and the exact ' +
    'error strings the real TypeScript collector produced for it, measured AFTER a ' +
    'JSON.parse(JSON.stringify(...)) round-trip and after projection onto the fields the ' +
    'collector reads (a projection the generator asserts is verdict-preserving).',
  oracle: {
    source: 'src/game/simulation/simulationInvariants.ts',
    baseline: 'initGame({ size: MapSize.Medium, seed: 4242 })',
    founderCount: baselineFounders.length,
    baselineEntityCount: baseline.entities.length,
    projected: {
      note: 'Fields kept per record. Anything outside this list is absent from the fixture.',
      entity: ENTITY_FIELDS,
      building: BUILDING_FIELDS,
      world: WORLD_FIELDS,
    },
  },
  cases: projectedCases,
};

// Self-checks: a fixture that cannot fail is not a gate.
const cleanCase = fixture.cases.find((c) => c.name === 'baseline_clean');
if (!cleanCase) throw new Error('oracle self-check failed: baseline_clean case missing');
if (cleanCase.errors.length !== 0) {
  throw new Error(
    `oracle self-check failed: baseline_clean reported ${cleanCase.errors.length} violations:\n` +
      cleanCase.errors.join('\n'),
  );
}
const violationCases = fixture.cases.filter((c) => c.errors.length > 0).length;
if (violationCases < 20) {
  throw new Error(
    `oracle self-check failed: only ${violationCases} cases report a violation — the scenarios are not biting`,
  );
}

const json = JSON.stringify(fixture, null, 2);

/**
 * Write from Node in UTF-8. Do NOT use shell redirection: Windows PowerShell
 * 5.1's `>` emits UTF-16LE (BOM FF FE), which Godot's FileAccess cannot parse.
 */
const target = process.argv[2] ?? 'D:/Wilderfolk2/tests/fixtures/sim_invariants_golden.json';
writeFileSync(target, json + '\n', 'utf8');

const totalErrors = fixture.cases.reduce((sum, c) => sum + c.errors.length, 0);
console.log(`wrote ${target}`);
console.log(`cases: ${fixture.cases.length} (${violationCases} with violations), errors recorded: ${totalErrors}`);
console.log(`baseline founders: ${baselineFounders.length}, entities: ${baseline.entities.length}, bytes: ${json.length}`);
