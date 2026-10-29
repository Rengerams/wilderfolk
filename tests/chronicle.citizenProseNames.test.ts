import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { human } from '../src/test/factories';
import { citizenFullName, formatCitizenName, formatDeathLog } from '../src/game/citizenId';
import { logDeath } from '../src/game/eventLog';
import { applyEducationGraduation, SCHOOL_GRADUATION_DAYS } from '../src/game/education';
import { tryFormSchoolyardBond } from '../src/game/simulation/humanRelationships';

describe('Chronicle citizen prose and stable identity', () => {
  it('writes a natural death sentence but keeps the numbered identity for graves', () => {
    const world = initGame({ seed: 20261029 });
    const deceased = human(901, {
      name: 'Pip',
      surname: 'Vale',
      alive: false,
      age: 35,
    });
    world.entities = [deceased];

    expect(citizenFullName(deceased)).toBe('Pip Vale');
    expect(formatCitizenName(deceased)).toBe('#901 Pip Vale');
    const sentence = formatDeathLog(deceased, 'died of a sudden illness');
    expect(sentence).toBe('Pip Vale died of a sudden illness — at the age of 35 years (adult)');

    logDeath(world, sentence, formatCitizenName(deceased));
    expect(world.eventLog[0]?.message).toBe(sentence);
    expect(world.graveRecords?.[0]).toMatchObject({
      name: '#901 Pip Vale',
      deceasedId: 901,
    });
  });

  it('records schoolyard friendship in prose, never with raw citizen ids', () => {
    const world = initGame({ seed: 20261029 });
    const child = human(901, {
      name: 'Pip',
      surname: 'Vale',
      age: 14,
      isJuvenile: true,
      schoolDays: 5,
    });
    const classmate = human(902, { name: 'Tom', surname: 'Moss', age: 14, isJuvenile: true });
    world.entities = [child, classmate];

    tryFormSchoolyardBond(world, child, () => 0);

    expect(world.eventLog[0]?.message).toBe('Pip Vale and Tom Moss became friends at school');
    expect(child.childhoodFriendsIds).toContain(classmate.id);
    expect(classmate.childhoodFriendsIds).toContain(child.id);
  });

  it('shows a graduation notice and Chronicle event without an id prefix', () => {
    const world = initGame({ seed: 20261029 });
    const graduate = human(901, {
      name: 'Pip',
      surname: 'Vale',
      age: 18,
      isJuvenile: false,
      schoolDays: SCHOOL_GRADUATION_DAYS,
    });
    world.entities = [graduate];

    applyEducationGraduation(world, graduate);

    expect(graduate.educated).toBe(true);
    expect(world.eventLog[0]?.message).toBe('Pip Vale finished basic schooling — ready to work');
    expect(world.notifications.some((note) =>
      note.title === 'Graduation' && note.message.includes('Pip Vale')
      && !note.message.includes('#901')
    )).toBe(true);
  });
});
