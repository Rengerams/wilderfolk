import { memo } from 'react';
import type { OutgoingRaidEvent, RivalSettlement, WorldState } from '../game/gameTypes';
import { getPlayerCampCenter } from '../game/villageAnchor';
import { formatCampDistance, getCampDistancePixels, getRaidParticipants } from '../game/frontierCombat';
import {
  projectStrategicCamp,
  STRATEGIC_MAP_HEIGHT,
  STRATEGIC_MAP_WIDTH,
  STRATEGIC_VILLAGE_POINT,
  type StrategicMapPoint,
} from '../game/strategicMapProjection';

interface Props {
  state: WorldState;
  selectedRivalId: string | null;
  onSelectRival: (id: string) => void;
}

const INK = '#392616';
const HOSTILE_INK = '#99362a';
const FRIENDLY_INK = '#355f42';
const NEUTRAL_INK = '#6d5031';
const PAPER = '#f6e9c7';
const MAP_FONT = 'Georgia, "Times New Roman", serif';

function rivalInk(rival: RivalSettlement): string {
  if (rival.atWarWithPlayer || rival.relationship === 'tense') return HOSTILE_INK;
  if (rival.relationship === 'friendly') return FRIENDLY_INK;
  return NEUTRAL_INK;
}

/** This is an illustrated strategic view; simulation positions remain authoritative. */
function StrategicWorldMap({ state, selectedRivalId, onSelectRival }: Props) {
  const village = getPlayerCampCenter(state, state.buildings);
  const settlements = state.rivalSettlements;
  const positions = new Map<string, StrategicMapPoint>(
    settlements.map((rival) => [
      rival.id,
      projectStrategicCamp(rival, village, { width: state.width, height: state.height }),
    ]),
  );
  const home = STRATEGIC_VILLAGE_POINT;
  const soldiers = getRaidParticipants(state, state.entities, 'outgoing').length;
  const raids = [
    ...(state.pendingOutgoingRaidEvents ?? []).map((event) => ({ event, outgoing: true })),
    ...(state.pendingRaidEvents ?? []).map((event) => ({ event, outgoing: false })),
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-amber-900/50 bg-[#d7bd8c] p-2 shadow-lg sm:p-3" style={{ fontFamily: MAP_FONT }}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#92744e] px-1 pb-2">
        <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-[#392616]">The New Frontier</h3>
        <p className="text-[11px] italic text-[#513a20]">
          {settlements.length} rival settlement{settlements.length === 1 ? '' : 's'} · {soldiers} soldiers · {raids.length} marching
        </p>
      </header>

      <svg
        viewBox={`0 0 ${STRATEGIC_MAP_WIDTH} ${STRATEGIC_MAP_HEIGHT}`}
        role="group"
        aria-label="Interactive New Frontier map showing your settlement, rivals and active marching war-bands"
        className="mt-2 block h-auto w-full rounded-sm"
        style={{ fontFamily: MAP_FONT, touchAction: 'manipulation' }}
      >
        <rect width={STRATEGIC_MAP_WIDTH} height={STRATEGIC_MAP_HEIGHT} fill="#e7d4a8" />
        <image
          href="/maps/new-frontier.webp"
          x="0"
          y="0"
          width={STRATEGIC_MAP_WIDTH}
          height={STRATEGIC_MAP_HEIGHT}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        />

        {settlements.map((rival) => {
          const target = positions.get(rival.id);
          if (!target) return null;
          return (
            <line
              key={`route-${rival.id}`}
              x1={home.x}
              y1={home.y}
              x2={target.x}
              y2={target.y}
              stroke={rivalInk(rival)}
              strokeWidth="2"
              strokeOpacity="0.35"
              strokeDasharray="5 11"
              pointerEvents="none"
            />
          );
        })}

        <g aria-label={state.villageName || 'Your village'}>
          <circle cx={home.x} cy={home.y} r="25" fill={PAPER} fillOpacity="0.88" stroke={INK} strokeWidth="3.5" />
          <path d={`M ${home.x - 12} ${home.y + 9} V ${home.y - 5} L ${home.x} ${home.y - 17} L ${home.x + 12} ${home.y - 5} V ${home.y + 9} Z`} fill={INK} />
          <rect x={home.x - 80} y={home.y + 28} width="160" height="30" rx="12" fill={PAPER} fillOpacity="0.93" stroke={INK} strokeWidth="1" />
          <text x={home.x} y={home.y + 48} fontSize="17" fontWeight="bold" textAnchor="middle" fill={INK} pointerEvents="none">
            {state.villageName || 'Your village'}
          </text>
        </g>

        {settlements.map((rival) => {
          const point = positions.get(rival.id);
          if (!point) return null;
          const selected = selectedRivalId === rival.id;
          const ink = rivalInk(rival);
          const distance = formatCampDistance(getCampDistancePixels(state, state.buildings, rival));
          const status = rival.atWarWithPlayer ? 'At war' : rival.relationship;
          return (
            <g
              key={rival.id}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`Select ${rival.name}, ${status}, ${rival.population} inhabitants, ${distance} away`}
              onClick={() => onSelectRival(rival.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectRival(rival.id);
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <title>{`${rival.name} · ${status} · ${rival.population} inhabitants · ${distance}`}</title>
              {selected && <circle cx={point.x} cy={point.y} r="34" fill="none" stroke={ink} strokeWidth="4" strokeDasharray="7 5" />}
              <circle cx={point.x} cy={point.y} r="37" fill="transparent" />
              <circle cx={point.x} cy={point.y} r="22" fill={PAPER} stroke={ink} strokeWidth="4" />
              <path d={`M ${point.x - 12} ${point.y + 9} L ${point.x} ${point.y - 13} L ${point.x + 12} ${point.y + 9} Z`} fill={ink} pointerEvents="none" />
              <rect x={point.x - 76} y={point.y + 26} width="152" height="52" rx="10" fill={PAPER} fillOpacity="0.96" stroke={ink} strokeWidth={selected ? 2.5 : 1.1} pointerEvents="none" />
              <text x={point.x} y={point.y + 47} fontSize="17" fontWeight="bold" textAnchor="middle" fill={INK} pointerEvents="none">{rival.name}</text>
              <text x={point.x} y={point.y + 65} fontSize="13" textAnchor="middle" fill={ink} pointerEvents="none">
                {status} · {rival.population} people
              </text>
            </g>
          );
        })}

        {raids.map(({ event, outgoing }) => {
          const endpoint = positions.get(event.rivalId);
          if (!endpoint) return null;
          const army = outgoing ? event as OutgoingRaidEvent : null;
          const returning = army?.phase === 'returning';
          const engaging = army?.phase === 'engaging' || army?.phase === 'fighting';
          const returnFraction = Math.max(0, Math.min(1, army?.returnStartProgress ?? 1));
          const start = returning
            ? { x: home.x + (endpoint.x - home.x) * returnFraction, y: home.y + (endpoint.y - home.y) * returnFraction }
            : outgoing ? home : endpoint;
          const destination = returning ? home : outgoing ? endpoint : home;
          const initial = returning ? (army?.returnStartedAtTick ?? event.createdAtTick) : event.createdAtTick;
          const finish = returning ? (army?.returnAtTick ?? event.expiresAtTick) : army?.arrivalAtTick ?? event.expiresAtTick;
          const duration = Math.max(1, finish - initial);
          const progress = engaging ? 1 : Math.max(0, Math.min(1, (state.tick - initial) / duration));
          const x = start.x + (destination.x - start.x) * progress;
          const y = start.y + (destination.y - start.y) * progress;
          const ink = outgoing ? INK : HOSTILE_INK;
          return (
            <g key={event.id} pointerEvents="none">
              <line x1={start.x} y1={start.y} x2={destination.x} y2={destination.y} stroke={ink} strokeWidth="4" strokeOpacity="0.8" strokeDasharray="10 7" />
              <circle cx={x} cy={y} r="19" fill={outgoing ? PAPER : HOSTILE_INK} stroke={INK} strokeWidth="2.5" />
              <text x={x} y={y + 6} fontSize="19" textAnchor="middle" fill={outgoing ? INK : PAPER}>{outgoing ? '➤' : '⚔'}</text>
              <rect x={x - 62} y={y - 44} width="124" height="20" rx="7" fill={PAPER} fillOpacity="0.96" />
              <text x={x} y={y - 29} fontSize="14" fontWeight="bold" textAnchor="middle" fill={ink}>
                {returning ? 'Returning' : engaging ? 'Engaged' : outgoing ? 'War-band' : 'Raiders'} · {Math.round(progress * 100)}%
              </text>
            </g>
          );
        })}
      </svg>

      <footer className="mt-2 flex flex-wrap justify-between gap-1 border-t border-[#92744e] px-1 pt-2 text-[11px] text-[#513a20]">
        <span>Colored tents: active settlements · dashed lines: marches and routes</span>
        <span className="italic">Illustrated landmarks; combat, travel and distances use live game data.</span>
      </footer>
    </section>
  );
}

export default memo(StrategicWorldMap);
