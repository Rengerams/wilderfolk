import { describe, expect, it } from 'vitest';
import { assignAllWorkers, gameTick, BuildingType } from '@/game/gameEngine';
import { TICKS_PER_DAY } from '@/game/dayCycle';
import { isPlayerHuman } from '@/game/groupEvents';
import { createBuilding, createEntity, initGame } from '@/game/worldGen';
import { EntityType, JobType } from '@/game/gameTypes';
import { withSeededRandom } from '@/test/helpers/seededRandom';
import { assertSimInvariants, livingPlayerHumans } from '@/test/helpers/simInvariants';

function buildSocialVillage(seed: number) {
  const state = initGame();
  state.entities = state.entities.filter((e) => e.type !== EntityType.Human);

  const loverAId = state.nextEntityId++;
  const loverBId = state.nextEntityId++;
  const spouseAId = state.nextEntityId++;
  const spouseBId = state.nextEntityId++;

  const prison = createBuilding(BuildingType.Prison, 400, 400, 90, 0);
  prison.completed = true;
  const church = createBuilding(BuildingType.Church, 380, 380, 80, 0);
  church.completed = true;
  state.buildings.push(prison, church);

  const guard = createEntity(EntityType.Human, 400, 400, 10, 400, false, {
    gender: 'male',
    surname: 'Guard',
    ageYears: 30,
  });
  guard.job = JobType.Guard;
  guard.homeBuildingId = prison.id;
  guard.isJuvenile = false;
  prison.occupants = [guard.id];

  const priest = createEntity(EntityType.Human, 380, 380, 11, 400, false, {
    gender: 'male',
    surname: 'Priest',
    ageYears: 30,
  });
  priest.job = JobType.Priest;
  priest.homeBuildingId = church.id;
  priest.isJuvenile = false;
  church.occupants = [priest.id];

  function addAffairPair(
    id: number,
    gender: 'male' | 'female',
    x: number,
    y: number,
    loverId: number,
    spouseId: number,
    spouseX: number,
    spouseY: number,
    spouseGender: 'male' | 'female',
  ) {
    const lover = createEntity(EntityType.Human, x, y, id, 400, false, {
      gender,
      surname: 'Villager',
      ageYears: 30,
    });
    lover.isJuvenile = false;
    lover.relationshipStatus = 'married';
    lover.partnerId = spouseId;
    lover.affairPartnerId = loverId; // other established lover id
    lover.affairProgress = 100;
    const spouse = createEntity(EntityType.Human, spouseX, spouseY, spouseId, 400, false, {
      gender: spouseGender,
      surname: 'Villager',
      ageYears: 30,
    });
    spouse.isJuvenile = false;
    spouse.relationshipStatus = 'married';
    spouse.partnerId = id;
    return [lover, spouse] as const;
  }

  const pairs = [
    addAffairPair(loverAId, 'male', 408, 402, loverBId, spouseAId, 620, 600, 'female'),
    addAffairPair(loverBId, 'female', 415, 406, loverAId, spouseBId, 630, 610, 'male'),
  ];
  for (const [a, b] of pairs) state.entities.push(a, b);
  state.entities.push(guard, priest);

  const pins = new Map([
    [loverAId, { x: 408, y: 402 }],
    [loverBId, { x: 415, y: 406 }],
  ]);

  return { state, pins, seed };
}

describe('social sim integration (seeded)', () => {
  it('30-day run preserves invariants and can surface scandals', () => {
    withSeededRandom(42, () => {
      const { state: initial, pins } = buildSocialVillage(42);
      let state = initial;
      const days = 30;

      for (let t = 0; t < days * TICKS_PER_DAY; t++) {
        if (t % TICKS_PER_DAY === 0) {
          for (const entity of state.entities) {
            if (entity.type === EntityType.Human && entity.alive) {
              entity.energy = entity.maxEnergy;
            }
            const pin = pins.get(entity.id);
            if (pin) {
              entity.x = pin.x;
              entity.y = pin.y;
            }
          }
        }
        assignAllWorkers(livingPlayerHumans(state), state.buildings);
        state = gameTick(state);
        if (t % TICKS_PER_DAY === TICKS_PER_DAY - 1) {
          assertSimInvariants(state);
        }
      }

      const scandals = state.eventLog.filter((e) => e.type === 'scandal');
      expect(scandals.length).toBeGreaterThanOrEqual(1);

      const prisoners = state.entities.filter(
        (e) => e.alive && isPlayerHuman(e) && e.prisonBuildingId != null,
      );
      for (const p of prisoners) {
        expect(p.residenceBuildingId).toBeUndefined();
      }
    });
  });

  it('60-day pinned affair soak preserves invariants (imprison roll unit-tested in affair.test)', { timeout: 15_000 }, () => {
    withSeededRandom(42, () => {
      const { state: initial, pins } = buildSocialVillage(42);
      let state = initial;

      for (let t = 0; t < 60 * TICKS_PER_DAY; t++) {
        if (t % TICKS_PER_DAY === 0) {
          for (const entity of state.entities) {
            if (entity.type === EntityType.Human && entity.alive) {
              entity.energy = entity.maxEnergy;
            }
            const pin = pins.get(entity.id);
            if (pin) {
              entity.x = pin.x;
              entity.y = pin.y;
            }
          }
        }
        assignAllWorkers(livingPlayerHumans(state), state.buildings);
        state = gameTick(state);
        if (t % TICKS_PER_DAY === TICKS_PER_DAY - 1) {
          assertSimInvariants(state);
        }
      }

      const scandals = state.eventLog.filter((e) => e.type === 'scandal');
      expect(scandals.length).toBeGreaterThanOrEqual(1);

      const scandalPrisoners = state.entities.filter(
        (e) => e.alive && isPlayerHuman(e) && e.prisonBuildingId != null && e.prisonSentenceCrime === 'scandal',
      );
      for (const p of scandalPrisoners) {
        expect(p.residenceBuildingId).toBeUndefined();
      }
    });
  });
});