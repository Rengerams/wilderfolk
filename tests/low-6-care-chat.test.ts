/**
 * Low-severity audit batch — regression tests for the findings fixed in this change.
 *
 *   - L35 hospitalCare: the daily ward round must not pass the PATIENT's distance to
 *     the ward as `doctorPresent` (a patient near the building is not a doctor on site).
 *   - L36 hospitalCare: the medicine food cost is recorded on the economy ledger.
 *   - L37 humanChat: a forced phrase reclaims the settler's dialogue session, and a
 *     partner left holding a reclaimed key is not dialogue-busy forever.
 *   - L37 (X6): the seven unreferenced legacy chat/courtship helpers are gone.
 *   - L16 dialogueTrees: tree selection is a deterministic draw from the context pool.
 *   - L23 eventLog (already fixed): a non-combat chronicle line is never classified as combat.
 *   - L24/L25 eventLogFilters: the Chronicle offers a `divorce` category.
 *   - L74 travelingTheatre: the stage-1 script choice reaches the opening-night outcome.
 *   - L58 scheduleFeedback: the ordinary work window counts real workplaces only.
 *   - L52 relationshipDiagnostics: reset restores the `enabled` flag.
 *   - L53 relationships: friendship records of dead settlers are pruned and do not
 *     lift the survivor's energy.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { BuildingType, EntityType, Season, WeatherType } from '../src/game/gameTypes';
import type { Building, Entity, GameEventLog, StoryEvent, WorldState } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { personDayRoll } from '../src/game/dayCycle';
import { getEconomyLedger } from '../src/game/economyLedger';
import { logEvent, resolveCombatLogKind } from '../src/game/eventLog';
import { EVENT_LOG_FILTER_OPTIONS } from '../src/game/eventLogFilters';
import { tickHospitalDailyCare, treatPatientAtHospital } from '../src/game/hospitalCare';
import {
  isDialogueBusy,
  maybeDialogueChat,
  resetDialogueSessions,
  sayHumanChatPhrase,
  startDialogueTreeChat,
  tickHumanChat,
  type ChatSpeaker,
} from '../src/game/humanChat';
import { getDialogueTreeById, pickDialogueTree } from '../src/game/dialogueTrees';
import {
  flushRelationshipDiagnostics,
  isRelationshipDiagnosticsEnabled,
  recordRelationshipDiagnostic,
  resetRelationshipDiagnostics,
  setRelationshipDiagnosticsConsoleLoggingEnabled,
  setRelationshipDiagnosticsEnabled,
} from '../src/game/relationshipDiagnostics';
import { advanceSocialRelationships } from '../src/game/relationships';
import { getScheduleImpactPreview } from '../src/game/scheduleFeedback';
import {
  maybeOfferTravelingTheatre,
  resolveTravelingTheatre,
  tickTravelingTheatre,
  travelingTheatreEligibleDay,
} from '../src/game/travelingTheatre';
import { initGame } from '../src/game/worldGen';

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 0,
    y: 0,
    energy: 50,
    maxEnergy: 100,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    alive: true,
    size: 10,
    speed: 2,
    vx: 0,
    vy: 0,
    flash: 0,
    animFrame: 0,
    spriteAngle: 0,
    childrenIds: [],
    generation: 0,
    isJuvenile: false,
    ...overrides,
  } as Entity;
}

function makeWorld(entities: Entity[], tick = 0, food = 0): WorldState {
  return {
    entities,
    tick,
    width: 400,
    height: 300,
    year: 0,
    dayInYear: 0,
    season: Season.Spring,
    weather: WeatherType.Clear,
    resources: { wood: 0, stone: 0, food, gold: 0, iron: 0 },
    notifications: [],
    bigNews: [],
    floatingTexts: [],
    deathParticles: [],
    nextFloatingTextId: 1,
    nextEntityId: 100,
    eventLog: [],
    villageReputation: 50,
    buildings: [],
    paused: false,
    speed: 1,
  } as unknown as WorldState;
}

/** The ward centre is (120, 120): 100 + 40/2. */
function makeHospital(occupantIds: number[]): Building {
  return {
    id: 7,
    type: BuildingType.Hospital,
    completed: true,
    occupants: occupantIds,
    x: 100,
    y: 100,
    width: 40,
    height: 40,
  } as unknown as Building;
}

/** First day-start tick whose seeded roll satisfies `predicate`. */
function tickWhere(predicate: (tick: number) => boolean): number {
  for (let day = 1; day <= 20000; day++) {
    const tick = day * TICKS_PER_DAY;
    if (predicate(tick)) return tick;
  }
  throw new Error('no tick produces the wanted roll');
}

/** Daily ward round outcome for one patient, with the doctor at `doctorOffsetX`. */
function runWardRound(doctorOffsetX: number): number {
  const hospital = makeHospital([9]);
  const patient = human(1, { x: 120, y: 120, energy: 0 });
  const doctor = human(9, { x: 120 + doctorOffsetX, y: 120, energy: 100 });
  const state = makeWorld([patient, doctor]);

  tickHospitalDailyCare(state, hospital, [patient]);
  return patient.energy;
}

afterEach(() => {
  resetDialogueSessions();
  setRelationshipDiagnosticsEnabled(true);
  setRelationshipDiagnosticsConsoleLoggingEnabled(false);
  resetRelationshipDiagnostics();
});

describe('L35 — ward round doctor presence', () => {
  it('credits the doctor bonus only when an occupant is actually on site', () => {
    const withDoctorOnSite = runWardRound(0);
    const withoutDoctor = runWardRound(300);

    // Both patients stand next to the ward, so the pre-fix code passed
    // `doctorPresent: true` in both cases and the two gains were identical.
    expect(withoutDoctor).toBeLessThan(withDoctorOnSite);
    // The far case is the plain occupant-strength heal (no +0.35 doctor term).
    expect(withoutDoctor).toBeGreaterThan(0);
  });
});

describe('L36 — medicine cost transparency', () => {
  it('records the medicine food cost on the economy ledger', () => {
    const tick = tickWhere((t) => personDayRoll(5, t, 902) < 0.25);
    const hospital = makeHospital([9]);
    const patient = human(5, { x: 120, y: 120, energy: 0 });
    const doctor = human(9, { x: 500, y: 500, energy: 100 });
    const state = makeWorld([patient, doctor], tick, 5);

    expect(treatPatientAtHospital(state, patient, hospital)).toBe(true);

    expect(state.resources.food).toBe(4);
    expect(getEconomyLedger(state)?.consumed.medicine).toBe(1);
  });
});

describe('L37 — dialogue session reclamation', () => {
  it('lets a settler speak a tree line again after a forced phrase', () => {
    resetDialogueSessions();
    const tree = getDialogueTreeById('dt_rock')!;
    const speaker: ChatSpeaker = { id: 41 };

    startDialogueTreeChat(speaker, null, tree, true);
    expect(speaker.chatDialogueSessionKey).toBe('solo:41');

    sayHumanChatPhrase(speaker, 'A forced line', 12);
    for (let i = 0; i < 4; i++) tickHumanChat(speaker);
    expect(speaker.chatPhrase).toBeUndefined();

    maybeDialogueChat(speaker, null, 'social', 1, 1);

    // Pre-fix: `solo:41` stayed in the session map, so startDialogueTreeChat bailed
    // out at its `dialogueSessions.has(key)` guard and the settler never spoke again.
    expect(speaker.chatDialogueSessionKey).toBe('solo:41');
    expect(typeof speaker.chatPhrase).toBe('string');
    expect((speaker.chatPhrase ?? '').length).toBeGreaterThan(0);
  });

  it('does not leave a partner dialogue-busy on a reclaimed session', () => {
    resetDialogueSessions();
    const tree = getDialogueTreeById('dt_rock')!;
    const a: ChatSpeaker = { id: 51 };
    const b: ChatSpeaker = { id: 52 };
    const resolveA = (id: number) => (id === b.id ? b : undefined);
    const resolveB = (id: number) => (id === a.id ? a : undefined);

    startDialogueTreeChat(a, b, tree);
    const firstTicks = a.chatTicks ?? 0;
    expect(firstTicks).toBeGreaterThan(0);
    // Hand the next line to the partner, as tickHumanChat does in the simulation.
    for (let i = 0; i < firstTicks; i++) {
      tickHumanChat(a, resolveA);
      tickHumanChat(b, resolveB);
    }
    expect((b.chatTicks ?? 0)).toBeGreaterThan(0);
    expect(b.chatDialogueSessionKey).toBeDefined();

    // A forced phrase abandons the pair session for both sides.
    sayHumanChatPhrase(a, 'A forced line');
    expect(a.chatDialogueSessionKey).toBeUndefined();
    // The partner still holds the key until its own line finishes.
    expect(b.chatDialogueSessionKey).toBe('51:52');

    const partnerTicks = b.chatTicks ?? 0;
    for (let i = 0; i < partnerTicks; i++) {
      tickHumanChat(a, resolveA);
      tickHumanChat(b, resolveB);
    }

    expect(b.chatDialogueSessionKey).toBeUndefined();
    expect(b.chatPartnerId).toBeUndefined();
    expect(isDialogueBusy(b)).toBe(false);
  });

  it('no longer exposes the unreferenced legacy chat/courtship helpers', async () => {
    const chat = await import('../src/game/humanChat');
    for (const name of [
      'startHumanChat',
      'maybeHumanChat',
      'maybeHousemateChat',
      'startPairedHumanChat',
      'pickCourtshipPair',
      'pickChatPhrase',
      'truncateChatForBubble',
    ]) {
      expect(name in chat).toBe(false);
    }
  });
});

describe('L16 — dialogue tree selection', () => {
  it('is a deterministic draw from the context pool', () => {
    const first = pickDialogueTree('work', 12, 30);
    const second = pickDialogueTree('work', 12, 30);

    expect(first).not.toBeNull();
    expect(second?.id).toBe(first?.id);
    for (let tick = 0; tick < 24; tick++) {
      expect(pickDialogueTree('work', 12, tick)?.category).toBe('work');
    }
  });
});

describe('L23 — combat classification guard', () => {
  it('never classifies a non-combat chronicle line as a combat event', () => {
    const truce: GameEventLog = {
      id: 1,
      tick: 0,
      year: 0,
      day: 0,
      type: 'event',
      message: 'Raid called off — truce with the Ridge Camp',
    };
    expect(resolveCombatLogKind(truce)).toBeNull();

    const incoming: GameEventLog = {
      ...truce,
      type: 'combat',
      message: 'The Ridge Camp launched a raid on the village',
    };
    expect(resolveCombatLogKind(incoming)).toBe('incoming_raid');
  });
});

describe('L24/L25 — divorce chronicle filter', () => {
  it('offers a Divorces category beside Marriages', () => {
    const ids = EVENT_LOG_FILTER_OPTIONS.map((option) => option.id);
    expect(ids.indexOf('divorce')).toBe(ids.indexOf('marriage') + 1);
    expect(EVENT_LOG_FILTER_OPTIONS.find((option) => option.id === 'divorce')?.label).toBe('Divorces');
  });
});

describe('L74 — travelling theatre script choice', () => {
  function reachOpeningNight(script: string): WorldState {
    const state = initGame({ seed: 20240913 });
    state.dayInYear = travelingTheatreEligibleDay(state.worldMap?.seed) + 1;
    state.visitorGroups.push({ kind: 'performers', daysLeft: 5 } as never);
    logEvent(state, 'season', 'A hard winter passed');
    logEvent(state, 'scandal', 'A hungry settler tried to eat a neighbour’s foot');

    maybeOfferTravelingTheatre(state);
    expect(resolveTravelingTheatre(state, script)).toBe(true);
    expect(resolveTravelingTheatre(state, 'support_improvise')).toBe(true);

    state.dayInYear += 10;
    tickTravelingTheatre(state);
    return state;
  }

  const stage3Card = (state: WorldState): StoryEvent | undefined =>
    (state.pendingStoryEvents ?? []).find((event) => event.id.startsWith('theatre_stage3_'));

  it('names the chosen play in the opening-night text', () => {
    const famine = reachOpeningNight('famine_foot');
    expect(stage3Card(famine)?.description).toContain('The Famine Foot');

    const winter = reachOpeningNight('first_winter');
    expect(stage3Card(winter)?.description).toContain('The First Winter');

    expect(resolveTravelingTheatre(winter, 'correct_story')).toBe(true);
    expect(winter.eventLog[0]?.message).toContain('The First Winter');
  });
});

describe('L58 — ordinary work window preview', () => {
  it('counts staffable workplaces only, not residences, roads or decor', () => {
    const state = {
      buildings: [
        { id: 1, type: BuildingType.Farm, completed: true, occupants: [10], x: 0, y: 0, width: 1, height: 1 },
        { id: 2, type: BuildingType.House, completed: true, occupants: [11, 12], x: 0, y: 0, width: 1, height: 1 },
        { id: 3, type: BuildingType.Road, completed: true, occupants: [], x: 0, y: 0, width: 1, height: 1 },
        { id: 4, type: BuildingType.Statue, completed: true, occupants: [], x: 0, y: 0, width: 1, height: 1 },
        { id: 5, type: BuildingType.Church, completed: true, occupants: [13], x: 0, y: 0, width: 1, height: 1 },
      ],
      entities: [
        { id: 10, alive: true, faction: undefined },
        { id: 11, alive: true, faction: undefined },
        { id: 12, alive: true, faction: undefined },
        { id: 13, alive: true, faction: undefined },
      ],
    } as never;

    const preview = getScheduleImpactPreview(state, 'ordinary', 8, 10);

    expect(preview.affectedWorkplaces).toBe(1);
    expect(preview.assignedWorkers).toBe(1);
  });
});

describe('L52 — diagnostics reset', () => {
  it('restores the enabled flag and collects again', () => {
    setRelationshipDiagnosticsEnabled(false);
    setRelationshipDiagnosticsConsoleLoggingEnabled(false);

    resetRelationshipDiagnostics();

    expect(isRelationshipDiagnosticsEnabled()).toBe(true);
    setRelationshipDiagnosticsConsoleLoggingEnabled(false);
    recordRelationshipDiagnostic('affairChecks');
    expect(flushRelationshipDiagnostics(0, 0, 0)?.affairChecks).toBe(1);
  });
});

describe('L53 — friendship pruning', () => {
  it('drops dead friends and lifts energy only for living ones', () => {
    const survivor = human(1, {
      energy: 50,
      friendships: { friend_99: 80, friend_2: 80 },
    });
    const neighbour = human(2, { energy: 50 });
    const state = makeWorld([survivor, neighbour]);

    advanceSocialRelationships(state, [survivor, neighbour]);

    expect(survivor.friendships?.friend_99).toBeUndefined();
    expect(survivor.friendships?.friend_2).toBe(80);
    // One living strong friend = +0.8; the dead one no longer counts.
    expect(survivor.energy).toBeCloseTo(50.8, 5);
  });
});
