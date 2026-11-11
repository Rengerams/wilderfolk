/**
 * Forced-line busy gates must use `isDialogueBusy` (visible line or live paired session),
 * never the raw `chatTicks` visible-line counter.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { Building, WorldState } from '../src/game/gameTypes';
import { hotelierGreetGuests } from '../src/game/hotelStay';
import { initGame } from '../src/game/worldGen';
import { isPlayerHuman } from '../src/game/playerHuman';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { resetDialogueSessions } from '../src/game/humanChat';

const SEED = 20_260_920;
const HOTEL_ID = 90_001;

function hotelWorld(): { state: WorldState; hotelier: WorldState['entities'][number] } {
  const state = initGame({ seed: SEED });
  const hotelier = state.entities.find((e) => e.alive && isPlayerHuman(e));
  expect(hotelier, 'fixture premise: the colony starts with a settler').toBeTruthy();

  state.buildings.push({
    id: HOTEL_ID,
    type: BuildingType.Hotel,
    x: 0,
    y: 0,
    width: 4,
    height: 4,
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    faction: 'player',
    hotelGuestIds: [1, 2],
  } as unknown as Building);

  return { state, hotelier: hotelier! };
}

/** Search a full 24-hour day at the authoritative 12 ticks/hour (`TICKS_PER_DAY`). */
function firstSpeakingTick(state: WorldState, hotelier: WorldState['entities'][number]): number | null {
  const hotel = state.buildings.find((b) => b.id === HOTEL_ID)!;
  for (let tick = 0; tick < TICKS_PER_DAY; tick++) {
    hotelier.chatPhrase = undefined;
    hotelier.chatTicks = undefined;
    state.tick = tick;
    hotelierGreetGuests(state, hotelier, hotel);
    if (hotelier.chatPhrase) return tick;
  }
  return null;
}

beforeEach(resetDialogueSessions);
afterEach(resetDialogueSessions);

describe('forced-line gates use the owner predicate, not the visible-line counter', () => {
  it('control: a free hotelier does speak, so the gate is not a blanket refusal', () => {
    const { state, hotelier } = hotelWorld();
    expect(firstSpeakingTick(state, hotelier)).not.toBeNull();
  });

  it('an idle half of a live pair does NOT get taken over by a forced line', () => {
    const { state, hotelier } = hotelWorld();
    const speakingTick = firstSpeakingTick(state, hotelier);
    expect(speakingTick, 'fixture premise: this hotelier speaks at some tick').not.toBeNull();

    // The state `showDialogueStep` leaves the idle half in: visible line over, session still live.
    hotelier.chatTicks = 0;
    hotelier.chatDialogueSessionKey = '9001:9002';
    hotelier.chatPartnerId = 9002;
    hotelier.chatPhrase = undefined;
    state.tick = speakingTick!;

    hotelierGreetGuests(state, hotelier, state.buildings.find((b) => b.id === HOTEL_ID)!);

    // A zero `chatTicks` is not free while the paired session is live.
    expect(hotelier.chatPhrase, 'the paired hotelier must not be interrupted').toBeUndefined();
  });

  it('a hotelier showing a visible line is not interrupted either', () => {
    const { state, hotelier } = hotelWorld();
    const speakingTick = firstSpeakingTick(state, hotelier);
    expect(speakingTick).not.toBeNull();

    hotelier.chatTicks = 30;
    hotelier.chatDialogueSessionKey = undefined;
    hotelier.chatPhrase = undefined;
    state.tick = speakingTick!;

    hotelierGreetGuests(state, hotelier, state.buildings.find((b) => b.id === HOTEL_ID)!);

    expect(hotelier.chatPhrase).toBeUndefined();
  });
});
