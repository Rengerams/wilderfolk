import Emoji from './Emoji';
import type { WorldState } from '../game/gameEngine';
import type { VisitorGroup } from '../game/gameTypes';
import type { VisitorTradeAction, RefugeeChoice, VisitorLeaderTalkMeta } from '../game/groupEvents';
import { getVisitorTradePriceMult, getVisitorTradeRewardMult } from '../game/gameEngine';

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
  const foodRoom = Math.max(0, state.storageMax.food - state.resources.food);
  const woodRoom = Math.max(0, state.storageMax.wood - state.resources.wood);
  const priceMult = getVisitorTradePriceMult(state.villageReputation ?? 0);
  const rewardMult = getVisitorTradeRewardMult(state.villageReputation ?? 0);
  const buyFoodCost = Math.ceil(25 * priceMult);
  const buyWoodCost = Math.ceil(20 * priceMult);
  const sellFoodReward = Math.floor(25 * rewardMult);
  const sellWoodReward = Math.floor(20 * rewardMult);
  const canBuyFood = state.resources.gold >= buyFoodCost && foodRoom >= 40;
  const canBuyWood = state.resources.gold >= buyWoodCost && woodRoom >= 30;
  const canSellFood = state.resources.food >= 30 && (group.gold ?? 0) >= sellFoodReward;
  const canSellWood = state.resources.wood >= 40 && (group.gold ?? 0) >= sellWoodReward;
  const canTradeKind = group.kind === 'traders' || group.kind === 'nomads' || group.kind === 'hunters';

  return (
    <div className="rounded-xl border border-cyan-600/40 bg-cyan-950/30 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Emoji className="text-lg">{emoji}</Emoji>
          <div className="min-w-0">
            <h3 className="truncate text-xs font-bold text-cyan-200">{group.name}</h3>
            <p className="text-[9px] capitalize text-cyan-300/80">{group.kind} · {group.daysLeft}d · {group.entityIds.length} people · {group.gold ?? 0}💰</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onFocusCamp}
          className="shrink-0 rounded bg-cyan-900/50 px-2 py-1 text-[9px] font-bold text-cyan-100 hover:bg-cyan-800/50"
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
        className="mb-2 w-full rounded bg-indigo-900 px-2 py-1.5 text-[9px] font-bold text-indigo-100 hover:bg-indigo-800 disabled:opacity-40"
      >
        {talkMeta.buttonLabel}
      </button>
      {group.kind === 'refugees' && !(group.refugeeResolved ?? false) && (
        <div className="space-y-1">
          <p className="text-[9px] text-stone-400">Families ask to join your village. Choose how to respond:</p>
          <button
            type="button"
            disabled={state.resources.food < 40 || state.humanPopulation >= state.maxHumanPopulation}
            onClick={() => onRefugeeChoice('welcome')}
            className="w-full rounded bg-emerald-900 px-2 py-1 text-[8px] font-bold text-emerald-100 hover:bg-emerald-800 disabled:opacity-40"
          >
            🤝 Welcome all (40🍖) — up to 2 settlers
          </button>
          <button
            type="button"
            disabled={state.resources.food < 20 || state.humanPopulation >= state.maxHumanPopulation}
            onClick={() => onRefugeeChoice('screen')}
            className="w-full rounded bg-stone-700 px-2 py-1 text-[8px] font-bold text-stone-200 hover:bg-stone-600 disabled:opacity-40"
          >
            🔍 Screen applicants (20🍖) — maybe 1 stays
          </button>
          <button
            type="button"
            onClick={() => onRefugeeChoice('turn_away')}
            className="w-full rounded bg-rose-900 px-2 py-1 text-[8px] font-bold text-rose-100 hover:bg-rose-800"
          >
            🚪 Turn away — they leave early
          </button>
        </div>
      )}
      {group.kind === 'refugees' && (group.refugeeResolved ?? false) && (
        <p className="text-[9px] text-stone-500">Refugee talks concluded for this group.</p>
      )}
      {canTradeKind && (
        <div className="grid grid-cols-1 gap-1">
          {state.villageReputation >= 80 || state.villageReputation <= 30 ? (
            <p className={`text-[8px] font-semibold ${state.villageReputation >= 80 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {state.villageReputation >= 80
                ? '⭐ Reputation 80+ — friendly prices'
                : '⚠️ Reputation 30 or less — they demand harsher terms'}
            </p>
          ) : null}
          <button
            type="button"
            disabled={!canBuyFood}
            onClick={() => onTrade('buy_food')}
            className="w-full rounded bg-stone-700 px-2 py-1 text-[9px] font-bold text-stone-200 hover:bg-stone-600 disabled:opacity-40"
          >
            Buy food · {buyFoodCost}💰 → 40🍖{foodRoom < 40 ? ` (${foodRoom}🍖 space)` : ''}
          </button>
          <button
            type="button"
            disabled={!canBuyWood}
            onClick={() => onTrade('buy_wood')}
            className="w-full rounded bg-stone-700 px-2 py-1 text-[9px] font-bold text-stone-200 hover:bg-stone-600 disabled:opacity-40"
          >
            Buy wood · {buyWoodCost}💰 → 30🪵{woodRoom < 30 ? ` (${woodRoom}🪵 space)` : ''}
          </button>
          <button
            type="button"
            disabled={!canSellFood}
            onClick={() => onTrade('sell_food')}
            className="w-full rounded bg-amber-900 px-2 py-1 text-[9px] font-bold text-amber-100 hover:bg-amber-800 disabled:opacity-40"
            title={(group.gold ?? 0) < sellFoodReward ? 'They have no gold left' : undefined}
          >
            Sell food · 30🍖 → {sellFoodReward}💰{(group.gold ?? 0) < sellFoodReward ? ' (out of gold)' : ''}
          </button>
          <button
            type="button"
            disabled={!canSellWood}
            onClick={() => onTrade('sell_wood')}
            className="w-full rounded bg-amber-900 px-2 py-1 text-[9px] font-bold text-amber-100 hover:bg-amber-800 disabled:opacity-40"
            title={(group.gold ?? 0) < sellWoodReward ? 'They have no gold left' : undefined}
          >
            Sell wood · 40🪵 → {sellWoodReward}💰{(group.gold ?? 0) < sellWoodReward ? ' (out of gold)' : ''}
          </button>
        </div>
      )}
      {!canTradeKind && group.kind !== 'refugees' && (
        <p className="text-[9px] text-stone-500">Passive gifts each day while they camp nearby.</p>
      )}
    </div>
  );
}
