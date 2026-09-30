/**
 * F18 — the visitor trade buttons stayed enabled for trades that must fail
 * (`docs/private/audits/2026-09-16/ui-logic.md`, tracked in `LIVE-FINDINGS-STATUS.md`).
 *
 * `VisitorCampPanel` re-derived the price multipliers and gated on its own arithmetic, while the owning
 * eligibility (`groupEvents.getVisitorTradeEligibility`) additionally rejects a **leaving caravan**
 * (`daysLeft <= 0`), a group that is **out of gold**, and — the reachable case the panel missed —
 * **insufficient storage for what the trade receives**: with gold at its cap, "Sell food · 30🍖 → 25💰"
 * stayed enabled, and clicking it consumed nothing and pushed a floating text at the camp, far from the
 * panel the player was reading. Prices were a second implementation of
 * `VISITOR_TRADE_COSTS × getVisitorTradeTerms`, so any balance change desynchronised the quote from the
 * charge. Both now come from the owner.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initGame } from '../src/game/worldGen';
import {
  getRefugeeChoiceEligibility,
  getVisitorTradeEligibility,
  getVisitorTradeTerms,
  VISITOR_TRADE_COSTS,
} from '../src/game/groupEvents';
import type { WorldState } from '../src/game/gameTypes';

const FIXTURE_SEED = 20_260_917;
const GROUP_ID = 'visitors-1';
/** Small gold cap so "the store cannot take the payment" is one assignment away. */
const GOLD_CAP = 100;

function worldWithTrader(options: { gold?: number; daysLeft?: number; groupGold?: number } = {}): WorldState {
  const state = initGame({ seed: FIXTURE_SEED });
  const { gold = 500, daysLeft = 3, groupGold = 500 } = options;
  state.storageMax.gold = GOLD_CAP;
  state.resources.gold = gold;
  state.resources.food = 400;
  state.visitorGroups = [
    {
      id: GROUP_ID,
      name: 'Traders',
      kind: 'traders',
      daysLeft,
      gold: groupGold,
      campX: 100,
      campY: 100,
      entityIds: [],
    } as never,
  ];
  return state;
}

function worldWithRefugees(options: { food?: number; maxPopulation?: number } = {}): WorldState {
  const state = initGame({ seed: FIXTURE_SEED });
  const { food = 100, maxPopulation = 500 } = options;
  state.resources.food = food;
  state.maxHumanPopulation = maxPopulation;
  state.visitorGroups = [
    {
      id: GROUP_ID,
      name: 'Refugees',
      kind: 'refugees',
      daysLeft: 3,
      gold: 0,
      campX: 100,
      campY: 100,
      entityIds: [],
    } as never,
  ];
  return state;
}

describe('visitor trade eligibility is the panel\'s source of truth', () => {
  it('quotes prices from the owner, not from a second implementation', () => {
    const state = worldWithTrader();
    state.villageReputation = 100; // >= 80 → 0.8 on gold paid, 1.15 on gold received
    expect(getVisitorTradeTerms(state, 'buy_food').effectivePay.gold).toBe(20);
    expect(getVisitorTradeTerms(state, 'buy_food').effectiveReceive.food).toBe(40);
    expect(getVisitorTradeTerms(state, 'sell_food').effectiveReceive.gold).toBe(28); // floor(25 × 1.15)
    expect(getVisitorTradeTerms(state, 'sell_wood').effectivePay.wood).toBe(40);

    // The catalogue the owner reads is the one the panel used to re-derive.
    expect(VISITOR_TRADE_COSTS.buy_food.pay.gold).toBe(25);
    expect(VISITOR_TRADE_COSTS.sell_food.pay.food).toBe(30);
    expect(VISITOR_TRADE_COSTS.buy_iron.receive.iron).toBe(12);
    expect(VISITOR_TRADE_COSTS.sell_iron.pay.iron).toBe(15);
  });

  it('refuses a sale the store cannot take, which is why the button must be disabled', () => {
    const state = worldWithTrader({ gold: GOLD_CAP });
    const gate = getVisitorTradeEligibility(state, GROUP_ID, 'sell_food');
    expect(gate.ok).toBe(false);
    expect(gate.blockReason).toBe('Cannot store more gold');

    const roomy = worldWithTrader({ gold: 0 });
    expect(getVisitorTradeEligibility(roomy, GROUP_ID, 'sell_food').ok).toBe(true);
  });

  it('refuses a leaving caravan and a group with no gold', () => {
    const leaving = worldWithTrader({ daysLeft: 0 });
    expect(getVisitorTradeEligibility(leaving, GROUP_ID, 'sell_food').blockReason).toBe('The caravan is leaving');

    const broke = worldWithTrader({ groupGold: 0 });
    const gate = getVisitorTradeEligibility(broke, GROUP_ID, 'sell_food');
    expect(gate.ok).toBe(false);
    expect(gate.blockReason).toBe('They are out of gold');
  });

  it('keeps the panel on the owner for prices and gates', () => {
    const panel = readFileSync(resolve(process.cwd(), 'src/components/VisitorCampPanel.tsx'), 'utf8');
    expect(panel).toContain('getVisitorTradeTerms(state, action)');
    expect(panel).toContain('getVisitorTradeEligibility(state, group.id, action)');
    expect(panel, 'the panel re-derives the price multipliers again')
      .not.toMatch(/getVisitorTradePriceMult|getVisitorTradeRewardMult/);
  });
});

/**
 * R5 of the 2026-09-17 UI audit: the same defect class as F18, one block lower in the same panel.
 * The refugee buttons gated on hand-written literals (`food < 40` / `food < 20` plus a raw
 * population-cap comparison) and carried no reason, so a retune left them enabled while the
 * refusal surfaced as a floating text at the camp — and "need 40🍖" was indistinguishable from
 * "population cap reached" on a greyed-out button.
 */
describe('refugee choice eligibility is the panel\'s source of truth (R5)', () => {
  it('prices each offer from the owner and names the reason it refuses', () => {
    const poor = worldWithRefugees({ food: 39 });
    const welcome = getRefugeeChoiceEligibility(poor, GROUP_ID, 'welcome');
    expect(welcome.ok).toBe(false);
    expect(welcome.blockReason).toBe('Need 40🍖');
    // The cheaper offer is still affordable at 39 food — the two gates are not one threshold.
    expect(getRefugeeChoiceEligibility(poor, GROUP_ID, 'screen').ok).toBe(true);

    const rich = worldWithRefugees({ food: 100, maxPopulation: 0 });
    expect(getRefugeeChoiceEligibility(rich, GROUP_ID, 'welcome').blockReason).toBe('Population cap reached');
    expect(getRefugeeChoiceEligibility(rich, GROUP_ID, 'screen').blockReason).toBe('Population cap reached');
  });

  it('always allows turning a group away', () => {
    const state = worldWithRefugees({ food: 0, maxPopulation: 0 });
    expect(getRefugeeChoiceEligibility(state, GROUP_ID, 'turn_away').ok).toBe(true);
  });

  it('keeps the panel on the owner for both buttons and both prices', () => {
    const panel = readFileSync(resolve(process.cwd(), 'src/components/VisitorCampPanel.tsx'), 'utf8');
    expect(panel).toContain("getRefugeeChoiceEligibility(state, group.id, 'welcome')");
    expect(panel).toContain("getRefugeeChoiceEligibility(state, group.id, 'screen')");
    expect(panel, 'the panel quotes a second copy of the refugee prices').toMatch(
      /REFUGEE_WELCOME_FOOD[\s\S]*REFUGEE_SCREEN_FOOD|REFUGEE_SCREEN_FOOD[\s\S]*REFUGEE_WELCOME_FOOD/,
    );
    expect(panel, 'the panel re-derives the refugee price or cap rule').not.toMatch(
      /resources\.food < (40|20)|humanPopulation >= state\.maxHumanPopulation/,
    );
  });
});
