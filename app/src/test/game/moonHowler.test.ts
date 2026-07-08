import { describe, expect, it } from 'vitest';
import { createEntity } from '@/game/worldGen';
import { withLifeAge } from '@/test/fixtures/gameFixtures';
import { EntityType } from '@/game/gameTypes';
import { NIGHT_START, WORK_START, DAYS_PER_MOON_CYCLE } from '@/game/dayCycle';
import { buildEntityByType } from '@/game/gameEngine';
import {
  canMoonHowlerCurse,
  curseMoonHowler,
  cureMoonHowler,
  isActiveMoonHowler,
  isSettlerRelationshipEntity,
  migrateLegacyMoonHowler,
  revertToHumanForm,
  shouldMoonHowlerTransform,
  syncMoonHowlerForms,
  transformToWerewolfForm,
  finalizeMoonHowlerDeath,
  tryMoonHowlerChurchCures,
  shouldApplyNewMoonHowlerCurse,
  isMoonHowlerCureTick,
  MOON_HOWLER_CHURCH_CURE_CHANCE,
} from '@/game/moonHowler';

describe('shouldMoonHowlerTransform', () => {
  it('is true on full-moon night at 8pm', () => {
    expect(shouldMoonHowlerTransform(0, NIGHT_START)).toBe(true);
  });

  it('is false during the work day on a full-moon day', () => {
    expect(shouldMoonHowlerTransform(0, WORK_START)).toBe(false);
  });

  it('is false on non-full-moon days at night', () => {
    expect(shouldMoonHowlerTransform(1, NIGHT_START)).toBe(false);
  });
});

describe('canMoonHowlerCurse', () => {
  it('allows adult player humans', () => {
    const h = createEntity(EntityType.Human, 0, 0, 1, 250, false);
    withLifeAge(h, 20);
    expect(canMoonHowlerCurse(h)).toBe(true);
  });

  it('rejects juveniles and visitors', () => {
    const child = createEntity(EntityType.Human, 0, 0, 2, 250, true);
    withLifeAge(child, 8, true);
    const visitor = createEntity(EntityType.Human, 0, 0, 3, 250, false);
    withLifeAge(visitor, 20);
    visitor.faction = 'visitor';
    expect(canMoonHowlerCurse(child)).toBe(false);
    expect(canMoonHowlerCurse(visitor)).toBe(false);
  });
});

describe('curseMoonHowler', () => {
  it('marks the settler cursed', () => {
    const h = createEntity(EntityType.Human, 0, 0, 1, 250, false);
    withLifeAge(h, 22);
    curseMoonHowler(h);
    expect(h.moonHowlerCursed).toBe(true);
  });
});

describe('transformToWerewolfForm / revertToHumanForm', () => {
  it('switches type and restores saved human stats on revert', () => {
    const h = createEntity(EntityType.Human, 0, 0, 1, 250, false);
    withLifeAge(h, 22);
    h.homeBuildingId = 5;
    h.residenceBuildingId = 12;
    curseMoonHowler(h);
    transformToWerewolfForm(h);
    expect(h.type).toBe(EntityType.Werewolf);
    expect(isActiveMoonHowler(h)).toBe(true);
    expect(h.moonHowlerSaved?.residenceBuildingId).toBe(12);

    revertToHumanForm(h);
    expect(h.type).toBe(EntityType.Human);
    expect(h.homeBuildingId).toBe(5);
    expect(h.residenceBuildingId).toBe(12);
    expect(isActiveMoonHowler(h)).toBe(false);
  });

  it('counts transformed spouse as a valid marriage partner', () => {
    const spouse = createEntity(EntityType.Human, 0, 0, 10, 250, false);
    withLifeAge(spouse, 22);
    spouse.relationshipStatus = 'married';
    spouse.partnerId = 20;
    curseMoonHowler(spouse);
    transformToWerewolfForm(spouse);
    expect(isSettlerRelationshipEntity(spouse)).toBe(true);
  });
});

describe('cureMoonHowler', () => {
  it('clears curse from human and werewolf forms', () => {
    const h = createEntity(EntityType.Human, 0, 0, 1, 250, false);
    withLifeAge(h, 22);
    curseMoonHowler(h);
    transformToWerewolfForm(h);
    cureMoonHowler(h);
    expect(h.moonHowlerCursed).toBe(false);
    expect(h.type).toBe(EntityType.Human);
  });
});

describe('syncMoonHowlerForms', () => {
  it('transforms at full-moon 8pm and reverts at the next dawn 7am', () => {
    const h = createEntity(EntityType.Human, 0, 0, 1, 250, false);
    withLifeAge(h, 22);
    curseMoonHowler(h);
    const entities = [h];

    const night = syncMoonHowlerForms(entities, 0, NIGHT_START);
    expect(night.transformed).toHaveLength(1);
    expect(h.type).toBe(EntityType.Werewolf);

    const dawn = syncMoonHowlerForms(entities, 1, WORK_START);
    expect(dawn.reverted).toHaveLength(1);
    expect(h.type).toBe(EntityType.Human);
  });

  it('indexes transformed units in Werewolf bucket after re-index', () => {
    const h = createEntity(EntityType.Human, 0, 0, 1, 250, false);
    withLifeAge(h, 22);
    curseMoonHowler(h);
    const entities = [h];
    syncMoonHowlerForms(entities, 0, NIGHT_START);

    const byType = buildEntityByType(entities);
    expect(byType[EntityType.Werewolf]).toContain(h);
    expect(byType[EntityType.Human]).not.toContain(h);
  });
});

describe('migrateLegacyMoonHowler', () => {
  it('converts legacy werewolf saves to cursed human when not full moon', () => {
    const w = createEntity(EntityType.Werewolf, 0, 0, 1, 250, false);
    withLifeAge(w, 22);
    migrateLegacyMoonHowler(w, 1, WORK_START);
    expect(w.moonHowlerCursed).toBe(true);
    expect(w.type).toBe(EntityType.Human);
  });

  it('keeps werewolf form on full-moon night during migration', () => {
    const w = createEntity(EntityType.Werewolf, 0, 0, 2, 250, false);
    withLifeAge(w, 22);
    migrateLegacyMoonHowler(w, 0, NIGHT_START);
    expect(w.moonHowlerCursed).toBe(true);
    expect(w.type).toBe(EntityType.Werewolf);
  });
});

describe('isActiveMoonHowler', () => {
  it('requires werewolf type and curse flag', () => {
    const h = createEntity(EntityType.Human, 0, 0, 1, 250);
    curseMoonHowler(h);
    expect(isActiveMoonHowler(h)).toBe(false);
    transformToWerewolfForm(h);
    expect(isActiveMoonHowler(h)).toBe(true);
  });
});

describe('isMoonHowlerCureTick', () => {
  it('is true at dawn after a full-moon colony day', () => {
    expect(isMoonHowlerCureTick(1, WORK_START)).toBe(true);
    expect(isMoonHowlerCureTick(15, WORK_START)).toBe(true);
  });

  it('is false on non-dawn hours or non-full-moon mornings', () => {
    expect(isMoonHowlerCureTick(1, NIGHT_START)).toBe(false);
    expect(isMoonHowlerCureTick(5, WORK_START)).toBe(false);
    expect(isMoonHowlerCureTick(0, WORK_START)).toBe(false);
  });
});

describe('tryMoonHowlerChurchCures', () => {
  it('only rolls at post-hunt dawn with a staffed church while in werewolf form', () => {
    const h = createEntity(EntityType.Human, 0, 0, 1, 250, false);
    withLifeAge(h, 22);
    curseMoonHowler(h);
    transformToWerewolfForm(h);
    const entities = [h];
    const alwaysWin = () => 0;

    expect(tryMoonHowlerChurchCures(entities, 1, NIGHT_START, false, alwaysWin).cured).toHaveLength(0);
    expect(tryMoonHowlerChurchCures(entities, 1, WORK_START, false, alwaysWin).cured).toHaveLength(0);
    expect(tryMoonHowlerChurchCures(entities, 1, NIGHT_START, true, alwaysWin).cured).toHaveLength(0);
    expect(tryMoonHowlerChurchCures(entities, 5, WORK_START, true, alwaysWin).cured).toHaveLength(0);

    const result = tryMoonHowlerChurchCures(entities, 1, WORK_START, true, alwaysWin);
    expect(result.cured).toHaveLength(1);
    expect(h.moonHowlerCursed).toBe(false);
    expect(h.type).toBe(EntityType.Human);
  });

  it('does not cure human-form cursed settlers', () => {
    const h = createEntity(EntityType.Human, 0, 0, 1, 250, false);
    withLifeAge(h, 22);
    curseMoonHowler(h);
    tryMoonHowlerChurchCures([h], 1, WORK_START, true, () => 0);
    expect(h.moonHowlerCursed).toBe(true);
    expect(h.type).toBe(EntityType.Human);
  });

  it('fails the roll when RNG is above the cure chance', () => {
    const h = createEntity(EntityType.Human, 0, 0, 1, 250, false);
    withLifeAge(h, 22);
    curseMoonHowler(h);
    transformToWerewolfForm(h);
    const failRng = () => MOON_HOWLER_CHURCH_CURE_CHANCE;
    const result = tryMoonHowlerChurchCures([h], 1, WORK_START, true, failRng);
    expect(result.cured).toHaveLength(0);
    expect(h.moonHowlerCursed).toBe(true);
    expect(h.type).toBe(EntityType.Werewolf);
  });
});

describe('shouldApplyNewMoonHowlerCurse', () => {
  it('fires on full-moon night only when no active curse and enough humans', () => {
    expect(shouldApplyNewMoonHowlerCurse(0, NIGHT_START, 8, 0)).toBe(true);
    expect(shouldApplyNewMoonHowlerCurse(0, NIGHT_START, 5, 0)).toBe(false);
    expect(shouldApplyNewMoonHowlerCurse(0, NIGHT_START, 8, 1)).toBe(false);
    expect(shouldApplyNewMoonHowlerCurse(1, NIGHT_START, 8, 0)).toBe(false);
    expect(shouldApplyNewMoonHowlerCurse(0, WORK_START, 8, 0)).toBe(false);
  });
});

describe('finalizeMoonHowlerDeath', () => {
  it('reverts werewolf form before death is recorded for save/stats', () => {
    const h = createEntity(EntityType.Human, 0, 0, 1, 250, false);
    withLifeAge(h, 22);
    curseMoonHowler(h);
    transformToWerewolfForm(h);
    h.alive = false;
    finalizeMoonHowlerDeath(h);
    expect(h.type).toBe(EntityType.Human);
    expect(h.moonHowlerCursed).toBe(true);
  });
});

describe('full moon calendar', () => {
  it('marks every DAYS_PER_MOON_CYCLE day as transform-eligible at night', () => {
    for (let d = 0; d < 28; d += DAYS_PER_MOON_CYCLE) {
      expect(shouldMoonHowlerTransform(d, NIGHT_START)).toBe(true);
    }
  });
});