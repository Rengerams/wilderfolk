import Emoji from './Emoji';
import type { WorldState } from '../game/gameEngine';
import type { VisitorGroup } from '../game/gameTypes';
import type { VisitorTradeAction, RefugeeChoice, VisitorLeaderTalkMeta } from '../game/groupEvents';
import {
  getRefugeeChoiceEligibility,
  getVisitorTradeEligibility,
  getVisitorTradeTerms,
  REFUGEE_SCREEN_FOOD,
  REFUGEE_WELCOME_FOOD,
} from '../game/groupEvents';
import { REPUTATION_FRIENDLY_MIN, REPUTATION_HARSH_MAX, getReputationBand } from '../game/simHelpers';
import { getAvailableStorageHeadroom } from '../game/resourceUtils';
import { getRefugeeWelcomeBonus } from '../game/townHall';

const VISITOR_KIND_EMOJI: Record<VisitorGroup['kind'], string> = {
  traders: '🛒', pilgrims: '🕯️', scholars: '📚', hunters: '🏹',
  nomads: '🐎', refugees: '🧳', performers: '🎭',
};

export default function VisitorCampPanel({
  group,
  state,
  talkMeta,
  onTalkLeader,
  onTrade,
  onRefugeeChoice,
  onFocusCamp,
}: {
  group: VisitorGroup;
  state: WorldState;
  talkMeta: VisitorLeaderTalkMeta;
  onTalkLeader: () => void;
  onTrade: (action: VisitorTradeAction) => void;
  onRefugeeChoice: (choice: RefugeeChoice) => void;
  onFocusCamp: () => void;
}) {
  const emoji = VISITOR_KIND_EMOJI[group.kind];
  // Storage headroom comes from its owner (`resourceUtils`), which is what the trade owner itself
  // calls; the panel's local `max(0, cap - current)` dropped the owner's non-finite-cap branch, so
 // the "(N space)" hint could lie.
  const foodRoom = getAvailableStorageHeadroom(state, 'food');
  const woodRoom = getAvailableStorageHeadroom(state, 'wood');
  const stoneRoom = getAvailableStorageHeadroom(state, 'stone');
  const ironRoom = getAvailableStorageHeadroom(state, 'iron');
  // The band is classified by the reputation owner (`getReputationBand`), so the banner
  // cannot advertise terms the owner no longer applies (audit "Reputation 80/30 bands"). It asks
  // for the *band*, not the price multiplier: pricing stays in the trade owner (F18).
  const repBand = getReputationBand(state.villageReputation);
  const canTradeKind = group.kind === 'traders' || group.kind === 'nomads' || group.kind === 'hunters';
  // Prices **and** gates come from the trade owner (`groupEvents`). The panel used to re-derive the
  // multiplier arithmetic itself and gate on that arithmetic, so a button stayed enabled for a caravan
  // that was leaving, a group with no gold, and — the reachable case — insufficient storage for what the
  // trade *receives*: clicking then consumed nothing and pushed its message at the camp, far from the
  // panel being read (`LIVE-FINDINGS-STATUS.md`, F18). Prices as a second implementation also meant a
  // balance change would desynchronise the quote from the charge.
  const termsFor = (action: VisitorTradeAction) => getVisitorTradeTerms(state, action);
  const gateFor = (action: VisitorTradeAction) => getVisitorTradeEligibility(state, group.id, action);
  const buyFoodGate = gateFor('buy_food');
  const buyWoodGate = gateFor('buy_wood');
  const buyStoneGate = gateFor('buy_stone');
  const buyIronGate = gateFor('buy_iron');
  const sellFoodGate = gateFor('sell_food');
  const sellWoodGate = gateFor('sell_wood');
  const sellStoneGate = gateFor('sell_stone');
  const sellIronGate = gateFor('sell_iron');
  const buyFoodCost = termsFor('buy_food').effectivePay.gold ?? 0;
  const buyWoodCost = termsFor('buy_wood').effectivePay.gold ?? 0;
  const buyStoneCost = termsFor('buy_stone').effectivePay.gold ?? 0;
  const buyIronCost = termsFor('buy_iron').effectivePay.gold ?? 0;
  const buyFoodGain = termsFor('buy_food').effectiveReceive.food ?? 0;
  const buyWoodGain = termsFor('buy_wood').effectiveReceive.wood ?? 0;
  const buyStoneGain = termsFor('buy_stone').effectiveReceive.stone ?? 0;
  const buyIronGain = termsFor('buy_iron').effectiveReceive.iron ?? 0;
  const sellFoodPay = termsFor('sell_food').effectivePay.food ?? 0;
  const sellWoodPay = termsFor('sell_wood').effectivePay.wood ?? 0;
  const sellStonePay = termsFor('sell_stone').effectivePay.stone ?? 0;
  const sellIronPay = termsFor('sell_iron').effectivePay.iron ?? 0;
  const sellFoodReward = termsFor('sell_food').effectiveReceive.gold ?? 0;
  const sellWoodReward = termsFor('sell_wood').effectiveReceive.gold ?? 0;
  const sellStoneReward = termsFor('sell_stone').effectiveReceive.gold ?? 0;
  const sellIronReward = termsFor('sell_iron').effectiveReceive.gold ?? 0;
  const refusal = (gate: { ok: boolean; blockReason?: string }) =>
    gate.ok ? '' : ` — ${gate.blockReason ?? 'unavailable'}`;
  // Refugee prices and gates come from the refugee owner (`groupEvents`), exactly as the trade
  // buttons above do. The panel used to hand-write `food < 40 / 20` and the population-cap test,
  // so both buttons greyed out with no visible reason and a retuned price left them enabled while
 // the refusal surfaced as a floating text at the camp.
  const welcomeGate = getRefugeeChoiceEligibility(state, group.id, 'welcome');
  const screenGate = getRefugeeChoiceEligibility(state, group.id, 'screen');
  // How many settlers a full welcome admits is `2 + getRefugeeWelcomeBonus(state.buildings)`
  // (`groupEvents.negotiateRefugees`): the base 2 is that owner's inline literal, the bonus is
  // `townHall`'s. The label used to hardcode "up to 2 settlers", so a village with a staffed Town
  // Hall advertised one fewer settler than the owner actually admits.
  const welcomeCapacity = 2 + getRefugeeWelcomeBonus(state.buildings);

  return (
    <div className="rounded-xl border border-cyan-600/40 bg-cyan-950/30 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Emoji className="text-lg">{emoji}</Emoji>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-cyan-200">{group.name}</h3>
            <p className="text-[11px] capitalize text-cyan-300/80">{group.kind} · {group.daysLeft}d · {group.entityIds.length} people · {group.gold ?? 0}💰</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onFocusCamp}
          className="shrink-0 rounded bg-cyan-900/50 px-2 py-1 text-[11px] font-bold text-cyan-100 hover:bg-cyan-800/50"
          title="Center map on camp"
        >
          📍
        </button>
      </div>
      <button
        type="button"
        disabled={group.leaderTalked || !!talkMeta.unavailableReason}
        onClick={onTalkLeader}
        title={talkMeta.hint}
        className="mb-2 w-full rounded bg-indigo-900 px-2 py-1.5 text-[11px] font-bold text-indigo-100 hover:bg-indigo-800 disabled:opacity-40"
      >
        {talkMeta.buttonLabel}
      </button>
      {group.kind === 'refugees' && !(group.refugeeResolved ?? false) && (
        <div className="space-y-1">
          <p className="text-[11px] text-stone-300">Families ask to join your village. Choose how to respond:</p>
          <button
            type="button"
            disabled={!welcomeGate.ok}
            onClick={() => onRefugeeChoice('welcome')}
            title={welcomeGate.blockReason}
            className="w-full rounded bg-emerald-900 px-2 py-1 text-[10px] font-bold text-emerald-100 hover:bg-emerald-800 disabled:opacity-40"
          >
            🤝 Welcome all ({REFUGEE_WELCOME_FOOD}🍖) — up to {welcomeCapacity} settlers{refusal(welcomeGate)}
          </button>
          <button
            type="button"
            disabled={!screenGate.ok}
            onClick={() => onRefugeeChoice('screen')}
            title={screenGate.blockReason}
            className="w-full rounded bg-stone-700 px-2 py-1 text-[10px] font-bold text-stone-200 hover:bg-stone-600 disabled:opacity-40"
          >
            🔍 Screen applicants ({REFUGEE_SCREEN_FOOD}🍖) — maybe 1 stays{refusal(screenGate)}
          </button>
          <button
            type="button"
            onClick={() => onRefugeeChoice('turn_away')}
            className="w-full rounded bg-rose-900 px-2 py-1 text-[10px] font-bold text-rose-100 hover:bg-rose-800"
          >
            🚪 Turn away — they leave early
          </button>
        </div>
      )}
      {group.kind === 'refugees' && (group.refugeeResolved ?? false) && (
        <p className="text-[11px] text-stone-300">Refugee talks concluded for this group.</p>
      )}
      {canTradeKind && (
        <div className="grid grid-cols-1 gap-1">
          {repBand !== 'normal' ? (
            <p className={`text-[10px] font-semibold ${repBand === 'friendly' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {repBand === 'friendly'
                ? `⭐ Reputation ${REPUTATION_FRIENDLY_MIN}+ — friendly prices`
                : `⚠️ Reputation ${REPUTATION_HARSH_MAX} or less — they demand harsher terms`}
            </p>
          ) : null}
          <button
            type="button"
            disabled={!buyFoodGate.ok}
            onClick={() => onTrade('buy_food')}
            title={buyFoodGate.blockReason}
            className="w-full rounded bg-stone-700 px-2 py-1 text-[11px] font-bold text-stone-200 hover:bg-stone-600 disabled:opacity-40"
          >
            Buy food · {buyFoodCost}💰 → {buyFoodGain}🍖{foodRoom < buyFoodGain ? ` (${foodRoom}🍖 space)` : ''}{refusal(buyFoodGate)}
          </button>
          <button
            type="button"
            disabled={!buyWoodGate.ok}
            onClick={() => onTrade('buy_wood')}
            title={buyWoodGate.blockReason}
            className="w-full rounded bg-stone-700 px-2 py-1 text-[11px] font-bold text-stone-200 hover:bg-stone-600 disabled:opacity-40"
          >
            Buy wood · {buyWoodCost}💰 → {buyWoodGain}🪵{woodRoom < buyWoodGain ? ` (${woodRoom}🪵 space)` : ''}{refusal(buyWoodGate)}
          </button>
          <button
            type="button"
            disabled={!buyStoneGate.ok}
            onClick={() => onTrade('buy_stone')}
            title={buyStoneGate.blockReason}
            className="w-full rounded bg-stone-700 px-2 py-1 text-[11px] font-bold text-stone-200 hover:bg-stone-600 disabled:opacity-40"
          >
            Buy stone · {buyStoneCost}💰 → {buyStoneGain}🪨{stoneRoom < buyStoneGain ? ` (${stoneRoom}🪨 space)` : ''}{refusal(buyStoneGate)}
          </button>
          <button
            type="button"
            disabled={!buyIronGate.ok}
            onClick={() => onTrade('buy_iron')}
            title={buyIronGate.blockReason}
            className="w-full rounded bg-stone-700 px-2 py-1 text-[11px] font-bold text-stone-200 hover:bg-stone-600 disabled:opacity-40"
          >
            Buy iron · {buyIronCost}💰 → {buyIronGain}🔩{ironRoom < buyIronGain ? ` (${ironRoom}🔩 space)` : ''}{refusal(buyIronGate)}
          </button>
          <button
            type="button"
            disabled={!sellFoodGate.ok}
            onClick={() => onTrade('sell_food')}
            className="w-full rounded bg-amber-900 px-2 py-1 text-[11px] font-bold text-amber-100 hover:bg-amber-800 disabled:opacity-40"
            title={sellFoodGate.blockReason}
          >
            Sell food · {sellFoodPay}🍖 → {sellFoodReward}💰{refusal(sellFoodGate)}
          </button>
          <button
            type="button"
            disabled={!sellWoodGate.ok}
            onClick={() => onTrade('sell_wood')}
            className="w-full rounded bg-amber-900 px-2 py-1 text-[11px] font-bold text-amber-100 hover:bg-amber-800 disabled:opacity-40"
            title={sellWoodGate.blockReason}
          >
            Sell wood · {sellWoodPay}🪵 → {sellWoodReward}💰{refusal(sellWoodGate)}
          </button>
          <button
            type="button"
            disabled={!sellStoneGate.ok}
            onClick={() => onTrade('sell_stone')}
            className="w-full rounded bg-amber-900 px-2 py-1 text-[11px] font-bold text-amber-100 hover:bg-amber-800 disabled:opacity-40"
            title={sellStoneGate.blockReason}
          >
            Sell stone · {sellStonePay}🪨 → {sellStoneReward}💰{refusal(sellStoneGate)}
          </button>
          <button
            type="button"
            disabled={!sellIronGate.ok}
            onClick={() => onTrade('sell_iron')}
            className="w-full rounded bg-amber-900 px-2 py-1 text-[11px] font-bold text-amber-100 hover:bg-amber-800 disabled:opacity-40"
            title={sellIronGate.blockReason}
          >
            Sell iron · {sellIronPay}🔩 → {sellIronReward}💰{refusal(sellIronGate)}
          </button>
        </div>
      )}
      {!canTradeKind && group.kind !== 'refugees' && (
        <p className="text-[11px] text-stone-300">Passive gifts each day while they camp nearby.</p>
      )}
    </div>
  );
}