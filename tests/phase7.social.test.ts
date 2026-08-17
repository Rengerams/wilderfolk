/**
 * Phase 7 regression tests — relationship webs (friendships, feuds),
 * apprenticeships, and family legacy (dynasties + the chronicle chapter).
 */
import { describe, it, expect } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { EntityType, BuildingType, JobType } from '../src/game/gameTypes';
import { advanceSocialRelationships, friendshipScore, feudScore, startFeud, friendCount } from '../src/game/relationships';
import { advanceApprenticeships } from '../src/game/apprenticeships';
import { computeDynasties, hasDynasty } from '../src/game/familyLegacy';
import { advanceValleyChronicle } from '../src/game/valleyChronicle';
import type { Entity, WorldState } from '../src/game/gameTypes';

function makeWorld(): WorldState {
  return initGame({ villageName: 'P7', size: 'small' });
}

function addHuman(
  w: WorldState,
  opts: {
    id: number;
    name?: string;
    surname?: string;
    generation?: number;
    isJuvenile?: boolean;
    homeBuildingId?: number;
    job?: JobType;
    x?: number;
    y?: number;
  },
): Entity {
  const e = createEntity(
    EntityType.Human,
    opts.x ?? 300,
    opts.y ?? 300,
    opts.id,
    80,
    opts.isJuvenile ?? false,
    { name: opts.name ?? `H${opts.id}`, surname: opts.surname, generation: opts.generation },
  );
  if (opts.homeBuildingId != null) e.homeBuildingId = opts.homeBuildingId;
  if (opts.job) e.job = opts.job;
  e.alive = true;
  e.maxEnergy = 100;
  w.entities.push(e);
  return e;
}

describe('relationship webs — friendships', () => {
  it('shared home grows a friendship each day', () => {
    const w = makeWorld();
    const a = addHuman(w, { id: 1, homeBuildingId: 10 });
    const b = addHuman(w, { id: 2, homeBuildingId: 10 });
    expect(friendshipScore(a, b.id)).toBe(0);
    advanceSocialRelationships(w, w.entities);
    expect(friendshipScore(a, b.id)).toBeGreaterThanOrEqual(0.5);
    expect(friendshipScore(a, b.id)).toBe(friendshipScore(b, a.id));
  });

  it('strong friendships count for the UI badge', () => {
    const w = makeWorld();
    const a = addHuman(w, { id: 1, homeBuildingId: 10 });
    const b = addHuman(w, { id: 2, homeBuildingId: 10 });
    a.friendships = { [`friend_${b.id}`]: 70 };
    b.friendships = { [`friend_${a.id}`]: 70 };
    expect(friendCount(a)).toBe(1);
  });
});

describe('relationship webs — feuds', () => {
  it('startFeud opens a mutual feud and logs', () => {
    const w = makeWorld();
    const a = addHuman(w, { id: 1 });
    const b = addHuman(w, { id: 2 });
    startFeud(w, a, b, 35);
    expect(feudScore(a, b.id)).toBe(35);
    expect(feudScore(b, a.id)).toBe(35);
  });

  it('feuds decay and drain energy over days', () => {
    const w = makeWorld();
    const a = addHuman(w, { id: 1 });
    const b = addHuman(w, { id: 2 });
    startFeud(w, a, b, 35);
    const e0 = a.energy ?? 80;
    for (let d = 0; d < 3; d++) advanceSocialRelationships(w, w.entities);
    expect(feudScore(a, b.id)).toBeLessThan(35);
    expect((a.energy ?? 80)).toBeLessThan(e0);
  });
});

describe('apprenticeships', () => {
  it('a master with a nearby juvenile takes an apprentice who learns', () => {
    const w = makeWorld();
    const master = addHuman(w, { id: 1, x: 300, y: 300, job: JobType.Farmer });
    master.skills = { [JobType.Farmer]: 60 };
    const kid = addHuman(w, { id: 2, x: 310, y: 310, isJuvenile: true });
    w.buildings.push({
      id: 1,
      type: BuildingType.Farm,
      x: 300,
      y: 300,
      width: 60,
      height: 60,
      occupants: [master.id],
      level: 1,
      constructionProgress: 100,
      completed: true,
      health: 100,
      maxHealth: 100,
      spriteScale: 1,
      buildAnimTimer: 0,
      faction: 'player',
    } as never);

    advanceApprenticeships(w, w.entities);
    expect(master.apprenticeId).toBe(kid.id);
    expect(kid.apprenticeOfId).toBe(master.id);

    // teaching boosts the apprentice's skill
    const before = kid.skills?.[JobType.Farmer] ?? 0;
    advanceApprenticeships(w, w.entities);
    expect((kid.skills?.[JobType.Farmer] ?? 0)).toBeGreaterThan(before);
  });

  it('an apprentice graduates at skill 50 and both bonds clear', () => {
    const w = makeWorld();
    const master = addHuman(w, { id: 1, x: 300, y: 300, job: JobType.Farmer });
    master.skills = { [JobType.Farmer]: 100 };
    const kid = addHuman(w, { id: 2, x: 310, y: 310, isJuvenile: true });
    kid.skills = { [JobType.Farmer]: 49.6 }; // one strong lesson → ≥ 50
    w.buildings.push({
      id: 1,
      type: BuildingType.Farm,
      x: 300,
      y: 300,
      width: 60,
      height: 60,
      occupants: [master.id],
      level: 1,
      constructionProgress: 100,
      completed: true,
      health: 100,
      maxHealth: 100,
      spriteScale: 1,
      buildAnimTimer: 0,
      faction: 'player',
    } as never);
    master.apprenticeId = kid.id;
    kid.apprenticeOfId = master.id;

    advanceApprenticeships(w, w.entities);
    expect((kid.skills?.[JobType.Farmer] ?? 0)).toBeGreaterThanOrEqual(50);
    expect(master.apprenticeId).toBeUndefined();
    expect(kid.apprenticeOfId).toBeUndefined();
  });
});

describe('family legacy — dynasties', () => {
  it('three living generations of one surname is a dynasty', () => {
    const w = makeWorld();
    addHuman(w, { id: 1, surname: 'Vale', generation: 1 });
    addHuman(w, { id: 2, surname: 'Vale', generation: 2 });
    addHuman(w, { id: 3, surname: 'Vale', generation: 3 });
    const dynasties = computeDynasties(w);
    expect(dynasties[0]).toMatchObject({ surname: 'Vale', generationsAlive: 3, members: 3 });
    expect(hasDynasty(w)).toBe(true);
  });

  it('two generations is not yet a dynasty', () => {
    const w = makeWorld();
    addHuman(w, { id: 1, surname: 'Vale', generation: 1 });
    addHuman(w, { id: 2, surname: 'Vale', generation: 2 });
    expect(hasDynasty(w)).toBe(false);
  });

  it('the chronicle unlocks the A Dynasty chapter', () => {
    const w = makeWorld();
    addHuman(w, { id: 1, surname: 'Vale', generation: 1 });
    addHuman(w, { id: 2, surname: 'Vale', generation: 2 });
    addHuman(w, { id: 3, surname: 'Vale', generation: 3 });
    const newly = advanceValleyChronicle(w);
    expect(newly).toContain('a_dynasty');
  });
});
