import { afterEach, describe, expect, it, vi } from 'vitest';
import { assignAllWorkers, gameTick, BuildingType } from '@/game/gameEngine';
import { TICKS_PER_DAY } from '@/game/dayCycle';
import { isPlayerHuman } from '@/game/groupEvents';
import { createBuilding, createEntity, initGame } from '@/game/worldGen';
import { EntityType, JobType, type Entity } from '@/game/gameTypes';
import * as lifeSimulation from '@/game/lifeSimulation';
import { withRepeatingRandom } from '@/test/helpers/seededRandom';

/** Passes gossip/caught rolls, avoids illness (0.00012); 0 kills everyone on day 1. */
const PRISON_SOAK_ROLL = 0.1;

function makeAdult(
  id: number,
  gender: 'male' | 'female',
  x: number,
  y: number,
): Entity {
  const e = createEntity(EntityType.Human, x, y, id, 400, false, {
    gender, surname: 'Test', ageYears: 30,
  });
  e.isJuvenile = false;
  return e;
}

function buildPrisonVillageState() {
  const state = initGame();
  state.entities = state.entities.filter((e) => e.type !== EntityType.Human);
  state.resources.food = 10_000;
  state.eventLog = [];

  const prison = createBuilding(BuildingType.Prison, 400, 400, state.nextBuildingId++, 0);
  prison.completed = true;
  const church = createBuilding(BuildingType.Church, 380, 380, state.nextBuildingId++, 0);
  church.completed = true;
  state.buildings.push(prison, church);

  const guardId = state.nextEntityId++;
  const priestId = state.nextEntityId++;
  const loverAId = state.nextEntityId++;
  const loverBId = state.nextEntityId++;
  const loverCId = state.nextEntityId++;
  const loverDId = state.nextEntityId++;
  const spouseAId = state.nextEntityId++;
  const spouseBId = state.nextEntityId++;
  const spouseCId = state.nextEntityId++;
  const spouseDId = state.nextEntityId++;

  const guard = makeAdult(guardId, 'male', 400, 400);
  guard.homeBuildingId = prison.id;
  guard.job = JobType.Guard;
  prison.occupants = [guard.id];

  const priest = makeAdult(priestId, 'male', 380, 380);
  priest.homeBuildingId = church.id;
  priest.job = JobType.Priest;
  church.occupants = [priest.id];

  const loverA = makeAdult(loverAId, 'male', 408, 402);
  const loverB = makeAdult(loverBId, 'female', 415, 406);
  const loverC = makeAdult(loverCId, 'male', 402, 408);
  const loverD = makeAdult(loverDId, 'female', 410, 412);
  const spouseA = makeAdult(spouseAId, 'female', 620, 600);
  const spouseB = makeAdult(spouseBId, 'male', 630, 610);
  const spouseC = makeAdult(spouseCId, 'female', 700, 650);
  const spouseD = makeAdult(spouseDId, 'male', 710, 660);

  for (const e of [loverA, loverB, loverC, loverD, spouseA, spouseB, spouseC, spouseD]) {
    e.relationshipStatus = 'married';
    e.affairProgress = 100;
  }

  loverA.partnerId = spouseAId;
  spouseA.partnerId = loverAId;
  loverA.affairPartnerId = loverBId;
  loverB.partnerId = spouseBId;
  spouseB.partnerId = loverBId;
  loverB.affairPartnerId = loverAId;

  loverC.partnerId = spouseCId;
  spouseC.partnerId = loverCId;
  loverC.affairPartnerId = loverDId;
  loverD.partnerId = spouseDId;
  spouseD.partnerId = loverDId;
  loverD.affairPartnerId = loverCId;

  state.entities.push(
    guard, priest,
    loverA, spouseA, loverB, spouseB,
    loverC, spouseC, loverD, spouseD,
  );

  const loverPins = new Map([
    [loverAId, { x: 408, y: 402 }],
    [loverBId, { x: 415, y: 406 }],
    [loverCId, { x: 402, y: 408 }],
    [loverDId, { x: 410, y: 412 }],
  ]);
  return { state, loverPins, loverIds: [loverAId, loverBId, loverCId, loverDId] as const };
}

/** Pin by explicit lover ids — independent of isPlayerHuman filtering in assignAllWorkers. */
function pinLovers(
  entities: readonly Entity[],
  loverIds: ReadonlySet<number>,
  loverPins: Map<number, { x: number; y: number }>,
): void {
  for (const entity of entities) {
    if (!loverIds.has(entity.id)) continue;
    const pin = loverPins.get(entity.id);
    if (!pin) continue;
    entity.x = pin.x;
    entity.y = pin.y;
    entity.energy = entity.maxEnergy;
  }
}

function isCalendarDayBoundary(tick: number): boolean {
  return (tick + 1) % TICKS_PER_DAY === 0;
}

/**
 * Integration smoke — full gameTick with deterministic gossip rolls.
 * Caught/imprison/divorce paths are covered in lifeSimulation.affair.test.ts.
 */
describe('prison pipeline', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('120-day gameTick can surface scandal gossip near staffed prison', () => {
    const mortalitySpy = vi.spyOn(lifeSimulation, 'tryDailyHumanMortality')
      .mockReturnValue(false);

    try {
      withRepeatingRandom(PRISON_SOAK_ROLL, () => {
        const { state: initial, loverPins, loverIds: expectedLoverIds } = buildPrisonVillageState();
        let state = initial;
        const loverIdSet = new Set(expectedLoverIds);
        const players = () => state.entities.filter(isPlayerHuman);

        assignAllWorkers(players(), state.buildings);

        for (let t = 0; t < 120 * TICKS_PER_DAY; t++) {
          if (isCalendarDayBoundary(state.tick)) {
            assignAllWorkers(players(), state.buildings);
          }
          pinLovers(state.entities, loverIdSet, loverPins);
          state = gameTick(state);
        }

        const scandals = state.eventLog.filter((e) => e.type === 'scandal');
        const rumorScandals = scandals.filter((e) => e.message.includes('Whispers spread'));
        const caughtScandals = scandals.filter((e) => e.message.includes('was caught'));
        expect(scandals.length).toBeGreaterThanOrEqual(1);
        // Staffed prison biases exposure toward caught; rumor path is unit-tested in affair.test.ts.
        expect(rumorScandals.length + caughtScandals.length).toBeGreaterThanOrEqual(1);


      });
    } finally {
      mortalitySpy.mockRestore();
    }
  }, 60_000);
});