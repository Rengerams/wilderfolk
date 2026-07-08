import { describe, expect, it } from 'vitest';
import { gameTick } from '@/game/gameEngine';
import { createEntity } from '@/game/worldGen';
import { EntityType } from '@/game/gameTypes';
import {
  assignMissingResidences,
  PREGNANCY_TICKS,
  rebuildChildrenIds,
  TICKS_PER_DAY,
} from '@/game/dayCycle';
import { isPlayerHuman } from '@/game/groupEvents';
import { freshState, makeCompletedHouse } from '@/test/fixtures/gameFixtures';
import { withSeededRandom } from '@/test/helpers/seededRandom';
import { assertSimInvariants } from '@/test/helpers/simInvariants';

function pregnantCouple(
  state: ReturnType<typeof freshState>,
  houseId: number,
  motherId: number,
  fatherId: number,
  xOffset: number,
) {
  const house = makeCompletedHouse(state, houseId, 200 + xOffset);
  const father = createEntity(EntityType.Human, house.x + 10, house.y + 10, fatherId, 400, false, {
    gender: 'male',
    surname: 'Founder',
    ageYears: 30,
  });
  const mother = createEntity(EntityType.Human, house.x + 12, house.y + 10, motherId, 400, false, {
    gender: 'female',
    surname: 'Founder',
    ageYears: 28,
  });
  father.isJuvenile = false;
  mother.isJuvenile = false;
  father.relationshipStatus = 'married';
  mother.relationshipStatus = 'expecting';
  father.partnerId = mother.id;
  mother.partnerId = father.id;
  mother.pregnant = true;
  mother.pregnancyProgress = PREGNANCY_TICKS - 1;
  mother.energy = mother.maxEnergy;
  father.energy = father.maxEnergy;
  mother.x = house.x + house.width / 2;
  mother.y = house.y + house.height / 2;
  return { father, mother, house };
}

describe('birth integration', () => {
  it('delivers two babies same tick and rebuildChildrenIds links both parents', () => {
    withSeededRandom(0xba5eb100, () => {
      let state = freshState();
      state.resources.food = 20_000;
      const pairA = pregnantCouple(state, 1, 101, 102, 0);
      const pairB = pregnantCouple(state, 2, 201, 202, 300);
      state.entities = [pairA.father, pairA.mother, pairB.father, pairB.mother];
      assignMissingResidences(state.entities, state.buildings);

      state = gameTick(state);

      const juveniles = state.entities.filter((e) => e.alive && isPlayerHuman(e) && e.isJuvenile);
      expect(juveniles.length).toBe(2);

      const humans = state.entities.filter((e) => e.alive && e.type === EntityType.Human);
      rebuildChildrenIds(humans);

      for (const mother of [pairA.mother, pairB.mother]) {
        const live = state.entities.find((e) => e.id === mother.id)!;
        expect(live.childrenIds.length).toBe(1);
        const child = state.entities.find((e) => e.id === live.childrenIds[0]);
        expect(child?.motherId).toBe(mother.id);
        expect(child?.fatherId).toBe(mother.partnerId);
      }

      assertSimInvariants(state);
    });
  });

  it('advances pregnancy to delivery over a full day of ticks', () => {
    withSeededRandom(0xfeed_face, () => {
      let state = freshState();
      state.resources.food = 20_000;
      const pair = pregnantCouple(state, 1, 101, 102, 0);
      pair.mother.pregnancyProgress = PREGNANCY_TICKS - TICKS_PER_DAY;
      state.entities = [pair.father, pair.mother];
      assignMissingResidences(state.entities, state.buildings);

      for (let t = 0; t < TICKS_PER_DAY; t++) {
        state = gameTick(state);
      }

      const mother = state.entities.find((e) => e.id === pair.mother.id)!;
      expect(mother.pregnant).toBe(false);
      expect(mother.reproductionCooldown).toBeGreaterThan(0);
      expect(state.entities.some((e) => e.alive && e.isJuvenile && e.motherId === mother.id)).toBe(true);
      assertSimInvariants(state);
    });
  });
});