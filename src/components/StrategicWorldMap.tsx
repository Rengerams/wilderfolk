import { memo } from 'react';
import type { WorldState } from '../game/gameTypes';
import { getPlayerCampCenter } from '../game/villageAnchor';
import { canLaunchRaidOnRival, canProvokeRival, getOutgoingRaidFoodCostForRival } from '../game/frontierCombat';
import { getRaidParticipants } from '../game/frontierCombat';

interface Props {
  state: WorldState;
  onFocusRival: (id: string, x: number, y: number, buildingId?: number) => void;
  onLaunchRaid?: (id: string) => void;
  onDeclareWar?: (id: string) => void;
}

function StrategicWorldMap({ state, onFocusRival, onLaunchRaid, onDeclareWar }: Props) {
  const origin = getPlayerCampCenter(state, state.buildings);
  const settlements = state.rivalSettlements;
  const points = [origin, ...settlements.map((rival) => ({ x: rival.campX, y: rival.campY }))];
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const spanX = Math.max(200, maxX - minX);
  const spanY = Math.max(200, maxY - minY);
  const scale = Math.min(620 / spanX, 285 / spanY);
  const offsetX = 360 - (minX + maxX) * scale / 2;
  const offsetY = 187 - (minY + maxY) * scale / 2;
  const locate = (x: number, y: number) => ({ x: x * scale + offsetX, y: y * scale + offsetY });
  const home = locate(origin.x, origin.y);
  const soldiers = getRaidParticipants(state, state.entities, 'barricade').length;
  const raids = [
    ...(state.pendingOutgoingRaidEvents ?? []).map((event) => ({ event, outgoing: true })),
    ...(state.pendingRaidEvents ?? []).map((event) => ({ event, outgoing: false })),
  ];

  return (
    <section className="rounded-xl border border-amber-600/40 bg-stone-950/80 p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-bold text-amber-200">Valley world map</h3>
        <span className="text-[11px] text-stone-300">{settlements.length} rival settlements · {soldiers} available soldiers · {raids.length} active marches</span>
      </div>
      <svg viewBox="0 0 720 375" role="img" aria-label="Strategic map showing your village, rival settlements and marching war-bands" className="w-full rounded-lg border border-stone-700 bg-[#17251f]">
        <defs>
          <pattern id="valleyWorldMapGrid" width="36" height="36" patternUnits="userSpaceOnUse">
            <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#82947b" strokeOpacity="0.13" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="720" height="375" fill="url(#valleyWorldMapGrid)" />
        <path d="M 12 75 Q 190 25 280 75 T 690 48 M 4 315 Q 180 265 300 303 T 716 278" fill="none" stroke="#455d49" strokeWidth="18" strokeOpacity="0.3" />
        {settlements.map((rival) => {
          const target = locate(rival.campX, rival.campY);
          return (
            <g key={rival.id}>
              <line x1={home.x} y1={home.y} x2={target.x} y2={target.y} stroke="#a59c83" strokeOpacity="0.32" strokeDasharray="4 7" />
              <circle cx={target.x} cy={target.y} r="12" fill={rival.relationship === 'tense' ? '#8e3333' : '#756241'} stroke="#ead4a2" strokeWidth="1.5" />
              <text x={target.x} y={target.y + 4} fontSize="11" textAnchor="middle" fill="white">◆</text>
              <text x={target.x} y={target.y + 25} fontSize="11" textAnchor="middle" fill="#f9deb2" stroke="#16201a" strokeWidth="3" paintOrder="stroke">{rival.name}</text>
              <text x={target.x} y={target.y + 38} fontSize="9" textAnchor="middle" fill="#e6dbbf">{rival.atWarWithPlayer ? 'AT WAR' : rival.relationship} · {rival.population} people</text>
            </g>
          );
        })}
        <circle cx={home.x} cy={home.y} r="17" fill="#285d40" stroke="#baf0bf" strokeWidth="2" />
        <text x={home.x} y={home.y + 5} fontSize="16" textAnchor="middle" fill="#ecffde">⌂</text>
        <text x={home.x} y={home.y - 28} fontSize="12" fontWeight="bold" textAnchor="middle" fill="#cbf7cf" stroke="#17251f" strokeWidth="3" paintOrder="stroke">{state.villageName || 'Your village'}</text>
        {raids.map(({ event, outgoing }) => {
          const rival = settlements.find((candidate) => candidate.id === event.rivalId);
          if (!rival) return null;
          const endpoint = locate(rival.campX, rival.campY);
          const start = outgoing ? home : endpoint;
          const end = outgoing ? endpoint : home;
          const duration = Math.max(1, event.expiresAtTick - event.createdAtTick);
          const progress = Math.max(0, Math.min(1, (state.tick - event.createdAtTick) / duration));
          const x = start.x + (end.x - start.x) * progress;
          const y = start.y + (end.y - start.y) * progress;
          return (
            <g key={event.id}>
              <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={outgoing ? '#8de5af' : '#ef9c8d'} strokeWidth="2.5" strokeDasharray="7 5" />
              <circle cx={x} cy={y} r="9" fill={outgoing ? '#276d47' : '#993f38'} stroke="white" strokeWidth="1.5" />
              <text x={x} y={y + 4} fontSize="12" textAnchor="middle" fill="white">{outgoing ? '➤' : '⚔'}</text>
              <text x={x} y={y - 16} fontSize="10" textAnchor="middle" fill={outgoing ? '#c4f9ce' : '#ffc4ba'} stroke="#17251f" strokeWidth="3" paintOrder="stroke">{outgoing ? 'Your war-band' : 'Enemy raiders'} · {Math.round(progress * 100)}%</text>
            </g>
          );
        })}
        <text x="17" y="355" fontSize="10" fill="#cbd5c4">⌂ Your village     ◆ Rival settlement     ➤ Raiding force</text>
      </svg>
      <p className="mt-1 text-[10px] text-stone-400">Strategic positions are based on the live valley coordinates. March markers indicate elapsed raid time; battle choices remain in the raid banner.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {settlements.map((rival) => {
          const raid = canLaunchRaidOnRival(state, rival);
          const war = canProvokeRival(state, rival);
          return (
            <div key={rival.id} className="rounded-lg border border-stone-700 bg-stone-900/80 p-2">
              <button type="button" className="w-full text-left text-[12px] font-semibold text-amber-200 hover:underline" onClick={() => onFocusRival(rival.id, rival.campX, rival.campY, rival.buildingIds[0])}>
                {rival.name} · {rival.atWarWithPlayer ? 'AT WAR' : rival.relationship}
              </button>
              <p className="text-[10px] text-stone-400">{rival.population} residents · rival settlement</p>
              <div className="mt-2 flex gap-2">
                {onDeclareWar && <button type="button" disabled={!war.ok} title={war.ok ? 'Declare hostility and damage diplomatic relations' : war.blockReason} onClick={() => onDeclareWar(rival.id)} className="flex-1 rounded bg-red-950 px-2 py-1 text-[11px] text-rose-100 disabled:opacity-40">Declare war</button>}
                {onLaunchRaid && <button type="button" disabled={!raid.ok} title={raid.ok ? 'Send available soldiers on a raid' : raid.blockReason} onClick={() => onLaunchRaid(rival.id)} className="flex-1 rounded bg-amber-900 px-2 py-1 text-[11px] text-amber-100 disabled:opacity-40">Raid · {getOutgoingRaidFoodCostForRival(state, rival)} food</button>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default memo(StrategicWorldMap);
