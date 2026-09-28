import type { VillageRequest, VillageRequestChoice } from '../game/gameTypes';
import Emoji from './Emoji';

export default function VillageRequestCard({
  request,
  onResolve,
  acceptBlockedReason,
}: {
  request: VillageRequest;
  onResolve: (requestId: string, choice: VillageRequestChoice['id']) => void;
  /**
   * Why Accept would be refused, straight from the owner
   * (`getVillageRequestEligibility(state, request, 'accept').blockReason`). Without it an unaffordable
   * offer looked like a dead button: the card stayed and the explanation arrived as a 12-second toast
   * somewhere else. The raid and diplomacy cards already refuse by omitting the click
   * (`LIVE-FINDINGS-STATUS.md`, F13).
   */
  acceptBlockedReason?: string | null;
}) {
  const accept = request.choices.find((choice) => choice.id === 'accept');
  const decline = request.choices.find((choice) => choice.id === 'decline');

  return (
    <section
      className="pointer-events-auto fixed left-1/2 top-14 z-[201] w-[min(100%-1.5rem,24rem)] -translate-x-1/2 rounded-lg border border-amber-500/45 bg-stone-950/95 p-3 shadow-lg backdrop-blur"
      aria-label={request.title}
    >
      <div className="flex items-start gap-2">
        <Emoji className="mt-0.5 text-xl">{request.emoji}</Emoji>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Village request</p>
          <h3 className="text-sm font-bold text-white">{request.title}</h3>
          <p className="mt-1 text-xs leading-5 text-stone-300">{request.description}</p>
          <p className="mt-1 text-xs text-stone-400">Offer ends when {request.sourceName} leaves the valley.</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {accept && (
          <button
            type="button"
            disabled={!!acceptBlockedReason}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onResolve(request.id, accept.id)}
            className={`rounded-md border px-2.5 py-2 text-left text-xs ${
              acceptBlockedReason
                ? 'cursor-not-allowed border-amber-600/50 bg-stone-900/70'
                : 'border-emerald-500/50 bg-emerald-950/70 hover:bg-emerald-900/80'
            }`}
          >
            <span className={`block font-semibold ${acceptBlockedReason ? 'text-amber-300' : 'text-emerald-300'}`}>{accept.label}</span>
            <span className={`block pt-0.5 ${acceptBlockedReason ? 'text-amber-100/80' : 'text-emerald-100/80'}`}>
              {acceptBlockedReason ?? accept.detail}
            </span>
          </button>
        )}
        {decline && (
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onResolve(request.id, decline.id)}
            className="rounded-md border border-stone-600 bg-stone-800/80 px-2.5 py-2 text-left text-xs hover:bg-stone-700"
          >
            <span className="block font-semibold text-stone-200">{decline.label}</span>
            <span className="block pt-0.5 text-stone-400">{decline.detail}</span>
          </button>
        )}
      </div>
    </section>
  );
}