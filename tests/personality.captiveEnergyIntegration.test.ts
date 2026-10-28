/**
 * PR B — the foreign-captive energy path keeps no DNA of its own.
 *
 * `humanNeeds.humanEnergyLoss` used to scale a captive's energy by Greenthumb's winter resistance and
 * a flat Hardy/Fierce reduction. PR B retires those three terms: the captive equation is now the
 * non-DNA base, cold, home and hospital terms only, while a player settler's DNA acts through
 * `humanPhysiology.advanceHumanNeeds` on its own `needs` state. This suite proves both halves — no
 * trait moves captive energy, and the two state machines stay separate.
 */
import { describe, expect, it } from 'vitest';
import { humanEnergyLoss } from '../src/game/simulation/humanNeeds';
import { advanceHumanNeeds, initialHumanNeeds } from '../src/game/simulation/humanPhysiology';
import { SPECIES_CONFIG } from '../src/game/speciesConfig';
import { EntityType } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';
import type { SettlerTrait } from '../src/game/settlerTraits';
import { TICKS_PER_HOUR } from '../src/game/dayCycleClock';

const CONFIG = SPECIES_CONFIG[EntityType.Human];
const START_ENERGY = 400;
const MAX_ENERGY = 500;

interface EnergyOptions {
  hasWell?: boolean;
  isWinter?: boolean;
  canHeat?: boolean;
  hasHospital?: boolean;
}

function settler(traits: SettlerTrait[]): Entity {
  return {
    id: 7,
    type: EntityType.Human,
    alive: true,
    isJuvenile: false,
    traits,
    energy: START_ENERGY,
    maxEnergy: MAX_ENERGY,
    needs: initialHumanNeeds(START_ENERGY, MAX_ENERGY),
  } as Entity;
}

/** Captive energy drain for one trait set, driven through the real owner. */
function captiveLoss(traits: SettlerTrait[], options: EnergyOptions = {}): number {
  return humanEnergyLoss(settler(traits), CONFIG, {
    hasWell: options.hasWell ?? true,
    isWinter: options.isWinter ?? false,
    canHeat: options.canHeat ?? true,
    hasHospital: options.hasHospital ?? false,
    tick: 12,
    hourOfDay: 12,
    buildingById: new Map(),
  });
}

describe('a foreign captive\'s energy carries no DNA', () => {
  it('ignores the three retired trait terms in every season and shelter state', () => {
    const scenarios: EnergyOptions[] = [
      {},
      { hasWell: false },
      { isWinter: true, canHeat: false },
      { isWinter: true, canHeat: false, hasWell: false, hasHospital: true },
    ];
    for (const scenario of scenarios) {
      const plain = captiveLoss([], scenario);
      for (const traits of [['greenthumb'], ['hardy'], ['fierce'], ['greenthumb', 'hardy', 'fierce']]) {
        expect(captiveLoss(traits as SettlerTrait[], scenario), JSON.stringify({ traits, scenario }))
          .toBeCloseTo(plain, 12);
      }
    }
  });

  it('keeps the non-DNA base, cold, well and hospital terms', () => {
    const base = captiveLoss([]);
    expect(captiveLoss([], { hasWell: false }), 'a well still eases the base strain')
      .toBeGreaterThan(base);
    expect(captiveLoss([], { isWinter: true, canHeat: false }), 'unheated winter still bites')
      .toBeGreaterThan(base);
    expect(captiveLoss([], { isWinter: true, canHeat: true }), 'a heated home still shelters')
      .toBeCloseTo(base, 12);
    expect(captiveLoss([], { hasHospital: true }), 'hospital care still helps')
      .toBeLessThan(base);
  });

  it('keeps the player need state and the captive energy reserve apart', () => {
    const player = settler(['hardy']);
    const startingStamina = player.needs!.stamina;

    advanceHumanNeeds(player, {
      tick: 0, elapsedTicks: TICKS_PER_HOUR, sleeping: false, working: true, moving: false,
    });
    expect(player.needs!.stamina, 'the player work drain still runs').toBeLessThan(startingStamina);
    // The legacy energy field is a one-way projection of the need state, never an input to it.
    expect(player.energy).toBeCloseTo(MAX_ENERGY * player.needs!.stamina / 100, 10);

    const wellFed = captiveLoss([], { hasWell: true });
    const captive = settler([]);
    captive.needs = { ...captive.needs!, nutrition: 1, rest: 1, stamina: 1 };
    const starvedNeeds = { ...captive.needs };

    expect(humanEnergyLoss(captive, CONFIG, {
      hasWell: true, isWinter: false, canHeat: true, hasHospital: false,
      tick: 12, hourOfDay: 12, buildingById: new Map(),
    }), 'captive loss ignores the player need state').toBeCloseTo(wellFed, 12);
    expect(captive.needs, 'the captive equation reads energy and never writes needs')
      .toEqual(starvedNeeds);
  });
});
