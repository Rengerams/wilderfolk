import { memo } from 'react';
import type { OutgoingRaidEvent, WorldState } from '../game/gameTypes';
import { getPlayerCampCenter } from '../game/villageAnchor';
import { formatCampDistance, getCampDistancePixels, getCampDistanceTiles, getRaidParticipants } from '../game/frontierCombat';

interface Props {
  state: WorldState;
  selectedRivalId: string | null;
  onSelectRival: (id: string) => void;
}

const INK = '#40301d';
const INK_SOFT = '#7a6444';
const PARCHMENT = '#e9dab8';
const ENEMY_INK = '#8c2f28';
const SHEET_FONT = 'Georgia, "Times New Roman", serif';
const SCALE_BAR_UNITS = 120;

/** A sixteen-point engraved compass star, the same geometry a period chart rose uses. */
function compassStar(cx: number, cy: number, outer: number, inner: number): string {
  const points: string[] = [];
  for (let i = 0; i < 16; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 8) * i - Math.PI / 2;
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return `M ${points.join(' L ')} Z`;
}

/** The strategic sheet plots only the valley; every raid decision is made in the roster below. */
function StrategicWorldMap({ state, selectedRivalId, onSelectRival }: Props) {
  const origin = getPlayerCampCenter(state, state.buildings);
  const settlements = state.rivalSettlements;
  const points = [origin, ...settlements.map((rival) => ({ x: rival.campX, y: rival.campY }))];
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const spanX = Math.max(200, maxX - minX);
  const spanY = Math.max(200, maxY - minY);
  // The plot keeps a margin inside the neatline so camp names and their captions stay on the sheet.
  const scale = Math.min(600 / spanX, 250 / spanY);
  const offsetX = 360 - ((minX + maxX) * scale) / 2;
  const offsetY = 176 - ((minY + maxY) * scale) / 2;
  const locate = (x: number, y: number) => ({ x: x * scale + offsetX, y: y * scale + offsetY });
  const home = locate(origin.x, origin.y);
  const soldiers = getRaidParticipants(state, state.entities, 'outgoing').length;
  const scaleBarTiles = getCampDistanceTiles(SCALE_BAR_UNITS / scale);
  const raids = [
    ...(state.pendingOutgoingRaidEvents ?? []).map((event) => ({ event, outgoing: true })),
    ...(state.pendingRaidEvents ?? []).map((event) => ({ event, outgoing: false })),
  ];

  return (
    <section className="rounded-xl border border-amber-800/50 p-3" style={{ backgroundColor: '#ddcaa2', fontFamily: SHEET_FONT }}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 border-b border-[#8a7350]/70 pb-1.5">
        <h3 className="text-[13px] font-bold uppercase tracking-[0.22em] text-[#40301d]">Valley world map</h3>
        <span className="text-[11px] italic text-[#6b5537]">
          {settlements.length} rival settlement{settlements.length === 1 ? '' : 's'} · {soldiers} soldiers at the ready · {raids.length} march{raids.length === 1 ? '' : 'es'} afoot
        </span>
      </div>
      <svg
        viewBox="0 0 720 375"
        role="img"
        aria-label="Survey map of the valley showing your village, rival camps and marching war-bands"
        className="w-full rounded-sm"
        style={{ fontFamily: SHEET_FONT }}
      >
        <defs>
          <radialGradient id="valleySheetWash" cx="48%" cy="42%" r="78%">
            <stop offset="0%" stopColor="#f4ead2" />
            <stop offset="62%" stopColor={PARCHMENT} />
            <stop offset="100%" stopColor="#d2bd94" />
          </radialGradient>
          <pattern id="valleySheetGraticule" width="72" height="72" patternUnits="userSpaceOnUse">
            <path d="M 72 0 L 0 0 0 72" fill="none" stroke={INK_SOFT} strokeOpacity="0.16" strokeWidth="1" />
          </pattern>
          <pattern id="valleySheetHachure" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
            <line x1="0" y1="0" x2="0" y2="5" stroke={INK_SOFT} strokeOpacity="0.3" strokeWidth="0.8" />
          </pattern>
        </defs>

        <rect width="720" height="375" fill="url(#valleySheetWash)" />
        <rect width="720" height="375" fill="url(#valleySheetGraticule)" />

        {/* Foxing and a soft age stain, so the sheet reads as paper rather than a flat fill. */}
        <ellipse cx="128" cy="86" rx="54" ry="26" fill="#8a6f47" opacity="0.05" />
        <ellipse cx="612" cy="284" rx="70" ry="30" fill="#8a6f47" opacity="0.06" />
        <ellipse cx="352" cy="188" rx="150" ry="96" fill="#8a6f47" opacity="0.035" />

        {/* Surveyed relief: the northern ridge, hachured along its crest. */}
        <path d="M 22 92 C 132 56 214 126 326 96 S 514 54 700 90" fill="none" stroke={INK_SOFT} strokeOpacity="0.34" strokeWidth="1.6" />
        <path d="M 22 106 C 134 70 216 140 328 110 S 516 68 700 104" fill="none" stroke={INK_SOFT} strokeOpacity="0.22" strokeWidth="1" />
        <path d="M 22 92 C 132 56 214 126 326 96 S 514 54 700 90 L 700 104 C 516 68 328 110 216 140 C 134 70 22 106 22 106 Z" fill="url(#valleySheetHachure)" opacity="0.5" />
        <path d="M 14 306 C 122 266 210 322 322 292 S 542 248 706 294" fill="none" stroke={INK_SOFT} strokeOpacity="0.34" strokeWidth="1.6" />
        <path d="M 14 320 C 124 280 212 336 324 306 S 544 262 706 308" fill="none" stroke={INK_SOFT} strokeOpacity="0.22" strokeWidth="1" />

        {/* Neatline: the engraved double rule of a chart border. */}
        <rect x="6.5" y="6.5" width="707" height="362" fill="none" stroke={INK} strokeWidth="1.4" />
        <rect x="12" y="12" width="696" height="351" fill="none" stroke={INK} strokeOpacity="0.5" strokeWidth="0.7" />

        {settlements.map((rival) => {
          const target = locate(rival.campX, rival.campY);
          const selected = selectedRivalId === rival.id;
          const hostile = rival.atWarWithPlayer || rival.relationship === 'tense';
          return (
            <g key={rival.id}>
              <line x1={home.x} y1={home.y} x2={target.x} y2={target.y} stroke={INK} strokeOpacity="0.3" strokeDasharray="3 6" />
              {selected && <circle cx={target.x} cy={target.y} r="17" fill="none" stroke={ENEMY_INK} strokeWidth="1.2" strokeDasharray="4 3" />}
              <circle onClick={() => onSelectRival(rival.id)} style={{ cursor: 'pointer' }} cx={target.x} cy={target.y} r="11" fill="#f0e3c6" stroke={selected ? ENEMY_INK : INK} strokeWidth={selected ? 2 : 1.2} />
              {/* The surveyor's mark for a rival settlement: a camp tent. */}
              <path d={`M ${target.x - 5} ${target.y + 4} L ${target.x} ${target.y - 5} L ${target.x + 5} ${target.y + 4} Z`} fill={hostile ? ENEMY_INK : INK} pointerEvents="none" />
              <text onClick={() => onSelectRival(rival.id)} style={{ cursor: 'pointer' }} x={target.x} y={target.y + 26} fontSize="12" fontStyle="italic" textAnchor="middle" fill={INK} stroke="#f2e7cb" strokeWidth="3.5" paintOrder="stroke">{rival.name}</text>
              <text x={target.x} y={target.y + 38} fontSize="9" textAnchor="middle" fill={hostile ? ENEMY_INK : INK_SOFT} stroke="#f2e7cb" strokeWidth="3" paintOrder="stroke">
                {rival.atWarWithPlayer ? 'at war' : rival.relationship} · {rival.population} souls
              </text>
              <text x={target.x} y={target.y + 49} fontSize="9" fontStyle="italic" textAnchor="middle" fill={INK_SOFT} stroke="#f2e7cb" strokeWidth="3" paintOrder="stroke">
                {formatCampDistance(getCampDistancePixels(state, state.buildings, rival))} distant
              </text>
            </g>
          );
        })}

        <circle cx={home.x} cy={home.y} r="15" fill="#f0e3c6" stroke={INK} strokeWidth="1.6" />
        <circle cx={home.x} cy={home.y} r="11" fill="none" stroke={INK} strokeOpacity="0.45" strokeWidth="0.7" />
        <path d={`M ${home.x - 5} ${home.y + 4} L ${home.x - 5} ${home.y - 2} L ${home.x} ${home.y - 6} L ${home.x + 5} ${home.y - 2} L ${home.x + 5} ${home.y + 4} Z`} fill={INK} />
        <text x={home.x} y={home.y - 25} fontSize="12" fontStyle="italic" fontWeight="bold" textAnchor="middle" fill={INK} stroke="#f2e7cb" strokeWidth="3.5" paintOrder="stroke">{state.villageName || 'Your village'}</text>

        {raids.map(({ event, outgoing }) => {
          const rival = settlements.find((candidate) => candidate.id === event.rivalId);
          if (!rival) return null;
          const endpoint = locate(rival.campX, rival.campY);
          const army = outgoing ? event as OutgoingRaidEvent : null;
          const returning = army?.phase === 'returning';
          const engaging = army?.phase === 'engaging' || army?.phase === 'fighting';
          const returnFraction = Math.max(0, Math.min(1, army?.returnStartProgress ?? 1));
          const origin = returning
            ? { x: home.x + (endpoint.x - home.x) * returnFraction, y: home.y + (endpoint.y - home.y) * returnFraction }
            : outgoing ? home : endpoint;
          const destination = returning ? home : outgoing ? endpoint : home;
          const initial = returning ? (army?.returnStartedAtTick ?? event.createdAtTick) : event.createdAtTick;
          const finish = returning ? (army?.returnAtTick ?? event.expiresAtTick)
            : army?.arrivalAtTick ?? event.expiresAtTick;
          const duration = Math.max(1, finish - initial);
          const progress = engaging ? 1 : Math.max(0, Math.min(1, (state.tick - initial) / duration));
          const x = origin.x + (destination.x - origin.x) * progress;
          const y = origin.y + (destination.y - origin.y) * progress;
          const ink = outgoing ? INK : ENEMY_INK;
          return (
            <g key={event.id}>
              <line x1={origin.x} y1={origin.y} x2={destination.x} y2={destination.y} stroke={ink} strokeWidth="1.6" strokeOpacity="0.75" strokeDasharray="8 4" />
              <circle cx={x} cy={y} r="8" fill={outgoing ? '#f0e3c6' : ENEMY_INK} stroke={ink} strokeWidth="1.2" />
              <text x={x} y={y + 3.5} fontSize="9" textAnchor="middle" fill={outgoing ? INK : '#f4ead2'} pointerEvents="none">{outgoing ? '➤' : '⚔'}</text>
              <text x={x} y={y - 14} fontSize="9" fontStyle="italic" textAnchor="middle" fill={ink} stroke="#f2e7cb" strokeWidth="3" paintOrder="stroke">
                {returning ? 'returning' : engaging ? 'engaged' : outgoing ? 'war-band' : 'raiders'} · {Math.round(progress * 100)}%
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1.5 text-[10px] leading-relaxed text-[#6b5537]">
        Positions are surveyed from the live valley coordinates. March marks show elapsed time; every battle choice stays in the raid banner.
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3 border-t border-[#8a7350]/60 pt-2 text-[10px] text-[#6b5537]">
        <div className="flex items-end gap-3">
          <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0" aria-hidden="true">
            <circle cx="20" cy="20" r="16.5" fill="none" stroke={INK_SOFT} strokeWidth="0.8" />
            <path d={compassStar(20, 20, 17, 5)} fill={PARCHMENT} stroke={INK} strokeWidth="0.9" />
            <path d={compassStar(20, 20, 11, 3.4)} fill="none" stroke={INK_SOFT} strokeWidth="0.6" transform="rotate(22.5 20 20)" />
            <text x="20" y="7.5" textAnchor="middle" fontSize="5.5" fill={INK}>N</text>
          </svg>
          <div>
            <div className="uppercase tracking-[0.16em]">Scale</div>
            <svg viewBox="0 0 132 11" className="mt-0.5 h-2.5 w-[132px]" aria-hidden="true">
              <rect x="0.4" y="0.4" width="131.2" height="10.2" fill="none" stroke={INK} strokeWidth="0.8" />
              {[0, 1, 2, 3].map((segment) => (
                <rect key={segment} x={segment * 33 + 0.4} y="0.4" width="32.8" height="10.2" fill={segment % 2 === 0 ? INK : 'none'} stroke={INK} strokeWidth="0.6" />
              ))}
            </svg>
            <div className="mt-0.5 italic">{scaleBarTiles} tiles</div>
          </div>
        </div>
        <p className="italic">⌂ your village · ◆ rival camp · ➤ war-band · ⚔ raiders</p>
      </div>
    </section>
  );
}

export default memo(StrategicWorldMap);
