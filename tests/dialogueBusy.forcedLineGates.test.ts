/**
 * Forced-line busy gates — regression for the F-chat-2 class outside `humanChat.ts`.
 *
 * F-chat-2 was: a guard tests the raw `chatTicks` **visible-line counter** where the pinned contract is
 * `isDialogueBusy` (line **or** live paired session). `showDialogueStep` clears the idle half's counter
 * while keeping its session key, so the idle half of a live pair reads as *free* to a raw-counter test.
 * A forced line then takes that settler over, abandoning the pair.
 *
 * `humanChat.ts` was converted first; the same shape survived in the modules that speak forced lines at
 * hoteliers, patients, doctors, leaders, officials and petitioners. This pins the one of those that is
 * directly callable with a hand-built state.
 *
 * Red-before: with the pre-fix `if ((hotelier.chatTicks ?? 0) > 0) return;` the busy case below speaks,
 * because the idle half's counter is 0. The free case is the control — it must speak either way, so a
 * gate that simply never speaks cannot pass this file.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { Building, WorldState } from '../src/game/gameTypes';
import { hotelierGreetGuests } from '../src/game/hotelStay';
import { initGame } from '../src/game/worldGen';
import { isPlayerHuman } from '../src/game/playerHuman';

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

/** The first tick inside a day at which the hotelier's own roll lets it speak. */
function firstSpeakingTick(state: WorldState, hotelier: WorldState['entities'][number]): number | null {
  const hotel = state.buildings.find((b) => b.id === HOTEL_ID)!;
  for (let tick = 0; tick <= 72; tick++) {
    hotelier.chatPhrase = undefined;
    hotelier.chatTicks = undefined;
    state.tick = tick;
    hotelierGreetGuests(state, hotelier, hotel);
    if (hotelier.chatPhrase) return tick;
  }
  return null;
}

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

    // Pre-fix this spoke, because `chatTicks === 0` read as free.
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
