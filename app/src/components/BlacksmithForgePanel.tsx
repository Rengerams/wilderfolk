import {
  FORGE_ORDERS,
  formatForgeInputs,
  getForgeBlockReason,
  getForgeOrder,
  isForgeOrderComplete,
  type ForgeOrderId,
} from '../game/forge';
import type { WorldState } from '../game/gameTypes';

interface Props {
  state: WorldState;
  buildingId: number;
  onQueueForge: (orderId: ForgeOrderId) => void;
}

export default function BlacksmithForgePanel({ state, buildingId, onQueueForge }: Props) {
  const forge = state.villageForge;
  if (!forge) return null;
  const staffed = state.buildings.some(
    (b) => b.id === buildingId && b.completed && (b.occupants?.length ?? 0) > 0,
  );
  const activeOrder = forge.activeOrder ? getForgeOrder(forge.activeOrder) : undefined;
  const anyReady = FORGE_ORDERS.some((order) => isForgeOrderComplete(forge, order.id));

  return (
    <div className="mt-2 space-y-1.5 rounded-lg border border-orange-700/40 bg-orange-950/30 p-2">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-orange-300">Village forge</p>
      <p className="text-[9px] leading-relaxed text-stone-400">
        Research unlocks orders; each needs materials <strong className="text-stone-300">and</strong> a staffed forge run (~6–7 days).
      </p>

      {forge.activeOrder && activeOrder && (
        <div className="rounded bg-stone-900/60 px-2 py-1.5">
          <p className="text-[10px] font-bold text-amber-200">
            🔨 Forging {activeOrder.label}
          </p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-700">
            <div
              className="h-full rounded-full bg-orange-500 transition-all"
              style={{ width: `${forge.progress}%` }}
            />
          </div>
          <p className="mt-0.5 text-[8px] text-stone-500">{Math.round(forge.progress)}% · ticks while smith is staffed</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-1">
        {FORGE_ORDERS.map((order) => {
          const ready = isForgeOrderComplete(forge, order.id);
          const active = forge.activeOrder === order.id;
          const block = getForgeBlockReason(state, order.id);
          const canQueue = block == null && !ready;
          return (
            <button
              key={order.id}
              type="button"
              disabled={active || !canQueue}
              title={block ?? (ready ? 'Already forged' : order.description)}
              onClick={() => onQueueForge(order.id)}
              className={`rounded px-2 py-1.5 text-left text-[8px] transition-all ${
                ready
                  ? 'border border-emerald-600/40 bg-emerald-950/40 text-emerald-300'
                  : active
                    ? 'border border-orange-500/50 bg-orange-900/40 text-orange-100'
                    : canQueue
                      ? 'bg-stone-800/80 text-stone-200 hover:bg-stone-700'
                      : 'bg-stone-900/50 text-stone-500'
              }`}
            >
              <span className="font-bold">
                {ready ? '✓ ' : ''}{order.emoji} {order.label}
              </span>
              <span className="block text-[7px] opacity-80">{order.description}</span>
              <span className="block text-[7px] opacity-80">{formatForgeInputs(order.inputs)}</span>
              {!ready && !active && block && (
                <span className="block text-[7px] text-amber-500/90">{block}</span>
              )}
            </button>
          );
        })}
      </div>

      {!staffed && !anyReady && (
        <p className="text-[8px] text-amber-400">⚠️ Assign a worker — forge pauses when unstaffed.</p>
      )}
    </div>
  );
}